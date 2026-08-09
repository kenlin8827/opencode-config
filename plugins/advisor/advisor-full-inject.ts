/**
 * Hook: tool.execute.after — finalize advisor's response for full mode.
 * Parses confidence, detects model fallback, appends the right directive.
 *
 * Rules:
 *   - Red-team stance output? Suppress ALL directives and stop — adversarial
 *     verdicts must never auto-execute, regardless of mode or stray scores.
 *   - Model fallback (OpenCode couldn't reach the dedicated advisor model)?
 *     Confidence is untrustworthy → append fallback warning, never auto-execute.
 *   - Question not classified FACTUAL? Never auto-answer — PREFERENCE
 *     questions always go back to the user, no confidence score unlocks them.
 *   - Full + FACTUAL + confidence ≥ 9 + no fallback → auto-answer directive.
 *   - Otherwise: no injection (lite flow handles it itself).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getMode } from "./advisor-config"
import { fullDirective, fallbackWarning } from "./advisor-instructions"
import {
  appendDirective,
  extractResponseText,
  isAdvisorDispatch,
  isFactualClass,
  isModelFallback,
  isRedTeamOutput,
  makeLogger,
  parseConfidence,
} from "./advisor-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeFullInjectHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "advisor-mode")

  return async (input: { args: unknown }, output: unknown) => {
    const mode = getMode()
    if (mode === "off") return
    if (!isAdvisorDispatch(input.args) && !isAdvisorDispatch(output)) return

    const text = extractResponseText(output)

    // Hard guard: adversarial verdicts never auto-execute — in any mode.
    if (isRedTeamOutput(text)) {
      await log("info", "red-team output detected — directives suppressed")
      return
    }

    const confidence = parseConfidence(text)
    const fallback = isModelFallback(output)
    const factual = isFactualClass(text)
    await log("info", `advisor returned: confidence=${confidence}/10, class=${factual ? "FACTUAL" : "PREFERENCE"}, fallback=${fallback}`)

    if (fallback) appendDirective(output, fallbackWarning())

    if (mode === "full" && confidence >= 9 && factual && !fallback) {
      appendDirective(output, fullDirective(confidence))
      await log("info", `full directive injected (confidence=${confidence}, class=FACTUAL)`)
      return
    }
    if (mode === "full" && confidence >= 9 && !factual) {
      await log("info", "confidence ≥ 9 but question class is not FACTUAL — no auto-answer, back to user")
    }
  }
}