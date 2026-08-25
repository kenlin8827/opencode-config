# ADR Iron Law & Living Architecture

This project records architecture decisions as ADRs following the MADR
(Markdown Any Decision Records) convention — the industry-standard template.
Architecture decisions are treated as living, queryable artifacts rather than
dead archives.

## The iron law

**Every `feat` or `refactor` commit MUST include at least one new or updated
ADR in the same commit.** Other commit types (fix, docs, chore, test, …) are
not gated, but a genuinely architectural fix **MAY** still deserve an ADR.

## Hierarchical Decision Model (Coarse to Fine)

In complex codebases, ADRs are structured into three distinct layers:

1. **L1: System & Macro Decisions (`layer: system`)**
   - *Location*: Global `docs/adr/`
   - *Scope*: System-wide tech stack, core communication paradigms, global security, data architecture.
2. **L2: Domain & Subsystem Decisions (`layer: domain`)**
   - *Location*: `packages/<name>/docs/adr/` or `apps/<name>/docs/adr/`
   - *Scope*: Service boundaries, database sharding, domain state machines, queue topology.
3. **L3: Component & Module Decisions (`layer: component`)**
   - *Location*: Subsystem or component `docs/adr/`
   - *Scope*: Internal state management, caching schemes, critical algorithm choices.

## Tooling & Slash Commands
- `/adr [new] [system|domain|component] <title> [--empty]` — Scaffolds next sequential MADR and dispatches to AI for drafting (pass `--empty` for scaffold only).
- `/adr supersede <old-id> <new-title> [--empty]` — Marks old ADR superseded, scaffolds new ADR with cross-references, and dispatches to AI.
- `/adr migrate [h|f|a] [--confirm]` — Restructures ADR directories between flat and hierarchical layouts.
- `/adr tree` — Visualizes the full hierarchical decision map and Mermaid DAG.
- `/adr check` — Validates links, frontmatter integrity, and index synchronization.
- `/adr-guard on|off|status` — Toggles the hard commit guard.

## Slash Command & Natural Language Auto-Drafting Protocol
When `/adr`, `/adr new`, `/adr supersede`, or a natural language ADR request is received:
1. **Scaffold Discovery**: The local TypeScript engine has already created the new `docs/adr/NNNN-slug.md` file (and updated `INDEX.md`). Find the latest ADR file in `docs/adr/` (or target layer directory).
2. **Context Research**: Use tools (`read_file`, `grep_search`, `find_by_name`) to research the workspace context, current technical architecture, dependencies, and requirements.
3. **Write Complete MADR**: Use `replace_file_content` or `write_to_file` to flesh out the document with:
   - Real **Context and Problem Statement**
   - Concrete **Decision Drivers**
   - Viable **Considered Options** with **Pros and Cons**
   - Defensible **Decision Outcome** and **Consequences** (Positive, Negative/Risks & Mitigations)
   - Preserve valid YAML frontmatter (`status`, `date`, `layer`, `scope`, `parent`, `superseded_by`).
4. **Respond to User**: Provide a crisp walkthrough and summary of the decision record drafted.


## Before you commit — checklist

1. For feat/refactor the answer to "did this change make or alter a
   decision?" is treated as **YES by default** — architecture shape,
   boundaries, tech choice, integration pattern, deliberate deviation,
   constraint not visible in code.
2. **New decision** → run `/adr new [layer] <title>` or create the next ADR file
   (sequential number `NNNN-slug.md`).
3. **Changed decision** → run `/adr supersede <old-id> <new-title>` (accepted
   ADRs are immutable except their status).
4. Stage the ADR file(s) together with the code change, then commit.
5. Keep `INDEX.md` updated in the corresponding directory.

## ADR template (MADR)

```md
---
status: accepted     # proposed | rejected | accepted | deprecated | superseded by NNNN
date: 2026-08-25     # ISO date of the decision / latest status change
layer: system        # system | domain | component
scope: global        # optional scope or package name
parent: docs/adr/0001-slug.md  # optional parent ADR
---

# NNNN. <short title of the decision>

## Context and Problem Statement

<the situation, architectural context, and the decision to be made>

## Decision Outcome

Chosen option: <what we decided>, because <why>.
```

## Frontmatter semantics:
- `proposed` — under discussion, not yet binding.
- `accepted` — the current binding decision.
- `rejected` — decided against; keep it as a negative record so the idea is not raised again unknowingly.
- `deprecated` — no longer applies but not replaced by another ADR.
- `superseded by NNNN` — fully replaced; the successor ADR **MUST** cross-reference back.
- An accepted ADR is immutable: only its frontmatter `status` may change. Any change to the decision itself **MUST** be a new superseding ADR.

## If the guard blocks your commit

The block message names the missing ADR requirement. Fix it properly: create
the ADR (or the superseding pair), stage it, re-run the commit. You **MUST
NOT** bypass the guard by relabeling the commit type (e.g. calling a feat a
chore) — that corrupts the changelog.

