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

/**
 * Returns true when the tool looks like a dispatch/subagent tool.
 * When the input shape is unrecognized (no object, no .tool string),
 * returns true as a conservative default — the caller (full-inject)
 * re-filters with isAdvisorDispatch, so a false positive here only
 * costs one extra JSON.stringify, never a wrong auto-execute.
 */
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
  // Match the mandatory output format from advisor.md:
  //   "**Question class**: FACTUAL" / "Question class: PREFERENCE"
  // Also tolerate close variants:
  //   "Question type: FACTUAL"  — some models swap "class" for "type"
  //   "Class: FACTUAL"          — shortened label
  //   "**FACTUAL**"             — standalone bold marker (no label)
  if (/question\s*(?:class|type)?\s*\*{0,2}\s*[:：]\s*\*{0,2}\s*factual\b/i.test(s)) return "FACTUAL"
  if (/question\s*(?:class|type)?\s*\*{0,2}\s*[:：]\s*\*{0,2}\s*preference\b/i.test(s)) return "PREFERENCE"
  if (/\bclass\s*\*{0,2}\s*[:：]\s*\*{0,2}\s*factual\b/i.test(s)) return "FACTUAL"
  if (/\bclass\s*\*{0,2}\s*[:：]\s*\*{0,2}\s*preference\b/i.test(s)) return "PREFERENCE"
  // Standalone bold marker — last resort, only if no labeled match found.
  if (/\*{0,2}\bFACTUAL\b\*{0,2}/i.test(s)) return "FACTUAL"
  if (/\*{0,2}\bPREFERENCE\b\*{0,2}/i.test(s)) return "PREFERENCE"
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
  // Match the mandatory output format from advisor.md:
  //   "**Confidence**: 8" or "Confidence: 8/10"
  // Also tolerate close variants:
  //   "Confidence Level: 8" / "Confidence Score: 8" — extra word
  //   "Confidence：8" — fullwidth colon
  // Require a colon (ASCII or fullwidth) so natural-language phrases like
  // "confidence in the team is high" don't trigger a false parse.
  const s = String(text || "")
  const patterns = [
    // Primary: Confidence[: ] N  or  **Confidence**: N/10
    /confidence\s*(?:level|score)?\s*\*{0,2}\s*[:：]\s*\*{0,2}(\d{1,2})\s*(?:\/\s*10)?\b/i,
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) return Math.min(10, Math.max(0, parseInt(m[1], 10)))
  }
  return 0
}

// ─── Model fallback detection ────────────────────────────────────────
//
// Strategy: read opencode.jsonc to find the advisor agent's configured model
// (e.g. "deepseek/deepseek-v4-pro") and the default agent's model (e.g.
// "deepseek/deepseek-v4-flash"). The tool output carries the actual model id
// that was used. If the actual id matches the advisor's configured model →
// not a fallback. If it matches the default model → fallback. If we can't
// read the config or the actual id is missing → trust the configuration and
// return false (don't block auto-execute on a parse failure).
//
// This replaces the old heuristic ("model id must contain 'advisor'") which
// was broken for any provider whose model ids don't include the string
// 'advisor' — e.g. DeepSeek ("deepseek-v4-pro"), Qwen, MiniMax, etc.

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR_FALLBACK = join(homedir(), ".config", "opencode")
const CONFIG_FILE_FALLBACK = join(CONFIG_DIR_FALLBACK, "opencode.jsonc")
const CONFIG_FILE_LEGACY = join(CONFIG_DIR_FALLBACK, "opencode.json")

// Cache the config read — it doesn't change during a session.
let cachedAdvisorModel: string | null | undefined = undefined
let cachedDefaultModel: string | null | undefined = undefined

/**
 * Strip JSONC comments and trailing commas so we can JSON.parse a .jsonc file.
 * Minimal stripper: removes line comments and block comments while respecting
 * string literals, and removes trailing commas before } or ].
 */
