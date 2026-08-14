/**
 * Grill-Me Plugin — registers the `/grill-me` slash command
 * programmatically via the `config` hook (same pattern as advisor-mode.ts
 * and review-fix-loop.ts — no `commands/grill-me.md` file needed),
 * then injects the grilling protocol into the system prompt.
 *
 * Two hooks:
 *   1. config — registers the slash command (template, description, agent)
 *   2. experimental.chat.system.transform — injects protocol into system
 *      prompt on every turn (idempotent: strips prior injection before
 *      re-appending, so the protocol appears exactly once)
 *
 * Why no armedSessions / command.execute.before?
 *   The execution order of command.execute.before vs system.transform is
 *   not guaranteed. If system.transform fires first, armedSessions hasn't
 *   been populated yet → the protocol is never injected on turn 1.
 *   Instead we unconditionally inject on every system.transform call and
 *   rely on strip-and-reappend for idempotency (same approach as
 *   advisor-mode's system hook).
 *
 * The protocol body lives in `grill-me.md` (next to this file).
 *
 * This module is re-exported by `plugins/grill.ts` (barrel) so
 * OpenCode's auto-discovery (which scans `plugins/` root) picks it up.
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "grill-me.md")
const COMMAND_NAME = "grill-me"
const MARKER = "[GRILL-ME SKILL]"

// Cache the protocol file content (loaded once).
let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const GrillMePlugin: Plugin = async () => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "/grill-me $ARGUMENTS",
      description:
        "Grill me — relentless one-question-at-a-time interview to sharpen a plan or design. Usage: /grill-me <topic>",
      agent: "build",
    }
  },

  "experimental.chat.system.transform": async (
    _input: unknown,
    output: { system: string[] },
  ) => {
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
