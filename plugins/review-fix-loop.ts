/**
 * Review-Fix Loop Plugin — injects the protocol into the system prompt
 * in the same turn the user runs `/review-fix-loop`.
 *
 * The slash command itself is registered statically via
 * `commands/review-fix-loop.md` (sync file-scan at startup),
 * which avoids the TUI async-loading race condition where the command
 * isn't available on first input.
 *
 * Two hooks:
 *   1. command.execute.before — arms the session
 *   2. system.transform — injects protocol into system prompt (LLM-only)
 *
 * The protocol body lives in `review-fix-loop.md` (next to this file).
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "review-fix-loop.md")
const COMMAND_NAME = "review-fix-loop"
const MARKER = "[REVIEW-FIX-LOOP PROTOCOL ARMED]"

// Session arming — only inject when the user actually ran the command.
const armedSessions = new Set<string>()

// Cache the protocol file content (loaded once).
let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const ReviewFixLoopPlugin: Plugin = async () => ({
  "command.execute.before": async (input: { command?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return
    armedSessions.add(input.sessionID || "default")
  },

  "experimental.chat.system.transform": async (
    input: { sessionID?: string },
    output: { system: string[] },
  ) => {
    const sessionID = input?.sessionID || "default"
    if (!armedSessions.has(sessionID)) return

    // Disarm after first injection — protocol stays in system prompt.
    armedSessions.delete(sessionID)

    const fragment = `\n\n---\n${MARKER}\n\n${getProtocol()}\n`

    // Strip prior injection (idempotent across compaction/turns).
    for (let i = 0; i < output.system.length; i++) {
      const s = output.system[i]
      if (typeof s !== "string") continue
      const idx = s.indexOf(MARKER)
      if (idx !== -1) output.system[i] = s.substring(0, idx)
      output.system[i] += fragment
    }
  },
})
