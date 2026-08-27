/**
 * Grill-Improve-Loop Plugin — registers the `/grill-improve-loop` slash command
 * programmatically via the `config` hook (same pattern as grill-me.ts,
 * review-fix-loop.ts, fast-dev.ts — no `commands/grill-improve-loop.md` file needed),
 * then injects the protocol into the system prompt.
 *
 * Score-driven iterative improvement loop:
 *   1. Score the subject (verification-honesty scoring table, R5–R7)
 *   2. Analyze concrete improvement paths (or structural ceiling)
 *   3. Fix/Refactor — dispatch to matching agent
 *   4. Verify — build/test/lint, show real commands
 *   5. Re-score — compare with prior round
 * Loop until: ceiling reached, max rounds, stall, regression, or target.
 *
 * Two hooks:
 *   1. config — registers the slash command (template, description, agent)
 *   2. experimental.chat.system.transform — injects protocol into system
 *      prompt (cache-friendly: if the marker is already present, the hook
 *      is a complete no-op — it doesn't touch output.system at all, so the
 *      LLM provider's prompt-cache stays warm across turns)
 *
 * Cache note: the protocol content is static (read once from the .md file
 * and cached in memory). On every turn after the first, the MARKER is
 * already present in the system prompt → the hook returns immediately
 * without mutating any string → prompt-cache is preserved.
 *
 * The protocol body lives in `grill-improve-loop.md` (next to this file).
 *
 * This module is re-exported by `plugins/grill-improve-loop.ts` (barrel) so
 * OpenCode's auto-discovery (which scans `plugins/` root) picks it up.
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "grill-improve-loop.md")
const COMMAND_NAME = "grill-improve-loop"
const MARKER = "[GRILL-IMPROVE-LOOP SKILL]"

// Cache the protocol file content (loaded once).
let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const GrillImproveLoopPlugin: Plugin = async () => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "/grill-improve-loop $ARGUMENTS",
      description:
        "Grill-improve-loop — score-driven improvement loop: score → analyze → fix → verify → re-score until structural ceiling or max rounds. Usage: /grill-improve-loop [subject] [--max-rounds=N] [--target=N]",
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
