import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SHIM_MARKER = 'opencode-config-trampoline';

export function getDefaultBinDir(): string {
  const home = os.homedir();
  return path.join(home, '.local', 'bin');
}

export function registerShim(repoDir: string, customBinDir?: string): { success: boolean; binDir: string; message: string } {
  const binDir = customBinDir ? path.resolve(customBinDir) : getDefaultBinDir();

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const cmdPath = path.join(binDir, 'opencode-config.cmd');
    const ps1Path = path.join(binDir, 'opencode-config.ps1');

    // Windows CMD Trampoline
    const cmdContent = `@echo off\r\nrem ${SHIM_MARKER}\r\npwsh -NoProfile -ExecutionPolicy Bypass -File "${path.join(repoDir, 'bin', 'opencode-config.ps1')}" %*\r\n`;
    // Windows PowerShell Trampoline
    const ps1Content = `# ${SHIM_MARKER}\r\n& "${path.join(repoDir, 'bin', 'opencode-config.ps1')}" @args\r\n`;

    fs.writeFileSync(cmdPath, cmdContent, 'utf8');
    fs.writeFileSync(ps1Path, ps1Content, 'utf8');

    return {
      success: true,
      binDir,
      message: `Registered global command in ${binDir} (created opencode-config.cmd and opencode-config.ps1).`,
    };
  } else {
    // POSIX Shell Trampoline
    const shPath = path.join(binDir, 'opencode-config');
    const shContent = `#!/bin/sh\n# ${SHIM_MARKER}\nexec "${path.join(repoDir, 'bin', 'opencode-config')}" "$@"\n`;

    fs.writeFileSync(shPath, shContent, { mode: 0o755 });

    return {
      success: true,
      binDir,
      message: `Registered global command in ${binDir} (created opencode-config shim).`,
    };
  }
}

export function unregisterShim(customBinDir?: string): { success: boolean; removed: string[] } {
  const binDir = customBinDir ? path.resolve(customBinDir) : getDefaultBinDir();
  const removed: string[] = [];

  const targets = process.platform === 'win32'
    ? ['opencode-config.cmd', 'opencode-config.ps1']
    : ['opencode-config'];

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
