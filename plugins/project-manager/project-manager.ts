/**
 * Project Manager — lightweight project scaffolding via the `/project`
 * slash command.
 *
 *   /project init — create baseline files in the current project, but ONLY
 *                   when they don't already exist (never overwrites):
 *                     .opencode/opencode.jsonc  (project-level config stub)
 *                     docs/git-commits.md       (commit convention)
 *                     AGENTS.md                 (agent instructions stub)
 *
 * File layout: one entry + one job per file (same pattern as adr-guard).
 *   project-manager-config.ts        — command name, project dir, target list
 *   project-manager-scaffold.ts      — templates + exists-check-then-write init
 *   project-manager-command.ts       — command hook (/project init, help)
 *   project-manager-system-inject.ts — system-transform hook: injects a
 *                                      progressive-disclosure pointer to
 *                                      docs/git-commits.md (~50 tokens; the
 *                                      file itself is read on demand)
 *   project-manager-tool-guard.ts    — tool.before hook: blocks git commits
 *                                      whose message violates the structural
 *                                      rules (type format, ≤72-char first line)
 *
 * File-as-switch: while docs/git-commits.md exists the project gets BOTH
 * the soft layer (pointer injected into the system prompt — agents read
 * the file before committing) and the hard layer (non-conforming commit
 * messages blocked at git commit); delete the file and both deactivate.
 * No separate state file, no on/off command.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { HttpServerResponse } from "effect/unstable/http"
import { makeCommandHook } from "./project-manager-command"
import { COMMAND_NAME, setProjectDir } from "./project-manager-config"
import { makeSystemHook } from "./project-manager-system-inject"
import { makeToolGuardHook } from "./project-manager-tool-guard"

// OpenCode's command hook has no cancel/noReply output. Throwing a raw
// Effect response is handled by OpenCode's HTTP layer as an empty
// successful command — the LLM never sees an empty prompt.
const handled = (): never => {
  throw HttpServerResponse.empty({ status: 204 })
}

export const ProjectManagerPlugin: Plugin = async ({ client, directory }) => {
  // Scaffolding is project-level: pin target paths to this project's directory.
  setProjectDir(directory)
  return {
    config: async (cfg) => {
      cfg.command ??= {}
      cfg.command[COMMAND_NAME] = {
        template: "",
        description:
          "Project scaffolding — /project init creates missing baseline files (.opencode/opencode.jsonc, docs/git-commits.md, AGENTS.md); existing files are never overwritten",
      }
    },
    "command.execute.before": makeCommandHook(client, handled),
    "experimental.chat.system.transform": makeSystemHook(client),
    "tool.execute.before": makeToolGuardHook(client),
  }
}
