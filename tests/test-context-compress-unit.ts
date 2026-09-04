/**
 * Context Compress Plugin — Unit Tests (no API dependency)
 *
 * Assertions are anchored to measured v1.0.0 engine behavior (smoke bench,
 * 2026-09-05): pure-code outputs compress at 1.00x (no benefit → untouched),
 * log-style tool outputs compress ~1.3x+, prose compression is NOT used by
 * the plugin (9.75x but dropped the information-bearing sentence), and the
 * engine is fully deterministic.
 *
 * Coverage:
 *   - vendored engine smoke: imports, determinism, pure-code → no benefit
 *   - compressStaleToolOutput: log output compresses; code/short → null
 *   - watermark: only messages beyond RECENCY_WINDOW are rewritten
 *   - never touched: user messages, assistant text parts, tool-call
 *     structure (callID/status/input), short outputs
 *   - byte stability: a second transform on fresh objects reproduces the
 *     first output byte-identically (frozen replacement cache)
 *   - kill switch OCP_CONTEXT_COMPRESS=0, subagent skip, sessionID
 *     fallback derivation, fail-open on garbage input
 *
 * Run: bun run tests/test-context-compress-unit.ts
 */

import {
  ContextCompressPlugin,
  compressStaleToolOutput,
  RECENCY_WINDOW,
  MIN_COMPRESS_CHARS,
} from "../plugins/context-compress/context-compress"

// ─── Test framework ───────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ok ${msg}`)
    passed++
  } else {
    console.error(`  FAILED: ${msg}`)
    failed++
  }
}

function assertEq(actual: unknown, expected: unknown, msg: string): void {
  assert(actual === expected, `${msg} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`)
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${"=".repeat(60)}\n`)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

/** Log-style tool output: repetitive INFO lines + a code block. Measured
 * ~1.3x+ compression with the code block preserved verbatim. */
function longLogOutput(): string {
  return (
    Array.from(
      { length: 30 },
      (_, i) =>
        `2026-09-05 12:00:${String(i).padStart(2, "0")} INFO worker step ${i} completed successfully with no errors and nothing noteworthy happened during this iteration`,
    ).join("\n") + "\nexit code 0"
  )
}

/** Pure-code tool output (a file read). Measured 1.00x — engine keeps it
 * verbatim, so the plugin must leave it untouched. */
function pureCodeOutput(): string {
  return (
    "```ts\n" +
    Array.from(
      { length: 60 },
      (_, i) =>
        `export function handler${i}(req: Request): Response { return new Response(JSON.stringify({ id: ${i}, ok: true })) }`,
    ).join("\n") +
    "\n```"
  )
}

type TestPart = { type: string; text?: string; tool?: string; callID?: string; state?: Record<string, unknown> }
type TestMsg = { info: { id: string; role: string; sessionID: string }; parts: TestPart[] }

/** One assistant message carrying a completed tool part with the given output. */
function toolMsg(id: string, sessionID: string, output: string): TestMsg {
  return {
    info: { id, role: "assistant", sessionID },
    parts: [
      { type: "step-start" },
      {
        type: "tool",
        tool: "bash",
        callID: `call_${id}`,
        state: { status: "completed", input: { command: "npm test" }, output },
      },
      { type: "text", text: "Tests finished, everything passed." },
    ],
  }
}

function userMsg(id: string, sessionID: string, text: string): TestMsg {
  return { info: { id, role: "user", sessionID }, parts: [{ type: "text", text }] }
}

/** Deep-clone a message array — simulates opencode rebuilding the transform
 * input from session storage on a later step. */
function cloneMsgs(msgs: TestMsg[]): TestMsg[] {
  return structuredClone(msgs)
}

/** Total output-text bytes across all tool parts — the "request payload" the
 * prefix-cache argument cares about. */
function toolOutputBytes(msgs: TestMsg[]): number {
  let n = 0
  for (const m of msgs)
    for (const p of m.parts) if (p.type === "tool" && typeof p.state?.output === "string") n += p.state.output.length
  return n
}

async function loadPlugin(): Promise<any> {
  return (await ContextCompressPlugin({} as any)) as any
}

// ═════════════════════════════════════════════════════════════════════════
//  1. Engine smoke — vendored import, determinism, no-benefit guard
// ═════════════════════════════════════════════════════════════════════════

