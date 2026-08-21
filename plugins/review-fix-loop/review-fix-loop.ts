/**
 * Review-Fix Loop Plugin — registers the `/review-fix-loop` slash command
 * programmatically via the `config` hook (same pattern as auto-advisor-mode.ts
 * — no `commands/review-fix-loop.md` file needed),
 * then injects the protocol into the system prompt.
 *
 * Two hooks:
 *   1. config — registers the slash command (template, description, agent)
 *   2. experimental.chat.system.transform — injects protocol into system
 *      prompt (cache-friendly: if the marker is already present, the hook
 *      is a complete no-op — it doesn't touch output.system at all, so the
 *      LLM provider's prompt-cache stays warm across turns)
 *
 * Why no armedSessions / command.execute.before?
 *   The execution order of command.execute.before vs system.transform is
 *   not guaranteed. If system.transform fires first, armedSessions hasn't
 *   been populated yet → the protocol is never injected on turn 1.
 *   Instead we unconditionally inject on every system.transform call and
 *   rely on the marker check for idempotency (same approach as
 *   auto-advisor-mode's system hook).
 *
 * Cache note: the protocol content is static (read once from the .md file
 * and cached in memory). On every turn after the first, the MARKER is
 * already present in the system prompt → the hook returns immediately
 * without mutating any string → prompt-cache is preserved.
 *
 * The protocol body lives in `review-fix-loop.md` (next to this file).
 *
 * This module is re-exported by `plugins/review-fix-loop.ts` (barrel) so
 * OpenCode's auto-discovery (which scans `plugins/` root) picks it up.
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "review-fix-loop.md")
const COMMAND_NAME = "review-fix-loop"
const MARKER = "[REVIEW-FIX-LOOP SKILL]"

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
    // Append to the LAST string entry only — with multiple entries the old
    // loop duplicated the protocol within a single pass (same fix as
    // project-profiler / project-manager).
    for (let i = output.system.length - 1; i >= 0; i--) {
      const s = output.system[i]
      if (typeof s !== "string") continue
      output.system[i] = s + fragment
      break
    }
  },
})
