import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InstallOptions, PreserveBag } from './types';

/**
 * Strips JSONC extensions from content and parses it into an object:
 *   - block comments (slash-star ... star-slash)
 *   - line comments starting with slash-slash
 *   - trailing commas before } or ]
 */
export function parseJsonc<T = any>(content: string): T {
  const cleaned = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(cleaned);
}

export function readJsoncFile<T = any>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return parseJsonc<T>(raw);
  } catch {
    return null;
  }
}

/**
 * Path to the user's machine-local option overrides. These are written by the
 * wizard / dashboard and merged on top of the repo-shipped defaults on every
 * install, so user choices persist across releases.
 */
export function getUserOptionsPath(targetDir: string): string {
  return path.join(targetDir, 'options.jsonc');
}

/**
 * Shallow-merge two InstallOptions objects, with `override` winning per key.
 * Nested maps (mcp, plugin, tiers) are merged key-by-key rather than replaced,
 * so enabling/disabling a single MCP or plugin does not wipe the other defaults.
 */
export function mergeUserOptions(
  base: InstallOptions,
  override: InstallOptions | null | undefined
): InstallOptions {
  if (!override) return { ...base };

  const merged: InstallOptions = { ...base };

  for (const key of Object.keys(override) as Array<keyof InstallOptions>) {
    const b = base[key];
    const o = override[key];

    if (
      key === 'mcp' ||
      key === 'plugin' ||
      key === 'tiers'
    ) {
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        merged[key] = { ...(b && typeof b === 'object' && !Array.isArray(b) ? b : {}), ...o } as any;
        continue;
      }
    }

    if (o !== undefined) {
      (merged as any)[key] = o;
    }
  }

  return merged;
}

/**
 * Formats opencode.jsonc nicely with models serialized on single lines.
 */
export function writeConfigJson(filePath: string, obj: Record<string, any>): void {
  const clone = JSON.parse(JSON.stringify(obj));
  if (clone.provider && typeof clone.provider === 'object') {
    for (const pName of Object.keys(clone.provider)) {
      const p = clone.provider[pName];
      if (p && p.models && typeof p.models === 'object') {
        for (const mName of Object.keys(p.models)) {
          // Placeholder tag to preserve inline formatting
          p.models[mName] = `__COMPACT_JSON__${JSON.stringify(p.models[mName])}__COMPACT_JSON__`;
        }
      }
    }
  }

  let text = JSON.stringify(clone, null, 2);
  // Restore inline formatting for model entries
  text = text.replace(/"__COMPACT_JSON__(.*?)__COMPACT_JSON__"/g, (_, rawJson) => {
    const unescaped = rawJson.replace(/\\"/g, '"');
    return unescaped
      .replace(/,"/g, ', "')
      .replace(/":/g, '": ')
      .replace(/\{/g, '{ ')
      .replace(/\}/g, ' }');
  });

  fs.writeFileSync(filePath, text + '\n', 'utf8');
}

export function readTierMap(dir: string): Record<string, string> {
  const map: Record<string, string> = {};
  const tiersFile = path.join(dir, 'tiers.json');
  const obj = readJsoncFile<Record<string, string>>(tiersFile);
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (!k.startsWith('$') && typeof v === 'string') {
        map[k] = v;
      }
    }
  }
  return map;
}

export function readProfilesPreserve(targetDir: string): Record<string, string> {
  const pdir = path.join(targetDir, 'profiles');
  const saved: Record<string, string> = {};
  if (!fs.existsSync(pdir)) return saved;

  // Walk recursively so profiles grouped in subdirectories (e.g.
  // profiles/opencode-go/deepseek.json) are preserved too. Keys are
  // subdir-relative paths with "/" separators.
  const walk = (dir: string, prefix: string): void => {
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.name.endsWith('.json')) {
        try {
          saved[rel] = fs.readFileSync(full, 'utf8');
        } catch {}
      }
    }
  };
  walk(pdir, '');
  return saved;
}

export function restoreProfilesPreserve(targetDir: string, saved: Record<string, string>): number {
  if (!saved || Object.keys(saved).length === 0) return 0;
  const pdir = path.join(targetDir, 'profiles');
  if (!fs.existsSync(pdir)) {
    fs.mkdirSync(pdir, { recursive: true });
  }

  let restoredCount = 0;
  for (const [name, content] of Object.entries(saved)) {
    const targetFile = path.join(pdir, ...name.split('/'));
    if (!fs.existsSync(targetFile)) {
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, content, 'utf8');
      restoredCount++;
    }
  }
  return restoredCount;
}

