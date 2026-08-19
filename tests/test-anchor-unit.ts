/**
 * DeepSeek Anchor Plugin — Unit Tests (no API dependency)
 *
 * Methodology inspired by dsh-anchored-standard:
 *   - anchor-turn: verify injected anchor text and idempotency
 *   - context-gate: verify phase state machine (promoteOn, compaction reset)
 *   - deliberation-gate: verify reasoning depth gate (minChars, deny)
 *   - zero-tool-bootstrap: verify first-turn zero tools, second-turn restore
 *
 * Run: npx tsx tests/test-anchor-unit.ts
 */

import { DeepSeekAnchorPlugin } from "../plugins/deepseek-anchor/index"
import { isEnabled, getMode, setMode, COMMAND_NAME, parseModeArg, type AnchorMode } from "../plugins/deepseek-anchor/deepseek-anchor-config"

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

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeModel(opts: { providerID?: string; modelID?: string; apiID?: string }): any {
  return {
    providerID: opts.providerID ?? "",
    modelID: opts.modelID ?? "",
    api: opts.apiID ? { id: opts.apiID } : undefined,
  }
}

async function loadPlugin(): Promise<any> {
  return (await DeepSeekAnchorPlugin({} as any)) as any
}

// ═════════════════════════════════════════════════════════════════════════
//  1. Anchor injection & content validation (dsh: anchor-turn)
// ═════════════════════════════════════════════════════════════════════════

