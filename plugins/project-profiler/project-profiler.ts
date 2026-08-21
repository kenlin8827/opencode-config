/**
 * Project Profiler — detects the project's nature at session start and
 * injects a compact profile + code-intelligence backend recommendation
 * (Serena vs CodeGraph, GitNexus optional) into the system prompt.
 *
 * Why: subagent contexts are isolated and every file read costs tokens.
 * Serena (live LSP, symbol-level) and CodeGraph (knowledge graph: impact /
 * dependency / call-path queries, auto-synced) cover different question
 * classes — the agents should pick the right backend without spending a
 * turn discovering what kind of project they're in.
 *
 * Detection (all cheap, sync, one-shot per process):
 *   - Language composition via bounded file scan (extension counts)
 *   - Serena: CLI installed? (.local/bin or uv tools dir)
 *   - CodeGraph: CLI installed? index present in .codegraph/?
 *   - GitNexus (optional): index present in .gitnexus/? stale vs HEAD?
 *
 * Cache-friendly strategy (same pattern as goal / auto-advisor plugins):
 *   - Marker "[PROJECT PROFILE]" present → pure no-op, prompt-cache stays warm.
 *   - First injection (or after compaction) → compute profile once, append.
 *
 * Plugin hooks must NEVER crash the session — everything is wrapped and
 * failures degrade to "no injection".
 */

import { existsSync, readdirSync, statSync, type Dirent } from "node:fs"
import { join, basename } from "node:path"
import { homedir } from "node:os"
import { execSync } from "node:child_process"
import type { Plugin } from "@opencode-ai/plugin"

const MARKER = "[PROJECT PROFILE]"
const MAX_FILES = 20000
const MAX_DEPTH = 8

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".serena", ".gitnexus", ".codegraph", ".idea", ".vscode",
  "dist", "build", "out", "target", "vendor", "coverage", ".next",
  ".nuxt", ".cache", ".turbo", "__pycache__", ".venv", "venv", ".tox",
  "bin", "obj", ".pytest_cache", ".mypy_cache",
])

const EXT_LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust",
  java: "Java", kt: "Kotlin", scala: "Scala",
  cs: "C#", cpp: "C++", cc: "C++", cxx: "C++", c: "C", h: "C/C++", hpp: "C++",
  rb: "Ruby", php: "PHP", swift: "Swift", dart: "Dart",
  vue: "Vue", svelte: "Svelte",
  sql: "SQL", sh: "Shell", ps1: "PowerShell",
}

// Languages with solid LSP support in Serena — its sweet spot.
const LSP_FRIENDLY = new Set([
  "TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "C#", "C",
  "C++", "Ruby", "PHP", "Kotlin",
])

interface ProjectProfile {
  name: string
  fileCount: number
  languages: { lang: string; count: number }[]
  dominant: { lang: string; share: number } | null
  polyglot: boolean
  serenaCli: boolean
  serenaLspFit: boolean
  codegraphCli: boolean
  codegraphIndexed: boolean
  gitnexusIndex: "ready" | "stale" | "missing"
}

function scanLanguages(root: string): { fileCount: number; counts: Map<string, number> } {
  const counts = new Map<string, number>()
  let fileCount = 0
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || fileCount > MAX_FILES) return
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[]
    } catch {
      return
    }
    for (const e of entries) {
      if (fileCount > MAX_FILES) return
      if (e.name.startsWith(".") && e.isDirectory()) continue
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), depth + 1)
      } else if (e.isFile()) {
        const dot = e.name.lastIndexOf(".")
        if (dot <= 0) continue
        const lang = EXT_LANG[e.name.slice(dot + 1).toLowerCase()]
        if (!lang) continue
        fileCount++
        counts.set(lang, (counts.get(lang) ?? 0) + 1)
      }
    }
  }
  walk(root, 0)
  return { fileCount, counts }
}

