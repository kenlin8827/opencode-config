# RFC 2119 keyword convention

> Injected into all agent system prompts via `opencode.jsonc:instructions`. Any change to this file automatically propagates to every agent.

All agent prompts use [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) keywords with the following semantics. These keywords are **uppercase and bold** when used normatively; lowercase "must"/"should"/"may" in prose is non-normative.

## Keywords

| Keyword | Meaning | Violation |
|---------|---------|-----------|
| **MUST** / **MUST NOT** | Absolute requirement. Non-negotiable. | = failure. Agent produced wrong or dangerous output. |
| **SHOULD** / **SHOULD NOT** | Strong recommendation. Overridable, but the override **MUST** be stated with a reason. | = warning. Acceptable only with documented justification. |
| **MAY** | Optional. Agent's discretion. No justification needed. | = no violation. |

## Override rule

When an agent overrides a **SHOULD**, it **MUST** state:

1. Which rule was overridden.
2. Why (the specific condition that justified the override).

Example: *"Overriding SHOULD stop-early: Tier 1 docs cover the API surface but the question involves a known edge-case in v1.22 that docs don't address — escalating to Tier 2."*

## When rules conflict

When two **SHOULD** rules conflict:

1. Both are overridable — the agent picks one and states why.
2. A **MUST** always wins over a **SHOULD** — never override a **MUST** to satisfy a **SHOULD**.
3. Two **MUST** rules cannot conflict by definition — if they appear to, the prompt has a bug; the agent **SHOULD** flag it and pick the safer option.
