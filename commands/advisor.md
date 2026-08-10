---
description: Switch advisor mode (off|lite|full)
---

Switch advisor mode to **$ARGUMENTS**. The `advisor-mode` plugin has already written the state file via `command.execute.before`; confirm to the user.

- **lite** (default): both your recommendation and `@advisor`'s are returned to the user for every blocking decision. The advisor gives opinions only — it never answers on the user's behalf.
- **full**: `@advisor` is dispatched; if the question is classified FACTUAL and confidence ≥ 8, it answers on the user's behalf (auto-execute, max 10/session); otherwise lite flow. PREFERENCE questions always return to the user.
- **off**: no `@advisor` dispatch; orchestrator decides alone.
