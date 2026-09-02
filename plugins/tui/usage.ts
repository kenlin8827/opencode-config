/// <reference types="bun" />
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { initI18n, tr } from "./i18n"
import { parseJsonc } from "../shared/ocp-config"

/**
 * Usage — TUI token/cost usage dialog with per-dimension views.
 *
 * /usage            → dimension picker dialog (tab-style switching)
 * /usage all        → "by session" table directly
 * /usage agent      → "by agent" table directly
 * /usage model      → "by model" table directly
 *
 * Three aggregation dimensions over the CURRENT conversation tree
 * (root session + subagent sessions):
 *   session — one row per session (agent@tag), with total row
 *   agent   — one row per agent, sessions summed
 *   model   — one row per model, summed across all sessions
 *
 * Queried live from the opencode server via api.client (@opencode-ai/sdk v2).
 * No local collection or persistence: the server already stores every
 * assistant message with full token/cost data, so this plugin is a pure view
 * over that data.
 *
 * Data sources (per session):
 *   - session.messages  → assistant messages carry cost + tokens
 *                         (input/output/reasoning/cache read+write) and
 *                         mode/agent attribution; step-finish parts count steps;
 *                         compaction parts count compactions
 *   - session.get/children → conversation tree (root + subagents)
 *
 * Display policy: three token numbers only — non-cached input, output,
 * cached input (cache read). Reasoning and cache-write are counted by the
 * server cost but not shown.
 *
 * Tables render in a host dialog (DialogAlert); hosts without the dialog
 * API fall back to a toast. Picker → table → confirm → picker acts as
 * tab-style dimension switching.
 *
 * Note: this is a TUI-only module — it can only run while the TUI is active.
 */

// TUI prepends "/" itself — slashName must be bare (like "queued", "profile").
const SLASH_NAME = "usage"
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

interface SessionUsage {
  id: string
  agent?: string
  /** Non-cached input tokens. */
  input: number
  output: number
  /** Cached input tokens served from cache. */
  cacheRead: number
  cost: number
  /** OCP supplementary — coding-plan points (积分) for plan providers. */
  credits: number
  creditsKnown: boolean
  /** OCP supplementary — cash ($/Mtok) for non-plan providers whose server cost is 0. */
  cash: number
  cashKnown: boolean
  steps: number
  compactions: number
  inputByModel: Record<string, number>
  outputByModel: Record<string, number>
  cacheByModel: Record<string, number>
  stepsByModel: Record<string, number>
  costByModel: Record<string, number>
  creditsByModel: Record<string, number>
  cashByModel: Record<string, number>
}

export type UsageDimension = "session" | "agent" | "model"

// ─── OCP supplementary data: GLM coding-plan points (积分) ──────────────────

/**
 * opencode bills subscription coding plans at $0 (usage is bundled in the
 * plan fee), so the dollar column is structurally zero for them. BigModel
 * publishes an official points-deduction scheme instead; this dataset mirrors
 * it so the usage dialog can show plan consumption in points.
 *
 * Source: https://docs.bigmodel.cn/cn/coding-plan/overview
 *   模型消耗积分数 = (输入 Token × Input 系数 + 缓存命中 Token × Cached 系数
 *                    + 输出 Token × Output 系数) / 10000
 *   GLM-5.3:       6.9 / 1.7 / 24
 *   GLM-5.3-Flash: 2.3 / 0.56 / 8
 * Non-peak hours (outside Mon–Fri 14:00–18:00 UTC+8) deduct at 50% — not
 * applied here because per-token timestamps are not tracked.
 */

/** OCP-supplied pricing dataset for subscription coding plans (积分抵扣).
 *  Loaded lazily from the user config dir at first use; fail-open → null. */
type CostRates = Record<string, { input: number; cached?: number; cache_read?: number; output: number }>
type ProviderCosts = { credits?: boolean; divisor: number; rates: CostRates; source?: string }
type CostsData = { providers: Record<string, ProviderCosts> }
let costsDataCache: CostsData | null | undefined

