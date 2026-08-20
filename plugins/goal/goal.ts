/**
 * Goal Plugin — registers the `/goal` slash command programmatically
 * via the `config` hook (same pattern as grill-me.ts and review-fix-loop.ts
 * — no `commands/goal.md` file needed), then injects the goal execution
 * protocol into the system prompt.
 *
 * Two hooks:
 *   1. config — registers the slash command (template, description, agent)
 *   2. experimental.chat.system.transform — injects protocol into system
 *      prompt (cache-friendly: if the marker is already present, the hook
 *      is a complete no-op — it doesn't touch output.system at all, so
 *      the LLM provider's prompt-cache stays warm across turns)
 *
 * Why no armedSessions / command.execute.before?
 *   The execution order of command.execute.before vs system.transform is
 *   not guaranteed. If system.transform fires first, armedSessions hasn't
 *   been populated yet → the protocol is never injected on turn 1.
 *   Instead we unconditionally inject on every system.transform call and
 *   rely on the marker check for idempotency (same approach as
 *   grill-me's system hook).
 *
 * Cache note: the protocol content is static (read once from the .md file
 * and cached in memory). On every turn after the first, the MARKER is
 * already present in the system prompt → the hook returns immediately
 * without mutating any string → prompt-cache is preserved.
 *
 * The protocol body lives in `goal.md` (next to this file).
 *
 * This module is re-exported by `plugins/goal.ts` (barrel) so
 * OpenCode's auto-discovery (which scans `plugins/` root) picks it up.
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "goal.md")
const COMMAND_NAME = "goal"
const MARKER = "[GOAL SKILL]"

// Cache the protocol file content (loaded once).
let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const GoalPlugin: Plugin = async () => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "/goal $ARGUMENTS",
      description:
        "Goal — structured objective execution with audit-friendly checkpoints and mechanical stop conditions. Usage: /goal <objective text> | /goal (builder mode)",
      agent: "build",
    }
  },

  "experimental.chat.system.transform": async (
    _input: unknown,
    output: { system: string[] },
  ) => {
    // Cache-friendly: if the marker is already present, the protocol was
    // injected on a previous turn and the content hasn't changed — don't
    // touch output.system at all. This keeps the prompt byte-identical so
    // the LLM provider's prompt-cache stays warm (no extra tokens, no
    // extra cost).
    if (output.system.some((s) => typeof s === "string" && s.includes(MARKER))) return

    const fragment = `\n\n---\n${MARKER}\n\n${getProtocol()}\n`

    // First injection (or after compaction rebuilt the system prompt).
    for (let i = 0; i < output.system.length; i++) {
      const s = output.system[i]
      if (typeof s !== "string") continue
      output.system[i] = s + fragment
    }
  },
})
