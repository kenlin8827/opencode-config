/// <reference types="bun" />
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

/**
 * Metrics — TUI-only token usage display and collection.
 *
 * Displays token usage grouped by session ID (main agent + subagents) via
 * toast. /metrics [model] adds per-session model breakdown.
 *
 * Registered via `tui.template.jsonc` → `plugin` array (TUI plugins have no
 * directory auto-discovery — they must be listed there).
 *
 * Data collection (via api.event.on):
 *   - message.part.updated step-finish → per-step token economics
 *   - message.part.updated agent/compaction → agent attribution, compaction count
 *   - message.updated → model + agent attribution (info.mode works for subagents)
 *   - session.created → persist then reset state for the new conversation
 *   - session.idle → persist session summary JSON
 *
 * Note: this is a TUI-only module — metrics collection only runs while the
 * TUI is active. Tool-call metrics (duration) are NOT collected here because
 * TUI plugins have no tool hooks; token economics are the primary signal.
 */

const METRICS_DIR = join(homedir(), ".config", "opencode", ".metrics")
// TUI prepends "/" itself — slashName must be bare (like "queued", "profile").
const SLASH_NAME = "metrics"
const TOAST_DURATION = 15_000

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionTokenState {
  steps: number
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  compactions: number
  inputByAgent: Record<string, number>
  outputByAgent: Record<string, number>
  costByAgent: Record<string, number>
  stepsByAgent: Record<string, number>
  inputByModel: Record<string, number>
  outputByModel: Record<string, number>
  costByModel: Record<string, number>
  stepsByModel: Record<string, number>
}

interface SessionSummary {
  sessionId: string
  endTime: string
  steps: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
  }
  cost: number
  cacheHitRate: number
  compactions: number
  inputTokensByAgent: Record<string, number>
  outputByAgent: Record<string, number>
  costByAgent: Record<string, number>
  stepsByAgent: Record<string, number>
  inputTokensByModel: Record<string, number>
  outputByModel: Record<string, number>
  costByModel: Record<string, number>
  stepsByModel: Record<string, number>
}

// ─── State (module singleton) ───────────────────────────────────────────────

const sessionTokenState: Map<string, SessionTokenState> = new Map()
const sessionAgents: Map<string, string> = new Map()
const sessionModels: Map<string, string> = new Map()
const summarizedSessions: Set<string> = new Set()

const EMPTY_TOKEN_STATE: SessionTokenState = {
  steps: 0,
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  compactions: 0,
  inputByAgent: {},
  outputByAgent: {},
  costByAgent: {},
  stepsByAgent: {},
  inputByModel: {},
  outputByModel: {},
  costByModel: {},
  stepsByModel: {},
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function tokenStateFor(sessionId: string): SessionTokenState {
  let state = sessionTokenState.get(sessionId)
  if (!state) {
    state = { ...EMPTY_TOKEN_STATE, inputByAgent: {}, outputByAgent: {}, costByAgent: {}, stepsByAgent: {}, inputByModel: {}, outputByModel: {}, costByModel: {}, stepsByModel: {} }
    sessionTokenState.set(sessionId, state)
  }
  return state
}

function ensureMetricsDir(): void {
  if (!existsSync(METRICS_DIR)) {
    mkdirSync(METRICS_DIR, { recursive: true })
  }
}

function appendMetric(record: Record<string, unknown>): void {
  ensureMetricsDir()
  const dateStr = new Date().toISOString().slice(0, 10)
  const filePath = join(METRICS_DIR, `metrics-${dateStr}.jsonl`)
  appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8")
}

export function summarizeSession(sessionId: string): SessionSummary | null {
  const state = sessionTokenState.get(sessionId)
  if (!state || (state.steps === 0 && state.input === 0)) return null
  const cacheDenom = state.input + state.cacheRead
  return {
    sessionId,
    endTime: new Date().toISOString(),
    steps: state.steps,
    tokens: {
      input: state.input,
      output: state.output,
      reasoning: state.reasoning,
      cacheRead: state.cacheRead,
      cacheWrite: state.cacheWrite,
    },
    cost: state.cost,
    cacheHitRate: cacheDenom > 0 ? state.cacheRead / cacheDenom : 0,
    compactions: state.compactions,
    inputTokensByAgent: state.inputByAgent,
    outputByAgent: state.outputByAgent,
    costByAgent: state.costByAgent,
    stepsByAgent: state.stepsByAgent,
    inputTokensByModel: state.inputByModel,
    outputByModel: state.outputByModel,
    costByModel: state.costByModel,
    stepsByModel: state.stepsByModel,
  }
}

function persistSession(sessionId: string): boolean {
  const summary = summarizeSession(sessionId)
  if (!summary) return false
  ensureMetricsDir()
  writeFileSync(join(METRICS_DIR, `session-${sessionId}.json`), JSON.stringify(summary, null, 2), "utf-8")
  return true
}

// ─── Display formatting ─────────────────────────────────────────────────────

function formatBar(pct: number, width = 30): string {
  const filled = Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * width))
  return "\u2588".repeat(Math.min(filled, width)) + "\u2591".repeat(Math.max(0, width - Math.min(filled, width)))
}

