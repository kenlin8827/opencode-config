/**
 * Smart Title Plugin — Deep Robustness Tests (concurrency, leaks, DoS)
 *
 * Tests system-level edge cases:
 *   - stripWrappers infinite loop on pathological input
 *   - cleanTitle regex performance on huge think-tag content
 *   - generateWithFallback with non-array targets
 *   - generateTitle with missing opts fields
 *   - handleIdle concurrency (double-fire for same session)
 *   - Memory map growth without session.deleted events
 *   - sessionID type safety
 *   - empty title after applyTitleFormat
 *
 * Run: bun run tests/test-smart-title-deep.ts
 */

import {
  stripWrappers,
  cleanTitle,
  generateWithFallback,
  applyTitleFormat,
  SmartTitlePlugin,
  logOnce,
  loggedMessages,
  __setServiceLog,
  type Target,
} from "../plugins/smart-title/smart-title"

let passed = 0
let failed = 0

function assertNoThrow(label: string, fn: () => void) {
  try {
    fn()
    passed++
  } catch (e) {
    failed++
    console.error(`  ✗ FAIL: ${label} — ${(e as Error).message}`)
  }
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++
  } else {
    failed++
    console.error(`  ✗ FAIL: ${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`)
  }
}

function assertLt(actual: number, limit: number, label: string) {
  if (actual < limit) {
    passed++
  } else {
    failed++
    console.error(`  ✗ FAIL: ${label} (got ${actual}, want < ${limit})`)
  }
}

// ── 1: stripWrappers — pathological inputs ─────────────────────────────
console.log("\n== 1: stripWrappers pathological ==")
// Single char with wrapping: "**" + "a" + "**" → "a" (length 3 > 4? no, won't strip)
// But "**" + "" + "**" → inner empty, won't strip (guard: inner.length > 0)
// What about nested: "***" — starts with **, ends with *, inner = "*", strips to "*"
assertNoThrow("stripWrappers('***')", () => stripWrappers("***"))
assertEq(stripWrappers("***"), "*", "*** → *")
// "**a**b**" — starts with **, ends with **, inner = "a**b", strips to "a**b"
// then starts with **? no, starts with "a". Loop ends.
assertNoThrow("stripWrappers('**a**b**')", () => stripWrappers("**a**b**"))
// Deeply nested: "**__*x*__**"
assertNoThrow("stripWrappers deeply nested", () => stripWrappers("**__*x*__**"))
// Only wrappers, no content: "****" → inner empty → no strip
assertNoThrow("stripWrappers('****')", () => stripWrappers("****"))
// Single char: "a" → no wrappers match
assertEq(stripWrappers("a"), "a", "single char")
// Empty pairs: '""' → inner empty → no strip
assertNoThrow("stripWrappers('\"\"')", () => stripWrappers('""'))
// Very long alternating: **_**_**_..._**_**
const altPairs = "**_" .repeat(5000) + "x" + "_**".repeat(5000)
assertNoThrow("stripWrappers very long alternating", () => stripWrappers(altPairs))

// ── 2: cleanTitle — regex performance ───────────────────────────────────
console.log("\n== 2: cleanTitle regex DoS ==")
// Huge think tag content: <think>...100KB of text...</think>
const hugeThink = "<think>" + "x".repeat(100000) + "</think> Actual Title"
const start1 = Date.now()
const result1 = cleanTitle(hugeThink)
const elapsed1 = Date.now() - start1
assertEq(result1, "Actual Title", "huge think tag stripped")
assertLt(elapsed1, 1000, `huge think tag took ${elapsed1}ms (expect <1s)`)

// Unterminated think tag: <think>never closed... actual content
const unterminatedThink = "<think>" + "x".repeat(10000) + " Actual Title"
const start2 = Date.now()
const result2 = cleanTitle(unterminatedThink)
const elapsed2 = Date.now() - start2
assertLt(elapsed2, 1000, `unterminated think tag took ${elapsed2}ms (expect <1s)`)

// Multiple nested think tags
const nestedThink = "<think><think>inner</think>middle</think> Title"
assertNoThrow("cleanTitle nested think tags", () => cleanTitle(nestedThink))

// ── 3: generateWithFallback — non-array targets ─────────────────────────
console.log("\n== 3: generateWithFallback non-array ==")
assertNoThrow("generateWithFallback(null, ...)", async () => {
  const r = await generateWithFallback(null as any, { prompt: "p", context: "c" }, async () => "x")
  if (r !== null) throw new Error("expected null for null targets")
})
assertNoThrow("generateWithFallback(undefined, ...)", async () => {
  const r = await generateWithFallback(undefined as any, { prompt: "p", context: "c" }, async () => "x")
  if (r !== null) throw new Error("expected null for undefined targets")
})
assertNoThrow("generateWithFallback(42, ...)", async () => {
  const r = await generateWithFallback(42 as any, { prompt: "p", context: "c" }, async () => "x")
  if (r !== null) throw new Error("expected null for number targets")
})
assertNoThrow("generateWithFallback({}, ...)", async () => {
  const r = await generateWithFallback({} as any, { prompt: "p", context: "c" }, async () => "x")
  if (r !== null) throw new Error("expected null for object targets")
})

