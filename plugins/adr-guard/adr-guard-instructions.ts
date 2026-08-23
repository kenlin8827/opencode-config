/**
 * Prompt fragment builder for the ADR iron law.
 *
 * Loads the protocol body from adr-guard-protocol.md (read once, cached)
 * and wraps it with the ON marker + the live ADR directory, so the agent
 * always knows where to create ADR files.
 *
 * Cache note: the fragment is rebuilt on every injection, but the system
 * hook only appends it when the exact marker is absent — on every turn
 * after the first the hook is a complete no-op and the prompt-cache stays
 * warm.
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { getAdrDir } from "./adr-guard-config"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "adr-guard-protocol.md")

export const MARKER = "[ADR-GUARD"
export const MARKER_ON = "[ADR-GUARD: ON]"

// Cache the protocol file content (loaded once).
let cachedProtocol: string | null = null
function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  return cachedProtocol
}

/**
 * Full fragment appended to the system prompt when the iron law is on.
 * stripMarker() trims trailing whitespace after cutting at the marker, so
 * the leading \n\n separator restores to a semantically identical prompt.
 */
export function getGuardPrompt(): string {
  const adrDir = getAdrDir()
  return (
    `\n\n${MARKER_ON}\n\n` +
    getProtocol() +
    `\n## Runtime values (this project)\n\n` +
    `- ADR directory: **${adrDir}/** — create lazily when the first ADR is needed.\n`
  )
}
