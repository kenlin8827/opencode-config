---
name: git-pick
description: Agent-driven analog of manual git cherry-pick — copy selected commits, or all non-merge commits unique to a source branch, onto a target branch; resolve conflicts per commit and continue cherry-pick. Produces new ordinary commits, never a merge commit. Load ONLY when the user invokes /git-pick.
---

# Git Pick Protocol (agent = the human)

You perform ordinary `git cherry-pick`: copy one or more commits onto a target branch. Everything is stock git except one step: when git pauses on a conflict, you are the human — resolve each file semantically, stage it, then run `git cherry-pick --continue`. Each picked commit becomes a **new ordinary one-parent commit**; its SHA changes and the source branch is not rewritten.

## Syntax and meaning

```text
/git-pick <source> <target> <commit> [<commit>...]
/git-pick <source> <target> --all
/git-pick --continue | --skip | --abort
```

`<commit>` may be a SHA or ref. With `--all`, the set is `source` reachable but not `target` reachable:

```bash
git rev-list --reverse --topo-order --no-merges <target>..<source>
```

Thus `--all` means all **non-merge commits unique to source**, not the entire source history and not commits already present in target. Merge commits are excluded by default because their mainline is ambiguous; do not silently invent `-m`. Report them as skipped. Explicit merge commits halt with an explanation and require the user to choose a mainline.

## Audit trail — every invocation

After the inside-repository check succeeds and **before any mutating git command**, create `operation-id = git-pick-<UTC>-<short-head>-<random>` and initialize `.git/ocp-pick-reports/<operation-id>.jsonl`; buffer and flush the repository-check event. Trace creation inside `.git/` is the only audit side effect permitted by `--dry-run`. Failure to create it halts before mutation; a later append failure pauses safely without auto-abort.

Append and flush `command_start` before every git command and a linked `command_end` immediately afterward; a missing end records an interruption. Cover preflight, sync, plan, guard, each pick, inspection, add, verify, continue/skip/abort, and final status. Every event includes `schema_version: 1`, `operation_id`, `seq`, UTC `ts`, `event`, `phase`, redacted `argv` array, `cwd_repo_relative`, `prev_event_sha256`, and `event_sha256` over canonical JSON excluding that field. Start events include refs/SHAs before; end events link `command_seq` and include `exit_code`, `duration_ms`, refs/SHAs after, redacted/truncated stdout/stderr, and streaming SHA-256 of each full stream. Plan/mapping/skip, conflicts, decisions, advisor/handover, verification, and recovery share the hash chain; record its final event hash in the Markdown summary. The chain detects truncation/accidental changes, not malicious rewriting. Never persist environment variables, credentials, Authorization, URL userinfo/tokens, private keys, or raw conflicted-file contents; redact argv/output, cap excerpts at 4 KiB, and use restrictive permissions where supported. Finalize sibling `<operation-id>.md` on every exit path.

## Step 1 — Preflight, sync, backup, pick

All checks must pass. Never auto-stash, reset, or discard user work.

| Check | Command | Fail |
|---|---|---|
| Inside a git repo | `git rev-parse --is-inside-work-tree` | Halt |
| Both branches exist | `git rev-parse --verify --quiet refs/heads/<b>` | Halt, list branches |
| source ≠ target | — | Halt |
| Worktree clean | `git status --porcelain --untracked-files=no` empty | Halt |
| No in-progress operation | `MERGE_HEAD`/`CHERRY_PICK_HEAD` absent and `.git/rebase-merge`/`.git/rebase-apply` absent | Halt — offer this command's `--continue` (resume) or `--abort` (clear); never silently discard the prior op |
| Not detached HEAD | `git symbolic-ref HEAD` succeeds | Halt — attach first |
| No stale lock | `.git/index.lock` absent | Halt; confirm no git process is active before removing a stale lock |
| Resolution cache known | `git config --bool rerere.enabled` | Record it; run pick/continue with `-c rerere.enabled=false` |
| Required pick options supported | `git cherry-pick -h` exposes `--[no-]allow-empty` and `--empty` | Halt and ask for a Git upgrade; never silently drop an empty commit |

