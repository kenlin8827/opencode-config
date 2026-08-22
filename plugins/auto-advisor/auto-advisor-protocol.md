## Auto-advisor protocol

Consult `@advisor` for an independent second opinion on **blocking** decisions before presenting them to the user. Before asking the user any blocking question, let the advisor try to answer on the user's behalf — but only when the question is factual (see below).

### Frugality — do NOT abuse @advisor

`@advisor` calls are **expensive** (a full LLM round-trip). Dispatch it only when the decision genuinely warrants a second opinion. Before dispatching, ask yourself: **"Can I make this call confidently from the project context alone?"** — if yes, just decide.

**Dispatch @advisor ONLY when at least one is true:**
- The decision is **irreversible or high-stakes**: schema migration, public API contract, auth/permission change, destructive data operation, deployment to production.
- The options have **materially different trade-offs** and you are genuinely torn — not just "two ways to write the same loop".
- The user **explicitly asked** for a second opinion or red-team (`@advisor` in their message).
- You are about to ask the user a **blocking question** and the answer might be derivable from project context (code, docs, conventions) — advisor may resolve it without bothering the user.

**Do NOT dispatch @advisor when:**
- The decision is routine / low-stakes: naming a local variable, choosing between equivalent syntax forms, picking a utility function, formatting style.
- You already have **high confidence** from the project's existing code, conventions, or dependencies — just decide and proceed.
- The question is a **pure preference** (UI color, button label wording, personal taste) — skip advisor, go straight to the user.
- It's a non-blocking decision — proceed as normal, no advisor needed.
- You've already dispatched advisor for **this same decision** — one call per decision, no loops.

**Rule of thumb:** if the cost of being wrong is low and easily reversible, don't call advisor. If you'd be comfortable making the call yourself and explaining it later, don't call advisor. Reserve it for decisions where a second perspective genuinely reduces risk.

**Safety net — never suppress a genuine need:** Frugality means "don't waste calls on trivial stuff", NOT "avoid advisor at all costs". If you are genuinely unsure, torn, or the decision has real downside risk — **dispatch advisor, no hesitation**. The cost of one extra advisor call is far less than the cost of a wrong irreversible decision. When in doubt between "I think I can decide" and "I'm not fully sure" — lean toward dispatching. Over-caution defeats the purpose of having an advisor.

### Question class (classified by the advisor, not by you)

Every blocking question falls into one of two classes — `@advisor` classifies it in its reply:

| Class | Meaning | Full-mode eligibility |
|-------|---------|----------------------|
| **FACTUAL** | Answer derivable from code, docs, or given context — no unstated user preference involved | May auto-answer |
| **PREFERENCE** | Depends on user taste, goals, priorities, or irreversible trade-offs | NEVER auto-answer — back to the user |

The advisor may answer on the user's behalf when its answer is well-supported by the project context. Classify as FACTUAL when the answer is clear from existing code, conventions, dependencies, or tooling — even if a different project might choose differently. Classify as PREFERENCE only when the answer genuinely depends on unstated user taste, goals, or involves an irreversible trade-off with no clear default. When in genuine doubt → PREFERENCE, but don't default to PREFERENCE just because multiple options exist — if one option is clearly better given the project's existing context, it's FACTUAL.

### Modes

| Mode | Behavior |
|------|----------|
| **lite** (default) | Dispatch `@advisor`, then present BOTH your and the advisor's recommendation. User decides. Advisor gives opinions ONLY — it NEVER answers on the user's behalf. |
| **full** | Dispatch `@advisor`. Question class FACTUAL + confidence ≥ 8 → auto-execute the answer on the user's behalf. Otherwise (PREFERENCE or < 8) → lite flow. Max 10 auto-executes per session, then falls back to lite. |
| **off** | No **auto-dispatch** of `@advisor` — orchestrator decides alone. Manual `@advisor` from the user is still allowed; the advisor's opinion is advisory only, never auto-executed. |

### Flow

```
blocking decision / question to user
  └─ frugality check: can I decide confidently from project context alone?
       ├─ YES → just decide, no advisor call
       └─ NO → advisor mode != off  (auto-dispatch)
            ├─ dispatch @advisor (context, options, your recommendation)
            ├─ mode = full && Question class = FACTUAL && confidence ≥ 8
            │    && within session limit (10)
            │    → auto-execute the advisor's answer, on the user's behalf
            └─ otherwise → present BOTH opinions to user via question tool

User-explicit @advisor (any mode, including off):
  └─ dispatch @advisor → return opinion as advisory text → no auto-execute
```

### Dispatch template

Invoke the @advisor subagent with the following prompt (you MUST call the subagent tool, NOT print this as text):

```
@advisor

Context: <what is the decision, why it's blocking>
Options:
  A) <option A> — <brief>
  B) <option B> — <brief>
My recommendation: <letter> — <reasoning>

Provide your independent analysis, recommendation, question class (FACTUAL / PREFERENCE), and confidence score (1-10).
```

### Red-team stance (optional)

A dispatch variant where `@advisor` argues AGAINST a design instead of balancing options. Same agent, same mode gating — only the stance changes.

**When to use it:**
- The user explicitly asks to stress-test / red-team / devil's-advocate a proposal.
- Before committing to an irreversible design decision: schema migration, public API contract, auth/permission redesign, destructive data operations.
- NOT for routine single-domain tasks, bug fixes, or documentation.

**Dispatch template:**

Invoke the @advisor subagent with the following prompt (you MUST call the subagent tool, NOT print this as text):

```
@advisor

Stance: red-team — argue against this proposal.
Proposal: <the design/plan, with its key decisions>
Context: <goals, constraints>
Attack its weak points, failure modes, hidden assumptions, and risks.
Output your verdict (HOLDS / HOLDS WITH CAVEATS / FAILS). No confidence score.
```

**Rules:**
- Red-team output carries a verdict, never a confidence score — it can NEVER trigger full-mode auto-execute.
- Present the verdict prominently. FAILS → re-dispatch the design owner (`@architect`, or whoever produced the proposal) with the attacks attached for rebuttal or revision, then present attacks + rebuttal to the user; do not continue silently. If still torn, consult `@advisor` (neutral stance) as tie-breaker.
- One red-team call per proposal — don't loop attacks. No blue team: the design owner defends; never dispatch a separate defender.
- Subagents never dispatch red-team themselves; they escalate to the orchestrator.

### Rules

- **Dispatch means tool call.** When this protocol says "dispatch @advisor", you MUST invoke the @advisor subagent tool — NOT output `@advisor` as plain text in your reply. Printing the template text is a critical error: the advisor is never called and the protocol stalls.
- **Frugality first.** Before dispatching @advisor, ask: "Can I make this call confidently from project context alone?" If yes — just decide. Advisor is for genuinely risky or torn decisions, not routine ones.
- Only blocking decisions. Non-blocking decisions proceed as normal.
- One advisor call per decision — don't loop.
- Present both opinions. Highlight disagreement.
- Question tool: put the recommended option FIRST in the option list, marked `(recommended)`. On disagreement, mark the advisor-backed option and state the disagreement in the question header, not via option order.
- Full mode auto-execute fires when advisor classified the question FACTUAL AND confidence ≥ 8: do NOT call question, do NOT present options. Note in your reply that the advisor answered on the user's behalf.
- After 10 auto-executes in a session, subsequent decisions fall back to lite flow.
- PREFERENCE questions ALWAYS go back to the user — no confidence score unlocks them, in any mode.
- If `@advisor` fails, proceed with your recommendation alone; note advisor was unavailable.
- Subagents: tell them to STOP on blocking decisions, not decide.
