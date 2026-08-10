# Multi-Agent System

OpenCode-based multi-agent architecture with shared protocols, specialist dispatch, and structured output.

> **New here?** Start with the **[Usage Guide](USAGE.md)** (English) or **[使用指南](USAGE.zh-CN.md)** (中文) — prerequisites, installation, configuration, daily workflow, and troubleshooting.

## Architecture

```
User
 │
 ├── @build (primary) ── routes to ──┐
 │                                   ├── @explorer      (read-only explorer, efficient model)
 │                                   ├── @researcher   (tech evaluation)
 │                                   ├── @architect    (system design, ADR)
 │                                   ├── @dba          (schema, SQL, migrations)
 │                                   ├── @security     (OWASP, vulnerability assessment)
 │                                   ├── @java-dev     (Java/Spring)
 │                                   ├── @python-dev   (Python/FastAPI/Django)
 │                                   ├── @go-dev       (Go/gRPC)
 │                                   ├── @rust-dev     (Rust/Axum/Tokio)
 │                                   ├── @node-dev     (Node.js/NestJS/Prisma)
 │                                   ├── @frontend-dev (React/Vue, Design System)
 │                                   ├── @qa           (test strategy, coverage)
 │                                   ├── @code-review  (diff/PR review)
 │                                   ├── @advisor      (second opinion; red-team stance for design review)
 │                                   ├── @devops       (Docker/K8s/CI-CD)
 │                                   ├── @tech-writer  (docs, README, ADR)
 │                                   └── @vision       (image/screenshot analysis)
 │
  ├── @plan (primary) ── read-only analysis coordinator
  │
  └── Shared instructions (injected into all agents via `opencode.jsonc:instructions`)
      ├── output-protocol.md       — structured output format (in `~/.config/opencode/instructions/`)
      └── instructions/test-scope.md  — tiered test scope policy (in this repo)
  │
  └── Plugins
      ├── @dietrichgebert/ponytail    — lazy coding protocol (npm plugin via `opencode.jsonc:plugin`)
      └── advisor-mode.ts             — local plugin: advisor modes + red-team guard (plugins/)
```

## Prompt design conventions

### 1. RFC 2119 keyword usage

All **tactical rules** (Hard rules sections) use RFC 2119 keywords:

| Keyword | Meaning | Example |
|---------|---------|---------|
| **MUST** | Absolute requirement | "MUST pass before reporting" |
| **NEVER** | Absolute prohibition | "NEVER `@Autowired` on fields" |
| **SHOULD** | Strong recommendation | "SHOULD use design tokens" |
| **AVOID** | Weak recommendation | "AVOID `any` without comment" |
| **MAY** | Optional | "MAY use `@PreAuthorize`" |

**Density target**: 5-12 words per bullet in Hard rules sections.

```markdown
## Hard rules

- **Constructor injection only.** NEVER `@Autowired` on fields.
- **NEVER swallow exceptions** — `catch (Exception e) {}` is a bug.
- **Validate all input** — `@Valid` on request bodies.
```

### 2. Two-layer prompt structure

Each agent prompt has two distinct layers:

| Layer | Purpose | Style | Compression |
|-------|---------|-------|-------------|
| **Core competencies** | Domain knowledge for LLM routing & context | Short prose, bullet lists | NOT compressed — semantic context needed |
| **Hard rules** | Tactical constraints, prohibitions, mandates | RFC 2119 keywords, 5-12 words/bullet | Fully compressed |

**Do NOT compress competencies into RFC 2119 style.** `MAY use records` is worse than `records, sealed classes, pattern matching, virtual threads. Use modern features.` — the latter gives the LLM semantic context for decision-making.

### 3. Structural tags

Every agent file follows this structure:

