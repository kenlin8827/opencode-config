/**
 * Shared auto-advisor config — read/write the mode via opencode.jsonc.
 * Single source of truth for reading, writing, and normalizing the mode.
 *
 * No hidden state file and no env var: the mode lives in the `autoAdvisorMode`
 * field of opencode.jsonc, at either level:
 *   - "lite" → both opinions returned to user
 *   - "full" → full (auto-execute when confidence ≥ 8)
 *   - "off"  → off (no auto-dispatch; manual @advisor still works)
 *
 * Resolution order (first hit wins):
 *   1. Project config autoAdvisorMode field
 *      (<project>/opencode.jsonc or <project>/.opencode/opencode.jsonc)
 *   2. Global config autoAdvisorMode field
 *      (~/.config/opencode/opencode.jsonc)
 *   3. "off" (default)
 *
 * /auto-advisor <mode> ALWAYS writes to the project-level config only:
 * the first existing project config file, or <project>/opencode.jsonc if
 * none exists. Comments and other fields are preserved (targeted field
 * upsert, never a full reserialize).
 *
 * The project directory is injected by the plugin entry via setProjectDir()
 * (PluginInput.directory); until then we fall back to process.cwd().
 *
 * Backward compatibility: legacy field name "advisorMode" is still read, and
 * rewritten as "autoAdvisorMode" on the next /auto-advisor switch. Old state
 * file values "advisory" / "decisive" are normalized to "lite" / "full".
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "opencode")
const GLOBAL_OPENCODE_CONFIG = join(GLOBAL_CONFIG_DIR, "opencode.jsonc")

// ─── Project directory ───────────────────────────────────────────────
// Injected by the plugin entry (auto-advisor-mode.ts) from PluginInput.directory.

let projectDir = process.cwd()

export function setProjectDir(dir: string): void {
  if (typeof dir === "string" && dir.trim() !== "") projectDir = dir
}

export function getProjectDir(): string {
  return projectDir
}

function projectConfigFiles(): string[] {
  return [
    join(projectDir, "opencode.jsonc"),
    join(projectDir, ".opencode", "opencode.jsonc"),
    join(projectDir, "opencode.json"),
    join(projectDir, ".opencode", "opencode.json"),
  ]
}

function globalConfigFiles(): string[] {
  // .jsonc first (current install), then legacy .json.
  return [GLOBAL_OPENCODE_CONFIG, join(GLOBAL_CONFIG_DIR, "opencode.json")]
}

const VALID_MODES = ["off", "lite", "full"] as const
export type AdvisorMode = (typeof VALID_MODES)[number]

// Default is OFF: no auto-dispatch unless a project/global opencode.jsonc
// explicitly opts in. Manual @advisor still works in all modes.
const DEFAULT_MODE: AdvisorMode = "off"

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

/**
 * Strip JSONC comments and trailing commas so we can JSON.parse a .jsonc file.
 * Minimal stripper: removes line comments and block comments while respecting
 * string literals, and removes trailing commas before } or ].
 */
export function stripJsonc(raw: string): string {
  let result = ""
  let i = 0
  const len = raw.length
  let state: "normal" | "string" | "lineComment" | "blockComment" = "normal"
  while (i < len) {
    const c = raw[i]
    const next = i + 1 < len ? raw[i + 1] : ""
    switch (state) {
      case "normal":
        if (c === '"') { result += c; state = "string" }
        else if (c === "/" && next === "/") { state = "lineComment"; i++ }
        else if (c === "/" && next === "*") { state = "blockComment"; i++ }
        else { result += c }
        break
      case "string":
        result += c
        if (c === "\\") { i++; if (i < len) result += raw[i] }
        else if (c === '"') { state = "normal" }
        break
      case "lineComment":
        if (c === "\n") { result += c; state = "normal" }
        break
      case "blockComment":
        if (c === "*" && next === "/") { state = "normal"; i++ }
        break
    }
    i++
  }
  return result.replace(/,(\s*[}\]])/g, "$1")
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
  // 1. Project config wins — per-project opt-in committed with the repo.
  for (const path of projectConfigFiles()) {
    const m = readModeFromConfig(path)
    if (m) return m
  }
  // 2. Global config fallback.
  for (const path of globalConfigFiles()) {
    const m = readModeFromConfig(path)
    if (m) return m
  }
  // 3. Neither level defines the mode → off.
  return DEFAULT_MODE
}

// ─── Writing ─────────────────────────────────────────────────────────
// /auto-advisor <mode> targets the project-level config only. Targeted
// field upsert: replace the existing autoAdvisorMode/advisorMode value, or
// insert the field right after the root `{` (trailing comma is valid JSONC,
// and avoids double-comma collisions with existing trailing commas).
// Comments and all other fields stay untouched.

const MODE_FIELD_RE = /"(?:autoAdvisorMode|advisorMode)"(\s*:\s*)"[^"]*"/

function writableProjectConfigFile(): string {
  for (const path of projectConfigFiles()) {
    if (existsSync(path)) return path
  }
  return join(projectDir, "opencode.jsonc")
}

function upsertModeField(raw: string, mode: AdvisorMode): string {
  if (raw.trim() === "") return `{\n  "autoAdvisorMode": "${mode}"\n}\n`
  if (MODE_FIELD_RE.test(raw)) {
    // Also upgrades the legacy "advisorMode" field name in place.
    return raw.replace(MODE_FIELD_RE, `"autoAdvisorMode"$1"${mode}"`)
  }
  const idx = raw.indexOf("{")
  if (idx === -1) throw new Error("no root object in config file")
  return raw.slice(0, idx + 1) + `\n  "autoAdvisorMode": "${mode}",` + raw.slice(idx + 1)
}

export function setMode(mode: AdvisorMode): boolean {
  // Project-level write only — never touches the global config.
  // Never throw: the project dir may be read-only, and plugin hooks must
  // not crash the session. Caller logs and degrades on false.
  try {
    const file = writableProjectConfigFile()
    const raw = existsSync(file) ? readFileSync(file, "utf-8") : ""
    const updated = upsertModeField(raw, mode)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, updated, "utf-8")
    return true
  } catch {
    return false
  }
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
