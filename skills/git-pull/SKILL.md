---
name: git-pull
description: Sync the CURRENT branch with its upstream — try `git pull --ff-only` first; if diverged, guard-backup the branch, then reconcile via the git-merge protocol (source = `@{u}`, the actual upstream ref, target = local branch). `--rebase` replays local commits onto remote instead. Load ONLY when the user invokes /git-pull.
---

# Git Pull Protocol (ff-first, guard, then reconcile)

You sync the **current branch** with its upstream. Fast-forward whenever possible — it rewrites nothing. Only when the branch has diverged do you guard-backup and reconcile, delegated to the self-contained `git-merge` / `git-rebase` skill. In merge mode, stock git keeps the checked-out local branch as `ours`/the merge baseline and layers fetched upstream changes into it. Under `--rebase`, the remote's published history is the onto baseline and local commits replay on top. Never describe these two orientations as identical.

**No `--squash`**: pulling squashes your own branch's published remote history into one commit — that rewrites shared history, never legitimate.

## Audit trail — every invocation

After the inside-repository check succeeds and **before fetch/pull or any other mutation**, create `operation-id = git-pull-<UTC>-<short-head>-<random>` and initialize `.git/ocp-pull-reports/<operation-id>.jsonl`; buffer and flush the repository-check event. Trace creation in `.git/` is the only audit side effect allowed by `--dry-run`. Failure to create it halts before mutation; later write failure pauses safely without automatic abort.

Append and flush `command_start` before every git command and a linked `command_end` immediately afterward; a missing end records interruption. Every event includes `schema_version: 1`, `operation_id`, `seq`, UTC `ts`, `event`, `phase`, redacted `argv` array, `cwd_repo_relative`, `prev_event_sha256`, and `event_sha256` over canonical JSON excluding that field. Start events include refs/SHAs before; end events link `command_seq` and include `exit_code`, `duration_ms`, refs/SHAs after, redacted/truncated stdout/stderr, and streaming SHA-256 of each full stream. Other state/verification/recovery events use the same hash chain; record its final event hash in the Markdown summary. The chain detects truncation/accidental changes, not malicious rewriting. Never persist environment variables, credentials, Authorization, URL userinfo/tokens, private keys, or raw conflicted-file contents; redact argv/output, cap excerpts at 4 KiB, and use restrictive permissions where supported. On delegated reconciliation, create a child operation ID, record parent/child links in both traces, and retain child audit paths. Finalize sibling `<operation-id>.md` on every exit path, carrying the same `Outcome:` token as the report.

## Step 1 — Preflight

**Checks** — all must pass; never auto-stash/reset on failure, the user fixes or opts in:

| Check | Command | Fail |
|---|---|---|
| Inside a git repo | `git rev-parse --is-inside-work-tree` | Halt |
| Not detached HEAD | `git symbolic-ref HEAD` succeeds | Halt — no branch to sync |
| Worktree clean | `git status --porcelain --untracked-files=no` empty | Halt — refuse to pull dirty |
| Upstream configured | `git rev-parse --abbrev-ref @{u}` | Halt — suggest `git branch --set-upstream-to` |
| No in-progress op | `MERGE_HEAD`/`CHERRY_PICK_HEAD` absent and `.git/rebase-merge`/`.git/rebase-apply` absent | Halt — offer the matching command's `--continue` (resume) or `--abort` (clear); never silently discard the prior op |
| No stale lock | `.git/index.lock` absent | Halt; confirm no git process is active before removing a stale lock |

## Step 2 — Fetch & try fast-forward

1. **Fetch the upstream remote** — resolve it from tracking: `git rev-parse --abbrev-ref @{u}` → `<remote>/<branch>`, then `git fetch <remote>`. **Never hardcode `origin`** unless it is the configured upstream; `@{u}` is the single source of truth for what this branch pulls from.
2. `git pull --ff-only` — **succeeds → report `fast-forwarded @ <sha>` and stop.** This is the whole job in the common case.
3. Refused → **diverged**. Report both sides: `git rev-list --left-right --count <branch>...@{u}` (local-ahead / remote-ahead) + `git log --oneline` of each side.
   - `--dry-run` → stop here without guard/reconciliation; only fetch updates and the `.git/` audit bundle may have changed.

## Step 3 — Diverged: guard, then reconcile

