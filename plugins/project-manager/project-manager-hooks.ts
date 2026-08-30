/**
 * Git hook registration for `/project init`.
 *
 * Scope: only GitNexus auto-refresh hooks. Registered only when the gitnexus
 * MCP is enabled AND its CLI is installed. A managed block inside each hook
 * file lets us update idempotently without overwriting user content.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { BackendProbe } from "./project-manager-index"

export interface HookResult {
  hook: string
  status: "registered" | "updated" | "skipped" | "failed"
  detail: string
}

const HOOKS = ["post-commit", "post-merge", "post-checkout"] as const

const START_MARKER = "# >>> OCP-gitnexus-update-hook (managed by /project init; do not edit this block) >>>"
const END_MARKER = "# <<< OCP-gitnexus-update-hook <<<"

/** Build the shell block that refreshes the GitNexus index. */
function hookBlock(): string {
  return `${START_MARKER}
# Auto-refresh GitNexus index after git operations.
# Runs only when the gitnexus CLI is on PATH; skips silently otherwise.
if command -v gitnexus >/dev/null 2>&1; then
  gitnexus analyze
fi
${END_MARKER}
`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Remove the managed block from hook content by line, preserving user code. */
function stripManagedBlock(content: string): string {
  const lines = content.split("\n")
  const out: string[] = []
  let inBlock = false
  for (const line of lines) {
    if (line === START_MARKER) {
      inBlock = true
      continue
    }
    if (line === END_MARKER) {
      inBlock = false
      continue
    }
    if (!inBlock) out.push(line)
  }
  // Collapse trailing blank runs left by the removed block.
  while (out.length > 1 && out[out.length - 1] === "" && out[out.length - 2] === "") {
    out.pop()
  }
  return out.join("\n")
}

/** Ensure a hook file carries the managed block; never remove user content. */
function ensureHook(hookPath: string, name: string): HookResult {
  const block = hookBlock()
  try {
    if (!existsSync(hookPath)) {
      writeFileSync(hookPath, `#!/bin/sh\n\n${block}`, "utf-8")
      chmodSync(hookPath, 0o755)
      return { hook: name, status: "registered", detail: "created hook" }
    }

    const content = readFileSync(hookPath, "utf-8")
    if (content.includes(START_MARKER)) {
      const pattern = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\n?`)
      const updated = content.replace(pattern, block)
      if (updated === content) {
        return { hook: name, status: "skipped", detail: "already up to date" }
      }
      writeFileSync(hookPath, updated, "utf-8")
      chmodSync(hookPath, 0o755)
      return { hook: name, status: "updated", detail: "refreshed managed block" }
    }

    const sep = content.endsWith("\n") ? "" : "\n"
    writeFileSync(hookPath, `${content}${sep}\n${block}`, "utf-8")
    chmodSync(hookPath, 0o755)
    return { hook: name, status: "updated", detail: "appended managed block" }
  } catch (e) {
    return { hook: name, status: "failed", detail: String(e) }
  }
}

/** Remove the managed block from a single hook file. */
function removeHook(hookPath: string, name: string, reason: string): HookResult {
  try {
    if (!existsSync(hookPath)) {
      return { hook: name, status: "skipped", detail: reason }
    }
    const content = readFileSync(hookPath, "utf-8")
    if (!content.includes(START_MARKER)) {
      return { hook: name, status: "skipped", detail: reason }
    }
    const updated = stripManagedBlock(content)
    if (updated.trim() === "" || updated.trim() === "#!/bin/sh") {
      // The file only contained our block (or shebang + block); delete it.
      rmSync(hookPath, { force: true })
      return { hook: name, status: "updated", detail: "removed hook (gitnexus no longer active)" }
    }
    writeFileSync(hookPath, updated + "\n", "utf-8")
    chmodSync(hookPath, 0o755)
    return { hook: name, status: "updated", detail: "removed managed block (gitnexus no longer active)" }
  } catch (e) {
    return { hook: name, status: "failed", detail: String(e) }
  }
}

/** Sync GitNexus auto-refresh hooks:
 *  - Register/update when gitnexus is enabled, its CLI is installed, and root is a git repo.
 *  - Remove any previously registered managed block when gitnexus is disabled or missing.
 */
export function registerGitnexusHooks(root: string, probe: BackendProbe): HookResult[] {
  if (!existsSync(join(root, ".git"))) {
    return [{ hook: "gitnexus-hooks", status: "skipped", detail: "not a git repository" }]
  }

  const hooksDir = join(root, ".git", "hooks")

  if (!probe.gitnexusEnabled || !probe.gitnexusCli) {
    const reason = !probe.gitnexusEnabled
      ? "gitnexus disabled in options.jsonc"
      : "gitnexus CLI not installed"
    if (!existsSync(hooksDir)) {
      return [{ hook: "gitnexus-hooks", status: "skipped", detail: reason }]
    }
    return HOOKS.map((name) => removeHook(join(hooksDir, name), name, reason))
  }

  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true })
  return HOOKS.map((name) => ensureHook(join(hooksDir, name), name))
}
