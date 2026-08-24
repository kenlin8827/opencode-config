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
 * Detection (config-driven, zero process spawning — probing CLIs with
 * execSync at session start was a real latency source, especially cold on
 * Windows):
 *   - Language composition via bounded file scan (extension counts)
 *   - Backend availability = mcp.<name>.enabled in the installed
 *     opencode.jsonc. That flag is the source of truth: enabled → opencode
 *     itself loads the MCP server (and surfaces any launch error); the
 *     profiler must not re-validate what the runtime already enforces.
 *   - Plus two sub-ms existsSync signals: .codegraph/ (indexed?) and
 *     .gitnexus/ (present?) — they steer the status text, never spawn.
 *
 * Cache-friendly strategy (same pattern as goal / auto-advisor plugins):
 *   - Marker "[PROJECT PROFILE]" present → pure no-op, prompt-cache stays warm.
 *   - First injection (or after compaction) → compute profile once, append.
 *
 * Weight reinforcement: system-prompt guidance decays over long sessions, so
 * `experimental.chat.messages.transform` appends a one-line reminder to the
 * latest user message every REMIND_EVERY messages (~8 user turns) — the
 * recency position carries the highest attention weight. A WeakSet on the
 * message objects plus an inline marker keep the reminder single-shot even
 * if the transform fires repeatedly for one turn; no backend → never fires.
 *
 * Plugin hooks must NEVER crash the session — everything is wrapped and
 * failures degrade to "no injection".
 */

import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs"
import { join, basename } from "node:path"
import { homedir } from "node:os"
import type { Plugin } from "@opencode-ai/plugin"

const MARKER = "[PROJECT PROFILE]"
const REMIND_EVERY = 16
const REMIND_MARKER = "[PROFILE REMINDER]"
const REMINDER = `${REMIND_MARKER} Session profile standing rule: query the available code-intelligence backend FIRST (one graph/symbol call) before any grep/read loop; you MUST NOT crawl files for structure the index already knows.`
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
  serenaActive: boolean
  serenaLspFit: boolean
  codegraphActive: boolean
  codegraphIndexed: boolean
  gitnexusIndexed: boolean
  dbhubActive: boolean
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

/** Parse mcp.<name>.enabled out of opencode.jsonc text — exported so it can
 * be unit-tested. Strips whole-line // comments (the JSONC subset the config
 * uses), then reads the real object: a regex can't cross nested braces like
 * gitnexus's `env` block that sits before its `enabled` flag. Missing entry
 * or unparseable text → true (assume enabled). */
export function mcpEnabledFrom(text: string, name: string): boolean {
  try {
    const json = text.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
    const obj = JSON.parse(json) as { mcp?: Record<string, { enabled?: boolean }> }
    const flag = obj.mcp?.[name]?.enabled
    return flag !== false
  } catch { /* unparseable — assume enabled */ return true }
}

/** mcp.<name>.enabled from the installed opencode.jsonc — the single source
 * of truth for backend availability (enabled → opencode loads the MCP server
 * itself). Degrades to true when the config is missing/unreadable. */
function mcpEnabled(name: string): boolean {
  try {
    const cfg = join(homedir(), ".config", "opencode", "opencode.jsonc")
    return mcpEnabledFrom(readFileSync(cfg, "utf8"), name)
  } catch { /* no config — assume enabled */ return true }
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
    serenaActive: mcpEnabled("serena"),
    serenaLspFit: !!dominant && LSP_FRIENDLY.has(dominant.lang),
    codegraphActive: mcpEnabled("codegraph"),
    codegraphIndexed: existsSync(join(root, ".codegraph")) && mcpEnabled("codegraph"),
    gitnexusIndexed: existsSync(join(root, ".gitnexus")) && mcpEnabled("gitnexus"),
    dbhubActive: mcpEnabled("dbhub"),
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
  const serena = p.serenaActive
    ? "yes" + (p.serenaLspFit ? "" : " — no LSP fit for dominant language")
    : "disabled in options.jsonc"
  const graph = p.codegraphIndexed
    ? "indexed (auto-synced)"
    : p.codegraphActive
      ? "enabled, not indexed — run `codegraph init` once (fast; the watcher keeps it fresh after)"
      : "disabled in options.jsonc"

  // Each ENABLED backend gets its own capability card stating what it is best
  // at — the model picks per question. Preferences are soft tie-breakers for
  // asymmetries the model cannot infer (payload cost, index freshness).
  const cards: string[] = []
  if (p.serenaActive && p.serenaLspFit) {
    cards.push("Serena MCP tools (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`) — live LSP, always current. Symbol-level lookups: definitions, references, file outlines. Minimal payload, returns only what's asked")
  }
  if (p.codegraphIndexed) {
    cards.push("CodeGraph MCP (`codegraph_explore`) — pre-built knowledge graph, auto-synced. Structural understanding: \"how does X work\", flows / call paths (incl. dynamic dispatch), impact / blast radius, dependency chains, area surveys. One call returns the relevant symbols' source + call paths + blast radius — name the file/symbol in the query; honor the ⚠️ staleness banner")
  }
  if (p.gitnexusIndexed) {
    cards.push("GitNexus MCP tools — deep graph analysis: arbitrary Cypher, precomputed clusters/processes, API-impact, cross-repo (group) questions; impact/flow queries also available. Re-index (`gitnexus analyze`) after big changes")
  }
  const prefs: string[] = []
  if (p.serenaActive && p.serenaLspFit && p.codegraphIndexed) {
    prefs.push("pure single-hop symbol lookup → SHOULD use Serena (minimal payload); CodeGraph's dense response stays resident in context")
  }
  if (p.codegraphIndexed && p.gitnexusIndexed) {
    prefs.push("everyday flow/impact questions → SHOULD use CodeGraph (auto-synced, never stale); GitNexus for Cypher / clusters / API-impact / cross-repo")
  }
  if (p.codegraphIndexed || p.gitnexusIndexed) {
    prefs.push("graph queries return dense payloads — SHOULD keep them focused, one query per question")
  }
  if (cards.length === 0) cards.push("no code-intelligence backend available — grep/glob, then targeted file reads; one @explorer pass for multi-step workflows")
  const lines = [`- Serena: ${serena} · CodeGraph: ${graph}`,
    "Available backends — pick per question:", ...cards.map((s) => `  - ${s}`)]
  if (prefs.length > 0) lines.push("Preferences when several fit:", ...prefs.map((s) => `  - ${s}`))
  return lines
}

