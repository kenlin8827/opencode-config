---
description: "Grill me — relentless one-question-at-a-time interview to sharpen a plan or design. Usage: /grill-me <topic>"
agent: build
model: llm-router/default
source: https://github.com/mattpocock/skills
author: Matt Pocock
license: MIT
---

Execute a **grilling session** — a relentless, one-question-at-a-time interview that stress-tests a plan, design, or decision until we reach shared understanding.

$ARGUMENTS

## What is grilling?

Grilling is NOT brainstorming. It is NOT a code review. It is a structured, relentless interview that walks down each branch of the decision tree, resolving dependencies between decisions one-by-one.

## Core behavior

### One question at a time
Ask questions **one at a time**. Wait for the user's answer on each before continuing. Multiple questions at once is bewildering.

### Facts vs. decisions
- **Facts** (can be found by exploring): filesystem, codebase, tools, git, docs → look it up yourself. Do NOT ask the user.
- **Decisions** (require judgment): architecture, trade-offs, scope, priorities → put each to the user and wait.

### Always recommend
Every question MUST include your recommended answer with reasoning. Don't just ask — advise.

### Walk the decision tree
Start with the most fundamental decision (the one everything else depends on). Resolve it, then move to the next. Don't skip ahead — later decisions depend on earlier ones.

### Don't act until confirmed
Do NOT write code, create files, or take action until the user confirms shared understanding is reached. The output of a grilling session is **alignment**, not implementation.

## Question structure

Each question should follow this format:

```
### Q<N>: <question>

**My recommendation**: <your recommended answer>

**Reasoning**: <why you recommend this>

**Why it matters**: <what downstream decisions depend on this>

Your answer?
```

## Grilling strategy

### Explore before asking
Before asking about the codebase, architecture, or existing patterns — explore it yourself:
1. Use file search and code reading to understand the current state.
2. Check existing docs, READMEs, and configuration.
3. Look for prior decisions in `docs/adr/` or `CONTEXT.md` if they exist.

Only after you've gathered all available facts should you start asking decision questions.

### Probe edge cases
When the user states a design, stress-test it:
- "What happens when X fails?"
- "Who is responsible for Y if Z occurs?"
- "Does this scale to 10× the current load?"

### Challenge vague language
When the user uses fuzzy or overloaded terms:
- "You're saying 'account' — do you mean Customer or User? Those are different things."
- "By 'fast' — are we talking latency, throughput, or time-to-first-byte?"

### Cross-reference with code
When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

## Stop conditions

- **Stop** when the user says "stop", "enough", "we're done", or similar.
- **Stop** when the decision tree is fully resolved — all branches explored.
- **Stop** if the user asks to switch to implementation → suggest Build mode.

## Session output

When the session ends, produce this summary:

```
## Grilling Summary

### Decisions made
1. <decision> — <answer + brief reasoning>
2. <decision> — <answer + brief reasoning>
...

### Facts discovered
- <fact> — <source: file:line, doc, etc.>

### Open questions
- <unresolved items, if any>

### Recommended next steps
- <what to do with this sharpened understanding>
```

Do NOT start implementing unless the user explicitly asks.
