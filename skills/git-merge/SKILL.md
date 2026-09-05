---
name: git-merge
description: Agent-driven analog of a manual `git merge` — sync target to origin first, then merge a source branch into it; the ONLY thing the agent replaces is the human's hands-on conflict resolution (semantic, hunk-by-hunk, target HEAD is the authoritative baseline), then `git merge --continue`. Load ONLY when the user invokes /git-merge.
---

# Git Merge Protocol (agent = the human)

You perform an ordinary `git merge` of a **source** branch into a **target** branch. Everything is stock git except one step: when git reports conflicts, **you are the human** — open each conflicted file, understand both sides, write the correct merged result, continue. No cherry-pick replay, no invented machinery. Linear per-commit replay is the separate `git-rebase` skill.

**Why stock merge is the right base:** git computes the true common ancestor (`git merge-base`) itself, so target's independent evolution is visible to the three-way merge. Conflicts appear only where both sides genuinely touched the same region — never from a wrong per-commit base silently undoing the baseline.

**Terms.** Merge source INTO target: `ours`/left = target (HEAD), `theirs`/right = source, `BASE` = merge-base of the two.

## Audit trail — every invocation

After the inside-repository check succeeds and **before any mutating git command**, create `operation-id = git-merge-<UTC>-<short-head>-<random>` and initialize `.git/ocp-merge-reports/<operation-id>.jsonl`; buffer and flush the initial repository-check event into it. Trace creation inside `.git/` is the only audit side effect permitted by `--dry-run`. If the trace cannot be created, halt before mutation. If appending later fails, pause safely and report it; never auto-abort and erase evidence.

Append and flush a `command_start` event **before every git command**, then a linked `command_end` event immediately after it; a missing end event proves interruption rather than silently erasing the attempted command. Cover preflight, fetch/pull, guards, merge, inspection, add, verification, continue/commit, skip/abort, and final status. Every event carries `schema_version: 1`, `operation_id`, `seq`, UTC `ts`, `event`, `phase`, redacted `argv` (array, never shell text), `cwd_repo_relative`, `prev_event_sha256`, and `event_sha256` over canonical JSON excluding the latter field. Start events include relevant refs/SHAs before; end events link `command_seq` and include `exit_code`, `duration_ms`, refs/SHAs after, redacted/truncated `stdout`/`stderr`, and streaming SHA-256 of each full output. Also emit conflict-state, decision, advisor/handover, verification, and recovery events through the same hash chain; record the final event hash in the Markdown summary. This chain detects truncation/accidental alteration, not malicious rewriting, and is not a digital signature. Never persist environment variables, credentials, Authorization headers, URL userinfo/tokens, private keys, or raw conflicted-file contents; redact secrets in argv and output, bound each excerpt to 4 KiB, and use restrictive file permissions where supported. Finalize a sibling `<operation-id>.md` on every exit path.

## Step 1 — Preflight, sync, merge

**Checks** — all must pass; never auto-stash/reset/checkout on failure, the user fixes or opts in:

| Check | Command | Fail |
|---|---|---|
| Inside a git repo | `git rev-parse --is-inside-work-tree` | Halt |
| Both branches exist | `git rev-parse --verify --quiet refs/heads/<b>` | Halt, list branches |
| source ≠ target | — | Halt |
| Worktree clean | `git status --porcelain --untracked-files=no` empty | Halt — refuse to merge dirty |
| No in-progress op | `MERGE_HEAD`/`CHERRY_PICK_HEAD` absent and `.git/rebase-merge`/`.git/rebase-apply` absent | Halt — offer this command's `--continue` (resume) or `--abort` (clear); never silently discard the prior op |
| Not detached HEAD | `git symbolic-ref HEAD` succeeds | Halt — attach first (check out a branch) |
| No stale lock | `.git/index.lock` absent | Halt; confirm no git process is active before removing a stale lock |
| Resolution cache known | `git config --bool rerere.enabled` | Record it; run merge/continue with `-c rerere.enabled=false` so an old resolution is never injected silently |

