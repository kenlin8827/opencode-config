/**
 * Review-Fix Loop Plugin — registers the `/review-fix-loop` slash command
 * programmatically via the `config` hook (same pattern as advisor-mode.ts
 * and profile-switcher.ts — no `commands/review-fix-loop.md` file needed),
 * then injects the protocol into the system prompt in the same turn the
 * user runs the command.
 *
 * Two hooks:
 *   1. config — registers the slash command (template, description, agent)
 *   2. command.execute.before — arms the session
 *   3. system.transform — injects protocol into system prompt (LLM-only)
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
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "/review-fix-loop $ARGUMENTS",
      description:
        "Review-fix loop — iterative review & fix until no P0/P1 remain. Usage: /review-fix-loop [scope] [--max-rounds=N]",
      agent: "build",
    }
  },

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
