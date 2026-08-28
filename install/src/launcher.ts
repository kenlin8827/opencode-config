import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isBinaryOnPath } from './installer';

// Runtime launchers behind the `ocp tui` / `ocp serve` / `ocp desktop`
// (= `ocp ui`) / `ocp web` (OpenChamber web mode) subcommands. They exec
// the underlying binary directly — no config files are touched.

function launchBinary(
  binName: string,
  installHint: string,
  extraArgs: string[]
): number {
  if (!isBinaryOnPath(binName)) {
    console.error(`✗ ${binName} was not found on PATH.`);
    console.error(installHint);
    return 1;
  }

  const res = spawnSync(binName, extraArgs, {
    stdio: 'inherit',
    // Windows resolves .cmd / .bat shims (npm globals) only through the shell.
    shell: process.platform === 'win32',
  });

  if (res.error) {
    console.error(`✗ Failed to launch ${binName}: ${res.error.message}`);
    return 1;
  }
  return res.status ?? 0;
}

/** `ocp tui` — launch the OpenCode terminal UI. */
export function launchTui(extraArgs: string[]): number {
  return launchBinary(
    'opencode',
    '  Install OpenCode first: https://opencode.ai (or re-run `ocp install`).',
    extraArgs
  );
}

/**
 * `ocp serve` — launch the headless opencode server. Pure passthrough;
 * opencode's own --port defaults to 0 (auto-assigned random port).
 */
export function launchServe(extraArgs: string[]): number {
  return launchBinary(
    'opencode',
    '  Install OpenCode first: https://opencode.ai (or re-run `ocp install`).',
    ['serve', ...extraArgs]
  );
}

/**
 * `ocp web` — launch OpenChamber in web mode: the browser UI is served on
 * localhost, protected by a UI password (official quick-start pattern).
 * A user-supplied `--ui-password` in the passthrough args wins; otherwise
 * a random one is generated and printed before launch.
 *
 * If an instance is already running, a fresh password launch would fail
 * (and leak a useless password), so stop the running instances first and
 * then start a fresh session with the new password.
 */
export function launchWeb(extraArgs: string[]): number {
  if (!isBinaryOnPath('openchamber')) {
    console.error('✗ openchamber was not found on PATH.');
    console.error(
      '  Install OpenChamber first: `npm install -g @openchamber/web`\n' +
        '  or download the native app from https://openchamber.dev/download'
    );
    return 1;
  }

  // `openchamber status --quiet` prints a `port <n> ...` line per running
  // instance and the single word `stopped` when idle.
  const status = spawnSync('openchamber', ['status', '--quiet'], {
    encoding: 'utf8',
    timeout: 15000,
    // Windows resolves .cmd / .bat shims (npm globals) only through the shell.
    shell: process.platform === 'win32',
  });
  const statusText = `${status.stdout ?? ''}${status.stderr ?? ''}`;
  if (/^port \d+/im.test(statusText)) {
    console.log('  OpenChamber instance(s) already running — stopping for a fresh web session:');
    console.log(statusText.trim().replace(/^/gm, '    '));
    spawnSync('openchamber', ['stop'], {
      stdio: 'ignore',
      timeout: 15000,
      // Windows resolves .cmd / .bat shims (npm globals) only through the shell.
      shell: process.platform === 'win32',
    });
  }

  // Port policy: an explicit --port passes through as-is (we only try to
  // reclaim it from zombie daemons); without one, pick the first free port
  // starting at 3000 so stale listeners never block startup.
  let args = [...extraArgs];
  const explicitPort = parseWebPort(extraArgs);
  if (explicitPort === null || explicitPort === 0) {
    const picked = findFreeWebPort(3000);
    if (picked < 0) {
      console.error('✗ No free port found in range 3000-3199.');
      return 1;
    }
    console.log(`  Using free port ${picked}`);
    args = [...stripPortArgs(args), '--port', String(picked)];
  } else if (isPortBusy(explicitPort)) {
    // Zombie / orphan daemons keep holding the port even after stop (pid
    // file gone, HTTP shutdown unresponsive) — reclaim it BEFORE generating
    // a password, otherwise the fresh daemon dies with EADDRINUSE and the
    // printed password is useless.
    console.log(`  Port ${explicitPort} is still occupied — reclaiming it for the new session...`);
    spawnSync('openchamber', ['stop', '--port', String(explicitPort)], {
      stdio: 'ignore',
      timeout: 15000,
      // Windows resolves .cmd / .bat shims (npm globals) only through the shell.
      shell: process.platform === 'win32',
    });
    if (!waitPortFree(explicitPort)) {
      console.error(`✗ Port ${explicitPort} is still occupied and could not be reclaimed.`);
      console.error('  Kill the listener manually or let OCP pick a free port: `ocp web` (no --port)');
      return 1;
    }
  }

  if (!args.includes('--ui-password')) {
    const password = randomBytes(18).toString('base64url');
    console.log(`🔑 OpenChamber web UI password: ${password}`);
    args.push('--ui-password', password);
  }
  return launchBinary(
    'openchamber',
    '  Install OpenChamber first: `npm install -g @openchamber/web`\n' +
      '  or download the native app from https://openchamber.dev/download',
    ['serve', ...args]
  );
}

