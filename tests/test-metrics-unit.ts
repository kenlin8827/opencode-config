/**
 * Metrics TUI Plugin — Unit Tests (no host dependency)
 *
 * The plugin is a pure view over opencode server data: /metrics queries the
 * conversation tree (root + subagents) via api.client and formats token/cost
 * economics. No local collection or persistence.
 *
 * Coverage:
 *   - keymap registration (slash name)
 *   - conversation tree walk: root session, parentID climbing, children (subagents)
 *   - per-session aggregation from assistant messages: cost, tokens
 *     (input/output/reasoning/cache read+write), steps + compactions via parts,
 *     agent attribution via mode/agent
 *   - display: totals line (hit with 1 decimal), per-session block layout,
 *     cache hit rates, share bars, main/sub tags
 *   - /metrics model → per-session model breakdown
 *   - subcommand parsing (name-token skipping, args sources)
 *   - empty tree / server failure → graceful toasts
 *
 * Run: bun run tests/test-metrics-unit.ts
 */

type SessionInfo = { id: string; parentID?: string; agent?: string }
type FakeMessage = { info: any; parts?: any[] }

const sessions: Record<string, SessionInfo> = {}
const messages: Record<string, FakeMessage[]> = {}
const children: Record<string, string[]> = {}

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

// ─── Mock TUI host ──────────────────────────────────────────────────────────

const toasts: any[] = []
const registeredCommands: any[] = []

let routeSessionID = "s1"

const fakeApi = {
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
    get current() {
      return { name: "session", params: { sessionID: routeSessionID } }
    },
  },
  client: {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => ({ data: sessions[sessionID] }),
      children: async ({ sessionID }: { sessionID: string }) => ({
        data: (children[sessionID] || []).map((id) => sessions[id]),
      }),
      messages: async ({ sessionID }: { sessionID: string }) => ({ data: messages[sessionID] || [] }),
    },
  },
} as any

// ─── Fixtures: mirror the reference screenshot ──────────────────────────────
// s1 = lite@main (4 steps), s2 = explore@sub (3 steps), c0 = child for climb test.
// Totals (incl. c0: 100 in / $0.0001): 22,853 in / 1,970 out / 27,008 cr / $0.0031 / 8 steps | hit 54.2%

const assistant = (over: Record<string, unknown>, steps = 1): FakeMessage => ({
  info: { role: "assistant", ...over },
  parts: Array.from({ length: steps }, () => ({ type: "step-finish" })),
})

// lite@main: 11,702 in / 984 out / 7,232 cr / $0.001 / 4 steps → hit 38.2%
sessions.s1 = { id: "s1", agent: "build" }
messages.s1 = [
  assistant({ mode: "lite", agent: "lite", providerID: "anthropic", modelID: "claude-pro", cost: 0.0006, tokens: { input: 5851, output: 492, reasoning: 0, cache: { read: 3616, write: 0 } } }, 2),
  assistant({ mode: "lite", agent: "lite", providerID: "anthropic", modelID: "claude-pro", cost: 0.0004, tokens: { input: 5851, output: 492, reasoning: 0, cache: { read: 3616, write: 0 } } }, 2),
]

// explore@sub: 11,051 in / 976 out / 19,776 cr / $0.002 / 3 steps → hit 64.2%
sessions.s2 = { id: "s2", parentID: "s1", agent: "task" }
messages.s2 = [
  assistant({ mode: "explore", agent: "explore", providerID: "google", modelID: "gemini", cost: 0.0015, tokens: { input: 6000, output: 500, reasoning: 10, cache: { read: 10000, write: 0 } } }, 2),
  assistant({ mode: "explore", agent: "explore", providerID: "google", modelID: "gemini-flash", cost: 0.0005, tokens: { input: 5051, output: 476, reasoning: 0, cache: { read: 9776, write: 0 } } }, 1),
]

// child session of s1 (exercises parentID climbing when it is the route target)
sessions.c0 = { id: "c0", parentID: "s1", agent: "code" }
messages.c0 = [assistant({ mode: "code", agent: "code", providerID: "anthropic", modelID: "claude-pro", cost: 0.0001, tokens: { input: 100, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } }, 1)]

children.s1 = ["s2", "c0"]

const plugin = (await import("../plugins/tui/metrics")).default

