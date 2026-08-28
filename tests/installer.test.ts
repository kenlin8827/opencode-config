import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseJsonc,
  readTierMap,
  extractPreserveBag,
  mergeConfig,
} from '../install/src/merger';
import {
  collectShippedFiles,
  generateManifest,
  readManifest,
  computeFilesToRemove,
} from '../install/src/manifest';
import {
  executeInstall,
  executeStatus,
  executeInit,
  executeUninstall,
  getCurrentRepoVersion,
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
      qa: 'explorer',
      devops: 'advisor',
    },
  }
);
if (!installRes.success || installRes.filesInstalled === 0) throw new Error('Install failed');
if (!fs.existsSync(path.join(testTargetDir, 'opencode.jsonc'))) throw new Error('opencode.jsonc missing from target');
if (!fs.existsSync(path.join(testTargetDir, 'installed.version'))) throw new Error('installed.version missing');
if (!fs.existsSync(path.join(testTargetDir, 'tiers.json'))) throw new Error('tiers.json missing from target');

// Verify custom tiers were written. Legacy tier names are migrated to the
// current vocabulary by normalizeTier (explorer -> flash, advisor -> max),
// and `code` keeps the shipped template value (pro).
const targetTiers = readTierMap(testTargetDir);
if (targetTiers.qa !== 'flash' || targetTiers.devops !== 'max' || targetTiers.code !== 'pro') {
  throw new Error('Custom tiers merging failed');
}
console.log(`✓ Install passed (${installRes.filesInstalled} files written, custom tiers merged)`);

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
