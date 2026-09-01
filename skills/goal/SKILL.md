---
name: goal
description: Goal - persistent objective execution with a structured goal contract, audit-friendly checkpoints, and mechanical stop conditions. Load ONLY when the user invokes /goal or explicitly asks to run a structured goal.
---

# Goal Protocol

You are now running **goal** — a persistent objective execution protocol that enforces structured goal-setting, audit-friendly checkpoints, and mechanical stop conditions. Follow this protocol until an exit condition is met.

## What is a goal?

A goal is a structured objective with verifiable acceptance criteria and mechanical stop conditions. It is NOT a casual prompt — it is a contract between the user and the agent that defines exactly what "done" means and when to stop.

## Arguments

- Positional arg (optional): the goal description text. If provided, parse it into the 5-section structure below. If missing, enter goal-builder mode (interview the user to construct the goal).
- `--budget=N` (optional): override the token budget. Default: 80000. Range 10000–500000.

## The golden template (5 sections, in this order)

Every goal MUST be structured as:

```
/goal <objective>.

[Optional: First action: read X, Y, Z and report counts. Wait for ack.]

Scope: <files / subsystem / feature area>.

Constraints:
  - <what not to change>
  - <compatibility / permission boundaries>
  - <project-specific rules from AGENTS.md / CLAUDE.md / .cursorrules>

Done when:
  1. <verifiable artifact 1 — cite file or command>
  2. <verifiable artifact 2>
  ...

Stop if:
  - <mechanically detectable condition 1>
  - <mechanically detectable condition 2>
  ...

Use a token budget of <N> tokens for this goal.
```

**Why this order**: objective first (what changes), then scope (where), then constraints (what not to touch), then acceptance (how to verify done), then stop-if (runtime guards). This matches the audit checklist's expected reading flow.

## Two modes

### Mode A: Goal execution (user provided goal text)

When the user provides goal text via `/goal <text>`:

1. **Parse** the text into the 5-section structure. If sections are missing, ask the user to fill them before proceeding.
2. **Build audit checklist** — transform each "Done when" item into a yes/no verifiable checkpoint.
3. **Execute** — work through the objective, checking off items as they are verified.
4. **Audit** — after each step, verify against the checklist. Do NOT declare done until every item passes.

### Mode B: Goal builder (no goal text provided)

When the user enters `/goal` with no arguments:

