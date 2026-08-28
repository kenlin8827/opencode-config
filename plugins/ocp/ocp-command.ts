/**
 * ocp-command.ts — Hook: command.execute.before for `/ocp <version|update|upgrade|status>`.
 *
 * The command is registered programmatically via the `config` hook in
 * index.ts — no commands/ocp.md file is needed.
 *
 *   /ocp update   → run `ocp update` (check for a newer release, read-only)
 *   /ocp upgrade  → run `ocp upgrade` (pull the latest release + reinstall)
 *   /ocp status   → run `ocp status`
 *   /ocp version  → print install/VERSION (fast path, no process spawn)
 *   /ocp          → show help (no or unknown subcommand)
 *
 * All feedback goes through session.prompt({ noReply, ignored }) in the
 * main chat UI, so the LLM is never invoked and the output appears as a
 * user-visible message (degrading gracefully in headless environments).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { COMMAND_NAME, helpText, parseSubcommand } from "./ocp-config"
import { findRepoRoot, readRepoVersion, runOcpSubcommand } from "./ocp-runtime"

/** Post a user-visible, non-reply-prompting message into the session. */
async function post(
  client: PluginInput["client"],
  sessionID: string | undefined,
  text: string,
): Promise<void> {
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

    const subcommand = parseSubcommand(input.arguments)

    // No subcommand / unknown subcommand → help.
    if (!subcommand) {
      const hint = input.arguments?.trim()
        ? `\n[ocp] Unknown subcommand: "${input.arguments.trim().split(/\s+/)[0]}"`
        : ""
      await post(client, input.sessionID, hint + "\n" + helpText())
      return handled()
    }

    // Fast path: `version` reads install/VERSION directly when the repo root
    // can be located — no subprocess needed.
    if (subcommand === "version") {
      const root = findRepoRoot(process.cwd())
      const version = root ? readRepoVersion(root) : null
      if (version) {
        await post(client, input.sessionID, `[ocp] OpenCode Prime version: ${version}`)
        return handled()
      }
      // Fall through to the CLI (`ocp version`) below.
    }

    // Long-running subcommands get an immediate progress note first, so the
    // user sees that something is happening (notably `upgrade`).
    const runningNote: Record<string, string> = {
      update: "[ocp] Checking whether a newer release is available...",
      upgrade:
        "[ocp] Running upgrade (pulling the latest release and re-applying the installer)... this may take a while.",
      status: "[ocp] Checking installation status...",
      version: "[ocp] Resolving version via CLI...",
    }
    await post(client, input.sessionID, runningNote[subcommand] ?? "[ocp] Working...")

    try {
      const { ok, output } = await runOcpSubcommand(subcommand)
      const header = ok ? `[ocp] ${subcommand} finished successfully.` : `[ocp] ${subcommand} FAILED.`
      const body = output.length > 0 ? "\n```\n" + output + "\n```" : "\n(no output)"
      await post(client, input.sessionID, header + body)
    } catch (err: any) {
      await post(client, input.sessionID, err?.message ?? String(err))
    }

    return handled()
  }
}
