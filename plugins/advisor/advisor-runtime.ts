/**
 * Shared advisor runtime — log helper + advisor detection + output shaping.
 * Single source of truth for utilities every hook reuses. Keeps the hook
 * handlers below to their single responsibility (one event each).
 */

import type { PluginInput } from "@opencode-ai/plugin"

/**
 * Detect advisor dispatch in tool args. Looks for the agent name.
 *
 * Known limitation: substring-based on purpose — the exact shape of the
 * task-tool args is not contractually known, and a false negative here is
 * worse than a false positive (off-mode guard wouldn't fire, full-mode
 * directive wouldn't inject). Tighten only once e2e coverage proves the
 * real arg shape.
 */
export function isAdvisorDispatch(args: unknown): boolean {
  const s = JSON.stringify(args || {})
  return s.includes('"advisor"') || s.includes("@advisor")
}

/**
 * Detect red-team stance output by its mandatory markers (verdict header /
 * Verdict line). Hard code-level guard: red-team verdicts must NEVER trigger
 * full-mode auto-execute — enforced here regardless of whether the model
 * obeyed the "no confidence score" rule in the prompt.
 */
export function isRedTeamOutput(text: string): boolean {
  const s = String(text || "")
  return s.includes("Red-team analysis") || /\*\*Verdict\*\*\s*:/.test(s)
}

/**
 * Detect the advisor's question-class marker. Every blocking question is
 * classified by the advisor itself:
 *   FACTUAL    — answer derivable from code/docs/context, no unstated user
 *                preference → eligible for full-mode auto-answer.
 *   PREFERENCE — depends on user taste/goals/priorities → ALWAYS back to
 *                the user, no confidence score unlocks it.
 * Code-level gate: only an explicit "Question class: FACTUAL" marker unlocks
 * auto-answer — a missing or PREFERENCE classification never does.
 */
export function isFactualClass(text: string): boolean {
  return /question\s*class\*{0,2}\s*[:：]\s*\*{0,2}\s*factual\b/i.test(
    String(text || ""),
  )
}

/**
 * Best-effort extraction of advisor's response text from whatever shape
 * OpenCode gives us. Order: known string fields → state.output → JSON.stringify.
 */
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

/**
 * Parse a 1-10 confidence score from advisor's free-text response.
 * Matches: "Confidence: 9", "**Confidence**: 8", "confidence 10/10".
 */
export function parseConfidence(text: string): number {
  const m = String(text || "").match(/confidence\*{0,2}[:\s]+\*?(\d{1,2})/i)
  return m ? Math.min(10, Math.max(0, parseInt(m[1], 10))) : 0
}

/**
 * Detect advisor model fallback: if OpenCode couldn't reach the dedicated
 * `advisor` model it silently uses the default. The confidence score from
 * a fallback is less trustworthy — we never auto-execute off it.
 */
export function isModelFallback(output: unknown): boolean {
  if (!output || typeof output !== "object") return false
  const meta = (output as Record<string, unknown>).metadata as
  Record<string, unknown>
  | undefined
  const model = meta?.model as Record<string, unknown> | undefined
  const id = model?.modelID as string | undefined
  return !!id && id !== "advisor"
}

/**
 * Best-effort: append a string directive to whichever output field the
 * OpenCode task tool uses. Returns true on inject.
 */
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

/**
 * Log helper — same shape for every hook, one line per event.
 */
export function makeLogger(client: PluginInput["client"], service: string) {
  return (level: "info" | "warn", message: string) =>
    client.app.log({ body: { service, level, message } })
}