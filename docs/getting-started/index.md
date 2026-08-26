# Quick Install & Dashboard

A production-ready [OpenCode](https://opencode.ai) configuration for real-world software engineering: a team of specialist agents behind three orchestrator modes, layered MCP code intelligence and database gateway, one-shot model profiles, workflow slash commands, and optional per-project guardrails — installed into `~/.config/opencode` with a single command.

---

## ⚡ 10-Second Quick Install

Install directly to `~/.config/opencode` with a single command (no Git clone required):

### macOS / Linux / WSL
```bash
curl -fsSL https://github.com/kenlin8827/opencode-prime/releases/latest/download/opencode-prime-latest.tar.gz -o /tmp/ocp.tar.gz && tar xzf /tmp/ocp.tar.gz -C /tmp && bash /tmp/opencode-prime-*/install/install.sh
```

### Windows (PowerShell)
```powershell
$url = "https://github.com/kenlin8827/opencode-prime/releases/latest/download/opencode-prime-latest.zip"; Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\ocp.zip"; Expand-Archive -Path "$env:TEMP\ocp.zip" -DestinationPath "$env:TEMP\ocp" -Force; & (Get-ChildItem "$env:TEMP\ocp\opencode-prime-*\install\install.ps1").FullName
```

> 💡 **Zero-Risk Upgrades**: Re-running the command above smoothly upgrades to the latest release while **preserving** all your API keys, custom models, and tier assignments.

---

## Single-Screen TUI Control Center

Running the install command (or running the global command `ocp` / `opencode-prime` anytime later) directly opens the **Single-Screen TUI Control Center**:

![OpenCode TUI Panoramic Dashboard](/images/tui-dashboard-en.webp)

### Key Capabilities & Keyboard Shortcuts

- **Instant Customization**: Press Space to toggle MCP servers, plugins, RTK optimizer, or cycle Agent-to-Tier model assignments (`flash` / `standard` / `pro` / `max` / `vision`);
- **Keyboard Navigation**:
  - `↑` / `↓` or `j` / `k`: Navigate through rows
  - `Space`: Toggle MCP/plugin or cycle agent model tier
  - `Enter`: Execute the selected action (e.g. "Save & Execute Install")
  - `L` key: Instant language switch (English / 中文)
  - `Q` key: Exit dashboard

---

## Open Dashboard Anytime (`ocp` / `opencode-prime`)

After installation, the global shortcuts are automatically registered. You can run any of them from **any terminal directory**:

```bash
ocp              # 3-letter quick direct access (recommended)
opencode-prime   # Official full suite command
opencode-config  # Backward-compatible alias
```

You can now adjust settings or perform one-click seamless upgrades anytime without worrying about install paths!

---

## Core Feature Matrix

| Feature | What it means for you |
|---|---|
| **Specialist Agent Team** | 21 specialists (`@java-dev`, `@security`, `@dba`, `@frontend-dev`, `@fast-coder`, etc.) tuned with domain-specific prompts, routed automatically |
| **Three Working Modes** | `@code` (direct development, default), `@build` (orchestrated execution), `@plan` (read-only analysis) — switchable in `install/options.jsonc` |
| **Code Intelligence & DB (MCP)** | Pre-configured MCP servers (Serena LSP, CodeGraph knowledge graph, GitNexus, DBHub gateway) with automatic CLI provisioning |
| **Profiles** | `/profile` maps all 5 model tiers to a provider's models in one shot — no per-agent `set model` |
| **Workflow Slash Commands** | `/review-fix-loop`, `/goal`, `/handoff`, `/grill-me`, `/advisor` modes, and more |
| **Optional Guardrails** | Per-project ADR enforcement (`/adr-guard`), secret-file gate (`env-guard`), E2E gate (`/e2e-guard`), commit discipline (`/project`) — all default off |
| **One-Command Installer** | PowerShell + Bash, manifest-based upgrades; your credentials and model picks survive every reinstall |
| **Token Savings** | [rtk](https://github.com/rtk-ai/rtk) output compression (60–90%) auto-provisioned on install |
| **Second-Opinion Advisor** | `@advisor` for blocking decisions, with an adversarial red-team stance for design review |

---

## ⚖️ Comparison Matrix (Why choose OpenCode Prime?)

| Feature / Dimension | Vanilla OpenCode | Oh My OpenCode (`omo.dev`) | **OpenCode Prime (`OCP`)** |
| :--- | :--- | :--- | :--- |
| **Core Philosophy** | Minimal single-session coding | Autonomous black-box delegation | **Production engineering discipline + Tiered control** |
| **Quick Tweaks / Bug Fixes** | ✅ Fast (Single model) | ⚠️ Slow (Heavy multi-agent breakdown) | ⚡ **`/quick-dev` Zero-delegation fast track** |
| **Agile Feature Delivery** | ⚠️ No built-in review loop | ⚠️ Long chains, risk of stuck loops | 🚀 **`/fast-dev` Agile single-review loop** |
| **Architectural Refactoring** | ❌ No multi-model review | ⚠️ Lacks independent arbitration | 🧠 **`/deep-dev` Flagship dual-review + Safety arbitration** |
| **Token Cost & Predictability** | 🟢 Low | 🔴 High (15k–25k startup overhead) | 🟢 **Controlled (Tier 1/2/3 governance + RTK compression)** |
| **Code Intelligence** | Basic text search / grep | Heavy whole-context injection | 🧭 **Serena (LSP symbols) + CodeGraph (call paths) + DBHub** |
| **Engineering Guardrails** | ❌ None | ❌ Weak (Relies on model self-discipline) | 🛡️ **ADR enforcement + Secret-file gate + Commit discipline** |
| **Environment & Management** | Manual JSON editing | Manual JSONC maintenance | 🖥️ **Interactive Single-Screen TUI + Hot-reloading profiles** |
| **Upgrade Safety** | Manual file replacement | Script re-execution | 🔄 **Zero-Risk in-place upgrade (Keys & profiles preserved)** |

### 🎯 When to choose which?
* **Choose Vanilla OpenCode**: When you only need lightweight inline autocompletion and simple, single-turn conversational edits.
* **Choose `omo.dev`**: When you prefer fully autonomous black-box task delegation and are unconcerned with high token consumption or startup latency.
* **Choose OpenCode Prime**: When you build **real-world commercial software** requiring high delivery velocity, predictable token costs, strict code quality guardrails, and deep LSP/graph-backed code intelligence.

---

## Next Step: Project Initialization

After installing the global configuration, **the recommended first step whenever entering a specific code repository is running `/project init`**:

👉 **Read Guide: [Project Initialization & Guardrails](/getting-started/project-init)**