Both branches given in the invocation are the green light — no extra confirmation round. A missing branch → ask (recommend the default branch as target); never guess.

1. **Sync target to origin** — `git checkout <target>` → `git pull --ff-only`. The baseline is exactly origin's latest; merging onto a stale local target layers new work over outdated state. Diverged from upstream → halt. No remote configured → proceed on local HEAD and say so. Plain `git pull` is forbidden. **`--dry-run` stops here before backup:** run the fixed preview command `git -c rerere.enabled=false merge --no-commit --no-ff <source>`; do not append `--squash` (the staged content preview is equivalent and git forbids `--squash --no-ff`). Show `git diff --cached --stat` plus the conflict list. Run `git merge --abort` only when `MERGE_HEAD` exists; if already up to date, report it without abort. Then stop.
2. **Backup** — `git branch guard/<repo>-<target-sha>-<ts>` at synced HEAD.
3. **Merge** — `git -c rerere.enabled=false merge <source>` (append `--squash` / `--no-ff` per flags). Clean → Step 3 · conflict → Step 2 · `Already up to date` → report and stop.

## Step 2 — Resolve conflicts (you = the human)

Read before touching anything:

```bash
BASE=$(git merge-base <target> <source>); git diff --name-only --diff-filter=U  # record conflicted paths before editing
git status --porcelain          # UU/AA/DU/UD/... structural
git diff $BASE <target> -- <p>  # LEFT (ours/target); $BASE <source> = RIGHT (theirs/source)
# Stages: :1: git's actual base  :2: ours (target)  :3: theirs (source)
```

For criss-cross histories, `git merge-base` is explanatory only: stage `:1:` is git's recursive/ort virtual base and is authoritative for each conflicted path.

**Semantic evidence pass (before editing).** Build a compact intent dossier from the merge commit/range messages, both complete diffs vs BASE, nearby tests, and relevant `git log`/`git blame`. Query the available symbol/graph index first to map changed definitions to callers, types, schemas, configuration, generated files, and tests; only if no index exists, use targeted text search and record that limitation. Write the invariants that must survive (API compatibility, data format, error behavior, security/authorization, concurrency, ordering). A hunk is not resolved until its decision cites this evidence and preserves or explicitly changes each affected invariant.

**Baseline principle.** Target HEAD is the authoritative baseline — it landed first and is origin-synced; the merge layers the source's work on top, as if the source author had written it after target's latest state. **Baseline ≠ winner.** Neither side is "newer, therefore right": read each hunk against BASE and **compose both parties' deliberate changes** — the resolution drops neither side's intent. A source change must **ADD** its intent — it must **NEVER silently remove or undo target's baseline content** (additions, modifications, OR deletions) unless removing it is that source change's explicit purpose — and symmetrically, target's baseline is the foundation to build on, never a license to discard the source's work. **Deletion is intentional, not absence**: honor a deliberate baseline deletion; adapt the surviving side to the post-deletion world instead of resurrecting code.

In a stock merge every textual conflict means **both sides changed the same region vs BASE** — so resolve by shape:

| Conflict shape | Resolution |
|---|---|
| content (both edited) | Keep target's shape (interfaces, refactor, naming); re-express the source's new logic into it — the source adapts to the baseline, never the reverse. **Both intents survive** — "keep target's shape" is not "take target's version": dropping the source's change is as wrong as undoing the baseline |
| modify/delete — target deleted, source edited | Deletion stands; port only what the source still genuinely needs from the deleted region |
| modify/delete — target edited, source deleted | Removal is the source's explicit purpose — apply it; relocate target's surviving need elsewhere, or flag it in the rationale |
| add/add | Treat `:1:` as empty; compose both independently added versions |
| rename/rename, rename/delete, file/directory or directory rename | Trace both destinations and preserve content once at the coherent final path |
| submodule/gitlink | Inspect both SHAs and submodule history; use a descendant containing both or pause for an explicit decision |
| binary, symlink, mode | Resolve where readable; an opaque binary may take one side via path-scoped `git checkout --ours|--theirs -- <path>`, then `git add`, with side and reason logged |

