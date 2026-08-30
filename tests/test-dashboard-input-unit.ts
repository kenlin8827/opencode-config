import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTuiDashboard } from '../install/src/dashboard';

const repoDir = path.resolve(__dirname, '..');

class FakeStdin extends EventEmitter {
  isTTY = true;
  pauseCount = 0;
  resumeCount = 0;
  rawModes: boolean[] = [];

  setRawMode(enabled: boolean) {
    this.rawModes.push(enabled);
    return this;
  }

  resume() {
    this.resumeCount++;
    return this;
  }

  pause() {
    this.pauseCount++;
    return this;
  }
}

class FakeStdout extends EventEmitter {
  columns = 120;
  write() {
    return true;
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function withFakeTerminal<T>(fn: (stdin: FakeStdin) => Promise<T>): Promise<T> {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const oldStdin = process.stdin;
  const oldStdout = process.stdout;
  const oldTarget = process.env.OPENCODE_CONFIG_DIR;
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocp-dashboard-input-'));

  fs.writeFileSync(path.join(targetDir, 'installed.version'), fs.readFileSync(path.join(repoDir, 'install', 'VERSION'), 'utf8'));
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
  Object.defineProperty(process, 'stdout', { value: stdout, configurable: true });
  process.env.OPENCODE_CONFIG_DIR = targetDir;

  try {
    return await fn(stdin);
  } finally {
    Object.defineProperty(process, 'stdin', { value: oldStdin, configurable: true });
    Object.defineProperty(process, 'stdout', { value: oldStdout, configurable: true });
    if (oldTarget === undefined) delete process.env.OPENCODE_CONFIG_DIR;
    else process.env.OPENCODE_CONFIG_DIR = oldTarget;
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

await withFakeTerminal(async (stdin) => {
  const first = runTuiDashboard(repoDir, 'zh-CN', true);
  assert(stdin.listenerCount('keypress') === 0, 'dashboard should not install a readline keypress listener');
  assert(stdin.listenerCount('data') === 1, 'dashboard should listen for raw data input');
  stdin.emit('data', '\x1b');
  assert((await first).action === 'back', 'Esc returns to the wizard main menu');
  assert(stdin.listenerCount('data') === 0, 'dashboard removes its data listener on back');
  assert(stdin.pauseCount === 0, 'dashboard keeps stdin open when returning to the wizard main menu');

  const second = runTuiDashboard(repoDir, 'zh-CN', true);
  stdin.emit('data', '\x1b[B');
  stdin.emit('data', 'q');
  assert((await second).action === 'exit', 'dashboard remains responsive after re-entering from the main menu');
});

console.log('✓ dashboard raw input remains responsive after Esc back + re-enter');
