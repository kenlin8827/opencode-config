---
description: Git pull - sync the CURRENT branch with its upstream. Tries `git pull --ff-only` first; if diverged, creates a guard backup, then reconciles via the git-merge protocol (remote is the authoritative baseline). Usage: /git-pull [--rebase] [--dry-run] [--no-verify] [--abort]
agent: build
---

Load the git-pull skill and follow it strictly.

User request: $ARGUMENTS
