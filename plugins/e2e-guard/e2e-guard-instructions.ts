/**
 * Prompt fragment builder for the E2E Guard.
 *
 * Loads the protocol body from e2e-guard-protocol.md (read once, cached)
 * and wraps it with the ON marker.
 *
 * Cache note: the fragment is rebuilt on every injection, but the system
 * hook only appends it when the exact marker is absent — on every turn
 * after the first the hook is a complete no-op and the prompt-cache stays
 * warm.
 */

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "e2e-guard-protocol.md")

export const MARKER = "[E2E-GUARD"
export const MARKER_ON = "[E2E-GUARD: ON]"

// Cache the protocol file content (loaded once).
let cachedProtocol: string | null = null
export function getProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  try {
    cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  } catch {
    cachedProtocol = "# E2E Testing Protocol\nEvaluate E2E impact on feat/fix tasks and ask user before executing."
  }
  return cachedProtocol
}

/**
 * Full fragment appended to the system prompt when the guard is on.
 * stripMarker() trims trailing whitespace after cutting at the marker, so
 * the leading \n\n separator restores to a semantically identical prompt.
 */
export function getGuardPrompt(): string {
  return `\n\n${MARKER_ON}\n\n${getProtocol()}\n`
}
