# Developing Guide

Everything you need to modify this repo: architecture, prompt conventions, plugin internals, tests, and the release workflow.

> **Audience**: contributors and maintainers of this repo.
> If you only want to *use* the configuration, read the user manual: **[README.md](README.md)** (English) / **[README.zh-CN.md](README.zh-CN.md)** (中文).
> For AI agent behaviors, language conventions, and coding disciplines, see **[AGENTS.md](AGENTS.md)**.

---

## Repository layout

```
agents/          # Agent prompts: 3 primaries + 17 specialists
instructions/    # Rule files layered by disclosure: L0 (opencode.jsonc:instructions) vs L1 (agent prompt {file:} assembly)
skills/          # L2 on-demand skills (opencode skill tool loads them when relevant)
plugins/         # TypeScript plugins (barrel entries at root, logic in subdirs)
profiles/        # Model profiles: provider + per-tier model picks
providers/       # Custom provider definitions (auto-loaded by opencode as presets; /provider → "Add preset" can also import them into opencode.jsonc)
install/         # Self-installing engine (TypeScript), manifests, version.json, options
bin/             # OCP CLI dispatchers (opencode-prime, ocp) — installer wrapper + runtime launcher
tests/           # Structural + prompt test suites (see tests/README.md)
scripts/         # Packaging scripts for releases
opencode.template.jsonc  # Root config template merged into ~/.config/opencode/opencode.jsonc
tui.template.jsonc  # TUI config template (registers TUI plugins; merged with user tui.jsonc on install so user-added plugins survive)
tiers.json       # Tier definitions sidecar (consumed by profile-wizard)
```

## Architecture

