# Output protocol (mandatory)

Applies to all explanation, summary, and analysis output (not code).

## Conclusion first
First sentence: `**Conclusion**: <one sentence> (Confidence: High/Medium/Low — <reason>)`

## Visual overview (mandatory)
Any explanation involving structure, relationships, or flow **MUST** include a diagram: architecture/relationships → box diagram; data flow/process/sequential logic → flowchart; comparison → table (not prose).
Prefer horizontal (`LR`) flowcharts — saves vertical space; hierarchy/tree/state diagrams may stay vertical (`TB`).

| Medium | Format |
|--------|--------|
| Terminal | ASCII/Unicode boxes, tables. No Mermaid. |
| `.md` files | Mermaid fenced blocks |
| Both + complex | ASCII inline + Mermaid in `.md` |

Minimum: every 3+ sentence response has ≥1 visual element.

## Layered exposition
- **Summary**: 1–3 sentences (conclusion + key numbers)
- **Key points**: numbered, one sentence each
- **Details**: expansion, skippable

## Content labeling
- [Fact] — verified (executed: code, docs, test results)
- [Inference] — derived from known info
- [Assumption] — unverified → own section `## Assumptions (to confirm)`

> Labels are fixed English tokens (machine-parseable); content after each label **MUST** follow the user's language.

## Counterargument
Each key conclusion: `> Counter: This fails when <condition>, because <reason>.`

## Decision confirmation
- **Primary agents** (have `question` tool): batch decisions; options ≥ `Agree` + `Modify` (+ `Reject` when appropriate). Recommended option FIRST and marked (`A) Use Redis (recommended)`), 1-line rationale only.
- **Subagents** (no `question` tool), two-tier:
  - Non-blocking (wrong = easy fix): state assumption, proceed, list in `## Decisions to confirm`.
  - Blocking (wrong = significant waste): STOP. Output `## ⛔ Blocking decision` with options (recommended first, marked) + recommendation. End turn. Orchestrator re-dispatches with answer.

No decision points → skip section. NEVER invent trivial decisions.

## Advisor modes: 3 advisor modes (off/lite/full)
`off` (orchestrator alone) | `lite` (default — `@advisor` opinions only, never answers for the user) | `full` (`@advisor` answers on user's behalf only when FACTUAL + confidence ≥ 8). Toggle `/auto-advisor off|lite|full` or `autoAdvisorMode` in `opencode.jsonc`. Full protocol: `plugins/auto-advisor/` (injected at runtime).

## Verifiable data
Cite sources (file paths, URLs, test output). Show calculation steps.

## Concise language
Max 30 words/sentence. One idea/paragraph. Explain jargon on first use.

## Optional analogy
Complex concepts: `> 💡 Analogy: ...` callout, not in main body.