1. **Detect project type** — probe the filesystem (don't ask):
   - `package.json` → Node / TypeScript
   - `pyproject.toml` or `requirements.txt` → Python
   - `Cargo.toml` → Rust
   - `go.mod` → Go
   - `*.xcodeproj/` → Swift / iOS
   - Other → ask
2. **Pick scenario** — ask which type: Refactor / Feature / Batch / Archaeology / UI Audit / Gatekeeper / Custom
3. **Gather 5 inputs** incrementally (one at a time, with recommendations):
   - Objective (one sentence, verb phrase)
   - Scope (files / directories / subsystems)
   - Constraints (from AGENTS.md / CLAUDE.md / project defaults)
   - Done when (5-8 verifiable items, each citing a file/command/test)
   - Stop if (3+ mechanically detectable conditions)
4. **Score audit-friendliness** — check:
   - Acceptance count: < 3 = warn, 3-5 = good, 6-8 = excellent
   - Vague verbs detected: "improve", "optimize", "all", "everything" → flag
   - Stop-if specificity: "if unclear" = bad, "if file X appears in git diff" = good
   - Token budget present: missing = warn
5. **Render** the final `/goal` command in a code block (copy-pasteable).

## Execution rules

### Audit checklist (mandatory)

Before starting work, build a checklist from the "Done when" section. Each item becomes a verifiable checkpoint:

| Done-when item | Checklist entry |
|---|---|
| `npm test exits 0; paste summary` | ✅ / ❌ (run command, check exit code + paste output) |
| `src/auth.ts implements X` | ✅ / ❌ (read file, verify behavior) |
| `tsc --noEmit exits 0` | ✅ / ❌ (run command, check exit code) |

**The checklist is the single source of truth for "done"**. Do NOT declare completion based on vibes, confidence, or partial progress. Every item must be explicitly verified.

### Per-step audit

After each meaningful step (file edit, command run, test execution):
1. **Update the checklist** — mark items as ✅ or ❌ based on actual verification.
2. **Check stop conditions** — if any stop-if condition is met, STOP immediately and report.
3. **Check budget** — if remaining token budget is insufficient for the next step, report and ask user.

### Stop conditions (hard stops)

Stop immediately when ANY of these fire:
- Any "Stop if" condition from the goal text is mechanically detected.
- Token budget exhausted.
- A fix introduces a new critical issue that can't be resolved within the same step.
- The user says "stop", "enough", or similar.

When stopped, report:
- Which stop condition fired.
- Current checklist state (how many ✅ / ❌).
- What remains to be done.

## Scenario skeletons

### A. Refactor (single subsystem change)

```
/goal <refactor action>, <specific after state>.

Scope: <specific directory or file list>.

Constraints:
  - Do not modify <adjacent unrelated subsystem>.
  - Public API (<specific export file>) signature unchanged.
  - <project-type defaults>
  - No new dependencies.

Done when:
  1. <file X> implements <specific behavior>.
  2. <test file Y> contains N new cases, all passing: (a) (b) (c).
  3. <exact test command> exits 0; paste test summary.
  4. <build / type-check command> exits 0.
  5. Final summary lists each modified file + line count delta.

Stop if:
  - Implementation needs to modify <explicit forbidden zone>.
  - Existing tests start failing (regression — do not fix by editing tests).
  - Needs new dependency / language version upgrade.
  - <project-type default stop-if>

Use a token budget of <60-100K> tokens for this goal.
```

### B. Feature (spec-driven implementation)

```
/goal strictly implement all specs in <spec path>.

First action: read the following files verbatim, then report counts:
  - <spec path>/proposal.md
  - <spec path>/design.md
  - <spec path>/tasks.md
  - <spec path>/specs/<capability>/spec.md
  - AGENTS.md (if exists)
Report: task count in tasks.md, SHALL count in spec.md, key constraint count in AGENTS.md.
Wait for my confirmation before starting implementation.

Scope: design.md "MUST NOT modify" list strictly observed; other files may change.

Constraints:
  - All AGENTS.md Iron Rules are non-negotiable.
  - <project-type defaults>
  - No new dependencies not declared in dependency manifest.
  - Modifying @Model / data layer requires explicit design.md permission.

Done when:
  1. Every item in tasks.md is checked, each with file path + key change.
  2. Every SHALL in spec.md has ≥1 passing test, noting test file + test name.
  3. Every GIVEN/WHEN/THEN scenario in spec.md has corresponding integration test.
  4. <build command> exits 0, paste build summary.
  5. <test command> exits 0, paste test summary (new test count ≥ SHALL count).
  6. design.md "MUST NOT modify" list: each file git diff is empty.

Stop if:
  - A tasks.md item requires modifying a "MUST NOT modify" file.
  - Two SHALLs in spec.md conflict (escalate, do not decide priority yourself).
  - Implementation needs new dependency.
  - Existing tests start failing.
  - <project-type default stop-if>

Use a token budget of <100-150K> tokens for this goal.
```

### C. Batch (repeated tasks — fix bugs, add tests, bulk rename)

```
/goal <batch action> N <objects>, <enumeration source>.

Scope: <modification scope per item>. One commit per item.

Constraints:
  - N objects must come from <enumerable source> (e.g., issue tracker labels).
  - Each item's modification must not cross boundaries (one commit = related files only).
  - Do not merge or close items outside scope.
  - <project-type defaults>
  - Commit message format: <specific format>.

Done when:
  1. N objects each linked to an independent commit.
  2. Each item has corresponding <test> in <test directory>, all passing.
  3. <test command> exits 0, new test count ≥ N.
  4. CHANGELOG.md lists N entries, each with reference.
  5. Final summary is a table: item # / one-line description / files / test / commit hash.

Stop if:
  - An item's status changes mid-process (closed / modified by others).
  - An item needs breaking change (API signature / schema).
  - Existing related tests start failing.
  - An item is not reproducible / does not exist.
  - Post-completion review finds < M items actually correct (M = N by default).

Use a token budget of <100-150K> tokens for this goal.
```

### D. Archaeology (code exploration — read-only)

```
/goal map out all operations of <project>, output N docs; do not modify any source code.

Scope: read-only <source directories>; writable files limited to N new .md docs created by this goal.

Constraints:
  - Strictly forbidden to modify any existing file under <source directories>.
  - Do not modify <asset files, config files>.
  - Do not run any environment-modifying commands (npm install / cargo build etc.).
  - Code references must use real file paths + line numbers, no fabrication.
  - Highlight "code does but README doesn't mention" parts.

Done when:
  1. Create docs/ARCHITECTURE.md: entry points, primary modules, external deps, data flow (mermaid).
  2. Create docs/CALL_GRAPHS.md: top N user path call chains, each citing file:line.
  3. Create docs/UNDOCUMENTED.md: ≥5 "code-implemented but README-unmentioned" behaviors.
  4. Final summary confirms: git diff shows only N new files under docs/, no source changes.

Stop if:
  - A file requires external tools to parse (encrypted / binary / proprietary).
  - git status shows any source file modified (boundary violation, stop immediately).
  - Two existing docs conflict on the same fact (escalate, let user decide).

Use a token budget of <50-80K> tokens for this goal.
```

### E. Custom (bare template)

```
/goal <objective>.

Scope: <files / subsystem / area>.

Constraints:
  - <hard rules>
  - <project-type defaults>

Done when:
  1. <verifiable artifact>
  2. <verifiable artifact>
  3. <verifiable artifact>

Stop if:
  - <mechanical condition>
  - <mechanical condition>
  - <mechanical condition>

Use a token budget of <N> tokens for this goal.
```

## Project-type defaults

### Node / TypeScript
- **Test**: `npm test` or `npm test -- <path>`
- **Type-check**: `npx tsc --noEmit`
- **Stop-if defaults**: new npm dependency needed; `node_modules/` corrupted; existing tests fail (regression); new `any` type in strict mode
- **False-completion traps**: `it.skip`/`describe.skip` counted as pass; jiti/esbuild cache serves old version after edit; monorepo `npm test` only runs current workspace

### Python
- **Test**: `pytest -q`
- **Type-check**: `mypy <package>` or `ruff check . && ruff format --check .`
- **Stop-if defaults**: new pip dependency needed; Python version requirement change; existing tests fail (regression); global state mutation
- **False-completion traps**: `pytest.mark.skip`/`pytest.mark.xfail` counted as pass; async tests silently skipped without `pytest-asyncio`; `conftest.py` changes affect other tests silently

### Go
- **Test**: `go test ./...`
- **Build**: `go build ./...` or `go vet ./... && staticcheck ./...`
- **Stop-if defaults**: new `go.mod` dependency needed; unexpected `go.sum` changes; existing tests fail (regression); new data race detected
- **False-completion traps**: `t.Skip` counted as pass; table-driven test case commented out looks like pass; `_test.go` helper changes affect multiple tests silently

### Rust
- **Test**: `cargo test --all-features`
- **Build**: `cargo check --all-targets` or `cargo clippy --all-targets -- -D warnings`
- **Stop-if defaults**: new `Cargo.toml` dependency needed; unexpected `Cargo.lock` changes; existing tests fail (regression); new `unsafe` block; clippy warnings increased
- **False-completion traps**: `#[ignore]` counted as pass; `cfg(test)` mock makes tests pass but production broken; workspace `cargo test` without `-p` runs all crates

## Hard rules

1. **Never declare done without verifying every checklist item** — partial progress is not done.
2. **Never write Stop-if as "if unclear, stop"** — that's not mechanically detectable. Use concrete, checkable conditions.
3. **Never let "all / everything / 全部 / 彻底" through** — flag and ask for a number or enumerable source.
4. **Always include a token budget** — missing budget = no soft stop = potential runaway.
5. **Always include a "no test-rewriting" stop-if** for any goal that touches tested code: "Existing tests start failing — this is a regression, do not 'fix' by editing tests."
6. **For spec-driven goals (scenario B), the first action is always "read X files and report counts"** — bypasses reference uncertainty and exposes loading failures early.
7. **For brownfield projects, always ask about MUST NOT modify list** — the absence of one is the #1 cause of scope creep.

## Output format

### Per-step output (concise)

```
### Step N: <action description>
- Checklist: <X>/<Y> items verified
- ✅ <item> — <evidence>
- ❌ <item> — <reason not yet done>
- Budget: ~<N> tokens remaining
- Stop conditions: none fired | ⚠ <condition> fired
```

### Final summary

```
## Goal Summary

**Verdict: <Completed | Stopped | Budget exhausted>**

### Goal
<one-line objective>

### Checklist
1. ✅ <item> — <evidence>
2. ✅ <item> — <evidence>
3. ❌ <item> — <reason>

### Statistics
- Steps executed: <N>
- Checklist items verified: <X>/<Y>
- Token budget used: ~<N> / <budget>

### Files modified
- `path/to/file.ts` — <what changed>

### Stop conditions
- <none fired | condition fired at step N>

### Recommended next steps
- <follow-up / regression test / escalate>
```
