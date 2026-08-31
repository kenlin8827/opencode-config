/**
 * Metrics Plugin — Unit Tests (no host dependency)
 *
 * Coverage:
 *   - per-step token capture from message.part.updated step-finish parts
 *     (input/output/reasoning/cache read/write + cost)
 *   - agent attribution via "agent" message parts (steps + tool fallback)
 *   - model attribution via message.updated assistant messages
 *   - compaction event recording and counting
 *   - session.idle summary: totals, cache hit rate, per-agent input tokens
 *   - JSONL persistence (kind: tool / step / compaction records)
 *
 * Run: bun run tests/test-metrics-unit.ts   (or: npx tsx tests/test-metrics-unit.ts)
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Redirect homedir BEFORE importing the plugin: METRICS_DIR is computed at
// module load from os.homedir(), which reads USERPROFILE (win) / HOME (posix).
const repoRoot = join(fileURLToPath(import.meta.url), "..", "..")
const fakeHome = mkdtempSync(join(repoRoot, "tests", ".tmp-metrics-"))
process.env.USERPROFILE = fakeHome
process.env.HOME = fakeHome

const { MetricsPlugin } = await import("../plugins/metrics")

let passed = 0
let failed = 0

function assert(cond: unknown, label: string) {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ✗ FAIL: ${label}`)
  }
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  assert(actual === expected, `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`)
}

function assertNear(actual: number, expected: number, label: string) {
  assert(Math.abs(actual - expected) < 1e-9, `${label} (got ${actual}, want ${expected})`)
}

const logs: any[] = []
const fakeClient = { app: { log: async (req: any) => { logs.push(req) } } } as any

const hooks = await MetricsPlugin({ client: fakeClient } as any)
const emit = (event: any) => hooks.event!({ event } as any)
const partEvent = (part: any) => emit({ type: "message.part.updated", properties: { part } })

// --- agent part switches the session to @code ---
await partEvent({ type: "agent", sessionID: "s1", messageID: "m0", name: "code" })

// --- one tool call (agent resolved from the session's current agent) ---
await hooks["tool.execute.before"]!({ tool: "read" } as any, { sessionID: "s1", messageID: "m1" } as any)
await hooks["tool.execute.after"]!({ tool: "read" } as any, { sessionID: "s1", messageID: "m1" } as any)

// --- assistant message carries provider/model for attribution ---
await emit({ type: "message.updated", properties: { info: { role: "assistant", id: "msg1", sessionID: "s1", providerID: "llm-router", modelID: "pro" } } })

// --- step 1: cache-heavy turn ---
await partEvent({ type: "step-finish", sessionID: "s1", messageID: "msg1", cost: 0.01, tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 300, write: 50 } } })

// --- compaction mid-session ---
await partEvent({ type: "compaction", sessionID: "s1", messageID: "m2", auto: true })

// --- step 2 after compaction, on a cheaper model ---
await emit({ type: "message.updated", properties: { info: { role: "assistant", id: "msg2", sessionID: "s1", providerID: "llm-router", modelID: "flash" } } })
await partEvent({ type: "step-finish", sessionID: "s1", messageID: "msg2", cost: 0.002, tokens: { input: 50, output: 10, reasoning: 0, cache: { read: 100, write: 0 } } })

// --- session goes idle: summary must fire ---
await emit({ type: "session.idle", properties: { sessionID: "s1" } })

assertEq(logs.length, 1, "one summary logged on session.idle")
const summary = logs[0].body.extra

assertEq(summary.totalCalls, 1, "summary.totalCalls")
assertEq(summary.callsByAgent.code, 1, "tool call attributed to session agent")
assertEq(summary.steps, 2, "summary.steps")
assertEq(summary.tokens.input, 150, "summary.tokens.input")
assertEq(summary.tokens.output, 30, "summary.tokens.output")
assertEq(summary.tokens.reasoning, 5, "summary.tokens.reasoning")
assertEq(summary.tokens.cacheRead, 400, "summary.tokens.cacheRead")
assertEq(summary.tokens.cacheWrite, 50, "summary.tokens.cacheWrite")
assertNear(summary.cost, 0.012, "summary.cost")
assertEq(summary.compactions, 1, "summary.compactions")
assertNear(summary.cacheHitRate, 400 / 550, "cacheHitRate = cacheRead / (input + cacheRead)")
assertEq(summary.inputTokensByAgent.code, 150, "per-agent input tokens")
assert(String(logs[0].body.message).includes("hit="), "log message carries cache hit rate")

// --- JSONL persistence ---
const metricsDir = join(fakeHome, ".config", "opencode", ".metrics")
assert(existsSync(metricsDir), "metrics dir created under redirected home")
const files = readdirSync(metricsDir)
const jsonlFile = files.find((f) => f.startsWith("metrics-") && f.endsWith(".jsonl"))
assert(!!jsonlFile, "daily JSONL file exists")
const records = readFileSync(join(metricsDir, jsonlFile!), "utf-8").trim().split("\n").map((l) => JSON.parse(l))

assertEq(records.filter((r) => r.kind === "tool").length, 1, "one tool record")
const steps = records.filter((r) => r.kind === "step")
assertEq(steps.length, 2, "two step records")
assertEq(steps[0].agent, "code", "step attributed to agent")
assertEq(steps[0].model, "llm-router/pro", "step model attribution")
assertEq(steps[1].model, "llm-router/flash", "second step model attribution")
assertEq(steps[0].tokens.cacheRead, 300, "step cacheRead persisted")
assertEq(records.filter((r) => r.kind === "compaction").length, 1, "compaction record")
assert(files.some((f) => f === "session-s1.json"), "session summary file written")

// --- a second idle with no new activity must not log again ---
await emit({ type: "session.idle", properties: { sessionID: "s1" } })
assertEq(logs.length, 1, "idle without activity logs nothing")

// --- cleanup ---
rmSync(fakeHome, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