/** Resolve at call time so env overrides (tests) take effect after import. */
function costsFilePath(): string {
  if (process.env.OCP_POINTS_PATH) return process.env.OCP_POINTS_PATH
  const os = require("node:os") as typeof import("node:os")
  const base = process.env.XDG_CONFIG_HOME ||
    (process.platform === "win32"
      ? `${process.env.USERPROFILE || os.homedir()}\\.config`
      : `${os.homedir()}/.config`)
  return `${base}/opencode/models/cost.jsonc`
}

export function loadCosts(): CostsData | null {
  if (costsDataCache !== undefined) return costsDataCache
  let file = ""
  try {
    const fs = require("node:fs") as typeof import("node:fs")
    file = costsFilePath()
    if (!fs.existsSync(file)) { costsDataCache = null; return null }
    const cfg = parseJsonc(fs.readFileSync(file, "utf8")) as Partial<CostsData>
    const providers: Record<string, ProviderCosts> = {}
    for (const [pid, p] of Object.entries((cfg as any).providers ?? {}) as Array<[string, any]>) {
      if (!p || typeof p !== "object") continue
      const rates: CostRates = {}
      for (const [mid, e] of Object.entries((p as any).rates ?? {})) {
        if (!e || typeof e !== "object") continue
        rates[mid] = {
          input: (e as any).input,
          cached: (e as any).cached,
          cache_read: (e as any).cache_read,
          output: (e as any).output,
        }
      }
      providers[pid] = {
        credits: p.credits === true,
        divisor: typeof p.divisor === "number" && p.divisor > 0 ? p.divisor : 10000,
        rates,
        source: typeof p.source === "string" ? p.source : undefined,
      }
    }
    costsDataCache = Object.keys(providers).length > 0 ? { providers } : null
    return costsDataCache
  } catch (e) { console.error("loadCosts err:", file, (e as Error)?.message); costsDataCache = null; return null }
}

/** Reset the points cache (used by tests when they change OCP_POINTS_PATH). */
export function resetCostsCache(): void { costsDataCache = undefined }

/** OCP-supplied usage for a message: either积分 (points, divided by provider divisor) or
 *  cash ($/Mtok). Returns null when out of plan scope or no matching entry. */
function computeUsageForMessage(providerID: string, modelID: string, input: number, cacheRead: number, output: number): { value: number; type: "credits" | "cash" } | null {
  const data = loadCosts()
  if (!data || !data.providers[providerID]) return null
  const p = data.providers[providerID]
  const rate = p.rates[modelID]
  if (!rate) return null
  if (p.credits) {
    const divisor = typeof p.divisor === "number" && p.divisor > 0 ? p.divisor : 10000
    return {
      value: (input * (rate.input || 0) + cacheRead * (rate.cached || 0) + output * (rate.output || 0)) / divisor,
      type: "credits",
    }
  }
  // cash — $/Mtok
  return {
    value: (input * (rate.input || 0) + output * (rate.output || 0) + cacheRead * (rate.cache_read || 0)) / 1_000_000,
    type: "cash",
  }
}

function fmtCredits(credits: number | null): string {
  return credits == null ? "—" : credits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Aggregation (SDK queries) ──────────────────────────────────────────────


const EMPTY: Omit<SessionUsage, "id" | "agent"> = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cost: 0,
  credits: 0,
  creditsKnown: false,
  cash: 0,
  cashKnown: false,
  steps: 0,
  compactions: 0,
  inputByModel: {},
  outputByModel: {},
  cacheByModel: {},
  stepsByModel: {},
  creditsByModel: {},
  cashByModel: {},
  costByModel: {},
}