export function formatAllSessions(currentSessionId: string, filter?: string): string {
  const sessions = [...sessionTokenState.entries()]
    .filter(([, s]) => s.steps > 0 || s.input > 0)
    .sort(([, a], [, b]) => b.input - a.input)

  if (sessions.length === 0) return ""

  const totalInput = sessions.reduce((sum, [, s]) => sum + s.input, 0)
  const totalOutput = sessions.reduce((sum, [, s]) => sum + s.output, 0)
  const totalCost = sessions.reduce((sum, [, s]) => sum + s.cost, 0)
  const totalSteps = sessions.reduce((sum, [, s]) => sum + s.steps, 0)

  const lines: string[] = [
    `[metrics] ${sessions.length} session(s)  |  Total: ${totalInput.toLocaleString()} in / ${totalOutput.toLocaleString()} out / $${totalCost.toFixed(4)} / ${totalSteps} steps`,
  ]

  for (const [sid, state] of sessions) {
    const agent = sessionAgents.get(sid)
    const tag = sid === currentSessionId ? "main" : "sub"
    const label = agent ? `${agent}@${tag}` : tag
    const pct = totalInput > 0 ? (state.input / totalInput) * 100 : 0

    lines.push(`\n  ${label}  [${sid}]`)
    lines.push(`  ${state.input.toLocaleString()} in / ${state.output.toLocaleString()} out / $${state.cost.toFixed(4)} / ${state.steps} steps`)
    lines.push(`  ${formatBar(pct)}  ${pct.toFixed(1)}%`)

    if (filter === "model") {
      const modelEntries = Object.entries(state.inputByModel).sort(([, a], [, b]) => b - a)
      if (modelEntries.length > 0) {
        const maxLen = Math.max(...modelEntries.map(([n]) => n.length))
        for (const [model, inp] of modelEntries) {
          const mPct = state.input > 0 ? (inp / state.input) * 100 : 0
          lines.push(`    ${model.padEnd(maxLen)}  ${inp.toLocaleString().padStart(10)} / ${(state.costByModel[model] || 0).toFixed(4).padStart(7)}  ${formatBar(mPct, 15)} ${mPct.toFixed(0)}%`)
        }
      }
    }
  }
  return lines.join("\n")
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
  // Per-step token economics + agent/compaction attribution.
  api.event.on("message.part.updated", (e) => {
    const part = e.properties?.part as
      | { type: string; sessionID?: string; messageID?: string; name?: string; auto?: boolean; cost?: number; tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }
      | undefined
    if (!part?.type) return
    const sessionId = part.sessionID || e.properties?.sessionID || "default"

    if (part.type === "agent") {
      sessionAgents.set(sessionId, part.name || "unknown")
      return
    }

    if (part.type === "compaction") {
      tokenStateFor(sessionId).compactions++
      appendMetric({ kind: "compaction", timestamp: new Date().toISOString(), sessionId, auto: !!part.auto })
      return
    }

    if (part.type === "step-finish") {
      const t = part.tokens || {}
      const cache = t.cache || {}
      const agent = sessionAgents.get(sessionId) || "unknown"
      const state = tokenStateFor(sessionId)
      const input = t.input || 0
      const output = t.output || 0
      const stepCost = part.cost || 0
      const model = sessionModels.get(part.messageID || "") || "unknown"

      state.steps++
      state.input += input
      state.output += output
      state.reasoning += t.reasoning || 0
      state.cacheRead += cache.read || 0
      state.cacheWrite += cache.write || 0
      state.cost += stepCost

      state.inputByAgent[agent] = (state.inputByAgent[agent] || 0) + input
      state.outputByAgent[agent] = (state.outputByAgent[agent] || 0) + output
      state.costByAgent[agent] = (state.costByAgent[agent] || 0) + stepCost
      state.stepsByAgent[agent] = (state.stepsByAgent[agent] || 0) + 1

      state.inputByModel[model] = (state.inputByModel[model] || 0) + input
      state.outputByModel[model] = (state.outputByModel[model] || 0) + output
      state.costByModel[model] = (state.costByModel[model] || 0) + stepCost
      state.stepsByModel[model] = (state.stepsByModel[model] || 0) + 1

      summarizedSessions.delete(sessionId)

      appendMetric({
        kind: "step",
        timestamp: new Date().toISOString(),
        sessionId,
        messageID: part.messageID,
        agent,
        model: sessionModels.get(part.messageID || ""),
        cost: stepCost,
        tokens: { input, output, reasoning: t.reasoning || 0, cacheRead: cache.read || 0, cacheWrite: cache.write || 0 },
      })
    }
  })

  // Model + agent attribution: assistant messages carry provider/model IDs
  // and mode (agent name). Fires for every assistant message including
  // subagent sessions — most reliable agent name source.
  api.event.on("message.updated", (e) => {
    const info = e.properties?.info as
      | { role?: string; id?: string; sessionID?: string; providerID?: string; modelID?: string; mode?: string }
      | undefined
    if (info?.role !== "assistant") return
    if (info.modelID && info.id) {
      sessionModels.set(info.id, `${info.providerID}/${info.modelID}`)
    }
    if (info.mode && info.sessionID) {
      sessionAgents.set(info.sessionID, info.mode)
    }
  })

  // New conversation (/new): persist active sessions then reset state.
  api.event.on("session.created", () => {
    for (const [sid, state] of sessionTokenState.entries()) {
      if (state.steps === 0 && state.input === 0) continue
      persistSession(sid)
    }
    sessionTokenState.clear()
    sessionAgents.clear()
    sessionModels.clear()
    summarizedSessions.clear()
  })

  // Turn end: persist summary (deduped until new activity).
  api.event.on("session.idle", (e) => {
    const sessionId = e.properties?.sessionID || "default"
    if (summarizedSessions.has(sessionId)) return
    if (!persistSession(sessionId)) return
    summarizedSessions.add(sessionId)
  })

  // Slash command + command palette entry.
  api.keymap.registerLayer({
    commands: [
      {
        name: "metrics.show",
        title: "Show token usage",
        desc: "Token usage grouped by session (agent + subagents) — /metrics [model] (TUI toast)",
        category: "Session",
        namespace: "palette",
        slashName: SLASH_NAME,
        run(ctx: unknown) {
          const sub = parseSubcommand(ctx)
          let filter: string | undefined
          if (sub === "model") {
            filter = "model"
          } else if (sub && sub !== "agent") {
            api.ui.toast({ message: `[metrics] Unknown subcommand "${sub}". Usage: /${SLASH_NAME} [model]`, variant: "warning" })
            return
          }
          const sessionID = currentSessionID(api) || "default"
          const text = formatAllSessions(sessionID, filter)
          if (text) {
            api.ui.toast({ message: text, variant: "info", duration: TOAST_DURATION })
            return
          }
          api.ui.toast({ message: "[metrics] No token data for the current session yet.", variant: "info" })
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
