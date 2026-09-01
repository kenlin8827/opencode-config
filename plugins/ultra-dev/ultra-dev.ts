/**
 * Ultra-Dev Plugin — registers the `/ultra-dev` slash command
 * programmatically via the `config` hook, then injects the protocol
 * into the system prompt.
 *
 * Ultra-Dev Workflow:
 *   1. Orchestrator (@build) decomposes objective into ordered phases
 *   2. @explorer surveys codebase (phase 0, once)
 *   3. Per-phase autonomous loop: @<lang>-dev coding (domain-routed) + dual review
 *      (@architect + @code-review) with @advisor arbitration on disagreement
 *   4. Context compaction: checkpoint to `.opencode/ultra-dev-state.md`
 *      every 2 phases + per-phase git commit for diff isolation
 *   5. Stop conditions evaluated after each phase (consecutive fuses, scope, etc.)
 *   6. Final verification + completion report
 *   Supports `--resume` to recover from interrupted sessions.
 *
 * See: plugins/ultra-dev/ultra-dev.md
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"
import { scoped } from "../shared/plugin-scope"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "ultra-dev.md")
const COMMAND_NAME = "ultra-dev"
const MARKER = "[ULTRA-DEV SKILL]"

let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const UltraDevPlugin: Plugin = async ({ client }) => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "/ultra-dev $ARGUMENTS",
      description:
        "Ultra-Dev — autonomous goal-driven multi-phase development: objective decomposition + domain-routed coding + dual review + Advisor arbitration per phase (default 10 rounds/phase, 6 phases). Usage: /ultra-dev <objective> [--max-rounds=N] [--max-phases=N] [--resume]",
      agent: "build",
    }
  },

  "experimental.chat.system.transform": async (
    input: { sessionID?: string } | undefined,
    output: { system: string[] },
  ) => {
    // Lite mode: bare-prompt contract — no protocol overhead for @lite.
    if (!await scoped(input, output.system, "ultra-dev", client)) return

    if (output.system.some((s) => typeof s === "string" && s.includes(MARKER))) return

    const fragment = `\n\n---\n${MARKER}\n\n${getProtocol()}\n`

    for (let i = output.system.length - 1; i >= 0; i--) {
      const s = output.system[i]
      if (typeof s !== "string") continue
      output.system[i] = s + fragment
      break
    }
  },
})