1. **Sync target** — `git checkout <target>` then `git pull --ff-only`. If no remote is configured, proceed on local HEAD and say so. Divergence halts. Plain `git pull` is forbidden.
2. **Build the plan** — explicit commits are picked in the order supplied; warn if that order violates ancestry and recommend reverse topological order; `--all` uses the `rev-list` command above. Classify each planned commit whose `git diff-tree --root --no-commit-id --name-only -r <commit>` output is empty as **originally empty**; preserving that commit may be intentional. Show source, target, target SHA, commit count, skipped merge commits, originally-empty commits, and the plan. `--dry-run` reports the plan and diffstat, changing nothing.
3. **Backup target** — create `guard/<repo>-<target-sha>-<ts>` before changing target. Source is not rewritten, so no source backup is required.
4. **Pick** — from target, execute the stock command for each planned commit in order: normal commit → `git -c rerere.enabled=false cherry-pick --empty=stop <commit>`; originally-empty commit → `git -c rerere.enabled=false cherry-pick --allow-empty --empty=stop <commit>` so milestone/audit intent is preserved. Never apply `--allow-empty` to a commit that became empty only because target already contains its change. If git stops, go to Step 2. If clean, continue to Step 3.

## Step 2 — Resolve conflicts (you = the human)

For the stopped commit, inspect before editing:

```bash
git diff --name-only --diff-filter=U
git status --porcelain
git show --stat --oneline CHERRY_PICK_HEAD
git show CHERRY_PICK_HEAD
```

**Semantic evidence pass (for every stopped commit).** Read the complete commit patch/message and parent context, nearby tests, and relevant history. Query the available symbol/graph index first to map changed definitions to callers, types, schemas, configuration, generated files, and tests; fall back to targeted text search only when unavailable and record that limitation. State the API/data/error/security/concurrency/ordering invariants affected. Every hunk decision must cite evidence and preserve or intentionally change each invariant.

For cherry-pick conflicts, `:2:`/HEAD is the target side (target plus commits already picked), and `:3:` is the commit being applied. Read each hunk against `:1:` (the picked commit's parent). `ours` = the current branch (target) = the baseline; `theirs` = the picked commit = the change intent — **this mapping never flips**. (Same orientation as rebase, where `:2:`/HEAD is also the onto/baseline side; only a merge of a foreign branch tempts the opposite reading.) The target is the authoritative baseline; adapt the picked commit's intent to it and preserve both deliberate intents. Never silently undo target changes, including deletions. Rename/delete conflicts resolve by intent the same way — a rename is the commit's (or target's) explicit purpose, never silently undone.

| Conflict shape | Resolution |
|---|---|
| content | Keep the target shape/interfaces and re-express the picked commit's logic into it; preserve both intents |
| modify/delete — target deleted | Keep deletion; port only still-needed intent |
| modify/delete — picked commit deleted | Apply removal when it is the commit's explicit purpose; preserve unrelated target work |
| add/add | Treat `:1:` as empty and compose both independently added versions |
| rename/rename, rename/delete, file/directory or directory rename | Trace both destinations and preserve content once at the coherent final path |
| submodule/gitlink | Inspect both SHAs and submodule history; use a descendant containing both or pause |
| binary, symlink, mode | Resolve where readable; an opaque binary may take one side via path-scoped `git checkout --ours|--theirs -- <path>`, logged |

Record the conflicted path set before editing. Remove every conflict marker, including diff3 `|||||||`, then re-read each whole file for coherence. Do not use `git checkout --ours/--theirs` or `-X` for textual/readable files; only the logged opaque-binary exception above is allowed. Stage resolved paths and run `GIT_EDITOR=true git -c rerere.enabled=false cherry-pick --continue`. If a non-empty source commit became empty because target already contains its change, use `git -c rerere.enabled=false cherry-pick --skip` and report it. Never use this rule to discard a commit classified as originally empty in Step 1.2.

For every hunk, record a one-line rationale and a confidence tag. An uncertain hunk must be dispatched to `@advisor` first with all three stages, evidence, invariants, and the ambiguity **without revealing the proposed resolution**; compare its independent recommendation with the proposal to reduce anchoring. Apply only a FACTUAL answer with confidence ≥ 8. Otherwise leave the cherry-pick paused and hand it to the user; advisor failure is never a reason to guess.

