/**
 * Quick-Dev Plugin — registers the `/quick-dev` (and alias `/flash-dev`)
 * slash commands programmatically via the `config` hook, then injects
 * the protocol into the system prompt.
 *
 * Quick-Dev Workflow:
 *   1. Zero-loss dispatch to @fast-coder (same as /fast-dev)
 *   2. Skip review entirely — zero review overhead
 *   3. Verify syntax and deliver instantly
 *
 * See: plugins/quick-dev/quick-dev.md
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"
import { scoped } from "../shared/plugin-scope"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "quick-dev.md")
const COMMAND_NAME = "quick-dev"
const ALIAS_COMMAND_NAME = "flash-dev"
const MARKER = "[QUICK-DEV SKILL]"

let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

export const QuickDevPlugin: Plugin = async ({ client }) => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "/quick-dev $ARGUMENTS",
      description:
        "Quick-Dev — zero-review fast track: @fast-coder coding + instant delivery (no review). Usage: /quick-dev <requirements>",
      agent: "build",
    }
    cfg.command[ALIAS_COMMAND_NAME] = {
      template: "/quick-dev $ARGUMENTS",
      description:
        "Quick-Dev (alias) — zero-review fast track: @fast-coder coding + instant delivery. Usage: /flash-dev <requirements>",
      agent: "build",
    }
  },

  "experimental.chat.system.transform": async (
    input: { sessionID?: string } | undefined,
    output: { system: string[] },
  ) => {
    // Lite mode: bare-prompt contract — no protocol overhead for @lite.
    if (!await scoped(input, output.system, "quick-dev", client)) return

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
