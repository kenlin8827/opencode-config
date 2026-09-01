/**
 * System prompt injection for the SDD Protocol.
 *
 * Cache-friendly: uses MARKER checks to ensure byte-identical prompts
 * across turns, preserving LLM prompt caching.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { scoped } from "../shared/plugin-scope"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTOCOL_FILE = join(__dirname, "sdd-protocol.md")
export const SDD_MARKER = "[SDD SKILL]"

let cachedProtocol: string | null = null

export function getSddProtocol(): string {
  if (cachedProtocol !== null) return cachedProtocol
  try {
    cachedProtocol = readFileSync(PROTOCOL_FILE, "utf-8")
  } catch {
    cachedProtocol = "# SDD Protocol\nLifecycle: /prd -> /adr -> /plan -> /impl"
  }
  return cachedProtocol
}

export async function injectSddSystemPrompt(
  input: { sessionID?: string } | undefined,
  output: { system: string[] },
  client: unknown,
): Promise<void> {
  if (!output || !Array.isArray(output.system)) return

  // Lite mode: bare-prompt contract — no protocol overhead for @lite.
  if (!await scoped(input, output.system, "sdd", client as never)) return

  // Cache-friendly: if marker is present, prompt has already been transformed
  if (output.system.some((s) => typeof s === "string" && s.includes(SDD_MARKER))) {
    return
  }

  const fragment = `\n\n---\n${SDD_MARKER}\n\n${getSddProtocol()}\n`

  // Append to the last string entry only
  for (let i = output.system.length - 1; i >= 0; i--) {
    const s = output.system[i]
    if (typeof s !== "string") continue
    output.system[i] = s + fragment
    break
  }
}