Edit each file in place until **every `<<<<<<<` / `=======` / `>>>>>>>` marker is gone**. **Then re-read the WHOLE file once for global coherence** — hunks are not independent (a signature resolved in one hunk must match its call sites in another); repair any seam the hunk-by-hunk pass left. Then `git add <path>`. Keep a **one-line rationale per hunk** — it is the audit trail in Step 3. No `git checkout --theirs/--ours`, no `-X` for textual/readable files — blanket overwrites silently drop logic. The only exception is the logged opaque-binary procedure above.

**Confidence self-check (per hunk).** Before `git add`, tag each hunk **confident** (both intents derivable from BASE, composition unambiguous, and supported by cited symbol/caller/test or invariant evidence) or **uncertain** (ambiguous intent, both readings plausible, or a seam the coherence re-read could not repair). **When torn, choose uncertain** — a wrong resolution is a disaster and self-assessed certainty runs high. For an **uncertain** hunk, dispatch the `@advisor` subagent (task tool) first with the hunk's three sides (BASE/ours/theirs), evidence, invariants, and the specific ambiguity **without revealing your proposed resolution**; obtain an independent recommendation, then compare it with your proposal to reduce anchoring; advisor is read-only and returns a recommendation + a 1–10 confidence + FACTUAL/PREFERENCE. Advisor returns **FACTUAL + confidence ≥ 8** (the same threshold the auto-advisor uses to act on an answer) → apply it, retag `advisor ✓ (n/10)`. Anything less — **< 8, still uncertain, or PREFERENCE** (the answer lives only in the author's head) → **never guess**: leave the merge paused at that hunk, do not `git add`/`--continue` past it, flush/finalize the audit bundle (Step 3.4), and hand the hunk to the human with both sides + advisor's analysis. **Advisor is best-effort, never a hard dependency** — if the dispatch fails, times out, is unavailable, or returns no parseable FACTUAL + ≥8 verdict, do NOT retry-loop or block: treat the hunk as unresolved and hand it over exactly as above (note `advisor unavailable` in the log); the merge stays paused and the OTHER hunks continue. A missing second opinion never becomes a guess. Escalate only genuinely uncertain hunks (frugality), never routine ones.

## Step 3 — Finish & report

**Repository-level semantic interaction audit (every merge, including a clean auto-merge).** Textual non-overlap is not proof of compatibility. Compare both sides' changed symbols and contracts: if one side changes a definition/interface/schema/config while the other changes a caller, implementation, migration, generated artifact, or test, inspect that interaction even when git reported no conflict. Re-check whole call chains and invariants; unresolved business intent pauses landing. Map each material interaction to an existing targeted test/static check, or mark it uncertain when no adequate evidence exists.

**Verify command — ranked inference (first hit wins).** (1) the test/build/lint gate the repo's own CI runs (`.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`); (2) a `test`/`check`/`verify` script in `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Makefile`; (3) the runner those manifests imply (`bun test`, `npm test`, `pytest`, `cargo test`, `go test ./...`, `make test`); (4) a repo-local entrypoint (`tests/run*`, `tests/test-all.*`, `scripts/test*`, `scripts/verify.*`); (5) the command documented in `CONTRIBUTING.md` / `DEVELOPING.md` / `AGENTS.md` / `README.md`. Record which rank fired. **"Not inferable" means all five ranks missed — a manifest with no `test` script is not a miss, it is the reason to check rank 1.**

