import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractPreserveBag, mergeConfig, readJsoncFile } from '../install/src/merger';

function setup(repoTemplate: string, repoTiers: string, targetConfig: string, targetTiers: string) {
  const dir = path.join(os.tmpdir(), 'ocp-model-merge-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const repoDir = path.join(dir, 'repo');
  const targetDir = path.join(dir, 'target');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'opencode.template.jsonc'), repoTemplate, 'utf8');
  fs.writeFileSync(path.join(repoDir, 'tiers.json'), repoTiers, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'opencode.jsonc'), targetConfig, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'tiers.json'), targetTiers, 'utf8');
  return { dir, repoDir, targetDir };
}

console.log('=== Model Preservation — Full Regression ===\n');

// ─── Case 1: root + per-agent picks survive reinstall ────────────────
{
  const { dir, repoDir, targetDir } = setup(
    '{\n  "model": "template/standard",\n  "small_model": "template/flash",\n  "agent": {\n    "build": { "prompt": "T_BUILD" },\n    "code": { "prompt": "T_CODE", "model": "template/pro" }\n  }\n}\n',
    '{\n  "$comment": "t",\n  "build": "standard",\n  "code": "pro"\n}\n',
    '{\n  "model": "anthropic/claude-sonnet",\n  "small_model": "anthropic/claude-haiku",\n  "agent": {\n    "build": { "prompt": "T_BUILD", "model": "anthropic/claude-sonnet" },\n    "code": { "prompt": "T_CODE", "model": "anthropic/claude-sonnet" }\n  }\n}\n',
    '{\n  "$comment": "t",\n  "build": "standard",\n  "code": "pro"\n}\n',
  );
  const bag = extractPreserveBag(targetDir);
  mergeConfig(repoDir, targetDir, {} as any, bag);
  const m = readJsoncFile<Record<string, any>>(path.join(targetDir, 'opencode.jsonc'));
  if (m?.model !== 'anthropic/claude-sonnet') throw new Error('case1: root model lost');
  if (m?.small_model !== 'anthropic/claude-haiku') throw new Error('case1: small_model lost');
  if (m?.agent?.code?.model !== 'anthropic/claude-sonnet') throw new Error('case1: agent model lost');
  if (m?.agent?.build?.prompt !== 'T_BUILD') throw new Error('case1: template prompt lost');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓ Case 1: root + per-agent model picks preserved');
}

