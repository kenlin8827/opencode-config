import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { CliArgs, InstallOptions } from './types';
import {
  collectShippedFiles,
  generateManifest,
  getManifestPath,
  readManifest,
  computeFilesToRemove,
} from './manifest';
import { extractPreserveBag, mergeConfig, readJsoncFile } from './merger';

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
  return '0.4.0';
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

  fs.cpSync(targetDir, backupDir, { recursive: true });
  return backupDir;
}

export function copyRepoFiles(repoDir: string, targetDir: string, files: string[]): number {
  let count = 0;
  for (const relFile of files) {
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

export function executeInstall(
  repoDir: string,
  args: CliArgs,
  customOptions?: InstallOptions
): {
  success: boolean;
  version: string;
  targetDir: string;
  filesInstalled: number;
  filesRemoved: number;
  backupPath: string | null;
} {
  const targetDir = args.target ? path.resolve(args.target) : getDefaultTargetDir();
  const curVersion = getCurrentRepoVersion(repoDir);
  const installedVer = getInstalledVersion(targetDir);

  // Load options
  const optionsPath = path.join(repoDir, 'install', 'options.jsonc');
  const fileOptions = readJsoncFile<InstallOptions>(optionsPath) || {};
  const effectiveOptions: InstallOptions = { ...fileOptions, ...customOptions };

  // 1. Ensure Manifest for current version exists
  const curManifestPath = getManifestPath(repoDir, curVersion);
  if (!fs.existsSync(curManifestPath)) {
    generateManifest(repoDir, curVersion);
  }

  // 2. Perform Backup if target exists and not skipped
  let backupPath: string | null = null;
  if (!args.noBackup && fs.existsSync(targetDir)) {
    backupPath = backupTargetDir(targetDir);
  }

  // 3. Extract user modifications to preserve
  const preserveBag = extractPreserveBag(targetDir);

  // 4. Remove deprecated files from previous version manifest
  let removedCount = 0;
  if (installedVer && installedVer !== curVersion) {
    const filesToRemove = computeFilesToRemove(repoDir, installedVer, curVersion);
    for (const relFile of filesToRemove) {
      const p = path.join(targetDir, relFile);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { force: true, recursive: true });
        removedCount++;
      }
    }
  }

  // 5. Copy files
  const shippedFiles = collectShippedFiles(repoDir);
  const installedCount = copyRepoFiles(repoDir, targetDir, shippedFiles);

  // 6. Merge configuration
  mergeConfig(repoDir, targetDir, effectiveOptions, preserveBag);

  // 7. Write installed version
  fs.writeFileSync(path.join(targetDir, 'installed.version'), curVersion + '\n', 'utf8');

  // 8. Tool diagnostics
  checkExternalTools(effectiveOptions);

  return {
    success: true,
    version: curVersion,
    targetDir,
    filesInstalled: installedCount,
    filesRemoved: removedCount,
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

  const installedVer = getInstalledVersion(targetDir) || getCurrentRepoVersion(repoDir);
  const manifest = readManifest(getManifestPath(repoDir, installedVer)) || collectShippedFiles(repoDir);

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
