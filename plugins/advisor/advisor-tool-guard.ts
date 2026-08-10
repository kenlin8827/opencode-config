/**
 * Hook: tool.execute.before — two guard duties:
 *
 *   1. Full-mode auto-answer enforcement: if the after hook armed auto-answer
 *      for this session, block the question tool so the orchestrator can't
 *      ask the user. One-shot — consumed on the very next tool call.
 *
 *   2. Off-mode dispatch block: when mode is off, block @advisor dispatch.
 *
 * NOT wrapped in safeHook — throws are the blocking mechanism and must
 * propagate. Unexpected errors in the detection logic are unlikely (all
 * predicates are null-safe).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { isOn } from "./advisor-config"
import {
  clearAutoAnswer,
  extractSessionId,
  isAdvisorDispatch,
  isAutoAnswerActive,
  makeLogger,
} from "./advisor-runtime"

type Log = ReturnType<typeof makeLogger>

const QUESTION_TOOL_RE = /^(question|ask|prompt|confirm|select)$/i

export function makeToolGuardHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "advisor-mode")

  // NOT wrapped in safeHook — intentional throws must propagate to block
  // tool execution. safeHook would swallow them and defeat the guard.
  return async (input: { tool?: string }, output: { args?: unknown }) => {
    const sessionId = extractSessionId(output)

    // ── 1. Full-mode auto-answer enforcement (one-shot) ───────────
    if (isAutoAnswerActive(sessionId)) {
      clearAutoAnswer(sessionId)
      if (input.tool && QUESTION_TOOL_RE.test(input.tool)) {
        await log(
          "info",
          `question tool "${input.tool}" blocked — auto-answer active for session ${sessionId}`,
        )
        throw new Error(
          "[Advisor Mode Guard] Full-mode auto-answer is active — " +
            "question tool blocked.\n" +
            "The advisor answered on the user's behalf (FACTUAL, confidence ≥ 8).\n" +
            "Execute the advisor's recommendation directly instead of asking the user.",
        )
      }
    }

    // ── 2. Off-mode @advisor dispatch block ───────────────────────
    if (isOn()) return
    if (!isAdvisorDispatch(output.args)) return
    throw new Error(
      "[Advisor Mode Guard] Advisor mode is OFF.\n" +
        "The @advisor agent cannot be dispatched while advisor mode is disabled.\n" +
        "Run /advisor lite (advisory) or /advisor full (decisive) to re-enable.",
    )
  }
}
