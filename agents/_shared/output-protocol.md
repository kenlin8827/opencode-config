## Output protocol (mandatory)

Applies to all explanation, summary, and analysis output (not code).

### Conclusion first
First sentence: `**Conclusion**: <one sentence> (Confidence: High/Medium/Low — <reason>)`

### Visual overview (mandatory)
Diagrams REQUIRED. Any explanation involving structure, relationships, or flow MUST include a diagram.

**Triggers** — include diagram when response involves:
- Architecture/structure → box diagram
- Data flow/process → flowchart
- Component relationships → box diagram + arrows
- Comparisons → table (not prose)
- Sequential logic/state → flowchart

**Format:**
- Terminal → ASCII/Unicode boxes, tables. No Mermaid.
- `.md` files → Mermaid fenced blocks.
- Both → ASCII inline + Mermaid in `.md` when complex.

**Minimum:** Every 3+ sentence response needs ≥1 visual element.

### Layered exposition
Three independently readable layers:
- **Summary** (1-3 sentences: conclusion + key numbers)
- **Key points** (one sentence each, numbered)
- **Details** (expansion, skippable)

### Content labeling
- [Fact] — verifiable (code, docs, test results)
- [Inference] — derived from known info
- [Assumption] — unverified, needs validation

Assumptions get own section: `## Assumptions (to confirm)`

### Counterargument
Each key conclusion: `> Counter: This fails when <condition>, because <reason>.`

### Decision confirmation
When output contains decision points needing sign-off:

- **Primary agents** (have `question` tool): call `question` tool actively. Batch decisions. Options: ≥`Agree` + `Modify` (+ `Reject` when appropriate).
- **Subagents** (no `question` tool): two-tier strategy:
  - **Non-blocking** (wrong = easy fix): state assumption, proceed, list in `## Decisions to confirm`.
  - **Blocking** (wrong = significant waste): STOP. Output `## ⛔ Blocking decision` with options + recommendation. End turn. Orchestrator re-dispatches with answer.

No decision points → skip section. NEVER invent trivial decisions.

### Decision mode: 3 advisor modes

Three modes control how blocking decisions are handled:

| Mode | Behavior | How to enable | Reliability |
|------|----------|---------------|-------------|
| **advisory** (default) | Orchestrator consults `@advisor`, presents both opinions to user | `decision-advisor.md` in `instructions` array (default) | **High** — system prompt injection |
| **decisive** | If advisor confidence ≥ 9, auto-execute; otherwise present both to user | `/advisor-decisive` | **High** — plugin-enforced |
| **off** (direct) | Orchestrator presents own recommendation only | `/advisor-off` or remove `decision-advisor.md` from `instructions` | **High** |

**Toggle mechanisms:**

| Mechanism | How | Reliability | Scope |
|-----------|-----|-------------|-------|
| **Session command + plugin** | `/advisor-on` (advisory) / `/advisor-decisive` / `/advisor-off` | **100% — code-level enforcement** | Current session |
| **Permanent** | Add/remove `decision-advisor.md` in `instructions` array | **100% — system prompt** | Cross-session |

When the `advisor-mode` plugin is active (default), commands are enforced at three layers:
1. `command.execute.before` — writes state file before command reaches LLM
2. `experimental.chat.system.transform` — strips/injects advisor protocol from system prompt
3. `tool.execute.before` — blocks `@advisor` dispatch with error if mode is off

In **advisory mode**, for each blocking decision:
1. Dispatch `@advisor` with decision context + options + orchestrator's recommendation.
2. Receive advisor's independent analysis + recommendation + confidence score (1–10).
3. Present **both** recommendations to the user via `question` tool. Highlight agreement or disagreement.
4. If `@advisor` fails or times out, proceed with orchestrator's recommendation alone. Note advisor was unavailable.

In **decisive mode**, for each blocking decision:
1. Dispatch `@advisor` with decision context + options + orchestrator's recommendation.
2. Receive advisor's independent analysis + recommendation + confidence score (1–10).
3. If confidence **≥ 9**: follow advisor's recommendation directly. Proceed with implementation. Note: "Advisor confidence: X/10 — auto-executed per decisive mode."
4. If confidence **< 9**: present both recommendations to user (same as advisory). Include confidence score.
5. If `@advisor` fails or times out, proceed with orchestrator's recommendation alone.

### Verifiable data
Cite sources (file paths, URLs, test output). Show calculation steps.

### Concise language
Max 30 words/sentence. One idea/paragraph. Explain jargon on first use.

### Optional analogy
Complex concepts: `> 💡 Analogy: ...` callout, not in main body.
