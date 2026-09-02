/**
 * Usage TUI Plugin — Unit Tests (no host dependency)
 *
 * The plugin is a pure view over opencode server data: /usage queries the
 * conversation via api.client and formats token/cost economics. No local
 * collection or persistence.
 *
 * Coverage:
 *   - keymap registration (slash name)
 *   - default single-session view: tokens (in/out/reasoning), cost, steps,
 *     compactions via parts, cache hit rate, always-on model breakdown
 *   - /usage all tree view: root session, parentID climbing, children
 *     (subagents), per-session aggregation, totals line, share bars
 *   - /usage model → tree view with per-session model breakdown
 *   - subcommand parsing (name-token skipping, args sources)
 *   - empty tree / server failure → graceful toasts
 *
 * Run: bun run tests/test-usage-unit.ts
 */

import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeFileSync, rmSync } from "node:fs"

type SessionInfo = { id: string; parentID?: string; agent?: string }
type FakeMessage = { info: any; parts?: any[] }

// Isolate the shared ocp.jsonc user config for this run — set BEFORE the
// dynamic plugin import below (i18n now persists language there).
process.env.OCP_CONFIG_PATH = join(tmpdir(), `ocp-usage-test-${process.pid}.jsonc`)

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
const registeredBindings: any[] = []
const dialogRenders: Array<() => unknown> = []
const dialogSizes: string[] = []

let routeSessionID = "s1"