1. **Mechanical check** — `git ls-files -u` must be empty and no `U` states may remain. Only when the recorded conflicted-path set is non-empty, pass every path as a separately quoted argument to `git grep -nE '^(<{7,}|={7,}|>{7,}|\|{7,})( |$)' -- <quoted-conflicted-path>...`; it must return nothing. Never run the grep with an empty path set, because that scans the whole tree. Fail → back to Step 2.
2. **Verify** — run the project's test/build command once (ranked inference above). **Conflicts were resolved AND no command inferable → do NOT land**: halt, flush/finalize the audit bundle (3.4), hand over marked resolved-but-unverified — `--no-verify` is valid ONLY as an explicit user opt-in, never inferred. Fail → repair is limited to minimal compile/test fixes (the Step 2 conflicted files + their direct breakage); a fix that needs business-logic changes or semantic judgment beyond those files → record the rationale and hand over instead of editing — **max 2 attempts**, then show the failure and hand over. Per `instructions/verification-honesty.md`: only real results, never a guessed pass.
3. **Land it** — **`--squash` first (clean or conflicted):** the result is staged but never auto-committed and has no `MERGE_HEAD`; compute `BASE=$(git merge-base <target> <source>)`, generate the conventional message from `git log --oneline $BASE..<source>`, include the resolution summary when applicable, then run non-interactive `git commit -F <message-file>` — never `git merge --continue`. **Non-squash clean merge:** git already created the merge commit at Step 1.3; confirm with `git log -1`, nothing to continue. **Non-squash conflicted merge:** compose the merge subject and concise resolution body in `.git/MERGE_MSG`, then run `GIT_EDITOR=true git -c rerere.enabled=false merge --continue`. If hooks fail, report their real output and halt; never bypass them implicitly. If signing needs interactive pinentry, halt and hand over rather than disabling signing.
4. **Finalize the audit bundle** — on every exit path, flush `.git/ocp-merge-reports/<operation-id>.jsonl` and write sibling `<operation-id>.md` with the `Outcome:` token, command/result summary, refs, verification, guard/recovery data, and the full per-hunk decision log with confidence tags when conflicts occurred. Sanitize branch labels used inside the report (`/`→`-`). Both files stay inside `.git/`, never dirty status or get pushed, are never auto-deleted, and are prunable only by the user.
5. **Report**:

```
## git-merge report
Source: <source> → Target: <target> (synced @ <sha>) · Merge-base: <BASE>
Result: <fast-forward | merge commit <sha> | conflicted → resolved | squashed | paused → handed to human>
Outcome: <landed-verified | landed-clean | landed-no-verify-opt-in | no-op | dry-run | handed-over:{unresolved-hunk|verify-failed|no-verify-command|hook-failed|signing-interactive|preflight-<check>}>
Verify: <command> → <real result>   (name the inference rank that produced the command)
Confidence: <H> confident · <A> advisor ✓ · <U> unresolved → handed to human   (only when conflicts were resolved)

### Conflicts resolved (<N> files)
| File | Hunk | Decision | Confidence | Rationale |
|------|------|----------|------------|-----------|

### Safety trail
- Backup: guard/<repo>-<sha>-<ts> — revert with `git reset --hard <synced-target-sha>` (never force-push; pruning is the user's call)
- Audit: `.git/ocp-merge-reports/<operation-id>.jsonl` + `.md` — redacted command trace on every invocation; per-hunk decisions when applicable (never committed, user-prunable)
- Review: `git show <merge-sha>`; clean → `git push` / open PR
```

## Hard rules