async function test01_EngineSmoke() {
  section("01: vendored engine smoke")
  const a = compressStaleToolOutput(longLogOutput())
  assert(a !== null && a.length < longLogOutput().length, "log output compresses to something shorter")
  const b = compressStaleToolOutput(longLogOutput())
  assertEq(a, b, "compression is deterministic (same input → same bytes)")
  assertEq(compressStaleToolOutput(pureCodeOutput()), null, "pure-code output → null (no benefit, stays verbatim)")
  assertEq(
    compressStaleToolOutput("short output"),
    null,
    `output below ${MIN_COMPRESS_CHARS} chars → null (churn outweighs savings)`,
  )
}

// ═════════════════════════════════════════════════════════════════════════
//  2. Watermark — only the stale tail is rewritten
// ═════════════════════════════════════════════════════════════════════════

async function test02_Watermark() {
  section(`02: watermark — last ${RECENCY_WINDOW} messages stay verbatim`)
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.messages.transform"]
  const sid = "cw-watermark"

  const msgs: TestMsg[] = []
  for (let i = 0; i < RECENCY_WINDOW + 8; i++) msgs.push(toolMsg(`m${i}`, sid, longLogOutput()))

  const before = toolOutputBytes(msgs)
  await hook({ sessionID: sid }, { messages: msgs })
  const after = toolOutputBytes(msgs)

  assert(after < before, `stale tail compressed (${before} → ${after} bytes)`)
  // The 8 beyond-watermark messages must ALL be compressed; none inside.
  for (let i = 0; i < msgs.length; i++) {
    const out = msgs[i].parts[1]?.state?.output as string
    const stale = i < msgs.length - RECENCY_WINDOW
    if (stale) assert(out.length < longLogOutput().length, `msg ${i} (stale) → compressed`)
    else assertEq(out.length, longLogOutput().length, `msg ${i} (recent) → verbatim`)
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  3. Never touched — user content, assistant prose, tool structure
// ═════════════════════════════════════════════════════════════════════════

async function test03_NeverTouched() {
  section("03: never touched — user content, assistant prose, tool structure")
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.messages.transform"]
  const sid = "cw-never"

  const userText = "We MUST use PostgreSQL, not MySQL. This is the final decision. ".repeat(30)
  const prose = "I analyzed the architecture and concluded the migration is safe because of reasons. ".repeat(30)
  const msgs: TestMsg[] = [
    userMsg("u0", sid, userText),
    {
      info: { id: "a0", role: "assistant", sessionID: sid },
      parts: [{ type: "text", text: prose }],
    },
    toolMsg("t0", sid, pureCodeOutput()), // code output: no benefit, stays verbatim
  ]
  for (let i = 1; i <= RECENCY_WINDOW; i++) msgs.push(toolMsg(`pad${i}`, sid, "ok"))

  await hook({ sessionID: sid }, { messages: msgs })

  assertEq((msgs[0].parts[0].text as string).length, userText.length, "user message text stays verbatim")
  assertEq((msgs[1].parts[0].text as string).length, prose.length, "assistant text part stays verbatim")
  assertEq(msgs[2].parts[1].state?.output, pureCodeOutput(), "pure-code tool output stays verbatim")

  // Structure preservation on a compressed tool message.
  const compressed: TestMsg[] = [toolMsg("t1", sid, longLogOutput())]
  for (let i = 1; i <= RECENCY_WINDOW; i++) compressed.push(toolMsg(`cpad${i}`, sid, "ok"))
  await hook({ sessionID: sid }, { messages: compressed })
  const part = compressed[0].parts[1]
  assertEq(part.tool, "bash", "tool name preserved")
  assertEq(part.callID, "call_t1", "callID preserved (tool-call pairing survives)")
  assertEq(part.state?.status, "completed", "state.status preserved")
  assertEq(JSON.stringify(part.state?.input), JSON.stringify({ command: "npm test" }), "state.input preserved")
  assert((part.state?.output as string).length < longLogOutput().length, "only state.output rewritten")
}

// ═════════════════════════════════════════════════════════════════════════
//  4. Byte stability — frozen cache reproduces identical bytes on later steps
// ═════════════════════════════════════════════════════════════════════════

async function test04_ByteStability() {
  section("04: byte stability — second transform on fresh objects reproduces output")
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.messages.transform"]
  const sid = "cw-stable"

  const step1: TestMsg[] = []
  for (let i = 0; i < RECENCY_WINDOW + 5; i++) step1.push(toolMsg(`s${i}`, sid, longLogOutput()))
  await hook({ sessionID: sid }, { messages: step1 })

  // Later step: opencode rebuilds the array from session storage — fresh
  // objects, same content and IDs. Frozen cache must re-apply identical bytes.
  const step2 = cloneMsgs(step1)
  await hook({ sessionID: sid }, { messages: step2 })

  for (let i = 0; i < step1.length; i++) {
    const a = step2[i].parts[1].state?.output as string
    const b = step1[i].parts[1].state?.output as string
    assertEq(a, b, `msg ${i}: byte-identical across steps (prefix-cache safe)`)
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  5. Kill switch — OCP_CONTEXT_COMPRESS=0 disables the transform
// ═════════════════════════════════════════════════════════════════════════

async function test05_KillSwitch() {
  section("05: kill switch — OCP_CONTEXT_COMPRESS=0")
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.messages.transform"]
  const sid = "cw-kill"
  const prev = process.env.OCP_CONTEXT_COMPRESS
  try {
    process.env.OCP_CONTEXT_COMPRESS = "0"
    const msgs: TestMsg[] = []
    for (let i = 0; i < RECENCY_WINDOW + 5; i++) msgs.push(toolMsg(`k${i}`, sid, longLogOutput()))
    await hook({ sessionID: sid }, { messages: msgs })
    assertEq(toolOutputBytes(msgs), msgs.length * longLogOutput().length, "kill switch → nothing rewritten")
  } finally {
    if (prev === undefined) delete process.env.OCP_CONTEXT_COMPRESS
    else process.env.OCP_CONTEXT_COMPRESS = prev
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  6. Subagent skip + sessionID fallback + fail-open
// ═════════════════════════════════════════════════════════════════════════

async function test06_GuardsAndFailOpen() {
  section("06: subagent skip, sessionID fallback, fail-open")
  const plugin = await loadPlugin()
  const hook = plugin["experimental.chat.messages.transform"]

  // Subagent: the event hook learns it from session.created parentID.
  await plugin.event({ event: { type: "session.created", properties: { info: { id: "sub-1", parentID: "main-1" } } } })
  const subMsgs: TestMsg[] = []
  for (let i = 0; i < RECENCY_WINDOW + 5; i++) subMsgs.push(toolMsg(`g${i}`, "sub-1", longLogOutput()))
  await hook({ sessionID: "sub-1" }, { messages: subMsgs })
  assertEq(toolOutputBytes(subMsgs), subMsgs.length * longLogOutput().length, "subagent session → skipped")

  // sessionID fallback: no transform input, derived from message info.
  const sid = "cw-fallback"
  const msgs: TestMsg[] = []
  for (let i = 0; i < RECENCY_WINDOW + 3; i++) msgs.push(toolMsg(`f${i}`, sid, longLogOutput()))
  await hook(undefined, { messages: msgs })
  assert(toolOutputBytes(msgs) < msgs.length * longLogOutput().length, "no input sessionID → derived from message info")

  // Fail-open: garbage shapes must not throw.
  await hook(undefined, { messages: [] })
  await hook(undefined, {} as any)
  await hook({ sessionID: "x" }, { messages: "not-an-array" } as any)
  assert(true, "garbage input → no crash")
}

// ═════════════════════════════════════════════════════════════════════════
//  Run
// ═════════════════════════════════════════════════════════════════════════

async function main() {
  await test01_EngineSmoke()
  await test02_Watermark()
  await test03_NeverTouched()
  await test04_ByteStability()
  await test05_KillSwitch()
  await test06_GuardsAndFailOpen()

  console.log()
  if (failed > 0) {
    console.error(`\n${"=".repeat(60)}\n  FAILED: ${failed} failed, ${passed} passed\n${"=".repeat(60)}`)
    process.exit(1)
  } else {
    console.log(`\n${"=".repeat(60)}\n  OK: All ${passed} tests passed\n${"=".repeat(60)}`)
  }
}

main().catch((e) => {
  console.error("Test runner crashed:", e)
  process.exit(1)
})
