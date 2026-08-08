---
description: "Grill me with docs — relentless interview + domain modeling (CONTEXT.md glossary & ADRs created inline). Usage: /grill-with-docs <topic>"
agent: build
model: llm-router/default
source: https://github.com/mattpocock/skills
author: Matt Pocock
license: MIT
---

Execute a **grilling session with documentation** — same relentless one-question-at-a-time interview as `/grill-me`, but also builds the project's domain model as decisions crystallize, writing them down immediately.

$ARGUMENTS

## What is grilling with docs?

Two disciplines combined:
1. **Grilling** — relentless interview that walks the decision tree one question at a time (see below).
2. **Domain modeling** — actively maintain a glossary (`CONTEXT.md`) and record architectural decisions (`docs/adr/`) as they are made, not after.

## Part 1: Grilling rules

### One question at a time
Ask questions **one at a time**. Wait for the user's answer on each before continuing. Multiple questions at once is bewildering.

### Facts vs. decisions
- **Facts** (can be found by exploring): filesystem, codebase, tools, git, docs → look it up yourself.
- **Decisions** (require judgment): architecture, trade-offs, scope, priorities → put each to the user and wait.

### Always recommend
Every question MUST include your recommended answer with reasoning.

### Walk the decision tree
Start with the most fundamental decision. Resolve it, then move to the next. Don't skip ahead.

### Don't act (on implementation) until confirmed
Do NOT write code or implement features until shared understanding is reached. You MAY create `CONTEXT.md` and ADRs during the session — that's the whole point.

### Probe edge cases
- "What happens when X fails?"
- "Who is responsible for Y if Z occurs?"
- "Does this scale to 10× the current load?"

### Challenge vague language
- "You're saying 'account' — do you mean Customer or User?"
- "By 'fast' — latency, throughput, or time-to-first-byte?"

### Cross-reference with code
Check whether the code agrees with stated behavior. Surface contradictions immediately.

## Part 2: Domain modeling rules

### File structure

**Single context (most repos):**
```
/
├── CONTEXT.md          ← glossary (terms + definitions)
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

**Multiple contexts** (if `CONTEXT-MAP.md` exists at root):
```
/
├── CONTEXT-MAP.md
├── docs/adr/                        ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files **lazily** — only when there's something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

### CONTEXT.md — glossary format

```md
# {Context Name}

{One or two sentence description.}

## Language

**Order**:
{One or two sentence description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request
```

Glossary rules:
- **Be opinionated.** Pick the best word, list alternatives under `_Avoid_`.
- **Keep definitions tight.** One or two sentences. Define what it IS, not what it does.
- **Only project-specific terms.** General programming concepts (timeouts, error types) do NOT belong.
- **Update inline.** When a term is resolved, write it to `CONTEXT.md` right then. Do NOT batch.
- **No implementation details.** `CONTEXT.md` is a glossary and nothing else.

### ADR format

ADRs live in `docs/adr/` with sequential numbering: `0001-slug.md`, `0002-slug.md`, etc.

```md
# {Short title of the decision}

{1-3 sentences: context, what we decided, and why.}
```

An ADR can be a single paragraph. The value is recording *that* a decision was made and *why*.

**Optional sections** (only when they add genuine value):
- **Status** frontmatter: `proposed | accepted | deprecated | superseded by ADR-NNNN`
- **Considered Options**: only when rejected alternatives are worth remembering
- **Consequences**: only when non-obvious downstream effects need calling out

**Numbering:** Scan `docs/adr/` for the highest existing number and increment by one.

### When to offer an ADR

All three MUST be true:
1. **Hard to reverse** — cost of changing your mind later is meaningful.
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **Real trade-off** — there were genuine alternatives and you picked one for specific reasons.

If any is missing, skip the ADR.

What qualifies:
- **Architectural shape.** Monorepo, event-sourcing, CQRS.
- **Integration patterns.** "Ordering and Billing communicate via domain events, not HTTP."
- **Technology choices with lock-in.** Database, message bus, auth provider. Not every library.
- **Boundary decisions.** "Customer data owned by Customer context; others reference by ID only."
- **Deliberate deviations.** "Manual SQL instead of ORM because X."
- **Constraints not visible in code.** "No AWS due to compliance. Response < 200ms due to partner API."
- **Non-obvious rejections.** "Picked REST over GraphQL for subtle reasons."

## Workflow during the session

For each decision point:

1. **Ask** the question (with your recommendation).
2. **Wait** for the user's answer.
3. **If a term was resolved** → immediately update `CONTEXT.md`.
4. **If an architectural decision was made that meets all three ADR criteria** → offer to create an ADR. If the user agrees, create it immediately.
5. **Move** to the next question.

## Session output

When the session ends:

```
## Grilling Summary (with docs)

### Decisions made
1. <decision> — <answer + brief reasoning>
2. <decision> — <answer + brief reasoning>

### Domain model artifacts created
- `CONTEXT.md` — <N> terms defined
  - **<term>**: <one-line definition>
  - ...
- `docs/adr/0001-<slug>.md` — <title>
- `docs/adr/0002-<slug>.md` — <title>

### Facts discovered
- <fact> — <source>

### Open questions
- <unresolved items, if any>

### Recommended next steps
- <what to do with this sharpened understanding + documented domain model>
```
