# Plugins & Project Guardrails

Plugins provide runtime enforcement and workflows that prompts alone cannot achieve. Everything below ships enabled — nothing to install.

---

## Plugins Overview

| Plugin | What it does for you |
|---|---|
| `project-profiler.ts` | Detects project languages & active MCP servers at session start; steers agents to LSP/graph queries before grep |
| `design-token-guard.ts` | Blocks writes with hardcoded colors/spacing/radius — keeps frontend code on design tokens |
| `ai-slop-scanner.ts` | Warns about AI anti-patterns in frontend files (gradient soup, div soup) |
| `metrics.ts` | Auto-records tool call metrics (duration, success, agent) as JSONL in `~/.config/opencode/.metrics/` |
| `auto-format.ts` | Auto-runs prettier/eslint/ruff/gofmt/rustfmt after file edits |
| `auto-advisor-mode.ts` | `/auto-advisor` command, protocol injection, mode gating, red-team suppression |
| `review-fix-loop.ts` | `/review-fix-loop` command and protocol |
| `goal.ts` | `/goal` command and protocol |
| `handoff.ts` | `/handoff` command and protocol |
| `deepseek-anchor.ts` | `/deepseek-anchor` command — anchor-based reasoning protocols with DeepSeek models |
| `adr-guard.ts` | `/adr-guard` command — per-project ADR enforcement |
| `env-guard.ts` | Per-project secret-file gate |
| `e2e-guard.ts` | `/e2e-guard` command — per-project gate: E2E runs need user confirmation |
| `project-manager.ts` | `/project` command + commit discipline |
| `queue-manager.ts` | `/queued` command — manage prompts queued while the session is busy |
| `profile-wizard.ts`, `provider-wizard.ts` | `/profile` and `/provider` TUI dialog wizards |

---

## ADR Iron Law & Living Architecture (`adr-guard` & `/adr`)

Enterprise-grade Architecture Decision Record governance. Operates in two complementary modes:

1. **Commit Iron Law (`/adr-guard`)** — Hard/soft guardrails preventing unrecorded architecture drift on `feat`/`refactor` commits.
2. **Hierarchical Living Architecture (`/adr`)** — Frictionless authoring, decision lifecycle management, multi-level hierarchy, and interactive DAG visualization.

### Switch & Configuration

The commit guard switch is **project-level** (stored in `opencode.jsonc`):

```text
/adr-guard on       # enable commit gate for this project
/adr-guard off      # disable commit gate
/adr-guard          # status report (state + ADR dir)
```

The hierarchy governance mode is configured via `/adr mode`:

```text
/adr mode                   # show current governance mode (auto | flat | hierarchical)
/adr mode flat              # pure flat single-directory mode (docs/adr/)
/adr mode hierarchical      # strict multi-tier hierarchy (L1/L2/L3)
/adr mode auto              # smart adaptive mode (default: flat by default, expands on multi-package)
```

### Slash Commands (`/adr`)

| Command | Description | Example |
|---|---|---|
| `/adr new [layer/scope] <title>` | Scaffold a sequential MADR template & update `INDEX.md` | `/adr new "Use PostgreSQL as Primary DB"` |
| `/adr supersede <old-id> <new-title>` | Atomically mark old ADR as superseded & scaffold replacement with mutual cross-references | `/adr supersede 0001 "Migrate to NATS JetStream"` |
| `/adr migrate [h\|f\|a] [--confirm]` | Preview or execute bidirectional ADR directory restructuring | `/adr migrate h` |
| `/adr tree` / `/adr map` | Render full architecture decision tree & Mermaid DAG diagram | `/adr tree` |
| `/adr check` / `/adr lint` | Audit link integrity, parent references, and complexity advice | `/adr check` |

#### 1. Creating a Decision (`/adr new`)
* **Standard / Flat Monolith**:
  ```text
  /adr new "Use PostgreSQL as Primary Database"
  ```
  Generates `docs/adr/0003-use-postgresql-as-primary-database.md` with standard MADR template sections and updates `docs/adr/INDEX.md`.
* **Hierarchical / Monorepo**:
  ```text
  /adr new system "Global Event Bus Standard"          # L1 System (in docs/adr/)
  /adr new domain/payment "Stripe Webhook Processing"  # L2 Domain (in packages/payment/docs/adr/)
  /adr new component/auth "JWT Refresh Rotation"       # L3 Component
  ```

