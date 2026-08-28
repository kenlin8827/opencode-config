/**
 * Shared e2e-guard config — project opencode.jsonc switch field.
 * Single source of truth for reading and normalizing the switch.
 *
 * State is PROJECT-LEVEL and lives in the `e2eGuard` field of the project's
 * opencode.json/opencode.jsonc. The `/e2e-guard on|off` command flips it by
 * writing that field (targeted upsert via ../shared/opencode-prime —
 * comments and unrelated fields survive); it can also be flipped by hand.
 *   - absent or "off" → off (default — no enforcement, complete no-op)
 *   - "on"            → on (E2E runs are gated behind a user confirmation)
 *
 * Resolution: project config `e2eGuard` field → "off". Scanned in order:
 *   <project>/.opencode/opencode.jsonc, <project>/opencode.jsonc, then the
 *   .json variants.
 *
 * The project directory is injected by the plugin entry via setProjectDir()
 * (PluginInput.directory); until then it falls back to process.cwd().
 *
 * Config-file plumbing (project dir resolution, JSONC parsing) is shared
 * with adr-guard, env-guard and auto-advisor via ../shared/opencode-prime;
 * this file keeps only the e2e-guard-specific switch semantics.
 */

import {
  getProjectDir,
  readProjectConfig,
  setConfigField,
  setProjectDir,
  writableProjectConfigFile,
} from "../shared/opencode-prime"

// Re-export the shared plumbing so importers (plugin entry, tool guard,
// command, tests) keep one import path.
export { getProjectDir, readProjectConfig, setProjectDir, writableProjectConfigFile }

const VALID_STATES = ["on", "off"] as const
export type GuardState = (typeof VALID_STATES)[number]

const DEFAULT_STATE: GuardState = "off"

// Hand-edited configs may spell the switch loosely — normalize them.
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

export function getState(): GuardState {
  const fromCfg = normalizeState(readProjectConfig()?.e2eGuard)
  return fromCfg ?? DEFAULT_STATE
}

export function isEnabled(): boolean {
  return getState() === "on"
}

// ─── Switch write ────────────────────────────────────────────────────
// `/e2e-guard on|off` — upsert the e2eGuard field into the project config
// (targeted text edit: comments and unrelated fields survive). Returns
// false when the write fails (e.g. read-only project dir) — the command
// hook reports that to the user instead of crashing.

export function setState(state: GuardState): boolean {
  return setConfigField("e2eGuard", state)
}
