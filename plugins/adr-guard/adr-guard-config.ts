/**
 * Shared adr-guard config — state file and ADR directory.
 * Single source of truth for reading, writing, and normalizing the switch.
 *
 * State is PROJECT-LEVEL. State file: <project>/.opencode/.adr-guard
 *   - absent or "off" → off (default — no enforcement)
 *   - "on"            → on (every feat/refactor commit needs a new/updated ADR)
 *
 * Resolution order (first hit wins):
 *   1. Project state file <project>/.opencode/.adr-guard
 *   2. Project config `adrGuard` field
 *      (<project>/opencode.jsonc or <project>/.opencode/opencode.jsonc)
 *   3. "off"
 *
 * Extra project-config field (optional):
 *   - `adrGuardDir` — ADR directory, default "docs/adr"
 *
 * The project directory is injected by the plugin entry via setProjectDir()
 * (PluginInput.directory); until then we fall back to process.cwd().
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

// ─── Project directory ───────────────────────────────────────────────
// Injected by the plugin entry (adr-guard.ts) from PluginInput.directory.

let projectDir = process.cwd()

export function setProjectDir(dir: string): void {
  if (typeof dir === "string" && dir.trim() !== "") projectDir = dir
}

export function getProjectDir(): string {
  return projectDir
}

function projectStateFile(): string {
  return join(projectDir, ".opencode", ".adr-guard")
}

function projectConfigFiles(): string[] {
  return [
    join(projectDir, "opencode.jsonc"),
    join(projectDir, ".opencode", "opencode.jsonc"),
    join(projectDir, "opencode.json"),
    join(projectDir, ".opencode", "opencode.json"),
  ]
}

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

/**
 * Strip JSONC comments and trailing commas so we can JSON.parse a .jsonc file.
 * Two quote-aware passes:
 *   1. stripComments — removes line/block comments while respecting string
 *      literals (a `//` inside a quoted value is kept).
 *   2. stripTrailingCommas — drops a `,` only when the next non-whitespace
 *      char is `}` or `]`, skipping string literals so values like `"x,}"`
 *      survive untouched (a naive global replace would silently corrupt them).
 */
export function stripJsonc(raw: string): string {
  return stripTrailingCommas(stripComments(raw))
}

function stripComments(raw: string): string {
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
  return result
}

function stripTrailingCommas(src: string): string {
  let result = ""
  let inString = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inString) {
      result += c
      if (c === "\\") { if (i + 1 < src.length) result += src[++i] }
      else if (c === '"') { inString = false }
      continue
    }
    if (c === '"') { inString = true; result += c; continue }
    if (c === ",") {
      // Trailing when only whitespace separates it from the closing brace.
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      if (j < src.length && (src[j] === "}" || src[j] === "]")) continue
    }
    result += c
  }
  return result
}

function readStateFile(path: string): GuardState | null {
  if (!existsSync(path)) return null
  return normalizeState(readFileSync(path, "utf-8"))
}

/** First parseable project config as a plain object, or null. */
export function readProjectConfig(): Record<string, unknown> | null {
  for (const path of projectConfigFiles()) {
    if (!existsSync(path)) continue
    try {
      return JSON.parse(stripJsonc(readFileSync(path, "utf-8")))
    } catch {
      // unreadable or unparseable — try next source
    }
  }
  return null
}

export type GuardStateSource = "state-file" | "config" | "default"

function resolveState(): { state: GuardState; source: GuardStateSource } {
  // 1. Project state file — written by /adr-guard in this project.
  const s = readStateFile(projectStateFile())
  if (s) return { state: s, source: "state-file" }
  // 2. Project config — cross-session default committed with the repo.
  const cfg = readProjectConfig()
  const fromCfg = normalizeState(cfg?.adrGuard)
  if (fromCfg) return { state: fromCfg, source: "config" }
  // 3. Default.
  return { state: DEFAULT_STATE, source: "default" }
}

export function getState(): GuardState {
  return resolveState().state
}

/** Where the current state came from (shown in `/adr-guard` status). */
export function getStateSource(): GuardStateSource {
  return resolveState().source
}

export function setState(state: GuardState): void {
  // Project-level write — every switch is scoped to the current project.
  const file = projectStateFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, state, "utf-8")
}

/**
 * Delete the project state file so the state falls back to the committed
 * `adrGuard` config field (or the default off). Used by `/adr-guard reset`.
 */
export function clearState(): void {
  const file = projectStateFile()
  if (existsSync(file)) rmSync(file)
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

/** True when the first argument asks to drop the local state file. */
export function parseResetArg(args: unknown): boolean {
  if (typeof args !== "string") return false
  const first = args.trim().split(/\s+/)[0]?.toLowerCase()
  return RESET_ALIASES.includes(first)
}
