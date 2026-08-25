# Workflow Slash Commands

OpenCode Multi-Agent ships with a suite of high-leverage workflow slash commands.

---

## Command Overview

| Command | What it does |
|---|---|
| `/auto-advisor off\|lite\|full` | Toggle auto-advisor mode |
| `/provider` | Open the provider wizard (TUI only): set credentials (`baseURL` → `apiKey` prompts) for active or shipped router definitions, or manage a provider's model list |
| `/profile` | Open the profile picker dialog: list all available model provider profiles (active marked); selecting one opens the tier review dialog to tweak models per tier before applying |
| `/review-fix-loop [scope] [--max-rounds=N]` | Automated review-verify-fix-re-review loop until zero P0/P1 issues. Scope: `last commit`, `HEAD~N`, `branch`, `PR`, or omit (uncommitted changes). `--max-rounds=N` overrides default 5 |
| `/goal [text]` | Structured goal execution protocol with audit-friendly checklists and mechanically checkable stop conditions |
| `/handoff [focus]` | Compacts current session into a handoff document (saved to OS temp directory) for a fresh session to take over |
| `/project init` | Scaffold project baseline files (`.opencode/opencode.jsonc`, `docs/git-commits.md`, `AGENTS.md`) and run first-time backend indexers (`codegraph init`, `gitnexus analyze`) |
| `/project index` | Manually refresh existing indexes: `codegraph sync`, `gitnexus analyze` |
| `/project sync` | Config top-up only: appends template comment switches that the existing `.opencode/opencode.jsonc` lacks |
| `/grill-me <topic>` | Socratic interview that pressure-tests a plan or design |
| `/grill-with-docs <topic>` | Same as `/grill-me`, plus creates a `CONTEXT.md` glossary and ADR |
| `/adr [new\|supersede\|tree\|check\|mode]` | Architecture Decision Record management: scaffold templates, supersede lifecycle, render DAGs, audit links, and configure hierarchy modes |
| `/adr-guard [on\|off\|status]` | Toggle the project-level ADR commit iron law gate for `feat`/`refactor` commits |
| `/md-to-pdf <file.md> [output.pdf] [--style=custom.css]` | Export Markdown documents to high-quality A4 PDFs. Supports 300 DPI Mermaid diagrams, CSS stylesheets, `.opencode/md-to-pdf.css`, `--doctor` diagnostics & `--install-deps` auto-repair |
| `/md-to-docx <file.md> [output.docx] [--style=custom.css]` | Export Markdown documents to publication-quality Executive Word (.docx). Supports pure TS engine, dual Chinese-Western fonts, Mermaid diagrams, CSS styling, `.opencode/md-to-docx.css`, `--doctor` & `--install-deps` |



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