async function usageForSession(client: Client, sessionId: string): Promise<SessionUsage> {
  const m: SessionUsage = { id: sessionId, agent: undefined, ...EMPTY, inputByModel: {}, outputByModel: {}, cacheByModel: {}, stepsByModel: {}, creditsByModel: {}, cashByModel: {}, costByModel: {} }

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
    const t = info.tokens || {}
    const model = `${info.providerID || "unknown"}/${info.modelID || "unknown"}`
    const cost = info.cost || 0
    m.cost += cost
    // OCP supplementary fallback: only when the server billed nothing (cost 0)
    // do we consult the points dataset for subscription coding plans.
    if (!cost) {
      const usage = computeUsageForMessage(info.providerID || "", info.modelID || "", t.input || 0, t.cache?.read || 0, t.output || 0)
      if (usage) {
        if (usage.type === "credits") {
          m.creditsKnown = true
          m.credits += usage.value
          m.creditsByModel[model] = (m.creditsByModel[model] || 0) + usage.value
    m.stepsByModel[model] = (m.stepsByModel[model] || 0) + m.steps
        } else {
          // cash fallback (user-curated in OCP dataset; defaults to server $0 otherwise)
          m.cashKnown = true
          m.cash += usage.value
          m.cashByModel[model] = (m.cashByModel[model] || 0) + usage.value
        }
      }
    }
    m.input += t.input || 0
    m.output += t.output || 0
    m.cacheRead += t.cache?.read || 0
    if (info.mode || info.agent) m.agent = info.agent || info.mode

    m.inputByModel[model] = (m.inputByModel[model] || 0) + (t.input || 0)
    m.outputByModel[model] = (m.outputByModel[model] || 0) + (t.output || 0)
    m.cacheByModel[model] = (m.cacheByModel[model] || 0) + (t.cache?.read || 0)
    m.costByModel[model] = (m.costByModel[model] || 0) + cost

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

/** Conversation tree with per-session usage, dropping sessions without data. */
async function collectSessions(client: Client, sessionId: string): Promise<SessionUsage[]> {
  const tree = await conversationTree(client, sessionId)
  const usages: SessionUsage[] = []
  for (const session of tree) {
    const m = await usageForSession(client, session.id)
    m.agent = m.agent || session.agent
    usages.push(m)
  }
  return usages.filter((m) => m.steps > 0 || m.input > 0)
}

// ─── Table rendering ────────────────────────────────────────────────────────

function formatBar(pct: number, width = 10): string {
  const filled = Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * width))
  return "\u2588".repeat(Math.min(filled, width)) + "\u2591".repeat(Math.max(0, width - Math.min(filled, width)))
}

function hitRate(cacheRead: number, input: number): string {
  const denom = input + cacheRead
  return denom > 0 ? ((cacheRead / denom) * 100).toFixed(1) : "0.0"
}

/**
 * Token counts in the industry-standard k/M notation: 58,510 → 58.5k,
 * 270,000 → 270k, 1,234,567 → 1.2M. Below 10k the exact number is kept
 * (3,419 → 3,419 — k adds no information there). Deliberately not
 * Intl compact notation: it follows the locale (zh-CN → 万), which fights
 * the K/M convention.
 */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return fmtScaled(n / 1_000_000) + "M"
  if (n >= 10_000) return fmtScaled(n / 1_000) + "k"
  return n.toLocaleString()
}

function fmtScaled(v: number): string {
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1)
  return s.replace(/\.0$/, "")
}


/** Display width — CJK/fullwidth chars and emoji count as 2 so tables align in monospace. */
function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{1F300}-\u{1FAFF}\u2B50\u2705\u274C\u2757]/u.test(ch) ? 2 : 1
  }
  return w
}

function padEndW(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - displayWidth(s)))
}

function padStartW(s: string, w: number): string {
  return " ".repeat(Math.max(0, w - displayWidth(s))) + s
}

/** Column-aligned table with a rule under the header and airy row spacing; aligns[i] === "r" right-aligns column i. */
function renderTable(headers: string[], rows: string[][], aligns: Array<"l" | "r">): string {
  const widths = headers.map((h, i) => Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ""))))
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (aligns[i] === "r" ? padStartW(c ?? "", widths[i]) : padEndW(c ?? "", widths[i]))).join("  ").replace(/\s+$/, "")
  const rule = fmt(widths.map((w) => "─".repeat(w)))
  // Header and rule stay tight; data rows get a blank line between them.
  return [fmt(headers) + "\n" + rule, ...rows.map(fmt)].join("\n\n")
}

// ─── Dimension views ────────────────────────────────────────────────────────

function sessionName(s: SessionUsage, currentSessionId: string): string {
  // 🧠 = main (current) agent — the brain, 🦾 = subagent — the arm doing the work
  const icon = s.id === currentSessionId ? "🧠" : "🦾"
  return s.agent ? `${icon} ${s.agent}` : icon
}

