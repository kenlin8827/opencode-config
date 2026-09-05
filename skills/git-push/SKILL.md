---
name: git-push
description: Safely push the CURRENT branch to its configured upstream; if the remote is ahead, reconcile via git-merge or git-rebase and retry. Never silently force-push or discard work. Load ONLY when the user invokes /git-push.
---

# Git Push Protocol (safe push, reconcile, retry)

Push the current branch to its configured upstream. Try a normal push first;
when the remote is ahead, guard the local tip, reconcile with the selected
strategy, and retry. This skill does not promise that every push succeeds:
permissions, protected branches, hooks, network failures, and semantic
conflicts must be reported rather than bypassed.

## Flags

- `--rebase` — replay local commits onto the fetched upstream tip.
- `--merge` — merge the fetched upstream into the current branch.
- no strategy flag — use repository policy; if none is established, prefer
  rebase only for an explicitly non-shared branch, otherwise ask the user.
- `--dry-run` — inspect, fetch, and report the push/reconciliation plan without
  changing commits or pushing.
- `--no-verify` — skip post-reconciliation verification only when explicitly
  requested.
- `--force-with-lease` — explicitly permit a guarded force push. Never use plain `--force`.
- `--abort` — delegate to the active merge/rebase operation's abort protocol,
  preserving its audit record first.

Flags may appear anywhere and are case-sensitive.

## Audit trail

After the repository check and before fetch or any other mutation, create
`operation-id = git-push-<UTC>-<short-head>-<random>` and initialize
`.git/ocp-push-reports/<operation-id>.jsonl` plus its Markdown summary. The
trace is the only `.git/` side effect permitted by `--dry-run`. Record linked
`command_start`/`command_end` events for every git command, with schema version,
redacted argv, exit code, refs before/after, bounded output excerpts, stream
hashes, and a hash chain. Never persist credentials, URL userinfo, tokens,
private keys, or raw conflicted-file contents. A trace failure halts before
mutation; a later append failure pauses safely and never auto-aborts.

## Step 1 — Preflight

All checks must pass; never auto-stash, reset, clean, or overwrite:

1. `git rev-parse --is-inside-work-tree` succeeds.
2. `git symbolic-ref HEAD` succeeds; detached HEAD has no safe default target.
3. `git status --porcelain --untracked-files=no` is empty. Stop and ask the
   user to commit or stash dirty changes; do not stash automatically.
4. `git rev-parse --abbrev-ref @{u}` resolves the configured upstream. If not,
   stop and provide `git branch --set-upstream-to=<remote>/<branch>`.
5. No merge, rebase, or cherry-pick is in progress and no stale index lock is
   present.

Record the current branch, upstream, local HEAD, and upstream tip before any
mutation.

## Step 2 — Fetch and try ordinary push

Resolve the remote from `@{u}`; never assume `origin`. Run `git fetch <remote>`
and then a normal push to the configured upstream. If it succeeds, report the
branch, remote, resulting commit, and real command result.

If the push fails, classify the failure from the command output and ref state:

- authentication, authorization, protection rules, required PR, hook,
  signing, network, or server failure: stop and report the exact reason;
- non-fast-forward because the remote is ahead: continue to Step 3;
- ambiguous output: stop rather than guessing it is a merge problem.

With `--dry-run`, report the ahead/behind counts and planned action here, then
stop without reconciliation or push.

## Step 3 — Reconcile remote divergence

Report `git rev-list --left-right --count <branch>...@{u}` and create a guard
branch at the current local HEAD before rewriting or merging:

`guard/<repo>-<short-head>-<UTC-timestamp>`

Then delegate, without reimplementing conflict handling:

- `--merge`: load `git-merge`, using source `@{u}` and target the current
  branch; the local branch remains the merge baseline.
- `--rebase`: load `git-rebase`, replay local commits onto `@{u}`; skip its
  unrelated target fast-forward step because the checked-out branch is already
  the rebased result.
- no explicit strategy: ask when branch sharing/policy is unclear.

The delegated protocol owns semantic conflict resolution, verification,
decision logs, and child audit traces. If a conflict or verification failure
occurs, stop, preserve the repository state, list conflicted files and give the
exact `--continue`/`--abort` recovery command. Never blanket-copy one side.

After clean reconciliation, verify the resulting history and retry a normal
push. A failed retry remains a failed outcome.

## Step 4 — Explicit force-with-lease

Only when the user explicitly supplied `--force-with-lease`, re-fetch immediately
before pushing, show the expected remote tip that the lease protects, and use
`git push --force-with-lease`. If the remote moved, stop. Plain `--force` is
forbidden, including as a response to a rebase.

## Report

```text
## git-push report
Branch: <branch> → <upstream>
Result: <pushed | reconciled → pushed | dry-run | paused | rejected>
Outcome: <pushed | landed-and-pushed | dry-run | handed-over:<reason>>
Sync: <fetch | merge | rebase | none>
Backup: <guard ref or none>
Verify: <command> → <real result, if run>
Audit: .git/ocp-push-reports/<operation-id>.jsonl + .md
Action: <none | exact recovery command>
```

Every halt must name the next concrete action. Never claim success from an
inferred or unrun command, and never delete the guard branch automatically.
