# Prompt Disclosure Layers

Every prompt file costs tokens on every injection. OCP therefore sorts its
rules into disclosure layers by **violation cost, not file size** — a rule is
paid for exactly when the agent that needs it runs, and never by the agents
that don't.

## The layers

| Layer | Carrier | Paid when | Contents |
|---|---|---|---|
| **L0** | `opencode.jsonc:instructions` | every step of every agent | iron rules: `rfc-keywords`, `output-protocol`, `verification-honesty`, `routing-index` |
| **L1** | agent `prompt` field, assembled from `{file:}` markers | while that agent runs | role rules: coding pack, `sql-migration`, review criteria |
| **L2** | `~/.config/opencode/skills/*/SKILL.md` | only when the agent calls the `skill` tool | scenario rules: `sdd-workflow` |
| **L3** | your project's `AGENTS.md` (OpenCode native) | when files in that directory are read | your personal / project rules |

L0 is the expensive layer (paid × steps × agents), so it stays under a hard
token budget enforced by `scripts/measure-prompts.ts` in the release gate.

## The L1 routing matrix

| Agents | Attached rule files |
|---|---|
| `code`, `coworker`, `fast-coder`, `java-dev`, `python-dev`, `go-dev`, `rust-dev`, `node-dev`, `frontend-dev`, `devops`, `qa` | coding pack: `coding-principles` + `comment-strategy` + `edit-protocol` + `test-scope` |
| `dba` | coding pack + `sql-migration` |
| `code-review` | `coding-principles` + `comment-strategy` + `test-scope` (no `edit-protocol` — editing is denied) |
| `architect`, `advisor`, `security` | `coding-principles` only (review criteria) |
| `build`, `plan`, `explorer`, `researcher`, `tech-writer`, `vision` | none — L0 only |

## Guard rails

- `routing-index.md` (L0) keeps pointers to every on-demand rule, so demoting
  a rule never loses the iron obligation behind it (e.g. SQL migrations must
  still route to `@dba`; SDD flows must still load the skill first).
- L1 files may cross-reference each other with shorthand (`cp#N`) **only
  within the same disclosure unit** — every agent that cites `cp#N` carries
  `coding-principles.md`.
- Upgrades always propagate: the installer takes the template's
  `instructions` array and factory agents as authoritative; only agents you
  added yourself are preserved verbatim.

## Personal rules

Personal or project-specific rules belong in **L3**: an `AGENTS.md` at your
project root (OpenCode loads it natively when the project is active). Do not
edit the shipped `instructions` array — the installer overwrites it with the
template on every upgrade by design.
