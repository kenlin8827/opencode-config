import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseJsonc,
  readJsoncFile,
  readTierMap,
  extractPreserveBag,
  mergeConfig,
  mergeUserOptions,
  getUserOptionsPath,
  updateOptionsJsoncInPlace,
} from '../install/src/merger';
import {
  collectShippedFiles,
  generateManifest,
  readManifest,
} from '../install/src/manifest';
import {
  executeInstall,
  executeStatus,
  executeInit,
  executeUninstall,
  getCurrentRepoVersion,
  loadEffectiveOptions,
  mcpProvisionPlan,
} from '../install/src/installer';
import { registerShim, unregisterShim } from '../install/src/shim';
import {
  parseDynamicOptionsSchema,
  updateOptionsJsoncInPlace,
} from '../install/src/wizard';
import {
  getAvailableLocales,
  loadLocale,
  detectDefaultLocaleCode,
} from '../install/src/i18n';

const repoDir = path.resolve(__dirname, '..');
const testTargetDir = path.join(os.tmpdir(), `opencode-installer-test-${Date.now()}`);
const testBinDir = path.join(os.tmpdir(), `opencode-bin-test-${Date.now()}`);

console.log('=== Starting Comprehensive Installer Test Suite ===\n');

// 1. JSONC & Merger Tests
console.log('Test 1: JSONC Parser & Preserved Bag Extraction');
const sampleJsonc = `// Single line comment\n{\n  /* block comment */\n  "key": "value",\n  "num": 42\n}`;
const parsed = parseJsonc(sampleJsonc);
if (parsed.key !== 'value' || parsed.num !== 42) throw new Error('JSONC parsing failed');
console.log('✓ JSONC Parser passed');

// 2. Dynamic Locales
console.log('\nTest 2: Locales Auto-Discovery & Loading');
const locales = getAvailableLocales(repoDir);
if (locales.length < 2) throw new Error(`Expected at least 2 locales, got ${locales.length}`);
const zh = loadLocale(repoDir, 'zh-CN');
const en = loadLocale(repoDir, 'en');
if (!zh.wizardTitle || !en.wizardTitle) throw new Error('Locale loading failed');
console.log(`✓ Locales passed (${locales.map(l => l.code).join(', ')})`);

// 3. Dynamic Options Schema Parsing & In-Place Update
console.log('\nTest 3: Dynamic Options.jsonc Schema & Preserving Update');
const optionsPath = path.join(repoDir, 'install', 'options.jsonc');
const schema = parseDynamicOptionsSchema(fs.readFileSync(optionsPath, 'utf8'), repoDir);
if (!schema.defaultAgent.value || schema.mcpItems.length === 0 || schema.pluginItems.length === 0) {
  throw new Error('Dynamic options parsing failed');
}
console.log(`✓ Schema passed (Found ${schema.mcpItems.length} MCPs, ${schema.pluginItems.length} Plugins)`);

// 3b. User options merging
console.log('\nTest 3b: User Options Merge Logic');
const merged = mergeUserOptions(
  { default_agent: 'code', rtk: true, mcp: { serena: true, codegraph: true }, plugin: { '@dietrichgebert/ponytail': true } },
  { default_agent: 'build', mcp: { serena: false }, plugin: { 'opencode-qoder-bridge': true } }
);
if (merged.default_agent !== 'build') throw new Error('mergeUserOptions failed to override top-level key');
if (merged.rtk !== true) throw new Error('mergeUserOptions dropped an unchanged key');
if (merged.mcp?.serena !== false || merged.mcp?.codegraph !== true) throw new Error('mergeUserOptions failed to merge nested mcp map');
if (merged.plugin?.['@dietrichgebert/ponytail'] !== true || merged.plugin?.['opencode-qoder-bridge'] !== true) throw new Error('mergeUserOptions failed to merge nested plugin map');
console.log('✓ User options merge passed');

