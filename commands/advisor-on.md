---
description: "Advisory mode — consult @advisor for second opinions on blocking decisions; both opinions returned to user. Usage: /advisor-on"
agent: build
model: llm-router/default
---

Switch to **advisory mode** for this session.

> The `advisor-mode` plugin has already updated the state file to `advisory` via `command.execute.before` hook. Your job is only to confirm the change to the user.

From now on, for every **blocking decision** (as defined in output-protocol.md):

1. Dispatch `@advisor` with decision context, options, and your own recommendation.
2. Present **both** your recommendation and the advisor's to the user.
3. Highlight agreement or disagreement.
4. If `@advisor` fails, proceed with your recommendation alone — note advisor was unavailable.

### Rules

- **Only blocking decisions** — non-blocking decisions proceed as normal.
- **One advisor call per decision** — don't loop.
- **Present both opinions** — the user sees your AND the advisor's recommendation.
- **User always decides** — this is advisory mode, not decisive.

### Acknowledgment

Confirm advisory mode is now active:

> ✅ Advisor mode: **advisory**. Blocking decisions will consult @advisor, then present both opinions to you for decision.