```
User
 │
 ├── @build (primary) ── routes to ──┐
 │                                            ├── @explorer      (read-only explorer, efficient model)
 │                                            ├── @researcher    (tech evaluation)
 │                                            ├── @architect     (system design, ADR)
 │                                            ├── @dba           (schema, SQL, migrations)
 │                                            ├── @security      (OWASP, vulnerability assessment)
 │                                            ├── @java-dev      (Java/Spring)
 │                                            ├── @python-dev    (Python/FastAPI/Django)
 │                                            ├── @go-dev        (Go/gRPC)
 │                                            ├── @rust-dev      (Rust/Axum/Tokio)
 │                                            ├── @node-dev      (Node.js/NestJS/Prisma)
 │                                            ├── @frontend-dev  (React/Vue, Design System)
 │                                            ├── @qa            (test strategy, coverage)
 │                                            ├── @code-review   (diff/PR review)
 │                                            ├── @advisor       (second opinion; red-team stance for design review)
 │                                            ├── @devops        (Docker/K8s/CI-CD)
 │                                            ├── @tech-writer   (docs, README, ADR)
 │                                            └── @vision        (image/screenshot analysis)
 │
 ├── @plan (primary) ── read-only analysis coordinator
 │
 ├── @code (primary, default) ── direct developer, delegation only on request
 │                                (advisor/explorer/code-review/vision)
 │
 │   (default agent is set by install/options.jsonc:default_agent —
 │    the installer applies it to opencode.jsonc's root `default_agent`
 │    on every install; valid values: code / build / plan)
 │
 ├── Disclosure layers (see docs/core/prompt-layers.md)
 │   ├── L0 `opencode.jsonc:instructions` — every step × every agent:
 │   │     rfc-keywords, output-protocol, verification-honesty, routing-index
 │   ├── L1 agent prompt {file:} assembly — role rules:
 │   │     coding pack (coding-principles, comment-strategy, edit-protocol,
 │   │     test-scope), sql-migration (dba only)
 │   └── L2 skills/sdd-workflow — loaded on demand via the skill tool
 │
 ├── Per-step visibility gating (agent `permission` denies in the template)
 │     skills block: sdd-workflow visible only to build/plan/code/architect;
 │     MCP tool surface (serena_* / codegraph_*, ~10.9k tok/step of tool
 │     definitions) only to code-querying agents. Quantified by
 │     scripts/measure-prompts.ts (real MCP handshake snapshot in
 │     scripts/mcp-instructions.snapshot.json)
 │
 └── Plugins (runtime enforcement & workflows — see "Plugin system")
     ├── npm plugins via `opencode.jsonc:plugin` (ponytail, qoder-bridge, …)
     ├── auto-discovered entries in `plugins/*.ts` (guards, collectors, barrels)
     ├── injection gate: plugin-scope.json → plugins/shared/plugin-scope.ts
     │     (protocol injections denied for lite/utility identities and all
     │     subagent steps; fail-open)
     └── TUI plugins via `tui.template.jsonc:plugin` (provider-wizard, profile-wizard, queue-manager)
```

Design invariants:

- **build** = execution coordinator (write code, run tests, deploy); **plan** = read-only analysis coordinator. Separation prevents analysis agents from accidentally modifying code.
- Specialist agents get only their relevant domain knowledge — no mega-prompt (token cost + context dilution).
- Cross-cutting protocols live in `instructions/` and attach at the cheapest disclosure layer (L0 array or L1 `{file:}` assembly in `opencode.template.jsonc`) — never duplicated in agent files.

---

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

Note: the `tier` field some agent blocks carry in `opencode.template.jsonc` is a **custom, non-standard** configuration field consumed by this repo's tooling (profile-wizard, tiers.json) — upstream OpenCode schemas do not know it.

### 4. Output protocol (shared)

All agents follow `instructions/output-protocol.md`:
- **Conclusion first** — one sentence + confidence
- **Visual mandatory** — diagrams for structure/flow (ASCII in terminal, Mermaid in .md)
- **Layered exposition** — Summary → Key points → Details
- **Content labeling** — [Fact] / [Inference] / [Assumption]
- **Decision confirmation** — two-tier: non-blocking (state assumption, proceed) vs blocking (STOP, output options)
- **Decision mode** — advisor modes `off (default) | lite | full` control `@advisor` consultation on blocking decisions
- **Verifiable data** — cite `file:line`, show calculation steps

### 5. Ponytail protocol (shared, coding only, lite mode)

Provided by the `@dietrichgebert/ponytail` npm plugin: build what was asked, then name the lazier alternative in one line. User picks.

Advisory checklist (apply only when obviously better):
1. Already in codebase? (Reuse)
2. Framework/stdlib provides it?
3. One line suffices?
4. Deletion > addition. Fewest files. Shortest working diff.

Non-coding agents ignore this entirely.

---

## Model routing design

Five tiers, each mapped per active profile (`profiles/*.json`):

| Tier | Use case | Variant | Agents |
|----------|----------|---------|--------|
| `default` | General purpose, strong reasoning | `high` | architect, security |
| `default` | General purpose, strong reasoning | `medium` | build, plan, code, researcher, tech-writer |
| `code` | Code generation, implementation | `medium` | java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `advisor` | Analysis, review, feedback | `high` | code-review, advisor |
| `explorer` | Fast, cheap, high-volume | `low` | explorer |
| `vision` | Image understanding | `medium` | vision |

**Variant** controls thinking/reasoning effort and must be considered alongside the tier's model strength:
- `high` = deep reasoning. Use when the model is strong AND the task needs it (architecture, security, review, decision analysis).
- `medium` = balanced. Default for strong coding models doing routine work (coding, testing, docs, visual analysis, orchestration, research).
- `low` = fast/lightweight. Only for the cheapest tier doing pure retrieval tasks (explorer). Applying `low` to a weak model on a complex task is a disaster — the matrix ensures this never happens.

If the backend model doesn't support a variant, it's silently ignored.

Profile mechanics (tier→model rewrite, live apply vs fallback, validation) are user-facing behavior documented in the [user manual](README.md#profiles); the implementation lives in `plugins/profile-wizard.ts` with tier definitions in `tiers.json` (sidecar — upstream OpenCode rejects unknown schema fields in `opencode.jsonc`, so tiers live outside it).

## Test scope policy (default — lazy)

> **Top principle**: minimize wasted time and resources, find the best balance point with quality. Test depth is matched to change size — full suite and E2E are exceptions, not the baseline.

**Single source of truth**: [`instructions/test-scope.md`](instructions/test-scope.md) — attached to coding/review agent prompts at L1 (agent `prompt` `{file:}` assembly). Applies to `@build` dispatch, `@qa` execution, and `@code-review` reporting. Don't duplicate the table in agent files — they reference the policy file.

### Quick reference (tier table)

| Change size | Default tests to run |
|---|---|
| Docs / config comments only (no code change) | none — no code run |
| ≤ 1 file (tweak / rename / comment) | `compile` + `lint`/`type-check` |
| 2–5 files in one module | unit tests for changed files + direct callers |
| > 5 files OR cross-module | + integration tests for touched modules |
| Schema / contract / shared infra / cross-service | + E2E on the boundary |

Full table including the "User explicitly asks run all tests" row, escalation rules, skip rules, transparency rule, and coverage tiering: see the policy file.

### Usage notes

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

---

## Adding a new agent

1. **Create `agents/<name>.md`** — follow the structural template above.
2. **Add to `build.md` routing table** — add row to `## Your team` and trigger words table.
3. **Add to `plan.md` team table** — if analysis-capable.
4. **Add to `opencode.template.jsonc`** — `agent.<name>` block with tier, model, mode, etc.
5. **Add to `tests/test-all.ps1`** — add to `$allFiles` array and relevant content checks.
6. **Generate manifest** — bump `version` in `install/version.json`, then `bun run install/src/index.ts generate` (or `ocp generate`). See `AGENTS.md` §4 for the full shipping rules — files in `agents/`, `instructions/`, `plugins/`, `profiles/`, `providers/`, `skills/` are auto-discovered; standalone files and `scripts/` runtime scripts must be added to `SHIPPED_FILES` in `install/src/manifest.ts`.
7. **Test** — run `pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -StructuralOnly`.

### Checklist for new agent

- [ ] Frontmatter complete (description, mode, variant, temperature, steps, permission)
- [ ] `description` field covers trigger keywords for routing
- [ ] Operating loop (3-5 steps)
- [ ] Core competencies (domain knowledge)
- [ ] Hard rules (RFC 2119, 5-12 words/bullet)
- [ ] Output format (structured markdown template)
- [ ] `Invoke via @<name>` closing line
- [ ] Added to build.md routing table
- [ ] Added to opencode.template.jsonc agent block
- [ ] Added to test-all.ps1 file integrity list
- [ ] Structural tests pass

Agent naming convention: mode verbs for primaries (`build`, `plan`, `code`), role nouns for specialists (`architect`, `dba`, …).

---

## Plugin system

OpenCode plugin hooks provide runtime guarantees that prompts alone cannot achieve.

### Discovery & layout

- **Auto-discovered**: OpenCode scans the `plugins/` root for `.ts` files. Multi-file plugins therefore use the **barrel pattern**: `plugins/<name>.ts` re-exports from `plugins/<name>/<name>.ts`, keeping implementation, protocol markdown, and helpers in the subdirectory.
- **TUI plugins**: registered explicitly in `tui.template.jsonc:plugin` (`provider-wizard.ts`, `profile-wizard.ts`, `queue-manager.ts`) — TUI-only, no headless equivalent.
- **npm plugins**: default active plugins are listed in `opencode.template.jsonc:plugin` (`@dietrichgebert/ponytail`); optional plugins (`opencode-qoder-bridge`, `opencode-mem@2.24.3`) are configured in `install/options.jsonc` and dynamically injected/pre-installed on install.
- **Shared plumbing**: `plugins/shared/opencode-prime.ts` — project-dir resolution, JSONC parsing, field upsert, never-throw writes; used by auto-advisor, adr-guard, env-guard, e2e-guard, project-manager. `plugins/shared/plugin-scope.ts` — the runtime injection gate: every `system.transform` protocol injector awaits `scoped(input, output.system, "<plugin-id>", client)` before injecting; policy lives in `plugin-scope.json` (repo root, shipped) as `identifiers` (text detection) plus per-plugin `deny`/`allow` lists with scope grammar `x` / `x:*`; the `"*"` entry is the inherited default (deny `lite`, `utility`, `subagent:*`). Fail-open.

### Hook inventory

| Plugin | Hook | What it does |
|--------|------|-------------|
| `design-token-guard.ts` | `tool.execute.before` | Blocks writes with hardcoded colors/spacing/radius. Throws error. |
| `ai-slop-scanner.ts` | `event: file.edited` | Scans frontend files for AI anti-patterns (gradient soup, div soup, …). Logs warnings. |
| `metrics.ts` | `tool.execute.after` + `event: session.idle` | Auto-records tool call metrics (duration, success, agent). JSONL + session summary in `~/.config/opencode/.metrics/`. |
| `auto-format.ts` | `event: file.edited` | Auto-runs prettier/eslint/ruff/gofmt/rustfmt after file edit. |
| `browser-screenshot.ts` | custom tool | Registers `browser_screenshot` tool (Playwright headless) for `@vision` / `@frontend-dev`. |
| `lite-mode.ts` (+ `plugins/lite-mode/`) | `system.transform` | Strips the `<!-- lite-mode -->` sentinel and every `Instructions from:` block (L0) from the `@lite` primary's system prompt. |
| `project-profiler.ts` (+ `plugins/project-profiler/`) | `session.created` + `system.transform` | Detects project nature at session start (config-driven, zero CLI probing) and injects a compact profile + code-intelligence backend recommendation (Serena vs CodeGraph, GitNexus optional) into the system prompt. |
| `openrtk.ts` (+ `plugins/openrtk/`) | command rewrite | Vendored rtk integration: rewrites shell commands through the rtk compression proxy transparently. |
| `auto-advisor-mode.ts` (+ `plugins/auto-advisor/`) | 5 hooks — see below | Advisor modes off/lite/full; protocol injection; full-mode auto-execute; red-team suppression. |
| `deepseek-anchor.ts` (+ `plugins/deepseek-anchor/`) | `config` + `command.execute.before` + `system.transform` | `/deepseek-anchor` command; anchor-based reasoning protocols with DeepSeek models. |
| `adr-guard.ts` (+ `plugins/adr-guard/`) | `config` + `command.execute.before` + `system.transform` + `tool.execute.before` + `event: session.created` | `/adr-guard` command; ADR iron-law protocol injection; hard-blocks `feat`/`refactor` commits without an ADR in the change set. |
| `env-guard.ts` (+ `plugins/env-guard/`) | `tool.execute.before` | Secret-file gate: blocks reads/copies of secret-bearing `.env*` files. |
| `e2e-guard.ts` (+ `plugins/e2e-guard/`) | `config` + `command.execute.before` + `system.transform` | `/e2e-guard on|off|status` command; system prompt E2E protocol injection; guides LLM to evaluate E2E impact on `feat`/`fix` tasks, flag test gaps, and interactively confirm with the user via `ask` before running (scoped to primary agents). |
| `project-manager.ts` (+ `plugins/project-manager/`) | `config` + `command.execute.before` + `system.transform` + `tool.execute.before` + `event: session.created` | `/project init|index|sync` commands; init tops up an existing project config with new template switches (append-only); file-as-switch commit discipline; one-time `/project init` suggestion. |
| `review-fix-loop.ts` (+ `plugins/review-fix-loop/`) | `config` + `command.execute.before` + `system.transform` | `/review-fix-loop` command; arms session and injects protocol from markdown into system prompt. |
| `grill-improve-loop.ts` (+ `plugins/grill-improve-loop/`) | `config` + `command.execute.before` + `system.transform` | `/grill-improve-loop` command; score-driven improvement loop; injects protocol from markdown into system prompt. |
| `ultra-dev.ts` (+ `plugins/ultra-dev/`) | `config` + `command.execute.before` + `system.transform` | `/ultra-dev` command; autonomous multi-phase execution track; injects protocol from markdown into system prompt. |
| `grill-me.ts` / `grill-with-docs.ts` (+ `plugins/grill/`) | `config` + `command.execute.before` + `system.transform` | `/grill-me` and `/grill-with-docs` commands; inject grilling protocols. |
| `goal.ts` (+ `plugins/goal/`) | `config` + `system.transform` | `/goal` command; injects goal execution protocol. |
| `handoff.ts` (+ `plugins/handoff/`) | `config` + `system.transform` | `/handoff` command; injects handoff protocol. |
| `profile-wizard.ts` | TUI plugin | `/profile` dialog wizard: tier review, per-tier model override, live apply via server config API with file rewrite on request failure. Announces active profile on session creation. |
| `provider-wizard.ts` | TUI plugin | `/provider` dialog wizard: baseURL/apiKey prompts, atomic write, model add/remove management. |
| `queue-manager.ts` | TUI plugin | `/queued` command: list/edit/cancel queued user messages. |
| `project-wizard.ts` | TUI plugin | `/project-wizard` dialog wizard: two-tier interactive wizard (scaffolding init, switch configuration, template sync, index catch-up) with re-entrant echo. |
| `md-to-pdf.ts` (+ `plugins/md-to-pdf/`) | `config` + `command.execute.before` + `system.transform` + custom tool | `/md-to-pdf` command & `md_to_pdf` tool: converts Markdown to styled A4 PDF via Pandoc + Playwright. Auto-steers natural language `@filepath 转PDF`. |
| `md-to-docx.ts` (+ `plugins/md-to-docx/`) | `config` + `command.execute.before` + `system.transform` + custom tool | `/md-to-docx` command & `md_to_docx` tool: converts Markdown to publication-quality styled Word (.docx) documents via Pandoc + Python typography engine. |

All slash commands are registered programmatically via the `config` hook — no `commands/*.md` files are needed. Protocol bodies live as markdown next to their plugin and are loaded at runtime, injected via `experimental.chat.system.transform` (LLM-only, not visible in chat UI). Every such injector passes through the `plugin-scope.ts` gate first (see shared plumbing), so protocols never land in `@lite`, utility sessions, or subagent steps.

### Auto-advisor internals

**Storage**: the `autoAdvisorMode` field in the project `opencode.jsonc` — no hidden state file, no env var. Resolution: project config → `off` (default); purely project-level, no global fallback. `/auto-advisor` always writes to the project-level config only (comments and other fields preserved).

**Five-hook enforcement** (`plugins/auto-advisor-mode.ts` + helpers in `plugins/auto-advisor/`):

1. `command.execute.before` — `/auto-advisor <mode>` upserts `autoAdvisorMode` in the project `opencode.jsonc`
2. `experimental.chat.system.transform` — injects the active-mode marker + embedded protocol into every system prompt
3. `tool.execute.before` — full-mode auto-answer enforcement (blocks question tool when advisor auto-answered); off-mode relies on system prompt soft guard (no auto-dispatch, manual @advisor allowed)
4. `tool.execute.after` — parses confidence; full mode ≥ 8 gets the auto-execute directive (max 10/session, never on model fallback, never on red-team output)

### Red-team stance internals

An optional dispatch stance where `@advisor` argues AGAINST a proposal instead of balancing options — the design-phase gate, symmetric to `@code-review` as the implementation-phase gate. Same agent, same mode gating; only the stance changes.

- **Triggers**: explicit user request ("red team this" / "唱反调"), or orchestrator auto-trigger before irreversible design decisions (schema migration, public API contract, auth/permission redesign, destructive data operations). Never for routine single-domain tasks, bug fixes, or docs.
- **Output**: verdict `HOLDS` / `HOLDS WITH CAVEATS` / `FAILS` + severity-ranked attack list (weakness → what breaks → evidence) + steelmanned-defense rebuttal. No confidence score, by design.
- **On FAILS**: the orchestrator re-dispatches the design owner (`@architect`) with the attacks for rebuttal/revision, then presents attacks + rebuttal to the user. Optional tie-breaker: `@advisor` in neutral stance.
- **No blue team, on purpose**: the design owner defends their own proposal — a separate defender agent would produce hollow defense without design context. The system's real "blue team" is the implementation-phase gates: `@code-review`, `@security`, `@qa`, `/review-fix-loop`.

**Auto-execute isolation, enforced twice**:

- Prompt level: red-team output never carries a confidence score
- Code level: `isRedTeamOutput()` in `auto-advisor-runtime.ts` suppresses ALL directives in `auto-advisor-full-inject.ts` — adversarial verdicts can never trigger full-mode auto-execute, even if a stray score appears

### Compile & type-check

```bash
bun install
bunx tsc --noEmit    # type-check only — opencode compiles plugins at runtime
```

Opencode compiles plugins at runtime, but type errors indicate logic issues — run the check after any plugin change.

---

## Installer engine & OCP CLI

`install/` is a self-contained TypeScript engine (`install/src/`, run via Bun through `install/install.ps1` / `install/install.sh`). Modules:

- `index.ts` — CLI entry: action parsing (`install` / `update` / `status` / `generate` / `register` / `unregister` / `wizard` / `dashboard` / `tui` / `serve` / `web` / `desktop`), and the launcher dispatch below;
- `installer.ts` — manifest-driven install/update/uninstall/status;
- `manifest.ts` — `SHIPPED_DIRS` / `SHIPPED_FILES` → manifest generation;
- `wizard.ts` / `dashboard.ts` — interactive TUI setup wizard and single-screen control center (rows include `global_commands` and `openchamber` switches);
- `shim.ts` — global shims (`registerShim`) + PATH provisioning (`ensureBinDirOnPath`: Windows user-PATH registry via `[Environment]::SetEnvironmentVariable` — never `setx`; POSIX guarded profile block) wrapped by `runGlobalRegistration`;
- `launcher.ts` — runtime launchers behind `ocp tui` / `serve` / `web` / `desktop`, including the OpenChamber port-reclaim and auto-password logic;
- `openchamber.ts` — provision the `openchamber` CLI via the first detected package manager (pnpm > bun > yarn > npm) when missing (needs Node.js 22+).

`bin/opencode-prime` (bash) and `bin/opencode-prime.ps1` (PowerShell 7+) are standalone dispatchers that mirror the same subcommands without requiring Bun — installer subcommands exec `install.sh` / `install.ps1`, launcher subcommands (`tui`, `serve`, `web`, `desktop|ui`) are implemented natively per platform. `bin/ocp` / `bin/ocp.ps1` are thin forwarders. The full user-facing command list lives in the docs (`docs/maintenance/ocp-cli.md`).

Option switches in `install/options.jsonc` that gate engine behavior: `global_commands` (register shims + PATH during install) and `openchamber` (provision the `openchamber` CLI); both default `true`.

---

## Testing

```powershell
# Structural checks only (no API calls)
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -StructuralOnly

# Structural + API prompt tests
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1

# Include behavioral prompt tests (API calls)
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -IncludePrompts

# Advisor-mode end-to-end (requires opencode CLI + LLM_ROUTER_* env vars)
pwsh -ExecutionPolicy Bypass -File tests/test-advisor-e2e.ps1

# Profile stress test (no API calls) — every profile applied to a fresh
# template copy; agent refs, root model, untouched tiers asserted
pwsh -ExecutionPolicy Bypass -File tests/test-profiles.ps1

# Unit tests (Bun) for individual plugins
bun tests/test-adr-guard-unit.ts
bun tests/test-env-guard-unit.ts
bun tests/test-e2e-guard-unit.ts
bun tests/test-project-manager-unit.ts
bun tests/test-project-wizard-unit.ts
bun tests/test-queue-manager-unit.ts
bun tests/test-anchor-unit.ts
```

Pre-install gate (single-user repo — no CI by design): run `test-all.ps1 -StructuralOnly` (exit code 0) before `install/install.ps1`. Type-check the plugins once after toolchain setup: `bun install && bunx tsc --noEmit`. Runtime behavior (hooks, LLM compliance) still requires a real `opencode` environment — see the release workflow below.

API-test prerequisites:

```powershell
$env:LLM_ROUTER_BASE_URL = "https://router.example.com/v1"
$env:LLM_ROUTER_API_KEY  = "<your-api-key>"
```

### Test coverage

| Test | What it verifies |
|------|-----------------|
| Structural | File existence, frontmatter, protocol injection, content patterns, red-team guards |
| Decision strategy | Two-tier decision strategy, subagent no-ask rule, blocking markers |
| Advisor e2e | `/auto-advisor off/lite/full` state writes, invalid-arg no-op, off-mode soft guard (no auto-dispatch, manual @ allowed), cross-process persistence |
| Profiles | Every profile applies cleanly to a fresh template (agent refs, root model, untouched tiers) |
| Plugin units | adr-guard commit gating, env-guard blocking matrix, e2e-guard state & prompt injection, project-manager gates, queue-manager behavior, deepseek-anchor protocol |
| build.md / plan.md | Routing table, team table, workflow templates, identity, read-only rule |

---

## Design decisions

### Why not a single mega-prompt?
Token cost + context dilution. Specialist agents get only relevant domain knowledge, keeping context windows focused.

### Why shared instructions (`instructions` array)?
Output protocol, test scope, RFC keywords, and coding principles apply to ALL agents. Injecting via `instructions` ensures consistency without duplicating in each file.

### Why two primary orchestrators (build + plan) plus code?
- **build** = execution coordinator (write code, run tests, deploy)
- **plan** = read-only analysis coordinator (review, audit, design)
- **code** = direct developer for single-domain tasks (no proactive delegation)
- Separation prevents analysis agents from accidentally modifying code.

### Why explorer uses the `explorer` tier?
Exploration is high-volume, low-complexity. Cheaper model + read-only + bounded steps = fast and cheap context gathering before dispatching specialists.

### Why no `designer` agent?
Design expertise (Design Tokens, AI Slop detection) is injected directly into `frontend-dev.md`. A separate designer agent would add routing overhead without sufficient benefit — frontend-dev already owns the UI domain.

### Why RFC 2119 for Hard rules but not competencies?
- Hard rules = constraints → LLM needs clear, unambiguous directives → RFC 2119 keywords maximize compliance.
- Competencies = knowledge → LLM needs semantic context for routing → prose is more effective than over-formalized bullets.

### Why `tiers.json` sidecar?
Upstream OpenCode (Console Go) rejects unknown schema fields in `opencode.jsonc`. The custom `tier` metadata therefore lives in a sidecar file consumed by the profile tooling instead of the root config.

---

## File inventory

```
instructions/
├── output-protocol.md        # Shared output format
├── test-scope.md             # Tiered test scope policy
├── rfc-keywords.md           # RFC 2119 keyword semantics
├── coding-principles.md      # Shared coding principles
└── edit-protocol.md          # Search-expression edit discipline (serena)

agents/
├── build.md                  # Primary: execution coordinator
├── plan.md                   # Primary: read-only analysis coordinator
├── code.md                   # Primary: direct developer (default entry)
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

profiles/                     # Tier→model presets applied via /profile
providers/
├── antigravity-router.json   # Custom provider definition (auto-loaded preset; importable via /provider → "Add preset")
├── claude-code-router.json   # Custom provider definition (auto-loaded preset; importable via /provider → "Add preset")
├── codex-router.json         # Custom provider definition (auto-loaded preset; importable via /provider → "Add preset")
├── llm-router.json           # Custom provider definition (auto-loaded preset; importable via /provider → "Add preset")
└── qoder-router.json         # Custom provider definition (auto-loaded preset; importable via /provider → "Add preset")

plugins/
├── shared/opencode-prime.ts      # Shared JSONC plumbing (project dir, field upsert)
├── auto-advisor-mode.ts           # Barrel: advisor mode guard (5 hooks)
├── auto-advisor/                  # Mode config, runtime, protocol, per-hook helpers
├── adr-guard.ts                   # Barrel: ADR iron-law plugin
├── adr-guard/                     # Config, runtime, guards, protocol, per-hook helpers
├── env-guard.ts                   # Barrel: secret-file gate
├── env-guard/                     # Config, runtime, tool guard
├── e2e-guard.ts                   # Barrel: E2E guard plugin
├── e2e-guard/                     # Config, protocol, instructions, system-inject, command
├── project-manager.ts             # Barrel: /project + commit discipline
├── project-manager/               # Command, scaffold, index, guards, templates/
├── project-profiler.ts            # Barrel: project profile injection
├── deepseek-anchor.ts             # Barrel: /deepseek-anchor command
├── deepseek-anchor/               # Command, config, announce, index
├── review-fix-loop.ts             # Barrel: /review-fix-loop
├── review-fix-loop/               # Implementation + protocol markdown
├── grill-improve-loop.ts          # Barrel: /grill-improve-loop
├── grill-improve-loop/            # Implementation + protocol markdown
├── ultra-dev.ts                   # Barrel: /ultra-dev
├── ultra-dev/                     # Implementation + protocol markdown
├── grill-me.ts / grill-with-docs.ts  # Barrels
├── grill/                         # Implementations + protocol markdowns
├── goal.ts                        # Barrel: /goal
├── goal/                          # Implementation + protocol markdown
├── handoff.ts                     # Barrel: /handoff
├── handoff/                       # Implementation + protocol markdown
├── openrtk.ts                     # Barrel: vendored rtk command rewrite
├── openrtk/                       # Implementation + rewrite logic
├── lite-mode.ts                   # Hook: strip L0 from @lite system prompt
├── lite-mode/                     # Implementation
├── shared/plugin-scope.ts         # Injection gate (consumes plugin-scope.json)
├── design-token-guard.ts          # Hook: block hardcoded design values
├── ai-slop-scanner.ts             # Hook: scan for AI anti-patterns
├── metrics.ts                     # Hook: auto-collect tool metrics
├── auto-format.ts                 # Hook: auto-run formatters
├── browser-screenshot.ts          # Custom tool: Playwright screenshots
├── profile-wizard.ts              # TUI plugin: /profile dialog wizard
├── provider-wizard.ts             # TUI plugin: /provider dialog wizard
└── queue-manager.ts               # TUI plugin: /queued dialog manager

tests/
├── test-all.ps1              # Main test runner (structural + prompt tests)
├── test-profiles.ps1         # Profile stress test
├── test-advisor-e2e.ps1      # Advisor-mode end-to-end (needs opencode CLI)
├── test-*-unit.ts            # Bun unit tests (adr-guard, env-guard, e2e-guard,
│                             #   project-manager, queue-manager, anchor)
├── test-build/plan/subagent/ # Prompt dispatch tests
├── test-decisions.ps1        # Decision strategy checks
└── README.md                 # Test documentation
```

---

## Release workflow

1. Bump `version` in `install/version.json` (e.g. `0.7.0`) and sync `package.json` `version` + `install/README.md` title to match.
2. Regenerate the manifest: `bun run install/src/index.ts generate` (or `ocp generate`) — the manifest is **always overwritten**, so ensure `SHIPPED_DIRS` / `SHIPPED_FILES` in `install/src/manifest.ts` include every new file (see `AGENTS.md` §4). **Never hand-edit a generated manifest.**
3. Run structural tests: `pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -StructuralOnly`.
4. Type-check plugins: `bun install && bunx tsc --noEmit`.
5. Commit and push to `main`.
6. Tag and push: `git tag v0.7.0 && git push origin v0.7.0`.
7. The [Release workflow](.github/workflows/release.yml) builds `opencode-prime-<ver>.tar.gz` + `.zip` and creates a GitHub Release automatically — no manual artifact upload needed.

Runtime behavior (hooks, LLM compliance) cannot be fully covered by the structural suite — verify in a real `opencode` environment against the pre-release flow before tagging.
