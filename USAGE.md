# Usage Guide

From clone to daily workflow — everything you need to use this multi-agent OpenCode configuration.

> **English** | [中文](USAGE.zh-CN.md)

---

## Prerequisites

| Requirement | Why | Install |
|---|---|---|
| [opencode](https://opencode.ai) CLI | Runtime that reads the config and dispatches agents | `curl -fsSL https://opencode.ai/install \| bash` |
| PowerShell 7+ (Windows) | Install & config scripts | `winget install Microsoft.PowerShell` |
| Bash 4+ + `jq` (macOS / Linux / WSL) | Same scripts, bash side | `brew install jq` or `sudo apt install jq` |
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
./install/config.sh
```

```powershell
# Windows (PowerShell)
$url = "https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.zip"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\oc-config.zip"
Expand-Archive -Path "$env:TEMP\oc-config.zip" -DestinationPath "$env:TEMP\oc-config" -Force
Set-Location "$env:TEMP\oc-config\opencode-config-*"
pwsh install/install.ps1
pwsh install/config.ps1
```

### Option B: Clone and install (3 steps)

```powershell
# 1. Clone
git clone <repo-url> opencode-config
cd opencode-config

# 2. Install config to ~/.config/opencode
pwsh install/install.ps1

# 3. Configure credentials (interactive — pick providers, then models per tier)
pwsh install/config.ps1
```

macOS / Linux / WSL:

```bash
./install/install.sh
./install/config.sh
```

Now launch `opencode` in your project directory — the `@build` orchestrator is the default agent and will route your tasks automatically.

---

## Installation

The installer copies whitelisted runtime files (`agents/`, `commands/`, `plugins/`, `instructions/`, `opencode.jsonc`, `profiles/`) to `~/.config/opencode/`. Everything else (`.git/`, `install/`, `tests/`, `node_modules/`, etc.) stays in the repo.

### Commands

| Mode | PowerShell | Bash | What it does |
|---|---|---|---|
| Install (default) | `pwsh install/install.ps1` | `./install/install.sh` | Apply current manifest to target |
| Force reinstall | `pwsh install/install.ps1 install -Force` | `./install/install.sh install -f` | Re-apply same version |
| Status | `pwsh install/install.ps1 status` | `./install/install.sh status` | Show installed vs repo version |
| Generate manifest | `pwsh install/install.ps1 generate` | `./install/install.sh generate` | Scan repo, write manifest (no install) |
| Init (fresh start) | `pwsh install/install.ps1 init` | `./install/install.sh init` | Backup + clear entire target directory |
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

All other fields come from the repo template. To discard preserved picks: `config.ps1 reset` / `config.sh reset`.

---

## Configuration

OpenCode supports two configuration approaches:

1. **Existing Provider Setup** - For direct connection to official APIs (slash command quick setup - recommended to try first)
2. **LLM Router Setup** - For self-hosted or third-party routing services (config script setup)

> **Selection Guide**: Choose method 1 if you want to directly connect to official APIs like DeepSeek, Kimi, etc. (simpler and faster); choose method 2 if you need to set up your own LLM router or use third-party routing services.

### Existing Provider Configuration (Non-LLM Router - recommended to try first)

**Configuration Methods Comparison:**
- **Existing Provider Setup**: Direct use of existing LLM provider APIs with slash commands for quick configuration
- **LLM Router Setup**: Self-hosted or third-party routing services requiring config scripts to set baseURL and apiKey

For existing providers (such as official DeepSeek, Kimi, Qwen APIs, not self-hosted LLM routers), you can configure through OpenCode slash commands without running config scripts:

```
/connect <provider-name>    # connect to existing provider
/profile <profile-name>     # select provider profile configuration
```

**Configuration Flow:**

1. **Connect Provider** — Use `/connect` command to connect to an existing provider
2. **Select Profile** — Use `/profile` command to select the corresponding configuration profile

**Example:**

```
> /connect deepseek
  → Connect to DeepSeek provider
> /profile deepseek  
  → Apply DeepSeek official API profile configuration
```

**Important:** After configuration is complete, please exit the current opencode session and re-enter to ensure the new provider and profile configurations take full effect.

This configuration method is suitable for:
- Users who already have existing LLM providers (e.g., DeepSeek, Kimi, Qwen, etc.)
- Users who don't want to self-host an LLM router
- Quick interactive configuration scenarios

Profiles automatically configure tier-to-model mappings, eliminating the need to manually set models for each tier.

### LLM Router Configuration (Interactive - recommended for first setup)

```powershell
pwsh install/config.ps1    # PowerShell
```

```bash
./install/config.sh        # Bash
```

The interactive flow:

1. **Multi-select providers** — pick from `opencode models` output + `llm-router` (custom provider). `0` or Enter = all.
2. **llm-router credentials** — prompted if `llm-router` is among selected providers. Enter = keep existing.
3. **Pick model per tier** — for each tier (default, code, advisor, explorer, vision), choose a model from the selected providers. Enter = keep current.

Every agent in a tier is rewritten to the same `provider/model_id` ref in lockstep.

### Scripted (non-interactive)

```powershell
# Set credentials
pwsh install/config.ps1 set baseURL https://router.example.com/v1
pwsh install/config.ps1 set apiKey  sk-xxxx

# Set model for a specific tier
pwsh install/config.ps1 set model code claude-sonnet-4-5
pwsh install/config.ps1 set model advisor gpt-5.6-luna -p opencode-go

# Show current state
pwsh install/config.ps1 get

# Reset to template defaults
pwsh install/config.ps1 reset
```

Bash equivalents:

```bash
./install/config.sh set baseURL https://router.example.com/v1
./install/config.sh set apiKey sk-xxxx
./install/config.sh set model code claude-sonnet-4-5
./install/config.sh get
./install/config.sh reset
```

### Environment variables (recommended for API keys)

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

The token round-trips through every reinstall. If you prefer a hardcoded literal, run `config.ps1 set apiKey sk-...` once — the literal is then preserved across reinstalls.

---

## Profiles

A profile is a named preset that bundles a provider with a per-tier model pick, applied in one shot instead of one `set model` per tier.

### Available profiles

| Profile | Description |
|---|---|
| `llm-router` | Server-side routing baseline (same as `reset`) |
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

```powershell
# Interactive numbered menu
pwsh install/config.ps1 profile

# List without applying
pwsh install/config.ps1 profile list

# Apply directly
pwsh install/config.ps1 profile apply opencode-go-performance
```

```bash
./install/config.sh profile
./install/config.sh profile list
./install/config.sh profile apply opencode-go-performance
```

A profile is **single-provider** — every tier ref must share the same provider. Tiers not listed by a profile are left untouched. Applying validates everything up front and backs up `opencode.jsonc.bak` before writing.

You can also switch profiles from within an opencode session using the `/profile` slash command (see [Slash commands](#slash-commands)).

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
| `/profile list` | List all available model provider profiles |
| `/profile <name>` | Switch to a named profile (e.g., `/profile deepseek`); rewrites tier→model mappings in `opencode.jsonc` |
| `/profile current` | Show the active profile and current tier→model mappings |
| `/review-fix-loop [scope] [--max-rounds=N]` | Automated review → verify → fix → re-review loop until no P0/P1 remain. Scope: `last commit`, `HEAD~N`, `branch`, `PR`, or empty (uncommitted). `--max-rounds=N` overrides default 5 |
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

- **State file**: `~/.config/opencode/.auto-advisor-mode` (`off` / `lite` / `full`; legacy `advisory` / `decisive` auto-normalized)
- **Cold start** (no state file): `autoAdvisorMode` field in `opencode.jsonc` → env pin to `off` → `lite` (default)
- State persists across sessions and processes

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
| `deepseek-anchor.ts` (+ helpers) | `config` + `command.execute.before` + `system.transform` | Registers `/deepseek-anchor` slash command; manages anchor-based reasoning protocols and DeepSeek model integration |
| [`opencode-queue`](https://github.com/mirsella/opencode-queue) (npm) | `chat.message` + `session.idle` | Queue next prompt/command/shell while the agent is busy; replay one per idle transition; persists across abort/crash/restart |

Metrics are stored in `~/.config/opencode/.metrics/` as JSONL files.

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

After `init`, run `install` to reinstall config files, then `config.ps1` / `config.sh` to set credentials and model picks.

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

Run the interactive config: `pwsh install/config.ps1` (or `./install/config.sh`). Or set credentials via env vars and reinstall.

### "no models available"

Run `opencode` first to authenticate the CLI, then re-run `config.ps1`. The interactive flow reads `opencode models` to list available models.

### Auto-advisor mode not switching

Check the state file:

```powershell
Get-Content "$HOME/.config/opencode/.auto-advisor-mode"
```

If missing, the cold-start chain applies: `autoAdvisorMode` in `opencode.jsonc` → env pin to `off` → `lite` (default). Run `/auto-advisor lite` to create the state file.

### Plugin type errors

```bash
bun install
bunx tsc --noEmit
```

Fix any reported errors. Opencode compiles plugins at runtime, but type errors indicate logic issues.

### Config scripts don't preserve JSONC comments

Both `config.ps1` and `config.sh` strip comments on write. The warning `this script does not preserve JSONC comments` appears on first write. If comments matter to you, maintain them in the repo template (`opencode.jsonc`) — they'll be restored on every reinstall (the installer copies the raw file), then stripped again the next time `config.ps1` touches it.
