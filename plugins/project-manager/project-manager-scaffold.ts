/**
 * Scaffold logic for `/project init` — generates the baseline project files.
 *
 * Iron rule: NEVER overwrite. A target file is written only when it does not
 * already exist; anything present is reported as skipped and left untouched.
 * The single, append-only exception: an EXISTING project config gets switch
 * lines the template gained since init appended before its closing `}`
 * (existing content byte-preserved; reported as "updated").
 *
 * Targets (relative to the project directory):
 *   .opencode/opencode.jsonc — project-level OpenCode config stub; when it
 *                               already exists, an append-only top-up adds
 *                               switch lines the template gained since init
 *   docs/git-commits.md      — conventional-commit convention for the repo
 *   AGENTS.md                — repo-level AI agent instructions stub
 *
 * Template bodies live as real files under `templates/` (next to this
 * module) — same pattern as grill/grill-me.md. Each is read once and
 * cached in memory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { CONFIG_REL, resolveTarget, type ScaffoldTarget } from "./project-manager-config"

// ─── Templates ───────────────────────────────────────────────────────

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "templates")

/** Baseline target (relative path) → template file under `templates/`. */
const TEMPLATE_FILES: Record<ScaffoldTarget, string> = {
  ".opencode/opencode.jsonc": "opencode.jsonc",
  "docs/git-commits.md": "git-commits.md",
  "AGENTS.md": "AGENTS.md",
}

// Cache template content (each file loaded once).
const templateCache = new Map<string, string>()
function readTemplate(file: string): string {
  const cached = templateCache.get(file)
  if (cached !== undefined) return cached
  const content = readFileSync(join(TEMPLATE_DIR, file), "utf-8")
  templateCache.set(file, content)
  return content
}

// ─── dbhub.toml (conditional — init backend step, not a baseline file) ─

/** Per-project DBHub config — scaffolded by `/project init` only when the
 * dbhub MCP is enabled and its CLI is installed; NOT part of SCAFFOLD_TARGETS,
 * so a project without dbhub is never nagged about it. Same iron rule:
 * never overwrite. */
export const DBHUB_TOML_REL = "dbhub.toml"

/** Create dbhub.toml in `root` when missing; an existing file is preserved.
 * Returns the report status, same vocabulary as the baseline scaffolding. */
export function writeDbhubToml(root: string): ScaffoldStatus {
  const absPath = join(root, DBHUB_TOML_REL)
  if (existsSync(absPath)) return "skipped"
  writeFileSync(absPath, readTemplate("dbhub.toml"), "utf-8")
  return "created"
}

// ─── Init ────────────────────────────────────────────────────────────

export type ScaffoldStatus = "created" | "updated" | "skipped"

export interface ScaffoldResult {
  relPath: ScaffoldTarget
  status: ScaffoldStatus
}

/**
 * Run `/project init`: create each missing target file. Existing files are
 * never overwritten — EXCEPT the project config, which gets an append-only
 * top-up with template switch lines it does not have yet (template
 * evolution; existing content untouched, reported as "updated"). Parent
 * directories are created on demand. Errors propagate to the caller
 * (command hook reports them to the user).
 */
export function runInit(): ScaffoldResult[] {
  const results: ScaffoldResult[] = []
  for (const relPath of Object.keys(TEMPLATE_FILES) as ScaffoldTarget[]) {
    const absPath = resolveTarget(relPath)
    if (existsSync(absPath)) {
      if (relPath === CONFIG_REL) {
        const sync = runSync()
        results.push({ relPath, status: sync.status === "added" ? "updated" : "skipped" })
        continue
      }
      results.push({ relPath, status: "skipped" })
      continue
    }
    mkdirSync(dirname(absPath), { recursive: true })
    writeFileSync(absPath, readTemplate(TEMPLATE_FILES[relPath]), "utf-8")
    results.push({ relPath, status: "created" })
  }
  return results
}

// ─── Sync (template evolution) ──────────────────────────────────────
// init's never-overwrite rule means an existing .opencode/opencode.jsonc
// never receives switch lines added to the template AFTER init. `/project
// sync` closes that gap with an APPEND-ONLY merge: template switch lines
// whose key is entirely absent from the existing file are inserted right
// before the closing `}`; existing content is never edited, deleted, or
// reordered.

export interface SwitchLine {
  key: string
  line: string
}

/** Commented switch lines (`// "key": ...`) offered by the config template. */
export function extractSwitchLines(templateContent: string): SwitchLine[] {
  const out: SwitchLine[] = []
  for (const line of templateContent.split(/\r?\n/)) {
    const m = line.match(/^\s*\/\/\s*"([^"]+)"\s*:/)
    if (m) out.push({ key: m[1], line })
  }
  return out
}

/** True when `content` already carries the key — active OR commented out. */
export function contentHasKey(content: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`"${escaped}"\\s*:`).test(content)
}

/**
 * Additive merge of template switch lines into `existing`. Returns the
 * rewritten content plus the keys that were added; null when `existing`
 * has no closing brace (malformed — the file must not be touched).
 * Zero missing keys → content returned unchanged.
 */
export function mergeSwitchLines(
  existing: string,
  templateContent: string,
): { content: string; added: string[] } | null {
  const close = existing.lastIndexOf("}")
  if (close < 0) return null
  const missing = extractSwitchLines(templateContent).filter((s) => !contentHasKey(existing, s.key))
  if (missing.length === 0) return { content: existing, added: [] }
  const eol = existing.includes("\r\n") ? "\r\n" : "\n"
  const block = missing.map((s) => s.line).join(eol)
  return {
    content: existing.slice(0, close) + block + eol + existing.slice(close),
    added: missing.map((s) => s.key),
  }
}

export type SyncStatus = "added" | "up-to-date" | "missing" | "invalid"

export interface SyncResult {
  status: SyncStatus
  added: string[]
}

/**
 * Run `/project sync`: top up the EXISTING project config with template
 * switch lines it does not have yet. Append-only (see above). A missing
 * config is `missing` (that is init's job); a brace-less file is `invalid`
 * and left untouched.
 */
export function runSync(): SyncResult {
  const absPath = resolveTarget(CONFIG_REL)
  if (!existsSync(absPath)) return { status: "missing", added: [] }
  const existing = readFileSync(absPath, "utf-8")
  const merged = mergeSwitchLines(existing, readTemplate(TEMPLATE_FILES[CONFIG_REL]))
  if (!merged) return { status: "invalid", added: [] }
  if (merged.added.length === 0) return { status: "up-to-date", added: [] }
  writeFileSync(absPath, merged.content, "utf-8")
  return { status: "added", added: merged.added }
}
