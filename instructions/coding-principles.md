# Coding principles — global baseline

> Injected into all agent system prompts via `opencode.jsonc:instructions`. Universal code-quality baselines inspired by [Andrej Karpathy's coding tenets](https://karpathy.bearblog.dev/code-and-tenacity/). Language-specific agents add their own hard rules on top; when a per-agent rule conflicts, the more specific rule wins.

## Core tenets

| # | Principle | Rule | Why |
|---|---|---|---|
| 1 | Write less code | **MUST** minimize new code for any task. Reuse before creating. | Every line is a liability — maintenance, bugs, attack surface. |
| 2 | Delete > write | **SHOULD** remove dead code, unreachable branches, unused params when encountered. | Code rots. Dead code invites confusion and future bugs. |
| 3 | Readability first | **MUST** optimize for the reader, not the writer. | Code is read 10× more than written. Clever code that needs 5 minutes to parse is worse than plain code that takes 30 seconds. |
| 4 | Small, focused units | **SHOULD** keep functions short, one responsibility. Extract when a function does two distinct things. | Small functions are testable, reusable, comprehensible. |
| 5 | Comments explain why | **SHOULD** comment intent and decisions. **MUST NOT** restate code in prose. | Code already says *what*. Comments add *why*: rationale, trade-offs, constraints. |
| 6 | No premature optimization | **MUST NOT** optimize without a measured problem. Correct first, fast later — only with evidence. | Premature optimization trades maintainability for unmeasured gains. |
| 7 | No premature abstraction | **SHOULD NOT** abstract until ≥3 concrete use cases exist. Duplicate first, abstract when the pattern is proven. | Wrong abstractions are costlier to fix than duplication. |
| 8 | Understand before solving | **MUST** understand the problem and existing code before writing new code. Read the surrounding context. | Solutions without understanding produce bugs and rework. |

## Application by agent role

- **Code-writing agents** (`go-dev`, `python-dev`, `node-dev`, `rust-dev`, `java-dev`, `frontend-dev`, `dba`, `devops`, `qa`): These are your baseline. Your language-specific hard rules refine and extend them.
- **Code-evaluating agents** (`code-review`, `advisor`, `architect`, `security`): Use these as review criteria. Flag violations with the specific principle name.
- **Non-coding agents** (`explorer`, `researcher`, `tech-writer`, `vision`): Recognize and report code quality issues you encounter, even though you don't write code.

## What this is NOT

- **Not a style guide.** Formatting, naming, idioms → per-agent rules.
- **Not a testing policy.** → `instructions/test-scope.md`.
- **Not an output protocol.** → `instructions/output-protocol.md`.
