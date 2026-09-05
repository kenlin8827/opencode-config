# Git Workflows

Five slash commands wrap **stock git**. Nothing is invented: no custom patch-copy loop, no
merge machinery of our own. The agent replaces exactly one role — **the human at conflict
resolution**. Everything else is the git command you already know, with preflight, guard
backups, verification, and an audit trail around it.

| Command | Stock git | Rewrites history? | Guard backup |
|---|---|---|---|
| [`/git-pull`](#git-pull) | `git pull --ff-only`, then reconcile | Only if diverged **and** `--rebase` | Current branch tip (only when diverged) |
| [`/git-push`](#git-push) | normal `git push`, then reconcile if rejected | Only if diverged **and** `--rebase` | Current branch tip (before reconcile) |
| [`/git-merge`](#git-merge) | `git merge` | No | Target tip |
| [`/git-pick`](#git-pick) | `git cherry-pick` | No — source untouched | Target tip |
| [`/git-rebase`](#git-rebase) | `git rebase` | **Yes** — source gets new SHAs | **Both** tips |

All five are **agent-less**: they run under whichever agent is current (the default `lite`
agent carries scoped permission for exactly these five skills).

---

## Picking one

| You want to… | Use |
|---|---|
| Bring the current branch up to date with its upstream | `/git-pull` |
| Bring the current branch up to date, replaying your local commits linearly | `/git-pull --rebase` |
| Push the current branch safely, reconciling a remote-ahead rejection | `/git-push` |
| Push after explicitly choosing linear replay or a merge commit | `/git-push --rebase` · `/git-push --merge` |
| Explicitly allow a guarded rewrite after rebase | `/git-push --force-with-lease` |
| Land a whole feature branch, keeping both sides' topology | `/git-merge <source> <target>` |
| Land a whole feature branch as **one** clean commit | `/git-merge <source> <target> --squash` |
| Replay **all** of a branch's unique commits onto another, linearly | `/git-rebase <source> <target>` |
| Copy only **some** commits across | `/git-pick <source> <target> <sha>…` |
| Copy every non-merge commit unique to a branch (no merge commit, source intact) | `/git-pick <source> <target> --all` |
| Resume / abandon a paused operation | `--continue` · `--skip` · `--abort` on the same command |

**Hard boundaries.** `/git-pull` never accepts `--squash` — squashing your own branch's
published remote history rewrites shared history and is never legitimate. `/git-pick` never
creates a merge commit; each pick lands as a new ordinary one-parent commit. `/git-rebase`
halts when the replay range contains merge commits rather than silently flattening them —
use `/git-merge`, or explicitly ask for a separately audited `--rebase-merges` workflow.

---

## Shared doctrine

The five protocols are deliberately isomorphic. This is the single description of what all
of them do; per-command sections below only cover what differs.

### 1. Preflight halts — it never cleans up after you

Every command checks: inside a git repo · branches exist · source ≠ target · worktree clean
(`git status --porcelain --untracked-files=no`) · no operation in progress (`MERGE_HEAD`,
`CHERRY_PICK_HEAD`, `.git/rebase-merge`, `.git/rebase-apply`) · not detached HEAD · no stale
`.git/index.lock` · `rerere.enabled` recorded, then **disabled** for the run
(`-c rerere.enabled=false`) so a cached old resolution is never injected silently.

On failure the agent **halts and reports**. It never auto-stashes, auto-resets, or discards
your uncommitted work — you fix it or explicitly opt in. Supplying both branches *is* the
green light: no extra confirmation round. A missing branch is a question, never a guess.

`git-rebase` and `git-pick` additionally verify that the git version supports the options
they depend on (`--reapply-cherry-picks` / `--empty` / `--allow-empty`) and halt asking for
a git upgrade rather than falling back to commit-dropping behavior. `git-rebase` also
records `commit.gpgsign`: if rewritten commits would need interactive pinentry in a
non-TTY session, it hands over instead of disabling signing.

### 2. Target is synced to origin first

`git checkout <target>` → `git pull --ff-only`. The baseline is exactly origin's latest;
layering new work onto a stale local target is how regressions sneak in. Diverged from
upstream → halt, you reconcile. No remote configured → proceed on local HEAD and say so.
**Plain `git pull` is forbidden** — its implicit merge/rebase dirties the baseline.

### 3. Guard backups before anything mutates

`git branch guard/<repo>-<sha>-<ts>`. `git-rebase` guards **both** tips because it rewrites
source. The agent **never deletes a guard branch**; it surfaces them in the report and
pruning stays your call.

### 4. The authoritative baseline

Target HEAD is the baseline; the other side **layers on top** of it, as if its author had
written the change against target's latest state.

- **Baseline ≠ winner.** Neither side is "newer, therefore right". Read each hunk against
  the merge base (`:1:`) and **compose both parties' deliberate changes** — a resolution
  that drops either side's intent is wrong.
- The layered side must **ADD** its intent. It must never silently remove or undo baseline
  content — additions, modifications, **or deletions** — unless removing it is that change's
  explicit purpose.
- **Deletion is intentional, not absence.** A deliberate baseline deletion is honored; the
  surviving side is adapted to the post-deletion world instead of resurrecting the code.

Side labels: merge → `ours`/`:2:` = target, `theirs`/`:3:` = source. Rebase and pick →
`:2:`/HEAD = the onto side (target plus what already landed), `:3:` = the commit being
applied. **The mapping never flips.**

### 5. Evidence before editing

Before touching a conflicted file the agent builds an intent dossier: commit/range messages,
both complete diffs against the base, nearby tests, relevant `git log`/`git blame`. It
queries the available symbol/graph index first to map changed definitions to callers, types,
schemas, configuration, generated files, and tests — falling back to targeted text search
only when no index exists, and recording that limitation. It then states the invariants the
result must preserve (or intentionally change): API and data compatibility, error behavior,
security/authorization, concurrency, ordering. **A hunk is not resolved until its decision
cites this evidence.**

### 6. Resolution by conflict shape

| Shape | Resolution |
|---|---|
| Content (both edited) | Keep the baseline's shape (interfaces, refactor, naming); re-express the other side's new logic into it. Both intents survive |
| Modify/delete — baseline deleted | The deletion stands; port only what the other side still genuinely needs |
| Modify/delete — other side deleted | Removal is its explicit purpose — apply it; relocate the baseline's surviving need or flag it in the rationale |
| Add/add | Treat `:1:` as empty; compose both independently added versions |
| Rename/rename, rename/delete, file↔directory | Trace both destinations; preserve the content once, at the coherent final path |
| Submodule / gitlink | Inspect both SHAs and submodule history; use a descendant containing both, or pause for an explicit decision |
| Binary, symlink, mode | Resolve where readable; an opaque binary may take one side via path-scoped `git checkout --ours\|--theirs -- <path>`, then `git add`, with side and reason logged |

Every marker goes — including diff3 `|||||||`. Then the agent **re-reads the whole file once
for global coherence**, because hunks are not independent: a signature resolved in one hunk
must match its call sites in another. Only then `git add`.

**Never** `git checkout --theirs/--ours` and never `-X` on textual, readable files —
blanket overwrites silently drop logic. The logged opaque-binary case is the only exception.

### 7. Confidence self-check → `@advisor` → you

Before staging, every hunk is tagged **confident** (both intents derivable from the base,
composition unambiguous, backed by cited symbol/caller/test or invariant evidence) or
**uncertain** (ambiguous intent, both readings plausible, or a seam the coherence re-read
could not repair). **When torn, choose uncertain** — a wrong resolution is a disaster, and
self-assessed certainty runs high.

An uncertain hunk is dispatched to the read-only `@advisor` subagent with all three sides,
the evidence, the invariants, and the specific ambiguity — **without revealing the proposed
resolution**, so the second opinion stays independent. Advisor returns a recommendation, a
1–10 confidence, and a FACTUAL/PREFERENCE classification.

- **FACTUAL + confidence ≥ 8** → adopted, retagged `advisor ✓ (n/10)`.
- Anything less — `< 8`, still uncertain, or **PREFERENCE** (the answer lives only in the
  author's head) → **never guess**. The operation pauses at that hunk, does not stage or
  continue past it, finalizes the audit bundle, and hands the hunk to you with both sides
  plus the advisor's analysis.
- **Advisor is best-effort, never a hard dependency.** If the dispatch fails, times out, or
  returns nothing parseable, there is no retry loop and no block: the hunk is treated as
  unresolved and handed over (logged as `advisor unavailable`), while the other hunks
  continue. A missing second opinion never becomes a guess.

Only genuinely uncertain hunks are escalated — routine ones are not, for frugality.

### 8. Semantic interaction audit — even when git stopped nowhere

Textual non-overlap is **not** proof of compatibility. Every run — including a clean
auto-merge, a conflict-free pick, and an unstopped replay — compares both sides' changed
symbols and contracts: definition↔caller, interface↔implementation, schema↔migration,
config↔consumer, generated↔source, test↔behavior. Each material interaction is mapped to an
existing targeted test or static check, or marked uncertain; unresolved business intent
pauses landing.

### 9. Mechanical check, then verify once — honestly

`git ls-files -u` must be empty and no `U` states may remain. The conflict-marker grep runs
**only** with the recorded conflicted paths, each separately quoted — never with an empty
path set, which would scan the whole tree.

Then the project's test/build command runs **once**, chosen by a ranked inference — first hit
wins:

1. the test/build/lint gate the repo's own CI runs (`.github/workflows/*.yml`,
   `.gitlab-ci.yml`, `Jenkinsfile`)
2. a `test`/`check`/`verify` script in `package.json`, `pyproject.toml`, `Cargo.toml`,
   `go.mod`, or `Makefile`
3. the runner those manifests imply (`bun test`, `npm test`, `pytest`, `cargo test`,
   `go test ./...`, `make test`)
4. a repo-local entrypoint (`tests/run*`, `tests/test-all.*`, `scripts/test*`,
   `scripts/verify.*`)
5. the command documented in `CONTRIBUTING.md`, `DEVELOPING.md`, `AGENTS.md`, or `README.md`

The report names the rank that fired. **"Not inferable" means all five ranks missed** — a
manifest with no `test` script is not a miss, it is the reason to check rank 1. That
distinction is what stops a correctly resolved merge from being handed back unverified, and it
is why CI comes first: the workflow file is the one place a repo states what actually proves
it green. The rules around the run:

- **Conflicts were resolved and no command is inferable → do not land.** The agent halts,
  finalizes the audit bundle, and hands over marked *resolved-but-unverified*.
- `--no-verify` is valid **only** as your explicit opt-in. It is never inferred.
- A failure gets at most **2** repair attempts, limited to minimal compile/test fixes on the
  conflicted files and their direct breakage. Anything needing business-logic changes beyond
  them is recorded and handed over instead of edited.
- Only real results are ever reported — no `✅` for a command that did not run.

`git-pick` and `git-rebase` also gate **per commit**: a stopped commit that needed manual
resolution is verified before `--continue`. When cost or context forbids that, the report
declares it explicitly (`picked commits not individually verified`,
`intermediate commits not guaranteed buildable`) — a stated limitation, never an implicit
promise.

`git-rebase` verifies at the **source tip** before target moves: a failed or absent verify
never advances target.

### 10. Audit trail — every invocation

Every run, including `--dry-run` and entirely clean ones, writes:

```
.git/ocp-<op>-reports/<operation-id>.jsonl   redacted, hash-chained command trace
.git/ocp-<op>-reports/<operation-id>.md      human summary + decision log
```

`<op>` is `merge` / `pick` / `pull` / `push` / `rebase`; `operation-id` is
`git-<op>-<UTC>-<short-head>-<random>`. A `command_start` event is appended and flushed
**before every git command**, with a linked `command_end` right after — a missing end event
proves interruption instead of silently erasing the attempt. Events carry `schema_version: 1`,
`operation_id`, `seq`, UTC `ts`, `event`, `phase`, a redacted `argv` **array** (never shell
text), `cwd_repo_relative`, `prev_event_sha256`, and `event_sha256` over the canonical JSON
excluding that field. End events add `command_seq`, `exit_code`, `duration_ms`, refs/SHAs
after, redacted and truncated `stdout`/`stderr`, and a streaming SHA-256 of each full output
stream. Conflict-state, decision, advisor/handover, verification, and recovery events ride
the same chain; the Markdown summary records the final event hash.

**What the chain is and is not.** It detects truncation and accidental alteration. It is
**not** a digital signature and does not prove anything against a deliberate rewriter.

**What is never persisted:** environment variables, credentials, `Authorization` headers, URL
userinfo/tokens, private keys, or raw conflicted-file contents. `argv` and output are
redacted, each excerpt is capped at **4 KiB**, and restrictive file permissions are used
where the platform supports them.

Both files live inside `.git/` — they never dirty `git status`, never get pushed, and are
never auto-deleted; pruning them is your call. Creating the trace is the **only** side
effect `--dry-run` permits. If it cannot be created, the operation halts before mutating
anything; if a later append fails, it pauses safely and reports rather than auto-aborting
and erasing evidence. `/git-pull` links a child operation ID to the delegated merge/rebase
trace, recording parent/child in both.

### 11. What the agent never does

Never `--force` push, and never `git reset --hard` your pre-existing remote — results land
locally and pushing is your call (after a rebase, updating an already-pushed source needs
`git push --force-with-lease`, and only you decide). Never delete a guard branch. Never
bypass a failing hook or disable signing implicitly — it reports the real output, preserves
the paused state, and hands over. Never land manually resolved conflicts unverified.

Never leave you at a dead end either. **Every halt names the exact recovery command** for that
specific failure — a dirty tree gets the `git stash push` / `git commit` line, a diverged
target gets `/git-pull` (or `/git-rebase <target> @{u}`), a leftover operation gets
`--continue` / `--abort`, a detached HEAD gets `git switch <branch>`. Halting instead of
guessing is the safe action; halting without the way back is the defect.

---

## Per-command notes

### `/git-pull`

Syncs the **current** branch; it takes no branch arguments. `@{u}` is the single source of
truth for what this branch pulls from — `origin` is never hardcoded unless it *is* the
configured upstream. Flow: preflight → `git fetch <remote>` → `git pull --ff-only`. Success
is the whole job in the common case: `fast-forwarded @ <sha>`, done, nothing rewritten.

Refused → **diverged**: it reports both sides (`git rev-list --left-right --count` plus each
side's `git log --oneline`), guard-backs-up the branch, then **delegates**:

- default → the `git-merge` protocol with source = `@{u}` (the fetched upstream ref) and
  target = the local branch;
- `--rebase` → the `git-rebase` protocol with source = the local branch and onto = `@{u}`,
  skipping rebase's own backup (the tip is already guarded) and its final fast-forward (the
  checked-out branch *is* the landed result, and a remote-tracking ref is never checked out
  or moved).

Conflict resolution, the interaction audit, verification, archiving, and reporting all come
from the delegated protocol — `/git-pull` does not re-implement them.

### `/git-push`

Safely pushes the **current** branch to its configured upstream; it takes no branch arguments.
The upstream is resolved from `@{u}`, so the command never assumes `origin`. Its flow is:

1. preflight the repository, branch, upstream, clean worktree, and in-progress operation state;
2. fetch the configured remote;
3. try an ordinary push;
4. if the remote is ahead and the push is rejected as non-fast-forward, report both sides and
   create a guard branch;
5. delegate reconciliation to `git-merge` (`--merge`) or `git-rebase` (`--rebase`), then retry
   the ordinary push after clean verification.

Authentication, permissions, protected-branch rules, required pull requests, hooks, signing,
network errors, and ambiguous rejections are not merge conflicts. They are reported and handed
over unchanged. Content conflicts are likewise never guessed through or blanket-overwritten.

`--force-with-lease` is an explicit opt-in for a rewritten local history, normally after rebase.
It re-fetches immediately before pushing and protects the expected remote tip. Plain
`--force` is forbidden. A push report is written to `.git/ocp-push-reports/`; a failed push is
reported as failed, never inferred as successful.

### `/git-merge`

Because git computes the true common ancestor itself, conflicts appear only where both sides
genuinely touched the same region — never from a wrong per-commit base silently undoing the
baseline. For criss-cross histories, `git merge-base` is explanatory only: stage `:1:` is
git's recursive/ort virtual base and is authoritative per conflicted path.

Landing: `--squash` stages the result and the agent commits it with a conventional message
generated from `git log --oneline $BASE..<source>` (never `git merge --continue`, which does
not apply without a `MERGE_HEAD`). A clean non-squash merge already produced its commit. A
conflicted non-squash merge composes subject plus resolution body in `.git/MERGE_MSG` and
continues non-interactively with `GIT_EDITOR=true`.

### `/git-pick`

`--all` means exactly `git rev-list --reverse --topo-order --no-merges <target>..<source>`:
all **non-merge commits unique to source** — not the entire source history, and not commits
target already has. Merge commits are excluded because their mainline is ambiguous; the agent
never invents `-m`, and reports them as skipped. An explicitly named merge commit halts with
an explanation and asks you to choose a mainline.

Empty commits are distinguished, not conflated: a commit that was **originally empty** is
preserved with `--allow-empty` (milestone/audit intent), while a non-empty commit that
**became** empty because target already contains its change is skipped with `--skip` and
reported. `--allow-empty` is never applied to the latter.

### `/git-rebase`

Plans the topology before rewriting: `git rev-list --reverse --topo-order <target>..<source>`
is the plan, and a non-empty `--min-parents=2` result halts (see hard boundaries above).
Replays with `--reapply-cherry-picks` so patch-equivalent commits are never silently
pre-dropped, and `--empty=stop` so commits that become empty are explicitly logged and
skipped rather than dropped.

Landing re-fetches the target upstream and compares it with the synced SHA: if it moved
during the rebase, the agent halts and offers to rebase again rather than landing stale work.
Otherwise target fast-forwards to the linear tip. Undo is
`git reset --hard guard/<repo>-<source-sha>-<ts>`; `git reflog` also retains the pre-rebase
tips.

---

## Flags

| Flag | `/git-pull` | `/git-push` | `/git-merge` | `/git-pick` | `/git-rebase` |
|---|:--:|:--:|:--:|:--:|:--:|
| `--dry-run` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `--no-verify` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `--abort` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `--continue` | — | ✓ | ✓ | ✓ | ✓ |
| `--skip` | — | — | — | ✓ | ✓ |
| `--squash` | **never** | — | ✓ | — | — |
| `--no-ff` | — | — | ✓ | — | — |
| `--all` | — | — | — | ✓ | — |
| `--rebase` | ✓ | ✓ | — | — | — |
| `--merge` | — | ✓ | — | — | — |
| `--force-with-lease` | — | ✓ | — | — | — |

Flags may appear anywhere in the invocation; parsing is permissive and case-sensitive.

`--dry-run` previews without creating guard refs or changing the worktree — but the target
sync it performs may still fast-forward the local target, and the `.git/` audit bundle is
still written. `--abort` **finalizes the audit bundle before aborting** whenever conflicts
were already resolved or a decision log exists, because aborting discards those resolutions.

---

## Reports

Every command ends with a fixed-shape report: source/target and the synced SHA, the result
(fast-forwarded / merge commit / linear / squashed / paused → handed to human / dry-run), an
enumerated `Outcome:` token, the real verification command and its real result, and — when
conflicts were resolved — a confidence rollup:

```
Outcome: <landed-verified | landed-clean | landed-fast-forward | landed-no-verify-opt-in
        | no-op | dry-run | handed-over:<reason>>
Confidence: <H> confident · <A> advisor ✓ · <U> unresolved → handed to human
```

`landed-*` means the operation completed autonomously. `handed-over:<reason>` self-classifies
every bail: `unresolved-hunk`, `verify-failed`, `no-verify-command`, `hook-failed`,
`signing-interactive`, `preflight-<check>`, plus `mainline-ambiguous` (pick) and
`topology-ambiguous` / `target-moved` (rebase). The same token lands in the `.md` audit
summary, so **your own autonomous-landing rate is one grep away**:

```bash
grep -hoE 'Outcome: [^ ]*' .git/ocp-*-reports/*.md | sort | uniq -c | sort -rn
```

Count `landed-*` plus `no-op` over everything except `dry-run` — a preview is not an attempt
to land. That number, not a promise, is what tells you whether these commands are really
carrying your daily merges; and when it falls short, the `handed-over:` histogram names the
next friction to remove instead of leaving you to guess.

The report also carries a per-hunk (or per-commit) decision table with the rationale for each,
and a safety trail listing the guard branches, the audit paths, and the exact commands to
review or undo.
`/git-pick` also reports the commit mapping `<source-sha> → <new-target-sha>` and every
skipped commit with its reason.

Reports are written in your session language; commit messages, paths, commands, and protocol
labels stay English.

---

## Common failures

| Symptom | Cause | What happens |
|---|---|---|
| `fatal: not a git repository` | Outside a repo | Halt; suggests `cd <repo>` |
| `error: pathspec '<X>' did not match` | Branch typo or missing | Halt; lists branches and re-confirms |
| `git pull --ff-only` refuses | Local target diverged from origin | Halt; you reconcile the target first |
| `git push` rejects with `non-fast-forward` | Remote contains commits absent locally | `/git-push` fetches, guard-backs up, reconciles by selected strategy, then retries |
| `git push` is rejected by auth, policy, hook, or network | Not a divergence problem | Halt and report the real remote error; never retry with force |
| `git push --force` would be needed after rebase | Local history was rewritten | Use `/git-push --force-with-lease` only by explicit user choice |
| `There is no tracking information` | No upstream configured | Halt (`/git-pull`) or proceed on local HEAD and say so (others); never classified as divergence |
| `Unable to create .git/index.lock` | Concurrent git process or stale lock | Halt; confirms no git process is active before removing a stale lock |
| `Your local changes would be overwritten` | Dirty tree | Halt; you commit or stash |
| `Already up to date` / `is up to date` | source ⊆ target | Reports nothing to do; no guard, no mutation |
| `CONFLICT (content)` | Both sides edited the same region | Doctrine §4–§7: baseline-first semantic resolution |
| `CONFLICT (modify/delete)` | One side deleted, the other modified | Decided by intent; never auto-resurrected |
| `No changes - did you forget to use 'git add'?` | Resolution left the commit empty | `--skip`, logged with SHA and reason |
| Unique merge commits in the replay range | Default rebase would flatten topology | Halt; recommends `/git-merge` |
| `@advisor` fails / times out | Second opinion unreachable | Best-effort: hunk handed to you, others continue, never a guess |
| Hook or signing fails / prompts | Repo policy or interactive credential needed | Paused state preserved, real output reported, handed over — never bypassed |
| No verification command + manual resolutions | Cannot prove the result is sound | Halt; archived and handed over *resolved-but-unverified*, target not advanced |
| `fatal: … merge/rebase/cherry-pick in progress` | Leftover from a prior run | That command's `--abort` flow, so the decision log is archived **before** aborting |
