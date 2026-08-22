# Handoff Protocol

`/handoff [focus]` — compact the current conversation into a handoff document so a fresh session can pick up the work.

## Your only job

Produce ONE markdown handoff document and tell the user where it is. No coding work, no dispatching subagents, no follow-up implementation.

## Arguments

- Positional arg (optional): what the NEXT session will focus on. When provided, tailor the document — emphasize the relevant state, decisions, files, and next steps; trim everything unrelated.
- No args: summarize the whole conversation neutrally.

## Steps

1. **Gather state** from the conversation: original goal, decisions made (and rejected alternatives), work completed, current progress, open questions, blockers, and key files touched.
2. **Check git state** — `git status` summary: current branch, uncommitted/unstaged changes, unpushed commits. A fresh session cannot see this conversation; the document must carry it.
3. **Collect artifacts** — specs, plans, ADRs, issues, tickets, commits, diffs, handoff-relevant docs. Reference them by path or URL — NEVER duplicate their content into the document.
4. **Resolve the OS temp directory** (via shell): Windows → `$env:TEMP` (fallback `$env:TMP`); macOS/Linux → `$TMPDIR` (fallback `/tmp`). The document goes there — NOT into the workspace, never into the repo.
5. **Write** the document to `<tmpdir>/handoff-<project>-<YYYYMMDD-HHMM>.md`, where `<project>` is the workspace directory name.
6. **Reply** with the absolute path plus a paste-ready opener for the next session.

## Document structure

```markdown
# Handoff — <project> (<YYYY-MM-DD HH:MM>)

## Focus for next session
<the user's focus arg, or "continue where this session left off">

## Where we are
<original goal, current state, git branch + uncommitted/unpushed changes>

## What was done
<completed work, one bullet per item, cite files/commits>

## Decisions made
<decision — why — rejected alternative (one line each)>

## Open questions / blockers
<unresolved items; mark each: needs user input | needs investigation | known trap>

## Key files
<files the next session will need first, with one-line relevance notes>

## Artifacts
<specs, plans, ADRs, issues — path or URL only, no content duplication>

## Suggested agents
<which @agents / slash commands the next session should reach for, and why —
 e.g. "@code for the implementation", "/review-fix-loop last commit before merge">
```

## Hard rules

1. **Temp directory only.** Never write the handoff document into the workspace or the repo — it would pollute the change set the next session inherits.
2. **Reference, don't duplicate.** Anything already captured in an artifact (spec, plan, ADR, issue, commit, diff) is cited by path or URL, never copied.
3. **Redact sensitive information.** API keys, passwords, tokens, credentials, PII → replace with `<REDACTED: what it is>` and tell the user where the real value lives (e.g., env var name).
4. **Stay compact.** A fresh agent must be able to read the whole document — well under 200 lines. Compression is the point; if the conversation was long, be ruthless.
5. **Be concrete.** Every "next step" cites a file, command, or artifact. No vague "continue working on X".
6. **End the reply with a paste-ready opener** for the next session:

```
Read <absolute path to handoff doc> and continue from there.
```
