# SQL migrations — append-only baseline

> Injected into all agent system prompts via `opencode.jsonc:instructions`. Migration files are **immutable history** — they record how every environment reached its current schema. `@dba` extends these with engine-specific patterns; when a per-agent rule conflicts, the more specific rule wins.

## Baseline rules

| # | Rule | Requirement |
|---|---|---|
| 1 | Append-only | **MUST NOT** edit, rewrite, or delete any existing migration file. Every schema change goes into a **new** migration file. |
| 2 | Field changes are new migrations | Add / modify / drop a column, index, or constraint → **MUST** be a new `ALTER TABLE` migration. Never patch an old file to match the new schema. |
| 3 | Fix forward | Wrong or incomplete migration that is applied **or committed** → fix it with a new migration. Editing history desyncs every environment that already ran it. |
| 4 | Only editable case | A migration may be edited **only** if it was never committed AND never applied to any shared environment. When unsure, ask the user — default to fix-forward. |
| 5 | Naming & ordering | Follow the project's existing convention (`V<N>__desc.sql`, timestamped, etc.); sequence numbers strictly monotonic, no gaps reuse. |
| 6 | Rollback path | Every migration **MUST** carry a documented down/rollback path (see `agents/dba.md` hard rules). |

## Why

Migration files are executed once per environment and tracked by version. Editing an applied file changes nothing where it already ran — but breaks checksum-based runners (Flyway, Prisma, Alembic) and silently desyncs every other environment. The only safe correction is a new migration.

## What this is NOT

- **Not a schema-design guide.** → `@dba` hard rules.
- **Not a migration-tool tutorial.** Follow each project's runner config.
