import path from 'node:path';
import fs from 'node:fs';
import { CliArgs, CommandAction, InstallOptions } from './types';
import { readJsoncFile } from './merger';
import {
  executeInstall,
  executeStatus,
  executeInit,
  executeUninstall,
  getCurrentRepoVersion,
} from './installer';
import { generateManifest } from './manifest';
import { unregisterShim, runGlobalRegistration } from './shim';
import { runInteractiveWizard } from './wizard';
import { runTuiDashboard } from './dashboard';
import { launchTui, launchServe, launchWeb, launchDesktop } from './launcher';
import { ensureOpenChamber } from './openchamber';
import { executeUpdate, executeUpgrade } from './updater';

function parseCliArgs(rawArgs: string[]): CliArgs {
  const args: CliArgs = {
    action: 'install',
    force: false,
    noBackup: false,
    keepBackups: undefined,
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
    } else if (arg === 'wizard' || arg === 'menu') {
      args.action = 'wizard';
      hasExplicitAction = true;
    } else if (arg === 'dashboard' || arg === 'matrix' || arg === 'cc') {
      args.action = 'dashboard';
      hasExplicitAction = true;
    } else if (arg === 'tui') {
      args.action = 'tui';
      args.passthrough = rawArgs.slice(i + 1);
      hasExplicitAction = true;
      break;
    } else if (arg === 'serve') {
      args.action = 'serve';
      args.passthrough = rawArgs.slice(i + 1);
      hasExplicitAction = true;
      break;
    } else if (arg === 'update') {
      args.action = 'update';
      args.passthrough = rawArgs.slice(i + 1);
      hasExplicitAction = true;
      break;
    } else if (arg === 'upgrade') {
      args.action = 'upgrade';
      args.passthrough = rawArgs.slice(i + 1);
      hasExplicitAction = true;
      break;
    } else if (arg === 'desktop' || arg === 'ui') {
      args.action = 'desktop';
      args.passthrough = rawArgs.slice(i + 1);
      hasExplicitAction = true;
      break;
    } else if (arg === 'web') {
      args.action = 'web';
      args.passthrough = rawArgs.slice(i + 1);
      hasExplicitAction = true;
      break;
    } else if (arg === '-Target' || arg === '--target' || arg === '-t') {
      args.target = rawArgs[++i];
    } else if (arg === '-Force' || arg === '--force' || arg === '-f') {
      args.force = true;
    } else if (arg === '-NoBackup' || arg === '--no-backup') {
      args.noBackup = true;
    } else if (arg === '-KeepBackups' || arg === '--keep-backups') {
      const n = parseInt(rawArgs[++i], 10);
      if (!Number.isNaN(n) && n >= 0) args.keepBackups = n;
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
  tui          Launch the OpenCode terminal UI (exec opencode)
  serve        Launch the headless opencode server (opencode serve; all args pass through)
  web          Launch the OpenChamber web UI (auto-picks a free port unless --port is given)
  desktop      Launch the OpenChamber native desktop app (alias: ui)
  install      Install or update OpenCode Prime configuration files
  update       Check the suite + companion tools (opencode, openchamber) for updates;
               apply the selected ones in an interactive TTY (Enter = keep, n = skip);
               -y applies ALL pending updates without prompting; --check-only
               probes versions and applies nothing (default without -y when non-interactive)
  upgrade      Pull the latest release (git pull for clones, release download
               otherwise) and re-apply the installer
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
  --keep-backups <n>       Max backups kept after each run (default: 5, env: OCP_MAX_BACKUPS)
  -y, --yes                Skip confirmation prompts (update: apply all pending)
  --check-only             update: check versions only, apply nothing
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
 * "D:\\OpenHub\\opencode-prime\\install\\src"), which does not exist on
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

  if (args.action === 'tui') {
    process.exit(launchTui(args.passthrough ?? []));
  }

  if (args.action === 'serve') {
    process.exit(launchServe(args.passthrough ?? []));
  }

  if (args.action === 'update') {
    process.exit(await executeUpdate(repoDir, args.passthrough ?? []));
  }

  if (args.action === 'upgrade') {
    process.exit(await executeUpgrade(repoDir, args.passthrough ?? []));
  }

  if (args.action === 'web') {
    process.exit(launchWeb(args.passthrough ?? []));
  }

  if (args.action === 'desktop') {
    process.exit(launchDesktop(args.passthrough ?? []));
  }

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
      const reg = runGlobalRegistration(repoDir, args.binDir);
      console.log(reg.shimMessage);
      console.log(reg.pathMessage);
      break;
    }
    case 'unregister': {
      const res = unregisterShim(args.binDir);
      console.log(`Unregistered global command. Removed: ${res.removed.join(', ') || 'None'}`);
      break;
    }
    case 'install':
    default: {
      const optionsPath = path.join(repoDir, 'install', 'options.jsonc');
      const fileOptions = readJsoncFile<InstallOptions>(optionsPath) || {};
      const wantGlobal = fileOptions.global_commands !== false;

      const res = executeInstall(repoDir, args);
      console.log(`Installed v${res.version} to ${res.targetDir} (${res.filesInstalled} files applied)`);
      if (res.filesRemoved > 0) console.log(`Cleaned ${res.filesRemoved} deprecated files`);
      if (res.backupPath) console.log(`Backup saved to ${res.backupPath}`);

      if (wantGlobal) {
        const reg = runGlobalRegistration(repoDir, args.binDir);
        console.log(reg.shimMessage);
        console.log(reg.pathMessage);
      }

      if (fileOptions.openchamber !== false) {
        console.log(ensureOpenChamber().message);
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error('Installer encountered an error:', err);
  process.exit(1);
});
