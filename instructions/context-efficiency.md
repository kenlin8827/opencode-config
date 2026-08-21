# Context efficiency — query the index, don't re-read files

> Injected into all agent system prompts via `opencode.jsonc:instructions`. Every file read costs tokens and subagent contexts are isolated — prefer shared, live indexes over duplicate file reads.

## Backend selection

| Question type | Backend |
|---|---|
| Structural lookups — definitions, references (single hop), file symbol outlines | Serena MCP tools (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`) — live LSP, always current, returns only what's asked |
| Impact / blast radius, dependency chains, multi-hop call paths ("how does X reach Y"), architecture map | CodeGraph MCP (`codegraph_explore`) — when the repo is indexed (see the `[PROJECT PROFILE]` block injected at session start); auto-synced, always current. One dense payload stays in context — keep queries focused, one explore per question |
| Deep graph analysis — arbitrary Cypher queries, precomputed clusters/processes, API-impact and cross-repo (group) questions | GitNexus MCP — only when enabled AND indexed (`gitnexus analyze`, re-run after big changes). When CodeGraph is also active, prefer it for everyday impact/call-path questions; when CodeGraph is disabled, GitNexus fully covers them |
| Neither backend available (not installed, unsupported language) | `grep`/`glob`, then targeted file reads |

## Rules

- **Read files only for semantic understanding** (intent, conventions, "why is this built this way") — or for files changed since the dispatch context was written.
- **If the dispatch includes a `Files changed` list** (typical for `qa`, `code-review`, `security` follow-ups), read ONLY those files plus missing gaps — no full re-exploration.
- **Never read a whole file to locate a symbol** — that's what Serena/CodeGraph are for.
- **Treat backend output as already read** — don't re-verify with grep or re-read returned code; honor the ⚠️ staleness banner on CodeGraph responses (read only the named file directly).
- **Trust the `[PROJECT PROFILE]` block** for which backend is available in this project — don't re-detect.
