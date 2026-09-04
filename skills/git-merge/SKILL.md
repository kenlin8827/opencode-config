---
name: git-merge
description: Agent-driven analog of a manual `git merge` — sync target to origin first, then merge a source branch into it; the ONLY thing the agent replaces is the human's hands-on conflict resolution (semantic, hunk-by-hunk, target HEAD is the authoritative baseline), then `git merge --continue`. Load ONLY when the user invokes /git-merge.
---

# Git Merge Protocol (agent = the human)

You perform an ordinary `git merge` of a **source** branch into a **target** branch. Everything is stock git except one step: when git reports conflicts, **you are the human** — open each conflicted file, understand both sides, write the correct merged result, continue. No cherry-pick replay, no invented machinery. Rebase only via `--rebase` flag.

**Why stock merge is the right base:** git computes the true common ancestor (`git merge-base`) itself, so target's independent evolution is visible to the three-way merge. Conflicts appear only where both sides genuinely touched the same region — never from a wrong per-commit base silently undoing the baseline.

**Terms.** Merge source INTO target: `ours`/left = target (HEAD), `theirs`/right = source, `BASE` = merge-base of the two.

## Step 1 — Preflight, sync, merge

**Checks** — all must pass; never auto-stash/reset/checkout on failure, the user fixes or opts in:

| Check | Command | Fail |
|---|---|---|
| Inside a git repo | `git rev-parse --is-inside-work-tree` | Halt |
| Both branches exist | `git rev-parse --verify --quiet refs/heads/<b>` | Halt, list branches |
| source ≠ target | — | Halt |
| Worktree clean | `git status --porcelain` empty | Halt — refuse to merge dirty |
| No in-progress op | `MERGE_HEAD`/`CHERRY_PICK_HEAD`/`REBASE_HEAD` absent | Halt — finish or abort first |
| Not detached HEAD | `git symbolic-ref HEAD` succeeds | Halt — detach first |

Both branches given in the invocation are the green light — no extra confirmation round. A missing branch → ask (recommend the default branch as target); never guess.

1. **Sync target to origin** — `git checkout <target>` → `git pull --ff-only`. The baseline is exactly origin's latest; merging onto a stale local target layers new work over outdated state. Diverged from upstream → halt, the user reconciles. No remote configured → proceed on local HEAD and say so. Plain `git pull` is forbidden — it may merge/rebase and dirty the baseline.
2. **Backup** — `git branch guard/<repo>-<target-sha>-<ts>` at synced HEAD. **`--rebase`**: also backup source (`git branch guard/<repo>-<source-sha>-<ts>` on source HEAD) — rebase rewrites it.
3. **Merge** — `git merge <source>` (append `--squash` / `--no-ff` per flags). Clean → Step 3 · conflict → Step 2 · `Already up to date` → report and stop. **`--rebase`**: `git checkout <source>` → `git rebase <target>` → per-commit conflict → Step 2 (resolve, `git add`, `git rebase --continue`) → `git checkout <target>` → `git merge --ff-only <source>` → Step 3. **`--dry-run`**: `git merge --no-commit --no-ff <source>`, show `git diff --stat` + conflict list, `git merge --abort`.

## Step 2 — Resolve conflicts (you = the human)

Read before touching anything:

```bash
BASE=$(git merge-base <target> <source>); git diff --name-only --diff-filter=U  # textual conflicts
git status --porcelain          # UU/AA/DU/UD/... structural
git diff $BASE <target> -- <p>  # LEFT (ours/target); $BASE <source> = RIGHT (theirs/source)
# Stages: :1: base  :2: ours (target)  :3: theirs (source)
```

**Baseline principle.** Target HEAD is the authoritative baseline — it landed first and is origin-synced; the merge layers the source's work on top, as if the source author had written it after target's latest state. A source change must **ADD** its intent — it must **NEVER silently remove or undo target's baseline content** (additions, modifications, OR deletions) unless removing it is that source change's explicit purpose. **Deletion is intentional, not absence**: honor a deliberate baseline deletion; adapt the surviving side to the post-deletion world instead of resurrecting code.

In a stock merge every textual conflict means **both sides changed the same region vs BASE** — so resolve by shape:

| Conflict shape | Resolution |
|---|---|
| content (both edited) | Keep target's shape (interfaces, refactor, naming); re-express the source's new logic into it — the source adapts to the baseline, never the reverse |
| modify/delete — target deleted, source edited | Deletion stands; port only what the source still genuinely needs from the deleted region |
| modify/delete — target edited, source deleted | Removal is the source's explicit purpose — apply it; relocate target's surviving need elsewhere, or flag it in the rationale |
| rename/delete, binary, mode | Resolve where readable; genuinely opaque (binary) may take one side — logged |

