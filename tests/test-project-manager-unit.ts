/**
 * Project Manager Plugin — Unit Tests (no API dependency)
 *
 * Coverage:
 *   - validateMessage: structural Conventional-Commits subset
 *     (types, scope, breaking `!`, 72-char cap, git-generated exemptions)
 *   - file-as-switch: gate inactive without docs/git-commits.md, active with
 *   - tool guard: blocks violating messages, allows compliant/amend/editor
 *     commits, judges chained commits per invocation
 *   - scaffold: creates missing files only (never overwrites)
 *   - injection: progressive-disclosure pointer only (file content never
 *     injected), byte-identical repeat, strip on file deletion
 *   - index bootstrap: first-time init (codegraph init, gitnexus analyze
 *     when the index is missing) in `/project init` vs manual refresh of
 *     EXISTING indexes in `/project index` (codegraph sync, gitnexus analyze
 *     only when stale), enabled+CLI AND-gate, mcp.enabled JSONC parsing
 *   - announce: session-created suggestion of `/project init` on
 *     uninitialized projects — subagent silence, once-per-run, initialized
 *     projects stay silent
 *
 * Run: bun run tests/test-project-manager-unit.ts   (or: npx tsx tests/test-project-manager-unit.ts)
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  COMMAND_NAME,
  GIT_COMMITS_REL,
  hasConventionFile,
  parseSubcommand,
  setProjectDir,
} from "../plugins/project-manager/project-manager-config"
import { runInit } from "../plugins/project-manager/project-manager-scaffold"
import {
  mcpEnabledFrom,
  planIndexBackends,
  planInitBackends,
  type BackendProbe,
} from "../plugins/project-manager/project-manager-index"
import { makeSystemHook, MARKER } from "../plugins/project-manager/project-manager-system-inject"
import { makeAnnounceHook, suggestInitMessage } from "../plugins/project-manager/project-manager-announce"
import { makeToolGuardHook, validateMessage } from "../plugins/project-manager/project-manager-tool-guard"

// ─── Test framework ───────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✅ ${msg}`)
    passed++
  } else {
    console.error(`  ❌ ${msg}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${"═".repeat(60)}`)
}

// Fake client — only the log surface is exercised in unit tests.
const fakeClient: any = { app: { log: async () => {} } }

// Temp project dir shared by the stateful tests.
const projectDir = mkdtempSync(join(tmpdir(), "pm-unit-"))
setProjectDir(projectDir)
const conventionFile = join(projectDir, ...GIT_COMMITS_REL.split("/"))

function createConventionFile(): void {
  mkdirSync(join(projectDir, "docs"), { recursive: true })
  writeFileSync(conventionFile, "# convention\n", "utf-8")
}

/** Run the guard hook on a bash command; true when the commit was blocked. */
async function guardBlocks(command: string): Promise<boolean> {
  const hook = makeToolGuardHook(fakeClient)
  try {
    await hook({ tool: "bash" }, { args: { command } })
    return false
  } catch (err) {
    return String(err).includes("project-manager")
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  1. validateMessage — structural subset
// ═════════════════════════════════════════════════════════════════════════

function test01_ValidateMessage() {
  section("01: validateMessage — structural rules")

  // Compliant forms.
  assert(validateMessage("feat: add api") === null, "plain type passes")
  assert(validateMessage("fix(auth): guard nil session") === null, "scoped type passes")
  assert(validateMessage("refactor!: drop legacy endpoints") === null, "breaking `!` passes")
  assert(validateMessage("feat(x): y\n\nLong body that can be anything at all.") === null, "only first line is judged")
  assert(validateMessage(`feat: ${"y".repeat(66)}`) === null, "exactly 72 chars passes")

  // Type violations.
  assert(validateMessage("update stuff") !== null, "no type prefix blocked")
  assert(validateMessage("feature: add api") !== null, "unknown type blocked")
  assert(validateMessage("feat add api") !== null, "missing colon blocked")
  assert(validateMessage("feat: ") !== null, "empty summary blocked")
  assert(validateMessage("Feat: add api") !== null, "uppercase type blocked")

  // Length violations.
  assert(validateMessage(`feat: ${"x".repeat(70)}`) !== null, ">72-char first line blocked")

  // Git-generated exemptions.
  assert(validateMessage("Merge branch 'feature/x' into main") === null, "merge message exempt")
  assert(validateMessage('Revert "feat: add api"') === null, "revert message exempt")
  assert(validateMessage("fixup! feat: add api") === null, "fixup! exempt")
  assert(validateMessage("squash! feat: add api") === null, "squash! exempt")
}

// ═════════════════════════════════════════════════════════════════════════
//  2. File-as-switch
// ═════════════════════════════════════════════════════════════════════════

async function test02_FileAsSwitch() {
  section("02: file-as-switch semantics")

  assert(hasConventionFile() === false, "no file → switch off")
  assert(
    (await guardBlocks(`git commit -m "update stuff"`)) === false,
    "no file → violating commit NOT blocked (gate inactive)",
  )

  createConventionFile()
  assert(hasConventionFile() === true, "file present → switch on")
}

// ═════════════════════════════════════════════════════════════════════════
//  3. Tool guard behavior (file present)
// ═════════════════════════════════════════════════════════════════════════

async function test03_ToolGuard() {
  section("03: tool guard — blocking behavior")

  assert(await guardBlocks(`git commit -m "update stuff"`), "violating message blocked")
  assert(await guardBlocks(`git commit -m "feat add api"`), "missing colon blocked")
  assert(await guardBlocks(`git commit -m "feat: ${"x".repeat(70)}"`), "too-long first line blocked")
  assert((await guardBlocks(`git commit -m "feat: add api"`)) === false, "compliant message passes")
  assert((await guardBlocks(`git commit -m "fix(auth): guard nil"`)) === false, "scoped message passes")
  assert((await guardBlocks(`git commit -m "Merge branch 'x'"`)) === false, "merge message passes")
  assert((await guardBlocks(`git commit --amend -m "update stuff"`)) === false, "--amend exempt")
  assert((await guardBlocks(`git commit`)) === false, "editor commit (no -m) fail-open")
  assert((await guardBlocks(`git add . && git commit -m "feat: x"`)) === false, "chained non-commit prefix passes")
  assert(await guardBlocks(`git commit --amend && git commit -m "update stuff"`), "chained: amend exempts only itself")
  assert((await guardBlocks(`git push`)) === false, "non-commit command passes")

  // Non-bash tools are never gated.
  const hook = makeToolGuardHook(fakeClient)
  let blocked = false
  try {
    await hook({ tool: "edit" }, { args: { command: `git commit -m "update stuff"` } })
  } catch {
    blocked = true
  }
  assert(blocked === false, "non-bash tool passes")
}

// ═════════════════════════════════════════════════════════════════════════
//  4. Switch off again (file deleted mid-session)
// ═════════════════════════════════════════════════════════════════════════

async function test04_SwitchOff() {
  section("04: file deleted → gate deactivates")
  rmSync(conventionFile)
  assert(hasConventionFile() === false, "deleted file → switch off")
  assert(
    (await guardBlocks(`git commit -m "update stuff"`)) === false,
    "violating commit passes again after deletion",
  )
}

// ═════════════════════════════════════════════════════════════════════════
//  5. Scaffold idempotency (creates only missing files)
// ═════════════════════════════════════════════════════════════════════════

function test05_Scaffold() {
  section("05: scaffold — never overwrites")

  // Pre-existing AGENTS.md with custom content must survive init.
  writeFileSync(join(projectDir, "AGENTS.md"), "CUSTOM", "utf-8")

  const r1 = runInit()
  assert(r1.every((r) => r.status !== undefined), "every target reported")
  assert(
    r1.find((r) => r.relPath === "AGENTS.md")?.status === "skipped",
    "existing AGENTS.md skipped",
  )
  assert(
    r1.find((r) => r.relPath === GIT_COMMITS_REL)?.status === "created",
    "missing git-commits.md created",
  )

  const r2 = runInit()
  assert(r2.every((r) => r.status === "skipped"), "second run skips everything")
  assert(
    !readFileSync(join(projectDir, "AGENTS.md"), "utf-8").includes("Generated"),
    "custom AGENTS.md content untouched",
  )
}

// ═════════════════════════════════════════════════════════════════════════
//  6. Command parsing
// ═════════════════════════════════════════════════════════════════════════

function test06_Command() {
  section("06: command parsing")
  assert(COMMAND_NAME === "project", "command name is /project")
  assert(parseSubcommand("init") === "init", "'init' parsed")
  assert(parseSubcommand("  INIT  extra") === "init", "case-insensitive, first token only")
  assert(parseSubcommand(undefined) === null, "missing args → null (help)")
  assert(parseSubcommand("   ") === null, "blank args → null (help)")
}

// ─── Run ──────────────────────────────────────────────────────────────────

// ═════════════════════════════════════════════════════════════════════
//  7. System injection — progressive-disclosure pointer (not full content)
// ═════════════════════════════════════════════════════════════════════

async function test07_Injection() {
  section("07: injection — pointer only, never file content")

  const hook = makeSystemHook(fakeClient)

  // No file → complete no-op.
  rmSync(conventionFile, { force: true })
  const empty = { system: ["base prompt"] }
  await hook({}, empty)
  assert(empty.system[0] === "base prompt", "no file → prompt untouched")

  // File present → pointer injected, file CONTENT stays out of context.
  createConventionFile()
  const out = { system: ["entry A", "entry B"] }
  await hook({}, out)
  assert(out.system[0] === "entry A", "multi-entry: first entry untouched")
  assert(out.system[1].includes(MARKER), "marker present in last entry")
  assert(out.system[1].includes(GIT_COMMITS_REL), "pointer names the file")
  assert(out.system[1].includes("progressive"), "pointer declares progressive disclosure")
  assert(!out.system[1].includes("# convention"), "file content NOT injected")
  assert(out.system[1].length < 600, "pointer is compact (<600 chars)")

  // Repeat on the same built prompt → byte-identical no-op.
  const before = out.system[1]
  await hook({}, out)
  assert(out.system[1] === before, "repeat call is byte-identical (cache-friendly)")

  // File deleted mid-session → stale pointer stripped, prompt restored.
  rmSync(conventionFile)
  await hook({}, out)
  assert(out.system[1] === "entry B", "deletion strips the pointer and restores the prompt")
}

// ═══════════════════════════════════════════════════════════════════
//  8. Index bootstrap — first-time init vs manual refresh (pure planner)
// ═══════════════════════════════════════════════════════════════════

function probe(overrides: Partial<BackendProbe>): BackendProbe {
  return {
    codegraphEnabled: true,
    codegraphCli: true,
    codegraphIndexed: false,
    gitnexusEnabled: true,
    gitnexusCli: true,
    gitnexusIndex: "missing",
    ...overrides,
  }
}

function planFor(plans: ReturnType<typeof planInitBackends>, backend: "codegraph" | "gitnexus") {
  return plans.find((p) => p.backend === backend)!
}

function test08_IndexPlanning() {
  section("08: index bootstrap — first-time init vs manual refresh")

  // `/project init` runs every FIRST-TIME step, only when CLI installed.
  assert(planFor(planInitBackends(probe({})), "codegraph").command === "codegraph init", "init plans codegraph init when CLI + enabled + not indexed")
  assert(planFor(planInitBackends(probe({})), "gitnexus").command === "gitnexus analyze", "init plans gitnexus initial build when index missing")
  assert(planFor(planInitBackends(probe({ codegraphIndexed: true })), "codegraph").command === null, "codegraph already indexed → no run")
  assert(planFor(planInitBackends(probe({ gitnexusIndex: "ready" })), "gitnexus").command === null, "gitnexus already indexed → no run")
  assert(planFor(planInitBackends(probe({ gitnexusIndex: "stale" })), "gitnexus").command === null, "gitnexus stale is a rebuild → deferred to /project index")
  assert(planFor(planInitBackends(probe({ codegraphCli: false })), "codegraph").command === null, "codegraph CLI missing → skipped, never invoked")
  assert(planFor(planInitBackends(probe({ gitnexusCli: false })), "gitnexus").command === null, "gitnexus CLI missing → skipped, never invoked")
  assert(planFor(planInitBackends(probe({ codegraphEnabled: false })), "codegraph").command === null, "codegraph disabled → no run even with CLI")
  assert(planFor(planInitBackends(probe({ gitnexusEnabled: false })), "gitnexus").command === null, "gitnexus disabled → no run even with CLI")

  // `/project index` is manual refresh of EXISTING indexes only.
  assert(planFor(planIndexBackends(probe({ codegraphIndexed: true })), "codegraph").command === "codegraph sync", "codegraph indexed → incremental sync")
  assert(planFor(planIndexBackends(probe({})), "codegraph").command === null, "codegraph no index → init step, not a refresh")
  assert(planFor(planIndexBackends(probe({ codegraphCli: false, codegraphIndexed: true })), "codegraph").command === null, "codegraph CLI missing → skipped, never invoked")
  assert(planFor(planIndexBackends(probe({ codegraphEnabled: false, codegraphIndexed: true })), "codegraph").command === null, "codegraph disabled → no run even with CLI")
  assert(planFor(planIndexBackends(probe({ gitnexusIndex: "stale" })), "gitnexus").command === "gitnexus analyze", "stale index → rebuild")
  assert(planFor(planIndexBackends(probe({ gitnexusIndex: "ready" })), "gitnexus").command === null, "ready index → no run")
  assert(planFor(planIndexBackends(probe({ gitnexusIndex: "missing" })), "gitnexus").command === null, "missing index → init step, not a rebuild")
  assert(planFor(planIndexBackends(probe({ gitnexusCli: false })), "gitnexus").command === null, "CLI missing → skipped, never invoked")
  assert(planFor(planIndexBackends(probe({ gitnexusEnabled: false })), "gitnexus").command === null, "disabled → no run even with CLI")

  // mcp.<name>.enabled parsing (same JSONC subset rule as the profiler).
  assert(mcpEnabledFrom('{"mcp":{"gitnexus":{"enabled":false}}}', "gitnexus") === false, "explicit false honored")
  assert(mcpEnabledFrom('{"mcp":{"gitnexus":{"enabled":true}}}', "gitnexus") === true, "explicit true honored")
  assert(mcpEnabledFrom('{"mcp":{}}', "gitnexus") === true, "missing entry → assume enabled")
  const commented = '// "mcp":{"gitnexus":{"enabled":false}}\n{"mcp":{"gitnexus":{"enabled":true}}}'
  assert(mcpEnabledFrom(commented, "gitnexus") === true, "whole-line // comments stripped")
}

// ═══════════════════════════════════════════════════════════════════
//  9. Announce — suggest /project init on uninitialized projects
// ═══════════════════════════════════════════════════════════════════

async function test09_Announce() {
  section("09: announce — /project init suggestion")

  // Pure message builder.
  const probeFull: BackendProbe = {
    codegraphEnabled: true, codegraphCli: true, codegraphIndexed: false,
    gitnexusEnabled: true, gitnexusCli: true, gitnexusIndex: "missing",
  }
  const msg = suggestInitMessage(["AGENTS.md"], probeFull)
  assert(msg.includes("/project init"), "message names the command")
  assert(msg.includes("AGENTS.md"), "message lists missing files")
  assert(msg.includes("codegraph"), "message hints unindexed installed backend")
  const probeNoCli = { ...probeFull, codegraphCli: false, gitnexusCli: false }
  assert(!suggestInitMessage(["AGENTS.md"], probeNoCli).includes("Also:"), "no backend hint when CLIs absent")

  // Hook behavior with a capturing fake client.
  const dir2 = mkdtempSync(join(tmpdir(), "pm-announce-"))
  setProjectDir(dir2)
  let prompts = 0
  const hookClient: any = {
    session: { prompt: async () => { prompts++ } },
    tui: { showToast: async () => {} },
  }
  const hook = makeAnnounceHook(hookClient)
  await hook({ event: { type: "session.created", properties: { info: { id: "sub", parentID: "main" } } } })
  assert(prompts === 0, "subagent session → no suggestion")
  await hook({ event: { type: "session.created", properties: { info: { id: "s1" } } } })
  assert(prompts === 1, "uninitialized project → suggestion shown")
  await hook({ event: { type: "session.created", properties: { info: { id: "s2" } } } })
  assert(prompts === 1, "once per server run — no nag")

  // Fully initialized project → silent.
  const dir3 = mkdtempSync(join(tmpdir(), "pm-init-"))
  setProjectDir(dir3)
  mkdirSync(join(dir3, "docs"), { recursive: true })
  mkdirSync(join(dir3, ".opencode"), { recursive: true })
  writeFileSync(join(dir3, "AGENTS.md"), "x", "utf-8")
  writeFileSync(join(dir3, "docs", "git-commits.md"), "x", "utf-8")
  writeFileSync(join(dir3, ".opencode", "opencode.jsonc"), "{}", "utf-8")
  const hook2 = makeAnnounceHook(hookClient)
  await hook2({ event: { type: "session.created", properties: { info: { id: "s3" } } } })
  assert(prompts === 1, "initialized project → no suggestion")

  rmSync(dir2, { recursive: true, force: true })
  rmSync(dir3, { recursive: true, force: true })
  setProjectDir(projectDir)
}

test01_ValidateMessage()
await test02_FileAsSwitch()
await test03_ToolGuard()
await test04_SwitchOff()
test05_Scaffold()
test06_Command()
await test07_Injection()
test08_IndexPlanning()
await test09_Announce()

rmSync(projectDir, { recursive: true, force: true })

console.log(`\n${"═".repeat(60)}`)
console.log(`  RESULT: ${passed} passed, ${failed} failed`)
console.log(`${"═".repeat(60)}`)
if (failed > 0) process.exit(1)
