// herdr-config — install / status / path helpers for the bundled
// herdr config template in install/herdr-config/config.toml.
//
// Extracted as a module so `ocp install` (the installer) AND `ocp herdr-config
// install` (the standalone subcommand) can both deploy the template
// without re-implementing the logic.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Path to the bundled herdr config template. */
export const HERDR_CONFIG_TEMPLATE = 'install/herdr-config/config.toml';

/** Default herdr config path on each platform (XDG_CONFIG_HOME-aware). */
export function herdrUserConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, 'herdr', 'config.toml');
  if (process.platform === 'win32') {
    return path.join(process.env.USERPROFILE ?? os.homedir(), '.config', 'herdr', 'config.toml');
  }
  return path.join(os.homedir(), '.config', 'herdr', 'config.toml');
}

/**
 * Deploy the bundled herdr config to the user's herdr config dir.
 * Non-destructive by default: if the target already exists, the existing file
 * is left untouched. Pass `force = true` to overwrite.
 *
 * Returns `{ action: 'installed' | 'reused' | 'skipped' | 'failed', ... }`
 * so the caller (install flow or subcommand) can report the outcome.
 */
export function deployHerdrConfig(repoDir: string, force: boolean): {
  action: 'installed' | 'skipped' | 'failed';
  message: string;
} {
  const src = path.join(repoDir, HERDR_CONFIG_TEMPLATE);
  if (!fs.existsSync(src)) {
    return { action: 'failed', message: `bundled config template not found: ${src}` };
  }

  const dest = herdrUserConfigPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (fs.existsSync(dest) && !force) {
    return { action: 'skipped', message: `herdr config already exists at ${dest} — left untouched (pass --force to overwrite)` };
  }

  fs.copyFileSync(src, dest);
  return {
    action: 'installed',
    message: `Installed herdr config to ${dest}` + (force ? ' (overwrote existing file because --force was set)' : ''),
  };
}