function stripJsonc(raw: string): string {
  let result = ""
  let i = 0
  const len = raw.length
  let state: "normal" | "string" | "lineComment" | "blockComment" = "normal"
  while (i < len) {
    const c = raw[i]
    const next = i + 1 < len ? raw[i + 1] : ""
    switch (state) {
      case "normal":
        if (c === '"') { result += c; state = "string" }
        else if (c === "/" && next === "/") { state = "lineComment"; i++ }
        else if (c === "/" && next === "*") { state = "blockComment"; i++ }
        else { result += c }
        break
      case "string":
        result += c
        if (c === "\\") { i++; if (i < len) result += raw[i] }
        else if (c === '"') { state = "normal" }
        break
      case "lineComment":
        if (c === "\n") { result += c; state = "normal" }
        break
      case "blockComment":
        if (c === "*" && next === "/") { state = "normal"; i++ }
        break
    }
    i++
  }
  return result.replace(/,(\s*[}\]])/g, "$1")
}

function readAgentModels(): { advisor: string | null; default: string | null } {
  if (cachedAdvisorModel !== undefined && cachedDefaultModel !== undefined) {
    return { advisor: cachedAdvisorModel, default: cachedDefaultModel }
  }
  cachedAdvisorModel = null
  cachedDefaultModel = null
  for (const path of [CONFIG_FILE_FALLBACK, CONFIG_FILE_LEGACY]) {
    if (!existsSync(path)) continue
    try {
      const raw = readFileSync(path, "utf-8")
      const cfg = JSON.parse(stripJsonc(raw)) as Record<string, unknown>
      const agents = cfg?.agent as Record<string, Record<string, unknown>> | undefined
      if (!agents) break
      // Find the advisor agent's model (the agent named "advisor").
      const advisorAgent = agents["advisor"]
      if (advisorAgent?.model && typeof advisorAgent.model === "string") {
        cachedAdvisorModel = advisorAgent.model
      }
      // Find the default model: either root-level cfg.model, or the first
      // agent with tier "default".
      if (cfg.model && typeof cfg.model === "string") {
        cachedDefaultModel = cfg.model
      }
      if (!cachedDefaultModel) {
        for (const a of Object.values(agents)) {
          if (a?.tier === "default" && typeof a.model === "string") {
            cachedDefaultModel = a.model
            break
          }
        }
      }
      break
    } catch {
      // config parse error — try next file
    }
  }
  return { advisor: cachedAdvisorModel, default: cachedDefaultModel }
}

/**
 * Extract the model-id portion from a "provider/model-id" reference.
 * e.g. "deepseek/deepseek-v4-pro" → "deepseek-v4-pro"
 *      "llm-router/advisor" → "advisor"
 * Returns the input as-is if there's no slash.
 */
function modelIdFromRef(ref: string): string {
  const idx = ref.lastIndexOf("/")
  return idx >= 0 ? ref.substring(idx + 1) : ref
}

export function isModelFallback(output: unknown): boolean {
  if (!output || typeof output !== "object") return false
  const o = output as Record<string, unknown>
  const meta = o.metadata as Record<string, unknown> | undefined
  const model = meta?.model as Record<string, unknown> | undefined
  const actualId =
    (model?.modelID as string | undefined) ??
    (model?.id as string | undefined) ??
    (meta?.modelID as string | undefined) ??
    (o.modelID as string | undefined)
  // If we can't determine the actual model id, don't block auto-execute.
  if (!actualId || typeof actualId !== "string") return false

  const { advisor: advisorModel, default: defaultModel } = readAgentModels()

  // If we know the advisor's configured model, check whether the actual id
  // matches it (any case). This is the primary check.
  const actualLower = actualId.toLowerCase()
  if (advisorModel) {
    const advisorId = modelIdFromRef(advisorModel).toLowerCase()
    if (actualLower === advisorId || actualLower.includes(advisorId)) {
      return false // actual model matches advisor config — not a fallback
    }
  }

  // If we know the default model, check whether the actual id matches it.
  // That would indicate the advisor was unavailable and the system fell back.
  if (defaultModel) {
    const defaultId = modelIdFromRef(defaultModel).toLowerCase()
    if (actualLower === defaultId || actualLower.includes(defaultId)) {
      return true // actual model matches default config — it's a fallback
    }
  }

  // Can't determine — trust the configuration, don't block auto-execute.
  return false
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

/**
 * Tear down all state for a session — call when a session ends to prevent
 * the Set/Map from growing without bound in long-lived plugin hosts.
 */
export function disposeSession(sessionId: string): void {
  autoAnswerSessions.delete(sessionId)
  autoAnswerCounts.delete(sessionId)
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
