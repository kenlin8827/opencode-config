/**
 * Shared advisor config — state file + cold-start defaults.
 * Single source of truth for reading, writing, and normalizing the mode.
 *
 * State file: ~/.config/opencode/.advisor-mode
 *   - absent or "lite" → lite (default; both opinions returned to user)
 *   - "full"          → full (auto-execute when confidence ≥ 9)
 *   - "off"           → off (no @advisor dispatch)
 *
 * Cold-start resolution (no flag yet):
 *   1. opencode.jsonc advisorMode field (cross-session default)
 *   2. PONYTAIL_DEFAULT_MODE env var, only if it pins advisor off
 *   3. "lite"
 *
 * Backward compatibility: old state file values "advisory" / "decisive" are
 * silently normalized to "lite" / "full". Migration is one-way.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const STATE_FILE = join(CONFIG_DIR, ".advisor-mode")
const OPENCODE_CONFIG = join(CONFIG_DIR, "opencode.jsonc")

const VALID_MODES = ["off", "lite", "full"] as const
export type AdvisorMode = (typeof VALID_MODES)[number]

const DEFAULT_MODE: AdvisorMode = "lite"

const LEGACY_ALIASES: Record<string, AdvisorMode> = {
  advisory: "lite",
  decisive: "full",
}

export function normalizeMode(mode: unknown): AdvisorMode | null {
  if (typeof mode !== "string") return null
  const m = mode.trim().toLowerCase()
  if ((VALID_MODES as readonly string[]).includes(m)) return m as AdvisorMode
  // Legacy migration: "advisory" → "lite", "decisive" → "full".
  if (m in LEGACY_ALIASES) return LEGACY_ALIASES[m]
  return null
}

export function getMode(): AdvisorMode {
  if (existsSync(STATE_FILE)) {
    const m = normalizeMode(readFileSync(STATE_FILE, "utf-8"))
    if (m) return m
  }
  // ponytail: probe .jsonc first (current install), fall back to legacy .json
  const legacyConfig = join(CONFIG_DIR, "opencode.json")
  for (const path of [OPENCODE_CONFIG, legacyConfig]) {
    if (existsSync(path)) {
      try {
        const cfg = JSON.parse(readFileSync(path, "utf-8"))
        const m = normalizeMode(cfg?.advisorMode)
        if (m) return m
      } catch {
        /* ignore parse error */
      }
    }
  }
  if (normalizeMode(process.env.PONYTAIL_DEFAULT_MODE) === "off") return "off"
  return DEFAULT_MODE
}

export function setMode(mode: AdvisorMode): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(STATE_FILE, mode, "utf-8")
}

export function isOn(): boolean {
  return getMode() !== "off"
}

export const COMMAND_NAME = "advisor"

/**
 * Parse the first argument of an `/advisor <mode>` call. Returns null if the
 * argument is missing or not a valid mode.
 *
 *   /advisor      → null (no-op)
 *   /advisor off  → "off"
 *   /advisor lite → "lite"
 *   /advisor full → "full"
 */
export function parseModeArg(args: unknown): AdvisorMode | null {
  if (typeof args !== "string") return null
  const first = args.trim().split(/\s+/)[0]
  return normalizeMode(first)
}