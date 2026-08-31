import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { CliArgs, InstallOptions } from './types';
import { deployHerdrConfig } from './herdr-config';
import {
  collectHistoricalShippedFiles,
  collectShippedFiles,
  generateManifest,
  getManifestPath,
  isNewerVersion,
  readManifest,
  readVersionJson,
} from './manifest';
import {
  extractPreserveBag,
  mergeConfig,
  mergeTuiConfig,
  readJsoncFile,
  getUserOptionsPath,
  mergeUserOptions,
} from './merger';

/**
 * Maximum number of backup directories ("<targetDir>.bak.<timestamp>") kept
 * beside the target. Older ones are pruned after each backup is created.
 * Override with the OCP_MAX_BACKUPS environment variable (0 disables backups
 * retention pruning — use with care).
 */
const DEFAULT_MAX_BACKUPS = 5;

export function getMaxBackups(): number {
  const raw = process.env.OCP_MAX_BACKUPS;
  if (raw !== undefined && raw !== '') {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_MAX_BACKUPS;
}

export function getDefaultTargetDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) {
    return path.resolve(process.env.OPENCODE_CONFIG_DIR);
  }
  const home = os.homedir();
  return path.join(home, '.config', 'opencode');
}

export function getCurrentRepoVersion(repoDir: string): string {
  // install/version.json is the single source of truth. A legacy single-line
  // install/VERSION is tolerated as fallback for pre-migration repo layouts.
  const versionJson = path.join(repoDir, 'install', 'version.json');
  const info = readVersionJson(repoDir);
  if (info) return info.version;
  const versionFile = path.join(repoDir, 'install', 'VERSION');
  if (fs.existsSync(versionFile)) {
    const v = fs.readFileSync(versionFile, 'utf8').trim();
    if (v) return v;
  }
  throw new Error(`Missing version file: ${versionJson}`);
}

export function getInstalledVersion(targetDir: string): string | null {
  const versionFile = path.join(targetDir, 'installed.version');
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, 'utf8').trim();
  }
  return null;
}

export function backupTargetDir(targetDir: string): string | null {
  if (!fs.existsSync(targetDir)) return null;
  const entries = fs.readdirSync(targetDir);
  if (entries.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `${targetDir}.bak.${timestamp}`;

  try {
    fs.cpSync(targetDir, backupDir, {
      recursive: true,
      filter: (source) => {
        const base = path.basename(source);
        return base !== 'node_modules' && base !== '.git' && !base.startsWith('.bak');
      },
    });
    return backupDir;
  } catch (err) {
    return null;
  }
}

/**
 * Prune old backup directories ("<targetDir>.bak.<timestamp>" siblings of the
 * target), keeping only the newest `keep` ones. Timestamps in backup names are
 * ISO-like and sort lexicographically, so a plain name sort is enough.
 * Returns the number of pruned backups.
 */
export function pruneOldBackups(targetDir: string, keep: number = getMaxBackups()): number {
  const parent = path.dirname(targetDir);
  const prefix = `${path.basename(targetDir)}.bak.`;
  let entries: string[];
  try {
    entries = fs
      .readdirSync(parent)
      .filter((e) => e.startsWith(prefix) && fs.statSync(path.join(parent, e)).isDirectory());
  } catch {
    return 0;
  }

  // Newest first (lexicographic order matches chronological order here).
  entries.sort().reverse();
  let pruned = 0;
  for (const stale of entries.slice(keep)) {
    try {
      fs.rmSync(path.join(parent, stale), { recursive: true, force: true });
      pruned++;
    } catch {
      // Unremovable backup — leave it for the next run.
    }
  }
  return pruned;
}

export function copyRepoFiles(repoDir: string, targetDir: string, files: string[]): number {
  let count = 0;
  // Shipped preset files in `providers/` are seeded on first install only.
  // After that, the user owns `~/.config/opencode/providers/`: opencode loads
  // every JSON there as an available preset (see `/provider` → "Add preset"),
  // and the user can delete / edit / re-add presets as they see fit. We use
  // the presence of `installed.version` (written at the end of a successful
  // install) as the "first install already happened" signal — checking the
  // preset file itself is unreliable because the user may have just deleted
  // it and we must not undo that.
  const userOwnsProviders = fs.existsSync(path.join(targetDir, 'installed.version'));
  for (const relFile of files) {
    // The config template ships in the package but never lands in the target:
    // mergeConfig renders it (plus options + preserved fields) into the
    // target's opencode.jsonc. Copying it verbatim would leave a stray
    // opencode.template.jsonc beside the merged config.
    if (relFile === 'opencode.template.jsonc') continue;

    // Same pattern for the TUI template — mergeTuiConfig renders it
    // (plus preserved user plugins) into the target's tui.jsonc. We can't
    // verbatim-copy because users add their own TUI plugins; overwriting
    // would lose them on every reinstall.
    if (relFile === 'tui.template.jsonc') continue;

    if (
      userOwnsProviders &&
      relFile.startsWith('providers/') &&
      relFile.endsWith('.json')
    ) {
      continue;
    }

    const src = path.join(repoDir, relFile);
    const dest = path.join(targetDir, relFile);
    const destDir = path.dirname(dest);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      count++;
    }
  }
  return count;
}

