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

### Advanced: Customize Options Before Installing

If you want to toggle optional features (such as enabling `opencode-codex-bridge` / `opencode-claude-bridge`, switching MCP servers like Serena / CodeGraph / DBHub, or changing the default agent) before running the installer:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kenlin8827/opencode-config.git
   cd opencode-config
   ```
2. **Edit `install/options.jsonc`**:
   Adjust switches as needed (`true` / `false`):
   ```jsonc
   // install/options.jsonc
   {
     // rtk output compression (60-90% token savings)
     "rtk": true,
     // Primary agent on start: code (direct dev) / build (orchestrator) / plan (read-only)
     "default_agent": "code",
     // MCP server switches (missing CLIs auto-provisioned on install)
     "mcp": {
       // Serena LSP semantic code retrieval & symbol analysis (needs uv / Python 3.13+)
       "serena": true,
       // CodeGraph AST code knowledge graph (needs npm)
       "codegraph": true,
       // GitNexus code graph (PolyForm Noncommercial license; requires indexing)
       "gitnexus": false,
       // DBHub universal database gateway (PostgreSQL / MySQL / SQLite; needs npm)
       "dbhub": true
     },
     // External npm plugin switches (true: enabled; false: disabled)
     "plugin": {
       // Lazy coding protocol: build what was asked, name the lazier alternative
       "@dietrichgebert/ponytail": true,
       // Injects Qoder provider/models via official SDK (needs qoder login)
       "opencode-qoder-bridge": false,
       // Auto-generates session titles
       "@frankhommers/opencode-smart-title": true,
       // Persistent project memory (vector store; extra LLM capture call per idle session)
       "opencode-mem@2.24.3": false
     }
   }
   ```
3. **Run the installer**:
   ```bash
   # macOS / Linux / WSL
   ./install/install.sh

   # Windows (PowerShell)
   pwsh install/install.ps1
   ```
   > 💡 The installer applies `install/options.jsonc` straight onto the target config and automatically provisions any enabled MCP CLIs that are missing. To change options later, simply update `install/options.jsonc` and re-run with `-Force` (PowerShell) or `-f` (Bash).

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

