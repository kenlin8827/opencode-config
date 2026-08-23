/**
 * DeepSeek Anchor Plugin configuration and state management
 * Inspired by the auto-advisor plugin implementation pattern
 *
 * State file: ~/.config/opencode/.deepseek-anchor-enabled
 *   - "on"   → Enable plugin (default)
 *   - "off"  → Disable plugin
 *
 * Cold start default value resolution:
 *   1. opencode.jsonc deepSeekAnchor field
 *   2. "on" (default value)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const STATE_FILE = join(CONFIG_DIR, ".deepseek-anchor-enabled")
const OPENCODE_CONFIG = join(CONFIG_DIR, "opencode.jsonc")

const VALID_MODES = ["on", "off"] as const
export type AnchorMode = (typeof VALID_MODES)[number]

const DEFAULT_MODE: AnchorMode = "on"

export function normalizeMode(mode: unknown): AnchorMode | null {
  if (typeof mode !== "string") return null
  const m = mode.trim().toLowerCase()
  if ((VALID_MODES as readonly string[]).includes(m)) return m as AnchorMode
  return null
}

export function getMode(): AnchorMode {
  // Check state file
  if (existsSync(STATE_FILE)) {
    try {
      const m = normalizeMode(readFileSync(STATE_FILE, "utf-8"))
      if (m) return m
    } catch {
      /* Ignore read errors */
    }
  }
  
  // Check opencode.jsonc config file
  if (existsSync(OPENCODE_CONFIG)) {
    try {
      const cfg = JSON.parse(readFileSync(OPENCODE_CONFIG, "utf-8"))
      const m = normalizeMode(cfg?.deepSeekAnchor)
      if (m) return m
    } catch {
      /* Ignore parse errors */
    }
  }
  
  return DEFAULT_MODE
}

export function setMode(mode: AnchorMode): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(STATE_FILE, mode, "utf-8")
}

export function isEnabled(): boolean {
  return getMode() === "on"
}

export const COMMAND_NAME = "deepseek-anchor"

/**
 * Parse the first argument of the `/deepseek-anchor <mode>` command
 * Returns null if argument is missing or invalid
 *
 *   /deepseek-anchor        → null (show help)
 *   /deepseek-anchor on     → "on"
 *   /deepseek-anchor off    → "off"
 */
export function parseModeArg(args: unknown): AnchorMode | null {
  if (typeof args !== "string") return null
  const first = args.trim().split(/\s+/)[0]
  return normalizeMode(first)
}