---
name: git-rebase
description: Agent-driven analog of a manual `git rebase` — replay ALL of a source branch's unique commits onto a target branch's HEAD for a clean linear history; the ONLY thing the agent replaces is the human's per-commit conflict resolution (semantic, hunk-by-hunk, the onto-branch HEAD is the authoritative baseline), then `git rebase --continue`, then fast-forward target. Rewrites source history (both tips guard-backed-up; force-with-lease is the user's call). Load ONLY when the user invokes /git-rebase.
---

# Git Rebase Protocol (agent = the human)

You perform an ordinary `git rebase`: replay the **source** branch's unique commits onto the **target** branch's HEAD, resolve each conflict as git stops, then fast-forward target so the commits land linearly. Everything is stock git except one step: when git pauses on a conflict, **you are the human** — open each file, understand both sides, write the correct result, `git add`, `git rebase --continue`. No cherry-pick loop, no invented machinery.

**Why rebase, not merge:** you want source's commits preserved individually on top of target's latest state — linear history, no merge commit. The cost: rebase **rewrites** source (new SHAs), so it guard-backs-up both branches and never force-pushes without the user's call. For a merge commit or a single squashed commit instead, use the `git-merge` skill.

**Terms.** Replay source ONTO target: the `onto` baseline = target HEAD; the thing layered on = each source commit in turn. In a rebase conflict git's labels are `:1:` = the replayed commit's parent, `:2:`/HEAD = the onto side (target + commits already replayed), `:3:` = the source commit being applied. The mapping never flips — target is always the baseline, source always layers on it.

## Audit trail — every invocation

After the inside-repository check succeeds and **before any mutating git command**, create `operation-id = git-rebase-<UTC>-<short-head>-<random>` and initialize `.git/ocp-rebase-reports/<operation-id>.jsonl`; buffer and flush the repository-check event. Trace creation inside `.git/` is the only audit side effect permitted by `--dry-run`. Failure to create the trace halts before mutation; a later append failure pauses safely without auto-abort.

Append and flush `command_start` before every git command and a linked `command_end` immediately afterward; a missing end records an interruption. Cover preflight, sync, topology plan, guards, rebase, inspection, add, per-commit verify, continue/skip/abort, landing fetch/ff, and final status. Every event includes `schema_version: 1`, `operation_id`, `seq`, UTC `ts`, `event`, `phase`, redacted `argv` array, `cwd_repo_relative`, `prev_event_sha256`, and `event_sha256` over canonical JSON excluding that field. Start events include refs/SHAs before; end events link `command_seq` and include `exit_code`, `duration_ms`, refs/SHAs after, redacted/truncated stdout/stderr, and streaming SHA-256 of each full stream. Plan/land/skip mappings, conflicts, decisions, advisor/handover, verification, and recovery use the same hash chain; the Markdown summary records the final event hash. The chain detects truncation/accidental changes, not malicious rewriting. Never persist environment variables, credentials, Authorization, URL userinfo/tokens, private keys, or raw conflicted-file contents; redact argv/output, cap excerpts at 4 KiB, and use restrictive permissions where supported. Finalize sibling `<operation-id>.md` on every exit path.

## Step 1 — Preflight, sync, backup, rebase

**Checks** — all must pass; never auto-stash/reset/checkout on failure, the user fixes or opts in:

| Check | Command | Fail |
|---|---|---|
| Inside a git repo | `git rev-parse --is-inside-work-tree` | Halt |
| Both branches exist | `git rev-parse --verify --quiet refs/heads/<b>` | Halt, list branches |
| source ≠ target | — | Halt |
| Worktree clean | `git status --porcelain --untracked-files=no` empty | Halt — refuse to rebase dirty |
| No in-progress op | `MERGE_HEAD`/`CHERRY_PICK_HEAD` absent and `.git/rebase-merge`/`.git/rebase-apply` absent | Halt — offer this command's `--continue` (resume) or `--abort` (clear); never silently discard the prior op |
| Not detached HEAD | `git symbolic-ref HEAD` succeeds | Halt — attach first (check out a branch) |
| No stale lock | `.git/index.lock` absent | Halt; confirm no git process is active before removing a stale lock |
| Resolution cache known | `git config --bool rerere.enabled` | Record it; run rebase/continue with `-c rerere.enabled=false` |
| Required rebase options supported | `git rebase -h` exposes `--[no-]reapply-cherry-picks` and `--empty` | Halt and ask for a Git upgrade; never silently fall back to commit-dropping behavior |
| Signing mode known | `git config --bool commit.gpgsign` | Record it; if rewritten commits require interactive pinentry in a non-TTY session, halt and hand over rather than disabling signing |