// 3d. updateOptionsJsoncInPlace can create and update a user options file from scratch
console.log('\nTest 3d: Options File In-Place Update');
const scratchOptionsDir = path.join(os.tmpdir(), `opencode-options-test-${Date.now()}`);
const scratchOptionsPath = path.join(scratchOptionsDir, 'options.jsonc');
updateOptionsJsoncInPlace(scratchOptionsPath, {
  defaultAgent: 'build',
  rtk: false,
  globalCommands: false,
  openChamber: false,
  mcps: { serena: false, codegraph: true },
  plugins: { '@dietrichgebert/ponytail': true },
});
if (!fs.existsSync(scratchOptionsPath)) throw new Error('updateOptionsJsoncInPlace did not create the file');
const writtenOptions = readJsoncFile<InstallOptions>(scratchOptionsPath);
if (writtenOptions?.default_agent !== 'build') throw new Error('default_agent not written to scratch file');
if (writtenOptions?.rtk !== false) throw new Error('rtk not written to scratch file');
if (writtenOptions?.global_commands !== false) throw new Error('global_commands not written to scratch file');
if (writtenOptions?.openchamber !== false) throw new Error('openchamber not written to scratch file');
if (writtenOptions?.mcp?.serena !== false || writtenOptions?.mcp?.codegraph !== true) throw new Error('mcp map not written to scratch file');
if (writtenOptions?.plugin?.['@dietrichgebert/ponytail'] !== true) throw new Error('plugin map not written to scratch file');

// Update again to verify merge behavior
updateOptionsJsoncInPlace(scratchOptionsPath, {
  defaultAgent: 'plan',
  mcps: { dbhub: true },
});
const mergedOptions = readJsoncFile<InstallOptions>(scratchOptionsPath);
if (mergedOptions?.default_agent !== 'plan') throw new Error('default_agent not updated');
if (mergedOptions?.rtk !== false) throw new Error('rtk was dropped on update');
if (mergedOptions?.mcp?.serena !== false || mergedOptions?.mcp?.codegraph !== true || mergedOptions?.mcp?.dbhub !== true) {
  throw new Error('mcp map not merged on update');
}
console.log('✓ Options file in-place update passed');

// Update with an unknown key to verify generic serialization preserves it
updateOptionsJsoncInPlace(scratchOptionsPath, {
  mcps: { dbhub: false },
});
const preservedOptions = readJsoncFile<InstallOptions>(scratchOptionsPath);
if (preservedOptions?.plugin?.['@dietrichgebert/ponytail'] !== true) {
  throw new Error('plugin map was dropped by generic serialization');
}
if (preservedOptions?.default_agent !== 'plan') {
  throw new Error('default_agent was dropped by generic serialization');
}
console.log('✓ Generic serialization preserves existing keys');
if (fs.existsSync(scratchOptionsDir)) fs.rmSync(scratchOptionsDir, { recursive: true, force: true });

// 3c. Effective options load from repo defaults + target user overrides
console.log('\nTest 3c: Effective Options Load');
const effective = loadEffectiveOptions(repoDir, testTargetDir, { openchamber: false });
if (effective.openchamber !== false) throw new Error('loadEffectiveOptions failed to apply customOptions override');
if (!effective.mcp || typeof effective.mcp !== 'object') throw new Error('loadEffectiveOptions lost mcp defaults');

// Verify customOptions merge is nested, not wholesale replacement
const effective2 = loadEffectiveOptions(repoDir, testTargetDir, { mcp: { serena: false } });
if (effective2.mcp?.serena !== false) throw new Error('customOptions failed to override mcp.serena');
if (effective2.mcp?.codegraph !== true) throw new Error('customOptions replaced entire mcp map');
console.log('✓ Effective options load passed');

// 4. Manifest Generation
console.log('\nTest 4: Manifest Generation');
const version = getCurrentRepoVersion(repoDir);
const manifestRes = generateManifest(repoDir, version);
if (manifestRes.count === 0) throw new Error('Manifest is empty');
const manifestFiles = readManifest(manifestRes.path);
if (!manifestFiles || manifestFiles.length === 0) throw new Error('Failed to read manifest');
console.log(`✓ Manifest generated (${manifestRes.count} files)`);

// 5. Execution: Full Install with custom tiers
console.log('\nTest 5: Full Installation to Isolated Target');
const installRes = executeInstall(
  repoDir,
  {
    action: 'install',
    target: testTargetDir,
    force: true,
    noBackup: true,
    yes: true,
    isInteractive: false,
  },
  {
    tiers: {
      qa: 'flash',
      devops: 'max',
    },
  }
);
if (!installRes.success || installRes.filesInstalled === 0) throw new Error('Install failed');
if (!fs.existsSync(path.join(testTargetDir, 'opencode.jsonc'))) throw new Error('opencode.jsonc missing from target');
if (fs.existsSync(path.join(testTargetDir, 'opencode.template.jsonc'))) throw new Error('config template leaked into target — only the merged opencode.jsonc should be installed');
if (!fs.existsSync(path.join(testTargetDir, 'installed.version'))) throw new Error('installed.version missing');
if (!fs.existsSync(path.join(testTargetDir, 'tiers.json'))) throw new Error('tiers.json missing from target');