```markdown
---
description: <when to invoke — used by build.md routing>
mode: subagent
variant: <low|medium|high>
temperature: <0.0-0.4>
steps: <max tool calls>
permission:
  read: allow
  bash: allow
  edit: <allow|deny>
  webfetch: <allow|ask|deny>
  websearch: <allow|ask|deny>
---

You are a **senior <role>**. <one-line scope>.

## Operating loop
<3-5 step sequential workflow>

## Core competencies      ← domain knowledge, NOT compressed
<framework-specific knowledge, bullet lists>

## Hard rules              ← RFC 2119, 5-12 words/bullet
<MUST / NEVER / SHOULD rules>

## Output format (mandatory — structured)
<markdown template with placeholders>

Invoke via `@<agent-name>` or <keywords>.
```

### 4. Output protocol (shared)

All agents follow `output-protocol.md`:
- **Conclusion first** — one sentence + confidence
- **Visual mandatory** — diagrams for structure/flow (ASCII in terminal, Mermaid in .md)
- **Layered exposition** — Summary → Key points → Details
- **Content labeling** — [Fact] / [Inference] / [Assumption]
- **Decision confirmation** — two-tier: non-blocking (state assumption, proceed) vs blocking (STOP, output options)
- **Decision mode** — advisor modes `off | lite (default) | full` control `@advisor` consultation on blocking decisions. Toggle via `/advisor off|lite|full` — see "Advisor mode" below
- **Verifiable data** — cite `file:line`, show calculation steps

### 5. Ponytail protocol (shared, coding only, lite mode)

Build what was asked, then name the lazier alternative in one line. User picks.

Advisory checklist (apply only when obviously better):
1. Already in codebase? (Reuse)
2. Framework/stdlib provides it?
3. One line suffices?
4. Deletion > addition. Fewest files. Shortest working diff.

Non-coding agents ignore this entirely.

## Model routing

| Model ID | Use case | Variant | Agents |
|----------|----------|---------|--------|
| `default` | General purpose, strong reasoning | `high` | architect, security |
| `default` | General purpose, strong reasoning | `medium` | researcher, tech-writer (low) |
| `code` | Code generation, implementation | `medium` | java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `advisor` | Analysis, review, feedback | `high` | code-review, advisor |
| `explorer` | Fast, cheap, high-volume | `low` | explorer |
| `vision` | Image understanding | `low` | vision |

> **Variant** controls thinking/reasoning effort. `high` = deep reasoning (architecture, security, review), `medium` = balanced (coding, testing), `low` = fast/lightweight (exploration, vision, docs). If the backend model doesn't support a variant, it's silently ignored.

## Test scope policy (default — lazy)

> **Top principle**: minimize wasted time and resources, find the best balance point with quality. Test depth is matched to change size — full suite and E2E are exceptions, not the baseline.

**Single source of truth**: [`instructions/test-scope.md`](instructions/test-scope.md) — injected into all agent system prompts via `opencode.jsonc:instructions`. Applies to `@build` dispatch, `@qa` execution, and `@code-review` reporting. Don't duplicate the table in agent files — they reference the policy file.

### Quick reference (tier table)

| Change size | Default tests to run |
|---|---|
| Docs / config comments only (no code change) | none — no code run |
| ≤ 1 file (tweak / rename / comment) | `compile` + `lint`/`type-check` |
| 2–5 files in one module | unit tests for changed files + direct callers |
| > 5 files OR cross-module | + integration tests for touched modules |
| Schema / contract / shared infra / cross-service | + E2E on the boundary |

Full table including the 6th row ("User explicitly asks run all tests" → full suite), escalation rules, skip rules, transparency rule, and coverage tiering: see the policy file.

### Usage notes (注意事项)

