/**
 * Hook: command.execute.before — `/e2e-guard <subcommand>` user controls.
 *
 * Provides control over the project-level switch:
 *   /e2e-guard on|off  → flips the `e2eGuard` field in opencode.jsonc
 *   /e2e-guard status  → reports the current project gate state
 */

import { getState, setState, writableProjectConfigFile } from "./e2e-guard-config"

export const COMMAND_NAME = "e2e-guard"

export const SUBCOMMAND_STATUS = "status"
export const SUBCOMMAND_ON = "on"
export const SUBCOMMAND_OFF = "off"

const HELP = `[e2e-guard] E2E Red-Line Guard — project switch controls.
Usage:
/e2e-guard status   → check current guard status (on / off)
/e2e-guard on | off → flip the project gate in opencode.jsonc (persisted)`

/** One-line gate report for `/e2e-guard status`. */
export function statusText(): string {
  const gate = getState() === "on" ? "on" : "off"
  return `[e2e-guard] gate: ${gate}. (Protocol injection is ${gate === "on" ? "ACTIVE" : "INACTIVE"})`
}

export function makeCommandHook() {
  return async (
    input: { command?: string; arguments?: string; sessionID?: string },
    output: { parts?: unknown },
  ) => {
    if (input.command !== COMMAND_NAME) return

    const tokens = (input.arguments ?? "").trim().split(/\s+/).filter(Boolean)
    const sub = (tokens[0] ?? "").toLowerCase()

    let text: string
    if (sub === SUBCOMMAND_STATUS) {
      text = statusText()
    } else if (sub === SUBCOMMAND_ON || sub === SUBCOMMAND_OFF) {
      text = setState(sub)
        ? `[e2e-guard] Gate ${sub.toUpperCase()} — wrote "e2eGuard": "${sub}" to ${writableProjectConfigFile()}.`
        : `[e2e-guard] Failed to write the project config — edit the "e2eGuard" field of opencode.jsonc by hand.`
    } else {
      text = sub ? `[e2e-guard] Unknown subcommand "${sub}".\n\n${HELP}` : HELP
    }

    output.parts = [{ type: "text", text }]
  }
}
