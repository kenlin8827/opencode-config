import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import {
  getCurrentRepoVersion,
  getDefaultTargetDir,
  getInstalledVersion,
  isBinaryOnPath,
  loadToolRegistry,
  resolveInstallCommand,
} from './installer';

const REPO_BASE = 'https://github.com/kenlin8827/opencode-prime';
const RELEASE_BASE = `${REPO_BASE}/releases/latest/download`;
// raw.githubusercontent serves tracked files (not release assets) — good for
// a lightweight version probe, and it tends to stay reachable even where
// github.com release downloads are slow or blocked.
const RAW_VERSION_URL =
  'https://raw.githubusercontent.com/kenlin8827/opencode-prime/main/install/VERSION';

/** A single component covered by the `ocp update` check/upgrade flow. */
interface ComponentCheck {
  key: string;
  label: string;
  local: string | null;
  latest: string | null;
  status: string;
}

/** `update_check.source` shape from install/tools.jsonc. */
interface UpdateCheckSource {
  kind: 'github' | 'npm' | 'cargo' | 'url';
  repo?: string;       // for github
  package?: string;    // for npm
  crate?: string;      // for cargo
  url?: string;        // for url
  regex?: string;      // for url extraction
}

interface ToolEntryUpdate {
  source?: UpdateCheckSource;
  /**
   * How to upgrade the tool:
   *   - "smart" (default for npm-managed tools): detect the package manager
   *     owning the installed binary, re-run its global install for
   *     `upgrade_package`. Falls back to the static `upgrade` command if no
   *     package manager is on PATH.
   *   - "static": just run the platform-resolved `upgrade` command.
   */
  upgrade_strategy?: 'smart' | 'static';
  /** Required when upgrade_strategy === "smart": the npm/yarn/etc package to install. */
  upgrade_package?: string;
  /** Optional fallback for both strategies when no pm is detected / no per-platform override. */
  upgrade?: unknown; // string | Record<string, string>; resolved via resolveInstallCommand
}

interface ToolEntry {
  description?: string;
  binary: string;
  url?: string;
  install?: unknown;
  post_install?: unknown;
  update_check?: ToolEntryUpdate;
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
  // Drive the tool-update list from install/tools.jsonc. Each entry with
  // an `update_check` block becomes a probe; entries without one (legacy
  // entries or ones we haven't wired up yet) are silently skipped.
  const toolProbes = await probeToolsFromRegistry(repoDir);
  const components = [ocp, ...toolProbes];

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
    default:
      // Everything else comes from install/tools.jsonc via probeToolsFromRegistry.
      // The dispatch (smart vs static) lives inside upgradeToolFromRegistry.
      return upgradeToolFromRegistry(repoDir, key);
  }
}

/**
 * Upgrade a tool declared in install/tools.jsonc. Two strategies are
 * supported via `update_check.upgrade_strategy`:
 *   - `"smart"` (default for npm-managed tools): detect which package
 *     manager owns the installed binary and re-run that manager's install
 *     for the package declared in `upgrade_package`. Falls back to the
 *     static `upgrade` command if no package manager is on PATH.
 *   - `"static"`: just run the platform-resolved `upgrade` command. Used
 *     for tools installed by a script (e.g. herdr's official installer)
 *     rather than a package manager.
 *
 * No `upgrade` command at all = 1 (refuses to do anything).
 */
function upgradeToolFromRegistry(repoDir: string, toolName: string): number {
  const registry = loadToolRegistry(repoDir);
  const def = registry?.tools?.[toolName] as ToolEntry | undefined;
  if (!def) {
    console.error(`"${toolName}" is not declared in install/tools.jsonc.`);
    return 1;
  }
  const strategy = def.update_check?.upgrade_strategy ?? 'static';

  if (strategy === 'smart') {
    return smartUpgrade(toolName, def);
  }

  // static path: resolve and run the upgrade command
  const cmd = resolveInstallCommand(def?.update_check?.upgrade);
  if (!cmd) {
    console.error(`No upgrade command declared for "${toolName}" on ${process.platform}-${process.arch} (and no smart upgrade configured).`);
    return 1;
  }
  console.log(`Running: ${cmd}`);
  return runInstallCommand(cmd).status ?? 1;
}