/**
 * Parse the serve port from passthrough args (--port N / -p N / --port=N).
 * Returns null when the caller did not pin a port.
 */
function parseWebPort(args: string[]): number | null {
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && /^\d+$/.test(args[i + 1] ?? '')) {
      return Number(args[i + 1]);
    }
    const m = args[i].match(/^--port=(\d+)$/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Drop any port selector (--port N / -p N / --port=N) before re-injecting one. */
function stripPortArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') {
      if (/^\d+$/.test(args[i + 1] ?? '')) i++;
      continue;
    }
    if (/^--port=\d+$/.test(args[i])) continue;
    out.push(args[i]);
  }
  return out;
}

/** First free port at or above the base, or -1 when the range is exhausted. */
function findFreeWebPort(base: number): number {
  for (let p = base; p < base + 200; p++) {
    if (!isPortBusy(p)) return p;
  }
  return -1;
}

/** Synchronous TCP probe: true when something listens on 127.0.0.1:port. */
function isPortBusy(port: number): boolean {
  const probe =
    `const n=require('net');const s=n.connect(${port},'127.0.0.1');` +
    `s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1));` +
    `setTimeout(()=>process.exit(1),700);`;
  const r = spawnSync(process.execPath, ['-e', probe], { timeout: 3000 });
  return r.status === 0;
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitPortFree(port: number, ms = 5000): boolean {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isPortBusy(port)) return true;
    sleepMs(500);
  }
  return !isPortBusy(port);
}

const DESKTOP_NOT_FOUND_HINT =
  '  Download the native app from https://openchamber.dev/download\n' +
  '  (the `openchamber` CLI serves the browser UI instead — use `ocp web`)';

/**
 * Locate the OpenChamber native desktop app (Tauri) on Windows. It is not
 * registered on PATH, so probe the common per-user / system install dirs
 * for an OpenChamber directory and return the first launcher exe inside.
 */
function findWindowsDesktopExe(): string | null {
  const roots: string[] = [];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    roots.push(path.join(localAppData, 'Programs'), localAppData);
  }
  for (const key of ['ProgramFiles', 'ProgramFiles(x86)']) {
    const dir = process.env[key];
    if (dir) roots.push(dir);
  }
  for (const root of roots) {
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/openchamber/i.test(entry)) continue;
      const dirPath = path.join(root, entry);
      if (!fs.existsSync(dirPath)) continue;
      const exe = scanForExe(dirPath, 2);
      if (exe) return exe;
    }
  }
  return null;
}

function scanForExe(dir: string, depth: number): string | null {
  if (depth < 0) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.endsWith('.exe') && !/^unins/i.test(e.name)) {
      return full;
    }
    if (e.isDirectory()) {
      const found = scanForExe(full, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

/** Locate the native app on Linux: PATH binary first, then common paths. */
function findLinuxDesktopBin(): string | null {
  if (isBinaryOnPath('openchamber-desktop')) return 'openchamber-desktop';
  const candidates = [
    path.join(os.homedir(), 'Applications', 'openchamber-desktop'),
    path.join(os.homedir(), 'Applications', 'OpenChamber', 'OpenChamber'),
    '/usr/local/bin/openchamber-desktop',
    '/opt/openchamber-desktop/openchamber-desktop',
  ];
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {
      /* keep probing */
    }
  }
  return null;
}

/**
 * `ocp desktop` / `ocp ui` — launch the OpenChamber native desktop app.
 * The app is a Tauri GUI and normally not on PATH, so each platform gets
 * its own probe (install dirs on Windows, `open -a` on macOS, PATH +
 * common locations on Linux).
 */
export function launchDesktop(extraArgs: string[]): number {
  if (process.platform === 'win32') {
    const exe = findWindowsDesktopExe();
    if (!exe) {
      console.error('✗ The OpenChamber desktop app was not found.');
      console.error(DESKTOP_NOT_FOUND_HINT);
      return 1;
    }
    const child = spawn(exe, extraArgs, { detached: true, stdio: 'ignore' });
    child.on('error', (err) => console.error(`✗ Failed to launch ${exe}: ${err.message}`));
    child.unref();
    return 0;
  }
  if (process.platform === 'darwin') {
    // .app bundles are not on PATH — let LaunchServices resolve it.
    const res = spawnSync('open', ['-a', 'OpenChamber', ...extraArgs], { stdio: 'inherit' });
    if (res.error || res.status !== 0) {
      console.error('✗ The OpenChamber desktop app was not found.');
      console.error(DESKTOP_NOT_FOUND_HINT);
      return 1;
    }
    return 0;
  }
  const bin = findLinuxDesktopBin();
  if (!bin) {
    console.error('✗ The OpenChamber desktop app was not found.');
    console.error(DESKTOP_NOT_FOUND_HINT);
    return 1;
  }
  const child = spawn(bin, extraArgs, { detached: true, stdio: 'ignore' });
  child.on('error', (err) => console.error(`✗ Failed to launch ${bin}: ${err.message}`));
  child.unref();
  return 0;
}
