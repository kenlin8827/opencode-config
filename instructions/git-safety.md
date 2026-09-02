# Git destructive op guard — ZERO data loss

## Pre-backup (runs only when Working tree is dirty or has untracked files)

Bash syntax — on other shells keep the values, translate the syntax.

```bash
REPO=$(basename "$(git rev-parse --show-toplevel)" | tr ' ' '_')
HEAD_SHA=$(git rev-parse HEAD)
SHORT_SHA=${HEAD_SHA:0:7}
TS=$(date +%s)
git branch "guard/$REPO-$SHORT_SHA-$TS" || echo "BACKUP BRANCH FAILED — DO NOT PROCEED"
git stash push -u -m "guard-$SHORT_SHA" 2>/dev/null || echo "STASH FAILED — uncommitted work unprotected"
```

- Clean tree → skip backup, proceed.
- `HEAD_SHA` = committed-state fallback: `git checkout $HEAD_SHA` restores the pre-op commit; uncommitted work lives in the guard stash → `git stash pop`.

## High-risk ops — ALWAYS confirm with user

`git reset --hard` · `git clean -fd[x]` · `git push --force` · `git branch -D` · `git rebase -i` · `git rebase --abort` · `git cherry-pick --abort` · `git merge --abort` · `git am --abort` · `git revert --abort` · `git stash drop` · `git stash clear` · `git filter-branch` · `git filter-repo` · `git worktree remove`

Confirmation:
1. Risk disclosure: what gets destroyed · recoverable or **IRREVERSIBLE** · what op achieves
2. Show scope: `git status --short` + `git diff --stat` + backup branch + stash@{N} + `HEAD_SHA`
3. Ask `Proceed` / `Cancel`. Cancel = stop, no re-prompt.

## Medium-risk ops — block when dirty, pass when clean

`git checkout` · `git switch` · `git restore` · `git pull --rebase`

- Tree dirty → pre-backup, then "Dirty tree. Backup at `guard/...`. Proceed / Cancel?"
- Tree clean → proceed directly.

## Self-recovery (agent runs autonomously when user says "lost")

```bash
git for-each-ref refs/heads/guard/ --sort=-creatordate --format='%(refname:short) %(objectname:short) %(creatordate:short) %(subject)'
git reflog --date=iso | head -20
git fsck --unreachable --no-reflogs 2>/dev/null | grep commit
git stash list | grep guard-
```

Found `<SHA>` → `git log -5 <SHA>` confirm → `git branch recover-<SHA> <SHA>` → `git stash pop` if trapped.

All git layers exhausted (branches · reflog · fsck · stash)? Untracked-only loss (never in git objects) → FS sidecar: OS trash / `*.swp` / IDE history.
