import path from 'node:path';
import fs from 'node:fs';
import { CliArgs, CommandAction } from './types';
import {
  executeInstall,
  executeStatus,
  executeInit,
  executeUninstall,
  getCurrentRepoVersion,
} from './installer';
import { generateManifest } from './manifest';
import { registerShim, unregisterShim } from './shim';
import { runInteractiveWizard } from './wizard';
import { runTuiDashboard } from './dashboard';

function parseCliArgs(rawArgs: string[]): CliArgs {
  const args: CliArgs = {
    action: 'install',
    force: false,
    noBackup: false,
    yes: false,
    isInteractive: process.stdout.isTTY && process.stdin.isTTY,
  };

  let hasExplicitAction = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === 'status') {
      args.action = 'status';
      hasExplicitAction = true;
    } else if (arg === 'install') {
      args.action = 'install';
      hasExplicitAction = true;
    } else if (arg === 'generate') {
      args.action = 'generate';
      hasExplicitAction = true;
    } else if (arg === 'init') {
      args.action = 'init';
      hasExplicitAction = true;
    } else if (arg === 'uninstall') {
      args.action = 'uninstall';
      hasExplicitAction = true;
    } else if (arg === 'register') {
      args.action = 'register';
      hasExplicitAction = true;
    } else if (arg === 'unregister') {
      args.action = 'unregister';
      hasExplicitAction = true;
    } else if (arg === 'wizard' || arg === 'ui' || arg === 'menu') {
      args.action = 'wizard';
      hasExplicitAction = true;
    } else if (arg === 'dashboard' || arg === 'matrix' || arg === 'cc') {
      args.action = 'dashboard';
      hasExplicitAction = true;
    } else if (arg === '-Target' || arg === '--target' || arg === '-t') {
      args.target = rawArgs[++i];
    } else if (arg === '-Force' || arg === '--force' || arg === '-f') {
      args.force = true;
    } else if (arg === '-NoBackup' || arg === '--no-backup') {
      args.noBackup = true;
    } else if (arg === '-Yes' || arg === '--yes' || arg === '-y') {
      args.yes = true;
    } else if (arg === '-BinDir' || arg === '--bin-dir') {
      args.binDir = rawArgs[++i];
    } else if (arg === '-OptionsFile' || arg === '--options-file') {
      args.optionsFile = rawArgs[++i];
    } else if (arg === '--help' || arg === '-h' || arg === 'help') {
      printHelp();
      process.exit(0);
    }
  }

  // If no explicit action or flags provided and running in interactive TTY, launch wizard
  if (!hasExplicitAction && rawArgs.length === 0 && args.isInteractive) {
    args.action = 'wizard';
  }

  return args;
}

function printHelp(): void {
  console.log(`
OpenCode Prime (OCP) Installer & Manager

Usage:
  pwsh install/install.ps1 [action] [options]
  ./install/install.sh [action] [options]
  bun run install/src/index.ts [action] [options]

Actions:
  (default)    Interactive setup wizard (in TTY) or install (in non-interactive)
  wizard       Launch the interactive TUI setup wizard
  install      Install or update OpenCode Prime configuration files
  status       Check installed version and comparison with current repo
  generate     Generate manifest for current repo VERSION
  init         Backup and reset the target configuration directory
  uninstall    Safely remove installed managed configuration files
  register     Register global 'opencode-prime' & 'ocp' command shims into PATH
  unregister   Remove global 'opencode-prime' & 'ocp' command shims

Options:
  -t, --target <path>      Custom target directory (default: ~/.config/opencode)
  -f, --force              Force install even if version is unchanged
  --no-backup              Skip automatic backup of existing configuration
  -y, --yes                Skip confirmation prompts
  --bin-dir <path>         Target directory for global command shim (default: ~/.local/bin)
  -h, --help               Show this help message
`);
}