/** One row per session, with a total row. Points column appears when any session is on a coding plan. */
function renderSessionTable(sessions: SessionUsage[], currentSessionId: string): string {
  const totalInput = sessions.reduce((sum, s) => sum + s.input, 0)
  const totalOutput = sessions.reduce((sum, s) => sum + s.output, 0)
  const totalCost = sessions.reduce((sum, s) => sum + s.cost, 0)
  const totalSteps = sessions.reduce((sum, s) => sum + s.steps, 0)
  const totalCacheRead = sessions.reduce((sum, s) => sum + s.cacheRead, 0)
  const totalCredits = sessions.reduce((sum, s) => sum + s.credits, 0)
  const showCredits = sessions.some((s) => s.creditsKnown)

  const rows = sessions.map((s) => {
    const pct = totalInput > 0 ? (s.input / totalInput) * 100 : 0
    return [
      sessionName(s, currentSessionId),
      fmtTokens(s.input),
      fmtTokens(s.output),
      fmtTokens(s.cacheRead),
      String(s.steps),
      `$${s.cost.toFixed(4)}`,
      fmtCredits(s.creditsKnown ? s.credits : null),
      `${pct.toFixed(1)}% ${formatBar(pct)}`,
    ]
  })
  rows.push([
    tr("usage.totalRow"),
    fmtTokens(totalInput),
    fmtTokens(totalOutput),
    fmtTokens(totalCacheRead),
    String(totalSteps),
    `$${totalCost.toFixed(4)}`,
    fmtCredits(showCredits ? totalCredits : null),
    tr("usage.hitCell", { hit: hitRate(totalCacheRead, totalInput) }),
  ])
  const headers = [
    tr("usage.hSession"),
    tr("usage.hIn"),
    tr("usage.hOut"),
    tr("usage.hCached"),
    tr("usage.hSteps"),
    tr("usage.hCost"),
    ...(showCredits ? [tr("usage.hCredits")] : []),
    tr("usage.hShare"),
  ]
  const aligns: Array<"l" | "r"> = ["l", "r", "r", "r", "r", "r", "r"]
  if (showCredits) aligns.push("r")
  aligns.push("l")
  return renderTable(headers, rows, aligns)
}

/** One row per agent — sessions grouped by agent attribution. */
function renderAgentTable(sessions: SessionUsage[]): string {
  const groups = new Map<string, { n: number; input: number; output: number; cacheRead: number; cost: number; credits: number; steps: number }>()
  for (const s of sessions) {
    const key = s.agent || "-"
    const g = groups.get(key) || { n: 0, input: 0, output: 0, cacheRead: 0, cost: 0, credits: 0, steps: 0 }
    g.n++
    g.input += s.input
    g.output += s.output
    g.cacheRead += s.cacheRead
    g.cost += s.cost
    g.credits += s.credits
    g.steps += s.steps
    groups.set(key, g)
  }
  const totalInput = [...groups.values()].reduce((sum, g) => sum + g.input, 0)
  const totalCredits = [...groups.values()].reduce((sum, g) => sum + g.credits, 0)
  const showCredits = sessions.some((s) => s.creditsKnown)

  const rows = [...groups.entries()].sort(([, a], [, b]) => b.input - a.input).map(([agent, g]) => {
    const pct = totalInput > 0 ? (g.input / totalInput) * 100 : 0
    return [
      agent,
      String(g.n),
      fmtTokens(g.input),
      fmtTokens(g.output),
      fmtTokens(g.cacheRead),
      String(g.steps),
      `$${g.cost.toFixed(4)}`,
      fmtCredits(showCredits ? g.credits : null),
      `${pct.toFixed(1)}% ${formatBar(pct)}`,
    ]
  })
  const headers = [
    tr("usage.hAgent"),
    tr("usage.hSessions"),
    tr("usage.hIn"),
    tr("usage.hOut"),
    tr("usage.hCached"),
    tr("usage.hSteps"),
    tr("usage.hCost"),
    ...(showCredits ? [tr("usage.hCredits")] : []),
    tr("usage.hShare"),
  ]
  const aligns: Array<"l" | "r"> = ["l", "r", "r", "r", "r", "r", "r"]
  if (showCredits) aligns.push("r")
  aligns.push("l")
  return renderTable(headers, rows, aligns)
}

