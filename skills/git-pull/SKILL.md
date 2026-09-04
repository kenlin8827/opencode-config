---
name: git-pull
description: Sync the CURRENT branch with its upstream — try `git pull --ff-only` first; if diverged, guard-backup the branch, then reconcile via the git-merge protocol (source = origin/<branch>, target = local branch). `--rebase` replays local commits onto remote instead. Load ONLY when the user invokes /git-pull.
---

# Git Pull Protocol (ff-first, guard, then reconcile)

You sync the **current branch** with its upstream. Fast-forward whenever possible — it rewrites nothing. Only when the branch has diverged do you guard-backup and reconcile — a full `git merge` (or `git rebase` under `--rebase`) of the fetched remote ref, delegated to the self-contained `git-merge` / `git-rebase` skill (the remote's published history is the authoritative baseline your local work layers onto).

**No `--squash`**: pulling squashes your own branch's published remote history into one commit — that rewrites shared history, never legitimate.

## Step 1 — Preflight

**Checks** — all must pass; never auto-stash/reset on failure, the user fixes or opts in:

| Check | Command | Fail |
|---|---|---|
| Inside a git repo | `git rev-parse --is-inside-work-tree` | Halt |
| Not detached HEAD | `git symbolic-ref HEAD` succeeds | Halt — no branch to sync |
| Worktree clean | `git status --porcelain` empty | Halt — refuse to pull dirty |
| Upstream configured | `git rev-parse --abbrev-ref @{u}` | Halt — suggest `git branch --set-upstream-to` |
| No in-progress op | `MERGE_HEAD`/`REBASE_HEAD` absent | Halt — finish or abort first |

## Step 2 — Fetch & try fast-forward

1. `git fetch origin`
2. `git pull --ff-only` — **succeeds → report `fast-forwarded @ <sha>` and stop.** This is the whole job in the common case.
3. Refused → **diverged**. Report both sides: `git rev-list --left-right --count <branch>...@{u}` (local-ahead / remote-ahead) + `git log --oneline` of each side.
   - `--dry-run` → stop here, change nothing.
   - No remote configured → halt (nothing to pull).

## Step 3 — Diverged: guard, then reconcile

1. **Backup** — `git branch guard/<repo>-<branch-sha>-<ts>` at current HEAD.
2. **Reconcile** — load the `git-merge` skill and follow it with **source = `origin/<branch>` (the fetched remote ref), target = `<branch>`**; its Step 1.1 sync and 1.2 backup are already done above — run from its Step 1.3. `--rebase` → load the `git-rebase` skill instead and run from its Step 1.3 with **source = `<branch>` (local commits to replay), onto = `origin/<branch>`** (already fetched + guard-backed-up above); per-commit conflicts, linear result. All conflict resolution, verification, decision-log archiving, and reporting follow those protocols — do not re-implement them here.

## Report

```
## git-pull report
Branch: <branch> ← origin/<branch>
Result: <fast-forwarded @ <sha> | diverged → merge commit <sha> | diverged → rebased (N commits) | diverged → paused → handed to human | dry-run (ahead A / behind B)>
Verify: <command> → <real result>   (only when reconciliation ran)
Confidence: <H> confident · <A> advisor ✓ · <U> unresolved → handed to human   (only when reconciliation resolved conflicts; the delegated git-merge/git-rebase report carries the per-hunk detail)
Backup: guard/<repo>-<sha>-<ts>     (only when diverged; pruning is the user's call)
```

## Hard rules

1. **`--ff-only` first** — never plain `git pull` (its implicit merge/rebase dirties the baseline); rewriting happens only after a guard backup.
2. **Divergence always guard-backs-up before reconciling** — the user's local commits are never silently rewritten.
3. **Conflict resolution is delegated** — the `git-merge` skill owns it (or the self-contained `git-rebase` skill under `--rebase`): baseline principle, per-hunk rationale, whole-file coherence review, confidence self-check + `@advisor` escalation on uncertain hunks (best-effort — advisor failure degrades to handover, never a guess), no blanket overwrite.
4. **Never force-push** — reconciliation lands locally; pushing is the user's call (after `--rebase`: `--force-with-lease`, user decides).
5. **Never delete the guard branch** — surface it in the report.
6. **Real verification only** (`instructions/verification-honesty.md`) — no `✅` for unrun commands.
7. **Language per `output-protocol.md` §Session language** — report in the user's language; commands/paths/labels stay English.

## Flags

- `--rebase` — reconcile by rebasing local commits onto the remote tip (linear; rewrites local branch).
- `--dry-run` — fetch + report divergence, change nothing.
- `--no-verify` — skip the post-reconcile test run.
- `--abort` — `git merge --abort` / `git rebase --abort` for a stuck reconciliation; report pre/post state.

Flags may appear anywhere; parsing is permissive and case-sensitive.

## Failure catalog

| Symptom | Cause | Action |
|---|---|---|
| `There is no tracking information` | No upstream | Halt; suggest `git branch --set-upstream-to=origin/<b>` |
| `Not possible to fast-forward` | Diverged | Step 3 — guard + reconcile |
| `Your local changes would be overwritten` | Dirty tree | Halt; user commits/stashes |
| `CONFLICT (...)` during reconcile | Both sides edited | git-merge / git-rebase Step 2 |
| `fatal: ... rebase in progress` | Leftover rebase | Halt; user runs `git rebase --abort` first |
