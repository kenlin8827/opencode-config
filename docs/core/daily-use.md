# Daily Use & Modes

OpenCode Multi-Agent provides three orchestrator modes plus the near-zero-overhead `@lite` mode, and direct access to 17 specialized domain agents.

---

## Code mode (default)

`@code` is the default entry point — direct developer; writes, modifies, tests, and verifies code itself without unsolicited delegation:

```
> @code Fix off-by-one error in pagination logic
> @code Add input validation to registration form
```

You can still manually delegate auxiliary subagents (`@advisor`, `@explorer`, `@code-review`, `@vision`) when needed. If a task is cross-cutting, `@code` will recommend switching to `@build`.

---

## Build mode (orchestration)

Switch to `@build` for cross-cutting tasks — it routes work to the right specialist:

```
> Add a Spring Boot user registration endpoint with JPA and BCrypt
  → @build routes to @java-dev

> Review my recent commits with focus on security
  → @build routes to @code-review (adds @security if sensitive)

> Design the architecture for a new payment service
  → @build routes to @architect (presents multi-step plan first)
```

You don't need to specify which agent — just describe the task. For cross-cutting tasks, `@build` presents an execution plan before starting.

---

## Plan mode (read-only)

Switch to `@plan` for analysis-only tasks (no code modifications):

```
> @plan Audit the codebase for technical debt and security vulnerabilities
  → @plan dispatches @architect, @security, @code-review, @qa in parallel
  → Aggregates findings into a prioritized report
```

Switch between modes via `Tab` or `@code` / `@build` / `@plan` / `@lite`.

---

## Lite mode (near-zero overhead)

`@lite` is the lightweight mode for everyday quick tasks — lookups, chat, small edits. It is the only mode with **measured near-zero prompt overhead**: 0 L1 tokens, 0 resident skills/MCP definitions, and L0 stripped at runtime. Where a full-config agent carries **13k+ tokens of prompt overhead per step**, `@lite`'s entire system prompt measures **~2k tokens**.

```
> @lite what does this function do?
> @lite rename this variable and fix the call sites
```

Trade-off: `@lite` opts out of instruction layers, protocol injections, the skills block, and MCP code intelligence. It keeps every native tool (read/edit/bash/…) but carries no engineering discipline on top — route real engineering work to `@code` / `@build`.

---

## Calling specialists directly

You can bypass the orchestrator and call any specialist directly:

```
> @dba Optimize the indexes on the orders table
> @frontend-dev Create a reusable Button component with design tokens
> @code-review Review PR #42
```

---

## Multi-step workflow example

For complex features, `@build` creates and executes a plan:

```
## Execution Plan

1. [@architect] — Design event sourcing architecture → ADR + design doc
2. [@dba] — Design event store schema → DDL + migration scripts
3. [@java-dev] — Implement producer and consumer → code + tests
4. [@qa] — Write integration tests → test suite
5. [@security] — Security review → report
6. [@code-review] — Code review → findings
7. [@tech-writer] — Documentation → README + API docs

Proceed?
```
