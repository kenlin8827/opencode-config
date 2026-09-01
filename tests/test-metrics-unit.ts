/**
 * Metrics TUI Plugin — Unit Tests (no host dependency)
 *
 * Coverage:
 *   - per-step token capture from message.part.updated step-finish parts
 *     (input/output/reasoning/cache read/write + cost)
 *   - agent attribution via "agent" parts and message.updated info.mode
 *   - model attribution via message.updated assistant messages
 *   - compaction event recording and counting
 *   - session.idle summary persistence (session-<id>.json) + dedupe
 *   - session.created → persist + clear state
 *   - JSONL persistence (kind: step / compaction records)
 *   - /metrics slash command: keymap registration, toast-based output,
 *     subcommand filtering (/metrics model), session-id grouping
 *
 * Run: bun run tests/test-metrics-unit.ts
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

const plugin = (await import("../plugins/tui/metrics")).default

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

// ─── Mock TUI host ──────────────────────────────────────────────────────────

const toasts: any[] = []
const eventHandlers: Record<string, Array<(e: any) => void>> = {}
const registeredCommands: any[] = []

const fakeApi = {
  event: {
    on: (type: string, handler: (e: any) => void) => {
      ;(eventHandlers[type] ??= []).push(handler)
      return () => {}
    },
  },
  keymap: {
    registerLayer: (layer: any) => {
      registeredCommands.push(...(layer.commands || []))
    },
  },
  ui: {
    toast: (t: any) => {
      toasts.push(t)
    },
  },
  route: {
    current: { name: "session", params: { sessionID: "s1" } },
  },
} as any

await plugin.tui!(fakeApi, undefined, {} as any)

const emit = (type: string, properties: any) => {
  for (const h of eventHandlers[type] || []) h({ type, properties })
}
const partEvent = (part: any) => emit("message.part.updated", { part })

// Plugin shape checks
assertEq(plugin.id, "metrics", "plugin id")
assert(typeof plugin.tui === "function", "tui entry exported")
assertEq(registeredCommands.length, 1, "one keymap command registered")
assertEq(registeredCommands[0].slashName, "metrics", "slash name registered (bare, TUI prepends /)")

// --- agent part switches the session to @code ---
partEvent({ type: "agent", sessionID: "s1", messageID: "m0", name: "code" })

// --- assistant message carries provider/model for attribution ---
emit("message.updated", { info: { role: "assistant", id: "msg1", sessionID: "s1", providerID: "llm-router", modelID: "pro", mode: "build" } })

// --- step 1: cache-heavy turn ---
partEvent({ type: "step-finish", sessionID: "s1", messageID: "msg1", cost: 0.01, tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 300, write: 50 } } })

// --- compaction mid-session ---
partEvent({ type: "compaction", sessionID: "s1", messageID: "m2", auto: true })

// --- step 2 after compaction, on a cheaper model ---
emit("message.updated", { info: { role: "assistant", id: "msg2", sessionID: "s1", providerID: "llm-router", modelID: "flash", mode: "code" } })
partEvent({ type: "step-finish", sessionID: "s1", messageID: "msg2", cost: 0.002, tokens: { input: 50, output: 10, reasoning: 0, cache: { read: 100, write: 0 } } })

// --- session goes idle: summary must be persisted ---
emit("session.idle", { sessionID: "s1" })

const metricsDir = join(fakeHome, ".config", "opencode", ".metrics")
assert(existsSync(metricsDir), "metrics dir created under redirected home")
let files = readdirSync(metricsDir)
assert(files.includes("session-s1.json"), "session summary file written on idle")
const summary = JSON.parse(readFileSync(join(metricsDir, "session-s1.json"), "utf-8"))

assertEq(summary.steps, 2, "summary.steps")
assertEq(summary.tokens.input, 150, "summary.tokens.input")
assertEq(summary.tokens.output, 30, "summary.tokens.output")
assertEq(summary.tokens.reasoning, 5, "summary.tokens.reasoning")
assertEq(summary.tokens.cacheRead, 400, "summary.tokens.cacheRead")
assertEq(summary.tokens.cacheWrite, 50, "summary.tokens.cacheWrite")
assertNear(summary.cost, 0.012, "summary.cost")
assertEq(summary.compactions, 1, "summary.compactions")
assertNear(summary.cacheHitRate, 400 / 550, "cacheHitRate = cacheRead / (input + cacheRead)")
assertEq(summary.inputTokensByAgent.build, 100, "per-agent input tokens (step 1 under info.mode=build)")
assertEq(summary.inputTokensByAgent.code, 50, "per-agent input tokens (step 2 under info.mode=code)")
assertEq(summary.inputTokensByModel["llm-router/pro"], 100, "per-model input tokens")
assertEq(summary.stepsByModel["llm-router/flash"], 1, "per-model steps")

// --- JSONL persistence ---
const jsonlFile = files.find((f) => f.startsWith("metrics-") && f.endsWith(".jsonl"))
assert(!!jsonlFile, "daily JSONL file exists")
const records = readFileSync(join(metricsDir, jsonlFile!), "utf-8").trim().split("\n").map((l) => JSON.parse(l))
const steps = records.filter((r) => r.kind === "step")
assertEq(steps.length, 2, "two step records")
assertEq(steps[0].agent, "build", "step attributed to agent (info.mode wins over agent part)")
assertEq(steps[0].model, "llm-router/pro", "step model attribution")
assertEq(steps[1].model, "llm-router/flash", "second step model attribution")
assertEq(steps[0].tokens.cacheRead, 300, "step cacheRead persisted")
assertEq(records.filter((r) => r.kind === "compaction").length, 1, "compaction record")

// --- a second idle with no new activity must not persist again ---
const stripEnd = (f: string) => {
  const j = JSON.parse(readFileSync(join(metricsDir, f), "utf-8"))
  delete j.endTime
  return JSON.stringify(j)
}
const before = stripEnd("session-s1.json")
emit("session.idle", { sessionID: "s1" })
assertEq(stripEnd("session-s1.json"), before, "idle without activity does not rewrite summary")

// --- /metrics slash command via run() ---
const runMetrics = (args?: string) => registeredCommands[0].run({ input: args } as any)

// Dispatch quirk: TUI puts the command NAME into ctx.input on plain /metrics.
// It must be treated as "no subcommand", not an unknown one.
toasts.length = 0
registeredCommands[0].run({ input: "metrics.show" } as any)
assertEq(toasts.length, 1, "one toast when dispatch passes command name as input")
assert(!toasts[0].message.includes("Unknown subcommand"), "command name in input is not treated as subcommand")

toasts.length = 0
runMetrics()
assertEq(toasts.length, 1, "one toast for /metrics with data")
const metricsText = toasts[0].message
assert(metricsText.includes("session(s)"), "output shows session count")
assert(metricsText.includes("[s1]"), "output contains session id")
assert(metricsText.includes("code@"), "output shows agent label (last message.updated mode)")
assert(metricsText.includes("\u2588"), "output contains bar chart characters")
assert(metricsText.includes("$0.0120"), "output contains cost")
assertEq(toasts[0].duration, 15000, "toast duration is 15 seconds")

// --- /metrics subcommand filtering + model dimension ---
// Build a second session with two models via info.mode attribution.
emit("message.updated", { info: { role: "assistant", id: "mm1", sessionID: "s2", providerID: "llm-router", modelID: "pro", mode: "build" } })
emit("message.updated", { info: { role: "assistant", id: "mm2", sessionID: "s2", providerID: "llm-router", modelID: "flash", mode: "code" } })
partEvent({ type: "step-finish", sessionID: "s2", messageID: "mm1", cost: 0.08, tokens: { input: 800, output: 100, reasoning: 20, cache: { read: 400, write: 50 } } })
partEvent({ type: "step-finish", sessionID: "s2", messageID: "mm2", cost: 0.01, tokens: { input: 200, output: 50, reasoning: 0, cache: { read: 50, write: 0 } } })

// /metrics agent → treated as default (session grouping)
toasts.length = 0
runMetrics("agent")
assertEq(toasts.length, 1, "one toast for /metrics agent")
assert(toasts[0].message.includes("session(s)"), "agent view shows session count")
assert(toasts[0].message.includes("\u2588"), "agent view shows bar chart")

// /metrics model → session grouping + per-session model breakdown
toasts.length = 0
runMetrics("model")
assertEq(toasts.length, 1, "one toast for /metrics model")
const modelText = toasts[0].message
assert(modelText.includes("llm-router/pro"), "model filter shows full model name")
assert(modelText.includes("llm-router/flash"), "model filter shows second model")

// /metrics unknown → usage hint
toasts.length = 0
runMetrics("bogus")
assertEq(toasts.length, 1, "one toast for unknown subcommand")
assert(toasts[0].message.includes("Unknown subcommand"), "unknown subcommand shows error")
assert(toasts[0].message.includes("Usage:"), "unknown subcommand shows usage hint")

// /metrics (no filter) → all sessions shown
toasts.length = 0
runMetrics()
const fullText = toasts[0].message
assert(fullText.includes("[s1]"), "full output shows s1 session")
assert(fullText.includes("[s2]"), "full output shows s2 session")
assert(fullText.includes("session(s)"), "shows session count")

// --- session.created (/new) → persist + clear state ---
partEvent({ type: "step-finish", sessionID: "s2", messageID: "mm3", cost: 0.005, tokens: { input: 100, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } })
emit("session.created", { sessionID: "s3" })
files = readdirSync(metricsDir)
assert(files.includes("session-s2.json"), "session.created persists active session")

toasts.length = 0
runMetrics()
assert(toasts[0].message.includes("No token data"), "state cleared after session.created")

// --- fresh session after /new collects again ---
emit("message.updated", { info: { role: "assistant", id: "nm1", sessionID: "s3", providerID: "google", modelID: "gemini", mode: "architect" } })
partEvent({ type: "step-finish", sessionID: "s3", messageID: "nm1", cost: 0.03, tokens: { input: 600, output: 90, reasoning: 5, cache: { read: 300, write: 40 } } })
toasts.length = 0
runMetrics()
assert(toasts[0].message.includes("[s3]"), "new session data collected after reset")
assert(toasts[0].message.includes("architect@"), "new session agent label from info.mode")

// --- cleanup ---
rmSync(fakeHome, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