Both branches given in the invocation are the green light — no extra confirmation round. A missing branch → ask (recommend the default branch as target); never guess.

1. **Sync target to origin** — `git checkout <target>` → `git pull --ff-only`. The onto-baseline is exactly origin's latest; replaying onto a stale target layers new work over outdated state. Diverged from upstream → halt; recovery is `/git-pull` on the target (or `/git-rebase <target> @{u}`), named in the report. No remote configured → proceed on local HEAD and say so. Plain `git pull` is forbidden — it may merge/rebase and dirty the baseline.
2. **Plan and reject ambiguous topology** — record `git rev-list --reverse --topo-order <target>..<source>` as the planned commits. If `git rev-list --min-parents=2 <target>..<source>` is non-empty, halt and recommend `git-merge` unless the user explicitly requests a separately audited `--rebase-merges` workflow; never silently flatten/drop merge commits. **`--dry-run`:** report this plan plus `git diff --stat <target>...<source>` and stop here before creating guard refs or rewriting commits.
3. **Backup both** — rebase rewrites source, so guard both tips: `git branch guard/<repo>-<source-sha>-<ts>` on source HEAD and `git branch guard/<repo>-<target-sha>-<ts>` on synced target HEAD.
4. **Rebase** — `git checkout <source>` → `git -c rerere.enabled=false rebase --reapply-cherry-picks --empty=stop <target>`. `--reapply-cherry-picks` prevents patch-equivalent commits from being silently pre-dropped; commits that become empty must be explicitly logged and skipped. Clean → Step 3. Per-commit conflict → Step 2 (resolve, `git add`, `GIT_EDITOR=true git -c rerere.enabled=false rebase --continue`; repeat for every stopped commit). `Current branch <source> is up to date` → nothing to replay; report and stop.

## Step 2 — Resolve conflicts (you = the human)

Self-contained — resolve each stopped commit's conflicts here; do NOT load another skill. The onto side is the authoritative baseline; each replayed commit layers its intent ON TOP (full doctrine below).

Read before touching anything (the base for each stopped commit is its own parent, advancing as commits replay):

```bash
git diff --name-only --diff-filter=U   # textual conflicts for THIS commit
git status --porcelain                 # UU/AA/DU/UD/... structural
git rebase --show-current-patch        # what the stopped commit intended
# Stages: :1: = replayed commit's parent  :2:/HEAD = onto side (target + replayed so far)  :3: = source commit being applied
```

**Semantic evidence pass (for every stopped commit).** Read the complete current patch, its message and parent context, nearby tests, and relevant history. Query the available symbol/graph index first to map changed definitions to callers, types, schemas, configuration, generated files, and tests; fall back to targeted text search only when unavailable and record that limitation. State the invariants that the replay must preserve or intentionally change (API/data compatibility, error behavior, security, concurrency, ordering). Each hunk rationale must cite the evidence and affected invariants.

