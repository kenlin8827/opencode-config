/**
 * Shared advisor instructions — mode-specific prompt strings.
 *
 * The advisor protocol body lives in `advisor-protocol.md` (next to this
 * file), loaded once at first use and cached in memory — same pattern as
 * review-fix-loop and grill plugins.
 *
 * Three shapes:
 *   getAdvisorPrompt("off")   — short OFF marker, no protocol.
 *   getAdvisorPrompt("lite")  — full protocol + lite marker (default).
 *   getAdvisorPrompt("full")  — full protocol + full marker (auto-execute).
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { AdvisorMode } from "./advisor-config"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "advisor-protocol.md")

// Cache the protocol file content (loaded once).
let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const MODE_MARKER: Record<AdvisorMode, string> = {
  off: `[ADVISOR MODE: OFF]\nAdvisor consultation is disabled. Do NOT dispatch @advisor.`,
  lite: `[ADVISOR MODE: LITE]\nDispatch @advisor for each blocking decision; present BOTH opinions to the user. Advisor gives opinions only — it NEVER answers on the user's behalf.`,
  full: `[ADVISOR MODE: FULL — ACTIVE NOW]\n` +
    `Dispatch @advisor. Question class FACTUAL + confidence ≥ 8 → auto-execute the answer NOW (on the user's behalf), no question tool. ` +
    `Max 10/session, then lite. ` +
    `PREFERENCE or < 8 → present BOTH opinions (lite flow). This is full, not lite, not off.`,
}

/**
 * Build the prompt fragment for the active mode. The plugin appends this to
 * the system prompt via the experimental.chat.system.transform hook.
 *
 * For "off", no protocol is needed — only the OFF marker, so the LLM knows
 * advisor exists but is disabled. Saves tokens.
 */
export function getAdvisorPrompt(mode: AdvisorMode): string {
  return mode === "off"
    ? `\n\n---\n${MODE_MARKER.off}\n`
    : `\n\n---\n${MODE_MARKER[mode]}\n\n${getProtocol()}\n`
}

/**
 * Directive appended to advisor's tool output in full mode when confidence
 * meets threshold and the question was classified FACTUAL. A code-level
 * nudge for the orchestrator.
 */
export function fullDirective(confidence: number): string {
  return (
    `\n\n---\n[FULL MODE — CODE-LEVEL DIRECTIVE]\n` +
    `Advisor confidence: ${confidence}/10 (threshold met; question classified FACTUAL).\n` +
    `Auto-execute the advisor's recommendation NOW, on the user's behalf. ` +
    `Do NOT call question. Note: "Advisor answered on the user's behalf (confidence ${confidence}/10, class FACTUAL) — auto-executed per full mode."`
  )
}

/**
 * Warning appended when the advisor model wasn't available and OpenCode
 * silently fell back to the default model. In that case the confidence score
 * is untrustworthy — never auto-execute off it.
 */
export function fallbackWarning(): string {
  return (
    `\n\n---\n[ADVISOR MODEL FALLBACK]\n` +
    `The advisor model was unavailable; default model was used.\n` +
    `Do NOT auto-execute in full mode. Return both opinions to the user.`
  )
}