function serenaCliInstalled(): boolean {
  const home = homedir()
  const candidates = [
    join(home, ".local", "bin", "serena"),
    join(home, ".local", "bin", "serena.exe"),
    join(home, ".local", "bin", "serena.cmd"),
  ]
  if (candidates.some((p) => existsSync(p))) return true
  // uv tool installs also live under the uv tools dir (e.g. D:\dev\uv\tools).
  try {
    const out = execSync("uv tool dir", { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim()
    if (out && existsSync(join(out, "serena-agent"))) return true
  } catch { /* uv not installed — fall through */ }
  return false
}

function codegraphCliInstalled(): boolean {
  try {
    execSync("codegraph version", { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] })
    return true
  } catch { /* not installed or not on PATH */ }
  return false
}

function gitnexusIndexState(root: string): "ready" | "stale" | "missing" {
  const idx = join(root, ".gitnexus")
  if (!existsSync(idx)) return "missing"
  try {
    let indexMtime = 0
    for (const e of readdirSync(idx)) {
      try {
        const m = statSync(join(idx, e)).mtimeMs
        if (m > indexMtime) indexMtime = m
      } catch { /* entry vanished — ignore */ }
    }
    const head = execSync("git log -1 --format=%ct", {
      cwd: root, encoding: "utf8", timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const headSec = parseInt(head, 10)
    if (!Number.isNaN(headSec) && headSec * 1000 > indexMtime) return "stale"
  } catch { /* not a git repo or git unavailable — treat index as ready */ }
  return "ready"
}

/** Build the profile — exported so it can be unit-tested without opencode. */
export function buildProfile(root: string = process.cwd()): ProjectProfile {
  const { fileCount, counts } = scanLanguages(root)
  const languages = [...counts.entries()]
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count)
  const top = languages[0] ?? null
  const dominant = top && fileCount > 0
    ? { lang: top.lang, share: top.count / fileCount }
    : null
  const second = languages[1] ?? null
  const polyglot = fileCount > 0 && !!dominant && dominant.share < 0.6
    && !!second && second.count / fileCount >= 0.15
  return {
    name: basename(root),
    fileCount,
    languages: languages.slice(0, 4),
    dominant,
    polyglot,
    serenaCli: serenaCliInstalled(),
    serenaLspFit: !!dominant && LSP_FRIENDLY.has(dominant.lang),
    codegraphCli: codegraphCliInstalled(),
    codegraphIndexed: existsSync(join(root, ".codegraph")),
    gitnexusIndex: gitnexusIndexState(root),
  }
}

function langSummary(p: ProjectProfile): string {
  if (!p.dominant || p.fileCount === 0) return "no code files detected"
  const pct = Math.round(p.dominant.share * 100)
  if (p.polyglot) {
    return `polyglot — ${p.languages.map((l) => `${l.lang} ${Math.round((l.count / p.fileCount) * 100)}%`).join(", ")} (${p.fileCount} files)`
  }
  return `${p.dominant.lang}-dominant (${pct}% of ${p.fileCount} code files)`
}

function recommendation(p: ProjectProfile): string[] {
  const serena = p.serenaCli
    ? `yes${p.serenaLspFit ? "" : " — no LSP fit for dominant language"}`
    : "CLI not installed"
  const graph = p.codegraphIndexed
    ? "indexed (auto-synced)"
    : p.codegraphCli
      ? "CLI installed, not indexed — run `codegraph init` once (fast; the watcher keeps it fresh after)"
      : "not installed — suggest `npm install -g @colbymchenry/codegraph` + `codegraph init`"

  const pick: string[] = []
  if (p.serenaCli && p.serenaLspFit) {
    pick.push("symbol lookups (definition/references/call chain) → Serena MCP tools")
  }
  if (p.codegraphIndexed) {
    pick.push("impact/blast radius, dependency chains, call paths, architecture → CodeGraph MCP (`codegraph_explore`)")
  } else if (p.gitnexusIndex === "ready") {
    pick.push("impact/flow questions → GitNexus MCP tools (CodeGraph not indexed here)")
  }
  if (pick.length === 0) pick.push("no code-intelligence backend available — grep/glob, one @explorer pass for multi-step workflows")
  return [`- Serena: ${serena} · CodeGraph: ${graph}`, ...pick.map((s) => `  - ${s}`)]
}

/** Compose the injected fragment — exported for testing. */
export function renderProfileBlock(p: ProjectProfile): string {
  const lines = [
    "",
    "---",
    MARKER,
    "",
    `Detected at session start — use it to pick code-intelligence tools without re-discovering the project:`,
    `- Project "${p.name}": ${langSummary(p)}`,
    ...recommendation(p),
    "",
  ]
  return lines.join("\n")
}

let cachedBlock: string | null = null

export const ProjectProfilerPlugin: Plugin = async () => ({
  "experimental.chat.system.transform": async (
    _input: unknown,
    output: { system: string[] },
  ) => {
    try {
      // Fast path: block already present → no-op, prompt-cache stays warm.
      // Match the marker only at line start — plain mentions of the marker
      // text (e.g. inside instructions) must NOT count as an injection.
      if (output.system.some((s) => typeof s === "string" && /\n\[PROJECT PROFILE\]/.test(s))) return

      if (cachedBlock === null) cachedBlock = renderProfileBlock(buildProfile())
      const fragment = `\n${cachedBlock}`
      for (let i = 0; i < output.system.length; i++) {
        const s = output.system[i]
        if (typeof s !== "string") continue
        output.system[i] = s + fragment
      }
    } catch {
      // Never crash the session — degrade to no injection.
    }
  },
})
