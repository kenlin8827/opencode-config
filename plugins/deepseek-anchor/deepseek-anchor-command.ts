/**
 * Hook: command.execute.before — handle `/deepseek-anchor <mode>`.
 * The command is registered programmatically via the `config` hook in
 * index.ts — no commands/deepseek-anchor.md file is needed.
 * One command file, argument selects mode (on/off).
 *
 *   /deepseek-anchor on   → state=on
 *   /deepseek-anchor off  → state=off
 *   /deepseek-anchor      → show help (no mode given)
 *
 * Every successful switch also gets user-visible feedback via
 * session.prompt({ noReply, ignored }) in the main chat UI, degrading
 * to toast in headless environments.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getMode, setMode, COMMAND_NAME, parseModeArg, type AnchorMode } from "./deepseek-anchor-config"

/** One user-visible line per mode. */
function switchMessage(mode: AnchorMode): string {
  const emoji = mode === "on" ? "✅" : "❌"
  const text = mode === "on" ? "ENABLED" : "DISABLED"
  return `${emoji} DeepSeek Anchor ${text}. DeepSeek models will now ${mode === "on" ? "use reasoning anchor and block first tool call" : "behave normally"}.`
}

export function makeCommandHook(client: PluginInput["client"], handled: () => never) {
  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return

    const currentMode = getMode()
    const newMode = parseModeArg(input.arguments)

    // If no valid argument provided or argument is invalid, show help
    if (!newMode) {
      const help = `[deepseek-anchor] Current status: ${currentMode === "on" ? "✅ ENABLED" : "❌ DISABLED"}

Usage: /deepseek-anchor <on|off>
- on  → Enable reasoning anchor (blocks first tool call)
- off → Disable reasoning anchor (normal behavior)`

      if (input.sessionID) {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            parts: [{ type: "text", text: help, ignored: true }],
            noReply: true,
          },
        })
      }
      return handled()
    }

    // If already in target state, show a message
    if (newMode === currentMode) {
      const message = newMode === "on"
        ? `[deepseek-anchor] Already enabled`
        : `[deepseek-anchor] Already disabled`

      if (input.sessionID) {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            parts: [{ type: "text", text: message, ignored: true }],
            noReply: true,
          },
        })
      }
      return handled()
    }

    // Switch to new state
    setMode(newMode)
    const message = switchMessage(newMode)

    if (input.sessionID) {
      await client.session.prompt({
        path: { id: input.sessionID },
        body: {
          parts: [{ type: "text", text: message, ignored: true }],
          noReply: true,
        },
      })
    }

    return handled()
  }
}