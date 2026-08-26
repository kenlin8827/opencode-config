# OpenCode Agent & Development Guidelines (AGENTS.md)

This document defines the core architecture, coding disciplines, and language standards for all AI agents and human contributors working on this repository.

---

## 1. Language & Localization Disciplines (Strict Boundary Separation)

To prevent mixed-language pollution and ensure optimal cross-platform/cross-model compatibility, enforce the following strict boundaries:

### A. Source Code, Plugins & Tooling (100% English)
- **All TypeScript/JavaScript files** (`plugins/**/*.ts`, `scripts/**/*.ts`):
  - JSDoc, inline comments, log/error messages, and slash command metadata (`description`, `template`) **MUST be written in standard English**.
  - Example: `description: "Quick-Dev — zero-delegation fast track with direct in-session coding..."` (NEVER write non-English strings in plugin code unless it is explicitly an internal localized TUI label).
- **All Installer & Shell Scripts** (`install/*.ps1`, `install/*.sh`): English comments and messages only.

### B. System Prompts & Protocol Markdown (100% English)
- **Agent Prompts** (`agents/*.md`): Standard English only.
- **Shared Instructions** (`instructions/*.md`): Standard English only.
- **Plugin Protocols** (`plugins/*/*.md`): Standard English only.
- **Contributor Guidelines** (`AGENTS.md`, `DEVELOPING.md`): Standard English only.
  *Rationale*: LLMs follow English system prompts and guidelines with the highest precision, lowest ambiguity, and optimal token efficiency.

### C. User Documentation (Strict Bilingual Separation)
- **English Docs Tree**: `README.md` and `docs/**/*.md` (outside `docs/zh/`) must be **100% English**.
- **Chinese Docs Tree**: `README.zh-CN.md` and `docs/zh/**/*.md` must be **100% Chinese**.
- **Hard Rule**: Chinese text is strictly confined to the Chinese documentation tree (`README.zh-CN.md` and `docs/zh/`). Never insert uncoordinated Chinese text into English files, codebases, or protocols.

---

## 2. Multi-Agent & Workflow Architecture

### Three-Tier Development Loops
- **⚡ `/quick-dev <task>` (or `/flash-dev`)**:
  - **Role**: Direct in-session fast coding (`agent: "code"`).
  - **Discipline**: Zero delegation overhead (no subagent spawning), zero review overhead, instant delivery.
- **🚀 `/fast-dev <task> [--max-rounds=N]`**:
  - **Role**: Agile single-review loop (`agent: "build"`).
  - **Discipline**: Zero-loss requirement passthrough to `@fast-coder` (Flash) ➡️ Flagship single review (`@code-review`) ➡️ iterative fix loop (default max 10 rounds).
- **🧠 `/deep-dev <task> [--max-rounds=N]`**:
  - **Role**: Mission-critical dual-review loop (`agent: "build"`).
  - **Discipline**: Flash coding ➡️ Dual flagship review (`@architect` + `@code-review`) ➡️ `@advisor` consensus arbitration under Safety-First principle.

---

## 3. Code Intelligence & Indexing First

- **Never blindly grep or crawl entire repositories.**
- **LSP First**: Use Serena MCP tools (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`) for symbol-level definition and reference lookups.
- **Graph First**: Use CodeGraph (`codegraph_explore`) or GitNexus for multi-hop call graphs, architectural overviews, and blast-radius impact analysis.
- **Database First**: Use DBHub (`search_objects`) before executing SQL queries.

---

## 4. Release, Manifest & Packaging Integrity

- **Runtime Files (`manifest.txt`)**:
  - When adding, renaming, or removing runtime files in `plugins/`, `agents/`, `instructions/`, or `profiles/`, **always run `bun run install/src/index.ts generate` (or `ocp generate`)** to synchronize `install/versions/<VERSION>.manifest.txt`.
- **Installer, Shims & Infrastructure (`install/` & `bin/`)**:
  - Files under `install/` and `bin/` are **automatically mirrored** during release packaging. Any new files placed in `install/` or `bin/` are dynamically included and validated without manual registration.
- **Pre-Release Verification Hard Gate**:
  - Always execute `pwsh scripts/pack.ps1 && pwsh scripts/verify.ps1` (or `./scripts/pack.sh && ./scripts/verify.sh`) before creating a release. All 4 release archives must pass SHA-256 integrity and file completeness checks with zero diffs.
