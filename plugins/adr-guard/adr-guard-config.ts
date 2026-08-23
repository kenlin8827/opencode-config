/**
 * Shared adr-guard config — project opencode.jsonc switch field + ADR directory.
 * Single source of truth for reading, writing, and normalizing the switch.
 *
 * State is PROJECT-LEVEL and lives in the `adrGuard` field of the project's
 * opencode.json/opencode.jsonc — there is NO separate state file.
 *   - absent or "off" → off (default — no enforcement)
 *   - "on"            → on (every feat/refactor commit needs a new/updated ADR)
 *
 * Resolution: project config `adrGuard` field → "off". Scanned in order:
 *   <project>/.opencode/opencode.jsonc, <project>/opencode.jsonc, then the
 *   .json variants.
 *
 * /adr-guard on|off writes the field into the project-level config only
 * (targeted upsert; comments and other fields preserved). /adr-guard reset
 * removes the field, reverting to the default off.
 *
 * Extra project-config field (optional):
 *   - `adrGuardDir` — ADR directory, default "docs/adr"
 *
 * The project directory is injected by the plugin entry via setProjectDir()
 * (PluginInput.directory); until then it falls back to process.cwd().
 *
 * Config-file plumbing (project dir resolution, JSONC parsing, field
 * upsert/remove, never-throw write) is shared with env-guard and auto-advisor
 * via ../shared/opencode-config; this file keeps only the adr-guard-specific
 * switch semantics.
 */

import {
  clearConfigField,
  getProjectDir,
  readProjectConfig,
  setConfigField,
  setProjectDir,
  stripJsonc,
} from "../shared/opencode-config"

// Re-export the shared plumbing so existing importers (plugin entry, tool
// guard, tests) keep their current import paths.
export { getProjectDir, readProjectConfig, setProjectDir, stripJsonc }

const VALID_STATES = ["on", "off"] as const
export type GuardState = (typeof VALID_STATES)[number]

const DEFAULT_STATE: GuardState = "off"

const STATE_ALIASES: Record<string, GuardState> = {
  on: "on",
  enabled: "on",
  true: "on",
  off: "off",
  disabled: "off",
  false: "off",
}

export function normalizeState(state: unknown): GuardState | null {
  if (typeof state === "boolean") return state ? "on" : "off"
  if (typeof state !== "string") return null
  const s = state.trim().toLowerCase()
  return STATE_ALIASES[s] ?? null
}

// ─── Switch resolution ───────────────────────────────────────────────
// The switch is the `adrGuard` field of the project-level opencode.jsonc.

const GUARD_FIELD = "adrGuard"

export type GuardStateSource = "config" | "default"

function resolveState(): { state: GuardState; source: GuardStateSource } {
  // Project config — the single source of truth for the switch.
  const cfg = readProjectConfig()
  const fromCfg = normalizeState(cfg?.adrGuard)
  if (fromCfg) return { state: fromCfg, source: "config" }
  return { state: DEFAULT_STATE, source: "default" }
}

export function getState(): GuardState {
  return resolveState().state
}

/** Where the current state came from (shown in `/adr-guard` status). */
export function getStateSource(): GuardStateSource {
  return resolveState().source
}

/**
 * Write the switch into the project-level opencode.jsonc. Project-scoped and
 * never throws: a read-only project dir degrades to a false return instead
 * of crashing a plugin hook.
 */
export function setState(state: GuardState): boolean {
  return setConfigField(GUARD_FIELD, state)
}

/**
 * Remove the `adrGuard` field from the project config so the state reverts
 * to the default off. Used by `/adr-guard reset`. Never throws.
 */
export function clearState(): boolean {
  return clearConfigField(GUARD_FIELD)
}

export function isEnabled(): boolean {
  return getState() === "on"
}

// ─── ADR directory ───────────────────────────────────────────────────

export const DEFAULT_ADR_DIR = "docs/adr"

export function getAdrDir(): string {
  const cfg = readProjectConfig()
  const v = cfg?.adrGuardDir
  if (typeof v === "string" && v.trim() !== "") {
    return v.trim().replace(/\\/g, "/").replace(/\/+$/, "")
  }
  return DEFAULT_ADR_DIR
}

// ─── Command ─────────────────────────────────────────────────────────

export const COMMAND_NAME = "adr-guard"

/**
 * Parse the first argument of an `/adr-guard <state>` call. Returns null if
 * the argument is missing or not a valid state (caller treats null as status).
 *
 *   /adr-guard      → null (status)
 *   /adr-guard on   → "on"
 *   /adr-guard off  → "off"
 */
export function parseStateArg(args: unknown): GuardState | null {
  if (typeof args !== "string") return null
  const first = args.trim().split(/\s+/)[0]
  return normalizeState(first)
}

const RESET_ALIASES = ["reset", "default", "clear"]

/** True when the first argument asks to reset the switch to the default off. */
export function parseResetArg(args: unknown): boolean {
  if (typeof args !== "string") return false
  const first = args.trim().split(/\s+/)[0]?.toLowerCase()
  return RESET_ALIASES.includes(first)
}