#### 2. Superseding an Old Decision (`/adr supersede`)
Architecture decisions are immutable; evolving solutions should be recorded via `supersede`:
```text
/adr supersede 0001 "Migrate from RabbitMQ to NATS JetStream"
```
**Atomic System Actions**:
1. Marks `0001` frontmatter status as `status: superseded by 0004` with deprecation notes;
2. Scaffolds `0004` with `parent: docs/adr/0001-use-rabbitmq.md`;
3. Automatically synchronizes respective `INDEX.md` files.

#### 3. Restructuring & Migration (`/adr migrate`)
* **Dry-Run Preview**: `/adr migrate h` (or `/adr migrate hierarchical`) outputs the planned file moves without modifying files.
* **Execution**: `/adr migrate h --confirm` atomically moves files, rewrites frontmatter and mutual references, and updates all directory indexes.

### Dual-Track Interaction: Natural Language & Slash Commands

The ADR governance system supports **Slash Commands (deterministic local execution)** and **Natural Language (AI-assisted architectural drafting)** side-by-side:

| Scenario | Natural Language (Deep AI Drafting) | Slash Commands (Instant Local Scaffolding) |
| :--- | :--- | :--- |
| **New Decision** | "Help me draft an ADR on using Redis for distributed locking"<br>$\to$ **AI researches requirements, compares alternatives (Redlock vs ETCD vs DB lock), drafts full MADR trade-offs, writes file & syncs `INDEX.md`** | `/adr new "Redis Distributed Lock Standard"` |
| **Supersede** | "Deprecate ADR 0001, we are switching from RabbitMQ to Kafka"<br>$\to$ **AI marks 0001 as `superseded by 0005`, scaffolds the new ADR with migration context and cross-references** | `/adr supersede 0001 "Migrate to Kafka"` |
| **Integrity Audit** | "Audit all ADRs to verify if there are broken links or missing fields"<br>$\to$ **AI validates frontmatter, parent links, and provides remediation** | `/adr check` |
| **Architecture Migration** | "We restructured into a monorepo, migrate payment and auth ADRs to their sub-packages"<br>$\to$ **AI plans and safely executes directory restructuring** | `/adr migrate h --confirm` |

### Hierarchical Layers (Coarse to Fine)


- **L1: System & Macro (`layer: system`)** — Global `docs/adr/` (tech stack, core communication, global data architecture).
- **L2: Domain & Subsystem (`layer: domain`)** — `packages/<name>/docs/adr/` or `apps/<name>/docs/adr/` (service boundaries, state machines, domain storage).
- **L3: Component & Module (`layer: component`)** — Module `docs/adr/` (local algorithms, state management).



---

## Secret file guard (`env-guard`)

Optional per-project gate keeping secret-bearing env files out of the LLM context. The switch is **project-level** and defaults to off:

```text
# enable for this project (either one)
echo on > <project>/.opencode/.env-guard
# or add "envGuard": "on" to the project's opencode.jsonc
```

When on, agent access is blocked before execution for file tools targeting `.env`, `.env.local`, `.env.production`, etc., and shell commands reading `.env` into stdout.

---

## E2E gate (`e2e-guard`)

Optional per-project gate requiring explicit user confirmation before any E2E suite runs:

```text
/e2e-guard on       # enable for this project ("e2eGuard": "on" in project opencode.jsonc)
/e2e-guard off      # disable
/e2e-guard          # status report
```

Gating is graded by risk:
- **full**: Suite run with no explicit target (`npm run e2e`, bare `playwright test`) — every run needs a fresh one-shot `/e2e-guard allow` pass.
- **targeted**: Explicit spec/test-file argument (`playwright test tests/login.spec.ts`) — passes automatically once the session has confirmed approval.

---

## Commit discipline (`project-manager`)

Per-project commit-convention enforcement with a **file-as-switch**: no state file, no on/off command — the discipline is active exactly while `docs/git-commits.md` exists.

```text
/project init       # scaffold baseline files (.opencode/opencode.jsonc, docs/git-commits.md, AGENTS.md)
/project index      # manually refresh existing indexes (codegraph sync, gitnexus analyze)
/project sync       # config top-up only (append-only)
```

While `docs/git-commits.md` exists:
- First line of commit message must match `type(scope): summary` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style`, `revert`) and stay ≤ 72 characters.

---

## Managing queued prompts (`/queued`)

OpenCode persists prompts submitted while busy as user messages. The bundled `queue-manager.ts` TUI plugin provides an interactive UI:

- `/queued` opens a select dialog listing queued messages.
- Options: **Edit text**, **Cancel message**, **View full text**, **Cancel ALL**.
