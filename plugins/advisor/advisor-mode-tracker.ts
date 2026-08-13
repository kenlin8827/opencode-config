/**
 * Hook: command.execute.before — handle `/advisor <mode>`.
 * The command is registered programmatically via the `config` hook in
 * advisor-mode.ts — no commands/advisor.md file is needed.
 * One command file, argument selects mode (off/lite/full).
 *
 *   /advisor lite  → state=lite
 *   /advisor full  → state=full
 *   /advisor off   → state=off
 *   /advisor       → no-op (no mode given)
 *
 * Every successful switch also gets user-visible feedback via
 * session.prompt({ noReply, ignored }) in the main chat UI, degrading
 * to toast in headless environments.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { announceSwitch } from "./advisor-announce"
import { COMMAND_NAME, parseModeArg, setMode } from "./advisor-config"
import { makeLogger } from "./advisor-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"], handled: () => never) {
  const log: Log = makeLogger(client, "advisor-mode")

  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return
    const mode = parseModeArg(input.arguments)
    if (!mode) return
    setMode(mode)
    await log("info", `mode=${mode.toUpperCase()} — state file written`)
    await announceSwitch(client, mode, input.sessionID)
    return handled()
  }
}