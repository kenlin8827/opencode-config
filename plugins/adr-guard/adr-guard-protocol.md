# ADR Iron Law

This project records architecture decisions as ADRs following the MADR
(Markdown Any Decision Records) convention — the industry-standard template,
exactly as defined, nothing added. The iron law below is enforced by a
code-level commit guard.

## The iron law

**Every `feat` or `refactor` commit MUST include at least one new or updated
ADR in the same commit.** Other commit types (fix, docs, chore, test, …) are
not gated, but a genuinely architectural fix **MAY** still deserve an ADR.

## Enforcement boundary

The commit guard blocks `git commit` only when ALL of these hold: the iron
law is on, the command carries an inline message (`-m` / `--message`), its
conventional-commit type is feat or refactor, and no file under the ADR
directory appears in the working-tree change set. The guard fails open (does
NOT block) for `--amend` re-commits, editor/heredoc commits without an
inline message, and git errors. Chained commands are judged per commit — an
`--amend` never exempts a later fresh commit. The gate reads the command's
token stream, so commits issued through a subshell (`bash -c '...'`,
`$(...)`) or glued without a whitespace boundary (`done&&git commit ...`)
are outside its mechanical reach. Therefore: **you MUST treat the iron law as
binding even when the guard cannot see the commit** — the guard is the last
line, protocol discipline is the first.

## Before you commit — checklist

1. For feat/refactor the answer to "did this change make or alter a
   decision?" is treated as **YES by default** — architecture shape,
   boundaries, tech choice, integration pattern, deliberate deviation,
   constraint not visible in code.
2. **New decision** → create the next ADR file (sequential number) from the
   MADR template below.
3. **Changed decision** → write a NEW ADR with the new decision and set the
   old ADR's frontmatter `status` to `superseded by NNNN`. Accepted ADRs are
   otherwise immutable.
4. Stage the ADR file(s) together with the code change, then commit.
5. Update `INDEX.md` in the ADR directory (flat list by number).

## Numbering & file names

- ADR files: `NNNN-slug.md` — zero-padded 4-digit sequential number
  (`0001-…`, `0002-…`). Scan the ADR directory for the highest existing
  number and add one. Numbers **MUST NOT** be reused or reset.
- If two new ADRs collide on the same number (concurrent work), the one
  merged second **MUST** renumber before commit and fix any cross-references.
- *When* a decision was made lives in the frontmatter `date` field and in
  git history (which release contains the commit) — never in the file number.

## ADR template (MADR)

```md
---
status: accepted     # proposed | rejected | accepted | deprecated | superseded by NNNN
date: 2026-08-21     # ISO date of the decision / latest status change
---

# NNNN. <short title of the decision>

## Context and Problem Statement

<the situation and the decision to be made>

## Decision Outcome

Chosen option: <what we decided>, because <why>.
```

Rules:

- `Context and Problem Statement` + `Decision Outcome` is the complete
  minimum — two short paragraphs are a fully valid ADR. The value is
  recording *that* a decision was made and *why*.
- **One decision per ADR** — do not bundle.
- Optional MADR sections — `## Decision Drivers`, `## Considered Options`,
  `## Consequences` (positive / negative) — only when they add genuine value.
- Frontmatter semantics (industry-standard):
  - `proposed` — under discussion, not yet binding.
  - `accepted` — the current binding decision.
  - `rejected` — decided against; keep it as a negative record so the idea
    is not raised again unknowingly.
  - `deprecated` — no longer applies but not replaced by another ADR.
  - `superseded by NNNN` — fully replaced; the successor ADR **MUST**
    cross-reference back.
- An accepted ADR is immutable: only its frontmatter `status` may change.
  Any change to the decision itself **MUST** be a new superseding ADR.

## INDEX.md format (keep it current)

```md
# ADR Index

- 0001 — <title> (accepted)
- 0002 — <title> (superseded by 0007)
- 0003 — <title> (rejected)
```

## If the guard blocks your commit

The block message names the missing ADR requirement. Fix it properly: create
the ADR (or the superseding pair), stage it, re-run the commit. You **MUST
NOT** bypass the guard by relabeling the commit type (e.g. calling a feat a
chore) — that corrupts the changelog.
