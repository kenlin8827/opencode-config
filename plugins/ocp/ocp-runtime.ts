/**
 * ocp-runtime.ts — locate the `ocp` CLI and run its subcommands.
 *
 * Resolution order (best-effort, platform-aware):
 *   1. Repo-local dispatcher: walk up from process.cwd() until a directory
 *      containing install/VERSION is found, then use bin/opencode-prime(.ps1).
 *   2. Global shim: the `ocp` executable on PATH (installed by
 *      `ocp register` into ~/.local/bin).
 */

import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const IS_WINDOWS = process.platform === "win32"

/** Per-subcommand timeouts; `upgrade` downloads and rewrites many files. */
const SUBCOMMAND_TIMEOUT_MS: Record<string, number> = {
  version: 15_000,
  status: 60_000,
  update: 60_000,
  upgrade: 600_000,
}

/** The CLI can be chatty during forced reinstalls; allow a large buffer. */
const MAX_BUFFER_BYTES = 16 * 1024 * 1024

/** Walk up from `start` until a directory containing install/VERSION is found. */
export function findRepoRoot(start: string): string | null {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, "install", "VERSION"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Fast path: read the repo version straight from install/VERSION. */
export function readRepoVersion(repoRoot: string): string | null {
  try {
    return readFileSync(join(repoRoot, "install", "VERSION"), "utf-8").trim()
  } catch {
    return null
  }
}

interface RunResult {
  ok: boolean
  output: string
}

/**
 * Spawn one subcommand of the OCP CLI and return its combined output.
 * Throws only when no CLI could be located at all.
 */
export async function runOcpSubcommand(subcommand: string): Promise<RunResult> {
  const timeoutMs = SUBCOMMAND_TIMEOUT_MS[subcommand] ?? 120_000

  const attempts: Array<{ file: string; args: string[] }> = []

  const repoRoot = findRepoRoot(process.cwd())
  if (repoRoot) {
    if (IS_WINDOWS) {
      attempts.push({
        file: "pwsh",
        args: ["-NoProfile", "-File", join(repoRoot, "bin", "opencode-prime.ps1"), subcommand],
      })
    } else {
      attempts.push({
        file: "/usr/bin/env",
        args: ["bash", join(repoRoot, "bin", "opencode-prime"), subcommand],
      })
    }
  }
  // Fallback: global shim registered by `ocp register`.
  attempts.push({ file: "ocp", args: [subcommand] })

  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const { stdout, stderr } = await execFileAsync(attempt.file, attempt.args, {
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER_BYTES,
        windowsHide: true,
        shell: IS_WINDOWS && attempt.file === "ocp",
      })
      const output = [stdout, stderr].filter((s) => s?.trim()).join("\n").trimEnd()
      return { ok: true, output }
    } catch (err: any) {
      // ENOENT → binary not found, try the next resolution strategy.
      if (err?.code === "ENOENT") {
        lastError = err
        continue
      }
      // Non-zero exit or timeout: surface whatever output we captured.
      const output = [err?.stdout, err?.stderr]
        .filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
        .join("\n")
        .trimEnd()
      const detail = output || err?.message || String(err)
      return { ok: false, output: detail }
    }
  }

  throw new Error(
    "[ocp] Could not locate the OCP CLI. Either open OpenCode inside the opencode-prime repo, or run `ocp register` to install the global shim.",
  )
}
