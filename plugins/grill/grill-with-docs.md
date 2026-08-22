# Grill-With-Docs Protocol

`/grill-with-docs <description>` — same advisor-driven grilling as `/grill-me`, but also builds the project's domain model as decisions crystallize, writing them down immediately.

## Two disciplines combined

1. **Grilling** — advisor-driven four-phase interview (state machine below).
2. **Domain modeling** — actively maintain a glossary (`CONTEXT.md`) and record architectural decisions (`docs/adr/`) as they are made, not after.

## State machine

```
              ┌─────────────────────────────────────────────────┐
              │                                                 │
              ▼                                                 │
  P1: @advisor       P2: question tool    P3: @advisor          │ loop
  Raw description     Batch all Qs        Detect contradictions  │ max 5
  passthrough         via question tool   ┌───────┴───────┐      │
  Advisor explores    Pure collection     │               │      │
  codebase itself     full mode:          CONTRADICTIONS   CLEAN  │
  and decides what    FACTUAL ≥ 8         → back to P2    → P4   │
  to ask              auto-adopt,         Ask contradiction      │
                      don't ask user       points, back to P3    │
                                          └───────────────┘      │
              │                                                 │
              └─────────────────────────────────────────────────┘

  P4: question tool (Confirm/Revise/Stop) → confirmed → final docs sweep → route via build.md → dispatch
      User revises → back to P2
      User stops → exit
```

## Phase tracking

At the start of every reply, output a one-line phase marker so the session is recoverable after compaction:

```
[grill-with-docs] Phase: P2 | Round: 1 | Questions: 5 (3 answered, 2 pending) | Docs: CONTEXT.md(2 terms), ADR(0)
```

If the conversation was compacted and you're unsure which phase you're in, look at the last `[grill-with-docs]` marker to recover state. If no marker found, restart from P1.

## Constraints

- **P1 mandatory.** Always dispatch @advisor by invoking the subagent tool — do NOT just print `@advisor` as text. Frugality rules exempt — user invoked `/grill-with-docs` explicitly.
- **P1: raw passthrough.** Main session forwards the raw description to @advisor with zero pre-processing — no codebase exploration, no domain hints, no question generation. Advisor explores the codebase itself and decides what to ask. Main session is just a dispatcher. **You MUST actually invoke the @advisor subagent tool, not output the dispatch template as plain text.**
- **P2: batch answer via `question` tool.** Use the `question` tool to present all questions to the user at once — this triggers the interactive UI (not just plain text). Put the recommended option FIRST, marked `(recommended)`. User answers all in one reply. Pure collection, no improvised follow-ups. If scope fundamentally changed, stop and suggest re-running `/grill-with-docs`.
- **P2: auto-advisor compat.** full mode: FACTUAL + confidence ≥ 8 → auto-adopt, don't ask user. lite/off: all questions reach user.
- **P3 mandatory.** Always dispatch @advisor for refinement by invoking the subagent tool. Only skip if advisor fails (→ P4 with raw Q&A, note "contradictions may be undetected").
- **P3: contradiction loop max 5.** After 5 rounds with unresolved contradictions, use `question` tool to present state to user: resolve manually / proceed anyway / stop.
- **P3: inline docs.** When a term is resolved during contradiction rounds, immediately update `CONTEXT.md`. When an architectural decision meeting all ADR criteria is made, offer to create an ADR. Do NOT batch — write as decisions crystallize.
- **P4: confirmation via `question` tool.** Use the `question` tool with `Confirm` / `Revise` / `Stop` options. Never start implementation without explicit go-ahead.
- **P4: final docs sweep.** Before dispatching, ensure all resolved terms are in `CONTEXT.md` and all qualifying decisions have ADRs. This is the last chance to catch gaps.
- **P4: routing.** Follow build.md routing rules and trigger words table — do not hardcode agent mappings here. For multi-domain tasks, present execution plan before dispatch.

## P1 dispatch template

Invoke the @advisor subagent with the following prompt (you MUST call the subagent tool, NOT print this as text):

```
@advisor
Grill this (with docs): <raw description from /grill-with-docs args>
Always consider: aesthetics, usability, edge cases, error handling — even if the user's description is simple.
Watch for domain terms and architectural decisions that should be recorded in CONTEXT.md / docs/adr/.
```

## P3 dispatch template

Invoke the @advisor subagent with the following prompt (you MUST call the subagent tool, NOT print this as text):

```
@advisor
Grilling refinement (with docs) — consolidate answers, detect contradictions, produce decision brief.
Flag terms for CONTEXT.md and decisions warranting an ADR (hard to reverse + surprising + real trade-off).

Original Q&A:
Q1: <question> → <answer or "auto-adopted: <answer> (confidence N/10)" or "skipped">
Q2: ...

Contradiction rounds (if any):
Round 1: C1: <contradiction> → user resolved: <answer>
Round 2: ...

Output format — start with ONE of these markers on the first line:
  CLEAN — no contradictions found. Then output Decision Brief (resolved decisions + auto-resolved + facts + open questions + implementation plan + domain model artifacts: terms for CONTEXT.md, decisions for ADR).
  CONTRADICTIONS — contradictions found. Then list new questions (C1, C2...) with suggested resolution. → return to P2.
```

## Domain modeling rules

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

## Anti-pattern (NEVER do this)

Never stop at printing `@advisor` or the dispatch template without actually calling the subagent tool — that stalls the protocol. You MAY show a brief dispatch summary in your reply, but the subagent tool call is mandatory.

## Stop conditions

- User says "stop" / "enough" / "we're done" → exit at any phase.
- P1 advisor fails → let user drive manually.
- User asks to skip to implementation → P4 (skip P3 only if advisor unavailable).

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
