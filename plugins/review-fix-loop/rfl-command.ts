/**
 * Hook: command.execute.before — handle `/review-fix-loop`.
 *
 *   1. Arm the session (so system.transform injects the protocol).
 *   2. Push the full command into output.parts with ignored: true.
 *
 * Why ignored: true?
 *   - The UI already shows the user's raw input ("/review-fix-loop last commit").
 *   - Without this push, the empty template ("") means the LLM gets an
 *     empty user message — it never sees the command or arguments.
 *   - ignored: true makes OpenCode's message-v2 converter skip this part
 *     in the UI (no duplicate display), but the LLM still receives it.
 *
 * Result: UI shows one line (user input), LLM sees the full command.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { COMMAND_NAME, armSession } from "./rfl-config"
import { makeLogger } from "./rfl-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "review-fix-loop")

  return async (
    input: { command?: string; arguments?: string; sessionID?: string },
    output: { parts: any[] },
  ) => {
    if (input.command !== COMMAND_NAME) return

    armSession(input.sessionID || "default")

    const message = `/review-fix-loop${input.arguments ? " " + input.arguments : ""}`
    output.parts.push({ type: "text", text: message, ignored: true })

    await log("info", "command armed, user message injected (ignored)")
  }
}
