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
    const commands = [
      { name: 'opencode-prime', script: 'opencode-prime.ps1' },
      { name: 'ocp', script: 'ocp.ps1' },
      { name: 'opencode-config', script: 'opencode-config.ps1' },
    ];

    for (const cmd of commands) {
      const cmdPath = path.join(binDir, `${cmd.name}.cmd`);
      const ps1Path = path.join(binDir, `${cmd.name}.ps1`);

      const cmdContent = `@echo off\r\nrem ${SHIM_MARKER}\r\npwsh -NoProfile -ExecutionPolicy Bypass -File "${path.join(repoDir, 'bin', cmd.script)}" %*\r\n`;
      const ps1Content = `# ${SHIM_MARKER}\r\n& "${path.join(repoDir, 'bin', cmd.script)}" @args\r\n`;

      fs.writeFileSync(cmdPath, cmdContent, 'utf8');
      fs.writeFileSync(ps1Path, ps1Content, 'utf8');
    }

    return {
      success: true,
      binDir,
      message: `Registered global commands (opencode-prime, ocp, opencode-config) into ${binDir}.`,
    };
  } else {
    // POSIX Shell Trampolines
    const commands = [
      { name: 'opencode-prime', script: 'opencode-prime' },
      { name: 'ocp', script: 'ocp' },
      { name: 'opencode-config', script: 'opencode-config' },
    ];

    for (const cmd of commands) {
      const shPath = path.join(binDir, cmd.name);
      const shContent = `#!/bin/sh\n# ${SHIM_MARKER}\nexec "${path.join(repoDir, 'bin', cmd.script)}" "$@"\n`;
      fs.writeFileSync(shPath, shContent, { mode: 0o755 });
    }

    return {
      success: true,
      binDir,
      message: `Registered global commands (opencode-prime, ocp, opencode-config) into ${binDir}.`,
    };
  }
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
        'opencode-config.cmd',
        'opencode-config.ps1',
      ]
    : ['opencode-prime', 'ocp', 'opencode-config'];

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