- **Default to the smallest tier.** If you only changed one line in one file, `compile` + `lint`/`type-check` is the run — not the full suite.
- **E2E is a last resort.** Slow, flaky, expensive. Only when the user asked, or the diff crosses a service boundary / critical user journey / auth / payment / data-mutation.
- **Full suite is opt-in.** Only when the user asked, on release branches, or when the change is genuinely cross-cutting and module-scoped tests give no confidence.
- **Bug fixes start at the 2–5-file tier**, regardless of file count. A bug fix with zero tests is not a real bug fix.
- **Flaky failures → root cause, not retry.** Mock time/random/network; find the order-dependence. Escalating tier on a flake is retry-in-disguise.
- **Public API / schema / shared infra changes** auto-promote one tier, even if the diff is small.
- **The agent decides the tier from the diff, not you.** Pass `diff size + touched modules` in the dispatch; the agent looks up the tier. Don't prescribe.
- **Transparency rule.** `@qa` and `@code-review` reports must state which tier they ran and why. Silent "all green" is a bug in the report.

### What this policy is NOT

- **Not a replacement for CI.** CI still runs the full suite on PR/merge. This policy is for **local / per-change** execution.
- **Not a coverage waiver.** Coverage targets are **tiered**, not removed: critical paths 100%, business core ≥80%, other code ≥60% recommended. Tiering is about *when* tests run, not *whether* they exist.
- **Not agent discretion on bug fixes.** Bug fixes have a floor (2–5-file tier). Discretion applies to other tiers.

## Adding a new agent

1. **Create `agents/<name>.md`** — follow the structural template above.
2. **Add to `build.md` routing table** — add row to `## Your team` and trigger words table.
3. **Add to `plan.md` team table** — if analysis-capable.
4. **Add to `tests/test-all.ps1`** — add to `$allFiles` array and relevant content checks.
5. **Test** — run `powershell -ExecutionPolicy Bypass -File tests/test-all.ps1`.

### Checklist for new agent

- [ ] Frontmatter complete (description, mode, model, variant, temperature, steps, permission)
- [ ] `description` field covers trigger keywords for routing
- [ ] Operating loop (3-5 steps)
- [ ] Core competencies (domain knowledge)
- [ ] Hard rules (RFC 2119, 5-12 words/bullet)
- [ ] Output format (structured markdown template)
- [ ] `Invoke via @<name>` closing line
- [ ] Added to build.md routing table
- [ ] Added to test-all.ps1 file integrity list
- [ ] Structural tests pass

## Testing

```powershell
# Structural checks only (no API calls)
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -StructuralOnly

# Structural + API prompt tests
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1

# Include ponytail behavioral tests (API calls)
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -IncludePrompts

# Advisor-mode end-to-end (requires opencode CLI + LLM_ROUTER_* env vars)
pwsh -ExecutionPolicy Bypass -File tests/test-advisor-e2e.ps1
```

Pre-install gate (single-user repo — no CI by design): run `test-all.ps1 -StructuralOnly` (exit code 0) before `install/install.ps1`. Type-check the plugins once after toolchain setup: `bun install && bunx tsc --noEmit`. Runtime behavior (hooks, LLM compliance) still requires a real `opencode` environment — see the pre-release checklist below.

### Test coverage

| Test | What it verifies |
|------|-----------------|
| Structural | File existence, frontmatter, protocol injection, content patterns, red-team guards |
| Decision strategy | Two-tier decision strategy, subagent no-ask rule, blocking markers |
| Advisor e2e | `/advisor off/lite/full` state writes, invalid-arg no-op, off-mode dispatch blocking, cross-process persistence |
| build.md | Routing table, team table, workflow templates, identity |
| plan.md | Analysis plan, read-only rule, team table |
| Ponytail behavioral | lite suggestion, code reuse, ponytail reference |

## Design decisions

### Why not a single mega-prompt?
Token cost + context dilution. Specialist agents get only relevant domain knowledge, keeping context windows focused.

### Why shared instructions (`instructions` array)?
Output protocol and ponytail apply to ALL agents. Injecting via `instructions` ensures consistency without duplicating in each file.

### Why two primary agents (build + plan)?
- **build** = execution coordinator (write code, run tests, deploy)
- **plan** = read-only analysis coordinator (review, audit, design)
- Separation prevents analysis agents from accidentally modifying code.

### Advisor mode: off | lite | full

