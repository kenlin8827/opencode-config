import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { CliArgs, InstallOptions } from './types';
import {
  collectShippedFiles,
  generateManifest,
  getManifestPath,
  readManifest,
} from './manifest';
import {
  extractPreserveBag,
  mergeConfig,
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
  const versionFile = path.join(repoDir, 'install', 'VERSION');
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, 'utf8').trim();
  }
  throw new Error(`Missing version file: ${versionFile}`);
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
  for (const relFile of files) {
    // The config template ships in the package but never lands in the target:
    // mergeConfig renders it (plus options + preserved fields) into the
    // target's opencode.jsonc. Copying it verbatim would leave a stray
    // opencode.template.jsonc beside the merged config.
    if (relFile === 'opencode.template.jsonc') continue;
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

export function checkExternalTools(options: InstallOptions): void {
  // Check RTK binary
  if (options.rtk !== false) {
    if (isBinaryOnPath('rtk')) {
      console.log('✓ [rtk] binary is present on PATH');
    } else {
      console.log('ℹ [rtk] binary not found on PATH (can be installed via cargo or downloaded)');
    }
  }

  // Check OpenChamber web UI CLI
  if (options.openchamber !== false) {
    if (isBinaryOnPath('openchamber')) {
      console.log('✓ [openchamber] web UI CLI is present on PATH');
    } else {
      console.log('ℹ [openchamber] web UI CLI not found on PATH (provisioned after the config install)');
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
 * Provision CLIs for enabled MCP servers that declare an `install` field and
 * are missing from PATH. Never throws — failures are logged with manual
 * instructions so a missing CLI can't fail the config install.
 */
export function provisionMcpCli(repoDir: string, options: InstallOptions): void {
  for (const { name, install } of mcpProvisionPlan(repoDir, options)) {
    console.log(`🚀 [mcp] ${name} missing from PATH — provisioning via: ${install}`);
    const res = spawnSync(install, {
      stdio: 'inherit',
      timeout: 600000,
      shell: true,
    });
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

  // 4. Copy files
  const shippedFiles = collectShippedFiles(repoDir);
  const installedCount = copyRepoFiles(repoDir, targetDir, shippedFiles);

  // 5. Merge configuration
  mergeConfig(repoDir, targetDir, effectiveOptions, preserveBag);

  // 6. Write installed version
  fs.writeFileSync(path.join(targetDir, 'installed.version'), curVersion + '\n', 'utf8');

  // 7. Tool diagnostics
  checkExternalTools(effectiveOptions);

  // 8. Provision CLIs for enabled MCP servers missing from PATH
  provisionMcpCli(repoDir, effectiveOptions);

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

  const manifest = readManifest(getManifestPath(repoDir, getCurrentRepoVersion(repoDir))) || collectShippedFiles(repoDir);

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
