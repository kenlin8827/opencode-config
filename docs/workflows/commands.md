# Workflow Slash Commands

OpenCode Multi-Agent ships with a suite of high-leverage workflow slash commands.

---

## Command Overview

| Command | Category | What it does |
|---|---|---|
| **`/prd <topic>`** | SDD Lifecycle | Scaffold & draft Product Requirements Document in `docs/prd/` |
| **`/adr [new\|supersede\|tree\|check\|migrate\|mode]`** | Architecture | Architecture Decision Record management: automated drafting, supersede lifecycle, DAG graph, link audits, bidirectional migrations & hierarchy mode switches |
| **`/plan <topic>`** | SDD Lifecycle | Scaffold & draft phased Implementation Plan in `docs/plan/` with automatic PRD & ADR linking |
| **`/impl [task]`** | SDD Lifecycle | Execute test-driven code implementation & verification adhering to specifications |
| **`/sdd [status\|handoff\|help]`** | SDD Lifecycle | Specification-Driven Development lifecycle navigator & session handoff (`/sdd handoff`) |
| **`/grill-me <topic>`** | Brainstorming | Socratic interview that rigorously pressure-tests a plan or design |
| **`/grill-with-docs <topic>`** | Brainstorming | Same as `/grill-me`, plus automatically creates `CONTEXT.md` glossary and ADRs |
| **`/review-fix-loop [scope] [--max-rounds=N]`** | Quality Loop | Automated review-verify-fix-re-review loop until zero P0/P1 issues. Scope: `last commit`, `HEAD~N`, `branch`, `PR`, or uncommitted changes |
| **`/goal [text]`** | Goal Execution | Structured goal execution protocol with audit-friendly checklists and mechanically checkable stop conditions |
| **`/handoff [focus]`** | Session State | Compacts current session state into a temporary handoff bundle and outputs a paste-ready opener for a fresh session |
| **`/adr-guard [on\|off\|status]`** | Quality Gate | Project-level ADR commit gate: enforces architecture decision records on `feat:` and `refactor:` commits |
| **`/e2e-guard [on\|off\|status]`** | Quality Gate | Project-level E2E testing gate: requires end-to-end coverage verification on features and bug fixes |
| **`/env-guard [on\|off\|status]`** | Security Gate | Project-level secret leak prevention: blocks reading or leaking `.env` files to external tools |
| **`/deepseek-anchor [on\|off\|status]`** | Model Engine | DeepSeek V4/Pro reasoning depth anchor: prevents reasoning degradation and gates tools during deliberation |
| **`/auto-advisor [off\|lite\|full]`** | Intelligence | Toggle auto-advisor mode (`off`, `lite` recommendations, `full` factual auto-answers) |
| **`/md-to-pdf <file.md> [output.pdf]`** | Publishing | Export Markdown to high-res A4 PDFs with 300 DPI Mermaid diagrams, CSS themes & `--doctor` diagnostics |
| **`/md-to-docx <file.md> [output.docx]`** | Publishing | Export Markdown to publication-grade Word (.docx) with pure TS engine, dual fonts & Mermaid rendering |
| **`/project [init\|index\|sync]`** | Project Setup | Scaffold project baseline files (`.opencode/opencode.jsonc` etc.) and trigger CodeGraph / GitNexus indexing |
| **`/project-wizard`** | TUI Wizard | Interactive project configuration wizard: toggle MCP services and plugins via visual terminal UI |
| **`/profile`** | TUI Wizard | Open model profile picker: easily switch or customize Auto / Ultimate / Performance / Economy / Lightweight tiers |
| **`/provider`** | TUI Wizard | Open provider wizard: configure credentials (`baseURL` / `apiKey`) and manage model catalogs |
| **`/queued`** | TUI Wizard | Interactive TUI dialog to inspect, edit, or cancel queued messages submitted while the agent was busy |



---

## Example: review-fix-loop

```
> /review-fix-loop last commit
  → @code-review finds P0/P1 issues
  → Verifies each finding (reads code, traces data flow, checks upstream guards)
  → If false positive → skipped only after @advisor confirms
  → If confirmed BUG → @<domain-dev> fixes each verified issue
  → @code-review re-reviews
  → Repeats until clean or max rounds reached (default: 5)
  → Summary output: verdict + stats

> /review-fix-loop HEAD~3 --max-rounds=8
  → Same flow, up to 8 rounds (good for larger diffs)
```
