## Decision advisor protocol (default — advisor mode: advisory)

> **This protocol activates advisor mode by default.** It is injected via `opencode.json` `instructions` array.
> To change mode: `/advisor-off` (off), `/advisor-on` (advisory), `/advisor-decisive` (decisive).
> To disable permanently: remove this file from `instructions` in `opencode.json`.

### Modes

| Mode | Command | Behavior |
|------|---------|----------|
| **Off** | `/advisor-off` | No advisor. Orchestrator presents blocking decisions alone. |
| **Advisory** (default) | `/advisor-on` | Advisor gives opinion. Both orchestrator's and advisor's recommendations presented to user. User decides. |
| **Decisive** | `/advisor-decisive` | Advisor gives opinion + confidence score (1–10). If score ≥ 9, orchestrator follows advisor's recommendation **directly** (no human consultation). If score < 9, both opinions presented to user (same as advisory). |

### When this protocol is active (advisory or decisive)

For **blocking decisions** (as defined in output-protocol.md), the orchestrator MUST consult `@advisor` before presenting the decision to the user (advisory) or before deciding whether to auto-execute (decisive).

### Advisory flow

```
1. Orchestrator identifies a blocking decision
2. Orchestrator dispatches @advisor with:
   - Decision context (what, why it's blocking)
   - Options being considered
   - Orchestrator's own recommendation + reasoning
3. Advisor returns independent analysis + recommendation + confidence score
4. Orchestrator synthesizes both perspectives:
   - Orchestrator's recommendation
   - Advisor's recommendation (agree or disagree)
   - Key differences in reasoning
5. Present combined analysis to user via question tool
6. User decides
```

### Decisive flow

```
1. Orchestrator identifies a blocking decision
2. Orchestrator dispatches @advisor with:
   - Decision context (what, why it's blocking)
   - Options being considered
   - Orchestrator's own recommendation + reasoning
3. Advisor returns independent analysis + recommendation + confidence score (1–10)
4. Orchestrator checks advisor's confidence score:
   a. If confidence ≥ 9:
      - ⚠️ CRITICAL: You MUST auto-execute. Do NOT call the question tool.
      - Follow advisor's recommendation directly
      - Proceed with implementation immediately
      - Note in output: "Advisor confidence: X/10 — auto-executed per decisive mode"
      - Do NOT present options to the user
      - Do NOT ask the user for confirmation
      - The decision is made. Move to implementation.
   b. If confidence < 9:
      - Present both recommendations to user (same as advisory flow)
      - Include advisor's confidence score in the presentation
      - User decides
```

> **DECISIVE MODE RULE**: When advisor confidence ≥ 9, the decision is FINAL.
> The orchestrator executes it without human consultation. This is the entire point of decisive mode.
> If you find yourself wanting to ask the user when confidence ≥ 9, STOP — you are violating the decisive mode protocol.
> The plugin also injects a code-level directive into the advisor's response — look for "⚠️ [DECISIVE MODE — CODE-LEVEL DIRECTIVE]".

### Dispatch template

```
@advisor

Context: <what is the decision, why is it blocking>
Options:
  A) <option A> — <brief description>
  B) <option B> — <brief description>
  C) <option C> — <brief description>
My recommendation: <letter> — <reasoning>

Provide your independent analysis, recommendation, and confidence score (1-10).
```

### Rules

- **Only blocking decisions** — non-blocking decisions proceed as normal (state assumption, continue).
- **One advisor call per decision** — don't loop. One dispatch, one response, present to user (or auto-execute in decisive mode).
- **Present both opinions** — when returning to human, the user sees the orchestrator's AND the advisor's recommendation.
- **Highlight disagreement** — if advisor disagrees, surface it prominently. The user needs to see both sides.
- **Decisive mode threshold** — only confidence ≥ 9 triggers auto-execution. 8 or below always returns to human.
- **Timeout tolerance** — if @advisor fails or times out, proceed with the orchestrator's recommendation alone. Note that advisor was unavailable.
- **Subagent awareness** — when dispatching to subagents that may encounter blocking decisions, include in the dispatch instruction: "If you encounter a blocking decision, STOP and report it back — do NOT make the decision yourself. The orchestrator will consult @advisor."