const fakeApi = {
  keymap: {
    registerLayer: (layer: any) => {
      registeredCommands.push(...(layer.commands || []))
      registeredBindings.push(...(layer.bindings || []))
    },
  },
  ui: {
    toast: (t: any) => {
      toasts.push(t)
    },
    dialog: {
      replace: (render: () => unknown) => {
        dialogRenders.push(render)
      },
      clear: () => {},
      setSize: (s: string) => { dialogSizes.push(s) },
    },
  },
  kv: (() => {
    const store = new Map<string, unknown>()
    return {
      get: (k: string) => store.get(k),
      set: (k: string, v: unknown) => store.set(k, v),
    }
  })(),
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
// 2 compaction parts → exercise the compactions counter in the single view
messages.s2[0].parts.push({ type: "compaction" })
messages.s2[1].parts.push({ type: "compaction" })

// child session of s1 (exercises parentID climbing when it is the route target)
sessions.c0 = { id: "c0", parentID: "s1", agent: "code" }
messages.c0 = [assistant({ mode: "code", agent: "code", providerID: "anthropic", modelID: "claude-pro", cost: 0.0001, tokens: { input: 100, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } }, 1)]

children.s1 = ["s2", "c0"]

const plugin = (await import("../plugins/tui/usage")).default

await plugin.tui!(fakeApi, undefined, {} as any)

// Force "en" after initI18n's env detection so string assertions are
// deterministic regardless of the host LANG/LC_ALL.
const { setLocale } = await import("../plugins/tui/i18n")
setLocale(fakeApi, "en")

const runUsage = (args?: string) => registeredCommands[0].run({ input: args } as any)
const lastToast = () => toasts[toasts.length - 1]
// openTable is fire-and-forget; let its promise chain settle before asserting.
const tick = () => new Promise((r) => setTimeout(r, 0))

// --- plugin shape checks ---
assertEq(plugin.id, "usage", "plugin id")
assert(typeof plugin.tui === "function", "tui entry exported")
assertEq(registeredCommands.length, 6, "usage.show + 3 dimensions + prev/next registered")
assertEq(registeredCommands[0].slashName, "usage", "slash name registered (bare, TUI prepends /)")

// --- /usage: opens the tabbed session view dialog directly, not a toast ---
toasts.length = 0
dialogRenders.length = 0
await runUsage("usage.show")
await tick()
assertEq(toasts.length, 0, "/usage with data shows no toast")
assertEq(dialogRenders.length, 1, "tabbed usage dialog opened")

// --- tab keymap: 1/2/3 jump to a dimension, left/right cycle ---
const binding = (key: string) => registeredBindings.find((b) => b.key.split(",").includes(key))
for (const [key, cmd] of [["1", "usage.dim.session"], ["2", "usage.dim.agent"], ["3", "usage.dim.model"], ["left", "usage.dim.prev"], ["right", "usage.dim.next"]] as const) {
  assertEq(binding(key)?.cmd, cmd, `key "${key}" bound to ${cmd}`)
}
for (const name of ["usage.dim.session", "usage.dim.agent", "usage.dim.model", "usage.dim.prev", "usage.dim.next"]) {
  assert(registeredCommands.some((c) => c.name === name), `tab command "${name}" registered`)
}

// --- numbered tab strip + composed view (official TabSelect style underline) ---
const { formatByDimension, renderDimensionView, fitDialogSize } = await import("../plugins/tui/usage")
const sessionTable = await formatByDimension(fakeApi.client, "s1", "session")
const view = renderDimensionView(sessionTable, "agent")
const viewLines = view.split("\n")
assertEq(viewLines[0], "(1)By session   (2)By agent   (3)By model", "tab strip labels carry hotkey numbers (no space after number)")
// "(2)By agent" sits at offset width("(1)By session") + 3; the bar covers exactly its width
assertEq(viewLines[1], " ".repeat(16) + "▬".repeat(11), "underline bar under the active tab")
assertEq(viewLines[2], "", "blank line between strip and table")
assert(!view.includes("1/2/3 or"), "hint line removed (numbers are self-documenting)")

// --- OCP points fallback: cost 0 + plan provider → credits column (积分) ---
// Point the loader at an isolated fixture file so tests don't touch real config.
const pointsPath = join(tmpdir(), `ocp-points-test-${process.pid}.jsonc`)
writeFileSync(pointsPath, `{
  "providers": {
    "zhipuai-coding-plan": {
      "credits": true,
      "divisor": 10000,
      "rates": { "glm-5.3-flash": { "input": 2.3, "cached": 0.56, "output": 8 } }
    }
  }
}`)
process.env.OCP_POINTS_PATH = pointsPath
// Force the points loader to re-read under the new OCP_POINTS_PATH.
const { resetCostsCache } = await import("../plugins/tui/usage")
resetCostsCache()

sessions.z1 = { id: "z1", agent: "build" }
// 10000×2.3 + 20000×0.56 + 5000×8 / 10000 = (23000 + 11200 + 40000) / 10000 = 7.42 积分
messages.z1 = [assistant({ mode: "build", agent: "build", providerID: "zhipuai-coding-plan", modelID: "glm-5.3-flash", cost: 0, tokens: { input: 10000, output: 5000, cache: { read: 20000, write: 0 } } }, 1)]
const ptsText = await formatByDimension(fakeApi.client, "z1", "session")
assert(ptsText.includes("credits") && ptsText.includes("7.42"), "credits column present for plan sessions")
assert(ptsText.includes("7.42"), `points computed via OCP dataset (got: ${ptsText.split("\n").join(" | ")})`)
assert(ptsText.includes("$0.0000"), "server cost still shown as-is (no invented dollars)")
delete sessions.z1
delete messages.z1
rmSync(pointsPath, { force: true })
delete process.env.OCP_POINTS_PATH
resetCostsCache()

// --- non-plan provider with cost 0 → no points, plain $0.0000 ---
sessions.z2 = { id: "z2", agent: "build" }
messages.z2 = [assistant({ mode: "build", agent: "build", providerID: "anthropic", modelID: "claude-pro", cost: 0, tokens: { input: 1000, output: 100, cache: { read: 10000, write: 0 } } }, 1)]
const nonPlanText = await formatByDimension(fakeApi.client, "z2", "session")
assert(nonPlanText.includes("$0.0000") && !nonPlanText.includes("积分"), "non-plan cost 0 stays plain $0.0000 without credits column")
delete sessions.z2
delete messages.z2

// --- auto-fit dialog width ---
assertEq(fitDialogSize("a".repeat(10)), "medium", "narrow content → medium")
assertEq(fitDialogSize("a".repeat(70)), "large", "medium-wide content → large")
assertEq(fitDialogSize("a".repeat(100)), "xlarge", "wide content → xlarge")

// --- dimension tables via formatByDimension (host renders the dialog) ---

// session dimension: one row per session + total row
const sessionText = await formatByDimension(fakeApi.client, "s1", "session")
for (const header of ["session", "in", "out", "cached", "steps", "cost", "share"]) {
  assert(sessionText.includes(header), `session table has "${header}" column`)
}
assert(sessionText.includes("🧠 lite"), "main session row (emoji icon)")
assert(sessionText.includes("🦾 explore"), "subagent session row (emoji icon)")
assert(!sessionText.includes("@"), "no @ concatenation in session names")
assert(!sessionText.includes("main agent") && !sessionText.includes("主 agent"), "legend line removed")
assert(sessionText.includes("11.7k") && sessionText.includes("11.1k") && sessionText.includes("100"), "per-session in values")
assert(sessionText.includes("22.9k") && sessionText.includes("1,970") && sessionText.includes("27k"), "total row sums")
assert(sessionText.includes("$0.0031"), "total row cost")
assert(sessionText.includes("hit 54.2%") && sessionText.includes("total"), "total row with hit rate")
assert(sessionText.includes("51.2%"), "s1 share pct")
assert(sessionText.includes("\u2588"), "bar characters present")
assert(!sessionText.includes("cache-write") && !sessionText.includes("reasoning"), "display limited to 3 numbers: in / out / cached")

// agent dimension: sessions grouped by agent attribution
const agentText = await formatByDimension(fakeApi.client, "s1", "agent")
for (const header of ["agent", "sessions", "in", "out", "cached", "cost", "share"]) {
  assert(agentText.includes(header), `agent table has "${header}" column`)
}
assert(agentText.includes("lite") && agentText.includes("explore"), "agent rows present")
assert(agentText.includes("11.7k") && agentText.includes("11.1k"), "per-agent input sums")
assert(agentText.includes("19.8k"), "explore cached-in sum")
assert(!agentText.includes("build") || agentText.indexOf("explore") < agentText.indexOf("build"), "fixture agent 'build' never used by messages")

// model dimension: tokens/cost summed across the whole tree (same columns as sessions)
const modelText = await formatByDimension(fakeApi.client, "s1", "model")
for (const header of ["model", "sessions", "in", "out", "cached", "cost", "share"]) {
  assert(modelText.includes(header), `model table has "${header}" column`)
}
assert(modelText.includes("anthropic/claude-pro"), "model row: claude-pro")
assert(modelText.includes("11.8k"), "claude-pro input summed across s1+c0 (11702+100)")
assert(modelText.includes("994") && modelText.includes("7,232"), "claude-pro output/cache summed (984+10, 7232+0)")
assert(modelText.includes("google/gemini-flash"), "model row: gemini-flash")

// --- /usage all|agent|model → opens the corresponding table dialog ---
toasts.length = 0
dialogRenders.length = 0
await runUsage("usage.show all")
await tick()
assertEq(toasts.length, 0, "/usage all shows no toast")
assertEq(dialogRenders.length, 1, "session table dialog opened")

// --- parentID climbing: route on a child session still shows the whole tree ---
routeSessionID = "c0"
const climbText = await formatByDimension(fakeApi.client, "c0", "session")
assert(climbText.includes("🦾 lite") && climbText.includes("🦾 explore") && climbText.includes("🧠 code"), "route on child walks up to root and includes whole tree")
assert(climbText.includes("🧠 code"), "current session (even if child) gets the main icon")
routeSessionID = "s1"

// --- no data anywhere → graceful message ---
const keep = { ...messages }
for (const k of Object.keys(messages)) delete messages[k]
toasts.length = 0
await runUsage("usage.show all")
await tick()
assertEq(toasts.length, 1, "one toast when session has no data")
assert(toasts[0].message.includes("No token data"), "empty session shows no-data message")
Object.assign(messages, keep)

// --- server failure on root lookup → graceful message, not a crash ---
// (session.get is only on the tree path, so exercise /usage all)
const realGet = fakeApi.client.session.get
fakeApi.client.session.get = async () => {
  throw new Error("boom")
}
toasts.length = 0
await runUsage("usage.show all")
await tick()
assertEq(toasts.length, 1, "one toast on server error")
assert(toasts[0].message.includes("No token data") || toasts[0].message.includes("Failed"), "server error degrades gracefully")
fakeApi.client.session.get = realGet

// --- unknown subcommand → usage hint ---
toasts.length = 0
await runUsage("usage.show bogus")
assertEq(toasts.length, 1, "one toast for unknown subcommand")
assert(toasts[0].message.includes("Unknown subcommand"), "unknown subcommand shows error")
assert(toasts[0].message.includes("Usage:"), "unknown subcommand shows usage hint")

// --- parseSubcommand unit coverage ---
const { parseSubcommand } = await import("../plugins/tui/usage")
assertEq(parseSubcommand({ input: "usage.show" } as any), null, "bare command name → no subcommand")
assertEq(parseSubcommand({ input: "usage.show model" } as any), "model", "trailing arg extracted")
assertEq(parseSubcommand({ data: { args: ["agent"] } } as any), "agent", "data.args wins")
assertEq(parseSubcommand(null), null, "null ctx → null")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
