/**
 * Backend bootstrap for `/project init` and `/project index`.
 *
 * Semantics — first-time initialization vs index rebuild:
 *   /project init  → scaffold files + every FIRST-TIME init step, but only
 *                    when the backend's CLI is installed:
 *                      `codegraph init`    (one-time; watcher keeps it fresh)
 *                      `gitnexus analyze`  (initial build when the index is
 *                                          missing entirely)
 *   /project index → manual rebuild/refresh, only for indexes that already
 *                    exist (a first index is init's job):
 *                      `codegraph sync`    incremental catch-up for changes
 *                                          made while the watcher wasn't
 *                                          running (full `codegraph index`
 *                                          rebuild stays a manual escape hatch)
 *                      `gitnexus analyze`  only when the index is STALE
 *
 * Gate (same AND-rule as project-profiler): a backend is touched only when
 * mcp.<name>.enabled in the installed opencode.jsonc is not false AND its
 * CLI is on PATH. A CLI present but disabled in config is never run; a
 * missing CLI is reported as skipped — never invoked, never errors.
 *
 * Serena needs no index step (live LSP) and is not handled here.
 */

import { execSync, spawn } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// ─── Probes ──────────────────────────────────────────────────────────

/** Parse mcp.<name>.enabled out of opencode.jsonc text — same JSONC subset
 * rule as project-profiler: strip whole-line // comments, then read the real
 * object (a regex can't cross nested braces like gitnexus's `env` block).
 * Missing entry or unparseable text → true (assume enabled). */
export function mcpEnabledFrom(text: string, name: string): boolean {
  try {
    const json = text.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
    const obj = JSON.parse(json) as { mcp?: Record<string, { enabled?: boolean }> }
    const flag = obj.mcp?.[name]?.enabled
    return flag !== false
  } catch { /* unparseable — assume enabled */ return true }
}

/** mcp.<name>.enabled from the installed opencode.jsonc. Degrades to true
 * when the config is missing/unreadable. */
function mcpEnabled(name: string): boolean {
  try {
    const cfg = join(homedir(), ".config", "opencode", "opencode.jsonc")
    return mcpEnabledFrom(readFileSync(cfg, "utf8"), name)
  } catch { /* no config — assume enabled */ return true }
}

function codegraphCliInstalled(): boolean {
  try {
    // `--version` — the CLI has no `version` subcommand (commander rejects it).
    execSync("codegraph --version", { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] })
    return true
  } catch { /* not installed or not on PATH */ }
  return false
}

function gitnexusCliInstalled(): boolean {
  try {
    execSync("gitnexus --version", { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] })
    return true
  } catch { /* not installed or not on PATH */ }
  return false
}

/** Index state of .gitnexus/ vs HEAD — same staleness rule as the profiler:
 * any HEAD commit newer than the newest index file marks the index stale. */
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

export interface BackendProbe {
  codegraphEnabled: boolean
  codegraphCli: boolean
  codegraphIndexed: boolean
  gitnexusEnabled: boolean
  gitnexusCli: boolean
  gitnexusIndex: "ready" | "stale" | "missing"
}

/** Probe both backends for the given project root (sync, cheap). */
export function probeBackends(root: string): BackendProbe {
  const cgEnabled = mcpEnabled("codegraph")
  const gnEnabled = mcpEnabled("gitnexus")
  return {
    codegraphEnabled: cgEnabled,
    codegraphCli: cgEnabled && codegraphCliInstalled(),
    codegraphIndexed: cgEnabled && existsSync(join(root, ".codegraph")),
    gitnexusEnabled: gnEnabled,
    gitnexusCli: gnEnabled && gitnexusCliInstalled(),
    gitnexusIndex: gnEnabled ? gitnexusIndexState(root) : "missing",
  }
}

// ─── Planner (pure — unit-tested) ────────────────────────────────────

export type BackendKind = "codegraph" | "gitnexus"

export interface BackendPlan {
  backend: BackendKind
  /** Command to run in the project root; null → nothing to run. */
  command: string | null
  /** User-visible explanation of the decision. */
  note: string
}

/** First-time init steps for `/project init` — one plan per backend.
 * codegraph: its own one-time init when not indexed yet.
 * gitnexus: the initial index build ONLY when the index is missing entirely
 * (a stale index is a rebuild, handled by `/project index`). */
