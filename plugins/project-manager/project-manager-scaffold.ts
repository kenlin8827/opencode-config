/**
 * Scaffold logic for `/project init` — generates the baseline project files.
 *
 * Iron rule: NEVER overwrite. A target file is written only when it does not
 * already exist; anything present is reported as skipped and left untouched.
 *
 * Targets (relative to the project directory):
 *   .opencode/opencode.jsonc — project-level OpenCode config stub
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
import { resolveTarget, type ScaffoldTarget } from "./project-manager-config"

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

export type ScaffoldStatus = "created" | "skipped"

export interface ScaffoldResult {
  relPath: ScaffoldTarget
  status: ScaffoldStatus
}

/**
 * Run `/project init`: create each missing target file. Existing files are
 * skipped — never overwritten. Parent directories are created on demand.
 * Errors propagate to the caller (command hook reports them to the user).
 */
export function runInit(): ScaffoldResult[] {
  const results: ScaffoldResult[] = []
  for (const relPath of Object.keys(TEMPLATE_FILES) as ScaffoldTarget[]) {
    const absPath = resolveTarget(relPath)
    if (existsSync(absPath)) {
      results.push({ relPath, status: "skipped" })
      continue
    }
    mkdirSync(dirname(absPath), { recursive: true })
    writeFileSync(absPath, readTemplate(TEMPLATE_FILES[relPath]), "utf-8")
    results.push({ relPath, status: "created" })
  }
  return results
}