**Per-commit gate.** Each stopped commit gets its own three-way analysis and its own verification: if it needed manual conflict resolution, run the minimal verification from Step 3.2's ranked inference BEFORE `git cherry-pick --continue`. No inferable command + manual resolution → pause, flush/finalize the audit bundle, hand over resolved-but-unverified; `--no-verify` is an explicit user opt-in only, never inferred. If cost/context forbids per-commit verification, declare `picked commits not individually verified` in the report — a known limitation, never an implicit promise. A non-empty source commit that became empty (change already in target — duplicate) → `git -c rerere.enabled=false cherry-pick --skip` and report it; an originally-empty source commit is preserved with `--allow-empty`; `--continue` never lands an empty commit.

## Step 3 — Verify and report

**Repository-level semantic interaction audit (including conflict-free picks).** Compare picked definitions/contracts with the target's callers, implementations, migrations, configuration consumers, generated artifacts, and tests. Textual non-overlap is not proof of compatibility. Re-check call chains and declared invariants; every material interaction needs targeted test/static-check evidence, otherwise pause as uncertain.

**Verify command — ranked inference (first hit wins).** (1) the test/build/lint gate the repo's own CI runs (`.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`); (2) a `test`/`check`/`verify` script in `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Makefile`; (3) the runner those manifests imply (`bun test`, `npm test`, `pytest`, `cargo test`, `go test ./...`, `make test`); (4) a repo-local entrypoint (`tests/run*`, `tests/test-all.*`, `scripts/test*`, `scripts/verify.*`); (5) the command documented in `CONTRIBUTING.md` / `DEVELOPING.md` / `AGENTS.md` / `README.md`. Record which rank fired. **"Not inferable" means all five ranks missed — a manifest with no `test` script is not a miss, it is the reason to check rank 1.**

1. Confirm mechanically: `git ls-files -u` is empty and `git status --porcelain` has no `U` states. Only when the recorded conflicted-path set is non-empty, pass every path separately quoted to `git grep -nE '^(<{7,}|={7,}|>{7,}|\|{7,})( |$)' -- <quoted-conflicted-path>...`; it must return nothing. Never run it with an empty path set.
2. Unless `--no-verify` (explicit user opt-in only), run the project test/build command once (ranked inference above). **None inferable + conflicts were resolved → do NOT report verified**: halt, flush/finalize the audit bundle, hand over resolved-but-unverified. A failure gets at most two repair attempts, limited to minimal compile/test fixes on the conflicted files; business-logic edits beyond them → record rationale and hand over. If a repair passes, continue to Step 3.3; only exhausted or out-of-scope failures are handed over with real output.
3. **Finalize the audit bundle** — on every exit path, flush `.git/ocp-pick-reports/<operation-id>.jsonl` and write sibling `<operation-id>.md` with the `Outcome:` token, planned/landed/skipped mapping, refs, verification, guard/recovery data, and hunk decisions when applicable. Both stay in `.git/`, never dirty status or get pushed, are never auto-deleted, and are prunable only by the user.
4. Report the new commit SHAs, skipped commits, verification result, guard branch, and any unresolved hunks.

```text
## git-pick report
Source: <source> → Target: <target>
Planned: <P> · Landed: <N> · Skipped: <K> (<sha + reason> each) · Skipped merges: <M> · Result: <target-sha> | paused | dry-run
Outcome: <landed-verified | landed-clean | landed-no-verify-opt-in | no-op | dry-run | handed-over:{unresolved-hunk|verify-failed|no-verify-command|hook-failed|signing-interactive|mainline-ambiguous|preflight-<check>}>
Commit mapping: <source-sha> → <new-target-sha>
Verify: <command> → <real result>   (name the inference rank that produced the command)
Confidence: <H> confident · <A> advisor ✓ · <U> unresolved → handed to human   (when conflicts were resolved)
Backup: guard/<repo>-<target-sha>-<ts>
```

## Hard rules