1. **Stock `git merge`** — you replace only the human's conflict resolution; no cherry-pick/rebase (linear per-commit replay is the `git-rebase` skill).
2. **Never merge from a dirty or unsynced baseline** — target pulls `--ff-only` to origin first (divergence halts); the user's uncommitted work is never auto-stashed/reset.
3. **Baseline authority** — source layers ON TOP of target HEAD; never silently removes/undoes target's changes vs BASE (Step 2 baseline principle).
4. **Never blanket-overwrite a conflicted readable file** — no `--theirs`/`--ours`/`-X`; every textual hunk gets a deliberate result. Only an opaque binary may use path-scoped `git checkout --ours|--theirs`, logged.
5. **Never guess a low-confidence hunk** — self-check confidence per hunk (Step 2); an uncertain hunk goes to `@advisor` (read-only subagent) — apply its answer only on **FACTUAL + confidence ≥ 8**, otherwise (< 8 / uncertain / PREFERENCE / **advisor unreachable or failed**) STOP and hand that hunk to the human (merge stays paused, guard branch protects). Advisor is best-effort: its failure degrades to handover, never to a guess, hang, or abort — the op continues on the other hunks.
6. **Never `--force` push or `git reset --hard` the user's pre-existing remote target** — the merge commit is local; pushing is the user's call.
7. **Never delete the guard backup branch** — surface it in the report; pruning is the user's call.
8. **Real verification only** (`instructions/verification-honesty.md`) — no `✅` for unrun commands.
9. **Language** — follow `output-protocol.md` §Session language.
10. **No silent unverified landing** — a merge with manually resolved conflicts lands only after a real verify run or an explicit user `--no-verify`; no inferable command → halt and hand over, never default to landing. Verify-failure repair never edits business logic beyond the conflicted files (Step 3.2).
11. **A halt is never a dead end** — every halt names the exact recovery command for that specific failure (dirty tree → the `git stash push` / `git commit` line; target diverged → `/git-pull` on it, or `/git-rebase <target> @{u}`; leftover op → `--continue` / `--abort`; detached HEAD → `git switch <branch>`), leaving the user one paste from proceeding. "Fix it yourself" prose is a defect.

## Flags

- `--dry-run` — after the target sync step, preview the merge and conflicts without creating a guard ref or merge result; target sync itself may fast-forward the local target.
- `--no-verify` — skip the Step 3.2 verify; explicit user opt-in only (never inferred), log `no verify`.
- `--squash` — all source changes as one commit; agent generates commit message from source `git log`.
- `--no-ff` — force a merge commit even when fast-forward is possible.
- `--continue` — resume a paused non-squash merge after repeating Step 2 evidence/coherence checks, then use the non-interactive continue command in Step 3.3.
- `--abort` — `git merge --abort`, report pre/post state; only for a stuck merge. **If any conflicts were already resolved or a decision log exists, flush/finalize the audit bundle (Step 3.4) BEFORE aborting** — abort discards the resolutions.

Flags may appear anywhere; parsing is permissive and case-sensitive.

## Failure catalog

| Symptom | Cause | Action |
|---|---|---|
| `fatal: not a git repository` | Outside a repo | Halt; suggest `cd <repo>` |
| `error: pathspec '<X>' did not match` | Branch typo / missing | List branches, re-confirm |
| `git pull --ff-only` refuses | Local target diverged from origin | Halt; recovery is `/git-pull` on the target (or `/git-rebase <target> @{u}`) — name it in the report |
| `There is no tracking information` | Target has no upstream | Proceed on declared local HEAD or configure upstream; do not classify as divergence |
| `Unable to create .git/index.lock` | Concurrent git process or stale lock | Halt; confirm no active git process before removing a stale lock |
| `Your local changes would be overwritten by merge` | Dirty tree | Halt; user commits/stashes |
| `Already up to date` | source ⊆ target | Report nothing to merge |
| `CONFLICT (content): Merge conflict in <file>` | Both edited the same region | Step 2 — baseline-first semantic resolve |
| `CONFLICT (modify/delete)` | One side deleted, the other modified | Step 2 table — decide by intent, never auto-resurrect |
| `CONFLICT (rename/…)`, `(binary files differ)` | Structural | Resolve where readable; opaque binary takes one side, logged |
| `@advisor` dispatch fails / times out / unavailable | Second opinion unreachable | Best-effort — treat the hunk as unresolved, hand it to the human; never retry-loop, never guess; other hunks continue |
| No verify command after ranks 1–5 | Cannot prove the resolution is sound | Halt; archive and hand over `resolved-but-unverified` with `Outcome: handed-over:no-verify-command`, listing what each rank looked for so the repo can be fixed once |
| `fatal: ... merge in progress` | Leftover from a prior run | Run this skill's `--abort` flow so any decision log is archived before aborting |
