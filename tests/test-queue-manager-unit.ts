/**
 * Queue Manager Plugin — Unit Tests (no API dependency)
 *
 * Validates the pure queue-computation helpers of plugins/queue-manager.ts:
 *   - queue definition: user messages without an assistant reply
 *   - exclusions: compaction/subtask messages, all-ignored feedback messages
 *   - preview/visibleText/age formatting
 *
 * Run: npx tsx tests/test-queue-manager-unit.ts   (or: bun tests/test-queue-manager-unit.ts)
 */

import { computeQueued, visibleText, preview, age, isCancelled, type WithParts } from "../plugins/queue-manager"

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

// ─── Fixtures ─────────────────────────────────────────────────────────────

let seq = 0
function nextId(): string {
  seq++
  return `msg_${String(seq).padStart(4, "0")}`
}

function userMsg(created: number, parts: unknown[] = []): WithParts {
  return {
    info: {
      id: nextId(),
      sessionID: "ses_test",
      role: "user",
      time: { created },
      agent: "build",
      model: { providerID: "p", modelID: "m" },
    } as never,
    parts: parts as never,
  }
}

function assistantMsg(created: number, parentID: string, finish?: string): WithParts {
  return {
    info: {
      id: nextId(),
      sessionID: "ses_test",
      role: "assistant",
      time: { created },
      parentID,
      modelID: "m",
      providerID: "p",
      mode: "build",
      agent: "build",
      path: { cwd: "/x", root: "/x" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      finish,
    } as never,
    parts: [],
  }
}

function textPart(text: string, ignored = false): unknown {
  return {
    id: nextId(),
    sessionID: "ses_test",
    messageID: "ignored-in-fixture",
    type: "text",
    text,
    ignored,
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  1. Queue definition: unanswered user messages only
// ═════════════════════════════════════════════════════════════════════════

function test01_QueueDefinition() {
  section("01: queue = user messages without an assistant reply")

  const t = Date.now()
  const answered = userMsg(t - 60_000, [textPart("hello")])
  const reply = assistantMsg(t - 55_000, answered.info.id, "stop")
  const queued = userMsg(t - 10_000, [textPart("while you were busy…")])

  const result = computeQueued([answered, reply, queued])
  assert(result.length === 1, "exactly one queued message")
  assert(result[0].messageID === queued.info.id, "the unanswered message is queued")
  assert(result[0].text === "while you were busy…", "text extracted from parts")
}

function test02_ErroredAssistantStillCountsAsReply() {
  section("02: assistant reply without finish still counts as answered")

  const t = Date.now()
  const asked = userMsg(t - 60_000, [textPart("hello")])
  // errored/interrupted assistant: no finish, but parentID links it
  const reply = assistantMsg(t - 55_000, asked.info.id)

  const result = computeQueued([asked, reply])
  assert(result.length === 0, "message with an unfinished reply is NOT queued")
}

function test03_SortedByCreatedAscending() {
  section("03: queue sorted oldest → newest")

  const t = Date.now()
  const q2 = userMsg(t - 5_000, [textPart("second")])
  const q1 = userMsg(t - 30_000, [textPart("first")])
  const q3 = userMsg(t - 1_000, [textPart("third")])

  const result = computeQueued([q2, q1, q3])
  assert(result.length === 3, "three queued messages")
  assert(
    result[0].text === "first" && result[1].text === "second" && result[2].text === "third",
    "sorted by time.created ascending",
  )
}

// ═════════════════════════════════════════════════════════════════════════
//  4. Exclusions
// ═════════════════════════════════════════════════════════════════════════

function test04_CompactionAndSubtaskExcluded() {
  section("04: internal messages (compaction/subtask) excluded")

  const t = Date.now()
  const compaction = userMsg(t - 10_000, [{ id: "p1", type: "compaction" }])
  const subtask = userMsg(t - 9_000, [{ id: "p2", type: "subtask", prompt: "x", description: "y", agent: "a" }])
  const real = userMsg(t - 8_000, [textPart("real queued")])

  const result = computeQueued([compaction, subtask, real])
  assert(result.length === 1, "only the real user prompt is queued")
  assert(result[0].text === "real queued", "internal messages filtered out")
}

function test05_AllIgnoredTextExcluded() {
  section("05: messages whose text parts are all ignored (feedback) excluded")

  const t = Date.now()
  const feedback = userMsg(t - 10_000, [textPart("plugin feedback", true), textPart("more feedback", true)])
  const mixed = userMsg(t - 9_000, [textPart("visible", false), textPart("hidden", true)])

  const result = computeQueued([feedback, mixed])
  assert(result.length === 1, "all-ignored message filtered, partially-ignored kept")
  assert(result[0].text === "visible", "visibleText skips ignored parts")
}

function test06_TombstoneCancelledExcluded() {
  section("06: tombstone-cancelled messages excluded (busy-strip fallback)")

  const TOMBSTONE =
    "[This queued message was cancelled via /queued — take no action and reply briefly.]"
  const t = Date.now()
  const cancelled = userMsg(t - 10_000, [textPart(TOMBSTONE)])
  const live = userMsg(t - 9_000, [textPart("still queued")])

  const result = computeQueued([cancelled, live])
  assert(result.length === 1, "tombstone message filtered out of the queue")
  assert(result[0].text === "still queued", "live message kept")
  assert(isCancelled(cancelled.parts as never), "isCancelled detects tombstone")
  assert(!isCancelled(live.parts as never), "isCancelled false for normal text")
}

// ═════════════════════════════════════════════════════════════════════════
//  6. Formatting helpers
// ═════════════════════════════════════════════════════════════════════════

function test06_Preview() {
  section("06: preview truncation and attachment-only fallback")

  assert(preview("hello\n\nworld") === "hello world", "whitespace flattened")
  const long = "x".repeat(200)
  const p = preview(long, 90)
  assert(p.length === 90 && p.endsWith("…"), "truncated to max with ellipsis")
  assert(preview("") === "[attachment only — no text]", "empty text fallback")
}

function test07_Age() {
  section("07: age formatting")

  const now = 1_000_000_000_000
  assert(age(now - 5_000, now) === "5s ago", "seconds")
  assert(age(now - 120_000, now) === "2m ago", "minutes")
  assert(age(now - 3 * 3_600_000, now) === "3h ago", "hours")
  assert(age(now + 10_000, now) === "0s ago", "future timestamps clamped to 0s")
}

function test08_VisibleTextJoinsParts() {
  section("08: visibleText joins non-ignored parts")

  const parts = [textPart("line one"), textPart("ignored", true), textPart("line two")]
  assert(visibleText(parts as never) === "line one\nline two", "joins with newline, skips ignored")
  assert(visibleText([]) === "", "no parts → empty string")
}

// ─── Run ──────────────────────────────────────────────────────────────────

test01_QueueDefinition()
test02_ErroredAssistantStillCountsAsReply()
test03_SortedByCreatedAscending()
test04_CompactionAndSubtaskExcluded()
test05_AllIgnoredTextExcluded()
test06_TombstoneCancelledExcluded()
test06_Preview()
test07_Age()
test08_VisibleTextJoinsParts()

console.log(`\n${"═".repeat(60)}`)
console.log(`  Result: ${passed} passed, ${failed} failed`)
console.log(`${"═".repeat(60)}`)
process.exit(failed > 0 ? 1 : 0)
