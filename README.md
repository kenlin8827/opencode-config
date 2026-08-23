# OpenCode Multi-Agent Config

A ready-to-install [OpenCode](https://opencode.ai) configuration: a team of specialist agents behind three orchestrator modes, one-shot model profiles, workflow slash commands, and optional per-project guardrails — installed into `~/.config/opencode` with a single command.

> **English** | [中文](README.zh-CN.md)
>
> This README is the user manual. If you want to modify this repo itself (agents, plugins, tests, releases), see **[DEVELOPING.md](DEVELOPING.md)**.

---

## What you get

| Feature | What it means for you |
|---|---|
| **Specialist agent team** | 17 specialists (`@java-dev`, `@security`, `@dba`, `@frontend-dev`, …) with domain-tuned prompts, routed automatically |
| **Three working modes** | `@code` (direct development, default), `@build` (orchestrated execution), `@plan` (read-only analysis) — switchable in `install/options.jsonc` |
| **One-command installer** | PowerShell + Bash, manifest-based upgrades; your credentials and model picks survive every reinstall |
| **Profiles** | `/profile` maps all 5 model tiers to a provider's models in one shot — no per-agent `set model` |
| **Workflow slash commands** | `/review-fix-loop`, `/goal`, `/handoff`, `/grill-me`, `/advisor` modes, and more |
| **Optional guardrails** | Per-project ADR enforcement (`/adr-guard`), secret-file gate (`env-guard`), E2E gate (`/e2e-guard`), commit discipline (`/project`) — all default off |
| **Token savings** | [rtk](https://github.com/rtk-ai/rtk) output compression (60–90%) auto-provisioned on install |
| **Second-opinion advisor** | `@advisor` for blocking decisions, with an adversarial red-team stance for design review |

---

## Prerequisites

| Requirement | Why | Install |
|---|---|---|
| [opencode](https://opencode.ai) CLI | Runtime that reads the config and dispatches agents | `curl -fsSL https://opencode.ai/install \| bash` |
| PowerShell 7+ (Windows) | Install script | `winget install Microsoft.PowerShell` |
| Bash 4+ + `jq` (macOS / Linux / WSL) | Same script, bash side | `brew install jq` or `sudo apt install jq` |
| Git | Version control & manifest fallback | — |

> Bun is only needed if you develop this repo (see [DEVELOPING.md](DEVELOPING.md)) — opencode compiles the bundled TypeScript plugins at runtime.

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

Now launch `opencode` in your project directory — configure providers inside the session (`/connect`, `/provider`, `/profile`, see [Configuration](#configuration)); the `@code` direct developer is the default agent (change it via [Default agent](#default-agent-optionsjsonc)).

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
| Change default agent | set `"default_agent"` in `options.jsonc` | same | Which primary agent opencode enters first (`code` / `build` / `plan`) |
| Register global cmd | `pwsh install/install.ps1 register` | `./install/install.sh register` | Install `opencode-config` shim to `~/.local/bin` |
| Unregister global cmd | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | Remove the shim |

### Default agent (options.jsonc)

Which primary agent opencode enters first is controlled by the `default_agent` field in [`install/options.jsonc`](install/options.jsonc) — the installer applies it to the root `default_agent` field of `opencode.jsonc` on **every** install:

```jsonc
// install/options.jsonc
{
  // code  — direct developer; does the coding work itself (daily driver)
  // build — orchestrator; routes coding tasks to specialists
  // plan  — read-only coordinator for analysis / design work
  "default_agent": "code"
}
```

To change it: edit the value, then re-run the installer (`install -Force` when the version is unchanged). Unknown agent names are rejected with a warning and the template value is kept. Inside a session you can always switch modes via Tab or `@build` / `@plan` / `@code` regardless of the default.

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
| `provider.<name>.models` | Your model definitions (custom model ids, user-added models) — deep-merged back: your fields win per model, template-only models and fields still get in |
| `model` (root) | Your default-tier model pick |
| `agent.<name>.model` (per tier) | Your per-tier model assignments |

All other fields come from the repo template. To discard preserved picks, remove `<target>/opencode.jsonc` before reinstalling.

### Token savings (rtk)

Install auto-provisions [rtk](https://github.com/rtk-ai/rtk) — a CLI proxy that compresses command output (git status, test runs, builds, ...) by 60-90% before it reaches the model. No manual steps: if `rtk` is not on PATH, the installer downloads the pinned release into `~/.local/bin` (SHA256-verified, added to the user PATH on Windows when needed). The opencode hook ships in-tree as the vendored [openrtk](https://github.com/martinstannard/openrtk) plugin (`plugins/openrtk.ts`) — it rewrites shell commands through rtk transparently, no `rtk init` step. A leftover official plugin from a previous `rtk init -g --opencode` is removed automatically. Telemetry is disabled after setup.

To opt out entirely: set `"rtk": false` in `install/options.jsonc` and re-run install — the options file overwrites the target on every install, so the download is skipped and the vendored openrtk plugin is removed from the target. To remove the binary afterwards: delete `~/.local/bin/rtk(.exe)`.

---

## Configuration

All provider/model configuration happens inside opencode itself — the old
`install/config.ps1` / `install/config.sh` helpers are retired:

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
| `antigravity-router` | Self-hosted Antigravity gateway (Gemini Flash/Pro + Claude Sonnet/Opus Thinking + GPT-OSS) |
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

| Tier | Use case | Agents |
|---|---|---|
| `default` | General purpose, strong reasoning | build, plan, code, researcher, architect, security, tech-writer |
| `code` | Code generation, implementation | java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `advisor` | Analysis, review, feedback | code-review, advisor |
| `explorer` | Fast, cheap, high-volume | explorer |
| `vision` | Image understanding | vision |

Each tier resolves to whatever provider/model your active profile mapped it to. **Variant** (low/medium/high) controls thinking/reasoning effort per agent; if the backend model doesn't support variants, it's silently ignored.

---

## Daily usage

### Code mode (default)

`@code` is the default entry point — a direct developer that writes, modifies, tests, and verifies code itself, without proactive delegation:

```
> @code Fix the off-by-one error in the pagination logic
> @code Add input validation to the signup form
```

Manual delegation stays available for assists (`@advisor`, `@explorer`, `@code-review`, `@vision`). If the task turns out to be multi-domain, `@code` suggests switching to `@build`.

### Build mode (orchestrated)

Switch to `@build` for multi-domain tasks — it routes your task to the right specialist automatically:

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

Switch between modes via Tab or `@code` / `@build` / `@plan`.

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
| `/handoff [focus]` | Compact the current conversation into a handoff document (saved to the OS temp directory) so a fresh session can pick up the work. Optional arg focuses the doc on what the next session should work on |
| `/project init` | Scaffold baseline project files — creates `.opencode/opencode.jsonc`, `docs/git-commits.md`, `AGENTS.md` only when missing (never overwrites); an EXISTING project config gets an append-only top-up with switch lines the template gained since init (existing content untouched); then runs each backend's first-time init (only when its CLI is installed and enabled): `codegraph init`, `gitnexus analyze` when the index is missing. While `docs/git-commits.md` exists, commit discipline is active (see [Commit discipline](#commit-discipline-project-manager)) |
| `/project index` | Manually refresh EXISTING indexes: `codegraph sync` (incremental catch-up for changes made while the watcher wasn't running), `gitnexus analyze` rebuild when stale. Refresh only — a first index is `/project init`'s job; a missing CLI is reported as skipped, never invoked |
| `/project sync` | The config top-up alone: append template switch lines missing from an existing `.opencode/opencode.jsonc` (append-only — nothing existing is changed; missing file → run `/project init`) |
| `/grill-me <topic>` | Relentless one-question-at-a-time interview to sharpen a plan or design |
| `/grill-with-docs <topic>` | Same as `/grill-me` + creates `CONTEXT.md` glossary and ADRs inline |
| `/queued` | Manage queued prompts — interactive TUI dialogs to list / edit / cancel messages submitted while the session is busy (see [Managing queued prompts](#managing-queued-prompts-queued)) |

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
| **off** (default) | No `@advisor` dispatch; orchestrator decides alone. Manual `@advisor` still works. |
| **lite** | Dispatch `@advisor`; present BOTH opinions to the user. User decides. |
| **full** | Dispatch `@advisor`; confidence >= 8 on FACTUAL questions → auto-execute (max 10/session, then lite); otherwise lite flow. |

### Toggle

```
/auto-advisor off
/auto-advisor lite
/auto-advisor full
```

The `auto-advisor-mode` plugin writes the config before the LLM sees the command, so the switch is code-level reliable.

### State persistence

- **Storage**: the `autoAdvisorMode` field in `opencode.jsonc` — no hidden state file, no env var. Values: `off` / `lite` / `full` (legacy field `advisorMode` and values `advisory` / `decisive` auto-normalized).
- **Resolution**: project config (`opencode.jsonc` or `.opencode/opencode.jsonc`) → `off` (default). Purely project-level — no global fallback.
- **Writes are project-level only**: `/auto-advisor <mode>` upserts the field in the project's `opencode.jsonc` (comments and other fields preserved); the global config is never modified
- The value persists across sessions and processes, scoped per project

### Red-team stance (adversarial design review)

An optional dispatch where `@advisor` argues AGAINST a proposal instead of balancing options:

- **Triggers**: user asks explicitly ("压测这个方案" / "red team this" / "唱反调"), or orchestrator auto-triggers before irreversible design decisions (schema migration, public API contract, auth redesign, destructive data ops)
- **Output**: verdict (`HOLDS` / `HOLDS WITH CAVEATS` / `FAILS`) + severity-ranked attack list + steelmanned defense
- **On FAILS**: orchestrator re-dispatches the design owner with attacks for rebuttal, then presents both to the user
- **Auto-execute isolation**: red-team output never carries a confidence score; code-level guard suppresses all auto-execute directives — adversarial verdicts can never trigger full-mode auto-execute

---

## Plugins

Plugins provide runtime enforcement and workflows that prompts alone cannot achieve. Everything below ships enabled — nothing to install.

| Plugin | What it does for you |
|---|---|
| `design-token-guard.ts` | Blocks writes with hardcoded colors/spacing/radius — keeps frontend code on design tokens |
| `ai-slop-scanner.ts` | Warns about AI anti-patterns in frontend files (gradient soup, div soup) |
| `metrics.ts` | Auto-records tool call metrics (duration, success, agent) as JSONL in `~/.config/opencode/.metrics/` |
| `auto-format.ts` | Auto-runs prettier/eslint/ruff/gofmt/rustfmt after file edits |
| `auto-advisor-mode.ts` | `/auto-advisor` command, protocol injection, mode gating, red-team suppression (see [Auto-advisor mode](#auto-advisor-mode)) |
| `review-fix-loop.ts` | `/review-fix-loop` command and protocol |
| `goal.ts` | `/goal` command and protocol |
| `handoff.ts` | `/handoff` command and protocol |
| `deepseek-anchor.ts` | `/deepseek-anchor` command — anchor-based reasoning protocols with DeepSeek models |
| `adr-guard.ts` | `/adr-guard` command — per-project ADR enforcement (see below) |
| `env-guard.ts` | Per-project secret-file gate (see below) |
| `e2e-guard.ts` | `/e2e-guard` command — per-project gate: E2E runs need user confirmation; full suites pay a one-shot pass each time, targeted spec re-runs unlock after the first approval (see below) |
| `project-manager.ts` | `/project` command + commit discipline (see below) |
| `queue-manager.ts` | `/queued` command — manage prompts queued while the session is busy (see below) |
| `profile-wizard.ts`, `provider-wizard.ts` | `/profile` and `/provider` TUI dialog wizards |

For hook-level internals (which OpenCode hooks each plugin uses, registration patterns), see [DEVELOPING.md](DEVELOPING.md#plugin-system).

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

When on, agent access is blocked before execution for:

- File tools (read/edit/write/patch/multiedit) and the grep tool targeting `.env`, `.env.local`, `.env.production`, …
- bash/shell commands that read a sensitive `.env` file into output (`cat`, `grep`, `Get-Content`, …), redirect one into stdin (`< .env`), or copy one out to another path (`cp .env out`)

Always allowed: `.env.example` (the sanctioned scaffold), `cp .env.example .env`, non-reading verbs (`touch`, `ls`, `rm`, `git`). The block message points to safe alternatives, including `npx envsitter keys` for inspecting key names without values.

Known boundary: subshell wrappers (`bash -c '...'`), command substitution, and glob references (`*.env`) are not inspected — the guard is a hard wall on the common paths, not a formal sandbox.

### E2E gate (`e2e-guard`)

Optional per-project gate requiring explicit user confirmation before any E2E suite runs. E2E is slow, flaky, and expensive — the last-resort test tier — and a soft prompt rule alone does not guarantee an agent honors that; this gate blocks the execution itself. The switch is **project-level** and defaults to off:

```text
/e2e-guard on       # enable for this project ("e2eGuard": "on" in the project opencode.jsonc)
/e2e-guard off      # disable
/e2e-guard          # status report
```

When on, bash/shell calls that run an E2E suite are blocked before execution:

- Package-manager run scripts whose name contains `e2e` (`npm|pnpm|yarn|bun [run] e2e`, `test:e2e`, `e2e:smoke`, …)
- Runner CLIs: `playwright test`, `cypress run`, `nightwatch`, `codeceptjs run` (setup-only verbs like `playwright install` are not gated)
- Python runners — gated only when the invocation itself says e2e: `pytest tests/e2e/...`, `pytest -m e2e`, `python -m pytest ...`, `uv|poetry|pdm|pipenv run pytest ...`, `tox -e e2e` (bare `pytest` is not gated — it is usually the unit suite)
- Chained commands are judged per segment — one E2E segment gates the whole command (highest risk wins)

Gating is graded by risk:

| Risk level | Shape | Gate |
|---|---|---|
| **full** | Suite run with no explicit target (`npm run e2e`, bare `playwright test`) | Every run needs a fresh one-shot `/e2e-guard allow` pass |
| **targeted** | Explicit spec/test-file argument (`playwright test tests/login.spec.ts`, `cypress run --spec ...`) | Passes automatically once the session has any confirmed approval |

Flow when an E2E run is genuinely warranted:

1. The agent proposes an interactive choice: (a) RECOMMENDED — run only the specs affected by the current diff; (b) run the full suite anyway; (c) skip E2E and verify with lighter tiers.
2. Your choice maps to a grant:
   - affected only → `/e2e-guard allow targeted` — unlocks targeted re-runs for the session; full suites stay gated
   - full suite → `/e2e-guard allow` — one-shot pass for the next full run (plus the same targeted unlock)
3. The agent retries the chosen command. Full-suite passes are consumed (a later suite run needs a fresh confirmation); targeted re-runs — the typical fix-and-retry loop — stay unlocked for the rest of the session. Approvals die with the session and are never persisted.

```jsonc
// project opencode.jsonc — committed team default (optional)
{ "e2eGuard": "on" }
```

Known boundary: shell wrappers (`bash -c '...'`) are not inspected — the gate is a hard wall on the common paths, not a formal sandbox.

### Commit discipline (`project-manager`)

Per-project commit-convention enforcement with a **file-as-switch**: no state file, no on/off command — the discipline is active exactly while `docs/git-commits.md` exists.

```text
/project init       # scaffold baseline files (only when missing, never overwrites;
                    #   an existing project config gets new template switches appended):
                    #   .opencode/opencode.jsonc, docs/git-commits.md, AGENTS.md
                    # then first-time backend init (only when CLI installed + enabled):
                    #   codegraph init, gitnexus analyze when the index is missing
/project index      # manually refresh existing indexes: codegraph sync,
                    #   gitnexus analyze when stale
/project sync       # the config top-up alone (append-only)
/project            # help
```

While `docs/git-commits.md` exists:

- **Soft layer (progressive disclosure)** — a compact pointer (~50 tokens) is injected into the system prompt naming the file; the document itself is never injected. Agents read it before committing; the mechanical gate backstops any commit made without reading it.
- **Hard layer** — `git commit` is blocked when the message violates the structural subset of Conventional Commits: first line must match `type(scope): summary` with a known type (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style`, `revert`) and stay ≤ 72 characters. `--amend` (per invocation), `Merge`/`Revert`/`fixup!`/`squash!` messages, and commits without an inline message are not gated.
- Delete the file → both layers deactivate immediately.

Note: the gate enforces the mechanically checkable structure only; the rest of `docs/git-commits.md` is guidance carried by the soft layer.

### Managing queued prompts (`/queued`)

When you submit prompts while the session is busy, OpenCode persists them immediately as user messages (the TUI shows a QUEUED badge on them) and works through them after the current run finishes. The bundled `queue-manager.ts` TUI plugin gives that queue an interactive management UI — it ships enabled via `tui.json`, nothing to install.

**Usage**: `/queued` (or command palette → "Manage queued messages") opens a select dialog listing every queued message (preview + age). Picking one opens a per-message menu — **Edit text**, **Cancel message**, **View full text** — and the list also offers a **Cancel ALL** bulk action.

**Key behavior**:

- The "queue" is computed from the session history: every user message that has no assistant reply yet, minus internal messages (compaction, subtask) and plugin feedback.
- Edits are written back to storage immediately; the processing loop re-reads messages every step, so the edited text is what gets used when the message's turn arrives.
- Cancel deletes the message outright when the session is idle. While busy, OpenCode refuses message deletion (409), so the plugin strips the message instead — its text becomes a tombstone note and attachments are removed — the model never receives the original instruction.
- TUI-only plugin; headless sessions have no equivalent.

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

Release-based installs: download the new archive and run the installer again — same preservation rules apply.

---

## Uninstalling

### Clean uninstall

```bash
rm -rf ~/.config/opencode
```

```powershell
Remove-Item -Recurse -Force "$HOME/.config/opencode"
```

This removes all agents, commands, plugins, instructions, and config. Metrics in `~/.config/opencode/.metrics/` are also removed. If you registered the global command, run `opencode-config unregister` (or delete the shim in `~/.local/bin`) first.

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

## Troubleshooting

### "provider.llm-router not configured"

Set credentials via the `LLM_ROUTER_BASE_URL` / `LLM_ROUTER_API_KEY` environment variables (see [LLM Router credentials](#llm-router-credentials)), or edit `~/.config/opencode/opencode.jsonc` directly, then restart opencode.

### Auto-advisor mode not switching

Check the `autoAdvisorMode` field in the project's `opencode.jsonc` (run from the project root):

```powershell
Select-String -Path "opencode.jsonc" -Pattern "autoAdvisorMode"
```

If the field is missing the mode is `off` (default). Run `/auto-advisor lite` to write the field into the project config and enable advisor consultation.

### `/profile` does not preserve JSONC comments

The `/profile` plugin strips comments when it rewrites `opencode.jsonc`. If comments matter to you, maintain them in the repo template (`opencode.jsonc`) — they'll be restored on every reinstall (the installer copies the raw file), then stripped again the next time `/profile` touches it.

### Something else?

Installer internals (manifests, preserved fields, custom targets) are documented in [`install/README.md`](install/README.md). Repo development issues (plugin type errors, tests) are covered in [`DEVELOPING.md`](DEVELOPING.md).

---

## Documentation map

| Document | Audience |
|---|---|
| `README.md` (this file) / [`README.zh-CN.md`](README.zh-CN.md) | Users — install, configure, daily workflow |
| [`DEVELOPING.md`](DEVELOPING.md) | Contributors — architecture, prompt conventions, tests, releases |
| [`install/README.md`](install/README.md) | Installer internals — manifests, preserved fields, init, custom targets |
| [`tests/README.md`](tests/README.md) | Test suite reference |