/**
 * Run an install/upgrade command string from install/tools.jsonc.
 *
 * On Windows the registry stores PowerShell-syntax commands (irm/iwr/iex);
 * `spawnSync(cmd, { shell: true })` routes through cmd.exe, which doesn't
 * recognize those aliases. Spawn PowerShell directly — prefer `pwsh` (the
 * project's default, see executeUpgrade below) but fall back to the
 * built-in Windows PowerShell 5.1 so this works on machines without
 * PowerShell 7. Both shells expose irm/iwr/iex and `-useb`, so either
 * fits the registry's commands.
 *
 * On POSIX the commands are POSIX-shell pipelines (`curl | sh`), so let
 * Node pick a shell.
 */
function runInstallCommand(cmd: string) {
  if (process.platform !== 'win32') {
    return spawnSync(cmd, { stdio: 'inherit', timeout: 600000, shell: true });
  }
  const ps = isBinaryOnPath('pwsh') ? 'pwsh' : 'powershell';
  return spawnSync(ps, ['-NoProfile', '-Command', cmd], {
    stdio: 'inherit',
    timeout: 600000,
  });
}

/**
 * "Smart" upgrade: pick the package manager whose global bin owns the
 * current binary of `def.binary`, then re-install the package declared in
 * `update_check.upgrade_package` through that manager. Falls back to the
 * static `upgrade` command if no package manager is on PATH.
 *
 * The lookup order is:
 *   1. The path of the binary contains "bun" / "pnpm" / "yarn" → use that.
 *   2. Otherwise, the first of bun / pnpm / yarn / npm that is on PATH.
 *   3. Otherwise, run the static fallback (or fail).
 */
