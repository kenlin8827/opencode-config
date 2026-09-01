---
name: grill-me
description: Grill me - advisor-driven grilling where @advisor organizes questions, the user answers in batch, the advisor refines via a contradiction loop, then development is dispatched. Load ONLY when the user invokes /grill-me.
---

# Grill-Me Protocol

`/grill-me <description>` — advisor-driven grilling before development.

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

  P4: question tool (Confirm/Revise/Stop) → confirmed → route via build.md → dispatch specialist agent
      User revises → back to P2
      User stops → exit
```

## Phase tracking

At the start of every reply, output a one-line phase marker so the session is recoverable after compaction:

```
[grill-me] Phase: P2 | Round: 1 | Questions: 5 (3 answered, 2 pending)
```

If the conversation was compacted and you're unsure which phase you're in, look at the last `[grill-me]` marker to recover state. If no marker found, restart from P1.

## Constraints

- **P1 mandatory.** Always dispatch @advisor by invoking the subagent tool — do NOT just print `@advisor` as text. Frugality rules exempt — user invoked `/grill-me` explicitly.
- **P1: raw passthrough.** Main session forwards the raw description to @advisor with zero pre-processing — no codebase exploration, no domain hints, no question generation. Advisor explores the codebase itself and decides what to ask. Main session is just a dispatcher. **You MUST actually invoke the @advisor subagent tool, not output the dispatch template as plain text.**
- **P2: batch answer via `question` tool.** Use the `question` tool to present all questions to the user at once — this triggers the interactive UI (not just plain text). Put the recommended option FIRST, marked `(recommended)`. User answers all in one reply. Pure collection, no improvised follow-ups. If scope fundamentally changed, stop and suggest re-running `/grill-me`.
- **P2: auto-advisor compat.** full mode: FACTUAL + confidence ≥ 8 → auto-adopt, don't ask user. lite/off: all questions reach user.
- **P3 mandatory.** Always dispatch @advisor for refinement by invoking the subagent tool. Only skip if advisor fails (→ P4 with raw Q&A, note "contradictions may be undetected").
- **P3: contradiction loop max 5.** After 5 rounds with unresolved contradictions, use `question` tool to present state to user: resolve manually / proceed anyway / stop.
- **P4: confirmation via `question` tool.** Use the `question` tool with `Confirm` / `Revise` / `Stop` options. Never start implementation without explicit go-ahead.
- **P4: routing.** Follow build.md routing rules and trigger words table — do not hardcode agent mappings here. For multi-domain tasks, present execution plan before dispatch.

## P1 dispatch template

Invoke the @advisor subagent with the following prompt (you MUST call the subagent tool, NOT print this as text):

```
@advisor
Grill this: <raw description from /grill-me args>
Always consider: aesthetics, usability, edge cases, error handling — even if the user's description is simple.
```

## P3 dispatch template

Invoke the @advisor subagent with the following prompt (you MUST call the subagent tool, NOT print this as text):

```
@advisor
Grilling refinement — consolidate answers, detect contradictions, produce decision brief.

Original Q&A:
Q1: <question> → <answer or "auto-adopted: <answer> (confidence N/10)" or "skipped">
Q2: ...

Contradiction rounds (if any):
Round 1: C1: <contradiction> → user resolved: <answer>
Round 2: ...

Output format — start with ONE of these markers on the first line:
  CLEAN — no contradictions found. Then output Decision Brief (resolved decisions + auto-resolved + facts + open questions + implementation plan).
  CONTRADICTIONS — contradictions found. Then list new questions (C1, C2...) with suggested resolution. → return to P2.
```

## Anti-pattern (NEVER do this)

Never stop at printing `@advisor` or the dispatch template without actually calling the subagent tool — that stalls the protocol. You MAY show a brief dispatch summary in your reply, but the subagent tool call is mandatory.

## Stop conditions

- User says "stop" / "enough" / "we're done" → exit at any phase.
- P1 advisor fails → let user drive manually.
- User asks to skip to implementation → P4 (skip P3 only if advisor unavailable).
