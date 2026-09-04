---
name: git-rebase
description: Agent-driven analog of a manual `git rebase` — replay ALL of a source branch's unique commits onto a target branch's HEAD for a clean linear history; the ONLY thing the agent replaces is the human's per-commit conflict resolution (semantic, hunk-by-hunk, the onto-branch HEAD is the authoritative baseline), then `git rebase --continue`, then fast-forward target. Rewrites source history (both tips guard-backed-up; force-with-lease is the user's call). Load ONLY when the user invokes /git-rebase.
---

# Git Rebase Protocol (agent = the human)

You perform an ordinary `git rebase`: replay the **source** branch's unique commits onto the **target** branch's HEAD, resolve each conflict as git stops, then fast-forward target so the commits land linearly. Everything is stock git except one step: when git pauses on a conflict, **you are the human** — open each file, understand both sides, write the correct result, `git add`, `git rebase --continue`. No cherry-pick loop, no invented machinery.

**Why rebase, not merge:** you want source's commits preserved individually on top of target's latest state — linear history, no merge commit. The cost: rebase **rewrites** source (new SHAs), so it guard-backs-up both branches and never force-pushes without the user's call. For a merge commit or a single squashed commit instead, use the `git-merge` skill.

**Terms.** Replay source ONTO target: the `onto` baseline = target HEAD; the thing layered on = each source commit in turn. In a rebase conflict git's labels are `:1:` = the replayed commit's parent, `:2:`/HEAD = the onto side (target + commits already replayed), `:3:` = the source commit being applied. The mapping never flips — target is always the baseline, source always layers on it.

## Step 1 — Preflight, sync, backup, rebase

**Checks** — all must pass; never auto-stash/reset/checkout on failure, the user fixes or opts in:

| Check | Command | Fail |
|---|---|---|
| Inside a git repo | `git rev-parse --is-inside-work-tree` | Halt |
| Both branches exist | `git rev-parse --verify --quiet refs/heads/<b>` | Halt, list branches |
| source ≠ target | — | Halt |
| Worktree clean | `git status --porcelain` empty | Halt — refuse to rebase dirty |
| No in-progress op | `MERGE_HEAD`/`CHERRY_PICK_HEAD`/`REBASE_HEAD` absent | Halt — finish or abort first |
| Not detached HEAD | `git symbolic-ref HEAD` succeeds | Halt — detach first |

Both branches given in the invocation are the green light — no extra confirmation round. A missing branch → ask (recommend the default branch as target); never guess.

1. **Sync target to origin** — `git checkout <target>` → `git pull --ff-only`. The onto-baseline is exactly origin's latest; replaying onto a stale target layers new work over outdated state. Diverged from upstream → halt, the user reconciles. No remote configured → proceed on local HEAD and say so. Plain `git pull` is forbidden — it may merge/rebase and dirty the baseline.
2. **Backup both** — rebase rewrites source, so guard both tips: `git branch guard/<repo>-<source-sha>-<ts>` on source HEAD and `git branch guard/<repo>-<target-sha>-<ts>` on synced target HEAD.
3. **Rebase** — `git checkout <source>` → `git rebase <target>`. Clean → Step 3. Per-commit conflict → Step 2 (resolve, `git add`, `git rebase --continue`; repeat for every stopped commit). `Current branch <source> is up to date` → nothing to replay; report and stop. **`--dry-run`**: report `git log --oneline <target>..<source>` (the commits to replay) + `git diff --stat <target>...<source>`, change nothing.

## Step 2 — Resolve conflicts (you = the human)

Self-contained — resolve each stopped commit's conflicts here; do NOT load another skill. The onto side is the authoritative baseline; each replayed commit layers its intent ON TOP (full doctrine below).

Read before touching anything (the base for each stopped commit is its own parent, advancing as commits replay):

```bash
git diff --name-only --diff-filter=U   # textual conflicts for THIS commit
git status --porcelain                 # UU/AA/DU/UD/... structural
git rebase --show-current-patch        # what the stopped commit intended
# Stages: :1: = replayed commit's parent  :2:/HEAD = onto side (target + replayed so far)  :3: = source commit being applied
```