// ─── Case 2: NEW factory agent gets the user's tier ref ─────────────
// Template v2 adds "code2" (pro tier) that the user's install never had.
{
  const { dir, repoDir, targetDir } = setup(
    '{\n  "model": "template/standard",\n  "small_model": "template/flash",\n  "agent": {\n    "code": { "prompt": "T_CODE", "model": "template/pro" },\n    "dba": { "prompt": "T_DBA", "model": "template/pro" },\n    "code2": { "prompt": "T_CODE2_NEW", "model": "template/pro" }\n  }\n}\n',
    '{\n  "$comment": "t",\n  "code": "pro",\n  "dba": "pro",\n  "code2": "pro"\n}\n',
    '{\n  "model": "anthropic/claude-sonnet",\n  "small_model": "anthropic/claude-haiku",\n  "agent": {\n    "code": { "prompt": "T_CODE", "model": "anthropic/claude-sonnet" },\n    "dba": { "prompt": "T_DBA", "model": "anthropic/claude-sonnet" }\n  }\n}\n',
    '{\n  "$comment": "t",\n  "code": "pro",\n  "dba": "pro"\n}\n',
  );
  const bag = extractPreserveBag(targetDir);
  mergeConfig(repoDir, targetDir, {} as any, bag);
  const m = readJsoncFile<Record<string, any>>(path.join(targetDir, 'opencode.jsonc'));
  if (m?.agent?.code2?.model !== 'anthropic/claude-sonnet') {
    throw new Error(`case2: new agent not seeded with tier ref — got ${m?.agent?.code2?.model}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓ Case 2: new factory agent seeded with the user\'s tier ref');
}

// ─── Case 3: tier conflict → no seeding (never guess) ───────────────
{
  const { dir, repoDir, targetDir } = setup(
    '{\n  "model": "t/s",\n  "agent": {\n    "code": { "prompt": "T", "model": "t/pro" },\n    "dba": { "prompt": "T", "model": "t/pro" },\n    "code2": { "prompt": "T", "model": "t/pro" }\n  }\n}\n',
    '{\n  "$comment": "t",\n  "code": "pro",\n  "dba": "pro",\n  "code2": "pro"\n}\n',
    '{\n  "model": "x/a",\n  "agent": {\n    "code": { "prompt": "T", "model": "anthropic/sonnet" },\n    "dba": { "prompt": "T", "model": "openai/gpt" }\n  }\n}\n',
    '{\n  "$comment": "t",\n  "code": "pro",\n  "dba": "pro"\n}\n',
  );
  const bag = extractPreserveBag(targetDir);
  mergeConfig(repoDir, targetDir, {} as any, bag);
  const m = readJsoncFile<Record<string, any>>(path.join(targetDir, 'opencode.jsonc'));
  // code/dba keep their distinct preserved refs; code2 keeps template default
  if (m?.agent?.code?.model !== 'anthropic/sonnet') throw new Error('case3: code model lost');
  if (m?.agent?.dba?.model !== 'openai/gpt') throw new Error('case3: dba model lost');
  if (m?.agent?.code2?.model !== 't/pro') {
    throw new Error(`case3: conflicting tier must NOT be seeded — got ${m?.agent?.code2?.model}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓ Case 3: conflicting tier skips seeding (no guessing)');
}

// ─── Case 4: new agent WITHOUT template model stays model-free ──────
// (inherits the root model, which is preserved separately)
{
  const { dir, repoDir, targetDir } = setup(
    '{\n  "model": "t/s",\n  "agent": {\n    "code": { "prompt": "T", "model": "t/pro" },\n    "writer": { "prompt": "T_WRITER_NEW" }\n  }\n}\n',
    '{\n  "$comment": "t",\n  "code": "pro",\n  "writer": "standard"\n}\n',
    '{\n  "model": "anthropic/claude-sonnet",\n  "agent": {\n    "code": { "prompt": "T", "model": "anthropic/sonnet" }\n  }\n}\n',
    '{\n  "$comment": "t",\n  "code": "pro"\n}\n',
  );
  const bag = extractPreserveBag(targetDir);
  mergeConfig(repoDir, targetDir, {} as any, bag);
  const m = readJsoncFile<Record<string, any>>(path.join(targetDir, 'opencode.jsonc'));
  if (m?.agent?.writer?.model !== undefined) {
    throw new Error(`case4: model-free new agent must stay model-free — got ${m?.agent?.writer?.model}`);
  }
  if (m?.model !== 'anthropic/claude-sonnet') throw new Error('case4: root model lost');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓ Case 4: model-free new agent inherits root (not force-seeded)');
}

// ─── Case 5: first install (no existing config) uses template ───────
{
  const dir = path.join(os.tmpdir(), 'ocp-model-merge-first-' + Date.now());
  const repoDir = path.join(dir, 'repo');
  const targetDir = path.join(dir, 'target');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'opencode.template.jsonc'), '{\n  "model": "llm-router/standard",\n  "small_model": "llm-router/flash",\n  "agent": { "code": { "prompt": "T", "model": "llm-router/pro" } }\n}\n', 'utf8');
  fs.writeFileSync(path.join(repoDir, 'tiers.json'), '{\n  "$comment": "t",\n  "code": "pro"\n}\n', 'utf8');
  const bag = extractPreserveBag(targetDir);
  mergeConfig(repoDir, targetDir, {} as any, bag);
  const m = readJsoncFile<Record<string, any>>(path.join(targetDir, 'opencode.jsonc'));
  if (m?.model !== 'llm-router/standard') throw new Error('case5: first install must use template model');
  if (m?.small_model !== 'llm-router/flash') throw new Error('case5: first install must use template small_model');
  if (m?.agent?.code?.model !== 'llm-router/pro') throw new Error('case5: first install must use template agent model');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓ Case 5: first install uses template defaults (nothing to preserve)');
}

console.log('\n🎉 All 5 merge-semantics cases passed');
