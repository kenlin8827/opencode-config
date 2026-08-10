/**
 * Hook: tool.execute.after — finalize advisor's response for full mode.
 *
 *   - safeHook: exceptions never crash the user's session.
 *   - isDispatchTool: skip non-dispatch tools (perf).
 *   - Format validation: warn on unparseable confidence/class.
 *   - Frequency limit: max MAX_AUTO_ANSWERS per session.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getMode } from "./advisor-config"
import { fullDirective, fallbackWarning } from "./advisor-instructions"
import {
  CONFIDENCE_THRESHOLD,
  MAX_AUTO_ANSWERS,
  appendDirective,
  autoAnswerQuotaReached,
  detectQuestionClass,
  extractResponseText,
  extractSessionId,
  isAdvisorDispatch,
  isDispatchTool,
  isModelFallback,
  isRedTeamOutput,
  makeLogger,
  parseConfidence,
  recordAutoAnswer,
  safeHook,
  setAutoAnswer,
} from "./advisor-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeFullInjectHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "advisor-mode")

  return safeHook(
    async (input: unknown, output: unknown) => {
      const mode = getMode()
      if (mode === "off") return
      if (!isDispatchTool(input)) return

      if (!isAdvisorDispatch(input) && !isAdvisorDispatch(output)) return

      const text = extractResponseText(output)

      if (isRedTeamOutput(text)) {
        await log("info", "red-team output — directives suppressed")
        return
      }

      const confidence = parseConfidence(text)
      const fallback = isModelFallback(output)
      const questionClass = detectQuestionClass(text)
      const factual = questionClass === "FACTUAL"
      const sessionId = extractSessionId(output)

      if (confidence === 0) {
        await log("warn", "confidence score not parsed — check advisor output format")
      }
      if (questionClass === null) {
        await log("warn", "question class not found — check advisor output format")
      }

      await log(
        "info",
        `advisor: confidence=${confidence}/${CONFIDENCE_THRESHOLD}, class=${questionClass ?? "UNKNOWN"}, fallback=${fallback}, session=${sessionId}`,
      )

      if (fallback) {
        const ok = appendDirective(output, fallbackWarning())
        if (!ok) await log("warn", "fallback warning FAILED to inject")
      }

      const shouldAuto =
        mode === "full" &&
        confidence >= CONFIDENCE_THRESHOLD &&
        factual &&
        !fallback &&
        !autoAnswerQuotaReached(sessionId)

      if (shouldAuto) {
        const ok = appendDirective(output, fullDirective(confidence))
        if (ok) {
          setAutoAnswer(sessionId)
          const count = recordAutoAnswer(sessionId)
          await log(
            "info",
            `auto-answer armed [${count}/${MAX_AUTO_ANSWERS}] — confidence=${confidence}, class=FACTUAL, session=${sessionId}`,
          )
        } else {
          await log("warn", "full directive FAILED to inject — output structure unrecognized")
        }
      } else if (mode === "full" && confidence >= CONFIDENCE_THRESHOLD && factual && !fallback) {
        await log("warn", `auto-answer skipped — quota reached (${MAX_AUTO_ANSWERS}/${MAX_AUTO_ANSWERS})`)
      }
    },
    log,
  )
}