export function extractPreserveBag(targetDir: string): PreserveBag {
  const configPath = path.join(targetDir, 'opencode.jsonc');
  const bag: PreserveBag = {
    profiles: readProfilesPreserve(targetDir),
    userAgents: {},
    userModels: {},
    userEnv: {},
    userTiers: readTierMap(targetDir),
  };

  const existingConfig = readJsoncFile<Record<string, any>>(configPath);
  if (!existingConfig) return bag;

  if (existingConfig.agent && typeof existingConfig.agent === 'object') {
    // Captured verbatim; mergeConfig filters out factory agents so template
    // upgrades propagate — only agents absent from the template stick.
    bag.userAgents = existingConfig.agent;
  }
  if (existingConfig.provider && typeof existingConfig.provider === 'object') {
    bag.userModels = existingConfig.provider;
  }
  if (existingConfig.env && typeof existingConfig.env === 'object') {
    bag.userEnv = existingConfig.env;
  }

  return bag;
}

const VALID_TIERS = new Set(['flash', 'standard', 'pro', 'max', 'vision']);

function normalizeTier(tier: string, fallback: string): string {
  return VALID_TIERS.has(tier) ? tier : fallback;
}

/**
 * Merges repo templates tiers.json with custom user tiers and writes to target
 */
export function mergeTiersJson(
  repoDir: string,
  targetDir: string,
  customTiers?: Record<string, string>,
  preservedTiers?: Record<string, string>,
  removedAgents?: string[]
): void {
  const templatePath = path.join(repoDir, 'tiers.json');
  const targetPath = path.join(targetDir, 'tiers.json');

  const baseMap: Record<string, any> = readJsoncFile<Record<string, any>>(templatePath) || {};
  const comment = baseMap.$comment || 'Agent-to-tier mapping consumed by /profile wizard';

  // Merge template tiers -> preserved user tiers -> explicit custom options tiers
  const effectiveTiers: Record<string, string> = {};
  for (const [k, v] of Object.entries(baseMap)) {
    if (!k.startsWith('$') && typeof v === 'string') {
      effectiveTiers[k] = v;
    }
  }

  if (preservedTiers) {
    for (const [k, v] of Object.entries(preservedTiers)) {
      if (removedAgents?.includes(k)) continue;
      if (typeof v === 'string') {
        effectiveTiers[k] = normalizeTier(v, effectiveTiers[k] || 'standard');
      }
    }
  }

  if (customTiers) {
    for (const [k, v] of Object.entries(customTiers)) {
      if (typeof v === 'string') {
        effectiveTiers[k] = normalizeTier(v, effectiveTiers[k] || 'standard');
      }
    }
  }

  const result: Record<string, any> = {
    $comment: comment,
    ...effectiveTiers,
  };

  fs.writeFileSync(targetPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
}

/**
 * Merges the repo's tui.template.jsonc with the user's existing tui.jsonc
 * (if any) and writes the result to the target tui.jsonc.
 *
 * Merge rules:
 *   - `plugin[]` is the union of template + existing, deduped by string path,
 *     template-first so OCP plugins keep their canonical order.
 *   - Scalar fields (display_thinking, theme, keybinds, ...) win for the
 *     existing target where present, and fall back to template defaults.
 *   - `$schema` always comes from the template (it's a pointer, not user state).
 *
 * First install (no existing target): writes the template directly.
 */
export function mergeTuiConfig(repoDir: string, targetDir: string): void {
  const templatePath = path.join(repoDir, 'tui.template.jsonc');
  const targetPath = path.join(targetDir, 'tui.jsonc');

  const template = readJsoncFile<Record<string, any>>(templatePath);
  if (!template || Object.keys(template).length === 0) {
    // No template — nothing to seed; leave target alone (or absent).
    return;
  }

  const existing = fs.existsSync(targetPath)
    ? readJsoncFile<Record<string, any>>(targetPath) || {}
    : {};

  // Plugin union: template-first, then any user-added plugins not already
  // present. Filter to strings only so a malformed existing file can't
  // crash the merge with a non-array.
  const templatePlugins = Array.isArray(template.plugin)
    ? template.plugin.filter((p) => typeof p === 'string')
    : [];
  const existingPlugins = Array.isArray(existing.plugin)
    ? existing.plugin.filter((p) => typeof p === 'string')
    : [];
  const seen = new Set(templatePlugins);
  const mergedPlugins = [
    ...templatePlugins,
    ...existingPlugins.filter((p) => !seen.has(p)),
  ];

  // Scalar fields: existing wins, template fills gaps. `$schema` is
  // special — always template (just a URL pointer, not user state).
  const merged: Record<string, any> = {
    ...template,
    ...existing,
    plugin: mergedPlugins,
  };
  delete merged.$schema;
  merged.$schema = template.$schema;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}

/**
 * Merges the repo's opencode.template.jsonc, preserve bag, and options.jsonc,
 * then writes the result to the target opencode.jsonc
 */
export function mergeConfig(
  repoDir: string,
  targetDir: string,
  options: InstallOptions,
  bag?: PreserveBag
): void {
  const templatePath = path.join(repoDir, 'opencode.template.jsonc');
  const targetConfigPath = path.join(targetDir, 'opencode.jsonc');

  // Hard-fail on a missing or unparseable template: readJsoncFile returns
  // null on read/parse errors, and a `|| {}` fallback here would silently
  // overwrite the user's installed config with an empty merge.
  const config = readJsoncFile<Record<string, any>>(templatePath);
  if (!config || Object.keys(config).length === 0) {
    throw new Error(`Config template missing or unreadable: ${templatePath} — refusing to overwrite the target config with an empty merge`);
  }

  // Retirement list of deleted factory agents (installer-only metadata — must
  // not leak into the merged output; opencode forwards unknown keys to the
  // provider as model options). Without it, agents removed from the template
  // survive upgrades because step 4 below misreads them as user-defined.
  const removedAgents = Array.isArray(config.removed_agents)
    ? config.removed_agents.filter((n: any) => typeof n === 'string')
    : [];
  delete config.removed_agents;

  // 0. Merge tiers.json
  mergeTiersJson(repoDir, targetDir, options.tiers, bag?.userTiers, removedAgents);

  // 1. Merge preserved user profiles
  if (bag?.profiles) {
    restoreProfilesPreserve(targetDir, bag.profiles);
  }

  // 2. Merge preserved user-defined env vars.
  // Note: `instructions` is NOT preserved — it always takes the template
  // value so L0 disclosure-layer upgrades propagate on every install. Personal
  // rules belong in the project's AGENTS.md (opencode's native path).
  if (bag?.userEnv && Object.keys(bag.userEnv).length > 0) {
    config.env = { ...(config.env || {}), ...bag.userEnv };
  }

// 3. Merge preserved user custom providers/models. Shipped providers live in
  // `providers/*.json` as standalone preset files opencode loads natively; the
  // template does not inline a provider block anymore. Anything the user
  // wrote into `opencode.jsonc.provider` is preserved verbatim — additions,
  // edits, and deletions all stick.
  if (bag?.userModels && Object.keys(bag.userModels).length > 0) {
    config.provider = { ...(config.provider || {}), ...bag.userModels };
  }

  // 4. Merge preserved user custom agents. Factory agents (present in the
  // template) always follow the template so prompt/model/description upgrades
  // reach existing installs; only agents absent from the template are treated
  // as user-defined and preserved verbatim — except retired factory agents
  // (removed_agents), which are dropped so deletions propagate on upgrade.
  if (bag?.userAgents && Object.keys(bag.userAgents).length > 0) {
    const templateAgents = config.agent && typeof config.agent === 'object' ? config.agent : {};
    const customAgents: Record<string, any> = {};
    for (const [agentName, agentDef] of Object.entries(bag.userAgents)) {
      if (removedAgents.includes(agentName)) continue;
      if (!(agentName in templateAgents)) customAgents[agentName] = agentDef;
    }
    if (Object.keys(customAgents).length > 0) {
      config.agent = { ...templateAgents, ...customAgents };
    }
  }

  // 5. Apply default_agent from options
  if (options.default_agent) {
    if (config.agent && options.default_agent in config.agent) {
      config.default_agent = options.default_agent;
    } else {
      console.warn(
        `[options] unknown default_agent "${options.default_agent}"; keeping template value "${config.default_agent || 'code'}"`
      );
    }
  }

  // 6. Apply MCP servers toggle
  if (options.mcp && config.mcp && typeof config.mcp === 'object') {
    for (const [mcpName, enabled] of Object.entries(options.mcp)) {
      if (mcpName in config.mcp && typeof config.mcp[mcpName] === 'object') {
        config.mcp[mcpName].enabled = Boolean(enabled);
      }
    }
  }

  // 7. Apply npm plugins list
  if (options.plugin && typeof options.plugin === 'object') {
    const activePlugins: string[] = [];
    for (const [pluginName, enabled] of Object.entries(options.plugin)) {
      if (enabled) {
        activePlugins.push(pluginName);
      }
    }
    config.plugin = activePlugins;
  }

  // 8. Apply RTK option
  if (options.tools?.rtk === false) {
    // If RTK is disabled, remove openrtk bundled plugin references if any
    const rtkPluginPath = path.join(targetDir, 'plugins', 'openrtk.ts');
    const rtkPluginDir = path.join(targetDir, 'plugins', 'openrtk');
    if (fs.existsSync(rtkPluginPath)) fs.rmSync(rtkPluginPath, { force: true });
    if (fs.existsSync(rtkPluginDir)) fs.rmSync(rtkPluginDir, { recursive: true, force: true });
  }

  writeConfigJson(targetConfigPath, config);
}