`@advisor` gives an independent second opinion on **blocking** decisions only — non-blocking decisions always proceed with stated assumptions. Two perspectives reduce groupthink on irreversible choices.

| Mode | Behavior |
|------|----------|
| **lite** (default) | Dispatch `@advisor`; present BOTH opinions to the user. User decides. |
| **full** | Dispatch `@advisor`; confidence ≥ 8 → auto-execute (max 10/session); < 8 → lite flow. |
| **off** | No `@advisor` dispatch; orchestrator decides alone. |

**Toggle**: `/advisor off|lite|full` — the `advisor-mode` plugin writes the state file before the LLM sees the command, so the switch is code-level reliable.

**State file**: `~/.config/opencode/.advisor-mode` (`off`/`lite`/`full`; legacy `advisory`/`decisive` are auto-normalized). Cold start (no state file): `advisorMode` field in `opencode.jsonc` → env pin to `off` → `lite`.

**Four-hook enforcement** (`plugins/advisor-mode.ts` + helpers in `plugins/advisor/`):

1. `command.execute.before` — `/advisor <mode>` writes the state file
2. `experimental.chat.system.transform` — injects the active-mode marker + embedded protocol into every system prompt
3. `tool.execute.before` — blocks `@advisor` dispatch with a clear error while mode is off
4. `tool.execute.after` — parses confidence; full mode ≥ 8 gets the auto-execute directive (max 10/session, never on model fallback, never on red-team output)

### Red-team stance (adversarial design review)

An optional dispatch stance where `@advisor` argues AGAINST a proposal instead of balancing options. Design-phase gate — symmetric to `@code-review` as the implementation-phase gate. Same agent, same mode gating; only the stance changes.

**When it triggers**:

- User asks explicitly — "压测这个方案" / "red team this" / "devil's advocate" / "唱反调"
- Orchestrator auto-triggers before irreversible design decisions: schema migration, public API contract, auth/permission redesign, destructive data operations
- Never for routine single-domain tasks, bug fixes, or docs

**How it works**: dispatch `@advisor` prefixed with `Stance: red-team`. Output is a **verdict** — `HOLDS` / `HOLDS WITH CAVEATS` / `FAILS` — plus a severity-ranked attack list (weakness → what breaks → evidence) and a steelmanned-defense rebuttal. No confidence score, by design.

**Auto-execute isolation, enforced twice**:

- Prompt level: red-team output never carries a confidence score
- Code level: `isRedTeamOutput()` in `advisor-runtime.ts` suppresses ALL directives in `advisor-full-inject.ts` — adversarial verdicts can never trigger full-mode auto-execute, even if a stray score appears

**On FAILS**: the orchestrator re-dispatches the design owner (`@architect`) with the attacks for rebuttal/revision, then presents attacks + rebuttal to the user. Optional tie-breaker: `@advisor` in neutral stance.

**No blue team, on purpose**: the design owner defends their own proposal — a separate defender agent would produce hollow defense without design context. The system's real "blue team" is the implementation-phase gates: `@code-review`, `@security`, `@qa`, `/review-fix-loop`.

### Why explorer.md uses `explorer` model?
Exploration is high-volume, low-complexity. Cheaper model + read-only + 30 steps = fast and cheap context gathering before dispatching specialists.

### Why no `designer` agent?
Design expertise (Design Tokens, AI Slop detection) is injected directly into `frontend-dev.md`. A separate designer agent would add routing overhead without sufficient benefit — frontend-dev already owns the UI domain.

### Why RFC 2119 for Hard rules but not competencies?
- Hard rules = constraints → LLM needs clear, unambiguous directives → RFC 2119 keywords maximize compliance.
- Competencies = knowledge → LLM needs semantic context for routing → prose is more effective than over-formalized bullets.

## Plugins (platform-level enforcement)

OpenCode plugin system provides runtime hooks that prompts alone cannot achieve.