**Baseline principle.** The onto side (`:2:`/HEAD — target plus the commits already replayed) is the authoritative baseline. Each replayed commit layers its intent ON TOP, as if its author had written it against the current onto state. **Baseline ≠ winner** — neither side is "newer, therefore right": read each hunk against `:1:` (the commit's own parent) and **compose both parties' deliberate changes**; the resolution drops neither side's intent. A replayed commit must **ADD** its intent — never silently remove or undo baseline content (additions, modifications, OR deletions) unless removing it is that commit's explicit purpose. **Deletion is intentional, not absence**: honor a deliberate baseline deletion; adapt the surviving side instead of resurrecting code.

| Conflict shape | Resolution |
|---|---|
| content (both edited) | Keep the onto side's shape (interfaces, refactor, naming); re-express the replayed commit's new logic into it — the commit adapts to the baseline, never the reverse. **Both intents survive** |
| modify/delete — onto deleted, commit edited | Deletion stands; port only what the commit still genuinely needs |
| modify/delete — onto edited, commit deleted | Removal is the commit's explicit purpose — apply it; relocate the onto side's surviving need, or flag it in the rationale |
| add/add | Treat `:1:` as empty and compose both independently added versions |
| rename/rename, rename/delete, file/directory or directory rename | Trace both destinations and preserve content once at the coherent final path |
| submodule/gitlink | Inspect both SHAs and submodule history; use a descendant containing both or pause |
| binary, symlink, mode | Resolve where readable; an opaque binary may take one side via path-scoped `git checkout --ours|--theirs -- <path>`, logged |

Edit each file in place until **every `<<<<<<<` / `=======` / `>>>>>>>` marker is gone**. **Then re-read the WHOLE file once for global coherence** — hunks are not independent (a signature resolved in one hunk must match its call sites in another); repair any seam the hunk-by-hunk pass left. Then `git add <path>` → `GIT_EDITOR=true git -c rerere.enabled=false rebase --continue`. If the resolution leaves the commit empty (its change already exists on the onto side) → `git -c rerere.enabled=false rebase --skip`. Keep a **one-line rationale per hunk per commit** — it is the audit trail in Step 3. No `git checkout --theirs/--ours`, no `-X` for textual/readable files — blanket overwrites silently drop logic; only the logged opaque-binary exception above is allowed.

**Confidence self-check (per hunk).** Before `git add`, tag each hunk **confident** (both intents derivable from `:1:` and the onto side, composition unambiguous, and supported by cited symbol/caller/test or invariant evidence) or **uncertain** (ambiguous intent, both readings plausible, or a seam the coherence re-read could not repair). **When torn, choose uncertain** — a wrong resolution is a disaster and self-assessed certainty runs high. For an **uncertain** hunk, dispatch the `@advisor` subagent (task tool) first with the hunk's three sides (`:1:`/`:2:`/`:3:`), evidence, invariants, and ambiguity **without revealing your proposed resolution**; compare its independent recommendation with your proposal before acting; advisor is read-only and returns a recommendation + a 1–10 confidence + FACTUAL/PREFERENCE. Advisor returns **FACTUAL + confidence ≥ 8** (the same threshold the auto-advisor uses to act on an answer) → apply it, retag `advisor ✓ (n/10)`. Anything less — **< 8, still uncertain, or PREFERENCE** (the answer lives only in the author's head) → **never guess**: leave the rebase paused at that commit, do not `git add`/`--continue` past it, flush/finalize the audit bundle (Step 3.4), and hand the hunk to the human with both sides + advisor's analysis. **Advisor is best-effort, never a hard dependency** — if the dispatch fails, times out, is unavailable, or returns no parseable FACTUAL + ≥8 verdict, do NOT retry-loop or block: treat the hunk as unresolved and hand it over exactly as above (note `advisor unavailable` in the log); the rebase stays paused at that commit and its OTHER hunks continue. A missing second opinion never becomes a guess. Escalate only genuinely uncertain hunks (frugality), never routine ones.

**Per-commit verification gate.** When a stopped commit required manual conflict resolution, run the minimal verification from Step 3.2's ranked inference on the resolution BEFORE `git rebase --continue`. If context or cost forbids it, declare the known limitation explicitly in the report (`intermediate commits not guaranteed buildable`) — never let it pass as an implicit promise. No inferable command + manual resolution → pause the rebase at that commit, flush/finalize the audit bundle (Step 3.4), hand over resolved-but-unverified; `--no-verify` is an explicit user opt-in only, never inferred. A verify failure here is repaired only within the minimal-compile/test limit (Step 3.2); business-logic edits beyond the conflicted files → record rationale, hand over.

## Step 3 — Land & report

**Repository-level semantic interaction audit (including conflict-free replay).** Compare the target and replayed commits' changed symbols/contracts. Inspect definition↔caller, interface↔implementation, schema↔migration, config↔consumer, generated↔source, and test↔behavior interactions even when git stopped nowhere. Re-check call chains and declared invariants. Every material interaction needs targeted test/static-check evidence; unresolved business intent leaves source unlanded and target untouched.

All verification happens at the **source tip** (HEAD = fully replayed source, still checked out) BEFORE target moves — a failed or absent verify never advances target.

**Verify command — ranked inference (first hit wins).** (1) the test/build/lint gate the repo's own CI runs (`.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`); (2) a `test`/`check`/`verify` script in `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Makefile`; (3) the runner those manifests imply (`bun test`, `npm test`, `pytest`, `cargo test`, `go test ./...`, `make test`); (4) a repo-local entrypoint (`tests/run*`, `tests/test-all.*`, `scripts/test*`, `scripts/verify.*`); (5) the command documented in `CONTRIBUTING.md` / `DEVELOPING.md` / `AGENTS.md` / `README.md`. Record which rank fired. **"Not inferable" means all five ranks missed — a manifest with no `test` script is not a miss, it is the reason to check rank 1.**

