/**
 * Shared e2e-guard config — project opencode.jsonc switch field.
 * Single source of truth for reading, writing, and normalizing the switch.
 *
 * State is PROJECT-LEVEL and lives in the `e2eGuard` field of the project's
 * opencode.json/opencode.jsonc — there is NO separate state file.
 *   - absent or "off" → off (default — no enforcement)
 *   - "on"            → on (E2E runs are blocked until the user confirms
 *                           and `/e2e-guard allow` grants a one-shot pass)
 *
 * Resolution: project config `e2eGuard` field → "off". Scanned in order:
 *   <project>/.opencode/opencode.jsonc, <project>/opencode.jsonc, then the
 *   .json variants.
 *
 * /e2e-guard on|off writes the field into the project-level config only
 * (targeted upsert; comments and other fields preserved). /e2e-guard reset
 * removes the field, reverting to the default off. The session approval
 * (`/e2e-guard allow`) is deliberately NOT persisted — it lives in memory,
 * one-shot, and dies with the session or the server.
 *
 * The project directory is injected by the plugin entry via setProjectDir()
 * (PluginInput.directory); until then it falls back to process.cwd().
 *
 * Config-file plumbing (project dir resolution, JSONC parsing, field
 * upsert/remove, never-throw write) is shared with adr-guard, env-guard and
 * auto-advisor via ../shared/opencode-config; this file keeps only the
 * e2e-guard-specific switch semantics.
 */

import {
  clearConfigField,
  getProjectDir,
  readProjectConfig,
  setConfigField,
  setProjectDir,
  stripJsonc,
} from "../shared/opencode-config"

// Re-export the shared plumbing so importers (plugin entry, tool guard,
// tests) keep one import path.
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
// The switch is the `e2eGuard` field of the project-level opencode.jsonc.

const GUARD_FIELD = "e2eGuard"

export type GuardStateSource = "config" | "default"

function resolveState(): { state: GuardState; source: GuardStateSource } {
  // Project config — the single source of truth for the switch.
  const cfg = readProjectConfig()
  const fromCfg = normalizeState(cfg?.e2eGuard)
  if (fromCfg) return { state: fromCfg, source: "config" }
  return { state: DEFAULT_STATE, source: "default" }
}

export function getState(): GuardState {
  return resolveState().state
}

/** Where the current state came from (shown in `/e2e-guard` status). */
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
 * Remove the `e2eGuard` field from the project config so the state reverts
 * to the default off. Used by `/e2e-guard reset`. Never throws.
 */
export function clearState(): boolean {
  return clearConfigField(GUARD_FIELD)
}

export function isEnabled(): boolean {
  return getState() === "on"
}

// ─── Command ─────────────────────────────────────────────────────────

export const COMMAND_NAME = "e2e-guard"

/**
 * Parse the first argument of an `/e2e-guard <state>` call. Returns null if
 * the argument is missing or not a valid state (caller treats null as status).
 *
 *   /e2e-guard      → null (status)
 *   /e2e-guard on   → "on"
 *   /e2e-guard off  → "off"
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

const ALLOW_ALIASES = ["allow", "approve", "confirm", "yes"]
const TARGETED_ALIASES = ["targeted", "scoped", "affected", "partial", "impact"]

export type AllowScope = "full" | "targeted"

/**
 * The scope of an allow call, or null when the argument is not one:
 *
 *   /e2e-guard allow            → "full"     (one-shot pass + unlock)
 *   /e2e-guard allow targeted   → "targeted" (unlock only — affected-spec
 *                                 re-runs pass, full suites stay gated)
 */
export function parseAllowArg(args: unknown): AllowScope | null {
  if (typeof args !== "string") return null
  const parts = args.trim().split(/\s+/)
  if (!ALLOW_ALIASES.includes(parts[0]?.toLowerCase() ?? "")) return null
  const second = parts[1]?.toLowerCase() ?? ""
  return TARGETED_ALIASES.includes(second) ? "targeted" : "full"
}