**Baseline principle.** The onto side (`:2:`/HEAD — target plus the commits already replayed) is the authoritative baseline. Each replayed commit layers its intent ON TOP, as if its author had written it against the current onto state. **Baseline ≠ winner** — neither side is "newer, therefore right": read each hunk against `:1:` (the commit's own parent) and **compose both parties' deliberate changes**; the resolution drops neither side's intent. A replayed commit must **ADD** its intent — never silently remove or undo baseline content (additions, modifications, OR deletions) unless removing it is that commit's explicit purpose. **Deletion is intentional, not absence**: honor a deliberate baseline deletion; adapt the surviving side instead of resurrecting code.

| Conflict shape | Resolution |
|---|---|
| content (both edited) | Keep the onto side's shape (interfaces, refactor, naming); re-express the replayed commit's new logic into it — the commit adapts to the baseline, never the reverse. **Both intents survive** |
| modify/delete — onto deleted, commit edited | Deletion stands; port only what the commit still genuinely needs |
| modify/delete — onto edited, commit deleted | Removal is the commit's explicit purpose — apply it; relocate the onto side's surviving need, or flag it in the rationale |
| rename/delete, binary, mode | Resolve where readable; genuinely opaque (binary) may take one side — logged |

Edit each file in place until **every `<<<<<<<` / `=======` / `>>>>>>>` marker is gone**. **Then re-read the WHOLE file once for global coherence** — hunks are not independent (a signature resolved in one hunk must match its call sites in another); repair any seam the hunk-by-hunk pass left. Then `git add <path>` → `git rebase --continue`. If the resolution leaves the commit empty (its change already exists on the onto side) → `git rebase --skip`. Keep a **one-line rationale per hunk per commit** — it is the audit trail in Step 3. No `git checkout --theirs/--ours`, no `-X` — blanket overwrites silently drop logic.

**Confidence self-check (per hunk).** Before `git add`, tag each hunk **confident** (both intents derivable from `:1:` and the onto side, composition unambiguous) or **uncertain** (ambiguous intent, both readings plausible, or a seam the coherence re-read could not repair). **When torn, choose uncertain** — a wrong resolution is a disaster and self-assessed certainty runs high. For an **uncertain** hunk, dispatch the `@advisor` subagent (task tool) with the hunk's three sides (`:1:`/`:2:`/`:3:`), your proposed resolution, and the specific ambiguity; advisor is read-only and returns a recommendation + a 1–10 confidence + FACTUAL/PREFERENCE. Advisor returns **FACTUAL + confidence ≥ 8** (the same threshold the auto-advisor uses to act on an answer) → apply it, retag `advisor ✓ (n/10)`. Anything less — **< 8, still uncertain, or PREFERENCE** (the answer lives only in the author's head) → **never guess**: leave the rebase paused at that commit, do not `git add`/`--continue` past it, archive the log (Step 3.4), and hand the hunk to the human with both sides + advisor's analysis. **Advisor is best-effort, never a hard dependency** — if the dispatch fails, times out, is unavailable, or returns no parseable FACTUAL + ≥8 verdict, do NOT retry-loop or block: treat the hunk as unresolved and hand it over exactly as above (note `advisor unavailable` in the log); the rebase stays paused at that commit and its OTHER hunks continue. A missing second opinion never becomes a guess. Escalate only genuinely uncertain hunks (frugality), never routine ones.

## Step 3 — Land & report

1. **Fast-forward target** — `git checkout <target>` → `git merge --ff-only <source>`. Target now points at the linear replayed tip. Not a fast-forward (target moved during the rebase) → halt, re-sync, report.
2. **Mechanical check** — `git grep -nE '^(<{7}|={7}|>{7})( |$)'` returns nothing and no `U` states remain in `git status --porcelain`. Fail → back to Step 2.
3. **Verify** (skip with `--no-verify`) — run the project's test/build command once (infer from `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Makefile`; none → log `no verification command detected`). Fail → repair like a human making it compile, **max 2 attempts**, then show the failure and hand over. Per `instructions/verification-honesty.md`: only real results, never a guessed pass.
4. **Archive the decision log** — only when conflicts were resolved (landed OR handed over — a failed verify OR an unresolved hunk). `mkdir -p .git/ocp-rebase-reports` → write `.git/ocp-rebase-reports/<ts>-<source>-onto-<target>.md` (sanitize `/`→`-`) containing the full per-commit / per-hunk log below (with confidence tags). Inside `.git/`: never committed, never dirties `git status`, never pushed; prunable by the user, never auto-deleted. (No commit-message summary here — the fast-forward landing creates no new commit and each replayed commit keeps its own message; the archive is the forensic trail.)
5. **Report**:

