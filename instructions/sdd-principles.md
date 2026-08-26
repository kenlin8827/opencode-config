# SDD Principles — Specification-Driven Development

> Injected into agent system prompts via `opencode.jsonc:instructions`. Governs the specification lifecycle (`/prd` → `/adr` → `/plan` → `/impl`) across all development tasks.

## Core Tenets

| # | Tenet | Rule | Why |
|---|---|---|---|
| 1 | On-Demand Trigger | **MUST NOT** force SDD on ordinary chats. SDD is active **ONLY** when the user invokes `/prd`, `/adr`, `/plan`, `/impl`, `/sdd`, or explicitly requests SDD. | Preserves zero-friction speed for everyday tasks and simple fixes. |
| 2 | Any Entry Point | **MUST** support starting from any phase (`/prd`, `/adr`, `/plan`, `/impl`) based on user intent. | Gives developers flexibility without sacrificing structure. |
| 3 | Interactive Transitions | **MUST** prompt user for next stage selection only upon completing a triggered phase. | Keeps developer in full control of the workflow progression. |
| 4 | Artifact Traceability | **SHOULD** reference upstream artifacts (`docs/prd/`, `docs/adr/`, `docs/plan/`) in downstream phases when present. | Maintains clear audit trail from business problem to code commit. |
| 5 | Test-Driven Verification | **MUST** verify code against acceptance criteria when executing `/impl`. | Guarantees delivery matches specification. |

## Lifecycle Workflow

```
[/prd: Requirements] ──▶ [/adr: Architecture] ──▶ [/plan: Task Breakdown] ──▶ [/impl: Code & Verify]
         │                       │                         │                           │
         └───────────────────────┴─────────────────────────┴───────────────────────────┘
                       (Can jump directly to any stage or finish)
```

## Phase Deliverables

- **`/prd`**: `docs/prd/<topic>.md` — Problem statement, user stories, acceptance criteria, boundaries.
- **`/adr`**: `docs/adr/<NNNN>-<title>.md` — Context, decision drivers, considered options, decision outcome.
- **`/plan`**: `docs/plan/<topic>.md` — Phased task breakdown, file change paths, verification checklist.
- **`/impl`**: Code files + unit test suites + test execution output.