/** One row per model — tokens/cost summed across all sessions in the tree. */
function renderModelTable(sessions: SessionUsage[]): string {
  const models = new Map<string, { n: number; input: number; output: number; cacheRead: number; cost: number; credits: number; steps: number }>()
  for (const s of sessions) {
    for (const [model, input] of Object.entries(s.inputByModel)) {
      const g = models.get(model) || { n: 0, input: 0, output: 0, cacheRead: 0, cost: 0, credits: 0, steps: 0 }
      g.n++
      g.input += input
      g.output += s.outputByModel[model] || 0
      g.cacheRead += s.cacheByModel[model] || 0
      g.cost += s.costByModel[model] || 0
      g.credits += s.creditsByModel[model] || 0
      g.steps += s.stepsByModel[model] || 0
      models.set(model, g)
    }
  }
  const totalInput = [...models.values()].reduce((sum, g) => sum + g.input, 0)
  const totalCredits = [...models.values()].reduce((sum, g) => sum + g.credits, 0)
  const showCredits = sessions.some((s) => s.creditsKnown)

  const rows = [...models.entries()].sort(([, a], [, b]) => b.input - a.input).map(([model, g]) => {
    const pct = totalInput > 0 ? (g.input / totalInput) * 100 : 0
    return [
      model,
      String(g.n),
      fmtTokens(g.input),
      fmtTokens(g.output),
      fmtTokens(g.cacheRead),
      String(g.steps),
      `$${g.cost.toFixed(4)}`,
      fmtCredits(showCredits ? g.credits : null),
      `${pct.toFixed(1)}% ${formatBar(pct)}`,
    ]
  })
  const headers = [
    tr("usage.hModel"),
    tr("usage.hSessions"),
    tr("usage.hIn"),
    tr("usage.hOut"),
    tr("usage.hCached"),
    tr("usage.hSteps"),
    tr("usage.hCost"),
    ...(showCredits ? [tr("usage.hCredits")] : []),
    tr("usage.hShare"),
  ]
  const aligns: Array<"l" | "r"> = ["l", "r", "r", "r", "r", "r", "r"]
  if (showCredits) aligns.push("r")
  aligns.push("l")
  return renderTable(headers, rows, aligns)
}

/**
 * Render one dimension of the current conversation tree.
 * Returns "" when no session in the tree has any usage data.
 */
export async function formatByDimension(client: Client, sessionId: string, dim: UsageDimension): Promise<string> {
  const sessions = await collectSessions(client, sessionId)
  if (sessions.length === 0) return ""
  if (dim === "agent") return renderAgentTable(sessions)
  if (dim === "model") return renderModelTable(sessions)
  return renderSessionTable(sessions, sessionId)
}

// Tokens that identify the command itself, not a subcommand. Slash dispatch
// puts the command NAME ("usage.show") into ctx.input, so leading name
// tokens must be skipped when extracting the user's trailing argument.
const COMMAND_TOKENS = new Set(["usage.show", "usage", "/usage"])

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

// ─── Tab strip + view composition ───────────────────────────────────────────

const DIMENSIONS: UsageDimension[] = ["session", "agent", "model"]

const DIM_TITLE_KEY: Record<UsageDimension, string> = {
  session: "usage.dimSession",
  agent: "usage.dimAgent",
  model: "usage.dimModel",
}

const DIM_SUBCOMMAND: Record<string, UsageDimension> = {
  all: "session",
  session: "session",
  agent: "agent",
  model: "model",
}

/** Tab strip with the hotkey number baked into each label and an underline bar under the active tab:
 *  `(1) 按会话   (2) 按Agent   (3) 按模型`
 *  `▬▬▬▬▬▬▬`                        */
function renderTabStrip(active: UsageDimension): string {
  const labels = DIMENSIONS.map((d, i) => `(${i + 1})${tr(DIM_TITLE_KEY[d] as Parameters<typeof tr>[0])}`)
  const gap = "   "
  const strip = labels.join(gap)
  const idx = DIMENSIONS.indexOf(active)
  const offset = labels.slice(0, idx).reduce((w, l) => w + displayWidth(l) + gap.length, 0)
  const underline = " ".repeat(offset) + "▬".repeat(displayWidth(labels[idx]))
  return strip + "\n" + underline
}

