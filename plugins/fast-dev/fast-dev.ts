/**
 * Fast-Dev Plugin — registers the `/fast-dev` slash command
 * programmatically via the `config` hook, then injects the protocol
 * into the system prompt.
 *
 * Fast-Dev Workflow:
 *   1. Zero-loss dispatch to @fast-coder (Flash tier) for rapid implementation
 *   2. Single Reviewer (@code-review) performs evidence-driven code quality audit
 *   3. Iterate in a feedback loop (default max 10 rounds) until Approve or Fuse
 *
 * See: plugins/fast-dev/fast-dev.md
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "fast-dev.md")
const COMMAND_NAME = "fast-dev"
const MARKER = "[FAST-DEV SKILL]"

let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const FastDevPlugin: Plugin = async () => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "/fast-dev $ARGUMENTS",
      description:
        "Fast-Dev — agile single-review loop: @fast-coder coding + single-review audit (default max 10 rounds). Usage: /fast-dev <task> [--max-rounds=N]",
      agent: "build",
    }
  },

  "experimental.chat.system.transform": async (
    _input: unknown,
    output: { system: string[] },
  ) => {
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
