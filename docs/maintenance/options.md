# Installation & Options

Learn about installer commands, configuration options, token savings, and preserved fields.

---

## Commands

| Mode | PowerShell | Bash | What it does |
|---|---|---|---|
| Install (default) | `pwsh install/install.ps1` | `./install/install.sh` | Apply current manifest to target |
| Force reinstall | `pwsh install/install.ps1 install -Force` | `./install/install.sh install -f` | Re-apply same version |
| Status | `pwsh install/install.ps1 status` | `./install/install.sh status` | Show installed vs repo version |
| Generate manifest | `pwsh install/install.ps1 generate` | `./install/install.sh generate` | Scan repo, write manifest (no install) |
| Init (fresh start) | `pwsh install/install.ps1 init` | `./install/install.sh init` | Backup + clear entire target directory |
| Register global cmd | `pwsh install/install.ps1 register` | `./install/install.sh register` | Install `opencode-config` shim to `~/.local/bin` |
| Unregister global cmd | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | Remove the shim |

---

## Install Options (`options.jsonc`)

`install/options.jsonc` is the single source of truth for runtime options (MCP switches, external plugins, default agent, and the rtk compression proxy).

### Customizing Options Before Installing

1. **Enter the repository directory** (if cloned via Git or extracted from release archive):
   ```bash
   cd opencode-config
   ```
2. **Edit `install/options.jsonc`** to set desired switches (`true` / `false`):
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

### Modifying Options After Installation

Every install re-evaluates `install/options.jsonc` in place and enforces your choices onto `~/.config/opencode/opencode.jsonc`. To toggle any feature later:
1. Update `install/options.jsonc` in your local repository clone.
2. Re-run install with force flag (`install -Force` on PowerShell or `-f` on Bash) when the version is unchanged:
   ```powershell
   pwsh install/install.ps1 install -Force
   ```
   ```bash
   ./install/install.sh install -f
   ```

---

## Plugin Pre-warming Cache (Ensure-Plugins)

To avoid startup stalls during the first OpenCode launch caused by online package downloads, the installer auto-detects local package managers (`bun` > `npm` > `pnpm`) and pre-warms enabled external plugins into OpenCode's native cache directory (`~/.cache/opencode`).

- **Zero Config Directory Pollution**: Plugin caches reside strictly in OpenCode's data directory, keeping `~/.config/opencode` clean for manifest-based updates and uninstalls.
- **Graceful Fallback**: If no package manager is installed or the network is offline, the installer gracefully skips pre-warming without failing the installation. OpenCode will download them upon launch as usual.

---

## Token savings (rtk)

Install auto-provisions [rtk](https://github.com/rtk-ai/rtk) — a CLI proxy that compresses command output (git status, test runs, builds, ...) by 60-90% before it reaches the model.

If `rtk` is not on PATH, the installer downloads the pinned release into `~/.local/bin` (SHA256-verified, added to user PATH on Windows). The opencode hook ships in-tree as `plugins/openrtk.ts`.

To opt out: set `"rtk": false` in `install/options.jsonc` and re-run install.

---

## Preserved fields across reinstalls

When `opencode.jsonc` is overwritten by a new template, these fields are snapshotted from your existing config and restored afterwards:

| Field | Why |
|---|---|
| `provider.<name>.options.baseURL` | Your API endpoint |
| `provider.<name>.options.apiKey` | Your API key |
| `provider.<name>.models` | Your model definitions (custom model ids, user-added models) |
| `model` (root) | Your default-tier model pick |
| `agent.<name>.model` (per tier) | Your per-tier model assignments |

---

## Global command

After initial install, register the repo as a global `opencode-config` command:

```powershell
pwsh install/install.ps1 register
```

```bash
./install/install.sh register
```