export function planInitBackends(p: BackendProbe): BackendPlan[] {
  const codegraph: BackendPlan = !p.codegraphEnabled
    ? { backend: "codegraph", command: null, note: "disabled in options.jsonc" }
    : !p.codegraphCli
      ? { backend: "codegraph", command: null, note: "CLI not installed" }
      : p.codegraphIndexed
        ? { backend: "codegraph", command: null, note: "already indexed" }
        : { backend: "codegraph", command: "codegraph init", note: "one-time init; watcher keeps it fresh after" }

  const gitnexus: BackendPlan = !p.gitnexusEnabled
    ? { backend: "gitnexus", command: null, note: "disabled in options.jsonc" }
    : !p.gitnexusCli
      ? { backend: "gitnexus", command: null, note: "CLI not installed" }
      : p.gitnexusIndex !== "missing"
        ? { backend: "gitnexus", command: null, note: p.gitnexusIndex === "ready" ? "already indexed" : "stale — rebuild via /project index" }
        : { backend: "gitnexus", command: "gitnexus analyze", note: "initial index build" }

  return [codegraph, gitnexus]
}

/** Rebuild/refresh for `/project index` — only EXISTING indexes are touched
 * here; creating a first index is an init step, not a rebuild.
 * codegraph: `codegraph sync` — incremental catch-up for changes made while
 * the watcher wasn't running (cheap no-op when nothing drifted). The slow
 * full rebuild (`codegraph index`) stays a manual escape hatch.
 * gitnexus: rebuilt only when stale. */
export function planIndexBackends(p: BackendProbe): BackendPlan[] {
  const codegraph: BackendPlan = !p.codegraphEnabled
    ? { backend: "codegraph", command: null, note: "disabled in options.jsonc" }
    : !p.codegraphCli
      ? { backend: "codegraph", command: null, note: "CLI not installed" }
      : !p.codegraphIndexed
        ? { backend: "codegraph", command: null, note: "no index yet — that's an init step, run /project init" }
        : { backend: "codegraph", command: "codegraph sync", note: "incremental catch-up (watcher covers live saves)" }

  const gitnexus: BackendPlan = !p.gitnexusEnabled
    ? { backend: "gitnexus", command: null, note: "disabled in options.jsonc" }
    : !p.gitnexusCli
      ? { backend: "gitnexus", command: null, note: "CLI not installed" }
      : p.gitnexusIndex === "missing"
        ? { backend: "gitnexus", command: null, note: "no index yet — that's an init step, run /project init" }
        : p.gitnexusIndex === "ready"
          ? { backend: "gitnexus", command: null, note: "index up to date" }
          : { backend: "gitnexus", command: "gitnexus analyze", note: "rebuilding stale index" }

  return [codegraph, gitnexus]
}

// ─── Executor ────────────────────────────────────────────────────────

export type BackendStatus = "ran" | "skipped" | "failed"

export interface BackendResult {
  backend: BackendKind
  status: BackendStatus
  detail: string
}

/** Run the planned backend commands in the project root (async, sequential,
 * never throws). shell:true so npm-global .cmd shims resolve on Windows. */
export function runBackends(plans: BackendPlan[], root: string): Promise<BackendResult[]> {
  return plans.reduce(
    (chain, plan) => chain.then((acc) => runBackend(plan, root).then((r) => [...acc, r])),
    Promise.resolve([] as BackendResult[]),
  )
}

/** Run one planned backend command (async, never throws). */
function runBackend(plan: BackendPlan, root: string): Promise<BackendResult> {
  if (!plan.command) {
    return Promise.resolve({ backend: plan.backend, status: "skipped", detail: plan.note })
  }
  const [cmd, ...args] = plan.command.split(" ")
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, shell: true, stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (d) => (stderr += String(d)))
    child.on("error", (e) => resolve({ backend: plan.backend, status: "failed", detail: String(e) }))
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ backend: plan.backend, status: "ran", detail: `${plan.command} done` })
      } else {
        const firstErr = stderr.trim().split("\n")[0]
        resolve({
          backend: plan.backend,
          status: "failed",
          detail: `${plan.command} exited ${code}${firstErr ? ` — ${firstErr}` : ""}`,
        })
      }
    })
  })
}
