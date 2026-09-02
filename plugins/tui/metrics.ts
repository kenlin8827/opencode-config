/// <reference types="bun" />
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"

/**
 * Metrics — TUI-only token usage display.
 *
 * /metrics [model] shows token/cost economics for the CURRENT conversation
 * tree (root session + subagent sessions), queried live from the opencode
 * server via api.client (@opencode-ai/sdk v2). No local collection or
 * persistence: the server already stores every assistant message with full
 * token/cost data, so this plugin is a pure view over that data.
 *
 * Data sources (per session):
 *   - session.messages  → assistant messages carry cost + tokens
 *                         (input/output/reasoning/cache read+write) and
 *                         mode/agent attribution; step-finish parts count steps;
 *                         compaction parts count compactions
 *   - session.get/children → conversation tree (root + subagents)
 *
 * Note: this is a TUI-only module — it can only run while the TUI is active.
 */

// TUI prepends "/" itself — slashName must be bare (like "queued", "profile").
const SLASH_NAME = "metrics"
const TOAST_DURATION = 15_000
// Guard against runaway trees when walking subagent children.
const MAX_TREE_DEPTH = 3
const MAX_PARENT_HOPS = 10

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal structural types from the SDK (kept loose for test mocks). */
type Client = TuiPluginApi["client"]
type SessionInfo = { id: string; parentID?: string; agent?: string }
type AssistantInfo = { role?: string; mode?: string; agent?: string; providerID?: string; modelID?: string; cost?: number; tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }
type MessagePart = { type?: string; cost?: number; tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }

interface SessionMetrics {
  id: string
  agent?: string
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  steps: number
  compactions: number
  inputByModel: Record<string, number>
  costByModel: Record<string, number>
}

// ─── Aggregation (SDK queries) ──────────────────────────────────────────────

const EMPTY: Omit<SessionMetrics, "id" | "agent"> = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  steps: 0,
  compactions: 0,
  inputByModel: {},
  costByModel: {},
}

async function metricsForSession(client: Client, sessionId: string): Promise<SessionMetrics> {
  const m: SessionMetrics = { id: sessionId, agent: undefined, ...EMPTY, inputByModel: {}, costByModel: {} }

  let messages: Array<{ info: AssistantInfo; parts?: MessagePart[] }> = []
  try {
    const res = await client.session.messages({ sessionID: sessionId })
    messages = (res?.data ?? []) as typeof messages
  } catch {
    return m
  }

  for (const msg of messages) {
    const info = msg?.info
    if (info?.role !== "assistant") continue
    m.cost += info.cost || 0
    const t = info.tokens || {}
    m.input += t.input || 0
    m.output += t.output || 0
    m.reasoning += t.reasoning || 0
    m.cacheRead += t.cache?.read || 0
    m.cacheWrite += t.cache?.write || 0
    if (info.mode || info.agent) m.agent = info.agent || info.mode

    const model = `${info.providerID || "unknown"}/${info.modelID || "unknown"}`
    m.inputByModel[model] = (m.inputByModel[model] || 0) + (t.input || 0)
    m.costByModel[model] = (m.costByModel[model] || 0) + (info.cost || 0)

    for (const part of msg.parts || []) {
      if (part?.type === "step-finish") m.steps++
      if (part?.type === "compaction") m.compactions++
    }
  }
  return m
}

async function rootSession(client: Client, sessionId: string): Promise<SessionInfo | undefined> {
  let current: SessionInfo | undefined
  try {
    const res = await client.session.get({ sessionID: sessionId })
    current = res?.data as SessionInfo | undefined
  } catch {
    return undefined
  }
  let hops = 0
  while (current?.parentID && hops++ < MAX_PARENT_HOPS) {
    try {
      const res = await client.session.get({ sessionID: current.parentID })
      current = res?.data as SessionInfo | undefined
    } catch {
      break
    }
  }
  return current
}

async function conversationTree(client: Client, sessionId: string): Promise<SessionInfo[]> {
  const root = await rootSession(client, sessionId)
  if (!root) return []

  const tree: SessionInfo[] = [root]
  let frontier = [root.id]
  for (let depth = 0; depth < MAX_TREE_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const parentID of frontier) {
      try {
        const res = await client.session.children({ sessionID: parentID })
        for (const child of (res?.data ?? []) as SessionInfo[]) {
          if (tree.some((s) => s.id === child.id)) continue
          tree.push(child)
          next.push(child.id)
        }
      } catch {
        // children listing is best-effort
      }
    }
    frontier = next
  }
  return tree
}

// ─── Display formatting ─────────────────────────────────────────────────────

function formatBar(pct: number, width = 30): string {
  const filled = Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * width))
  return "\u2588".repeat(Math.min(filled, width)) + "\u2591".repeat(Math.max(0, width - Math.min(filled, width)))
}