| Plugin | Hook | What it does |
|--------|------|-------------|
| `design-token-guard.ts` | `tool.execute.before` | Blocks writes with hardcoded colors/spacing/radius. Throws error. |
| `ai-slop-scanner.ts` | `event: file.edited` | Scans frontend files for AI anti-patterns (gradient soup, div soup, etc). Logs warnings. |
| `metrics.ts` | `tool.execute.after` + `event: session.idle` | Auto-records tool call metrics (duration, success, agent). JSONL + session summary. |
| `auto-format.ts` | `event: file.edited` | Auto-runs prettier/eslint/ruff/gofmt/rustfmt after file edit. |
| `advisor-mode.ts` (+ `plugins/advisor/` helpers) | `command.execute.before` + `system.transform` + `tool.execute.before` + `tool.execute.after` | Advisor modes off/lite/full; protocol injection; off-mode dispatch blocking; full-mode auto-execute directive; red-team output suppression. |

Metrics are stored in `~/.config/opencode/.metrics/` as JSONL files.

## File inventory

```
instructions/
├── output-protocol.md        # Shared output format (injected via `instructions` array)
└── test-scope.md             # Tiered test scope policy (injected via `instructions` array)

agents/
├── build.md                  # Primary: execution coordinator
├── plan.md                   # Primary: read-only analysis coordinator
├── advisor.md                # Decision advisor + red-team stance
├── architect.md              # System design, ADR
├── code-review.md            # Diff/PR review
├── dba.md                    # Database, SQL, migrations
├── devops.md                 # Docker, K8s, CI/CD
├── explorer.md               # Read-only explorer (efficient model)
├── frontend-dev.md           # Frontend + Design System + AI Slop
├── go-dev.md                 # Go/gRPC
├── java-dev.md               # Java/Spring Boot
├── node-dev.md               # Node.js/NestJS/Prisma
├── python-dev.md             # Python/FastAPI/Django
├── qa.md                     # Test strategy, coverage
├── researcher.md             # Tech research, comparison
├── rust-dev.md               # Rust/Axum/Tokio
├── security.md               # OWASP, vulnerability assessment
├── tech-writer.md            # Documentation
└── vision.md                 # Image/screenshot analysis

plugins/
├── advisor-mode.ts           # Plugin entry: 4 hooks (see "Advisor mode")
├── advisor/
│   ├── advisor-config.ts     # Mode normalize, state file IO, cold-start
│   ├── advisor-runtime.ts    # Log, dispatch detection, red-team guard
│   ├── advisor-instructions.ts # Embedded protocol + red-team rules
│   ├── advisor-mode-tracker.ts # command.execute.before
│   ├── advisor-system-inject.ts # system.transform
│   ├── advisor-tool-guard.ts # tool.execute.before (off-mode block)
│   └── advisor-full-inject.ts # tool.execute.after (auto-execute + suppression)
├── design-token-guard.ts     # Hook: block hardcoded design values
├── ai-slop-scanner.ts        # Hook: scan for AI anti-patterns
├── metrics.ts                # Hook: auto-collect tool metrics
└── auto-format.ts            # Hook: auto-run formatters

commands/
├── advisor.md                # /advisor off|lite|full — mode switch
├── review-fix-loop.md        # Automated review→fix→re-review loop
├── grill-me.md               # Relentless interview to sharpen a plan or design
└── grill-with-docs.md        # Grilling + domain modeling (CONTEXT.md & ADRs)

tests/
├── test-all.ps1              # Main test runner (structural + prompt tests)
├── test-decisions.ps1        # Decision strategy checks
├── test-advisor-e2e.ps1      # Advisor-mode end-to-end (needs opencode CLI)
├── test-build.ps1            # Build agent prompt test
├── test-plan.ps1             # Plan agent prompt test
├── test-subagent.ps1         # Subagent dispatch test
├── test-default.ps1          # Default baseline test
└── README.md                 # Test documentation
```

19 agent files + 2 shared instructions + 4 commands + 5 plugins (7 advisor helpers) + 8 test files + tsconfig.json.
