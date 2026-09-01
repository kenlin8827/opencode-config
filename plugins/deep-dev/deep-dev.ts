/**
 * Deep-Dev Plugin — registers the `/deep-dev` slash command
 * programmatically via the `config` hook, then injects the protocol
 * into the system prompt.
 *
 * Deep-Dev Workflow:
 *   1. Zero-loss dispatch to @<lang>-dev (domain-routed, pro tier) for professional implementation
 *   2. Dual Reviewers concurrently audit:
 *      - Reviewer A (@architect): Deep requirement alignment & architectural integrity
 *      - Reviewer B (@code-review): Evidence-driven code quality & boundary checks
 *   3. Consensus & Arbitration (@advisor) if reviewers disagree
 *   4. Iterate in a feedback loop (default max 10 rounds) until Double Approve or Fuse
 *
 * See: plugins/deep-dev/deep-dev.md
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"
import { scoped } from "../shared/plugin-scope"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "deep-dev.md")
const COMMAND_NAME = "deep-dev"
const MARKER = "[DEEP-DEV SKILL]"

let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const DeepDevPlugin: Plugin = async ({ client }) => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "/deep-dev $ARGUMENTS",
      description:
        "Deep-Dev — mission-critical dual-review consensus loop: domain-routed coding + dual review + Advisor arbitration (default max 10 rounds). Usage: /deep-dev <task> [--max-rounds=N]",
      agent: "build",
    }
  },

  "experimental.chat.system.transform": async (
    input: { sessionID?: string } | undefined,
    output: { system: string[] },
  ) => {
    // Lite mode: bare-prompt contract — no protocol overhead for @lite.
    if (!await scoped(input, output.system, "deep-dev", client)) return

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
