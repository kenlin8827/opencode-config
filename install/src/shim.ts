import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const SHIM_MARKER = 'opencode-prime-trampoline';

export function getDefaultBinDir(): string {
  const home = os.homedir();
  return path.join(home, '.local', 'bin');
}

/**
 * True when `dir` resolves inside the OS temporary directory. Shims hardcode
 * the package location, so registering them from a temp extraction breaks the
 * global commands as soon as the OS cleans the temp directory.
 */
function isInsideTempDir(dir: string): boolean {
  const tmp = path.resolve(os.tmpdir());
  let resolved = path.resolve(dir);
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    /* keep the unresolved path — still good enough for a prefix check */
  }
  const norm = (p: string): string =>
    process.platform === 'win32' ? p.toLowerCase() : p;
  const a = norm(resolved);
  const b = norm(tmp);
  return a === b || a.startsWith(b + path.sep);
}

export function registerShim(repoDir: string, customBinDir?: string): { success: boolean; binDir: string; message: string } {
  const binDir = customBinDir ? path.resolve(customBinDir) : getDefaultBinDir();

  if (isInsideTempDir(repoDir)) {
    console.warn(
      '⚠ The package is running from the OS temporary directory. The global\n' +
        '  command shims hardcode this location and will BREAK once the OS\n' +
        '  cleans the temp directory. Install from a persistent location\n' +
        '  (e.g. extract the release into ~/.local/share or %LOCALAPPDATA%).'
    );
  }

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const commands = [
      { name: 'opencode-prime', script: 'opencode-prime.ps1' },
      { name: 'ocp', script: 'ocp.ps1' },
    ];

    for (const cmd of commands) {
      const cmdPath = path.join(binDir, `${cmd.name}.cmd`);
      const ps1Path = path.join(binDir, `${cmd.name}.ps1`);

      const cmdContent = `@echo off\r\nrem ${SHIM_MARKER}\r\npwsh -NoProfile -ExecutionPolicy Bypass -File "${path.join(repoDir, 'bin', cmd.script)}" %*\r\n`;
      const ps1Content = `# ${SHIM_MARKER}\r\n& "${path.join(repoDir, 'bin', cmd.script)}" @args\r\nexit $LASTEXITCODE\r\n`;

      fs.writeFileSync(cmdPath, cmdContent, 'utf8');
      fs.writeFileSync(ps1Path, ps1Content, 'utf8');
    }

    return {
      success: true,
      binDir,
      message: `Registered global commands (opencode-prime, ocp) into ${binDir}.`,
    };
  } else {
    // POSIX Shell Trampolines
    const commands = [
      { name: 'opencode-prime', script: 'opencode-prime' },
      { name: 'ocp', script: 'ocp' },
    ];

    for (const cmd of commands) {
      const shPath = path.join(binDir, cmd.name);
      const shContent = `#!/bin/sh\n# ${SHIM_MARKER}\nexec "${path.join(repoDir, 'bin', cmd.script)}" "$@"\n`;
      fs.writeFileSync(shPath, shContent, { mode: 0o755 });
    }

    return {
      success: true,
      binDir,
      message: `Registered global commands (opencode-prime, ocp) into ${binDir}.`,
    };
  }
}

const POSIX_PROFILE_MARKER = '# opencode-prime managed PATH entry (added by installer)';

export interface PathEnvResult {
  success: boolean;
  binDir: string;
  changed: boolean;
  message: string;
}

/**
 * Ensure the global bin directory is on the user's PATH environment so the
 * registered shims (ocp / opencode-prime) resolve in new
 * terminals without manual configuration.
 *
 * - Windows: appends the dir to the user PATH registry value via PowerShell
 *   ([Environment]::SetEnvironmentVariable), which preserves REG_EXPAND_SZ
 *   entries and never truncates long PATH values like `setx` does.
 * - POSIX: appends an `export PATH=...` block to the active shell profile
 *   (~/.zshrc, ~/.bashrc or ~/.profile) guarded by a managed marker.
 */