export function isBinaryOnPath(cmdName: string): boolean {
  const checkCmd = process.platform === 'win32' ? `where.exe ${cmdName}` : `which ${cmdName}`;
  try {
    execSync(checkCmd, { stdio: 'ignore', timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

export function checkExternalTools(repoDir: string, options: InstallOptions): void {
  // Walk every tool declared in install/tools.jsonc that the user has not
  // opted out of. Provisioning itself happens in provisionTools() below;
  // this function only reports presence.
  const registry = loadToolRegistry(repoDir);
  if (registry?.tools) {
    for (const [name, def] of Object.entries(registry.tools)) {
      if (!toolEnabled(name, options)) continue;
      if (isBinaryOnPath(def.binary)) {
        console.log(`✓ [tool] ${name} (${def.binary}) is present on PATH`);
      } else {
        const hint = def.url ? ` — see ${def.url}` : '';
        console.log(`ℹ [tool] ${name} not found on PATH${hint}`);
      }
    }
  }

  // Check MCP tools
  if (options.mcp?.serena) {
    if (isBinaryOnPath('serena')) {
      console.log('✓ [mcp] serena is installed');
    } else {
      console.log('ℹ [mcp] serena tool not found on PATH');
    }
  }

  if (options.mcp?.dbhub) {
    if (isBinaryOnPath('dbhub')) {
      console.log('✓ [mcp] dbhub is installed');
    } else {
      console.log('ℹ [mcp] dbhub tool not found on PATH');
    }
  }
}

/**
 * Effective install options: repo install/options.jsonc (defaults) < user
 * overrides (target options.jsonc) < explicit customOptions (CLI / wizard /
 * dashboard).
 */
export function loadEffectiveOptions(
  repoDir: string,
  targetDir: string,
  customOptions?: InstallOptions
): InstallOptions {
  const optionsPath = path.join(repoDir, 'install', 'options.jsonc');
  const fileOptions = readJsoncFile<InstallOptions>(optionsPath) || {};
  const userOptions = readJsoncFile<InstallOptions>(getUserOptionsPath(targetDir));
  const merged = mergeUserOptions(fileOptions, userOptions);
  return mergeUserOptions(merged, customOptions);
}

/**
 * Decide which enabled MCP servers need CLI provisioning: enabled in options,
 * declares an `install` field in the template, and its binary (the MCP key
 * name) is missing from PATH. Pure decision — no side effects.
 */
export function mcpProvisionPlan(
  repoDir: string,
  options: InstallOptions
): Array<{ name: string; install: string }> {
  const template = readJsoncFile<Record<string, any>>(path.join(repoDir, 'opencode.template.jsonc'));
  const mcp = template?.mcp;
  if (!mcp || typeof mcp !== 'object' || !options.mcp) return [];

  const plan: Array<{ name: string; install: string }> = [];
  for (const [name, enabled] of Object.entries(options.mcp)) {
    if (!enabled) continue;
    const block = mcp[name];
    if (!block || typeof block !== 'object') continue;
    const install = block.install;
    if (typeof install !== 'string' || !install.trim()) continue;
    if (isBinaryOnPath(name)) continue;
    plan.push({ name, install });
  }
  return plan;
}

/**
 * Run an install command string from install/tools.jsonc or an MCP `install`
 * field. Shares the PowerShell-vs-POSIX split with `ocp update`:
 *
 * On Windows the registry stores PowerShell-syntax commands (`iwr`/`irm`/`iex`);
 * `spawnSync(cmd, { shell: true })` routes through cmd.exe, which doesn't
 * recognize those aliases ("'iwr' is not recognized"). Spawn PowerShell
 * directly — prefer `pwsh` but fall back to the built-in Windows PowerShell
 * 5.1 so this works on machines without PowerShell 7. Both expose iwr/irm/iex.
 *
 * On POSIX the commands are `curl | sh` pipelines, so let Node pick a shell.
 */
export function runInstallCommand(cmd: string) {
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
 * Provision CLIs for enabled MCP servers that declare an `install` field and
 * are missing from PATH. Never throws — failures are logged with manual
 * instructions so a missing CLI can't fail the config install.
 */
export function provisionMcpCli(repoDir: string, options: InstallOptions): void {
  for (const { name, install } of mcpProvisionPlan(repoDir, options)) {
    console.log(`🚀 [mcp] ${name} missing from PATH — provisioning via: ${install}`);
    const res = runInstallCommand(install);
    if (res.status !== 0 || res.error) {
      const detail = res.error ? res.error.message : `exit code ${res.status}`;
      console.log(`⚠ [mcp] ${name} automatic installation failed (${detail}). Install manually: ${install}`);
    } else if (isBinaryOnPath(name)) {
      console.log(`✓ [mcp] ${name} installed`);
    } else {
      console.log(`✓ [mcp] ${name} install command finished — open a new terminal if the binary is not on PATH yet`);
    }
  }
}

/**
 * Resolve the install command for a tool on the current machine.
 *
 * Keys are tried in this order:
 *   1. `${platform}-${arch}`   (e.g. "linux-x64", "darwin-arm64", "win32-x64")
 *   2. `${platform}`           (e.g. "linux", "darwin", "win32")
 *   3. `default`               (fallback)
 *
 * Returns null if no key matches — caller should skip with a friendly hint.
 */
export function resolveInstallCommand(install: unknown): string | null {
  if (typeof install === 'string') return install.trim() || null;
  if (!install || typeof install !== 'object') return null;
  const map = install as Record<string, unknown>;
  const platform = process.platform;          // 'linux' | 'darwin' | 'win32' | …
  const arch = process.arch;                  // 'x64' | 'arm64' | …
  const candidates = [
    `${platform}-${arch}`,
    platform,
    'default',
  ];
  for (const key of candidates) {
    const v = map[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Generic tool registry shape (install/tools.jsonc).
 *
 * Designed to be reusable: the `install` field uses the same string-or-map
 * shape as MCP `install` fields can adopt later without data migration —
 * they share `resolveInstallCommand` and the same platform/arch resolution
 * order.
 *
 * `post_install` is an array of init commands that run AFTER the binary
 * is verified on PATH (whether it was just installed or already present).
 * Each step is either:
 *   - a string — a bare shell command (no guard)
 *   - an object with `name?` (for logging), `when?` (binary name required
 *     on PATH; step is skipped if missing), and `command` (shell)
 *
 * Multiple post-install steps per tool are supported so a single install
 * can trigger several independent setup operations.
 */
export interface PostInstallStep {
  name?: string;
  /** Tool/binary name required on PATH for this step to run. */
  when?: string;
  /** Shell command. */
  command: string;
}

export interface ToolRegistry {
  tools?: Record<
    string,
    {
      description?: string;
      binary: string;
      url?: string;
      install?: unknown; // string | Record<string, string>; resolved via resolveInstallCommand
      post_install?: Array<string | PostInstallStep>;
    }
  >;
}

/** Load the tool registry from install/tools.jsonc. Returns null on miss. */
export function loadToolRegistry(repoDir: string): ToolRegistry | null {
  return readJsoncFile<ToolRegistry>(path.join(repoDir, 'install', 'tools.jsonc'));
}

/**
 * True when `options.tools[name]` is not explicitly set to false.
 * All tools (rtk, openchamber, herdr, ...) read from the same `tools: {}`
 * map — no top-level flags anymore.
 */
function toolEnabled(name: string, options: InstallOptions): boolean {
  const v = options.tools?.[name];
  return v !== false;
}

/**
 * Provision optional tools declared in install/tools.jsonc.
 *
 * Two phases:
 *   1. **Install**: For each enabled tool whose binary is missing from PATH,
 *      run the resolved install command. Best-effort: failures are logged,
 *      never thrown, so a network-blasted install can't fail the config
 *      install. When the tool's install command has no entry for the
 *      current platform/arch, log a hint pointing at the tool's homepage.
 *   2. **Post-install**: After the install pass, run each tool's
 *      `post_install` steps whose `when` guard is satisfied (i.e. the
 *      referenced binary is now on PATH). This second phase handles
 *      cross-tool dependencies — e.g. `herdr.post_install` referencing
 *      `opencode` will only run after `opencode` itself has been installed
 *      or was already present.
 */
export function provisionTools(repoDir: string, options: InstallOptions): void {
  const registry = loadToolRegistry(repoDir);
  if (!registry?.tools) return;

  // Phase 1: install missing binaries.
  for (const [name, def] of Object.entries(registry.tools)) {
    if (!toolEnabled(name, options)) continue;
    if (isBinaryOnPath(def.binary)) {
      console.log(`✓ [tool] ${name} (${def.binary}) is present on PATH`);
      continue;
    }
    const cmd = resolveInstallCommand(def.install);
    if (!cmd) {
      const hint = def.url ? ` (${def.url})` : '';
      console.log(`ℹ [tool] ${name} not installed — no install command for ${process.platform}-${process.arch}${hint}`);
      continue;
    }
    console.log(`🚀 [tool] ${name} missing from PATH — provisioning via: ${cmd}`);
    const res = runInstallCommand(cmd);
    if (res.error || res.status !== 0) {
      const detail = res.error ? res.error.message : `exit code ${res.status}`;
      const hint = def.url ? ` Manual install: ${def.url}` : '';
      console.log(`⚠ [tool] ${name} automatic installation failed (${detail}).${hint}`);
    } else if (isBinaryOnPath(def.binary)) {
      console.log(`✓ [tool] ${name} installed`);
    } else {
      console.log(`✓ [tool] ${name} install command finished — open a new terminal if the binary is not on PATH yet`);
    }
  }

  // Phase 2: post-install steps (cross-tool order respected by phase-1
  // completion — by now every tool's binary is on PATH or its install
  // failed; we run steps whose `when` guards match reality).
  for (const [name, def] of Object.entries(registry.tools)) {
    if (!toolEnabled(name, options)) continue;
    if (!def.post_install?.length) continue;
    runPostInstall(repoDir, name, def);
  }
}

/**
 * Run a tool's post-install steps. Each step is skipped silently when its
 * `when` binary is missing (so cross-tool order doesn't matter — by the
 * time this runs, all installs have completed). Failures are logged and
 * the next step is attempted.
 *
 * `OCP_REPO_DIR` is exported to each step so they can reference repo-side
 * files (e.g. `herdr plugin link "$OCP_REPO_DIR/install/herdr-plugins/..."`)
 * via portable paths that survive cwd changes.
 */
function runPostInstall(repoDir: string, name: string, def: ToolRegistry['tools'] extends infer T ? (T extends Record<string, infer V> ? V : never) : never): void {
  const steps = def.post_install ?? [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const command = typeof step === 'string' ? step : step.command;
    const stepName = typeof step === 'string' ? `step ${i + 1}` : (step.name || `step ${i + 1}`);
    const guard = typeof step === 'string' ? undefined : step.when;

    if (guard && !isBinaryOnPath(guard)) {
      console.log(`⏭ [post-install] ${name}: skipping "${stepName}" (requires "${guard}" on PATH)`);
      continue;
    }

    console.log(`⚙ [post-install] ${name}: ${stepName}`);
    // Resolve $OCP_REPO_DIR / %OCP_REPO_DIR% in the command string before
    // handing it to the shell — spawnSync({shell:true}) on Windows uses
    // cmd.exe, which only expands %VAR%, not POSIX $VAR. Without this,
    // herdr plugin link receives literal "$OCP_REPO_DIR/..." and fails
    // with "system cannot find path" (os error 3) on Windows.
    const resolvedCommand = command
      .replace(/\$OCP_REPO_DIR/g, repoDir)
      .replace(/%OCP_REPO_DIR%/g, repoDir);
    const res = spawnSync(resolvedCommand, {
      stdio: 'inherit',
      timeout: 300000,
      shell: true,
      env: { ...process.env, OCP_REPO_DIR: repoDir },
    });
    if (res.error || res.status !== 0) {
      const detail = res.error ? res.error.message : `exit code ${res.status ?? '?'}`;
      console.log(`⚠ [post-install] ${name}/${stepName} failed: ${detail}`);
    } else {
      console.log(`✓ [post-install] ${name}/${stepName} ok`);
    }
  }
}

export function executeInstall(
  repoDir: string,
  args: CliArgs,
  customOptions?: InstallOptions
): {
  success: boolean;
  version: string;
  targetDir: string;
  filesInstalled: number;
  backupPath: string | null;
} {
  const targetDir = args.target ? path.resolve(args.target) : getDefaultTargetDir();
  const curVersion = getCurrentRepoVersion(repoDir);

  // Load options: repo defaults < user overrides < explicit customOptions
  const effectiveOptions = loadEffectiveOptions(repoDir, targetDir, customOptions);

  // tui_mode=herdr implies tools.herdr=true; surface the override so the user
  // sees why their explicit `tools.herdr: false` was ignored.
  if (
    effectiveOptions.tui_mode === 'herdr' &&
    effectiveOptions.tools?.herdr === false
  ) {
    console.log('[ocp] tui_mode=herdr requires herdr — auto-enabling tools.herdr (overrides your tools.herdr=false).');
    effectiveOptions.tools = { ...effectiveOptions.tools, herdr: true };
  }

  // 1. Ensure Manifest for current version exists
  const curManifestPath = getManifestPath(repoDir, curVersion);
  if (!fs.existsSync(curManifestPath)) {
    generateManifest(repoDir, curVersion);
  }

  // 2. Perform Backup if target exists and not skipped
  let backupPath: string | null = null;
  if (!args.noBackup && fs.existsSync(targetDir)) {
    backupPath = backupTargetDir(targetDir);
    const keep = args.keepBackups ?? getMaxBackups();
    const pruned = pruneOldBackups(targetDir, keep);
    if (pruned > 0) console.log(`Pruned ${pruned} old backup(s) (keeping at most ${keep}).`);
  }

  // 3. Extract user modifications to preserve
  const preserveBag = extractPreserveBag(targetDir);

  // 3.5 Remove files shipped in any historical version but no longer shipped
  //   in the current one. Without this, removed agents/instructions/plugins
  //   accumulate in ~/.config/opencode/ across upgrades.
  //
  //   The historical source is the union of every loose manifest plus the
  //   compacted history.manifest.txt, excluding only curVersion. The
  //   installed version's manifest is deliberately INCLUDED: entries it
  //   lists that the current version no longer ships are exactly the stale
  //   files an upgrade must remove (curSet protects everything still
  //   shipped). Unioning all versions — rather than a single-prev diff —
  //   matches reality: the disk is the accumulation of every version ever
  //   installed, not just the previous one.
  //
  //   This catches the add/remove/re-add/remove sequence (a file shipped in
  //   v0.9.0, dropped in v0.9.1, re-added in v0.9.2, dropped again in
  //   v0.10.0) which a single-prev diff would miss, AND the "re-install same
  //   version" case (installed.version === curVersion) where historical
  //   leftovers from older versions still need cleaning.
  //
  //   Skipped only when no previous version is on disk (first install —
  //   target is empty). providers/*.json is carved out: after the first
  //   install that directory belongs to the user, mirroring the
  //   copyRepoFiles rule.
  const shippedFiles = collectShippedFiles(repoDir);
  const prevVer = getInstalledVersion(targetDir);
  if (prevVer) {
    const minVer = readVersionJson(repoDir)?.minVersion;
    if (minVer && isNewerVersion(minVer, prevVer)) {
      console.log(`⚠ Installed v${prevVer} is below the supported floor v${minVer} — upgrading on a best-effort basis.`);
    }
    const historicalFiles = collectHistoricalShippedFiles(repoDir, new Set([curVersion]));
    if (historicalFiles.length > 0) {
      const curSet = new Set(shippedFiles);
      const userOwnsProviders = fs.existsSync(path.join(targetDir, 'installed.version'));
      let staleRemoved = 0;
      for (const rel of historicalFiles) {
        if (curSet.has(rel)) continue;
        if (userOwnsProviders && rel.startsWith('providers/') && rel.endsWith('.json')) continue;
        const p = path.join(targetDir, rel);
        if (fs.existsSync(p)) {
          fs.rmSync(p, { force: true, recursive: true });
          staleRemoved++;
        }
      }
      if (staleRemoved > 0) {
        console.log(`Pruned ${staleRemoved} stale file(s) (shipped in some prior version, absent in v${curVersion}).`);
      }
    }
  }

  // 4. Copy files
  const installedCount = copyRepoFiles(repoDir, targetDir, shippedFiles);

  // 5. Merge configuration
  mergeConfig(repoDir, targetDir, effectiveOptions, preserveBag);
  mergeTuiConfig(repoDir, targetDir);

  // 6. Write installed version
  fs.writeFileSync(path.join(targetDir, 'installed.version'), curVersion + '\n', 'utf8');

  // 7. Tool diagnostics
  checkExternalTools(repoDir, effectiveOptions);

  // 8. Provision CLIs for enabled MCP servers missing from PATH
  provisionMcpCli(repoDir, effectiveOptions);

  // 9. Provision optional tools declared in install/tools.jsonc
  provisionTools(repoDir, effectiveOptions);

  // 10. Deploy the bundled herdr config to ~/.config/herdr/ — only when herdr
  //     is enabled. Non-destructive: if the user already has a config, we
  //     leave it alone (they can run `ocp herdr-config install --force`).
  if (effectiveOptions.tools?.herdr !== false) {
    const herdrCfg = deployHerdrConfig(repoDir, false);
    if (herdrCfg.action === 'installed' || herdrCfg.action === 'merged') {
      console.log(`✓ [herdr-config] ${herdrCfg.message}`);
    } else if (herdrCfg.action === 'uptodate' || herdrCfg.action === 'skipped') {
      console.log(`ℹ [herdr-config] ${herdrCfg.message}`);
    } else {
      console.log(`⚠ [herdr-config] ${herdrCfg.message}`);
    }
  }

  return {
    success: true,
    version: curVersion,
    targetDir,
    filesInstalled: installedCount,
    backupPath,
  };
}

export function executeStatus(
  repoDir: string,
  targetDirOverride?: string
): {
  repoVersion: string;
  installedVersion: string | null;
  targetDir: string;
  isUpToDate: boolean;
  shippedFilesCount: number;
} {
  const targetDir = targetDirOverride ? path.resolve(targetDirOverride) : getDefaultTargetDir();
  const repoVersion = getCurrentRepoVersion(repoDir);
  const installedVer = getInstalledVersion(targetDir);
  const shippedFiles = collectShippedFiles(repoDir);

  return {
    repoVersion,
    installedVersion: installedVer,
    targetDir,
    isUpToDate: installedVer === repoVersion,
    shippedFilesCount: shippedFiles.length,
  };
}

export function executeInit(
  repoDir: string,
  args: CliArgs
): { targetDir: string; backupPath: string | null } {
  const targetDir = args.target ? path.resolve(args.target) : getDefaultTargetDir();
  let backupPath: string | null = null;

  if (!args.noBackup && fs.existsSync(targetDir)) {
    backupPath = backupTargetDir(targetDir);
    const keep = args.keepBackups ?? getMaxBackups();
    const pruned = pruneOldBackups(targetDir, keep);
    if (pruned > 0) console.log(`Pruned ${pruned} old backup(s) (keeping at most ${keep}).`);
  }

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  return { targetDir, backupPath };
}

export function executeUninstall(
  repoDir: string,
  args: CliArgs
): { targetDir: string; removedCount: number } {
  const targetDir = args.target ? path.resolve(args.target) : getDefaultTargetDir();
  if (!fs.existsSync(targetDir)) {
    return { targetDir, removedCount: 0 };
  }

  // Prefer the *installed* version's manifest so uninstall removes exactly
  // what was shipped, not whatever the repo happens to contain now (a
  // user who hasn't run `ocp update` since pulling should still be able to
  // uninstall cleanly).
  const installedVer = getInstalledVersion(targetDir);
  const manifestVer = installedVer ?? getCurrentRepoVersion(repoDir);
  // Exact per-version manifest first. When it has been compacted away (or
  // never existed), fall back to the union of every historical manifest — a
  // superset of what any version shipped, so nothing managed survives, and
  // entries absent on disk are skipped by the loop below. Live repo scan is
  // the last resort when install/versions/ is missing entirely.
  let manifest = readManifest(getManifestPath(repoDir, manifestVer));
  if (!manifest) {
    const union = collectHistoricalShippedFiles(repoDir, new Set());
    manifest = union.length > 0 ? union : collectShippedFiles(repoDir);
  }

  let count = 0;
  for (const rel of manifest) {
    const p = path.join(targetDir, rel);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true, recursive: true });
      count++;
    }
  }

  const versionFile = path.join(targetDir, 'installed.version');
  if (fs.existsSync(versionFile)) {
    fs.rmSync(versionFile, { force: true });
  }

  return { targetDir, removedCount: count };
}
