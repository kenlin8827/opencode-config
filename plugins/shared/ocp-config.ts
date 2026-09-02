/**
 * Shared user-level config for ocp plugins — ~/.config/opencode/ocp.jsonc.
 *
 * One JSONC file holds every cross-session user preference for the ocp
 * plugin suite (currently: TUI language via i18n.ts). Plugins read/write
 * individual top-level keys via readOcpField/writeOcpField; unknown keys
 * are preserved, so any plugin can add its own namespaced key (e.g.
 * "queue.toastDurationMs") without a schema migration.
 *
 * JSONC, not JSON: the file is user-editable, so comments and trailing
 * commas are tolerated on read. Writes rewrite the whole file — keys are
 * preserved but hand-written comments are not (only the generated header
 * survives).
 *
 * Override the location with OCP_CONFIG_PATH (tests, sandboxes); falls
 * back to XDG_CONFIG_HOME, then ~/.config.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { stripJsonc } from "./opencode-prime"

const FILE_HEADER = [
  "// ocp shared user config — read/written by ocp plugins (TUI language, ...).",
  '// JSONC: comments & trailing commas OK. Plugin writes preserve keys, not comments.',
]

/** Config file location; OCP_CONFIG_PATH overrides (tests, sandboxes). */
export function ocpConfigPath(): string {
  if (process.env.OCP_CONFIG_PATH) return process.env.OCP_CONFIG_PATH
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(base, "opencode", "ocp.jsonc")
}

/** Tolerant JSONC parse via the shared stripper (comments, trailing commas); never throws. */
export function parseJsonc(text: string): Record<string, unknown> {
  try {
    return JSON.parse(stripJsonc(text)) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Read the whole config; missing or corrupt file → {} (fail-open). */
export function readOcpConfig(): Record<string, unknown> {
  try {
    const path = ocpConfigPath()
    if (!existsSync(path)) return {}
    return parseJsonc(readFileSync(path, "utf8"))
  } catch {
    return {}
  }
}

export function readOcpField<T>(key: string): T | undefined {
  return readOcpConfig()[key] as T | undefined
}

/** Read-modify-write one key; preserves all other keys. Creates parent dirs. Returns false on IO failure. */
export function writeOcpField(key: string, value: unknown): boolean {
  try {
    const path = ocpConfigPath()
    const cfg = readOcpConfig()
    cfg[key] = value
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${FILE_HEADER.join("\n")}\n${JSON.stringify(cfg, null, 2)}\n`, "utf8")
    return true
  } catch {
    return false
  }
}
