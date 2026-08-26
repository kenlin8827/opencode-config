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

After running the [10-Second Quick Install](#-10-second-quick-install) above, you can proceed with whichever workflow fits your needs:

### 1. Start Coding Immediately (Most Common)
Open any project directory in your terminal and launch OpenCode:
```bash
opencode
```
- **🎯 Initialize project environment (Highly Recommended)**: Run `/project init` to scaffold the code knowledge graph and project guards.
- **Connect provider & profile**: Run `/connect deepseek` (or kimi, anthropic, openai, etc.), then `/profile` to assign models across all 5 tiers.
- **Start coding**: `@code` mode is the default daily driver — just describe your task in natural language!

### 2. Open the TUI Control Center Anytime (Toggle switches & agent tiers)
Run from within the repository at any time:
```powershell
# Windows (PowerShell)
pwsh install/install.ps1

# macOS / Linux / WSL (Bash)
./install/install.sh
```
This opens the **Single-Screen TUI Control Center**, allowing you to press Space to toggle MCP servers, plugins, RTK optimizer, or cycle Agent-to-Tier model assignments (`default` / `code` / `advisor` / `explorer` / `vision`).

### 3. Register Global Command (Configure from anywhere)
Select `🌐 Register Global Command (opencode-config)` in the wizard menu, or run:
```bash
opencode-config
```
You can now run `opencode-config` from any terminal path across your entire system!

---

## 🖥️ Client & UI Options

You can interact with OpenCode through multiple interfaces depending on your preferred workflow:

| Interface | Best for | Key Advantages | How to Launch |
|---|---|---|---|
| **Terminal TUI (Default)** | Command-line power users, SSH sessions | Ultra-lightweight, minimal resource usage, pure keyboard flow | Run `opencode` in your terminal |
| **OpenChamber Desktop / GUI** | Users who prefer visual IDEs & detailed Code Reviews | **Side-by-side visual diffs**, Multi-Model comparison & Fusion, session timelines | Download [OpenChamber](https://openchamber.dev) desktop app or VS Code extension |
| **Built-in Web UI** | Browser-based access without extra desktop apps | Instant browser access, cross-device friendly | Run `opencode serve` and open in your browser |

> 💡 **Seamless Compatibility**: Whichever UI you choose, all **21 specialist agents, MCP servers (CodeGraph, DBHub, etc.), and Model Profiles** configured by this repository are automatically recognized and shared.

---

### Advanced: Customize Options Before Installing

If you want to toggle optional features (such as enabling `opencode-qoder-bridge` / `opencode-mem`, switching MCP servers like Serena / CodeGraph / DBHub, or changing the default agent) before running the installer:

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