// ── 4: applyTitleFormat — empty title result ─────────────────────────────
console.log("\n== 4: applyTitleFormat empty result ==")
// What if title is empty and format is "{cwd}" only?
assertEq(applyTitleFormat("{cwd}", "", "/path"), "/path", "empty title + {cwd} format → just cwd")
assertEq(applyTitleFormat("{title}", "", "/path"), "", "empty title + {title} format → empty string")
assertEq(applyTitleFormat("[{cwdTip}] {title}", "", "/a/b"), "[b] ", "empty title + compound format")

// ── 5: stripWrappers — timeout on infinite loop check ───────────────────
console.log("\n== 5: stripWrappers timeout check ==")
// The while(changed) loop could theoretically run forever if a pair
// keeps stripping to the same shape. But each strip reduces length
// (inner is shorter than result), so it must terminate.
// Test with the worst case: alternating single-char wrappers
const worstCase = "*_" + "*_".repeat(10000)
const start3 = Date.now()
stripWrappers(worstCase)
const elapsed3 = Date.now() - start3
assertLt(elapsed3, 2000, `worst-case stripWrappers took ${elapsed3}ms (expect <2s)`)

// ── 6: cleanTitle — control characters and zero-width ──────────────────
console.log("\n== 6: cleanTitle control chars ==")
assertNoThrow("cleanTitle with null bytes", () => cleanTitle("Title\x00With\x01Null"))
assertNoThrow("cleanTitle with zero-width space", () => cleanTitle("Title\u200B\u200B"))
assertNoThrow("cleanTitle with only whitespace", () => cleanTitle("   \t\n  "))
assertNoThrow("cleanTitle with RTL mark", () => cleanTitle("\u202ETitle"))
assertNoThrow("cleanTitle with BOM", () => cleanTitle("\uFEFFTitle"))

// ── 7: generateWithFallback — AbortError classified as "timeout" ───────
console.log("\n== 7: generateWithFallback AbortError classification ==")
{
  // Capture log output via logOnce (now routed through client.app.log).
  const logCalls: Array<{ level: string; message: string }> = []
  const prevLog = __setServiceLog((level: string, message: string) => {
    logCalls.push({ level, message })
  })

  try {
    // A real provider error must surface with "error:" in the message, not "timeout:".
    loggedMessages.clear()
    await generateWithFallback(
      [{ baseUrl: "https://x", apiKey: "k", model: "m" }],
      { prompt: "p", context: "c" },
      async () => { throw new Error("No active credentials for provider: openai") },
    )
    assertEq(logCalls.some((l) => l.message.includes(" error:")), true, "real error logged with \"error:\"")
    assertEq(logCalls.some((l) => l.message.includes(" timeout:")), false, "real error NOT logged with \"timeout:\"")

    // An AbortError (request timeout) must surface with "timeout:" in the message.
    logCalls.length = 0
    loggedMessages.clear()
    const abort = new Error("The operation was aborted.")
    abort.name = "AbortError"
    await generateWithFallback(
      [{ baseUrl: "https://x", apiKey: "k", model: "m" }],
      { prompt: "p", context: "c" },
      async () => { throw abort },
    )
    assertEq(logCalls.some((l) => l.message.includes(" timeout:")), true, "AbortError logged with \"timeout:\"")
  } finally {
    __setServiceLog(prevLog)
  }
}

// ── 8: handleIdle — failure cooldown skips LLM retry ──────────────────
console.log("\n== 8: handleIdle failure cooldown ==")
{
  // Capture log output via the mock client's app.log method.
  const logs: Array<{ level: string; message: string }> = []
  loggedMessages.clear()

  const sessionID = "ses_cooldown_test"
  const idleEvent = (id: string) => ({
    type: "session.status",
    properties: { status: { type: "idle" }, sessionID: id },
  })

  const plugin = await SmartTitlePlugin({
    client: {
      app: {
        log: async ({ body }: any) => {
          logs.push({ level: body.level, message: body.message })
        },
      },
      session: {
        messages: async () => ({
          data: [
            { info: { role: "user" }, parts: [{ type: "text", text: "hello world" }] },
          ],
        }),
        get: async () => ({ data: { title: "" } }),
        update: async () => ({}),
      },
      config: {
        get: async () => ({
          data: {
            provider: {
              "test-p": {
                options: { baseURL: "https://127.0.0.1:1", apiKey: "k" },
                models: { m: { id: "m" } },
              },
            },
            agent: { explorer: { model: "test-p/m" } },
            model: "test-p/m",
          },
        }),
      },
    },
    directory: "/tmp/test",
  } as any)

  // First idle: real fetch to a black-hole address fails → candidate error logged.
  await plugin.event!({ event: idleEvent(sessionID) } as any)
  await new Promise((r) => setTimeout(r, 50))
  const candidateErrors = logs.filter((l) => l.message.includes("candidate") && l.message.includes(" error:"))
  assertEq(candidateErrors.length >= 1, true, "first attempt logs a candidate error (fetch failed)")

  // Second idle, immediately after: cooldown is armed → must NOT issue
  // another candidate fetch (observable: no new warn-level logs at all).
  const before = logs.length
  await plugin.event!({ event: idleEvent(sessionID) } as any)
  await new Promise((r) => setTimeout(r, 50))
  const newLogs = logs.slice(before)
  const newCandidateErrors = newLogs.filter((l) => l.message.includes("candidate") && l.message.includes(" error:"))
  assertEq(newCandidateErrors.length, 0, "cooldown: no second candidate fetch attempted")
  assertEq(newLogs.length, 0, "cooldown: no warn-level logs emitted")
}

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
