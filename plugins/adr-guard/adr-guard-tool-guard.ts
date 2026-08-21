/**
 * Hook: tool.execute.before — the iron-law gate.
 *
 * Intercepts bash/shell tool calls that run `git commit`. When ALL of the
 * following hold, the commit is blocked with an actionable error:
 *
 *   1. The iron law is on for this project (project-level switch).
 *   2. The command contains at least one `git commit` invocation that is
 *      not `--amend` — chained commits are each judged independently, so an
 *      earlier `--amend` never exempts a later fresh commit.
 *   3. One of those invocations carries an inline commit message
 *      (-m / --message) whose conventional-commit type is feat or refactor
 *      (scoped/breaking variants included).
 *   4. No file under the ADR directory (default docs/adr/) appears in the
 *      working-tree change set (staged, unstaged, or untracked).
 *
 * Fail-open decisions (never block on ambiguity):
 *   - No inline message (editor/heredoc commit) → allow; the system-prompt
 *     protocol still instructs the agent to include an ADR.
 *   - Non-feat/refactor type (fix, docs, chore, …) → allow.
 *   - git status errors (not a repo, binary missing) → allow.
 *
 * NOT wrapped in safeHook — throws are the blocking mechanism and must
 * propagate. All predicates are null-safe, so unexpected errors are
 * unlikely.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getAdrDir, getProjectDir, isEnabled } from "./adr-guard-config"
import {
  commitMessageOfSegment,
  extractBashCommand,
  gitCommitSegments,
  hasAdrChanges,
  makeLogger,
  requiresAdr,
} from "./adr-guard-runtime"

type Log = ReturnType<typeof makeLogger>

function blockMessage(adrDir: string): string {
  return (
    `[ADR-GUARD] Blocked: feat/refactor commit without an ADR change.\n` +
    `This project enforces the ADR iron law (MADR convention). ` +
    `Every feat/refactor commit MUST include a new or updated ADR.\n` +
    `Fix before re-running the commit:\n` +
    `1. New decision → create ${adrDir}/NNNN-slug.md (next sequential number) ` +
    `from the MADR template: frontmatter status: accepted, date: <today>, ` +
    `then "## Context and Problem Statement" + "## Decision Outcome".\n` +
    `   Changed decision → write a NEW ADR and set the old one's frontmatter ` +
    `status to "superseded by NNNN".\n` +
    `2. Stage the ADR file (git add ${adrDir}/...) so it ships in the SAME commit.\n` +
    `3. Update ${adrDir}/INDEX.md (flat list by number).\n` +
    `Never bypass by relabeling the commit type.`
  )
}

export function makeToolGuardHook(client: PluginInput["client"]) {
  const log: Log = makeLogger(client, "adr-guard")

  // NOT wrapped in safeHook — intentional throws must propagate to block
  // tool execution. safeHook would swallow them and defeat the guard.
  return async (input: { tool?: string }, output: { args?: unknown }) => {
    if (!isEnabled()) return

    const tool = String(input?.tool ?? "").toLowerCase()
    if (tool !== "bash" && tool !== "shell") return

    const command = extractBashCommand(output?.args)
    if (!command) return

    // One argument-token segment per `git commit` invocation — chained
    // commits are judged independently.
    const segments = gitCommitSegments(command)
    if (segments.length === 0) return

    // --amend re-commits are exempt, but ONLY for their own invocation:
    // `git commit --amend && git commit -m "feat: x"` still gates the latter.
    const candidates = segments.filter((seg) => !seg.includes("--amend"))
    if (candidates.length === 0) return

    const messages = candidates.map(commitMessageOfSegment)
    const gated = messages.find((m) => m !== null && requiresAdr(m))
    if (!gated) {
      if (messages.every((m) => m === null)) {
        // Editor/heredoc commit — type unknown, fail open (protocol still applies).
        await log("info", "git commit without inline message — not gated")
      }
      return
    }

    const projectDir = getProjectDir()
    const adrDir = getAdrDir()
    if (hasAdrChanges(projectDir, adrDir)) return

    await log(
      "warn",
      `blocked feat/refactor commit — no ADR change under ${adrDir}/: "${gated.split(/\r?\n/)[0]}"`,
    )
    throw new Error(blockMessage(adrDir))
  }
}
