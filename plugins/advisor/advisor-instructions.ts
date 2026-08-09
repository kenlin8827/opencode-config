/**
 * Shared advisor instructions — mode-specific prompt strings.
 *
 * No markdown file is loaded. The full advisor protocol is embedded here so
 * the plugin is self-contained: if the OpenCode `instructions` array ever
 * stops loading any shared file, advisor mode still works.
 *
 * Three shapes:
 *   getAdvisorPrompt("off")   — short OFF marker, no protocol.
 *   getAdvisorPrompt("lite")  — full protocol + lite marker (default).
 *   getAdvisorPrompt("full")  — full protocol + full marker (auto-execute).
 */

import type { AdvisorMode } from "./advisor-config"

const PROTOCOL = `## Advisor protocol

Consult \`@advisor\` for an independent second opinion on **blocking** decisions before presenting them to the user.

### Modes

| Mode | Behavior |
|------|----------|
| **lite** (default) | Dispatch \`@advisor\`, then present BOTH your and the advisor's recommendation. User decides. |
| **full** | Dispatch \`@advisor\`. Confidence ≥ 9 → auto-execute. Confidence < 9 → lite flow. |
| **off** | No \`@advisor\`. Orchestrator decides alone. |

### Flow

\`\`\`
blocking decision
  └─ advisor mode != off
       ├─ dispatch @advisor (context, options, your recommendation)
       ├─ mode = full && confidence ≥ 9 → auto-execute advisor's recommendation
       └─ otherwise → present BOTH opinions to user via question tool
\`\`\`

### Dispatch template

\`\`\`
@advisor

Context: <what is the decision, why it's blocking>
Options:
  A) <option A> — <brief>
  B) <option B> — <brief>
My recommendation: <letter> — <reasoning>

Provide your independent analysis, recommendation, and confidence score (1-10).
\`\`\`

### Red-team stance (optional)

A dispatch variant where \`@advisor\` argues AGAINST a design instead of balancing options. Same agent, same mode gating — only the stance changes.

**When to use it:**
- The user explicitly asks to stress-test / red-team / devil's-advocate a proposal.
- Before committing to an irreversible design decision: schema migration, public API contract, auth/permission redesign, destructive data operations.
- NOT for routine single-domain tasks, bug fixes, or documentation.

**Dispatch template:**

\`\`\`
@advisor

Stance: red-team — argue against this proposal.
Proposal: <the design/plan, with its key decisions>
Context: <goals, constraints>
Attack its weak points, failure modes, hidden assumptions, and risks.
Output your verdict (HOLDS / HOLDS WITH CAVEATS / FAILS). No confidence score.
\`\`\`

**Rules:**
- Red-team output carries a verdict, never a confidence score — it can NEVER trigger full-mode auto-execute.
- Present the verdict prominently. FAILS → re-dispatch the design owner (\`@architect\`, or whoever produced the proposal) with the attacks attached for rebuttal or revision, then present attacks + rebuttal to the user; do not continue silently. If still torn, consult \`@advisor\` (neutral stance) as tie-breaker.
- One red-team call per proposal — don't loop attacks. No blue team: the design owner defends; never dispatch a separate defender.
- Subagents never dispatch red-team themselves; they escalate to the orchestrator.

### Rules

- Only blocking decisions. Non-blocking decisions proceed as normal.
- One advisor call per decision — don't loop.
- Present both opinions. Highlight disagreement.
- Question tool: put the recommended option FIRST in the option list, marked \`(recommended)\`. On disagreement, mark the advisor-backed option and state the disagreement in the question header, not via option order.
- Full mode ≥ 9 is final: do NOT call question, do NOT present options.
- If \`@advisor\` fails, proceed with your recommendation alone; note advisor was unavailable.
- Subagents: tell them to STOP on blocking decisions, not decide.`

const MODE_MARKER: Record<AdvisorMode, string> = {
  off: `[ADVISOR MODE: OFF]\nAdvisor consultation is disabled. Do NOT dispatch @advisor.`,
  lite: `[ADVISOR MODE: LITE]\nDispatch @advisor for each blocking decision; present BOTH opinions to the user.`,
  full: `[ADVISOR MODE: FULL — ACTIVE NOW]\n` +
    `Dispatch @advisor. Confidence ≥ 9 → auto-execute NOW, no question tool. ` +
    `Confidence < 9 → present BOTH opinions (lite flow). This is full, not lite, not off.`,
}

/**
 * Build the prompt fragment for the active mode. The plugin appends this to
 * the system prompt via the experimental.chat.system.transform hook.
 *
 * For "off", no protocol is needed — only the OFF marker, so the LLM knows
 * advisor exists but is disabled. Saves tokens.
 */
export function getAdvisorPrompt(mode: AdvisorMode): string {
  return mode === "off"
    ? `\n\n---\n${MODE_MARKER.off}\n`
    : `\n\n---\n${MODE_MARKER[mode]}\n\n${PROTOCOL}\n`
}

/**
 * Directive appended to advisor's tool output in full mode when confidence
 * ≥ 9. A code-level nudge for the orchestrator.
 */
export function fullDirective(confidence: number): string {
  return (
    `\n\n---\n[FULL MODE — CODE-LEVEL DIRECTIVE]\n` +
    `Advisor confidence: ${confidence}/10 (≥ 9 threshold met).\n` +
    `Auto-execute the advisor's recommendation NOW. ` +
    `Do NOT call question. Note: "Advisor confidence: ${confidence}/10 — auto-executed per full mode."`
  )
}

/**
 * Warning appended when the advisor model wasn't available and OpenCode
 * silently fell back to the default model. In that case the confidence score
 * is untrustworthy — never auto-execute off it.
 */
export function fallbackWarning(): string {
  return (
    `\n\n---\n[ADVISOR MODEL FALLBACK]\n` +
    `The advisor model was unavailable; default model was used.\n` +
    `Do NOT auto-execute in full mode. Return both opinions to the user.`
  )
}