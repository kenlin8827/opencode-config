/**
 * Hook: command.execute.before — handle `/adr-guard <state>`.
 * The command is registered programmatically via the `config` hook in
 * adr-guard.ts — no commands/adr-guard.md file is needed.
 * One command, argument selects the switch:
 *
 *   /adr-guard on      → state=on  (project-level state file written)
 *   /adr-guard off     → state=off (project-level state file written)
 *   /adr-guard reset   → state file deleted; falls back to the committed
 *                        adrGuard config field (or default off)
 *   /adr-guard [status]→ read-only status report (no state change)
 *
 * Every invocation gets user-visible feedback via
 * session.prompt({ noReply, ignored }) in the main chat UI, degrading
 * to toast in headless environments.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { announceStatus, announceSwitch } from "./adr-guard-announce"
import { clearState, COMMAND_NAME, parseResetArg, parseStateArg, setState } from "./adr-guard-config"
import { makeLogger } from "./adr-guard-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"], handled: () => never) {
  const log: Log = makeLogger(client, "adr-guard")

  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return
    if (parseResetArg(input.arguments)) {
      clearState()
      await log("info", "state file deleted — falling back to config/default")
      await announceStatus(client, input.sessionID)
    } else {
      const state = parseStateArg(input.arguments)
      if (state) {
        setState(state)
        await log("info", `state=${state.toUpperCase()} — project state file written`)
        await announceSwitch(client, state, input.sessionID)
      } else {
        await announceStatus(client, input.sessionID)
      }
    }
    return handled()
  }
}
