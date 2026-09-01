/**
 * SDD Plugin (Specification-Driven Development).
 *
 * Implements full SDD lifecycle orchestration:
 *   /prd  → Product Requirements Document (docs/prd/<topic>.md)
 *   /adr  → Architecture Decision Record (docs/adr/)
 *   /plan → Implementation Plan (docs/plan/<topic>.md)
 *   /impl → Code Implementation & Verification
 *   /sdd  → Lifecycle status, artifact discovery, and workflow navigation
 *
 * Prompts user for interactive stage transitions at phase boundaries.
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { makeSddCommandHook, IMPL_COMMAND, PLAN_COMMAND, PRD_COMMAND, SDD_COMMAND } from "./sdd-command"
import { injectSddSystemPrompt } from "./sdd-system-inject"

export const SddPlugin: Plugin = async (input: PluginInput) => ({
  config: async (cfg) => {
    cfg.command ??= {}

    cfg.command[SDD_COMMAND] = {
      template: "/sdd $ARGUMENTS",
      description:
        "SDD — Specification-Driven Development lifecycle orchestrator. Lifecycle: /prd → /adr → /plan → /impl. Usage: /sdd status | /sdd help | /sdd <topic>",
      agent: "build",
    }

    cfg.command[PRD_COMMAND] = {
      template: "/prd $ARGUMENTS",
      description:
        "PRD — Product Requirements Document phase. Defines user stories, functional/non-functional specs, and acceptance criteria in docs/prd/. Usage: /prd <topic>",
      agent: "build",
    }

    cfg.command[PLAN_COMMAND] = {
      template: "/plan $ARGUMENTS",
      description:
        "Plan — Implementation Plan & task decomposition phase. Decomposes specs into atomic, test-driven implementation steps in docs/plan/. Usage: /plan <topic>",
      agent: "plan",
    }

    cfg.command[IMPL_COMMAND] = {
      template: "/impl $ARGUMENTS",
      description:
        "Impl — Code implementation & verification phase. Executes implementation following PRD/ADR/Plan with tests and quality gates. Usage: /impl <task>",
      agent: "code",
    }
  },

  "command.execute.before": makeSddCommandHook(input.client),

  "experimental.chat.system.transform": async (hookInput: { sessionID?: string }, output: { system: string[] }) => {
    await injectSddSystemPrompt(hookInput, output, input.client)
  },
})