1. **Mechanical check** (at source tip) — `git ls-files -u` must be empty and no `U` states may remain. Only when the recorded conflicted-path set is non-empty, pass every path as a separately quoted argument to `git grep -nE '^(<{7,}|={7,}|>{7,}|\|{7,})( |$)' -- <quoted-conflicted-path>...`; it must return nothing. Never run it with an empty path set. Fail → back to Step 2.
2. **Verify** (skip only with explicit `--no-verify`) — run the project's test/build command once (ranked inference above). **Conflicts were resolved AND no command inferable → halt**: do NOT advance target; flush/finalize the audit bundle (3.4), hand over resolved-but-unverified. Fail → repair limited to minimal compile/test fixes (the Step 2 conflicted files + their direct breakage); business-logic changes or semantic judgment beyond those files → record the rationale and hand over — **max 2 attempts**, then show the failure and hand over. Per `instructions/verification-honesty.md`: only real results, never a guessed pass.
3. **Fast-forward target** — verify passed → fetch the target upstream again when configured and compare it with the synced SHA. If it moved, halt and offer to rebase again; do not land stale work. Otherwise `git checkout <target>` → `git merge --ff-only <source>`. Target now points at the linear replayed tip. **Verify failed or absent → target MUST NOT be checked out or advanced — it stays at the synced SHA.** Not a fast-forward (target moved during the rebase) → halt, re-sync, report.
4. **Finalize the audit bundle** — on every exit path, flush `.git/ocp-rebase-reports/<operation-id>.jsonl` and write sibling `<operation-id>.md` with the `Outcome:` token, plan/land/skip mapping, refs, verification, guards/recovery, and per-commit/per-hunk decisions when applicable. Both remain inside `.git/`, never dirty status or get pushed, are never auto-deleted, and are prunable only by the user.
5. **Report**:

```
## git-rebase report
Source: <source> → onto Target: <target> (synced @ <sha>)
Planned: <P> · Landed: <N> · Skipped: <K> (<sha + reason> each) · Result: <linear @ <target-sha> | up to date | paused → handed to human | dry-run>
Outcome: <landed-verified | landed-clean | landed-no-verify-opt-in | no-op | dry-run | handed-over:{unresolved-hunk|verify-failed|no-verify-command|hook-failed|signing-interactive|topology-ambiguous|target-moved|preflight-<check>}>
Verify: <command> → <real result>   (name the inference rank that produced the command)
Intermediate commits: <verified at each stopped commit | NOT guaranteed buildable (declared, per-commit gate skipped)>   (only when conflicts were resolved)
Confidence: <H> confident · <A> advisor ✓ · <U> unresolved → handed to human   (only when conflicts were resolved)

### Conflicts resolved (<N> hunks across <M> commits)
| Commit | File | Hunk | Decision | Confidence | Rationale |
|--------|------|------|-----------|------------|-----------|

### Safety trail
- Backup: guard/<repo>-<source-sha>-<ts> (source), guard/<repo>-<target-sha>-<ts> (target)
- Audit: `.git/ocp-rebase-reports/<operation-id>.jsonl` + `.md` — redacted command trace on every invocation; per-commit decisions when applicable (never committed, user-prunable)
- History rewritten: source now has new SHAs. Landing target = plain `git push` (fast-forward). If SOURCE was already pushed, updating it needs `git push --force-with-lease` (user's call) — never plain `--force`.
- Undo: `git reset --hard guard/<repo>-<source-sha>-<ts>` on source; `git reflog` also retains the pre-rebase tips.
```

## Hard rules

