/**
 * Hook: command.execute.before — handle `/review-fix-loop`.
 *
 *   1. Arm the session (so system.transform injects the protocol).
 *   2. Do nothing else — the user's raw input is passed through to
 *      the LLM as-is by OpenCode's normal command execution.
 *
 * The config hook registers the command with template: "$ARGUMENTS"
 * so the rendered user message is exactly the arguments string.
 * The full protocol is injected into the system prompt by
 * rfl-system-inject.ts (LLM-only, not visible in chat UI).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { COMMAND_NAME, armSession } from "./rfl-config"
import { makeLogger } from "./rfl-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "review-fix-loop")

  return async (input: { command?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return

    armSession(input.sessionID || "default")
    await log("info", "command armed")
  }
}
