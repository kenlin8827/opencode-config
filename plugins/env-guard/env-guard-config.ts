/**
 * Shared env-guard config — project-level switch.
 * Single source of truth for reading, writing, and normalizing the switch.
 *
 * State is PROJECT-LEVEL. State file: <project>/.opencode/.env-guard
 *   - absent or "off" → off (default — no enforcement)
 *   - "on"            → on (secret-bearing .env* access is hard-blocked)
 *
 * Resolution order (first hit wins):
 *   1. Project state file <project>/.opencode/.env-guard
 *   2. Project config `envGuard` field
 *      (<project>/opencode.jsonc or <project>/.opencode/opencode.jsonc)
 *   3. "off"
 *
 * The project directory is injected by the plugin entry via setProjectDir()
 * (PluginInput.directory); until then we fall back to process.cwd().
 *
 * JSONC parsing reuses adr-guard-config's quote-aware stripJsonc (pure
 * function, no shared state) — same reuse pattern project-manager uses for
 * the adr-guard-runtime tokenizer.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { stripJsonc } from "../adr-guard/adr-guard-config"

// ─── Project directory ───────────────────────────────────────────────
// Injected by the plugin entry (env-guard.ts) from PluginInput.directory.

let projectDir = process.cwd()

export function setProjectDir(dir: string): void {
  if (typeof dir === "string" && dir.trim() !== "") projectDir = dir
}

export function getProjectDir(): string {
  return projectDir
}

function projectStateFile(): string {
  return join(projectDir, ".opencode", ".env-guard")
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
  // 1. Project state file — machine-local override.
  const s = readStateFile(projectStateFile())
  if (s) return { state: s, source: "state-file" }
  // 2. Project config — cross-session default committed with the repo.
  const cfg = readProjectConfig()
  const fromCfg = normalizeState(cfg?.envGuard)
  if (fromCfg) return { state: fromCfg, source: "config" }
  // 3. Default.
  return { state: DEFAULT_STATE, source: "default" }
}

export function getState(): GuardState {
  return resolveState().state
}

/** Where the current state came from (useful in diagnostics/tests). */
export function getStateSource(): GuardStateSource {
  return resolveState().source
}

export function setState(state: GuardState): void {
  // Project-level write — every switch is scoped to the current project.
  const file = projectStateFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, state, "utf-8")
}

/** Delete the project state file so the state falls back to config/default. */
export function clearState(): void {
  const file = projectStateFile()
  if (existsSync(file)) rmSync(file)
}

export function isEnabled(): boolean {
  return getState() === "on"
}
