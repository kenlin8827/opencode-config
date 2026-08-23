/**
 * Hook: experimental.chat.system.transform — progressive-disclosure pointer
 * to the project's commit convention (docs/git-commits.md).
 *
 * Token policy: the convention FILE is never injected into context. Only a
 * compact pointer (~50 tokens) is injected while the file exists, telling
 * the agent where the convention lives and to read it before committing.
 * The full document is loaded on demand (one read per commit), and the
 * mechanical gate in project-manager-tool-guard.ts backstops any commit
 * made without reading it — so progressive disclosure carries no
 * compliance risk here.
 *
 * Cache-friendly strategy (same as adr-guard):
 *   - file present + line-start marker already there → complete no-op,
 *     prompt-cache warm.
 *   - file present + marker absent → append the pointer fragment.
 *   - file absent + marker present → strip the block (file deleted
 *     mid-session).
 *   - file absent + marker absent → complete no-op.
 *
 * The fragment is appended to the LAST system string entry only — appending
 * to every entry would duplicate it across multi-entry system prompts
 * (same fix as project-profiler).
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { GIT_COMMITS_REL, hasConventionFile } from "./project-manager-config"

export const MARKER = "[PROJECT COMMIT CONVENTION]"

// Line-start marker check — avoids false positives from inline mentions of
// the marker text elsewhere in the prompt (same as project-profiler).
const MARKER_RE = /\n\[PROJECT COMMIT CONVENTION\]/

/**
 * Pointer fragment appended to the system prompt. Progressive disclosure:
 * names the file, defers reading it to commit time, and warns that the
 * structural rules are mechanically enforced. stripMarker() trims trailing
 * whitespace after cutting at the marker, so the leading \n\n separator
 * restores to a semantically identical prompt (same contract as adr-guard).
 */
function buildFragment(): string {
  return (
    `\n\n${MARKER}\n\n` +
    `This project defines a commit convention in ${GIT_COMMITS_REL} (progressive ` +
    `disclosure — the document is NOT in your context). Before ANY git commit: read ` +
    `${GIT_COMMITS_REL} and follow it. Structural rules are mechanically enforced ` +
    `(first line "type(scope): summary", known type, ≤ 72 chars) — non-conforming ` +
    `commits are blocked.\n`
  )
}

// ─── System prompt helpers ───────────────────────────────────────────

function hasMarker(system: string[]): boolean {
  return system.some((s) => typeof s === "string" && MARKER_RE.test(s))
}

function stripMarker(system: string[]): boolean {
  let changed = false
  for (let i = 0; i < system.length; i++) {
    const s = system[i]
    if (typeof s !== "string") continue
    // Cut at the same line-start position the dedup check (MARKER_RE) uses.
    const m = s.match(MARKER_RE)
    if (!m || m.index === undefined) continue
    // Trim the separator whitespace that preceded the marker so the
    // original prompt restores without leftover blank space.
    system[i] = s.substring(0, m.index).replace(/\s+$/, "")
    changed = true
  }
  return changed
}

/** Append the fragment to the LAST string entry only. */
function appendFragment(system: string[], fragment: string): boolean {
  for (let i = system.length - 1; i >= 0; i--) {
    const s = system[i]
    if (typeof s !== "string") continue
    system[i] = s + fragment
    return true
  }
  return false
}

export function makeSystemHook(client: PluginInput["client"]) {
  const log = (level: "info" | "warn", message: string) =>
    client.app.log({ body: { service: "project-manager", level, message } })

  return async (_input: unknown, output: { system: string[] }) => {
    if (!hasConventionFile()) {
      // No convention file — make sure no stale block lingers in the prompt.
      if (hasMarker(output.system)) {
        stripMarker(output.system)
        await log("info", "system prompt: stale commit-convention block stripped (file missing)")
      }
      return
    }

    // Fast path: pointer already present → don't touch anything.
    // Keeps the prompt-cache warm.
    if (hasMarker(output.system)) return

    // Slow path: inject the pointer for this generation step.
    const changed = appendFragment(output.system, buildFragment())
    if (changed) await log("info", "system prompt: commit-convention pointer injected (progressive disclosure)")
  }
}
