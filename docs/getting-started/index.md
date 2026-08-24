# Getting Started

A ready-to-install [OpenCode](https://opencode.ai) configuration: a team of specialist agents behind three orchestrator modes, layered MCP code intelligence and database gateway, one-shot model profiles, workflow slash commands, and optional per-project guardrails.

---

## ⚡ 10-Second Quick Install

Install directly to `~/.config/opencode` with a single command (no Git clone required):

### macOS / Linux / WSL
```bash
curl -fsSL https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.tar.gz -o /tmp/oc-config.tar.gz && tar xzf /tmp/oc-config.tar.gz -C /tmp && /tmp/opencode-config-*/install/install.sh
```

### Windows (PowerShell)
```powershell
$url = "https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.zip"; Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\oc.zip"; Expand-Archive -Path "$env:TEMP\oc.zip" -DestinationPath "$env:TEMP\oc" -Force; & (Get-ChildItem "$env:TEMP\oc\opencode-config-*\install\install.ps1").FullName
```

> 💡 **Zero-Risk Upgrades**: Re-running the command above smoothly upgrades to the latest release while **preserving** all your API keys, custom models, and tier assignments.

---

## What you get

| Feature | What it means for you |
|---|---|
| **Specialist agent team** | 17 specialists (`@java-dev`, `@security`, `@dba`, `@frontend-dev`, …) with domain-tuned prompts, routed automatically |
| **Three working modes** | `@code` (direct development, default), `@build` (orchestrated execution), `@plan` (read-only analysis) — switchable in `install/options.jsonc` |
| **Code intelligence & DB (MCP)** | Pre-configured MCP servers (Serena LSP, CodeGraph knowledge graph, GitNexus, DBHub gateway) with automatic CLI provisioning |
| **Profiles** | `/profile` maps all 5 model tiers to a provider's models in one shot — no per-agent `set model` |
| **Workflow slash commands** | `/review-fix-loop`, `/goal`, `/handoff`, `/grill-me`, `/advisor` modes, and more |
| **Optional guardrails** | Per-project ADR enforcement (`/adr-guard`), secret-file gate (`env-guard`), E2E gate (`/e2e-guard`), commit discipline (`/project`) — all default off |
| **One-command installer** | PowerShell + Bash, manifest-based upgrades; your credentials and model picks survive every reinstall |
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
| Node.js 22.5+ + npm (Optional) | Runtime for CodeGraph / GitNexus / DBHub MCPs | [nodejs.org](https://nodejs.org/) |
| uv / Python 3.13+ (Optional) | Runtime for Serena LSP MCP | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

> - Bun is only needed if you develop this repo (see [DEVELOPING.md](https://github.com/kenlin8827/opencode-config/blob/main/DEVELOPING.md)) — opencode compiles the bundled TypeScript plugins at runtime.
> - Node.js and uv are only needed when their corresponding MCP servers are enabled. When enabled in `install/options.jsonc` and missing from PATH, the installer automatically invokes `npm` / `uv` using the pre-configured `install` command.

---

## Quick start

After running the [10-Second Quick Install](#-10-second-quick-install) above, get started in 3 simple steps:

1. **Launch in your project**: Open a terminal in any project root and run `opencode`.
2. **🎯 Initialize project environment (Highly Recommended)**:
   ```
   /project init        # Auto-builds CodeGraph index, scaffolds project config, dbhub template & commit rules
   ```
3. **Connect your provider & profile**:
   ```
   /connect deepseek    # Connect your provider (or kimi, anthropic, openai, etc.)
   /profile             # Open picker dialog and apply preset profile for all 5 tiers
   ```
4. **Start coding**: `@code` mode is the default daily driver — just describe your task in natural language!

> 💡 **Why run `/project init`?**
> Without overwriting any existing code, it auto-scaffolds essential infrastructure for your project:
> - Runs `codegraph init` to build the local AST knowledge graph (enables agents to trace call paths & blast radius instantly).
> - Generates `dbhub.toml` database gateway scaffold and `docs/git-commits.md` commit discipline rules.

---

### Developer method: Clone and install

If you plan to modify or contribute to this repo, install via Git:

```bash
# 1. Clone
git clone https://github.com/kenlin8827/opencode-config.git
cd opencode-config

# 2. Run install (Windows: pwsh install/install.ps1)
./install/install.sh
```
