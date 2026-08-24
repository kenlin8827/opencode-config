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

`install/options.jsonc` is the single source of truth for runtime options. Edit this file and re-run install (`install -Force` when version is unchanged):

```jsonc
// install/options.jsonc
{
  // rtk output compression (60-90% token savings)
  "rtk": true,
  // Primary agent on start: code (default) / build / plan
  "default_agent": "code",
  // MCP server switches (missing CLIs auto-provisioned on install)
  "mcp": {
    "serena": true,
    "codegraph": true,
    "gitnexus": false,
    "dbhub": true
  },
  // External npm plugin switches
  "plugin": {
    "@dietrichgebert/ponytail": true,
    "opencode-qoder-bridge": true,
    "@frankhommers/opencode-smart-title": true,
    "opencode-mem@2.24.3": false
  }
}
```

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