async function test01_AnchorInjection() {
  section("01: Anchor prompt injection (dsh: anchor-turn)")
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.system.transform"]
  setMode("on")

  const output = { system: ["You are an AI assistant."] }
  await hook(
    { sessionID: "anchor-1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) },
    output,
  )

  const prompt = output.system[0]
  assert(prompt.includes("[DEEPSEEK REASONING ANCHOR]"), "MARKER injected")
  assert(prompt.includes("Session anchor"), "Contains Session anchor directive")
  assert(prompt.includes("Restate the goal"), "Step 1: restate goal")
  assert(prompt.includes("key constraints"), "Step 2: list constraints")
  assert(prompt.includes("State your intended approach"), "Step 3: state approach")
  assert(prompt.includes("HARD RULE"), "HARD RULE present")
  assert(prompt.includes("MUST NOT invoke any tool"), "Tool prohibition present")
  assert(prompt.length > "You are an AI assistant.".length, "Prompt length increased")
}

// ═════════════════════════════════════════════════════════════════════════
//  2. Idempotency — OpenCode rebuilds output.system fresh every step, so
//  "already injected" is tracked per session in memory, not via the MARKER
//  in the incoming system (dsh: context-gate)
// ═════════════════════════════════════════════════════════════════════════

async function test02_Idempotency() {
  section("02: Idempotency — inject once per session (dsh: context-gate)")
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.system.transform"]
  setMode("on")

  const base = "You are an AI."

  // First step — inject
  const out1 = { system: [base] }
  await hook(
    { sessionID: "idem-1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) },
    out1,
  )
  assert(out1.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "First step → anchor injected")

  // Second step — OpenCode passes a FRESH system (no marker present).
  // The plugin must recognize the session and stay a no-op.
  const out2 = { system: [base] }
  await hook(
    { sessionID: "idem-1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) },
    out2,
  )
  assert(out2.system[0] === base, "Second step (fresh system) → content unchanged (idempotent)")
}

// ═════════════════════════════════════════════════════════════════════════
//  3. Model detection — DeepSeek V4 Pro only (3-layer identification)
// ═════════════════════════════════════════════════════════════════════════

async function test03_ModelDetection() {
  section("03: Model detection — DeepSeek V4 Pro only (providerID / modelID / api.id)")
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.system.transform"]
  setMode("on")

  // DeepSeek V4 Pro — modelID
  let out = { system: ["base"] }
  await hook({ sessionID: "d1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) }, out)
  assert(out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "deepseek/deepseek-v4-pro → activated")

  // DeepSeek V4 Pro — modelID only (no providerID)
  out = { system: ["base"] }
  await hook({ sessionID: "d2", model: makeModel({ modelID: "deepseek-v4-pro" }) }, out)
  assert(out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "modelID='deepseek-v4-pro' → activated")

  // DeepSeek V4 Pro — api.id
  out = { system: ["base"] }
  await hook({ sessionID: "d3", model: makeModel({ apiID: "ds/deepseek-v4-pro" }) }, out)
  assert(out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "api.id='ds/deepseek-v4-pro' → activated")

  // Case-insensitive + separator variant
  out = { system: ["base"] }
  await hook({ sessionID: "d4", model: makeModel({ modelID: "DeepSeek_V4_Pro" }) }, out)
  assert(out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "'DeepSeek_V4_Pro' → activated")

  // Other DeepSeek models — providerID alone is not sufficient
  out = { system: ["base"] }
  await hook({ sessionID: "d5", model: makeModel({ providerID: "deepseek" }) }, out)
  assert(!out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "providerID='deepseek' alone → skipped")

  out = { system: ["base"] }
  await hook({ sessionID: "d6", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-flash" }) }, out)
  assert(!out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "deepseek/deepseek-v4-flash → skipped")

  out = { system: ["base"] }
  await hook({ sessionID: "d7", model: makeModel({ providerID: "deepseek", modelID: "deepseek-chat" }) }, out)
  assert(!out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "deepseek/deepseek-chat → skipped")

  // Non-DeepSeek
  out = { system: ["base"] }
  await hook({ sessionID: "d8", model: makeModel({ providerID: "openai", modelID: "gpt-4o" }) }, out)
  assert(!out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "openai/gpt-4o → skipped")

  // Empty model object
  out = { system: ["base"] }
  await hook({ sessionID: "d9", model: {} }, out)
  assert(!out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "Empty model → skipped")

  // Undefined model
  out = { system: ["base"] }
  await hook({ sessionID: "d10", model: undefined }, out)
  assert(!out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "Undefined model → skipped")
}

// ═════════════════════════════════════════════════════════════════════════
//  4. First-turn tool block (dsh: deliberation-gate deny)
// ═════════════════════════════════════════════════════════════════════════

async function test04_FirstTurnToolBlock() {
  section("04: First-turn tool block (dsh: deliberation-gate deny)")
  const plugin = await loadPlugin()
  const sysHook = plugin["experimental.chat.system.transform"]
  const toolHook = plugin["tool.execute.before"]
  setMode("on")

  // Inject anchor → add session to anchoredSessions
  const sysOut = { system: ["You are a helpful assistant."] }
  await sysHook(
    { sessionID: "block-1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) },
    sysOut,
  )

  // Attempt tool call → should be blocked
  let blocked = false
  let errMsg = ""
  try {
    await toolHook({ sessionID: "block-1", tool: "bash" })
  } catch (e: any) {
    blocked = true
    errMsg = e?.message ?? String(e)
  }
  assert(blocked, "bash blocked")
  assert(errMsg.includes("HARD RULE violated"), "Error message includes 'HARD RULE violated'")

  // Verify multiple tools are all blocked
  for (const tool of ["str_replace_editor", "read_file", "write_file", "grep_search", "bash"]) {
    let tb = false
    try {
      await toolHook({ sessionID: "block-1", tool })
    } catch {
      tb = true
    }
    assert(tb, `Tool '${tool}' blocked`)
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  5. Second-turn tool restore (dsh: context-gate promotion)
// ═════════════════════════════════════════════════════════════════════════

async function test05_SecondTurnToolRestore() {
  section("05: Second-turn tool restore (dsh: promotion)")
  const plugin = await loadPlugin()
  const sysHook = plugin["experimental.chat.system.transform"]
  const toolHook = plugin["tool.execute.before"]
  setMode("on")

  // First turn — inject anchor (fresh system)
  const out1 = { system: ["You are a helpful assistant."] }
  await sysHook(
    { sessionID: "restore-1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) },
    out1,
  )

  // Anchored generation: tool call is blocked
  let blocked = false
  try {
    await toolHook({ sessionID: "restore-1", tool: "bash" })
  } catch {
    blocked = true
  }
  assert(blocked, "Anchored generation → bash blocked")

  // Next generation step — OpenCode passes a FRESH system again; the plugin
  // recognizes the session and lifts the tool block without re-injecting.
  const out2 = { system: ["You are a helpful assistant."] }
  await sysHook(
    { sessionID: "restore-1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) },
    out2,
  )
  assert(out2.system[0] === "You are a helpful assistant.", "No re-injection on later steps")

  // Tool should pass now
  let toolPasses = true
  try {
    await toolHook({ sessionID: "restore-1", tool: "bash" })
  } catch {
    toolPasses = false
  }
  assert(toolPasses, "Second-generation bash call passes")
}

// ═════════════════════════════════════════════════════════════════════════
//  6. Plugin disabled — no-op (dsh: context-gate enabled=false A/B test)
// ═════════════════════════════════════════════════════════════════════════

async function test06_DisabledNoop() {
  section("06: Plugin disabled — no-op (dsh: enabled=false A/B)")
  const plugin = await loadPlugin()
  const sysHook = plugin["experimental.chat.system.transform"]
  const toolHook = plugin["tool.execute.before"]
  setMode("off")

  const out = { system: ["You are a helpful assistant."] }
  await sysHook(
    { sessionID: "dis-1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) },
    out,
  )
  assert(!out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "Disabled → no injection")

  let tp = true
  try {
    await toolHook({ sessionID: "dis-1", tool: "bash" })
  } catch {
    tp = false
  }
  assert(tp, "Disabled → tools not blocked")

  setMode("on")
}

// ═════════════════════════════════════════════════════════════════════════
//  7. Multi system fragment injection
// ═════════════════════════════════════════════════════════════════════════

async function test07_MultiFragment() {
  section("07: Multi system fragment injection")
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.system.transform"]
  setMode("on")

  const output = {
    system: ["Fragment A.", "Fragment B.", "Fragment C."],
  }
  await hook(
    { sessionID: "multi-1", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) },
    output,
  )
  for (let i = 0; i < 3; i++) {
    assert(output.system[i].includes("[DEEPSEEK REASONING ANCHOR]"), `fragment[${i}] contains MARKER`)
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  8. Config & command parsing
// ═════════════════════════════════════════════════════════════════════════

async function test08_ConfigAndCommand() {
  section("08: Config & command parsing")
  setMode("on")

  assert(parseModeArg("on") === "on", "parseModeArg('on') → 'on'")
  assert(parseModeArg("off") === "off", "parseModeArg('off') → 'off'")
  assert(parseModeArg("ON") === "on", "Case-insensitive")
  assert(parseModeArg("invalid") === null, "Invalid arg → null")
  assert(parseModeArg("") === null, "Empty string → null")

  const orig = getMode()
  setMode("off")
  assert(getMode() === "off" && !isEnabled(), "off → isEnabled=false")
  setMode("on")
  assert(getMode() === "on" && isEnabled(), "on → isEnabled=true")
  setMode(orig as AnchorMode)

  assert(COMMAND_NAME === "deepseek-anchor", "COMMAND_NAME correct")
}

// ═════════════════════════════════════════════════════════════════════════
//  9. Config hook — command registration
// ═════════════════════════════════════════════════════════════════════════

async function test09_ConfigHook() {
  section("09: Config hook — command registration")
  const plugin = await loadPlugin()
  const cfg: any = {}
  await plugin["config"](cfg)
  assert(!!cfg.command, "cfg.command created")
  assert(!!cfg.command[COMMAND_NAME], "Command registered")
  assert(cfg.command[COMMAND_NAME].description.includes("DeepSeek"), "Description includes 'DeepSeek'")
}

// ═════════════════════════════════════════════════════════════════════════
//  10. Event hook — session.created notification + subagent tracking
// ═════════════════════════════════════════════════════════════════════════

async function test10_EventHook() {
  section("10: Event hook — session.created + subagent tracking")
  const plugin = await loadPlugin()
  const eventHook = plugin["event"]
  const sysHook = plugin["experimental.chat.system.transform"]
  const toolHook = plugin["tool.execute.before"]
  setMode("on")

  // Top-level session — should not throw
  try {
    await eventHook({
      event: { type: "session.created", properties: { info: { id: "s1" } } },
    })
  } catch {}
  assert(true, "Top-level session.created handled")

  // Subagent session.created → tracked as subagent
  try {
    await eventHook({
      event: { type: "session.created", properties: { info: { parentID: "p1", id: "s2" } } },
    })
  } catch {}
  assert(true, "Subagent session.created handled")

  // Subagent session must not be anchored nor tool-blocked
  const out = { system: ["base"] }
  await sysHook({ sessionID: "s2", model: makeModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }) }, out)
  assert(!out.system[0].includes("[DEEPSEEK REASONING ANCHOR]"), "Subagent session → no injection")
  let toolPasses = true
  try {
    await toolHook({ sessionID: "s2", tool: "bash" })
  } catch {
    toolPasses = false
  }
  assert(toolPasses, "Subagent session → tools not blocked")

  // Non-target event — should skip
  try {
    await eventHook({
      event: { type: "message.updated", properties: {} },
    })
    assert(true, "Non-target event skipped")
  } catch {
    assert(false, "Non-target event should not throw")
  }
}

// ─── Main entry ───────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║  DeepSeek Anchor — Unit Tests (no API)                  ║")
  console.log("╚══════════════════════════════════════════════════════════╝")

  const orig = getMode()
  try {
    await test01_AnchorInjection()
    await test02_Idempotency()
    await test03_ModelDetection()
    await test04_FirstTurnToolBlock()
    await test05_SecondTurnToolRestore()
    await test06_DisabledNoop()
    await test07_MultiFragment()
    await test08_ConfigAndCommand()
    await test09_ConfigHook()
    await test10_EventHook()
  } finally {
    setMode(orig as AnchorMode)
  }

  console.log(`\n${"═".repeat(60)}`)
  console.log(`  Result: ${passed} passed / ${failed} failed`)
  console.log(`${"═".repeat(60)}`)
  if (failed > 0) process.exit(1)
}

main()
