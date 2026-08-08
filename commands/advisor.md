---
description: Switch advisor mode (off|lite|full)
---

Switch advisor mode to **$ARGUMENTS**. The `advisor-mode` plugin has already written the state file via `command.execute.before`; confirm to the user.

- **lite** (default): both your recommendation and `@advisor`'s are returned to the user for every blocking decision.
- **full**: `@advisor` is dispatched; if confidence ≥ 9, auto-execute; otherwise lite flow.
- **off**: no `@advisor` dispatch; orchestrator decides alone.