/** Universal context-efficiency rules — injected with the profile so they
 * travel with the backend routing (no static instructions file). */
function rules(p: ProjectProfile): string[] {
  const dbhub = p.dbhubActive
    ? ["- dbhub MCP available: MUST call `search_objects` to discover real table/column names BEFORE `execute_sql` — never guess; on a \"does not exist\" error re-discover instead of retrying another guessed name."]
    : []
  return [
    "Rules:",
    "- Read files only for semantic understanding (intent, conventions, \"why is this built this way\") — or for files changed since the dispatch context was written.",
    "- MUST NOT read a whole file to locate a symbol — use a symbol index when one is available; grep/glob only when no backend covers the question.",
    "- Treat code-intelligence output as already read — no grep re-verification, no re-reading returned code.",
    "- If the dispatch includes a `Files changed` list (typical for `qa`, `code-review`, `security` follow-ups), read ONLY those files plus missing gaps — no full re-exploration.",
    ...dbhub,
  ]
}

/** Compose the injected fragment — exported for testing. */
export function renderProfileBlock(p: ProjectProfile): string {
  const lines = [
    "",
    "---",
    MARKER,
    "",
    `Detected at session start — MUST query the code-intelligence index before crawling code files: every file read costs tokens, so answer structural questions from the backends below directly instead of grep/read loops (applies to primary agents coding alone exactly as to subagents):`,
    `- Project "${p.name}": ${langSummary(p)}`,
    ...recommendation(p),
    ...rules(p),
    "",
  ]
  return lines.join("\n")
}

let cachedBlock: string | null = null
let cachedProfile: ProjectProfile | null = null

/** Profile + rendered block computed once per process (file scans are not
 * free) — exported pieces reused by both transform hooks. */
function profile(): ProjectProfile {
  if (cachedProfile === null) cachedProfile = buildProfile()
  return cachedProfile
}
function block(): string {
  if (cachedBlock === null) cachedBlock = renderProfileBlock(profile())
  return cachedBlock
}

/** Exported for testing — true when at least one backend is usable. */
export function hasBackend(p: ProjectProfile): boolean {
  return (p.serenaActive && p.serenaLspFit) || p.codegraphIndexed || p.gitnexusIndexed
}

// Messages already reminded — identity-based, so the transform stays
// single-shot per message even when it fires repeatedly for one turn.
const reminded = new WeakSet<object>()

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
      // Append to the LAST string entry only — with multiple entries the old
      // loop duplicated the block within a single pass (the marker check only
      // guards the next call, not this one).
      for (let i = output.system.length - 1; i >= 0; i--) {
        const s = output.system[i]
        if (typeof s !== "string") continue
        output.system[i] = s + fragment
        break
      }
    } catch {
      // Never crash the session — degrade to no injection.
    }
  },

  // Long-session attention decay: re-assert the query-first discipline at
  // the recency position (latest user message) every ~8 user turns.
  "experimental.chat.messages.transform": async (
    _input: unknown,
    output: { messages: { info: { role?: string }; parts: unknown[] }[] },
  ) => {
    try {
      const msgs = output.messages
      if (!Array.isArray(msgs) || msgs.length < REMIND_EVERY) return
      if (msgs.length % REMIND_EVERY !== 0) return

      if (!hasBackend(profile())) return
      block() // keep cachedBlock warm alongside the profile

      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].info?.role !== "user") continue
        if (reminded.has(msgs[i].info)) return
        const text = (msgs[i].parts as { type?: string; text?: string }[])
          .filter((pt) => pt?.type === "text" && typeof pt.text === "string")
          .map((pt) => pt.text)
          .join("\n")
        if (text.includes(REMIND_MARKER)) return
        reminded.add(msgs[i].info)
        msgs[i].parts.push({ type: "text", text: `\n\n${REMINDER}` })
        return
      }
    } catch {
      // Never crash the session — degrade to no reminder.
    }
  },
})
