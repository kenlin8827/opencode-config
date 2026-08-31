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
 *
 * Merge semantics (user-wins, add-missing-only):
 *   - Target absent, or `force = true` → write the template verbatim.
 *   - Target exists → append only the template keys missing from the user's
 *     file, never overwriting an existing key. Ships new defaults to existing
 *     installs while preserving every user edit (including comments).
 *   - Either file unparseable → leave the user's file untouched.
 *
 * Returns `{ action, message }` so the caller (install flow or the
 * `ocp herdr-config install` subcommand) can report the outcome.
 */
export function deployHerdrConfig(repoDir: string, force: boolean): {
  action: 'installed' | 'merged' | 'uptodate' | 'skipped' | 'failed';
  message: string;
} {
  const src = path.join(repoDir, HERDR_CONFIG_TEMPLATE);
  if (!fs.existsSync(src)) {
    return { action: 'failed', message: `bundled config template not found: ${src}` };
  }

  const dest = herdrUserConfigPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (!fs.existsSync(dest) || force) {
    fs.copyFileSync(src, dest);
    return {
      action: 'installed',
      message:
        `Installed herdr config to ${dest}` +
        (force ? ' (overwrote existing file because --force was set)' : ''),
    };
  }

  // Merge path: parse both files, then append only the template keys the
  // user's file is missing. The user's existing text stays byte-for-byte.
  let template: Record<string, any>;
  let existing: Record<string, any>;
  try {
    template = Bun.TOML.parse(fs.readFileSync(src, 'utf8')) as Record<string, any>;
    existing = Bun.TOML.parse(fs.readFileSync(dest, 'utf8')) as Record<string, any>;
  } catch (err) {
    return {
      action: 'skipped',
      message: `herdr config at ${dest} left untouched — couldn't parse for merge (${(err as Error).message}). Use --force to overwrite.`,
    };
  }

  const missing = collectMissingKeys(template, collectKeys(existing));
  if (missing.length === 0) {
    return { action: 'uptodate', message: `herdr config at ${dest} is up to date with the bundled defaults` };
  }

  fs.appendFileSync(dest, renderMissing(missing));
  return {
    action: 'merged',
    message: `merged ${missing.length} new default key(s) into ${dest}`,
  };
}

/** Dotted-path leaf keys of a parsed TOML object (tables → recurse, leaves → keys). */
function collectKeys(obj: Record<string, any>): Set<string> {
  const keys = new Set<string>();
  const walk = (o: Record<string, any>, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (isTable(v)) walk(v, full);
      else keys.add(full);
    }
  };
  walk(obj, '');
  return keys;
}

/** Template leaf keys absent from `userKeys`, in template order (stable output). */
function collectMissingKeys(
  template: Record<string, any>,
  userKeys: Set<string>
): Array<{ section: string; key: string; value: string }> {
  const out: Array<{ section: string; key: string; value: string }> = [];
  const walk = (o: Record<string, any>, section: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (isTable(v)) {
        walk(v, section ? `${section}.${k}` : k);
      } else if (!userKeys.has(section ? `${section}.${k}` : k)) {
        out.push({ section, key: k, value: tomlValue(v) });
      }
    }
  };
  walk(template, '');
  return out;
}

function isTable(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Serialize a parsed TOML leaf value back to TOML text (string/bool/number/array). */
function tomlValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every((e) => Array.isArray(e))) {
      return '[\n  ' + v.map((row) => `[${(row as unknown[]).map((x) => JSON.stringify(x)).join(', ')}]`).join(',\n  ') + ',\n]';
    }
    return `[${v.map((x) => (typeof x === 'string' ? JSON.stringify(x) : String(x))).join(', ')}]`;
  }
  return JSON.stringify(String(v));
}

/** Render appended keys as a TOML block, re-opening section headers as needed. */
function renderMissing(missing: Array<{ section: string; key: string; value: string }>): string {
  const lines: string[] = ['# Added by opencode-prime installer — defaults missing from your file'];
  let lastSection: string | null = null;
  for (const { section, key, value } of missing) {
    if (section && section !== lastSection) {
      lines.push(`[${section}]`);
      lastSection = section;
    }
    lines.push(`${key} = ${value}`);
  }
  return `\n${lines.join('\n')}\n`;
}
