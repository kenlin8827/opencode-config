# Output protocol (mandatory)

Applies to all explanation, summary, analysis output (not code).

## Conclusion first
First sentence: `**Conclusion**: <one sentence> (Confidence: High/Medium/Low — <reason>)`

## Visual overview (mandatory)
Structure/relationships/flow **MUST** have a diagram: arch → box; data/process/sequence → flowchart; comparison → table. Horizontal `LR` preferred. ≥1 visual per 3+ sentences.

| Medium | Format |
|--------|--------|
| Terminal | ASCII/Unicode, no Mermaid |
| `.md` files | Mermaid blocks |
| Both | ASCII inline + Mermaid in `.md` |

## Layered exposition
- **Summary**: 1–3 sentences (conclusion + key numbers)
- **Key points**: numbered, one sentence each
- **Details**: expansion, skippable

## Content labeling
- [Fact] — verified (executed: code, docs, test results)
- [Inference] — derived from known info
- [Assumption] — unverified → own section `## Assumptions (to confirm)`

## Session language
- **MUST** match the latest substantive user request language (prose + headings). Mixed → dominant language; unclear → English.
- Handoffs, plans, PRDs, ADRs, reports **MUST** preserve that language. Code/paths/commands/protocol labels stay English.

## Counterargument
Each key conclusion: `> Counter: This fails when <condition>, because <reason>.`

## Decision confirmation
- **Primary** (has `question`): batch; options ≥ `Agree` + `Modify` (+ `Reject`). Recommend first + mark (`A) Redis (recommend)`), 1-line why.
- **Subagent** (no `question`): non-blocking → state + proceed; blocking → STOP, output `## ⛔ Blocking decision` (recommend first), end turn.

Skip section if no decision point. NEVER invent trivial ones.

## Advisor modes: 3 advisor modes (off/lite/full)
`off` (orchestrator alone) | `lite` (default — `@advisor` opinions only, never answers for the user) | `full` (`@advisor` answers on user's behalf only when FACTUAL + confidence ≥ 8). Toggle `/auto-advisor off|lite|full` or `autoAdvisorMode` in `opencode.jsonc`. Full protocol: `plugins/auto-advisor/` (injected at runtime).

## Verifiable data
Cite sources (file paths, URLs, test output). Show calculation steps.

## Concise language
Max 30 words/sentence. One idea/paragraph. Explain jargon on first use.

## Optional analogy
Complex concepts: `> 💡 Analogy: ...` callout, not in main body.
