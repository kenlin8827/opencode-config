/**
 * Hook: tool.execute.before — block @advisor dispatch when mode is off.
 * Throws a clear error so the orchestrator knows advisor was blocked on
 * purpose, not by accident. Suggests the fix (/advisor lite or /advisor full).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { isOn } from "./advisor-config"
import { isAdvisorDispatch } from "./advisor-runtime"

export function makeToolGuardHook(_client: PluginInput["client"]) {
  return async (_input: unknown, output: { args: unknown }) => {
    if (isOn()) return
    if (!isAdvisorDispatch(output.args)) return
    throw new Error(
      "[Advisor Mode Guard] Advisor mode is OFF.\n" +
        "The @advisor agent cannot be dispatched while advisor mode is disabled.\n" +
        "Run /advisor lite (advisory) or /advisor full (decisive) to re-enable."
    )
  }
}