1. **Stock `git rebase`** — you replace only the human's per-commit conflict resolution; no cherry-pick loop, no invented machinery.
2. **Never rebase a dirty tree or onto an unsynced target** — target pulls `--ff-only` to origin first (divergence halts); the user's uncommitted work is never auto-stashed/reset.
3. **Guard-backup BOTH branches before rewriting** — rebase rewrites source; both tips are backed up first.
4. **Baseline authority** — each replayed commit layers ONTO target HEAD; never silently removes/undoes target's changes vs the commit's parent (Step 2 baseline principle).
5. **Never blanket-overwrite a conflicted readable file** — no `--theirs`/`--ours`/`-X`; every textual hunk gets a deliberate result. Only an opaque binary may use a path-scoped side selection, logged.
6. **Never guess a low-confidence hunk** — self-check confidence per hunk (Step 2); an uncertain hunk goes to `@advisor` (read-only subagent) — apply its answer only on **FACTUAL + confidence ≥ 8**, otherwise (< 8 / uncertain / PREFERENCE / **advisor unreachable or failed**) STOP and hand that hunk to the human (rebase stays paused, guard branches protect). Advisor is best-effort: its failure degrades to handover, never to a guess, hang, or abort — the op continues on the commit's other hunks.
7. **Never `--force` push or `git reset --hard` the user's pre-existing remote** — landing target is a fast-forward `git push`; updating a rewritten source is `--force-with-lease`, and only the user decides.
8. **Never delete the guard backup branches** — surface them in the report; pruning is the user's call.
9. **Real verification only** (`instructions/verification-honesty.md`) — no `✅` for unrun commands.
10. **Language** — follow `output-protocol.md` §Session language.
11. **Verify before landing** — target fast-forwards only after a passed verify at the source tip; no inferable command + manual resolutions → halt, target stays untouched. Verify-failure repair never edits business logic beyond the conflicted files (Step 3.2).
12. **A halt is never a dead end** — every halt names the exact recovery command for that specific failure (dirty tree → the `git stash push` / `git commit` line; target diverged → `/git-pull` on it; leftover rebase → `--continue` / `--skip` / `--abort`; unique merge commits → `/git-merge <source> <target>`; target moved mid-rebase → re-run this command), leaving the user one paste from proceeding. "Fix it yourself" prose is a defect.

## Flags

- `--dry-run` — after target sync, list the commits and diffstat without creating guard refs or rewriting source; target sync itself may fast-forward the local target.
- `--no-verify` — skip the Step 3.2 verify and the per-commit gate; explicit user opt-in only, log `no verify`.
- `--continue` — resume a paused rebase after conflicts were resolved (`GIT_EDITOR=true git -c rerere.enabled=false rebase --continue`).
- `--skip` — `git -c rerere.enabled=false rebase --skip` the current commit (resolution left it empty/redundant); log its SHA and reason.
- `--abort` — `git rebase --abort`, report pre/post state; only for a stuck rebase. **If conflicts were already resolved or a decision log exists, flush/finalize the audit bundle (Step 3.4) BEFORE aborting** — abort discards the resolutions and replays.

Flags may appear anywhere; parsing is permissive and case-sensitive.

## Failure catalog

| Symptom | Cause | Action |
|---|---|---|
| `fatal: not a git repository` | Outside a repo | Halt; suggest `cd <repo>` |
| `error: pathspec '<X>' did not match` | Branch typo / missing | List branches, re-confirm |
| `git pull --ff-only` refuses | Local target diverged from origin | Halt; recovery is `/git-pull` on the target (or `/git-rebase <target> @{u}`) — name it in the report |
| Unique merge commits detected | Default rebase would flatten/drop topology | Halt; use git-merge or an explicitly requested `--rebase-merges` workflow |
| `There is no tracking information` | Target has no upstream | Proceed on declared local HEAD or configure upstream; do not classify as divergence |
| `Unable to create .git/index.lock` | Concurrent git process or stale lock | Halt; confirm no active git process before removing a stale lock |
| `Cannot rebase: You have unstaged changes` | Dirty tree | Halt; user commits/stashes |
| `Current branch <source> is up to date` | source ⊆ target | Report nothing to replay |
| `CONFLICT (content): Merge conflict in <file>` | Both edited the same region | Step 2 — baseline-first semantic resolve, `git add`, `--continue` |
| `CONFLICT (modify/delete)` | One side deleted, the other modified | Step 2 table — decide by intent, never auto-resurrect |
| `No changes - did you forget to use 'git add'?` | Resolution left the commit empty | `git -c rerere.enabled=false rebase --skip` |
| `@advisor` dispatch fails / times out / unavailable | Second opinion unreachable | Best-effort — treat the hunk as unresolved, hand it to the human; never retry-loop, never guess; the commit's other hunks continue |
| `fatal: ... rebase in progress` | Leftover from a prior run | Run this skill's `--abort` flow so any decision log is archived before aborting |
| `Not possible to fast-forward` at Step 3.3 | Target moved during the rebase | Halt; keep guards, then offer to rebase again onto the new target or leave the result unlanded |
| Hook or signing command fails/prompts | Repository policy or interactive credential required | Preserve the paused state, report real output, and hand over; never bypass hooks or disable signing implicitly |
| No verify command after ranks 1–5 | Cannot prove the replay is sound | Halt; archive and hand over `resolved-but-unverified` with `Outcome: handed-over:no-verify-command` — target NOT advanced; list what each rank looked for so the repo can be fixed once |
