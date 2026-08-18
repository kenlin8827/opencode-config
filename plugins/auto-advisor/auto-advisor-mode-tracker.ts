/**
 * Hook: command.execute.before — handle `/auto-advisor <mode>`.
 * The command is registered programmatically via the `config` hook in
 * auto-advisor-mode.ts — no commands/auto-advisor.md file is needed.
 * One command file, argument selects mode (off/lite/full).
 *
 *   /auto-advisor lite  → state=lite
 *   /auto-advisor full  → state=full
 *   /auto-advisor off   → state=off
 *   /auto-advisor       → no-op (no mode given)
 *
 * Every successful switch also gets user-visible feedback via
 * session.prompt({ noReply, ignored }) in the main chat UI, degrading
 * to toast in headless environments.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { announceSwitch } from "./auto-advisor-announce"
import { COMMAND_NAME, parseModeArg, setMode } from "./auto-advisor-config"
import { makeLogger, clearAutoAnswerCounts, clearAutoAnswerSessions } from "./auto-advisor-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"], handled: () => never) {
  const log: Log = makeLogger(client, "auto-advisor-mode")

  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return
    const mode = parseModeArg(input.arguments)
    if (!mode) return
    setMode(mode)
    clearAutoAnswerCounts()
    clearAutoAnswerSessions()
    await log("info", `mode=${mode.toUpperCase()} — state file written`)
    await announceSwitch(client, mode, input.sessionID)
    return handled()
  }
}