export function ensureBinDirOnPath(customBinDir?: string): PathEnvResult {
  const binDir = customBinDir ? path.resolve(customBinDir) : getDefaultBinDir();
  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
      const script = [
        `$bd = @'
${binDir}
'@`,
        "$p = [Environment]::GetEnvironmentVariable('Path','User')",
        "if ([string]::IsNullOrEmpty($p)) { $p = '' }",
        "$parts = $p.Split(';') | Where-Object { $_.Trim() -ne '' }",
        "if ($parts -notcontains $bd) {",
        "  [Environment]::SetEnvironmentVariable('Path', (($parts + $bd) -join ';'), 'User')",
        "  Write-Output 'ADDED'",
        "} else {",
        "  Write-Output 'PRESENT'",
        '}',
      ].join('\r\n');

      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { encoding: 'utf8', timeout: 15000 }
      ).trim();

      if (out.includes('ADDED')) {
        return {
          success: true,
          binDir,
          changed: true,
          message: `Added ${binDir} to your user PATH environment variable (open a new terminal to take effect).`,
        };
      }
      return {
        success: true,
        binDir,
        changed: false,
        message: `${binDir} is already on your user PATH — no changes needed.`,
      };
    }

    // POSIX shell profiles
    const currentPath = process.env.PATH || '';
    const onCurrentPath = currentPath.split(':').some((seg) => path.resolve(seg) === binDir);
    const candidates = [path.join(os.homedir(), '.profile'), path.join(os.homedir(), '.bashrc'), path.join(os.homedir(), '.zshrc')];
    const profiled = candidates.some((f) => {
      try {
        return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(binDir);
      } catch {
        return false;
      }
    });

    if (onCurrentPath || profiled) {
      return {
        success: true,
        binDir,
        changed: false,
        message: `${binDir} is already on your PATH — no changes needed.`,
      };
    }

    const shell = process.env.SHELL || '';
    const primary = shell.includes('zsh')
      ? candidates[2]
      : shell.includes('bash')
        ? candidates[1]
        : candidates[0];

    const block = `\n${POSIX_PROFILE_MARKER}\nexport PATH="$PATH:${binDir}"\n`;
    fs.appendFileSync(primary, block, 'utf8');

    return {
      success: true,
      binDir,
      changed: true,
      message: `Added ${binDir} to your PATH via ${primary} (open a new terminal to take effect).`,
    };
  } catch (err) {
    return {
      success: false,
      binDir,
      changed: false,
      message: `Failed to update PATH automatically: ${err instanceof Error ? err.message : String(err)}. Add ${binDir} to your PATH manually.`,
    };
  }
}

export interface GlobalRegistrationResult {
  binDir: string;
  shimMessage: string;
  pathMessage: string;
  pathSuccess: boolean;
  pathChanged: boolean;
}

/**
 * Core, i18n-free global command registration. Registers shims into the bin
 * directory and ensures that directory is on the user's PATH. Returns plain
 * result objects so callers (wizard with localized messages, CLI with plain
 * console output) can present them appropriately.
 */
export function runGlobalRegistration(repoDir: string, customBinDir?: string): GlobalRegistrationResult {
  // Create shims first so we know the effective binDir.
  const shimRes = registerShim(repoDir, customBinDir);
  const pathRes = ensureBinDirOnPath(shimRes.binDir);

  let pathMessage: string;
  if (!pathRes.success) {
    pathMessage = `Failed to update PATH automatically — please add ${pathRes.binDir} manually`;
  } else if (!pathRes.changed) {
    pathMessage = `${pathRes.binDir} is already on PATH — no changes needed`;
  } else {
    pathMessage = `Added ${pathRes.binDir} to your user PATH (takes effect in new terminals)`;
  }

  return {
    binDir: shimRes.binDir,
    shimMessage: shimRes.message,
    pathMessage,
    pathSuccess: pathRes.success,
    pathChanged: pathRes.changed,
  };
}

export function isShimRegistered(customBinDir?: string): boolean {
  const binDir = customBinDir ? path.resolve(customBinDir) : getDefaultBinDir();

  const names = process.platform === 'win32'
    ? ['opencode-prime.cmd', 'ocp.cmd']
    : ['opencode-prime', 'ocp'];

  return names.some((name) => {
    try {
      const p = path.join(binDir, name);
      return fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes(SHIM_MARKER);
    } catch {
      return false;
    }
  });
}

export function unregisterShim(customBinDir?: string): { success: boolean; removed: string[] } {
  const binDir = customBinDir ? path.resolve(customBinDir) : getDefaultBinDir();
  const removed: string[] = [];

  const targets = process.platform === 'win32'
    ? [
        'opencode-prime.cmd',
        'opencode-prime.ps1',
        'ocp.cmd',
        'ocp.ps1',
      ]
    : ['opencode-prime', 'ocp'];

  for (const name of targets) {
    const p = path.join(binDir, name);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        if (content.includes(SHIM_MARKER)) {
          fs.unlinkSync(p);
          removed.push(p);
        }
      } catch {}
    }
  }

  return {
    success: true,
    removed,
  };
}
