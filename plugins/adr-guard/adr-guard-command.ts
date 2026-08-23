/**
 * Hook: command.execute.before — handle `/adr-guard <state>`.
 * The command is registered programmatically via the `config` hook in
 * adr-guard.ts — no commands/adr-guard.md file is needed.
 * One command, argument selects the switch:
 *
 *   /adr-guard on      → state=on  (adrGuard field written to project opencode.jsonc)
 *   /adr-guard off     → state=off (adrGuard field written to project opencode.jsonc)
 *   /adr-guard reset   → adrGuard field removed; reverts to the default off
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
      const cleared = clearState()
      await log(
        cleared ? "info" : "warn",
        cleared
          ? "adrGuard field removed — reverted to default off"
          : "reset failed — project config not writable",
      )
      await announceStatus(client, input.sessionID)
    } else {
      const state = parseStateArg(input.arguments)
      if (state) {
        const written = setState(state)
        await log(
          written ? "info" : "warn",
          written
            ? `state=${state.toUpperCase()} — project opencode.jsonc written`
            : `state=${state.toUpperCase()} — project config write failed (not writable)`,
        )
        await announceSwitch(client, state, input.sessionID)
      } else {
        await announceStatus(client, input.sessionID)
      }
    }
    return handled()
  }
}
