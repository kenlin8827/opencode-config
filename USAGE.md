# Usage Guide

From clone to daily workflow — everything you need to use this multi-agent OpenCode configuration.

> **English** | [中文](USAGE.zh-CN.md)

---

## Prerequisites

| Requirement | Why | Install |
|---|---|---|
| [opencode](https://opencode.ai) CLI | Runtime that reads the config and dispatches agents | `curl -fsSL https://opencode.ai/install \| bash` |
| PowerShell 7+ (Windows) | Install script | `winget install Microsoft.PowerShell` |
| Bash 4+ + `jq` (macOS / Linux / WSL) | Same script, bash side | `brew install jq` or `sudo apt install jq` |
| [Bun](https://bun.sh) | TypeScript plugin compilation | `curl -fsSL https://bun.sh/install \| bash` |
| Git | Version control & manifest fallback | — |

## Quick start

### Option A: Install from a Release (no Git clone needed)

Grab the latest archive from the [Releases page](https://github.com/kenlin8827/opencode-config/releases), then:

```bash
# macOS / Linux / WSL
curl -fsSL https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.tar.gz -o /tmp/oc-config.tar.gz
tar xzf /tmp/oc-config.tar.gz -C /tmp
cd /tmp/opencode-config-*/
./install/install.sh
```

```powershell
# Windows (PowerShell)
$url = "https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.zip"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\oc-config.zip"
Expand-Archive -Path "$env:TEMP\oc-config.zip" -DestinationPath "$env:TEMP\oc-config" -Force
Set-Location "$env:TEMP\oc-config\opencode-config-*"
pwsh install/install.ps1
```

### Option B: Clone and install (2 steps)

```powershell
# 1. Clone
git clone <repo-url> opencode-config
cd opencode-config

# 2. Install config to ~/.config/opencode
pwsh install/install.ps1
```

macOS / Linux / WSL:

```bash
./install/install.sh
```

Now launch `opencode` in your project directory — configure providers inside the session (`/connect`, `/provider`, `/profile`, see [Configuration](#configuration)); the `@build` orchestrator is the default agent and will route your tasks automatically.

---

## Installation

The installer copies whitelisted runtime files (`agents/`, `commands/`, `plugins/`, `instructions/`, `opencode.jsonc`, `tui.json`, `profiles/`, `providers/`) to `~/.config/opencode/`. Everything else (`.git/`, `install/`, `tests/`, `node_modules/`, etc.) stays in the repo.

### Commands

| Mode | PowerShell | Bash | What it does |
|---|---|---|---|
| Install (default) | `pwsh install/install.ps1` | `./install/install.sh` | Apply current manifest to target |
| Force reinstall | `pwsh install/install.ps1 install -Force` | `./install/install.sh install -f` | Re-apply same version |
| Status | `pwsh install/install.ps1 status` | `./install/install.sh status` | Show installed vs repo version |
| Generate manifest | `pwsh install/install.ps1 generate` | `./install/install.sh generate` | Scan repo, write manifest (no install) |
| Init (fresh start) | `pwsh install/install.ps1 init` | `./install/install.sh init` | Backup + clear entire target directory |
| Disable rtk | set `"rtk": false` in `options.jsonc` | same | Skips the binary download and removes the vendored openrtk plugin |
| Register global cmd | `pwsh install/install.ps1 register` | `./install/install.sh register` | Install `opencode-config` shim to `~/.local/bin` |
| Unregister global cmd | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | Remove the shim |

### Custom target (safe testing)

```powershell
$tmp = Join-Path $env:TEMP "opencode-test-$(Get-Random)"
pwsh install/install.ps1 install -Target $tmp
# inspect...
Remove-Item -Recurse -Force $tmp
```

```bash
./install/install.sh install -t /tmp/opencode-test
```

### Global command

After the initial install, register the repo as a global `opencode-config` command:

```powershell
pwsh install/install.ps1 register              # shim at ~/.local/bin
pwsh install/install.ps1 register -BinDir C:\Tools\bin  # custom directory
```

```bash
./install/install.sh register
./install/install.sh register --bin-dir ~/bin
```

`register` creates a trampoline that re-executes the in-repo dispatcher, so `git pull` updates the command immediately. It will refuse to overwrite a file it did not create. Add `~/.local/bin` to your user PATH, then run:

```powershell
opencode-config status
opencode-config install -Force
opencode-config unregister   # remove the shim
```

### What gets preserved across reinstalls

When `opencode.jsonc` is overwritten by a new template, these fields are snapshotted from your existing config and restored afterwards:

| Field | Why |
|---|---|
| `provider.<name>.options.baseURL` | Your API endpoint |
| `provider.<name>.options.apiKey` | Your API key |
| `model` (root) | Your default-tier model pick |
| `agent.<name>.model` (per tier) | Your per-tier model assignments |

All other fields come from the repo template. To discard preserved picks, remove `<target>/opencode.jsonc` before reinstalling.

### Token savings (rtk)

Install auto-provisions [rtk](https://github.com/rtk-ai/rtk) — a CLI proxy that compresses command output (git status, test runs, builds, ...) by 60-90% before it reaches the model. No manual steps: if `rtk` is not on PATH, the installer downloads the pinned release into `~/.local/bin` (SHA256-verified, added to the user PATH on Windows when needed). The opencode hook ships in-tree as the vendored [openrtk](https://github.com/martinstannard/openrtk) plugin (`plugins/openrtk.ts`) — it rewrites shell commands through rtk transparently, no `rtk init` step. A leftover official plugin from a previous `rtk init -g --opencode` is removed automatically. Telemetry is disabled after setup.

To opt out entirely: set `"rtk": false` in `<target>/options.jsonc` (or `install/options.jsonc`) and re-run install — the download is skipped and the vendored openrtk plugin is removed from the target. To remove the binary afterwards: delete `~/.local/bin/rtk(.exe)`.

---

## Configuration

All provider/model configuration happens inside opencode itself — the old
`install/config.ps1` / `install/config.sh` helpers are retired (their
replacement is tracked by a follow-up ADR):

1. **Provider setup** — connect official APIs via the `/connect` slash command (recommended)
2. **Custom provider setup** — for bundled router definitions (`codex-router`, `qoder-router`, …) use the `/provider` dialog wizard: credentials (baseURL/apiKey) and model-list maintenance, all via dialogs
3. **LLM Router setup** — for self-hosted or third-party routing services, set credentials via environment variables (or edit `opencode.jsonc` directly)
4. **Qoder setup** — the `opencode-qoder-bridge` plugin is enabled globally and injects the `qoder` provider at startup; just log in with the Qoder CLI (`qoder login`) and apply the `qoder` profile

> **Selection Guide**: Choose method 1 if you want to directly connect to official APIs like DeepSeek, Kimi, etc. (simpler and faster); choose method 2 for the bundled router definitions shipped in `providers/`; choose method 3 if you need to set up your own LLM router or use third-party routing services; choose method 4 if you have a Qoder subscription and want its model catalog (Ultimate/Performance/Kimi/DeepSeek/Qwen/GLM/…) through the official Qoder Agent SDK.

### Provider setup inside opencode (recommended)

For existing providers (such as official DeepSeek, Kimi, Qwen APIs, not self-hosted LLM routers), configure through OpenCode slash commands:

```
/connect <provider-name>    # connect to existing provider
/profile                    # open the profile picker dialog
```

**Configuration Flow:**

1. **Connect Provider** — Use `/connect` command to connect to an existing provider
2. **Select Profile** — Use `/profile` to open the picker dialog and select the corresponding configuration profile

**Example:**

```
> /connect deepseek
  → Connect to DeepSeek provider
> /profile
  → Dialog opens — pick the "deepseek" entry to apply the official API profile
```

**Important:** After configuration is complete, please exit the current opencode session and re-enter to ensure the new provider and profile configurations take full effect.

This configuration method is suitable for:
- Users who already have existing LLM providers (e.g., DeepSeek, Kimi, Qwen, etc.)
- Users who don't want to self-host an LLM router
- Quick interactive configuration scenarios

Profiles automatically configure tier-to-model mappings, eliminating the need to manually set models for each tier.

### Custom providers (`/provider` wizard)

The `/provider` slash command (a TUI plugin registered via `tui.json`) configures custom providers end to end through native dialogs — no arguments:

```
/provider
  → dialog: "( Manage provider models )" + one entry per provider
    (active in opencode.jsonc, or available from providers/*.json —
    picking an inactive one activates it from its definition file)
  → pick a provider: baseURL prompt → apiKey prompt → atomic write
    (opencode.jsonc.bak backup) + toast; empty input keeps current values,
    '{env:VAR}' tokens are supported, secrets are never pre-filled
  → "( Manage provider models )": pick an active provider → its model list:
    "( Add model… )" walks three prompts (key → upstream id → display
    name); picking an existing model asks for removal confirmation
  → Esc cancels
```

Notes:

- TUI-only: the wizard runs inside the opencode TUI; headless sessions have no equivalent.
- Credential changes require an opencode restart to take effect; they survive reinstalls (preserved fields).
- Models added here show up immediately in the `/profile` tier pickers.

### LLM Router credentials

For the `llm-router` custom provider, set `baseURL` / `apiKey` via the
environment variables below (recommended), via the `/provider` wizard
(interactive), or by editing `~/.config/opencode/opencode.jsonc` directly.

#### Environment variables (recommended for API keys)

The shipped `opencode.jsonc` uses env-var substitution tokens:

```jsonc
"baseURL": "{env:LLM_ROUTER_BASE_URL}",
"apiKey":  "{env:LLM_ROUTER_API_KEY}"
```

Set them in your shell profile (PowerShell):

```powershell
# Add to $PROFILE
$env:LLM_ROUTER_BASE_URL = "https://router.example.com/v1"
$env:LLM_ROUTER_API_KEY  = "sk-xxxx"
```

Bash (`~/.bashrc` or `~/.zshrc`):

```bash
export LLM_ROUTER_BASE_URL="https://router.example.com/v1"
export LLM_ROUTER_API_KEY="sk-xxxx"
```

The token round-trips through every reinstall. If you prefer a hardcoded literal, edit `~/.config/opencode/opencode.jsonc` directly — the literal is then preserved across reinstalls.

### Qoder provider (`opencode-qoder-bridge`)

The [opencode-qoder-bridge](https://github.com/naoufalelbani/opencode-qoder-bridge) plugin is listed in the shipped `opencode.jsonc` `plugin` array and injects the `qoder` provider plus its full model catalog at startup — no provider block or API key needed. It talks to Qoder through the official `@qoder-ai/qoder-agent-sdk`, using your Qoder CLI credentials.

Prerequisites:

- Node.js `^22.18 || >=24.11`
- Qoder CLI installed and logged in: `qoder login` (credentials live under `~/.qoder/.auth/user`)

Then restart opencode and apply the bundled `qoder` profile via `/profile`. Models follow your Qoder account/plan — the bridge discovers the catalog live via the SDK (auto, ultimate, performance, efficient, lite, cmodel, qmodel*, kmodel*, gm51model, dmodel, dfmodel, mmodel, …).

Extras that come with the bridge:

- `/qoder-usage` inside opencode, or `qoder-usage` in a terminal — per-model cost/token ledger plus live account quota
- A TUI entry the bridge adds to the global `tui.json` on first load (shows live Qoder credits; self-heals if a reinstall overwrites `tui.json`)

Troubleshooting: auth prompt at startup → run `qoder login` and restart; `qodercli not found` → put the Qoder CLI on PATH. If you don't use Qoder, remove `"opencode-qoder-bridge"` from the `plugin` array in `~/.config/opencode/opencode.jsonc`.

---

## Profiles

A profile is a named preset that bundles a provider with a per-tier model pick, applied in one shot instead of one `set model` per tier.

### Available profiles

| Profile | Description |
|---|---|
| `llm-router` | Server-side routing baseline |
| `codex-router` | Self-hosted codex gateway (Sol/Luna) |
| `qoder-router` | Self-hosted qoder gateway (Ultimate/Performance/Lite) |
| `claude-code-router` | Self-hosted Claude Code gateway, Anthropic protocol (Fable/Opus/Sonnet/Haiku) |
| `qoder` | Qoder subscription via opencode-qoder-bridge (official Qoder Agent SDK; needs `qoder login`) |
| `qoder-deepseek` | All-DeepSeek family on Qoder (dmodel = DeepSeek-V4-Pro, dfmodel = DeepSeek-V4-Flash) |
| `qoder-qwen` | All-Qwen family on Qoder (qmodel_preview = Qwen3.8-Max-Preview, qmodel_latest = Qwen3.7-Max, qmodel = Qwen3.7-Plus) |
| `opencode-go-ultimate` | Quality first, cost no object |
| `opencode-go-performance` | Daily driver |
| `opencode-go-economy` | Cost-performance balance |
| `opencode-go-lite` | Cheapest usable |
| `opencode-go-qwen` | All-Qwen family fallback |
| `opencode-go-kimi` | All-Kimi family fallback |
| `kimi-code` | Kimi For Coding (official plan) |
| `opencode-go-deepseek` | All-DeepSeek family fallback |
| `opencode-go-glm` | All-GLM family fallback |

### Using profiles

Profiles are applied from within an opencode session via the `/profile` slash command (see [Slash commands](#slash-commands)) — it takes no arguments and opens a native dialog picker:

```
/profile
  → dialog: "( Show current tier mapping )" + one entry per profile
  → pick a profile: tier review dialog — pick any tier, then pick a
    provider and a model from the opencode catalog (built-in providers
    like anthropic/openai plus configured ones; typing a custom
    '<provider>/<model_id>' ref is available as fallback), then
    "( Apply profile )" applies the mapping live through the
    server's global config API (config cache invalidated, instances
    rebuilt — no restart needed); if that endpoint is unavailable
    (older opencode builds) it falls back to rewriting
    opencode.jsonc + .active-profile, which needs a restart
  → Esc cancels
```

Every agent of a covered tier is rewritten to the profile's `provider/model_id` ref in lockstep, and the root `model` tracks the `default` tier. Tiers not listed by a profile are left untouched. Applying validates everything up front; the live path lets the server patch `opencode.jsonc` (comments preserved), while the fallback backs up `opencode.jsonc.bak` before a raw rewrite and requires a restart. Note: a live apply disposes server instances, so a message stream in flight at the moment of switching may be interrupted (session history is persisted).

---

## Model routing

The system uses 5 model tiers. Each tier maps to a group of agents:

| Tier | Model ID | Use case | Agents |
|---|---|---|---|
| `default` | `llm-router/default` | General purpose, strong reasoning | build, plan, researcher, architect, security, tech-writer |
| `code` | `llm-router/code` | Code generation, implementation | java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `advisor` | `llm-router/advisor` | Analysis, review, feedback | code-review, advisor |
| `explorer` | `llm-router/explorer` | Fast, cheap, high-volume | explorer |
| `vision` | `llm-router/vision` | Image understanding | vision |

> **Variant** (low/medium/high) controls thinking/reasoning effort per agent. If the backend model doesn't support variants, it's silently ignored.

---

## Daily usage

### Build mode (default)

`@build` is the default entry point. It routes your task to the right specialist automatically:

```
> Add a Spring Boot endpoint for user registration with JPA and BCrypt
  → @build dispatches to @java-dev

> Review my latest commit for security issues
  → @build dispatches to @code-review (+ @security if sensitive)

> Design the architecture for a new payment service
  → @build dispatches to @architect (multi-step plan presented first)
```

You don't need to specify agents manually — just describe the task. For multi-domain tasks, `@build` presents an execution plan before proceeding.

### Plan mode (read-only)

Switch to `@plan` for analysis-only tasks (no code changes):

```
> @plan Audit the codebase for tech debt and security vulnerabilities
  → @plan dispatches @architect, @security, @code-review, @qa in parallel
  → Synthesized report with prioritized recommendations
```

Switch between Build and Plan via Tab or `@plan` / `@build`.

### Direct agent invocation

You can bypass the orchestrator and call a specialist directly:

```
> @dba Optimize the indexes on the orders table
> @frontend-dev Create a reusable Button component with design tokens
> @code-review Review PR #42
```

### Multi-step workflow example

For complex features, `@build` creates and executes a plan:

```
## Execution Plan

1. [@architect] — Design the event sourcing architecture → ADR + design doc
2. [@dba] — Design the event store schema → DDL + migration scripts
3. [@java-dev] — Implement producer and consumer → code + tests
4. [@qa] — Write integration tests → test suite
5. [@security] — Security review → report
6. [@code-review] — Code review → review report
7. [@tech-writer] — Write docs → README + API docs

Shall I proceed?
```

---

## Slash commands

| Command | Description |
|---|---|
| `/auto-advisor off\|lite\|full` | Switch advisor mode (see below) |
| `/provider` | Open the provider wizard (TUI-only): configure credentials (baseURL → apiKey prompts) for active or bundled providers, or manage a provider's model list (add via key/upstream id/display name prompts, remove with confirmation). See [Custom providers](#custom-providers-provider-wizard) |
| `/profile` | Open the dialog picker: shows all available model provider profiles (active one marked); picking one opens a tier review where each tier's model can be overridden via provider → model selection (providers and models come from the opencode server catalog: built-in + configured) before applying (rewrites the tier→model mappings in `opencode.jsonc`). The first entry shows the active profile and current tier→model mappings |
| `/review-fix-loop [scope] [--max-rounds=N]` | Automated review → verify → fix → re-review loop until no P0/P1 remain. Scope: `last commit`, `HEAD~N`, `branch`, `PR`, or empty (uncommitted). `--max-rounds=N` overrides default 5 |
| `/goal [text]` | Structured objective execution with audit-friendly checkpoints and mechanical stop conditions. With text: execute the goal. Without text: goal-builder mode (interactive interview to construct a 5-section goal) |
| `/project init` | Scaffold baseline project files — creates `.opencode/opencode.jsonc`, `docs/git-commits.md`, `AGENTS.md` only when missing (never overwrites); then runs each backend's first-time init (only when its CLI is installed and enabled): `codegraph init`, `gitnexus analyze` when the index is missing. While `docs/git-commits.md` exists, commit discipline is active (see [Commit discipline](#commit-discipline-project-manager)) |
| `/project index` | Manually refresh EXISTING indexes: `codegraph sync` (incremental catch-up for changes made while the watcher wasn't running), `gitnexus analyze` rebuild when stale. Refresh only — a first index is `/project init`'s job; a missing CLI is reported as skipped, never invoked |
| `/grill-me <topic>` | Relentless one-question-at-a-time interview to sharpen a plan or design |
| `/grill-with-docs <topic>` | Same as `/grill-me` + creates `CONTEXT.md` glossary and ADRs inline |
| `/queue ...` | Queue the next prompt/command/shell while an agent runs — provided by the `opencode-queue` npm plugin (see [Queueing the next prompt](#queueing-the-next-prompt-while-an-agent-runs)) |

### Example: review-fix-loop

```
> /review-fix-loop last commit
  → @code-review finds P0/P1 issues
  → Verify each finding (read code, trace data flow, check guards)
  → If false positive → @advisor confirms before dismiss
  → If confirmed real → @<domain-dev> fixes each verified issue
  → @code-review re-reviews
  → Repeat until clean or max rounds (default 5)
  → Summary with verdict + statistics

> /review-fix-loop HEAD~3 --max-rounds=8
  → Same loop, allows up to 8 rounds for larger diffs
```

---

## Auto-advisor mode

`@advisor` provides an independent second opinion on **blocking** decisions only — and only when genuinely necessary (see Frugality rules in the advisor protocol). Non-blocking decisions always proceed with stated assumptions.

| Mode | Behavior |
|---|---|
| **lite** (default) | Dispatch `@advisor`; present BOTH opinions to the user. User decides. |
| **full** | Dispatch `@advisor`; confidence >= 8 on FACTUAL questions → auto-execute (max 10/session, then lite); otherwise lite flow. |
| **off** | No `@advisor` dispatch; orchestrator decides alone. |

### Toggle

```
/auto-advisor off
/auto-advisor lite
/auto-advisor full
```

The `auto-advisor-mode` plugin writes the state file before the LLM sees the command, so the switch is code-level reliable.

### State persistence

- **Storage**: the `autoAdvisorMode` field in `opencode.jsonc` — no hidden state file, no env var. Values: `off` / `lite` / `full` (legacy field `advisorMode` and values `advisory` / `decisive` auto-normalized).
- **Resolution order**: project config (`opencode.jsonc` or `.opencode/opencode.jsonc`) → global config (`~/.config/opencode/opencode.jsonc`) → `off` (default)
- **Writes are project-level only**: `/auto-advisor <mode>` upserts the field in the project's `opencode.jsonc` (comments and other fields preserved); the global config is never modified
- The value persists across sessions and processes, scoped per project

### Red-team stance (adversarial design review)

An optional dispatch where `@advisor` argues AGAINST a proposal instead of balancing options:

- **Triggers**: user asks explicitly ("压测这个方案" / "red team this" / "唱反调"), or orchestrator auto-triggers before irreversible design decisions (schema migration, public API contract, auth redesign, destructive data ops)
- **Output**: verdict (`HOLDS` / `HOLDS WITH CAVEATS` / `FAILS`) + severity-ranked attack list + steelmanned defense
- **On FAILS**: orchestrator re-dispatches the design owner with attacks for rebuttal, then presents both to the user
- **Auto-execute isolation**: red-team output never carries a confidence score; code-level guard suppresses all auto-execute directives — adversarial verdicts can never trigger full-mode auto-execute

---

## Plugins (platform-level enforcement)

Plugins provide runtime hooks that prompts alone cannot achieve:

| Plugin | Hook | What it does |
|---|---|---|
| `design-token-guard.ts` | `tool.execute.before` | Blocks writes with hardcoded colors/spacing/radius |
| `ai-slop-scanner.ts` | `event: file.edited` | Scans frontend files for AI anti-patterns (gradient soup, div soup) |
| `metrics.ts` | `tool.execute.after` + `session.idle` | Auto-records tool call metrics (duration, success, agent) as JSONL |
| `auto-format.ts` | `event: file.edited` | Auto-runs prettier/eslint/ruff/gofmt/rustfmt after file edit |
| `auto-advisor-mode.ts` (+ helpers) | 4 hooks | Advisor modes, protocol injection, off-mode soft guard (no auto-dispatch, manual @advisor allowed), full-mode auto-execute, red-team suppression |
| `review-fix-loop.ts` (+ `review-fix-loop.md`) | `config` + `command.execute.before` + `system.transform` | Registers `/review-fix-loop` slash command programmatically; arms session and injects protocol from markdown into system prompt (LLM-only, not visible in chat UI) |
| `goal.ts` (+ `goal.md`) | `config` + `system.transform` | Registers `/goal` slash command programmatically; injects goal execution protocol (5-section template, audit checklist, mechanical stop conditions, scenario skeletons) into system prompt (LLM-only, not visible in chat UI) |
| `deepseek-anchor.ts` (+ helpers) | `config` + `command.execute.before` + `system.transform` | Registers `/deepseek-anchor` slash command; manages anchor-based reasoning protocols and DeepSeek model integration |
| `adr-guard.ts` (+ helpers) | `config` + `command.execute.before` + `system.transform` + `tool.execute.before` + `event: session.created` | Registers `/adr-guard` slash command (on \| off \| status) — project-level switch (default off). When on: every `feat`/`refactor` commit must include a new/updated ADR — the protocol is injected into the system prompt and `git commit` is hard-blocked when no file under `docs/adr/` is part of the change set. ADRs follow the industry-standard MADR template (frontmatter `status`/`date` + Context/Decision Outcome, sequential `NNNN-slug.md` numbering) |
| `env-guard.ts` (+ helpers) | `tool.execute.before` | Secret-file gate — project-level switch (default off). When on: blocks agent reads/copies of secret-bearing `.env*` files (file tools, grep, bash read verbs, stdin redirection, copy-out) before execution; `.env.example` always allowed |
| `project-manager.ts` (+ helpers) | `config` + `command.execute.before` + `system.transform` + `tool.execute.before` + `event: session.created` | Registers `/project` slash command (`init` scaffolds baseline files, never overwriting, and runs first-time backend init; `index` manually refreshes existing indexes). On a new top-level session in an uninitialized project, suggests `/project init` once (user-visible only, no LLM context). File-as-switch: while `docs/git-commits.md` exists, a progressive-disclosure pointer (~50 tokens) is injected into the system prompt (agents read the file before committing) and `git commit` messages violating the structural rules (`type(scope): summary`, known type, ≤72-char first line) are hard-blocked; delete the file and both deactivate |
| [`opencode-queue`](https://github.com/mirsella/opencode-queue) (npm) | `chat.message` + `session.idle` | Queue next prompt/command/shell while the agent is busy; replay one per idle transition; persists across abort/crash/restart |

Metrics are stored in `~/.config/opencode/.metrics/` as JSONL files.

### ADR iron law (`adr-guard`)

Optional per-project enforcement of Architecture Decision Records. The switch is **project-level** and defaults to off:

```text
/adr-guard on       # enable for this project (writes <project>/.opencode/.adr-guard)
/adr-guard off      # disable
/adr-guard          # status report (state + ADR dir)
```

When on:

- **Soft layer** — the iron-law protocol is injected into the system prompt: agents write/update the ADR proactively before committing.
- **Hard layer** — `git commit` is blocked when the message type is `feat`/`refactor` (scoped/breaking variants included) and no file under the ADR directory appears in the working-tree change set (staged, unstaged, or untracked). `--amend`, other commit types, and commits without an inline message are not gated.
- **ADR format** — strict MADR (industry standard, nothing added): frontmatter `status` + `date`, body `## Context and Problem Statement` + `## Decision Outcome`. Sequential numbering (`docs/adr/NNNN-slug.md`, never reset); changed decisions get a new superseding ADR (`status: superseded by NNNN`) instead of edits.

Project-config fields (all optional, in the project's `opencode.jsonc`):

```jsonc
{
  "adrGuard": "on",            // committed default for the whole team
  "adrGuardDir": "docs/adr"    // ADR directory
}
```

### Secret file guard (`env-guard`)

Optional per-project gate keeping secret-bearing env files out of the LLM context. The switch is **project-level** and defaults to off:

```text
# enable for this project (either one)
echo on > <project>/.opencode/.env-guard
# or add "envGuard": "on" to the project's opencode.jsonc
```

When on, `tool.execute.before` blocks:

- File tools (read/edit/write/patch/multiedit) and the grep tool targeting `.env`, `.env.local`, `.env.production`, …
- bash/shell commands that read a sensitive `.env` file into output (`cat`, `grep`, `Get-Content`, …), redirect one into stdin (`< .env`), or copy one out to another path (`cp .env out`)

Always allowed: `.env.example` (the sanctioned scaffold), `cp .env.example .env`, non-reading verbs (`touch`, `ls`, `rm`, `git`). The block message points to safe alternatives, including `npx envsitter keys` for inspecting key names without values.

Known boundary (same posture as adr-guard): subshell wrappers (`bash -c '...'`), command substitution, and glob references (`*.env`) are not inspected — the guard is a hard wall on the common paths, not a formal sandbox.

### Commit discipline (`project-manager`)

Per-project commit-convention enforcement with a **file-as-switch**: no state file, no on/off command — the discipline is active exactly while `docs/git-commits.md` exists.

```text
/project init       # scaffold baseline files (only when missing, never overwrites):
                    #   .opencode/opencode.jsonc, docs/git-commits.md, AGENTS.md
                    # then first-time backend init (only when CLI installed + enabled):
                    #   codegraph init, gitnexus analyze when the index is missing
/project index      # manually refresh existing indexes: codegraph sync,
                    #   gitnexus analyze when stale
/project            # help
```

While `docs/git-commits.md` exists:

- **Soft layer (progressive disclosure)** — a compact pointer (~50 tokens) is injected into the system prompt naming the file; the document itself is never injected. Agents read it before committing; the mechanical gate backstops any commit made without reading it.
- **Hard layer** — `git commit` is blocked when the message violates the structural subset of Conventional Commits: first line must match `type(scope): summary` with a known type (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style`, `revert`) and stay ≤ 72 characters. `--amend` (per invocation), `Merge`/`Revert`/`fixup!`/`squash!` messages, and commits without an inline message are not gated.
- Delete the file → both layers deactivate immediately.

Note: the gate enforces the mechanically checkable structure only; the rest of `docs/git-commits.md` is guidance carried by the soft layer.

### Queueing the next prompt while an agent runs (`opencode-queue`)

Long-running agents (multi-step `@build` chains, full `/review-fix-loop` rounds) get interrupted the moment you type the next instruction in the prompt bar. The optional [`opencode-queue`](https://github.com/mirsella/opencode-queue) npm plugin registers a real `/queue` slash command so the next prompt, slash command, or shell block waits in line instead of cutting the running agent off.

**Install** (npm plugin — OpenCode installs it on startup):

```jsonc
// opencode.jsonc
{ "plugin": ["opencode-queue"] }
```

Restart OpenCode once after adding the entry. This repo does NOT bundle `opencode-queue` — it's opt-in.

**Common usage** (works as either leading or trailing token):

```
/queue continue with the migration after this
continue with the migration after this /queue

/queue front /review
/review /queue front

/queue !ls           # !cmd = OpenCode shell block
/queue flush         # send everything waiting, even before idle
/queue list          # show current queue
/queue clear 1       # drop item 1
```

**Key behavior** (full semantics in the [upstream README](https://github.com/mirsella/opencode-queue#readme)):

- Queued entries are hidden from the running agent and from the transcript; the current run keeps its agent / model / variant unchanged.
- Replays fire one per idle transition, in queue order, using each entry's own agent / model / variant at the time it was queued.
- Queue state is persisted to OpenCode's user data directory, so entries survive abort / crash / restart; a running queue resumes after the next successful completion.
- `/queue stop` pauses automatic replay (entries are kept); `/queue start` resumes it.
- If plan mode asks to switch to the build agent while more queued work is waiting, the plugin answers `No` so the queue can continue.

### Compile plugins (one-time, after toolchain setup)

```bash
bun install
bunx tsc --noEmit    # type-check only — opencode compiles at runtime
```

---

## Testing

### Structural checks (no API calls — fast)

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -StructuralOnly
```

Verifies: file existence, frontmatter, protocol injection, content patterns, red-team guards, profile application.

### Full tests (structural + API prompt tests)

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1
```

### Include ponytail behavioral tests

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -IncludePrompts
```

### Advisor mode end-to-end (requires opencode CLI + env vars)

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-advisor-e2e.ps1
```

### Profile stress test (no API calls)

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-profiles.ps1
```

Every profile is applied to a fresh template copy; agent refs, root model, and untouched tiers are asserted.

### Prerequisites for API tests

```powershell
$env:LLM_ROUTER_BASE_URL = "https://router.example.com/v1"
$env:LLM_ROUTER_API_KEY  = "<your-api-key>"
```

---

## Upgrading

```powershell
# 1. Pull latest
git pull origin main

# 2. Check what will change
pwsh install/install.ps1 status

# 3. Install (credentials + model picks are preserved)
pwsh install/install.ps1
```

```bash
git pull origin main
./install/install.sh status
./install/install.sh
```

The installer reads `.CONFIG_VERSION` in the target, looks up that version's manifest, removes its files, then copies the current manifest. Your credentials and model picks are preserved.

### Releasing a new version (maintainer)

1. Edit `install/VERSION` (one line, e.g. `0.0.3`)
2. Generate manifest: `pwsh install/install.ps1 generate`
3. Run structural tests: `pwsh tests/test-all.ps1 -StructuralOnly`
4. Type-check plugins: `bun install && bunx tsc --noEmit`
5. Commit + tag

---

## Uninstalling

### Remove a specific version

Delete `<target>/.CONFIG_VERSION` — the next install won't know what to clean up, so also manually remove `~/.config/opencode/` or run:

```powershell
# Point install at the target with the old version still recorded
pwsh install/install.ps1 status   # see what's installed
# Then manually remove the target directory:
Remove-Item -Recurse -Force "$HOME/.config/opencode"
```

### Clean uninstall

```bash
rm -rf ~/.config/opencode
```

This removes all agents, commands, plugins, instructions, and config. Metrics in `~/.config/opencode/.metrics/` are also removed.

### Init mode (backup + clear)

Use `init` to back up the entire target directory to a timestamped sibling (`~/.config/opencode.backup.YYYYMMDD-HHMMSS`), then clear everything inside it — a clean slate for a fresh install.

```powershell
pwsh install/install.ps1 init             # backup + clear
pwsh install/install.ps1 init -NoBackup   # clear without backup
pwsh install/install.ps1 init -Yes         # skip confirmation prompt
```

```bash
./install/install.sh init               # backup + clear
./install/install.sh init --no-backup    # clear without backup
./install/install.sh init -y            # skip confirmation prompt
```

After `init`, run `install` to reinstall config files, then configure credentials and model picks inside opencode (`/connect` + `/profile`).

---

## Adding a new agent

1. **Create `agents/<name>.md`** — follow the structural template (frontmatter + operating loop + competencies + hard rules + output format)
2. **Add to `build.md`** — routing table + trigger words
3. **Add to `plan.md`** — team table (if analysis-capable)
4. **Add to `opencode.jsonc`** — `agent.<name>` block with tier, model, mode, etc.
5. **Add to `tests/test-all.ps1`** — `$allFiles` array + content checks
6. **Generate manifest** — `pwsh install/install.ps1 generate` (after bumping VERSION)
7. **Test** — `pwsh tests/test-all.ps1 -StructuralOnly`

### Frontmatter template

```markdown
---
description: <when to invoke — used by build.md routing>
mode: subagent
variant: <low|medium|high>
temperature: <0.0-0.4>
steps: <max tool calls>
permission:
  read: allow
  bash: allow
  edit: <allow|deny>
  webfetch: <allow|ask|deny>
  websearch: <allow|ask|deny>
---

You are a **senior <role>**. <one-line scope>.

## Operating loop
<3-5 step sequential workflow>

## Core competencies
<domain knowledge, bullet lists — NOT compressed>

## Hard rules
<RFC 2119 keywords, 5-12 words/bullet>

## Output format (mandatory — structured)
<markdown template with placeholders>

Invoke via `@<agent-name>` or <keywords>.
```

---

## Troubleshooting

### "provider.llm-router not configured"

Set credentials via the `LLM_ROUTER_BASE_URL` / `LLM_ROUTER_API_KEY` environment variables (see [LLM Router credentials](#llm-router-credentials)), or edit `~/.config/opencode/opencode.jsonc` directly, then restart opencode.

### Auto-advisor mode not switching

Check the `autoAdvisorMode` field in the project's `opencode.jsonc` (run from the project root):

```powershell
Select-String -Path "opencode.jsonc" -Pattern "autoAdvisorMode"
```

If missing at project level, the global `~/.config/opencode/opencode.jsonc` field applies; if neither defines it, the mode is `off` (default). Run `/auto-advisor lite` to write the field into the project config and enable advisor consultation.

### Plugin type errors

```bash
bun install
bunx tsc --noEmit
```

Fix any reported errors. Opencode compiles plugins at runtime, but type errors indicate logic issues.

### `/profile` does not preserve JSONC comments

The `/profile` plugin strips comments when it rewrites `opencode.jsonc`. If comments matter to you, maintain them in the repo template (`opencode.jsonc`) — they'll be restored on every reinstall (the installer copies the raw file), then stripped again the next time `/profile` touches it.
