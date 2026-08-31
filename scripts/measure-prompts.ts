/**
 * Prompt budget gate for the layered-disclosure architecture (dev-only).
 *
 * Estimates, in tokens (chars / 4), what the shipped template actually costs:
 *   L0 — the `instructions` array: paid on every step of every agent.
 *   L1 — each agent prompt: its agents/*.md plus the rule files assembled
 *        via {file:} markers, paid only while that agent runs.
 *   L2 — skills/: only name+description stay resident; the body loads on demand.
 *   Per-step overhead — what every step pays ON TOP of L0+L1: the resident
 *        skills block (<available_skills>), MCP tool definitions, and the
 *        <mcp_instructions> block. Both honor per-agent permission denies
 *        (v1.18.25 semantics: a rule `"<perm>": { "*": "deny" }` hides the
 *        matching tools/skill entirely; wildcard permission keys allowed).
 *        MCP figures come from scripts/mcp-instructions.snapshot.json
 *        (regenerate: bun run scripts/capture-mcp-snapshot.ts).
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

/** Wildcard.match semantics (opencode core/util/wildcard): * spans anything. */
function wildcardMatch(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(value);
}

/** Flattens a config permission block into rules, mirroring Permission.fromConfig. */
function permissionRules(perm: any): Array<{ permission: string; pattern: string; action: string }> {
  const rules: Array<{ permission: string; pattern: string; action: string }> = [];
  if (!perm || typeof perm !== 'object' || Array.isArray(perm)) return rules;
  for (const [key, value] of Object.entries(perm)) {
    if (typeof value === 'string') rules.push({ permission: key, pattern: '*', action: value });
    else if (value && typeof value === 'object')
      for (const [pattern, action] of Object.entries(value as Record<string, string>))
        rules.push({ permission: key, pattern, action: String(action) });
  }
  return rules;
}

/** Mirrors Permission.evaluate: last matching rule wins, default ask. */
function evaluateRule(permission: string, pattern: string, rules: Array<{ permission: string; pattern: string; action: string }>): string {
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i];
    if (wildcardMatch(permission, r.permission) && wildcardMatch(pattern, r.pattern)) return r.action;
  }
  return 'ask';
}

/**
 * Mirrors Permission.disabled: a tool is hidden only when a rule matches its
 * name as the permission key with pattern "*" and action "deny".
 */
function toolDisabled(tool: string, rules: Array<{ permission: string; pattern: string; action: string }>): boolean {
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i];
    if (wildcardMatch(tool, r.permission)) return r.pattern === '*' && r.action === 'deny';
  }
  return false;
}

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

// --- Per-step resident overhead (skills block + MCP) ---------------------------
// Everything below is paid on EVERY step of the agents listed, on top of L0+L1.
// Skill metadata: frontmatter of each shipped SKILL.md (name + description).
const skillMeta: Array<{ name: string; description: string; location: string }> = [];
if (fs.existsSync(skillsDir)) {
  for (const ent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const skillFile = path.join(skillsDir, ent.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const body = fs.readFileSync(skillFile, 'utf8');
    const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const name = fm?.[1].match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? ent.name;
    const description = fm?.[1].match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
    if (description) skillMeta.push({ name, description, location: CONFIG_PREFIX + `skills/${ent.name}/SKILL.md` });
  }
}
const skillsBlockText = (list: typeof skillMeta): string =>
  [
    'Skills provide specialized instructions and workflows for specific tasks.',
    'Use the skill tool to load a skill when a task matches its description.',
    '<available_skills>',
    ...list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((s) => ['  <skill>', `    <name>${s.name}</name>`, `    <description>${s.description}</description>`, `    <location>${s.location}</location>`, '  </skill>']),
    '</available_skills>',
  ].join('\n');

// MCP cost basis: real initialize handshake snapshot (see capture-mcp-snapshot.ts).
const snapshotPath = path.join(repoDir, 'scripts', 'mcp-instructions.snapshot.json');
const snapshot: any = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : null;
const mcpConfig: Record<string, any> = template.mcp && typeof template.mcp === 'object' ? template.mcp : {};
const mcpServers: Array<{ name: string; instructionsChars: number; schemaChars: number; tools: string[] }> = [];
for (const [name, def] of Object.entries(mcpConfig)) {
  if (!def || def.enabled !== true) continue;
  const snap = snapshot?.servers?.[name];
  if (!snap || snap.error) {
    console.log(`\n  NOTE: no MCP snapshot for enabled server "${name}" (bun run scripts/capture-mcp-snapshot.ts) - cost not measured`);
    continue;
  }
  mcpServers.push({
    name,
    instructionsChars: String(snap.instructions ?? '').length,
    schemaChars: snap.toolSchemaChars ?? 0,
    tools: (snap.tools ?? []).map((t: string) => `${name}_${t}`),
  });
}

console.log('\nPer-step resident overhead (paid every step, on top of L0+L1)');
let fleetOverhead = 0;
for (const [name, def] of Object.entries(agents)) {
  const rules = permissionRules(def?.permission);
  // Skills block: entire block skipped when "skill" is denied with pattern *.
  let skillsTok = 0;
  if (!toolDisabled('skill', rules)) {
    const visible = skillMeta.filter((s) => evaluateRule('skill', s.name, rules) !== 'deny');
    if (visible.length > 0) skillsTok = estTokens(skillsBlockText(visible));
  }
  // MCP: tool definitions always dominate; <mcp_instructions> drops only when
  // every tool of a server is hidden for this agent.
  let mcpTok = 0;
  const mcpParts: string[] = [];
  for (const server of mcpServers) {
    const visibleCount = server.tools.filter((t) => !toolDisabled(t, rules)).length;
    if (visibleCount === 0) continue;
    const serverChars = server.instructionsChars + Math.ceil((server.schemaChars * visibleCount) / server.tools.length);
    const tok = Math.ceil(serverChars / 4);
    mcpTok += tok;
    mcpParts.push(`${server.name} ${tok} tok (${visibleCount}/${server.tools.length} tools)`);
  }
  const total = skillsTok + mcpTok;
  fleetOverhead += total;
  console.log(`  ${name}: ${total} tok/step (skills ${skillsTok}, mcp ${mcpTok}${mcpParts.length ? ' = ' + mcpParts.join(' + ') : ''})`);
}
console.log(`  FLEET TOTAL: ${fleetOverhead} tok/step summed over ${Object.keys(agents).length} agents`);

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
