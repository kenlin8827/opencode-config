# Multi-Agent System

OpenCode-based multi-agent architecture with shared protocols, specialist dispatch, and structured output.

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
 │                                   ├── @advisor      (second opinion on blocking decisions)
 │                                   ├── @devops       (Docker/K8s/CI-CD)
 │                                   ├── @tech-writer  (docs, README, ADR)
 │                                   └── @vision       (image/screenshot analysis)
 │
 ├── @plan (primary) ── read-only analysis coordinator
 │
 └── Shared instructions (injected into all agents, lives in `instructions/`)
     ├── output-protocol.md     — structured output format
     ├── ponytail.md            — lazy coding protocol (coding agents only)
     └── decision-advisor.md    — advisor mode protocol (default on)
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
model: llm-router/<model>
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
- **Decision mode** — `advisor` (default, consults `@advisor` on blocking decisions) or `direct` (orchestrator alone). Toggle via `/advisor-on`/`/advisor-off` commands or `instructions` array in `opencode.jsonc`
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

## How to add a new agent

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
powershell -ExecutionPolicy Bypass -File tests/test-all.ps1

# Include ponytail behavioral tests (API calls)
powershell -ExecutionPolicy Bypass -File tests/test-all.ps1 -IncludePrompts
```

### Test coverage

| Test | What it verifies |
|------|-----------------|
| Structural | File existence, frontmatter, protocol injection, content patterns |
| Decision strategy | Two-tier decision strategy, subagent no-ask rule, blocking markers |
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

### Why advisor mode by default?
- **Advisor mode** (default) consults `@advisor` for a second opinion on **blocking** decisions only. Two perspectives reduce groupthink risk on irreversible choices.
- **Non-blocking decisions are never affected** — they always proceed with stated assumptions.

**Three toggle mechanisms, three reliability levels:**

| Mechanism | How | Reliability | Scope |
|-----------|-----|-------------|-------|
| **Session command + plugin** | `/advisor-on` / `/advisor-off` | **100%** — code-level enforcement via `advisor-mode.ts` plugin (3 layers: state file, system prompt transform, tool blocking) | Current session |
| **Permanent** | Add/remove `decision-advisor.md` in `instructions` array | **100%** — system prompt injection, affects all agents | Cross-session |
| **Session command only** (no plugin) | `/advisor-on` / `/advisor-off` | **Medium** — relies on LLM respecting user message over system prompt | Current session |

The `advisor-mode.ts` plugin provides three-layer enforcement:
1. `command.execute.before` — writes state file before command reaches LLM
2. `experimental.chat.system.transform` — strips/injects advisor protocol from system prompt on each LLM call
3. `tool.execute.before` — blocks `@advisor` dispatch with error if mode is off

State file: `~/.config/opencode/.advisor-mode` (`on` / `off`, absent = on)

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
| `advisor-mode.ts` | `command.execute.before` + `experimental.chat.system.transform` + `tool.execute.before` | 100% reliable session-level toggle for advisor mode. Three-layer enforcement: state file, system prompt stripping, dispatch blocking. |

Metrics are stored in `~/.config/opencode/.metrics/` as JSONL files.

## File inventory

```
instructions/
└── output-protocol.md        # Shared output format (injected via `instructions` array)

agents/
├── _shared/
│   ├── output-protocol.md    # Shared output format (all agents)
│   ├── ponytail.md           # Lazy coding protocol (coding agents only)
│   └── decision-advisor.md   # Advisor mode protocol (default on)
├── build.md                  # Primary: execution coordinator
├── plan.md                   # Primary: read-only analysis coordinator
├── explorer.md                 # Read-only explorer (efficient model)
├── architect.md              # System design, ADR
├── advisor.md                # Decision advisor (second opinion)
├── code-review.md            # Diff/PR review
├── dba.md                    # Database, SQL, migrations
├── devops.md                 # Docker, K8s, CI/CD
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
├── design-token-guard.ts     # Hook: block hardcoded design values
├── ai-slop-scanner.ts        # Hook: scan for AI anti-patterns
├── metrics.ts                # Hook: auto-collect tool metrics
├── auto-format.ts            # Hook: auto-run formatters
└── advisor-mode.ts           # Hook: 100% reliable advisor mode toggle (3-layer enforcement)

commands/
├── review-fix-loop.md        # Automated review→fix→re-review loop
├── grill-me.md               # Relentless interview to sharpen a plan or design
├── grill-with-docs.md         # Grilling + domain modeling (CONTEXT.md & ADRs)
├── advisor-on.md             # Enable advisor mode (session-level)
└── advisor-off.md            # Disable advisor mode (session-level)

tests/
├── test-all.ps1              # Main test runner
├── test-decisions.ps1        # Decision strategy checks
├── test-build.ps1            # Build agent prompt test
├── test-plan.ps1             # Plan agent prompt test
├── test-subagent.ps1         # Subagent dispatch test
├── test-default.ps1          # Default baseline test
└── README.md                 # Test documentation
```

21 agent files + 3 shared protocols + 5 commands + 5 plugins + 7 test files + tsconfig.json.