Edit each file in place until **every `<<<<<<<` / `=======` / `>>>>>>>` marker is gone**, then `git add <path>`. Keep a **one-line rationale per hunk** — it is the audit trail in Step 3. No `git checkout --theirs/--ours`, no `-X` — blanket overwrites silently drop logic.

## Step 3 — Finish & report

1. **Mechanical check** — `git grep -nE '^(<{7}|={7}|>{7})( |$)'` returns nothing and no `U` states remain in `git status --porcelain`. Fail → back to Step 2.
2. **Verify** (skip with `--no-verify`) — run the project's test/build command once (infer from `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Makefile`; none → log `no verification command detected`). Fail → repair like a human making it compile, **max 2 attempts**, then show the failure and hand over. Per `instructions/verification-honesty.md`: only real results, never a guessed pass.
3. **Land it** — default: `git merge --continue --no-edit` (or `git commit --no-edit`). **`--squash`**: read `git log --oneline BASE..source`, generate a clean conventional-commit message summarising the changes, `git commit` with it (never `--no-edit`). **`--rebase`**: skip (ff-only already landed in Step 1.3).
4. **Report**:

```
## git-merge report
Source: <source> → Target: <target> (synced @ <sha>) · Merge-base: <BASE>
Result: <fast-forward | merge commit <sha> | conflicted → resolved | squashed | rebased (N commits)>
Verify: <command> → <real result>

### Conflicts resolved (<N> files)
| File | Hunk | Decision | Rationale |
|------|------|----------|-----------|

### Safety trail
- Backup: guard/<repo>-<sha>-<ts> — revert with `git reset --hard <synced-target-sha>` (never force-push; pruning is the user's call)
- Rebase: source branch rewritten — if already pushed, `git push --force-with-lease` (user's call)
- Review: `git show <merge-sha>`; clean → `git push` / open PR
```

## Hard rules

1. **Stock `git merge`** — you replace only the human's conflict resolution; no cherry-pick/rebase unless `--rebase` flag (Step 1).
2. **Never merge from a dirty or unsynced baseline** — target pulls `--ff-only` to origin first (divergence halts); the user's uncommitted work is never auto-stashed/reset.
3. **Baseline authority** — source layers ON TOP of target HEAD; never silently removes/undoes target's changes vs BASE (Step 2 baseline principle).
4. **Never blanket-overwrite a conflicted file** — no `--theirs`/`--ours`/`-X`; every textual hunk gets a deliberate result with a logged rationale; only opaque binary cases may take one side, logged.
5. **Never `--force` push or `git reset --hard` the user's pre-existing remote target** — the merge commit is local; pushing is the user's call.
6. **Never delete the guard backup branch** — surface it in the report; pruning is the user's call.
7. **Real verification only** (`instructions/verification-honesty.md`) — no `✅` for unrun commands.
8. **Language per `output-protocol.md` §Session language** — report in the user's latest substantive language; commit messages, paths, commands, and protocol labels stay English.

## Flags

- `--dry-run` — preview the merge + list conflicts, change nothing.
- `--no-verify` — skip the Step 3.2 test run (test-less projects only; log `no verify`).
- `--squash` — all source changes as one commit; agent generates commit message from source `git log`.
- `--no-ff` — force a merge commit even when fast-forward is possible.
- `--rebase` — replay source commits onto target individually (preserves per-commit history; linear). Mutually exclusive with `--squash`/`--no-ff`.
- `--abort` — `git merge --abort` (or `git rebase --abort` during `--rebase`), report pre/post state; only for a stuck merge.

Flags may appear anywhere; parsing is permissive and case-sensitive.

## Failure catalog

| Symptom | Cause | Action |
|---|---|---|
| `fatal: not a git repository` | Outside a repo | Halt; suggest `cd <repo>` |
| `error: pathspec '<X>' did not match` | Branch typo / missing | List branches, re-confirm |
| `git pull --ff-only` refuses | Local target diverged from origin | Halt; user reconciles target first |
| `Your local changes would be overwritten by merge` | Dirty tree | Halt; user commits/stashes |
| `Already up to date` | source ⊆ target | Report nothing to merge |
| `CONFLICT (content): Merge conflict in <file>` | Both edited the same region | Step 2 — baseline-first semantic resolve |
| `CONFLICT (modify/delete)` | One side deleted, the other modified | Step 2 table — decide by intent, never auto-resurrect |
| `CONFLICT (rename/…)`, `(binary files differ)` | Structural | Resolve where readable; opaque binary takes one side, logged |
| `fatal: ... merge in progress` | Leftover from a prior run | Halt; user runs `git merge --abort` first |
