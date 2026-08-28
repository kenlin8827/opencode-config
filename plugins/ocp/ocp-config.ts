/**
 * ocp-config.ts — constants and argument parsing for the /ocp plugin.
 *
 * The /ocp command is a thin wrapper around the repo's `ocp` CLI
 * (bin/opencode-prime.ps1 | bin/opencode-prime). Subcommands mirror the
 * CLI one-to-one:
 *
 *   /ocp version → print the repo's install/VERSION
 *   /ocp update  → check whether a newer release is available (read-only)
 *   /ocp upgrade → pull the latest release and re-apply the installer
 *   /ocp status  → show installed vs repo version
 */

export const COMMAND_NAME = "ocp"

export type OcpSubcommand = "version" | "update" | "upgrade" | "status"

/** Subcommand aliases accepted on the /ocp command line. */
const ALIASES: Record<string, OcpSubcommand> = {
  version: "version",
  "--version": "version",
  "-v": "version",
  "-V": "version",
  update: "update",
  upgrade: "upgrade",
  status: "status",
}

/**
 * Parse the first whitespace-separated argument into a subcommand.
 * Returns null for empty/unknown input (the caller shows help).
 */
export function parseSubcommand(raw: string | undefined): OcpSubcommand | null {
  const first = raw?.trim().split(/\s+/)[0]
  if (!first) return null
  return ALIASES[first] ?? null
}

/** Help text shown when no subcommand or an unknown one is given. */
export function helpText(): string {
  return [
    "[ocp] OpenCode Prime self-management command.",
    "",
    "Usage:",
    "  /ocp update   Check whether a newer release is available (read-only)",
    "  /ocp upgrade  Pull the latest release and re-apply the installer",
    "  /ocp status   Show installed vs repo version",
    "  /ocp version  Print the repo's install/VERSION",
    "",
    "Same semantics as the terminal CLI (`ocp update` / `ocp upgrade`).",
    "To force-reapply the current manifest, run `ocp install -Force` in a terminal.",
  ].join("\n")
}
