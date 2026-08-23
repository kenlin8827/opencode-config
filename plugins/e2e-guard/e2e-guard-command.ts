/**
 * Hook: command.execute.before — handle `/e2e-guard <action>`.
 * The command is registered programmatically via the `config` hook in
 * e2e-guard.ts — no commands/e2e-guard.md file is needed.
 * One command, argument selects the action:
 *
 *   /e2e-guard on      → state=on  (e2eGuard field written to project opencode.jsonc)
 *   /e2e-guard off     → state=off (field written; pending approvals dropped)
 *   /e2e-guard reset   → e2eGuard field removed; reverts to the default off
 *   /e2e-guard allow   → session approval (in-memory): one-shot pass for
 *                        the next FULL run + sticky unlock for targeted
 *                        spec re-runs — grant it ONLY after the user
 *                        actually confirmed
 *   /e2e-guard allow targeted → unlock ONLY: targeted (affected-spec)
 *                        re-runs flow for the rest of the session, full
 *                        suites stay gated — the "affected only" choice
 *   /e2e-guard [status]→ read-only status report (no state change)
 *
 * Every invocation gets user-visible feedback via
 * session.prompt({ noReply, ignored }) in the main chat UI, degrading
 * to toast in headless environments.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { makeLogger } from "../adr-guard/adr-guard-runtime"
import { announceAllow, announceStatus, announceSwitch } from "./e2e-guard-announce"
import {
  clearState,
  COMMAND_NAME,
  parseAllowArg,
  parseResetArg,
  parseStateArg,
  setState,
} from "./e2e-guard-config"
import { approveSession, clearApprovals, unlockSession } from "./e2e-guard-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"], handled: () => never) {
  const log: Log = makeLogger(client, "e2e-guard")

  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return
    const sessionID = String(input.sessionID ?? "")

    const allowScope = parseAllowArg(input.arguments)
    if (allowScope) {
      if (allowScope === "targeted") {
        unlockSession(sessionID)
        await log("info", `targeted-only unlock granted for session ${sessionID || "(unknown)"}`)
      } else {
        approveSession(sessionID)
        await log("info", `one-shot approval granted for session ${sessionID || "(unknown)"}`)
      }
      await announceAllow(client, input.sessionID, allowScope)
    } else if (parseResetArg(input.arguments)) {
      const cleared = clearState()
      clearApprovals()
      await log(
        cleared ? "info" : "warn",
        cleared
          ? "e2eGuard field removed — reverted to default off"
          : "reset failed — project config not writable",
      )
      await announceStatus(client, input.sessionID)
    } else {
      const state = parseStateArg(input.arguments)
      if (state) {
        const written = setState(state)
        if (state === "off") clearApprovals()
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
