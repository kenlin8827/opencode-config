/**
 * Hook: tool.execute.after — finalize advisor's response for full mode.
 * Parses confidence, detects model fallback, appends the right directive.
 *
 * Rules:
 *   - Model fallback (OpenCode couldn't reach the dedicated advisor model)?
 *     Confidence is untrustworthy → append fallback warning, never auto-execute.
 *   - Full + confidence ≥ 9 + no fallback → append the auto-execute directive.
 *   - Otherwise: no injection (lite flow handles it itself).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getMode } from "./advisor-config"
import { fullDirective, fallbackWarning } from "./advisor-instructions"
import {
  appendDirective,
  extractResponseText,
  isAdvisorDispatch,
  isModelFallback,
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

    const confidence = parseConfidence(extractResponseText(output))
    const fallback = isModelFallback(output)
    await log("info", `advisor returned: confidence=${confidence}/10, fallback=${fallback}`)

    if (fallback) appendDirective(output, fallbackWarning())

    if (mode === "full" && confidence >= 9 && !fallback) {
      appendDirective(output, fullDirective(confidence))
      await log("info", `full directive injected (confidence=${confidence})`)
    }
  }
}