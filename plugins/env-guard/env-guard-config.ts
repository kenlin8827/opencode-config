/**
 * Shared env-guard config — project opencode.jsonc switch field.
 * Single source of truth for reading, writing, and normalizing the switch.
 *
 * State is PROJECT-LEVEL and lives in the `envGuard` field of the project's
 * opencode.json/opencode.jsonc — there is NO separate state file.
 *   - absent or "off" → off (default — no enforcement)
 *   - "on"            → on (secret-bearing .env* access is hard-blocked)
 *
 * Resolution: project config `envGuard` field → "off". Scanned in order:
 *   <project>/.opencode/opencode.jsonc, <project>/opencode.jsonc, then the
 *   .json variants. Setting the switch writes the field into the
 * project-level config only (targeted upsert; comments preserved).
 *
 * The project directory is injected by the plugin entry via setProjectDir()
 * (PluginInput.directory); until then we fall back to process.cwd().
 *
 * Config-file plumbing (project dir resolution, JSONC parsing, field
 * upsert/remove, never-throw write) is shared with adr-guard and auto-advisor
 * via ../shared/opencode-config; this file keeps only the env-guard-specific
 * switch semantics.
 */

import {
  clearConfigField,
  readProjectConfig,
  setConfigField,
  setProjectDir,
} from "../shared/opencode-config"

// Re-export the shared plumbing so the plugin entry keeps its import path.
export { setProjectDir }

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
// The switch is the `envGuard` field of the project-level opencode.jsonc.

const GUARD_FIELD = "envGuard"

export type GuardStateSource = "config" | "default"

function resolveState(): { state: GuardState; source: GuardStateSource } {
  // Project config — the single source of truth for the switch.
  const cfg = readProjectConfig()
  const fromCfg = normalizeState(cfg?.envGuard)
  if (fromCfg) return { state: fromCfg, source: "config" }
  return { state: DEFAULT_STATE, source: "default" }
}

export function getState(): GuardState {
  return resolveState().state
}

/** Where the current state came from (useful in diagnostics/tests). */
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

/** Remove the `envGuard` field so the state reverts to the default off. */
export function clearState(): boolean {
  return clearConfigField(GUARD_FIELD)
}

export function isEnabled(): boolean {
  return getState() === "on"
}
