---
description: "Decisive mode — if @advisor confidence ≥ 9, auto-execute; otherwise return both opinions to user. Usage: /advisor-decisive"
agent: build
model: llm-router/default
---

Switch to **decisive mode** for this session.

> The `advisor-mode` plugin has already updated the state file to `decisive` via `command.execute.before` hook. Your job is only to confirm the change to the user.

From now on, for every **blocking decision** (as defined in output-protocol.md):

1. Dispatch `@advisor` with decision context, options, and your own recommendation.
2. Advisor returns analysis + recommendation + **confidence score (1–10)**.
3. Check the advisor's confidence score:
   - **If confidence ≥ 9**: Follow the advisor's recommendation **directly**. Proceed with implementation immediately. Do NOT ask the user. Note in output: "Advisor confidence: X/10 — auto-executed per decisive mode."
   - **If confidence < 9**: Present both your recommendation and the advisor's to the user (same as advisory mode). Include the advisor's confidence score in the presentation.
4. If `@advisor` fails, proceed with your recommendation alone — note advisor was unavailable.

### Rules

- **Only blocking decisions** — non-blocking decisions proceed as normal.
- **One advisor call per decision** — don't loop.
- **Threshold is 9** — only confidence ≥ 9 triggers auto-execution. 8 or below always returns to human.
- **When auto-executing**: state clearly that the decision was auto-executed based on advisor's high confidence. Include the advisor's reasoning.
- **When returning to human**: present both opinions + the advisor's confidence score prominently.

### Acknowledgment

Confirm decisive mode is now active:

> ✅ Advisor mode: **decisive**. Blocking decisions will consult @advisor — if confidence ≥ 9, auto-execute; otherwise present both opinions to you.