export async function formatAllSessions(client: Client, currentSessionId: string, filter?: string): Promise<string> {
  const tree = await conversationTree(client, currentSessionId)
  if (tree.length === 0) return ""

  const metrics: SessionMetrics[] = []
  for (const session of tree) {
    const m = await metricsForSession(client, session.id)
    m.agent = m.agent || session.agent
    metrics.push(m)
  }
  const sessions = metrics.filter((m) => m.steps > 0 || m.input > 0)
  if (sessions.length === 0) return ""

  const totalInput = sessions.reduce((sum, s) => sum + s.input, 0)
  const totalOutput = sessions.reduce((sum, s) => sum + s.output, 0)
  const totalCost = sessions.reduce((sum, s) => sum + s.cost, 0)
  const totalSteps = sessions.reduce((sum, s) => sum + s.steps, 0)
  const totalCacheRead = sessions.reduce((sum, s) => sum + s.cacheRead, 0)
  const totalCacheWrite = sessions.reduce((sum, s) => sum + s.cacheWrite, 0)
  const totalDenom = totalInput + totalCacheRead
  const totalHit = totalDenom > 0 ? (totalCacheRead / totalDenom) * 100 : 0

  const lines: string[] = []
  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheWrite
  lines.push(
    `📊 ${sessions.length} session(s)  |  Total: ${totalTokens.toLocaleString()} tok | ${totalInput.toLocaleString()} in / ${totalOutput.toLocaleString()} out / ${totalCacheRead.toLocaleString()} cr / ${totalCacheWrite.toLocaleString()} cw / $${totalCost.toFixed(4)} / ${totalSteps} steps | hit ${totalHit.toFixed(1)}%`,
  )
  lines.push("")

  for (const state of sessions) {
    const tag = state.id === currentSessionId ? "main" : "sub"
    const name = state.agent ? `${state.agent}@${tag}` : tag
    const pct = totalInput > 0 ? (state.input / totalInput) * 100 : 0

    lines.push(`  ${name}  [${state.id}]`)
    lines.push(`  ${state.input.toLocaleString()} in / ${state.output.toLocaleString()} out / $${state.cost.toFixed(4)} / ${state.steps} steps`)
    const sDenom = state.input + state.cacheRead
    const sHit = sDenom > 0 ? (state.cacheRead / sDenom) * 100 : 0
    lines.push(`  cache: ${state.cacheRead.toLocaleString()} read / ${state.cacheWrite.toLocaleString()} write | hit ${sHit.toFixed(1)}%`)
    lines.push(`  ${formatBar(pct, 24)}  ${pct.toFixed(1)}%`)

    if (filter === "model") {
      const modelEntries = Object.entries(state.inputByModel).sort(([, a], [, b]) => b - a)
      if (modelEntries.length > 0) {
        const maxLen = Math.max(...modelEntries.map(([n]) => n.length))
        for (const [model, inp] of modelEntries) {
          const mPct = state.input > 0 ? (inp / state.input) * 100 : 0
          lines.push(`      ${model.padEnd(maxLen)}  ${inp.toLocaleString().padStart(8)} in  $${(state.costByModel[model] || 0).toFixed(4).padStart(7)}  ${formatBar(mPct, 12)} ${mPct.toFixed(0)}%`)
        }
      }
    }
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

// Tokens that identify the command itself, not a subcommand. Slash dispatch
// puts the command NAME ("metrics.show") into ctx.input, so leading name
// tokens must be skipped when extracting the user's trailing argument.
const COMMAND_TOKENS = new Set(["metrics.show", "metrics", "/metrics"])

/**
 * Extract subcommand args from the keymap command context. Check data.args
 * and payload first (likely the real slash args), ctx.input last; in every
 * source skip leading command-name tokens.
 */
export function parseSubcommand(ctx: unknown): string | null {
  if (typeof ctx !== "object" || ctx === null) return null
  const c = ctx as { input?: unknown; payload?: unknown; data?: { args?: unknown } }
  const sources = [c.data?.args, c.payload, c.input]
  for (const raw of sources) {
    const parts = Array.isArray(raw) ? raw : [raw]
    for (const item of parts) {
      if (typeof item !== "string" || item.trim() === "") continue
      const tokens = item.trim().split(/\s+/).map((t) => t.toLowerCase())
      let i = 0
      while (i < tokens.length && COMMAND_TOKENS.has(tokens[i])) i++
      if (i < tokens.length) return tokens[i]
    }
  }
  return null
}

function currentSessionID(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  if (route.name !== "session") return undefined
  return (route.params as { sessionID?: string } | undefined)?.sessionID
}

// ─── Plugin entry ───────────────────────────────────────────────────────────

const tui: TuiPlugin = async (api) => {
  // Slash command + command palette entry.
  api.keymap.registerLayer({
    commands: [
      {
        name: "metrics.show",
        title: "Show token usage",
        desc: "Token usage for the current conversation (agent + subagents) — /metrics [model] (TUI toast)",
        category: "Session",
        namespace: "palette",
        slashName: SLASH_NAME,
        run(ctx: unknown) {
          const sub = parseSubcommand(ctx)
          let filter: string | undefined
          if (sub === "model") {
            filter = "model"
          } else if (sub && sub !== "agent") {
            api.ui.toast({ message: `📊 Unknown subcommand "${sub}". Usage: /${SLASH_NAME} [model]`, variant: "warning" })
            return Promise.resolve()
          }
          const sessionID = currentSessionID(api) || "default"
          return Promise.resolve()
            .then(() => formatAllSessions(api.client, sessionID, filter))
            .then((text) => {
              if (text) {
                api.ui.toast({ message: text, variant: "info", duration: TOAST_DURATION })
                return
              }
              api.ui.toast({ message: "📊 No token data for the current session yet.", variant: "info" })
            })
            .catch((err) => {
              api.ui.toast({ message: `📊 Failed to query metrics: ${err instanceof Error ? err.message : String(err)}`, variant: "warning" })
            })
        },
      },
    ],
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "metrics",
  tui,
}

export default plugin
