// models-cost — install / status / path helpers for the bundled
// `install/models-cost.jsonc` template.
//
// Mirrors the herdr-config deployer: copy-if-missing so the user's local
// edits to coding-plan rates survive an upgrade. `--force` overwrites.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Path to the bundled cost template inside the repo. */
export const MODELS_COST_TEMPLATE = 'install/models-cost.jsonc';

/** Default install location (XDG_CONFIG_HOME-aware). */
export function modelsCostUserPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base =
    xdg ??
    (process.platform === 'win32'
      ? path.join(process.env.USERPROFILE ?? os.homedir(), '.config')
      : path.join(os.homedir(), '.config'));
  return path.join(base, 'opencode', 'models', 'cost.jsonc');
}

export function deployModelsCost(repoDir: string, force: boolean): {
  action: 'installed' | 'uptodate' | 'skipped' | 'failed';
  message: string;
} {
  const src = path.join(repoDir, MODELS_COST_TEMPLATE);
  if (!fs.existsSync(src)) {
    return { action: 'failed', message: `bundled cost template not found: ${src}` };
  }

  const dest = modelsCostUserPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (!fs.existsSync(dest) || force) {
    fs.copyFileSync(src, dest);
    return {
      action: 'installed',
      message:
        `${fs.existsSync(dest) && force ? 'Overwrote' : 'Installed'} OCP coding-plan rates at ${dest}` +
        (force ? ' (force)' : ''),
    };
  }

  return {
    action: 'uptodate',
    message: `OCP coding-plan rates already present at ${dest} (kept your local edits — pass --force to overwrite)`,
  };
}