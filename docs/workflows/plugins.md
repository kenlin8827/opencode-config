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

## ADR iron law (`adr-guard`)

Optional per-project enforcement of Architecture Decision Records. The switch is **project-level** and defaults to off:

```text
/adr-guard on       # enable for this project (writes <project>/.opencode/.adr-guard)
/adr-guard off      # disable
/adr-guard          # status report (state + ADR dir)
```

When on:
- **Soft layer** — the iron-law protocol is injected into the system prompt: agents write/update the ADR proactively before committing.
- **Hard layer** — `git commit` is blocked when the message type is `feat`/`refactor` and no file under the ADR directory appears in the working-tree change set.
- **ADR format** — strict MADR: frontmatter `status` + `date`, body `## Context and Problem Statement` + `## Decision Outcome`.

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