1. **Backup** — `git branch guard/<repo>-<branch-sha>-<ts>` at current HEAD.
2. **Reconcile** — load the `git-merge` skill and follow it with **source = `@{u}` (the fetched upstream ref), target = `<branch>`**; its Step 1 preflight/sync/backup are satisfied here — validate the source with `git rev-parse --verify @{u}` (not `refs/heads/@{u}`), then run from merge Step 1.3. Do not reapply the merge skill's local-branch-only source check to this remote-tracking ref. `--rebase` → load the `git-rebase` skill instead: run its Step 1.2 plan/topology check, skip Step 1.3 backup because the local tip is already guarded and the remote-tracking ref must not be moved, then run from Step 1.4 with **source = `<branch>` (local commits to replay), onto = `@{u}`** (already fetched + guard-backed-up above); per-commit conflicts, linear result. **Exemption: SKIP its Step 3.3 fast-forward** — after the rebase the checked-out local branch IS the landed result; there is no local target branch to advance and `@{u}` is a remote-tracking ref that must never be checked out or moved. Run its mechanical check (3.1), verify (3.2), archive (3.4), and report (3.5) on the current branch; only Step 3.3 is skipped. All conflict resolution, conflict-free repository-level semantic interaction auditing, verification, decision-log archiving, and reporting follow those protocols — do not re-implement them here.

## Report

```
## git-pull report
Branch: <branch> ← <upstream> (@{u})
Result: <fast-forwarded @ <sha> | diverged → merge commit <sha> | diverged → rebased (N commits) | diverged → paused → handed to human | dry-run (ahead A / behind B)>
Outcome: <landed-fast-forward | landed-verified | landed-clean | landed-no-verify-opt-in | no-op | dry-run | handed-over:{unresolved-hunk|verify-failed|no-verify-command|hook-failed|signing-interactive|preflight-<check>}>
Verify: <command> → <real result>   (only when reconciliation ran; the delegated protocol names the inference rank)
Confidence: <H> confident · <A> advisor ✓ · <U> unresolved → handed to human   (only when reconciliation resolved conflicts; the delegated git-merge/git-rebase report carries the per-hunk detail)
Backup: guard/<repo>-<sha>-<ts>     (only when diverged; pruning is the user's call)
Audit: `.git/ocp-pull-reports/<operation-id>.jsonl` + `.md` (every invocation; child reconciliation traces linked)
```

## Hard rules

1. **`--ff-only` first** — never plain `git pull` (its implicit merge/rebase dirties the baseline); rewriting happens only after a guard backup.
2. **Divergence always guard-backs-up before reconciling** — the user's local commits are never silently rewritten.
3. **Conflict and semantic-interaction analysis are delegated** — the `git-merge` skill owns them (or the self-contained `git-rebase` skill under `--rebase`): baseline principle, per-hunk rationale, whole-file coherence review, confidence self-check + `@advisor` escalation on uncertain hunks (best-effort — advisor failure degrades to handover, never a guess), no blanket overwrite.
4. **Never force-push** — reconciliation lands locally; pushing is the user's call (after `--rebase`: `--force-with-lease`, user decides).
5. **Never delete the guard branch** — surface it in the report.
6. **Real verification only** (`instructions/verification-honesty.md`) — no `✅` for unrun commands.
7. **Language** — follow `output-protocol.md` §Session language.
8. **A halt is never a dead end** — every halt names the exact recovery command for that specific failure (no upstream → the `git branch --set-upstream-to=<remote>/<b>` line; dirty tree → the `git stash push` / `git commit` line; detached HEAD → `git switch <branch>`; leftover op → the matching `--continue` / `--abort`), leaving the user one paste from proceeding. "Fix it yourself" prose is a defect.

## Flags

- `--rebase` — reconcile by rebasing local commits onto the remote tip (linear; rewrites local branch).
- `--dry-run` — fetch + report divergence without reconciliation; fetched remote-tracking refs and the `.git/` audit bundle may change.
- `--no-verify` — skip the post-reconcile test run.
- `--abort` — for a stuck reconciliation, flush the parent trace and finalize any child decision/audit bundle **before** `git merge --abort` / `git rebase --abort`, because abort discards resolutions; then report pre/post state.

Flags may appear anywhere; parsing is permissive and case-sensitive.

## Failure catalog

| Symptom | Cause | Action |
|---|---|---|
| `There is no tracking information` | No upstream | Halt; suggest `git branch --set-upstream-to=<remote>/<b>` |
| `Not possible to fast-forward` | Diverged | Step 3 — guard + reconcile |
| `Your local changes would be overwritten` | Dirty tree | Halt; user commits/stashes |
| `Unable to create .git/index.lock` | Concurrent git process or stale lock | Halt; confirm no active git process before removing a stale lock |
| `CONFLICT (...)` during reconcile | Both sides edited | git-merge / git-rebase Step 2 |
| `fatal: ... rebase in progress` | Leftover rebase | Run this skill's `--abort` flow so any decision log is archived before aborting |
| `fatal: ... cherry-pick in progress` | Leftover cherry-pick | Run the matching git-pick `--abort` flow so any decision log is archived before aborting |
