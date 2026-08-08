---
description: "Disable advisor mode — no @advisor consultation, orchestrator decides alone. Usage: /advisor-off"
agent: build
model: llm-router/default
---

Switch to **off mode** for this session.

> The `advisor-mode` plugin has already updated the state file to `off` via `command.execute.before` hook and will strip the advisor protocol from the system prompt on the next LLM call. Your job is only to confirm the change to the user.

From now on:

- For **blocking decisions**: present only your own recommendation + options to the user. Do NOT dispatch `@advisor`.
- For **non-blocking decisions**: unaffected (they never used advisor).
- If you attempt to dispatch `@advisor`, the plugin will block it with an error.

### Acknowledgment

Confirm advisor mode is now off:

> ✅ Advisor mode: **off**. Blocking decisions will present only the orchestrator's recommendation. Use `/advisor-on` (advisory) or `/advisor-decisive` (decisive) to re-enable.
