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
| Register global cmd | `pwsh install/install.ps1 register` | `./install/install.sh register` | Install `opencode-prime` and `ocp` shims to `~/.local/bin` |
| Unregister global cmd | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | Remove global shims |
| Launch TUI | `pwsh install/install.ps1 tui` | `./install/install.sh tui` | Launch the OpenCode terminal UI (`exec opencode`) |
| Launch desktop | `pwsh install/install.ps1 desktop` | `./install/install.sh desktop` | Launch the OpenChamber native desktop app (alias `ui`) |
| Launch web UI | `pwsh install/install.ps1 web` | `./install/install.sh web` | Launch the OpenChamber web UI (`openchamber --ui-password <generated>`) |

---

## Install Options (`options.jsonc`)

`install/options.jsonc` is the single source of truth for runtime options (MCP switches, external plugins, default agent, and the rtk compression proxy).

### Customizing Options Before Installing

1. **Enter the repository directory** (if cloned via Git or extracted from release archive):
   ```bash
   cd opencode-prime
   ```
2. **Edit `install/options.jsonc`** to set desired switches (`true` / `false`):
   ```jsonc
   // install/options.jsonc
   {
     // register global command shims (ocp / opencode-prime)
     // into ~/.local/bin and add that directory to the user PATH during install
     "global_commands": true,
     // rtk output compression (60-90% token savings)
     "rtk": true,
     // OpenChamber web UI CLI (auto-installs the `openchamber` CLI when missing;
     // powers `ocp web` — the native desktop app for `ocp desktop` / `ocp ui` is a separate download)
     "openchamber": true,
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
       "dbhub": true,
       // JetBrains IDE bridge (enable MCP Server in IDE: Settings → Tools → MCP Server)
       "idea": true
     },
     // External npm plugin switches (true: enabled; false: disabled)
     "plugin": {
       // Lazy coding protocol: build what was asked, name the lazier alternative
       "@dietrichgebert/ponytail": true,
       // Injects Qoder provider/models via official SDK (needs qoder login)
       "opencode-qoder-bridge": false,
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

## OpenChamber (`ocp desktop` / `ocp web`)

Install auto-provisions [OpenChamber](https://openchamber.dev) — the desktop / web GUI that runs on top of the local OpenCode engine (side-by-side diffs, multi-model comparison, session timeline).

With `"openchamber": true` (default), the installer installs the `@openchamber/web` package globally via the first package manager found (pnpm > bun > yarn > npm) when the `openchamber` binary is missing — this CLI powers the **web UI**. The **native desktop app** behind `ocp desktop` / `ocp ui` is a separate download from <https://openchamber.dev/download>. Launch afterwards with:

```bash
ocp desktop      # native desktop app (alias: ocp ui)
ocp web          # OpenChamber web UI (auto-generates a --ui-password)
ocp tui          # the OpenCode terminal UI
```

To opt out: set `"openchamber": false` in `install/options.jsonc` and re-run install (an already-installed binary stays put). The native desktop app from [openchamber.dev/download](https://openchamber.dev/download) is never touched by the installer.

---

## Preserved fields across reinstalls

When `opencode.jsonc` is overwritten by a new template, these fields are snapshotted from your existing config and restored afterwards:

| Field | Why |
|---|---|
| `provider.<name>.options.baseURL` | Your API endpoint |
| `provider.<name>.options.apiKey` | Your API key |
| `provider.<name>.models` | Your model definitions (custom model ids, user-added models) |
| `model` (root) | Your standard-tier model pick |
| `agent.<name>.model` (per tier) | Your per-tier model assignments |

---

## Global commands (`ocp` / `opencode-prime`)

After initial install, register the repo to provision global command shortcuts (`ocp`, `opencode-prime`):

```powershell
pwsh install/install.ps1 register
```

```bash
./install/install.sh register
```

Once registered, `ocp` also acts as the runtime launcher: `ocp` (or `ocp tui`) starts the OpenCode terminal UI, `ocp desktop` (alias `ocp ui`) starts the OpenChamber desktop GUI, and `ocp web` serves the OpenChamber web UI on localhost with a generated `--ui-password`.

To opt out of automatic shim registration during install, set `"global_commands": false` in `install/options.jsonc` — the standalone `register` / `unregister` actions above remain available regardless.

👉 The complete command list, launcher semantics (port & password policy for `ocp web`), and the in-session `/ocp` slash command are documented in the dedicated [OCP CLI Reference](/maintenance/ocp-cli).
