/**
 * Review-Fix Loop Plugin — replaces the old `commands/review-fix-loop.md`.
 *
 *   1. `config` — registers `/review-fix-loop` (template: $ARGUMENTS, agent: build).
 *      The user's arguments are passed through to the LLM as-is.
 *   2. `command.execute.before` — arms session only (no output.parts push).
 *   3. `system.transform` — when armed, injects the protocol into system prompt
 *      (LLM-only, not visible in chat UI).
 *
 * File layout:
 *   review-fix-loop/
 *   ├── rfl-config.ts           — command name, session arming
 *   ├── rfl-runtime.ts          — log helper
 *   ├── rfl-instructions.ts     — loads protocol from review-fix-loop.md
 *   ├── review-fix-loop.md      — the protocol body
 *   ├── rfl-command.ts          — command.execute.before hook
 *   └── rfl-system-inject.ts    — system.transform hook
 */

import type { Plugin } from "@opencode-ai/plugin"
import { makeCommandHook } from "./review-fix-loop/rfl-command"
import { makeSystemHook } from "./review-fix-loop/rfl-system-inject"
import { COMMAND_NAME } from "./review-fix-loop/rfl-config"

export const ReviewFixLoopPlugin: Plugin = async ({ client }) => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "$ARGUMENTS",
      description:
        "Review-fix loop — iterative review & fix until no P0/P1 remain. Usage: /review-fix-loop [scope] [--max-rounds=N]",
      agent: "build",
    }
  },

  "command.execute.before": makeCommandHook(client),
  "experimental.chat.system.transform": makeSystemHook(client),
})