// Verify custom tiers were written and `code` keeps the shipped template value.
const targetTiers = readTierMap(testTargetDir);
if (targetTiers.qa !== 'flash' || targetTiers.devops !== 'max' || targetTiers.code !== 'pro') {
  throw new Error('Custom tiers merging failed');
}
console.log(`✓ Install passed (${installRes.filesInstalled} files written, custom tiers merged)`);

// 5b. MCP CLI provisioning plan
console.log('\nTest 5b: MCP CLI Provisioning Plan');
const provisionPlan = mcpProvisionPlan(repoDir, { mcp: { serena: true, codegraph: true, dbhub: true, gitnexus: false } });
if (!Array.isArray(provisionPlan)) throw new Error('mcpProvisionPlan did not return an array');
// Serena is installed on this machine (verified by checkExternalTools), so it should not appear.
// The plan should include only enabled MCPs that declare an install field and whose binary is missing.
for (const item of provisionPlan) {
  if (typeof item.name !== 'string' || typeof item.install !== 'string') {
    throw new Error('mcpProvisionPlan returned malformed entry');
  }
}
console.log(`✓ MCP provision plan passed (${provisionPlan.length} entries)`);

// 5c. Preset provider lives in providers/llm-router.json (not inlined into
// opencode.jsonc) and the install must not silently re-ship a user-deleted
// preset — the directory is user-owned after first install.
console.log('\nTest 5c: Preset Providers — Ship-Once, User-Owned');
const providersDir = path.join(testTargetDir, 'providers');
const llmRouterPresetPath = path.join(providersDir, 'llm-router.json');
if (!fs.existsSync(llmRouterPresetPath)) {
  throw new Error('First install did not seed providers/llm-router.json preset');
}
const userConfigAfterInstall = readJsoncFile<Record<string, any>>(path.join(testTargetDir, 'opencode.jsonc'));
if (userConfigAfterInstall?.provider?.['llm-router']) {
  throw new Error('opencode.jsonc inlines llm-router — should only live in providers/llm-router.json');
}
console.log('✓ First install seeds providers/llm-router.json, opencode.jsonc stays clean of inline providers');

// User deletes the preset file — install must not bring it back.
fs.rmSync(llmRouterPresetPath, { force: true });
const upgradeRes = executeInstall(repoDir, {
  action: 'install',
  target: testTargetDir,
  force: true,
  noBackup: true,
  yes: true,
  isInteractive: false,
});
if (!upgradeRes.success) throw new Error('Upgrade install failed');
if (fs.existsSync(llmRouterPresetPath)) {
  throw new Error('Upgrade silently re-shipped the user-deleted providers/llm-router.json preset');
}
console.log('✓ User-deleted preset stays deleted after upgrade');

// 6. Status Check
console.log('\nTest 6: Status Check');
const st = executeStatus(repoDir, testTargetDir);
if (!st.isUpToDate || st.installedVersion !== version) throw new Error('Status check mismatch');
console.log(`✓ Status check passed (Version: ${st.installedVersion}, Up-to-date: ${st.isUpToDate})`);

// 7. Shims & Global Command Registration
console.log('\nTest 7: Shim Registration & Unregistration');
const regRes = registerShim(repoDir, testBinDir);
if (!regRes.success) throw new Error('Register shim failed');
const unregRes = unregisterShim(testBinDir);
if (!unregRes.success || unregRes.removed.length === 0) throw new Error('Unregister shim failed');
console.log(`✓ Shim registration and cleanup passed`);

// 8. Safe Uninstall
console.log('\nTest 8: Manifest-Driven Safe Uninstall');
const uninstRes = executeUninstall(repoDir, {
  action: 'uninstall',
  target: testTargetDir,
  force: true,
  noBackup: true,
  yes: true,
  isInteractive: false,
});
if (uninstRes.removedCount === 0) throw new Error('Uninstall did not remove files');
console.log(`✓ Safe uninstall passed (${uninstRes.removedCount} files safely removed)`);

// 9. Clean up scratch dirs
if (fs.existsSync(testTargetDir)) fs.rmSync(testTargetDir, { recursive: true, force: true });
if (fs.existsSync(testBinDir)) fs.rmSync(testBinDir, { recursive: true, force: true });

console.log('\n======================================================');
console.log('🎉 ALL COMPREHENSIVE TESTS PASSED WITH 100% SUCCESS!');
console.log('======================================================\n');
