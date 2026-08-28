import { execFileSync, execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { getCurrentRepoVersion, getDefaultTargetDir, getInstalledVersion, isBinaryOnPath } from './installer';
import { getOpenChamberInstallCommand } from './openchamber';

const REPO_BASE = 'https://github.com/kenlin8827/opencode-prime';
const RELEASE_BASE = `${REPO_BASE}/releases/latest/download`;
// raw.githubusercontent serves tracked files (not release assets) — good for
// a lightweight version probe, and it tends to stay reachable even where
// github.com release downloads are slow or blocked.
const RAW_VERSION_URL =
  'https://raw.githubusercontent.com/kenlin8827/opencode-prime/main/install/VERSION';
// Companion tooling probes: OpenCode releases live on GitHub, the OpenChamber
// web CLI is the npm package @openchamber/web.
const OPENCODE_RELEASE_API = 'https://api.github.com/repos/sst/opencode/releases/latest';
const OPENCHAMBER_NPM_META = 'https://registry.npmjs.org/@openchamber%2Fweb';

/** A single component covered by the `ocp update` check/upgrade flow. */
interface ComponentCheck {
  key: 'ocp' | 'opencode' | 'openchamber';
  label: string;
  local: string | null;
  latest: string | null;
  status: string;
}

/**
 * `ocp update` — check the suite and its companion tools (opencode,
 * openchamber) for newer versions. Flag semantics follow the apt/brew
 * convention:
 *
 * - Interactive TTY: every available update is preselected ([Y/n] per item,
 *   Enter keeps it) and the selected upgrades are applied right away.
 * - `-y/--yes`: apply ALL pending updates without prompting (non-interactive
 *   safe — this is the scripted/unattended path).
 * - `--check-only`: probe versions and print the report, apply nothing.
 * - Non-interactive stdin without `-y`: check-only, to never mutate a
 *   machine an unattended run was not explicitly asked to change.
 */
export async function executeUpdate(repoDir: string, passthrough: string[]): Promise<number> {
  const checkOnly = passthrough.some((a) => ['--check-only', '--dry-run', '-n'].includes(a));
  const assumeYes = passthrough.some((a) => ['-y', '--yes', '-Yes'].includes(a));

  const repoVersion = getCurrentRepoVersion(repoDir);
  const targetDir = resolveTargetDir(passthrough);
  const installedVersion = getInstalledVersion(targetDir);

  let remoteVersion: string;
  try {
    const res = await fetch(RAW_VERSION_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    remoteVersion = (await res.text()).trim();
  } catch (err) {
    console.error(`✗ Version check failed: ${(err as Error).message ?? err}`);
    console.error('  Network trouble? Run `ocp upgrade` directly, or update via `git pull`.');
    return 1;
  }

  const baseline = installedVersion ?? repoVersion;
  const ocp: ComponentCheck = {
    key: 'ocp',
    label: 'opencode-prime',
    local: baseline,
    latest: remoteVersion,
    status: installedVersion
      ? `installed in ${targetDir}`
      : `not installed (repo copy at v${repoVersion})`,
  };
  const components = [ocp, await probeOpenCode(), await probeOpenChamber()];

  console.log('\nVersion check:');
  for (const c of components) {
    console.log(`  ${c.label.padEnd(15)} ${fmtVer(c.local).padEnd(11)} latest ${fmtVer(c.latest).padEnd(11)} ${c.status}`);
  }

  const pending = components.filter((c) => c.local && c.latest && isNewerVersion(c.latest, c.local));
  if (pending.length === 0) {
    console.log('\nEverything is up to date.');
    return 0;
  }

  console.log(`\n${pending.length} update(s) available — all selected by default.`);

  let selected: ComponentCheck[];
  if (checkOnly) {
    console.log('Check-only mode (--check-only) — nothing was applied.');
    return 0;
  } else if (assumeYes) {
    console.log('Non-interactive mode (-y) — applying all pending updates.');
    selected = pending;
  } else if (!process.stdin.isTTY) {
    console.log('Non-interactive terminal without -y — staying check-only.');
    console.log('Run `ocp update -y` to apply all pending updates,');
    console.log('or `ocp upgrade` to update the suite itself.');
    return 0;
  } else {
    console.log('Press Enter to keep an update selected, or type n to skip it.\n');
    selected = [];
    for (const c of pending) {
      if (await confirmDefaultYes(`  Upgrade ${c.label} ${fmtVer(c.local)} → ${fmtVer(c.latest)}?`)) {
        selected.push(c);
      }
    }
    if (selected.length === 0) {
      console.log('\nNothing selected — no changes made.');
      return 0;
    }
  }

  let failed = 0;
  for (const c of selected) {
    console.log(`\n=== Upgrading ${c.label} ${fmtVer(c.local)} → ${fmtVer(c.latest)} ===`);
    const code = await applyComponentUpgrade(c.key, repoDir);
    if (code === 0) {
      console.log(`✔ ${c.label} upgraded.`);
    } else {
      console.error(`✗ ${c.label} upgrade failed (exit ${code}).`);
      failed++;
    }
  }
  return failed === 0 ? 0 : 1;
}

function fmtVer(v: string | null): string {
  return v ? `v${v}` : '?';
}

/** Default-yes [Y/n] prompt: anything but n/no confirms. */
async function confirmDefaultYes(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => rl.question(`${question} [Y/n] `, resolve));
    return !/^(n|no)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function applyComponentUpgrade(key: ComponentCheck['key'], repoDir: string): Promise<number> {
  switch (key) {
    case 'ocp':
      return executeUpgrade(repoDir, []);
    case 'opencode':
      return upgradeOpenCode();
    case 'openchamber':
      return upgradeOpenChamber();
  }
}

/** Local opencode version via `opencode --version`, null when missing/unreadable. */
function localOpenCodeVersion(): string | null {
  if (!isBinaryOnPath('opencode')) return null;
  try {
    const res = spawnSync('opencode', ['--version'], { encoding: 'utf8', timeout: 15000, shell: process.platform === 'win32' });
    const m = /\d+\.\d+\.\d+[\w.-]*/.exec(res.stdout ?? '');
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

async function probeOpenCode(): Promise<ComponentCheck> {
  const base = { key: 'opencode' as const, label: 'opencode' };
  const local = localOpenCodeVersion();
  if (!local) {
    return { ...base, local: null, latest: null, status: 'not found on PATH (install: https://opencode.ai)' };
  }
  try {
    const res = await fetch(OPENCODE_RELEASE_API, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'opencode-prime-updater' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const latest = (((await res.json()) as { tag_name?: string }).tag_name ?? '').replace(/^v/, '');
    if (!latest) throw new Error('empty tag');
    return {
      ...base,
      local,
      latest,
      status: isNewerVersion(latest, local) ? 'update available' : 'up to date',
    };
  } catch {
    return { ...base, local, latest: null, status: 'latest-release check failed — skipped' };
  }
}

async function probeOpenChamber(): Promise<ComponentCheck> {
  const base = { key: 'openchamber' as const, label: 'openchamber' };
  if (!isBinaryOnPath('openchamber')) {
    return { ...base, local: null, latest: null, status: 'not found on PATH (optional — only needed for `ocp web`)' };
  }
  // Resolve the installed @openchamber/web version through the package
  // manager that owns the global install (the CLI itself has no reliable
  // --version output).
  const local = openChamberLocalVersion();
  if (!local) {
    return { ...base, local: null, latest: null, status: 'installed, but the local version could not be determined' };
  }
  try {
    const res = await fetch(OPENCHAMBER_NPM_META, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const latest = ((await res.json()) as { 'dist-tags'?: { latest?: string } })['dist-tags']?.latest ?? '';
    if (!latest) throw new Error('empty dist-tags.latest');
    return {
      ...base,
      local,
      latest,
      status: isNewerVersion(latest, local) ? 'update available' : 'up to date',
    };
  } catch {
    return { ...base, local, latest: null, status: 'npm registry check failed — skipped' };
  }
}

/** Update opencode through the package manager that owns the current install. */
function upgradeOpenCode(): number {
  const cmd = pickOpenCodeUpgradeCommand();
  if (!cmd) {
    console.error('No package manager available — update manually: https://opencode.ai/install');
    return 1;
  }
  console.log(`Running: ${cmd.bin} ${cmd.args.join(' ')}`);
  const res = spawnSync(cmd.bin, cmd.args, {
    stdio: 'inherit',
    timeout: 600000,
    shell: process.platform === 'win32',
  });
  return res.status ?? 1;
}

/** Prefer the manager whose global bin owns the current opencode binary. */
function pickOpenCodeUpgradeCommand(): { bin: string; args: string[] } | null {
  const ownedBy = (resolveBinPath('opencode') ?? '').toLowerCase();
  if (ownedBy.includes('bun') && isBinaryOnPath('bun')) return { bin: 'bun', args: ['add', '-g', 'opencode-ai'] };
  if (ownedBy.includes('pnpm') && isBinaryOnPath('pnpm')) return { bin: 'pnpm', args: ['add', '-g', 'opencode-ai'] };
  if (isBinaryOnPath('bun')) return { bin: 'bun', args: ['add', '-g', 'opencode-ai'] };
  if (isBinaryOnPath('pnpm')) return { bin: 'pnpm', args: ['add', '-g', 'opencode-ai'] };
  if (isBinaryOnPath('npm')) return { bin: 'npm', args: ['install', '-g', 'opencode-ai'] };
  return null;
}

/** Update OpenChamber through the first available package manager. */
function upgradeOpenChamber(): number {
  const cmd = getOpenChamberInstallCommand();
  if (!cmd) {
    console.error('No package manager available — install manually from https://openchamber.dev/download');
    return 1;
  }
  console.log(`Running: ${cmd.bin} ${cmd.args.join(' ')}`);
  const res = spawnSync(cmd.bin, cmd.args, {
    stdio: 'inherit',
    timeout: 600000,
    shell: process.platform === 'win32',
  });
  return res.status ?? 1;
}

/**
 * Installed @openchamber/web version. Strategy order:
 *   1. Ask each package manager for its global list (works when the manager
 *      that owns the install is on PATH).
 *   2. Resolve the `openchamber` shim itself and read the version from its
 *      content or a nearby package.json (covers managers not on PATH, since
 *      the shim is by definition on PATH).
 */
function openChamberLocalVersion(): string | null {
  const listCommands: Array<[string, string[]]> = [
    ['pnpm', ['list', '-g', '@openchamber/web', '--parseable']],
    ['bun', ['pm', 'ls', '-g']],
    ['npm', ['list', '-g', '@openchamber/web', '--depth=0']],
  ];
  for (const [bin, args] of listCommands) {
    if (!isBinaryOnPath(bin)) continue;
    const v = versionFromPackageManagerOutput(runQuiet(bin, args));
    if (v) return v;
  }

  const shimPath = resolveBinPath('openchamber');
  if (!shimPath) return null;
  try {
    const content = fs.readFileSync(shimPath, 'utf8');
    // Windows .cmd shims embed the resolved entry script path, which in a
    // pnpm global store carries the version: @openchamber+web@<ver>_<peer>.
    const v = versionFromPackageManagerOutput(content);
    if (v) return v;
    // Shims (cmd-shim on Windows, $basedir scripts on POSIX) reference the
    // entry script relative to their own directory — anchor it there and
    // walk to the owning package's package.json.
    const m = /([^\s"']+@openchamber[\\/]web[\\/][^\s"']+)/.exec(content);
    if (m) {
      const rawPath = m[1].replace(/%dp0%\\?/gi, '').replace(/^\$basedir[\\/]/, '');
      const abs = path.isAbsolute(rawPath) ? rawPath : path.join(path.dirname(shimPath), rawPath);
      const fromPkg = readPackageVersion(path.join(path.dirname(path.dirname(abs)), 'package.json'));
      if (fromPkg) return fromPkg;
    }
  } catch {
    /* unreadable shim — fall through */
  }
  // npm/bun global layout: <shim dir>/../lib/node_modules/@openchamber/web.
  for (const candidate of [
    path.join(path.dirname(shimPath), '..', 'node_modules', '@openchamber', 'web', 'package.json'),
    path.join(path.dirname(shimPath), '..', 'lib', 'node_modules', '@openchamber', 'web', 'package.json'),
  ]) {
    const v = readPackageVersion(candidate);
    if (v) return v;
  }
  return null;
}

/** Matches `@openchamber{+|/|\}web@<version>` (pnpm store and list formats). */
function versionFromPackageManagerOutput(out: string | null): string | null {
  if (!out) return null;
  const m = /@openchamber(?:\+|\/|\\)web@(\d[\w.-]*?)(?=[_\s\\/]|$)/m.exec(out);
  return m ? m[1] : null;
}

function runQuiet(bin: string, args: string[]): string | null {
  try {
    return execFileSync(bin, args, {
      encoding: 'utf8',
      timeout: 15000,
      shell: process.platform === 'win32',
    });
  } catch {
    return null;
  }
}

function readPackageVersion(pkgJsonPath: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as { name?: string; version?: string };
    return parsed.name === '@openchamber/web' && parsed.version ? parsed.version : null;
  } catch {
    return null;
  }
}

/** Absolute path of a command on PATH, or null. */
function resolveBinPath(cmd: string): string | null {
  try {
    const out = execSync(process.platform === 'win32' ? `where.exe ${cmd}` : `which ${cmd}`, {
      encoding: 'utf8',
      timeout: 2000,
    });
    return out.split(/\r?\n/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

/** Target dir from -t/--target in passthrough args, else the default target. */
function resolveTargetDir(passthrough: string[]): string {
  for (let i = 0; i < passthrough.length; i++) {
    if (['-t', '--target', '-Target'].includes(passthrough[i]) && passthrough[i + 1]) {
      return path.resolve(passthrough[i + 1]);
    }
  }
  return getDefaultTargetDir();
}

/** Semver-aware comparison: true when a > b (non-numeric segments sort last). */
function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map((s) => parseInt(s, 10));
  const pb = b.split('.').map((s) => parseInt(s, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isNaN(pa[i]) ? Number.MAX_SAFE_INTEGER : pa[i] ?? 0;
    const y = Number.isNaN(pb[i]) ? Number.MAX_SAFE_INTEGER : pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * `ocp upgrade` — fetch the latest release and reinstall, mirroring the
 * "10-Second Quick Install" flow from the README:
 *
 * - Git clone   → `git pull --ff-only`, then force-reapply the installer.
 * - Release pkg → download opencode-prime-latest.{tar.gz,zip} into a temp
 *   dir, overlay it onto the current repo directory, then force-reapply the
 *   installer from there. The repo directory stays the persistent home,
 *   so the global shims in ~/.local/bin keep pointing at a valid location.
 *
 * Set OCP_RELEASE_MIRROR to a ghproxy-style prefix (e.g. https://ghfast.top)
 * when the official GitHub download is blocked or slow; the mirror is tried
 * after the official URL fails. Same version with no force flag → no-op.
 */
export async function executeUpgrade(repoDir: string, passthrough: string[]): Promise<number> {
  const force = passthrough.some((a) => ['-f', '--force', '-Force'].includes(a));
  const isGit = fs.existsSync(path.join(repoDir, '.git'));

  if (isGit) {
    console.log(`Updating git clone at ${repoDir} (git pull --ff-only)...`);
    const pull = spawnSync('git', ['pull', '--ff-only'], { cwd: repoDir, stdio: 'inherit' });
    if (pull.status !== 0) {
      console.error('✗ git pull failed (local changes or diverged history).');
      console.error('  Commit or stash your changes, then re-run `ocp upgrade`.');
      return pull.status ?? 1;
    }
  } else {
    const repoVersionBeforeDownload = getCurrentRepoVersion(repoDir);
    // Cheap probe first: skip the archive download entirely when the local
    // repo copy is already at or ahead of the latest released version.
    const probed = await probeRemoteVersion();
    if (probed && !isNewerVersion(probed, repoVersionBeforeDownload)) {
      console.log(`Repository copy is already at v${repoVersionBeforeDownload} (latest release: v${probed}) — no download needed.`);
    } else {
      const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ocp-upgrade-'));
      try {
        const archive = await downloadArchive(`${RELEASE_BASE}/opencode-prime-latest.${ext}`, tmpRoot, ext);
        if (!archive) return 1;

        // bsdtar (macOS / Windows 10+) and GNU tar both extract tar.gz and zip.
        const tar = spawnSync('tar', ['-xf', archive, '-C', tmpRoot], { stdio: 'inherit' });
        if (tar.status !== 0) {
          console.error('✗ Failed to extract the release archive.');
          return tar.status ?? 1;
        }

        const extracted = fs
          .readdirSync(tmpRoot)
          .map((e) => path.join(tmpRoot, e))
          .find((p) => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'install', 'VERSION')));
        if (!extracted) {
          console.error('✗ The release archive has an unexpected layout.');
          return 1;
        }

        const remoteVersion = fs.readFileSync(path.join(extracted, 'install', 'VERSION'), 'utf8').trim();
        const repoVersion = getCurrentRepoVersion(repoDir);
        if (isNewerVersion(remoteVersion, repoVersion)) {
          console.log(`Overlaying v${remoteVersion} onto ${repoDir}...`);
          // Overlay the new package onto the persistent repo directory. Removed
          // files inside the repo dir are harmless — the manifest-driven install
          // only copies the files it lists.
          fs.cpSync(extracted, repoDir, { recursive: true, force: true });
        } else {
          console.log(`Repository copy is already at v${repoVersion} (latest release: v${remoteVersion}) — skipping overlay.`);
        }
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    }
  }

  // Decide against the installed version in the target directory (the repo
  // copy can be ahead of what is actually applied to ~/.config/opencode).
  const repoVersion = getCurrentRepoVersion(repoDir);
  const targetDir = resolveTargetDir(passthrough);
  const installedVersion = getInstalledVersion(targetDir);
  if (!force && installedVersion !== null && !isNewerVersion(repoVersion, installedVersion)) {
    console.log(`Already up to date (installed: v${installedVersion}, repository: v${repoVersion}). Add --force to re-apply anyway.`);
    return 0;
  }

  // Re-run the installer from the updated copy through the bootstrap script
  // (same entry as the one-liner quick install): it picks the right runtime
  // and loads the freshly overlaid engine, which may have replaced the code
  // currently running this upgrade.
  const rest = force ? passthrough : ['--force', ...passthrough];
  // Make the reason explicit when git reported no new commits: the repo copy
  // can still be ahead of what was last applied to the target directory.
  console.log(
    `Applying v${repoVersion} to ${targetDir} (installed: ${installedVersion ? `v${installedVersion}` : 'none'})...`,
  );
  const script =
    process.platform === 'win32'
      ? path.join(repoDir, 'install', 'install.ps1')
      : path.join(repoDir, 'install', 'install.sh');
  const res =
    process.platform === 'win32'
      ? spawnSync('pwsh', ['-NoProfile', '-File', script, 'install', ...rest], {
          stdio: 'inherit',
          cwd: repoDir,
        })
      : spawnSync('bash', [script, 'install', ...rest], {
          stdio: 'inherit',
          cwd: repoDir,
        });
  if (res.status === 0) {
    console.log('✔ OpenCode Prime upgraded successfully.');
  }
  return res.status ?? 1;
}

/** Lightweight remote version probe (raw.githubusercontent); null on failure. */
async function probeRemoteVersion(): Promise<string | null> {
  try {
    const res = await fetch(RAW_VERSION_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return (await res.text()).trim() || null;
  } catch {
    return null;
  }
}

/** Official URL first, then the optional ghproxy-style OCP_RELEASE_MIRROR. */
async function downloadArchive(url: string, destDir: string, ext: string): Promise<string | null> {
  const mirror = process.env.OCP_RELEASE_MIRROR?.replace(/\/+$/, '');
  const attempts = mirror ? [url, `${mirror}/${url}`] : [url];

  for (const attempt of attempts) {
    console.log(`Downloading the latest release: ${attempt}`);
    try {
      const res = await fetch(attempt, { signal: AbortSignal.timeout(300000) });
      if (!res.ok) {
        console.error(`  ✗ HTTP ${res.status} ${res.statusText}`);
        continue;
      }
      const dest = path.join(destDir, `opencode-prime-latest.${ext}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return dest;
    } catch (err) {
      console.error(`  ✗ ${(err as Error).message ?? err}`);
    }
  }
  console.error('✗ Download failed from every source.');
  if (!mirror) {
    console.error('  Behind a firewall? Set a ghproxy-style mirror and retry, e.g.:');
    console.error('    OCP_RELEASE_MIRROR=https://ghfast.top ocp upgrade');
  }
  return null;
}
