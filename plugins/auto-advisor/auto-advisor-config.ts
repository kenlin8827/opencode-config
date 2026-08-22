/**
 * Shared auto-advisor config — read/write the mode via opencode.jsonc.
 * Single source of truth for reading, writing, and normalizing the mode.
 *
 * No hidden state file and no env var: the mode lives in the `autoAdvisorMode`
 * field of the project-level opencode.jsonc:
 *   - "lite" → both opinions returned to user
 *   - "full" → full (auto-execute when confidence ≥ 8)
 *   - "off"  → off (no auto-dispatch; manual @advisor still works)
 *
 * Resolution: project config autoAdvisorMode field → "off" (default).
 *   (<project>/.opencode/opencode.jsonc or <project>/opencode.jsonc, then
 *   the .json variants). Purely project-level — no global fallback.
 *
 * /auto-advisor <mode> ALWAYS writes to the project-level config only:
 * the first existing project config file, or <project>/.opencode/opencode.jsonc
 * if none exists (the same location /project init scaffolds). Comments and
 * other fields are preserved (targeted field upsert, never a full
 * reserialize).
 *
 * The project directory is injected by the plugin entry via setProjectDir()
 * (PluginInput.directory); until then we fall back to process.cwd().
 *
 * Backward compatibility: legacy field name "advisorMode" is still read, and
 * rewritten as "autoAdvisorMode" on the next /auto-advisor switch. Old state
 * file values "advisory" / "decisive" are normalized to "lite" / "full".
 *
 * Config-file plumbing (project dir resolution, JSONC parsing, field upsert,
 * never-throw write) is shared with adr-guard and env-guard via
 * ../shared/opencode-config; this file keeps only the auto-advisor-specific
 * mode semantics.
 */

import { existsSync, readFileSync } from "node:fs"
import {
  getProjectDir,
  projectConfigFiles,
  setConfigField,
  setProjectDir,
  stripJsonc,
} from "../shared/opencode-config"

// Re-export the shared plumbing so existing importers (plugin entry, runtime)
// keep their current import paths.
export { getProjectDir, setProjectDir, stripJsonc }

const VALID_MODES = ["off", "lite", "full"] as const
export type AdvisorMode = (typeof VALID_MODES)[number]

// Default is OFF: no auto-dispatch unless a project opencode.jsonc explicitly
// opts in. Manual @advisor still works in all modes.
const DEFAULT_MODE: AdvisorMode = "off"

const MODE_FIELD = "autoAdvisorMode"
// Legacy field name still read for backward compatibility; upgraded to
// MODE_FIELD in place on the next write.
const MODE_FIELD_ALIASES = ["advisorMode"]

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

function readModeFromConfig(path: string): AdvisorMode | null {
  if (!existsSync(path)) return null
  try {
    const cfg = JSON.parse(stripJsonc(readFileSync(path, "utf-8")))
    // Check new field name first, then legacy.
    return normalizeMode(cfg?.autoAdvisorMode) ?? normalizeMode(cfg?.advisorMode)
  } catch {
    return null // unreadable or unparseable — try next source
  }
}

export function getMode(): AdvisorMode {
  // Project config is the single source of truth — per-project opt-in
  // committed with the repo. No global fallback: the switch is project-level.
  for (const path of projectConfigFiles()) {
    const m = readModeFromConfig(path)
    if (m) return m
  }
  return DEFAULT_MODE
}

// ─── Writing ─────────────────────────────────────────────────────────
// /auto-advisor <mode> targets the project-level config only. Targeted field
// upsert (shared): replace the existing autoAdvisorMode/advisorMode value, or
// insert the field right after the root `{`. Comments and all other fields
// stay untouched.

export function setMode(mode: AdvisorMode): boolean {
  // Project-level write only — never touches the global config.
  // Never throw: the project dir may be read-only, and plugin hooks must
  // not crash the session. Caller logs and degrades on false.
  return setConfigField(MODE_FIELD, mode, MODE_FIELD_ALIASES)
}

export function isOn(): boolean {
  return getMode() !== "off"
}

// NOTE: isOn() is no longer used for hard dispatch blocking. It remains for
// backward compatibility and potential future use. OFF mode now relies on
// the system prompt's soft guard ("Do NOT auto-dispatch") instead of a
// tool.execute.before hard block. Manual @advisor is allowed in all modes.

export const COMMAND_NAME = "auto-advisor"

/**
 * Parse the first argument of an `/auto-advisor <mode>` call. Returns null if the
 * argument is missing or not a valid mode.
 *
 *   /auto-advisor      → null (no-op)
 *   /auto-advisor off  → "off"
 *   /auto-advisor lite → "lite"
 *   /auto-advisor full → "full"
 */
export function parseModeArg(args: unknown): AdvisorMode | null {
  if (typeof args !== "string") return null
  const first = args.trim().split(/\s+/)[0]
  return normalizeMode(first)
}