await plugin.tui!(fakeApi, undefined, {} as any)

const runMetrics = (args?: string) => registeredCommands[0].run({ input: args } as any)
const lastToast = () => toasts[toasts.length - 1]

// --- plugin shape checks ---
assertEq(plugin.id, "metrics", "plugin id")
assert(typeof plugin.tui === "function", "tui entry exported")
assertEq(registeredCommands.length, 1, "one keymap command registered")
assertEq(registeredCommands[0].slashName, "metrics", "slash name registered (bare, TUI prepends /)")

// --- /metrics: tree aggregation + layout ---
toasts.length = 0
await runMetrics("metrics.show")
assertEq(toasts.length, 1, "one toast for /metrics with data")
const text = toasts[0].message
assert(text.includes("session(s)"), "shows session count")
assert(text.includes("Total: 51,831 tok | 22,853 in / 1,970 out / 27,008 cr / 0 cw / $0.0031 / 8 steps | hit 54.2%"), `totals line exact (got: ${text.split("\n")[0]})`)
assert(text.includes("lite@main  [s1]"), "main session header: agent@tag  [id]")
assert(text.includes("explore@sub  [s2]"), "sub session header")
assert(text.includes("11,702 in / 984 out / $0.0010 / 4 steps"), "s1 token line")
assert(text.includes("cache: 7,232 read / 0 write | hit 38.2%"), "s1 cache line, hit with 1 decimal")
assert(text.includes("cache: 19,776 read / 0 write | hit 64.2%"), "s2 cache line")
assert(text.includes("cache: 0 read / 0 write | hit 0.0%"), "zero-cache session still shows cache line (c0)")
assert(text.includes("51.2%"), "s1 share bar pct")
assert(text.includes("\u2588"), "bar chart characters present")
assertEq(toasts[0].duration, 15000, "toast duration is 15 seconds")

// --- /metrics model → per-session model breakdown ---
toasts.length = 0
await runMetrics("metrics.show model")
const modelText = toasts[0].message
assert(modelText.includes("anthropic/claude-pro"), "model filter shows model name")
assert(modelText.includes("google/gemini-flash"), "model filter shows second model")

// --- parentID climbing: route on a child session still shows the whole tree ---
routeSessionID = "c0"
toasts.length = 0
await runMetrics()
const climbText = toasts[0].message
assert(climbText.includes("[s1]") && climbText.includes("[c0]") && climbText.includes("[s2]"), "route on child walks up to root and includes whole tree")
assert(climbText.includes("code@main"), "current session (even if child) tagged main")
routeSessionID = "s1"

// --- no data anywhere → graceful message ---
const keep = { ...messages }
for (const k of Object.keys(messages)) delete messages[k]
toasts.length = 0
await runMetrics()
assertEq(toasts.length, 1, "one toast when tree has no data")
assert(toasts[0].message.includes("No token data"), "empty tree shows no-data message")
Object.assign(messages, keep)

// --- server failure on root lookup → graceful message, not a crash ---
const realGet = fakeApi.client.session.get
fakeApi.client.session.get = async () => {
  throw new Error("boom")
}
toasts.length = 0
await runMetrics()
assertEq(toasts.length, 1, "one toast on server error")
assert(toasts[0].message.includes("No token data") || toasts[0].message.includes("Failed"), "server error degrades gracefully")
fakeApi.client.session.get = realGet

// --- unknown subcommand → usage hint ---
toasts.length = 0
await runMetrics("metrics.show bogus")
assertEq(toasts.length, 1, "one toast for unknown subcommand")
assert(toasts[0].message.includes("Unknown subcommand"), "unknown subcommand shows error")
assert(toasts[0].message.includes("Usage:"), "unknown subcommand shows usage hint")

// --- parseSubcommand unit coverage ---
const { parseSubcommand } = await import("../plugins/tui/metrics")
assertEq(parseSubcommand({ input: "metrics.show" } as any), null, "bare command name → no subcommand")
assertEq(parseSubcommand({ input: "metrics.show model" } as any), "model", "trailing arg extracted")
assertEq(parseSubcommand({ data: { args: ["agent"] } } as any), "agent", "data.args wins")
assertEq(parseSubcommand(null), null, "null ctx → null")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
