import fs from 'node:fs';
import path from 'node:path';
import { InstallOptions, PreserveBag } from './types';

/**
 * Strips comments from JSONC content and parses it into an object.
 */
export function parseJsonc<T = any>(content: string): T {
  // Strip block comments /* ... */ and single-line comments // ...
  const cleaned = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
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

  const entries = fs.readdirSync(pdir);
  for (const entry of entries) {
    if (entry.endsWith('.json')) {
      try {
        const fullPath = path.join(pdir, entry);
        saved[entry] = fs.readFileSync(fullPath, 'utf8');
      } catch {}
    }
  }
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
    const targetFile = path.join(pdir, name);
    if (!fs.existsSync(targetFile)) {
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
const LEGACY_TIER_MIGRATION: Record<string, string> = {
  default: 'standard',
  code: 'pro',
  advisor: 'max',
  explorer: 'flash',
  vision: 'vision',
};

function normalizeTier(tier: string, fallback: string): string {
  if (VALID_TIERS.has(tier)) return tier;
  if (LEGACY_TIER_MIGRATION[tier]) return LEGACY_TIER_MIGRATION[tier];
  return fallback;
}

/**
 * Merges repo templates tiers.json with custom user tiers and writes to target
 */
export function mergeTiersJson(
  repoDir: string,
  targetDir: string,
  customTiers?: Record<string, string>,
  preservedTiers?: Record<string, string>
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
 * Merges repo templates, preserve bag, options.jsonc, and writes to target opencode.jsonc
 */
export function mergeConfig(
  repoDir: string,
  targetDir: string,
  options: InstallOptions,
  bag?: PreserveBag
): void {
  const templatePath = path.join(repoDir, 'opencode.jsonc');
  const targetConfigPath = path.join(targetDir, 'opencode.jsonc');

  const config = readJsoncFile<Record<string, any>>(templatePath) || {};

  // 0. Merge tiers.json
  mergeTiersJson(repoDir, targetDir, options.tiers, bag?.userTiers);

  // 1. Merge preserved user profiles
  if (bag?.profiles) {
    restoreProfilesPreserve(targetDir, bag.profiles);
  }

  // 2. Merge preserved user-defined env vars
  if (bag?.userEnv && Object.keys(bag.userEnv).length > 0) {
    config.env = { ...(config.env || {}), ...bag.userEnv };
  }

  // 3. Merge preserved user custom providers/models
  if (bag?.userModels && Object.keys(bag.userModels).length > 0) {
    config.provider = { ...(config.provider || {}), ...bag.userModels };
  }

  // 4. Merge preserved user custom agents
  if (bag?.userAgents && Object.keys(bag.userAgents).length > 0) {
    config.agent = { ...(config.agent || {}), ...bag.userAgents };
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
  if (options.rtk === false) {
    // If RTK is disabled, remove openrtk bundled plugin references if any
    const rtkPluginPath = path.join(targetDir, 'plugins', 'openrtk.ts');
    const rtkPluginDir = path.join(targetDir, 'plugins', 'openrtk');
    if (fs.existsSync(rtkPluginPath)) fs.rmSync(rtkPluginPath, { force: true });
    if (fs.existsSync(rtkPluginDir)) fs.rmSync(rtkPluginDir, { recursive: true, force: true });
  }

  writeConfigJson(targetConfigPath, config);
}
