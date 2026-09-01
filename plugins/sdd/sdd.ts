/**
 * SDD Plugin (Specification-Driven Development).
 *
 * Engine-only: the `/prd | /adr | /plan | /impl | /sdd` commands are
 * registered as command files (commands/*.md — thin launchers that load the
 * sdd-workflow skill on demand), and the protocol itself lives at L2
 * (skills/sdd-workflow/SKILL.md). This plugin contributes only the runtime
 * logic that markdown cannot express:
 *
 *   command.execute.before — scaffold docs/prd|plan artifacts on first use,
 *   answer `/sdd status|help`, and announce `/sdd handoff` packaging.
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { makeSddCommandHook } from "./sdd-command"

export const SddPlugin: Plugin = async (input: PluginInput) => ({
  "command.execute.before": makeSddCommandHook(input.client),
})
