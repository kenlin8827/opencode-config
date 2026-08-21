# Context efficiency — query the index, don't re-read files

> Injected into all agent system prompts via `opencode.jsonc:instructions`. Every file read costs tokens and subagent contexts are isolated — prefer shared, live indexes over duplicate file reads.

## Backend selection

| Question type | Backend |
|---|---|
| Structural lookups — definitions, references, call chains, symbol overview | Serena MCP tools (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`) — live LSP, always current, returns only what's asked |
| Impact / blast radius, dependency chains, call paths, architecture map | CodeGraph MCP (`codegraph_explore`) — when the repo is indexed (see the `[PROJECT PROFILE]` block injected at session start); auto-synced, always current |
| Neither backend available (not installed, unsupported language) | `grep`/`glob`, then targeted file reads |

## Rules

- **Read files only for semantic understanding** (intent, conventions, "why is this built this way") — or for files changed since the dispatch context was written.
- **If the dispatch includes a `Files changed` list** (typical for `qa`, `code-review`, `security` follow-ups), read ONLY those files plus missing gaps — no full re-exploration.
- **Never read a whole file to locate a symbol** — that's what Serena/CodeGraph are for.
- **Trust the `[PROJECT PROFILE]` block** for which backend is available in this project — don't re-detect.
