/**
 * Prompt budget gate for the layered-disclosure architecture (dev-only).
 *
 * Estimates, in tokens (chars / 4), what the shipped template actually costs:
 *   L0 — the `instructions` array: paid on every step of every agent.
 *   L1 — each agent prompt: its agents/*.md plus the rule files assembled
 *        via {file:} markers, paid only while that agent runs.
 *   L2 — skills/: only name+description stay resident; the body loads on demand.
 *
 * Fails (exit 1) when L0 or any single agent exceeds its budget, and prints
 * the layer attribution of every shipped prompt file so the routing matrix
 * stays self-checking instead of tribal knowledge.
 *
 * Usage: bun run scripts/measure-prompts.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJsoncFile } from '../install/src/merger';

const repoDir = path.resolve(__dirname, '..');
const CONFIG_PREFIX = '~/.config/opencode/';

// Budgets in estimated tokens. L0 is paid every step × every agent, so it is
// the expensive layer; L1 is isolated to one role's runtime.
const L0_BUDGET = 2500;
const AGENT_BUDGET = 8000;

const estTokens = (text: string): number => Math.ceil(text.length / 4);

/** Maps a shipped config path (~/.config/opencode/<rel>) to the repo file. */
function toRepoPath(configPath: string): string | null {
  if (!configPath.startsWith(CONFIG_PREFIX)) return null;
  return path.join(repoDir, configPath.slice(CONFIG_PREFIX.length));
}

function fileTokens(configPath: string): { tokens: number; missing: boolean } {
  const p = toRepoPath(configPath);
  if (!p || !fs.existsSync(p)) return { tokens: 0, missing: true };
  return { tokens: estTokens(fs.readFileSync(p, 'utf8')), missing: false };
}

const template = readJsoncFile<Record<string, any>>(path.join(repoDir, 'opencode.template.jsonc'));
if (!template) {
  console.error('measure-prompts: opencode.template.jsonc missing or unparseable');
  process.exit(1);
}

let failures = 0;

// --- L0: instructions array ------------------------------------------------
const instructions: string[] = Array.isArray(template.instructions) ? template.instructions : [];
let l0Total = 0;
console.log('L0 (every step x every agent)');
for (const entry of instructions) {
  const { tokens, missing } = fileTokens(entry);
  l0Total += tokens;
  console.log(`  ${missing ? 'MISSING' : String(tokens).padStart(5) + ' tok'}  ${entry}`);
  if (missing) failures++;
}
const l0Ok = l0Total <= L0_BUDGET;
console.log(`  TOTAL: ${l0Total} tok (budget ${L0_BUDGET}) ${l0Ok ? 'OK' : 'OVER BUDGET'}`);
if (!l0Ok) failures++;

// --- L1: agent prompt assembly ----------------------------------------------
const agents: Record<string, any> = template.agent && typeof template.agent === 'object' ? template.agent : {};
console.log('\nL1 (per-agent {file:} assembly)');
const l1Files = new Set<string>();
for (const [name, def] of Object.entries(agents)) {
  const prompt: string = typeof def?.prompt === 'string' ? def.prompt : '';
  const markers = [...prompt.matchAll(/\{file:([^}]+)\}/g)].map((m) => m[1]);
  let agentTotal = 0;
  const parts: string[] = [];
  for (const m of markers) {
    const { tokens, missing } = fileTokens(m);
    agentTotal += tokens;
    if (!missing) l1Files.add(m);
    parts.push(`${missing ? 'MISSING' : tokens + ' tok'} ${m.replace(CONFIG_PREFIX, '')}`);
    if (missing) failures++;
  }
  const ok = agentTotal <= AGENT_BUDGET;
  console.log(`  ${name}: ${agentTotal} tok (budget ${AGENT_BUDGET}) ${ok ? 'OK' : 'OVER BUDGET'}`);
  for (const p of parts.slice(1)) console.log(`      + ${p}`);
  if (!ok) failures++;
}

// --- L2: skills ---------------------------------------------------------------
const skillsDir = path.join(repoDir, 'skills');
console.log('\nL2 (skills — body loads on demand, name+description resident)');
if (fs.existsSync(skillsDir)) {
  for (const ent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const skillFile = path.join(skillsDir, ent.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      console.log(`  MISSING SKILL.md in skills/${ent.name}`);
      failures++;
      continue;
    }
    const body = fs.readFileSync(skillFile, 'utf8');
    console.log(`  ${ent.name}: ${estTokens(body)} tok on demand`);
  }
} else {
  console.log('  (no skills/ directory)');
}

// --- Layer attribution table ---------------------------------------------------
console.log('\nLayer attribution');
const l0Set = new Set(instructions);
const rows: Array<[string, string]> = [];
for (const f of l0Set) rows.push([f.replace(CONFIG_PREFIX, ''), 'L0']);
for (const f of l1Files) if (!l0Set.has(f)) rows.push([f.replace(CONFIG_PREFIX, ''), 'L1']);
for (const [file, layer] of rows.sort()) console.log(`  ${layer}  ${file}`);
const instructionDir = path.join(repoDir, 'instructions');
for (const f of fs.readdirSync(instructionDir)) {
  const rel = `instructions/${f}`;
  const cfg = CONFIG_PREFIX + rel;
  if (!l0Set.has(cfg) && ![...l1Files].includes(cfg)) {
    console.log(`  --  ${rel} (not referenced by the template)`);
  }
}

console.log(failures === 0 ? '\nmeasure-prompts: OK' : `\nmeasure-prompts: FAILED (${failures} problem(s))`);
process.exit(failures === 0 ? 0 : 1);
