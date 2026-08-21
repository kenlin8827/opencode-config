/**
 * Hook: command.execute.before — handle `/project <subcommand>`.
 * The command is registered programmatically via the `config` hook in
 * project-manager.ts — no commands/project.md file is needed.
 *
 *   /project init  → scaffold missing baseline files (never overwrites)
 *   /project       → show help (no subcommand given)
 *
 * Every invocation gets user-visible feedback via
 * session.prompt({ noReply, ignored }) in the main chat UI — visible to the
 * user, invisible to the LLM (no context pollution).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { COMMAND_NAME, getProjectDir, parseSubcommand, SUBCOMMAND_INIT } from "./project-manager-config"
import { runInit, type ScaffoldResult } from "./project-manager-scaffold"

const HELP = `[project-manager] Project scaffolding for the current project.

Usage: /project init
- init → create baseline files if missing (never overwrites):
         .opencode/opencode.jsonc, docs/git-commits.md, AGENTS.md

Note: when docs/git-commits.md exists, a pointer to it is injected into
the system prompt (progressive disclosure — agents read the file before
committing) and structural rules are enforced at git commit time.`

/** One report line per target: ✅ created / ⏭️ skipped (exists). */
function initReport(results: ScaffoldResult[]): string {
  const lines = results.map((r) =>
    r.status === "created" ? `  ✅ created ${r.relPath}` : `  ⏭️ skipped ${r.relPath} (already exists)`,
  )
  const created = results.filter((r) => r.status === "created").length
  return `[project-manager] init done in ${getProjectDir()} — ${created} created, ${results.length - created} skipped\n${lines.join("\n")}`
}

async function reply(client: PluginInput["client"], sessionID: string | undefined, text: string): Promise<void> {
  if (!sessionID) return
  await client.session.prompt({
    path: { id: sessionID },
    body: {
      parts: [{ type: "text", text, ignored: true }],
      noReply: true,
    },
  })
}

export function makeCommandHook(client: PluginInput["client"], handled: () => never) {
  return async (input: { command?: string; arguments?: string; sessionID?: string }) => {
    if (input.command !== COMMAND_NAME) return

    const sub = parseSubcommand(input.arguments)

    // No subcommand or unknown subcommand → help.
    if (sub !== SUBCOMMAND_INIT) {
      await reply(client, input.sessionID, sub ? `[project-manager] Unknown subcommand "${sub}".\n\n${HELP}` : HELP)
      return handled()
    }

    try {
      const results = runInit()
      await reply(client, input.sessionID, initReport(results))
    } catch (err) {
      await reply(client, input.sessionID, `[project-manager] init failed: ${String(err)}`)
    }
    return handled()
  }
}