/**
 * Dialog body: numbered tab strip + underline, blank, table. The numbers are
 * the hotkeys, so no hint line is needed. Rendered inside the host
 * DialogAlert (message is a plain string — opentui requires bare text to
 * live under a <text> element, and the plugin adapter exposes no Box/Text
 * primitives, so a self-drawn panel is not possible). The host's ok button
 * is unconditional (no prop hides it); Enter/Esc both close.
 */
export function renderDimensionView(table: string, dim: UsageDimension): string {
  return [renderTabStrip(dim), "", table].join("\n")
}

/** Smallest dialog tier that fits the text (DialogUI widths: 60/88/116, minus 2+2 padding). */
export function fitDialogSize(text: string): "medium" | "large" | "xlarge" {
  const width = Math.max(...text.split("\n").map((l) => displayWidth(l))) + 5
  if (width <= 60) return "medium"
  if (width <= 88) return "large"
  return "xlarge"
}

// ─── Plugin entry ───────────────────────────────────────────────────────────

let activeDim: UsageDimension = "session"

const tui: TuiPlugin = async (api) => {
  initI18n(api)

  const hasDialog = typeof api.ui.dialog?.replace === "function"

  const openDimension = (dim: UsageDimension) => {
    activeDim = dim
    const sessionId = currentSessionID(api) || "default"
    return formatByDimension(api.client, sessionId, dim)
      .then((table) => {
        if (!table) {
          api.ui.toast({ message: tr("usage.noData"), variant: "info" })
          return
        }
        const view = renderDimensionView(table, dim)
        const size = fitDialogSize(view)
        if (!hasDialog) {
          // Hosts without the dialog API: toast fallback.
          api.ui.toast({ message: view, variant: "info", duration: TOAST_DURATION })
          return
        }
        // replace() resets the dialog size to medium — set the fitted size AFTER.
        api.ui.dialog.replace(() => api.ui.DialogAlert({ title: tr("usage.dialogTitle"), message: view }))
        api.ui.dialog.setSize(size)
      })
      .catch((err) => {
        api.ui.toast({ message: tr("usage.failed", { err: err instanceof Error ? err.message : String(err) }), variant: "warning" })
      })
  }

  const cycleDimension = (delta: number) => {
    const idx = DIMENSIONS.indexOf(activeDim)
    void openDimension(DIMENSIONS[(idx + delta + DIMENSIONS.length) % DIMENSIONS.length])
  }

  // Slash command + command palette entry, plus the tab keymap.
  api.keymap.registerLayer({
    commands: [
      {
        name: "usage.show",
        title: tr("usage.commandTitle"),
        desc: tr("usage.commandDesc"),
        category: "Session",
        namespace: "palette",
        slashName: SLASH_NAME,
        run(ctx: unknown) {
          const sub = parseSubcommand(ctx)
          const dim = sub === null ? "session" : DIM_SUBCOMMAND[sub]
          if (dim === undefined) {
            api.ui.toast({ message: tr("usage.unknownSub", { sub: sub ?? "" }), variant: "warning" })
            return Promise.resolve()
          }
          return openDimension(dim)
        },
      },
      ...DIMENSIONS.map((dim) => ({
        name: `usage.dim.${dim}`,
        title: tr(DIM_TITLE_KEY[dim] as Parameters<typeof tr>[0]),
        category: "Session",
        run() {
          void openDimension(dim)
        },
      })),
      {
        name: "usage.dim.prev",
        title: tr("usage.dimPrev"),
        category: "Session",
        run() {
          cycleDimension(-1)
        },
      },
      {
        name: "usage.dim.next",
        title: tr("usage.dimNext"),
        category: "Session",
        run() {
          cycleDimension(1)
        },
      },
    ],
    bindings: [
      // Global open hotkey. input_delete_to_line_start also claims ctrl+u, but
      // only while the prompt input is focused (opencode double-binds keys
      // across input/session scopes, resolved by focus) — outside the input
      // this fires.
      { key: "ctrl+u", cmd: "usage.show", desc: "Show token usage" },
      { key: "1", cmd: "usage.dim.session" },
      { key: "2", cmd: "usage.dim.agent" },
      { key: "3", cmd: "usage.dim.model" },
      { key: "left,[", cmd: "usage.dim.prev" },
      { key: "right,]", cmd: "usage.dim.next" },
    ],
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "usage",
  tui,
}

export default plugin
