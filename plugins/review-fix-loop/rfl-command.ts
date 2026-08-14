/**
 * Hook: command.execute.before — handle `/review-fix-loop`.
 *
 *   1. Arm the session (so system.transform injects the protocol).
 *   2. handled() — suppress the command template.
 *
 * The user's raw input ("/review-fix-loop last commit --max-rounds=8")
 * remains as the user message. The protocol is injected into the system
 * prompt by rfl-system-inject.ts.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { COMMAND_NAME, armSession } from "./rfl-config"
import { makeLogger } from "./rfl-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"], handled: () => never) {
  const log: Log = makeLogger(client, "review-fix-loop")

  return async (input: { command?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return

    armSession(input.sessionID || "default")
    await log("info", "command armed")
    return handled()
  }
}