/**
 * Resolve the repository root directory at runtime.
 *
 * When the installer is run from source (bun run install/src/index.ts),
 * __dirname correctly points to install/src/ and two levels up gives the repo root.
 *
 * However, when run from the bundled dist/index.js (produced by `bun build`),
 * Bun hard-codes __dirname to the build machine's absolute path (e.g.
 * "D:\\OpenHub\\opencode-config\\install\\src"), which does not exist on
 * end-user machines. This causes ENOTSUP errors when trying to mkdir
 * manifest paths under a non-existent directory tree.
 *
 * Fallback chain:
 *   1. __dirname (works for source mode)
 *   2. dirname(process.argv[1]) (works for bundled mode — argv[1] is the script path)
 *   3. process.cwd() (last resort)
 */
function resolveRepoDir(): string {
  // Try __dirname first (two levels up: install/src/ -> repo root)
  const candidates: string[] = [
    path.resolve(__dirname, '..', '..'),
  ];

  // In bundled mode, process.argv[1] is the actual script path on the user's machine
  if (process.argv[1]) {
    const scriptDir = path.dirname(path.resolve(process.argv[1]));
    // dist/index.js is at install/dist/index.js, so repo root is two levels up
    candidates.push(path.resolve(scriptDir, '..', '..'));
    // If script is install/src/index.ts, repo root is also two levels up
    candidates.push(path.resolve(scriptDir, '..', '..'));
  }

  // Last resort: cwd
  candidates.push(process.cwd());

  // Return the first candidate that contains install/VERSION
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'install', 'VERSION'))) {
      return c;
    }
  }

  // If none matched, return the first candidate (let downstream errors surface naturally)
  return candidates[0];
}

async function main() {
  // Find repo root at runtime (see resolveRepoDir for fallback logic)
  const repoDir = resolveRepoDir();
  const rawArgs = process.argv.slice(2);
  const args = parseCliArgs(rawArgs);

  if (args.action === 'dashboard') {
    await runTuiDashboard(repoDir);
    return;
  }

  if (args.action === 'wizard') {
    await runInteractiveWizard(repoDir);
    return;
  }

  const curVersion = getCurrentRepoVersion(repoDir);

  switch (args.action) {
    case 'status': {
      const st = executeStatus(repoDir, args.target);
      console.log(`Repository Version : ${st.repoVersion}`);
      console.log(`Installed Version  : ${st.installedVersion || 'None'}`);
      console.log(`Target Directory   : ${st.targetDir}`);
      console.log(`Status             : ${st.isUpToDate ? 'Up to date' : 'Update available'}`);
      console.log(`Shipped Files      : ${st.shippedFilesCount}`);
      break;
    }
    case 'generate': {
      const res = generateManifest(repoDir, curVersion);
      console.log(`Generated manifest for v${curVersion} (${res.count} files) -> ${res.path}`);
      break;
    }
    case 'init': {
      const res = executeInit(repoDir, args);
      console.log(`Reset configuration target: ${res.targetDir}`);
      if (res.backupPath) console.log(`Backup created: ${res.backupPath}`);
      break;
    }
    case 'uninstall': {
      const res = executeUninstall(repoDir, args);
      console.log(`Uninstalled ${res.removedCount} managed files from ${res.targetDir}`);
      break;
    }
    case 'register': {
      const res = registerShim(repoDir, args.binDir);
      console.log(res.message);
      break;
    }
    case 'unregister': {
      const res = unregisterShim(args.binDir);
      console.log(`Unregistered global command. Removed: ${res.removed.join(', ') || 'None'}`);
      break;
    }
    case 'install':
    default: {
      const res = executeInstall(repoDir, args);
      console.log(`Installed v${res.version} to ${res.targetDir} (${res.filesInstalled} files applied)`);
      if (res.filesRemoved > 0) console.log(`Cleaned ${res.filesRemoved} deprecated files`);
      if (res.backupPath) console.log(`Backup saved to ${res.backupPath}`);
      break;
    }
  }
}

main().catch((err) => {
  console.error('Installer encountered an error:', err);
  process.exit(1);
});
