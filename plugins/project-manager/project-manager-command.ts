/**
 * Hook: command.execute.before — handle `/project <subcommand>`.
 * The command is registered programmatically via the `config` hook in
 * project-manager.ts — no commands/project.md file is needed.
 *
 *   /project init   → scaffold missing baseline files (never overwrites;
 *                     an EXISTING project config gets an append-only top-up
 *                     with switch lines the template gained since init),
 *                     then run every FIRST-TIME backend init step, each only
 *                     when its CLI is installed + enabled:
 *                     `codegraph init`, `gitnexus analyze` (initial build),
 *                     dbhub.toml scaffold (only when the dbhub MCP is
 *                     enabled AND its CLI is installed)
 *   /project index  → manual rebuild/refresh for existing indexes:
 *                     `codegraph sync` (incremental catch-up) and
 *                     `gitnexus analyze` when the index is stale
 *   /project sync   → the config top-up alone (no scaffolding, no backends)
 *   /project        → show help (no subcommand given)
 *
 * Every invocation gets user-visible feedback via
 * session.prompt({ noReply, ignored }) in the main chat UI — visible to the
 * user, invisible to the LLM (no context pollution).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import {
  COMMAND_NAME,
  CONFIG_REL,
  getProjectDir,
  parseSubcommand,
  SUBCOMMAND_INDEX,
  SUBCOMMAND_INIT,
  SUBCOMMAND_SYNC,
} from "./project-manager-config"
import {
  planIndexBackends,
  planInitBackends,
  probeBackends,
  runBackends,
  type BackendResult,
} from "./project-manager-index"
import { runInit, runSync, type ScaffoldResult, type SyncResult } from "./project-manager-scaffold"

const HELP = `[project-manager] Project scaffolding + code-index bootstrap.

Usage:
- /project init   → create baseline files if missing (never overwrites):
                    .opencode/opencode.jsonc, docs/git-commits.md, AGENTS.md
                    An EXISTING project config gets an append-only top-up:
                    switch lines the template gained since init are added,
                    existing content is never changed.
                    Then run every first-time backend init step — each only
                    when its CLI is installed and enabled (missing CLIs are
                    skipped silently, never invoked):
                      codegraph init    one-time; watcher keeps it fresh
                      gitnexus analyze  initial index build (index missing)
                      dbhub.toml        scaffolded when the dbhub MCP is
                                        enabled and its CLI is installed
                                        (never overwrites; set the DBHUB_DSN
                                        env var afterwards)
- /project index  → manual rebuild/refresh for EXISTING indexes (a first
                    index is init's job):
                      codegraph sync    incremental catch-up (watcher covers
                                        live saves; full \`codegraph index\`
                                        rebuild stays a manual escape hatch)
                      gitnexus analyze  only when the index is stale
- /project sync   → top up an EXISTING ${CONFIG_REL} with switch lines the
                    template gained since init (append-only: existing
                    content is never changed; no file → /project init)

Note: when docs/git-commits.md exists, a pointer to it is injected into
the system prompt (progressive disclosure — agents read the file before
committing) and structural rules are enforced at git commit time.`

/** One report line per target: ✅ created / ♻️ updated / ⏭️ skipped. */
function initReport(results: ScaffoldResult[], backends: BackendResult[]): string {
  const lines = results.map((r) => {
    if (r.status === "created") return `  ✅ created ${r.relPath}`
    if (r.status === "updated") return `  ♻️ updated ${r.relPath} (appended new template switches; existing content untouched)`
    return `  ⏭️ skipped ${r.relPath} (already exists)`
  })
  const created = results.filter((r) => r.status === "created").length
  const updated = results.filter((r) => r.status === "updated").length
  return `[project-manager] init done in ${getProjectDir()} — ${created} created, ${updated} updated, ${results.length - created - updated} skipped\n${lines.join("\n")}\n${backends.map(backendLine).join("\n")}`
}

/** ✅ ran / ⏭️ skipped / ❌ failed — one line per backend result. */
function backendLine(r: BackendResult): string {
  if (r.status === "ran") return `  ✅ ${r.backend}: ${r.detail}`
  if (r.status === "failed") return `  ❌ ${r.backend}: ${r.detail}`
  return `  ⏭️ ${r.backend}: skipped — ${r.detail}`
}

/** `/project index` report: rebuild results only. */
function indexReport(results: BackendResult[]): string {
  return `[project-manager] index done in ${getProjectDir()}\n${results.map(backendLine).join("\n")}`
}

/** `/project sync` report: which template switches were appended. */
function syncReport(r: SyncResult): string {
  const head = `[project-manager] sync in ${getProjectDir()}`
  if (r.status === "missing") return `${head}: ${CONFIG_REL} does not exist — run /project init first`
  if (r.status === "invalid") return `${head}: ${CONFIG_REL} has no closing brace — left untouched, fix it manually`
  if (r.status === "up-to-date") return `${head}: ${CONFIG_REL} already has every template switch — nothing to add`
  return `${head}: appended ${r.added.length} new switch line(s) to ${CONFIG_REL} (existing content untouched):\n${r.added.map((k) => `  + ${k}`).join("\n")}`
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
    if (sub !== SUBCOMMAND_INIT && sub !== SUBCOMMAND_INDEX && sub !== SUBCOMMAND_SYNC) {
      await reply(client, input.sessionID, sub ? `[project-manager] Unknown subcommand "${sub}".\n\n${HELP}` : HELP)
      return handled()
    }

    try {
      if (sub === SUBCOMMAND_INIT) {
        // Scaffold first, then every first-time backend init step — each
        // runs only when its CLI is installed + enabled, and a failed or
        // absent CLI never blocks the file scaffolding.
        const results = runInit()
        const probe = probeBackends(getProjectDir())
        const backends = await runBackends(planInitBackends(probe), getProjectDir()).catch(
          (e): BackendResult[] => [{ backend: "codegraph", status: "failed", detail: String(e) }],
        )
        await reply(client, input.sessionID, initReport(results, backends))
      } else if (sub === SUBCOMMAND_SYNC) {
        await reply(client, input.sessionID, syncReport(runSync()))
      } else {
        const probe = probeBackends(getProjectDir())
        const results = await runBackends(planIndexBackends(probe), getProjectDir()).catch(
          (e): BackendResult[] => [{ backend: "gitnexus", status: "failed", detail: String(e) }],
        )
        await reply(client, input.sessionID, indexReport(results))
      }
    } catch (err) {
      await reply(client, input.sessionID, `[project-manager] ${sub} failed: ${String(err)}`)
    }
    return handled()
  }
}