```
## git-rebase report
Source: <source> → onto Target: <target> (synced @ <sha>)
Replayed: <N> commits (<first-sha>..<last-sha>) · Result: <linear @ <target-sha> | up to date | paused → handed to human | dry-run>
Verify: <command> → <real result>
Confidence: <H> confident · <A> advisor ✓ · <U> unresolved → handed to human   (only when conflicts were resolved)

### Conflicts resolved (<N> hunks across <M> commits)
| Commit | File | Hunk | Decision | Confidence | Rationale |
|--------|------|------|-----------|------------|-----------|

### Safety trail
- Backup: guard/<repo>-<source-sha>-<ts> (source), guard/<repo>-<target-sha>-<ts> (target)
- Archive: `.git/ocp-rebase-reports/<ts>-<source>-onto-<target>.md` — full per-commit decision log (only when conflicts were resolved; never committed, prunable)
- History rewritten: source now has new SHAs. Landing target = plain `git push` (fast-forward). If SOURCE was already pushed, updating it needs `git push --force-with-lease` (user's call) — never plain `--force`.
- Undo: `git reset --hard guard/<repo>-<source-sha>-<ts>` on source; `git reflog` also retains the pre-rebase tips.
```

## Hard rules

1. **Stock `git rebase`** — you replace only the human's per-commit conflict resolution; no cherry-pick loop, no invented machinery.
2. **Never rebase a dirty tree or onto an unsynced target** — target pulls `--ff-only` to origin first (divergence halts); the user's uncommitted work is never auto-stashed/reset.
3. **Guard-backup BOTH branches before rewriting** — rebase rewrites source; both tips are backed up first.
4. **Baseline authority** — each replayed commit layers ONTO target HEAD; never silently removes/undoes target's changes vs the commit's parent (Step 2 baseline principle).
5. **Never blanket-overwrite a conflicted file** — no `--theirs`/`--ours`/`-X`; every textual hunk gets a deliberate result with a logged rationale.
6. **Never guess a low-confidence hunk** — self-check confidence per hunk (Step 2); an uncertain hunk goes to `@advisor` (read-only subagent) — apply its answer only on **FACTUAL + confidence ≥ 8**, otherwise (< 8 / uncertain / PREFERENCE / **advisor unreachable or failed**) STOP and hand that hunk to the human (rebase stays paused, guard branches protect). Advisor is best-effort: its failure degrades to handover, never to a guess, hang, or abort — the op continues on the commit's other hunks.
7. **Never `--force` push or `git reset --hard` the user's pre-existing remote** — landing target is a fast-forward `git push`; updating a rewritten source is `--force-with-lease`, and only the user decides.
8. **Never delete the guard backup branches** — surface them in the report; pruning is the user's call.
9. **Real verification only** (`instructions/verification-honesty.md`) — no `✅` for unrun commands.
10. **Language per `output-protocol.md` §Session language** — report in the user's latest substantive language; commit messages, paths, commands, and protocol labels stay English.

## Flags

- `--dry-run` — list the commits to replay + diffstat, change nothing.
- `--no-verify` — skip the Step 3.3 test run (test-less projects only; log `no verify`).
- `--continue` — resume a paused rebase after conflicts were resolved (`git rebase --continue`).
- `--skip` — `git rebase --skip` the current commit (resolution left it empty/redundant).
- `--abort` — `git rebase --abort`, report pre/post state; only for a stuck rebase.

Flags may appear anywhere; parsing is permissive and case-sensitive.

## Failure catalog

| Symptom | Cause | Action |
|---|---|---|
| `fatal: not a git repository` | Outside a repo | Halt; suggest `cd <repo>` |
| `error: pathspec '<X>' did not match` | Branch typo / missing | List branches, re-confirm |
| `git pull --ff-only` refuses | Local target diverged from origin | Halt; user reconciles target first |
| `Cannot rebase: You have unstaged changes` | Dirty tree | Halt; user commits/stashes |
| `Current branch <source> is up to date` | source ⊆ target | Report nothing to replay |
| `CONFLICT (content): Merge conflict in <file>` | Both edited the same region | Step 2 — baseline-first semantic resolve, `git add`, `--continue` |
| `CONFLICT (modify/delete)` | One side deleted, the other modified | Step 2 table — decide by intent, never auto-resurrect |
| `No changes - did you forget to use 'git add'?` | Resolution left the commit empty | `git rebase --skip` |
| `@advisor` dispatch fails / times out / unavailable | Second opinion unreachable | Best-effort — treat the hunk as unresolved, hand it to the human; never retry-loop, never guess; the commit's other hunks continue |
| `fatal: ... rebase in progress` | Leftover from a prior run | Halt; user runs `git rebase --abort` first |
| `Not possible to fast-forward` at Step 3.1 | Target moved during the rebase | Halt; re-sync target, report |
