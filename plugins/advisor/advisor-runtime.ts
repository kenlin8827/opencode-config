/**
 * Shared advisor runtime — log helper + advisor detection + output shaping.
 * Single source of truth for utilities every hook reuses.
 */

import type { PluginInput } from "@opencode-ai/plugin"

// ─── Constants ───────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 8
const MAX_AUTO_ANSWERS = 10

// ─── Try-catch wrapper ───────────────────────────────────────────────
// Plugin hooks must NEVER crash the user's session.

export function safeHook<H extends (...args: never[]) => Promise<unknown>>(
  hook: H,
  log?: (level: "info" | "warn", msg: string) => Promise<unknown>,
): H {
  return (async (...args: never[]) => {
    try {
      return await hook(...args)
    } catch (err) {
      try { await log?.("warn", `hook error (suppressed): ${String(err)}`) } catch {}
    }
  }) as H
}

// ─── Cheap tool-name filter ──────────────────────────────────────────

const DISPATCH_TOOL_RE = /^(task|subagent|dispatch|agent|delegate)$/i

export function isDispatchTool(input: unknown): boolean {
  if (!input || typeof input !== "object") return true
  const t = (input as Record<string, unknown>).tool
  if (typeof t !== "string") return true
  return DISPATCH_TOOL_RE.test(t) || t.toLowerCase().includes("task") || t.toLowerCase().includes("agent")
}

// ─── Advisor dispatch detection ──────────────────────────────────────

export function isAdvisorDispatch(args: unknown): boolean {
  const s = JSON.stringify(args || {})
  return s.includes('"advisor"') || s.includes("@advisor")
}

// ─── Output parsing ──────────────────────────────────────────────────

export function isRedTeamOutput(text: string): boolean {
  const s = String(text || "")
  return s.includes("Red-team analysis") || /\*\*Verdict\*\*\s*:/.test(s)
}

export function detectQuestionClass(text: string): "FACTUAL" | "PREFERENCE" | null {
  const s = String(text || "")
  if (/question\s*class\*{0,2}\s*[:：]\s*\*{0,2}\s*factual\b/i.test(s)) return "FACTUAL"
  if (/question\s*class\*{0,2}\s*[:：]\s*\*{0,2}\s*preference\b/i.test(s)) return "PREFERENCE"
  return null
}

export function extractResponseText(output: unknown): string {
  if (typeof output === "string") return output
  if (!output || typeof output !== "object") return ""
  const o = output as Record<string, unknown>
  for (const key of ["content", "result", "text", "output", "data"]) {
    if (typeof o[key] === "string") return o[key] as string
  }
  if (o.state && typeof o.state === "object") {
    const st = o.state as Record<string, unknown>
    if (typeof st.output === "string") return st.output
  }
  return JSON.stringify(o)
}

export function parseConfidence(text: string): number {
  const m = String(text || "").match(/confidence\*{0,2}[:\s]+\*?(\d{1,2})/i)
  return m ? Math.min(10, Math.max(0, parseInt(m[1], 10))) : 0
}

// ─── Model fallback detection ────────────────────────────────────────

export function isModelFallback(output: unknown): boolean {
  if (!output || typeof output !== "object") return false
  const o = output as Record<string, unknown>
  const meta = o.metadata as Record<string, unknown> | undefined
  const model = meta?.model as Record<string, unknown> | undefined
  const id =
    (model?.modelID as string | undefined) ??
    (model?.id as string | undefined) ??
    (meta?.modelID as string | undefined) ??
    (o.modelID as string | undefined)
  if (!id || typeof id !== "string") return false
  return !id.toLowerCase().includes("advisor")
}

// ─── Output shaping ──────────────────────────────────────────────────

export function appendDirective(output: unknown, directive: string): boolean {
  if (!output || typeof output !== "object") return false
  const o = output as Record<string, unknown>
  for (const key of ["content", "result", "text", "output", "data"]) {
    if (typeof o[key] === "string") {
      o[key] = (o[key] as string) + directive
      return true
    }
  }
  if (o.state && typeof o.state === "object") {
    const st = o.state as Record<string, unknown>
    if (typeof st.output === "string") {
      st.output = st.output + directive
      return true
    }
  }
  return false
}

// ─── Auto-answer state (session-keyed, one-shot) ─────────────────────

const autoAnswerSessions = new Set<string>()
const autoAnswerCounts = new Map<string, number>()

export function setAutoAnswer(sessionId: string): void {
  autoAnswerSessions.add(sessionId)
}

export function isAutoAnswerActive(sessionId: string): boolean {
  return autoAnswerSessions.has(sessionId)
}

export function clearAutoAnswer(sessionId: string): void {
  autoAnswerSessions.delete(sessionId)
}

export function autoAnswerQuotaReached(sessionId: string): boolean {
  return (autoAnswerCounts.get(sessionId) ?? 0) >= MAX_AUTO_ANSWERS
}

export function recordAutoAnswer(sessionId: string): number {
  const next = (autoAnswerCounts.get(sessionId) ?? 0) + 1
  autoAnswerCounts.set(sessionId, next)
  return next
}

// ─── Session ID extraction ───────────────────────────────────────────

export function extractSessionId(output: unknown): string {
  if (!output || typeof output !== "object") return "default"
  const o = output as Record<string, unknown>
  const sid = (o.sessionID as string) ?? (o.sessionId as string)
  if (typeof sid === "string" && sid) return sid
  const meta = o.metadata as Record<string, unknown> | undefined
  const metaSid = (meta?.sessionID as string) ?? (meta?.sessionId as string)
  return typeof metaSid === "string" && metaSid ? metaSid : "default"
}

// ─── Exports for full-inject ─────────────────────────────────────────

export { CONFIDENCE_THRESHOLD, MAX_AUTO_ANSWERS }

// ─── Log helper ──────────────────────────────────────────────────────

export function makeLogger(client: PluginInput["client"], service: string) {
  return (level: "info" | "warn", message: string) =>
    client.app.log({ body: { service, level, message } })
}