1. Use stock `git cherry-pick`; do not implement a custom patch-copy loop.
2. `--all` means `target..source`, reverse topological order, excluding merge commits.
3. Conflict resolution is baseline-first, per hunk, and never a blanket overwrite.
4. Never guess an uncertain hunk; pause and hand it to the user if advisor cannot give FACTUAL confidence ≥ 8.
5. Never create a merge commit. `git cherry-pick --continue` creates a new ordinary commit with the target as its parent.
6. Never reset or force-push. Undo with the guard branch or `git cherry-pick --abort`; source history is unchanged.
7. Use real verification results only.
8. **Never land manual resolutions unverified** — no inferable command → halt and hand over; `--no-verify` is never inferred, only explicitly given. Repair never edits business logic beyond the conflicted files.
9. **Never flip ours/theirs** — `ours` = current branch, `theirs` = the picked commit, for every picked commit individually.
10. **A halt is never a dead end** — every halt names the exact recovery command for that specific failure (dirty tree → the `git stash push` / `git commit` line; target diverged → `/git-pull` on it; leftover pick → `--continue` / `--skip` / `--abort`; merge commit named → the `-m <n>` mainline choice only the user can make), leaving the user one paste from proceeding. "Fix it yourself" prose is a defect.

## Flags

- `--all` — pick all non-merge commits reachable from source but not target.
- `--dry-run` — show the plan and diffstat without changing refs or worktree; the audit bundle inside `.git/` is still written.
- `--no-verify` — skip verification and report that it was skipped.
- `--continue` — continue a paused cherry-pick after repeating the evidence/coherence checks, using `GIT_EDITOR=true git -c rerere.enabled=false cherry-pick --continue`.
- `--skip` — use `git -c rerere.enabled=false cherry-pick --skip` only for a commit that became empty/redundant or was explicitly rejected; never silently discard an originally-empty commit.
- `--abort` — abort the in-progress cherry-pick and report pre/post state. **If conflicts were already resolved or a decision log exists, flush decision events and finalize the audit bundle (Step 3.3) BEFORE aborting** — abort discards the resolutions.

Hooks and signing policy remain active. If a hook fails or signing requires interactive credentials unavailable in-session, preserve the paused state, report real output, and hand over; never bypass hooks or disable signing implicitly.

Flags may appear anywhere and are case-sensitive.

## Failure catalog

| Symptom | Cause | Action |
|---|---|---|
| `fatal: not a git repository` | Outside a repo | Halt; suggest `cd <repo>` |
| `error: pathspec '<X>' did not match` | Branch typo / missing | Halt; list branches, re-confirm |
| `git pull --ff-only` refuses | Local target diverged from origin | Halt; recovery is `/git-pull` on the target (or `/git-rebase <target> @{u}`) — name it in the report |
| `There is no tracking information` | Target has no upstream | Proceed on declared local HEAD or configure upstream; do not classify as divergence |
| `Unable to create .git/index.lock` | Concurrent git process or stale lock | Halt; confirm no active git process before removing a stale lock |
| `Your local changes would be overwritten` | Dirty tree | Halt; user commits/stashes |
| `fatal: '<x>' is not a commit` | Bad SHA/ref, or it lives in another repo | Halt; list candidates with `git log --oneline <target>..<source>`, never guess |
| `<sha> is a merge but no -m option was given` | A merge commit was named explicitly | Halt; the user picks the mainline — never invent `-m` |
| `The previous cherry-pick is now empty` | Target already contains that change | `git -c rerere.enabled=false cherry-pick --skip`; log SHA + reason. Never apply this to an originally-empty commit |
| `CONFLICT (content)` | Both edited the same region | Step 2 — baseline-first semantic resolve |
| `CONFLICT (modify/delete)` | One side deleted, the other modified | Step 2 table — decide by intent, never auto-resurrect |
| `@advisor` dispatch fails / times out / unavailable | Second opinion unreachable | Best-effort — treat the hunk as unresolved, hand it to the human; never retry-loop, never guess; the commit's other hunks continue |
| No verify command after ranks 1–5 | Cannot prove the resolution is sound | Halt; archive and hand over `resolved-but-unverified` with `Outcome: handed-over:no-verify-command`, listing what each rank looked for so the repo can be fixed once |
| Hook or signing command fails/prompts | Repository policy or interactive credential required | Preserve the paused state, report real output, and hand over; never bypass hooks or disable signing implicitly |
| `fatal: ... cherry-pick in progress` | Leftover from a prior run | Run this skill's `--abort` flow so any decision log is archived before aborting |
