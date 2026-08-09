/**
 * Hook: command.execute.before — handle `/advisor <mode>`.
 * One command file, argument selects mode (off/lite/full).
 *
 *   /advisor lite  → state=lite
 *   /advisor full  → state=full
 *   /advisor off   → state=off
 *   /advisor       → no-op (no mode given)
 *
 * Every successful switch also gets user-visible feedback (TUI toast,
 * degrading to log in headless environments) — the state file alone is
 * silent and the user must see the confirmation.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { announceSwitch } from "./advisor-announce"
import { COMMAND_NAME, parseModeArg, setMode } from "./advisor-config"
import { makeLogger } from "./advisor-runtime"

type Log = ReturnType<typeof makeLogger>

export function makeCommandHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "advisor-mode")

  return async (input: { command?: string; arguments?: string }) => {
    if (input.command !== COMMAND_NAME) return
    const mode = parseModeArg(input.arguments)
    if (!mode) return
    setMode(mode)
    await log("info", `mode=${mode.toUpperCase()} — state file written`)
    await announceSwitch(client, mode)
  }
}