function smartUpgrade(toolName: string, def: ToolEntry): number {
  const pkg = def.update_check?.upgrade_package;
  if (!pkg) {
    console.error(`upgrade_strategy:"smart" requires "upgrade_package" in update_check for "${toolName}".`);
    return 1;
  }

  const ownedBy = (resolveBinPath(def.binary) ?? '').toLowerCase();
  let cmd: { bin: string; args: string[] } | null = null;
  if (ownedBy.includes('bun') && isBinaryOnPath('bun')) cmd = { bin: 'bun', args: ['add', '-g', pkg] };
  else if (ownedBy.includes('pnpm') && isBinaryOnPath('pnpm')) cmd = { bin: 'pnpm', args: ['add', '-g', pkg] };
  else if (ownedBy.includes('yarn') && isBinaryOnPath('yarn')) cmd = { bin: 'yarn', args: ['global', 'add', pkg] };
  else if (isBinaryOnPath('bun')) cmd = { bin: 'bun', args: ['add', '-g', pkg] };
  else if (isBinaryOnPath('pnpm')) cmd = { bin: 'pnpm', args: ['add', '-g', pkg] };
  else if (isBinaryOnPath('yarn')) cmd = { bin: 'yarn', args: ['global', 'add', pkg] };
  else if (isBinaryOnPath('npm')) cmd = { bin: 'npm', args: ['install', '-g', pkg] };

  if (!cmd) {
    const fallback = resolveInstallCommand(def?.update_check?.upgrade);
    if (fallback) {
      console.log(`No package manager detected — falling back to: ${fallback}`);
      return runInstallCommand(fallback).status ?? 1;
    }
    console.error(`No package manager detected for "${toolName}" and no static fallback upgrade configured.`);
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
 * `ocp update` tool registry — drives the per-tool update check from
 * install/tools.jsonc. Every entry that declares an `update_check` block
 * becomes a probe; entries without one are silently skipped (they were
 * created for the install flow only, with no upstream version to track).
 *
 * Each `source.kind`:
 *   - github: api.github.com/repos/<repo>/releases/latest → tag_name
 *   - npm:    registry.npmjs.org/<package> → dist-tags.latest
 *   - cargo:  crates.io/api/v1/crates/<crate> → crate.max_stable_version
 *   - url:    arbitrary endpoint, regex extracts semver from body
 */
async function probeToolsFromRegistry(repoDir: string): Promise<ComponentCheck[]> {
  const registry = loadToolRegistry(repoDir);
  if (!registry?.tools) return [];
  const out: ComponentCheck[] = [];
  for (const [name, rawDef] of Object.entries(registry.tools)) {
    const def = rawDef as ToolEntry;
    if (!def.update_check?.source) continue;
    out.push(await probeToolFromRegistry(name, def));
  }
  return out;
}

async function probeToolFromRegistry(name: string, def: ToolEntry): Promise<ComponentCheck> {
  const base = { key: name, label: name };
  const local = localBinaryVersion(def.binary);

  if (!local) {
    // Still probe latest so the row shows what the user is missing instead of
    // two `?` columns. Network blip falls through to the original message.
    let latest: string | null = null;
    if (def.update_check?.source) {
      try {
        latest = await fetchLatestFromSource(def.update_check.source);
      } catch {
        // swallow — original "not found on PATH" status still applies
      }
    }
    return {
      ...base,
      local: null,
      latest,
      status: latest
        ? `not installed — latest is v${latest}; run \`ocp install\` or set tools.${name} = false`
        : `not found on PATH (install via \`ocp install\` or set tools.${name})`,
    };
  }
  if (!def.update_check?.source) {
    return { ...base, local, latest: null, status: 'no update_check source — skipped' };
  }

  try {
    const latest = await fetchLatestFromSource(def.update_check.source);
    if (!latest) {
      return { ...base, local, latest: null, status: 'latest-version probe failed — skipped' };
    }
    return {
      ...base,
      local,
      latest,
      status: isNewerVersion(latest, local) ? 'update available' : 'up to date',
    };
  } catch (err) {
    return {
      ...base,
      local,
      latest: null,
      status: `latest-version probe failed: ${(err as Error).message ?? err}`,
    };
  }
}

/** Run `<binary> --version` and extract the first semver-looking token. */
function localBinaryVersion(binary: string): string | null {
  if (!isBinaryOnPath(binary)) return null;
  try {
    const res = spawnSync(binary, ['--version'], {
      encoding: 'utf8',
      timeout: 15000,
      shell: process.platform === 'win32',
    });
    const m = /\d+\.\d+\.\d+[\w.-]*/.exec(res.stdout ?? '');
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

/** Resolve a source-kind URL + extract the version. */
async function fetchLatestFromSource(src: UpdateCheckSource): Promise<string | null> {
  switch (src.kind) {
    case 'github': {
      if (!src.repo) return null;
      const res = await fetch(`https://api.github.com/repos/${src.repo}/releases/latest`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'opencode-prime-updater' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tag = (((await res.json()) as { tag_name?: string }).tag_name ?? '').replace(/^v/, '');
      return tag || null;
    }
    case 'npm': {
      if (!src.package) return null;
      const url = `https://registry.npmjs.org/${encodeURIComponent(src.package)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const latest = ((await res.json()) as { 'dist-tags'?: { latest?: string } })['dist-tags']?.latest ?? '';
      return latest || null;
    }
    case 'cargo': {
      if (!src.crate) return null;
      const res = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(src.crate)}`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'opencode-prime-updater' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { crate?: { max_stable_version?: string } };
      return j.crate?.max_stable_version ?? null;
    }
    case 'url': {
      if (!src.url) return null;
      const res = await fetch(src.url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.text()).trim();
      if (src.regex) {
        const m = new RegExp(src.regex).exec(body);
        return m ? (m[1] ?? m[0]) : null;
      }
      const fallback = /\d+\.\d+\.\d+[\w.-]*/.exec(body);
      return fallback ? fallback[0] : null;
    }
    default:
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
