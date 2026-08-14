/**
 * Review-Fix Loop Plugin — replaces the old `commands/review-fix-loop.md`.
 *
 *   1. `config` — registers `/review-fix-loop` (empty template, agent: build).
 *   2. `command.execute.before` — arms session, suppresses template (HTTP 204).
 *      User's raw input ("/review-fix-loop last commit") stays as the user message.
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
import { HttpServerResponse } from "effect/unstable/http"
import { makeCommandHook } from "./review-fix-loop/rfl-command"
import { makeSystemHook } from "./review-fix-loop/rfl-system-inject"
import { COMMAND_NAME } from "./review-fix-loop/rfl-config"

const handled = (): never => {
  throw HttpServerResponse.empty({ status: 204 })
}

export const ReviewFixLoopPlugin: Plugin = async ({ client }) => ({
  config: async (cfg) => {
    cfg.command ??= {}
    cfg.command[COMMAND_NAME] = {
      template: "",
      description:
        "Review-fix loop — iterative review & fix until no P0/P1 remain. Usage: /review-fix-loop [scope] [--max-rounds=N]",
      agent: "build",
    }
  },

  "command.execute.before": makeCommandHook(client, handled),
  "experimental.chat.system.transform": makeSystemHook(client),
})
