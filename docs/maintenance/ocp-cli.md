# OCP CLI Reference (`ocp` / `opencode-prime`)

After a one-time `register` (or a default install), the repo provisioned two global commands into `~/.local/bin`: `ocp` (3-letter quick form) and `opencode-prime` (full brand name). Both share the same dispatcher (`bin/opencode-prime` for bash, `bin/opencode-prime.ps1` for PowerShell 7+), so everything below works identically for each name.

> 💡 Since v0.8.0 the CLI doubles as a **runtime launcher**: running `ocp` with no arguments starts the OpenCode terminal UI instead of opening the installer dashboard. The dashboard is still one command away — `ocp dashboard`.

---

## Command List

| Command | Aliases | What it does |
| :--- | :--- | :--- |
| `ocp` *(no args)* | | Launch the **OpenCode terminal UI** (same as `ocp tui`) |
| `ocp tui` | | Launch the OpenCode terminal TUI (`exec opencode`); all extra args pass through to `opencode` |
| `ocp serve` | | Launch the headless OpenCode server (`opencode serve`); all extra args pass through (e.g. `ocp serve --port 4096`) |
| `ocp web` | | Launch the **OpenChamber web UI** (`openchamber serve`); auto-generates a `--ui-password`, auto-picks a free port starting at 3000 (see [port policy](#web-port-and-password-policy)) |
| `ocp desktop` | `ocp ui` | Launch the **OpenChamber native desktop app** (a separate download from [openchamber.dev/download](https://openchamber.dev/download)) |
| `ocp install` | | Apply the current version's manifest to the target (`~/.config/opencode` by default) |
| `ocp update` | | Check the suite (newest `install/VERSION` on `main` vs what is installed in `~/.config/opencode`) **and** the companion tools (`opencode`, `openchamber`). Every available update is selected by default — on an interactive terminal press Enter to apply it or `n` to skip it. Add `-y` to apply ALL pending updates without prompting (safe for scripts/cron); add `--check-only` to probe versions and apply nothing (this is also the default when run non-interactively without `-y`) |
| `ocp upgrade` | | Pull the latest release and re-apply the installer: `git pull --ff-only` for git clones, otherwise download `opencode-prime-latest.{tar.gz,zip}` from GitHub Releases (same source as the one-liner quick install; set `OCP_RELEASE_MIRROR` to a ghproxy-style prefix as fallback). Add `--force` to re-apply even when already up to date |
| `ocp init` | | Backup + clear the entire target directory for a fresh start |
| `ocp uninstall` | | Remove the installed version's manifest files from the target |
| `ocp status` | | Show installed vs repo version |
| `ocp generate` | | Regenerate `install/versions/<VERSION>.manifest.txt` from the current tree |
| `ocp register` | | Install global shims (`opencode-prime`, `ocp`) into `~/.local/bin` **and** ensure that directory is on your `PATH` |
| `ocp unregister` | | Remove the global shims from `~/.local/bin` |
| `ocp wizard` | `ocp menu` | Interactive TUI setup wizard (first-run and reconfigure flows) |
| `ocp dashboard` | `ocp cc`, `ocp matrix` | Single-screen TUI control center — toggle MCP servers / plugins / RTK, cycle agent model tiers, then install |
| `ocp session list` | | List sessions (passthrough to `opencode session list`) |
| `ocp session delete` | | Delete a session by ID (passthrough to `opencode session delete`) |
| `ocp session clean` | | Delete old sessions via `opencode session delete`. Usage: `ocp session clean --days 7 [--dry-run] [-y]` |
| `ocp version` | `ocp --version`, `ocp -v` | Print the repo's `install/VERSION` |
| `ocp help` | `ocp -h`, `ocp --help` | Print the command help |
| *(anything else)* | | Falls through to `install.ps1` / `install.sh`, so unknown flags and future subcommands keep working after an upgrade |

---

## Launcher Subcommands in Detail

### `ocp tui` — terminal UI

Requires `opencode` on PATH (the installer provisions it). Every argument after `tui` is passed to `opencode` verbatim:

```bash
ocp tui                     # plain terminal UI
ocp tui --version           # opencode's own --version
```

### `ocp serve` — headless server

Pure passthrough to `opencode serve`. Handy for ACP/HTTP clients that talk to a running engine:

```bash
ocp serve                   # opencode picks a random port by default
ocp serve --port 4096       # pin the port
```

### `ocp web` — OpenChamber web UI

Requires the `openchamber` CLI (auto-provisioned on install when `"openchamber": true` in `install/options.jsonc`; needs Node.js 22+). Behavior:

- **Fresh session**: if an OpenChamber instance is already running, it is stopped first (a fresh `--ui-password` launch would otherwise die on the occupied port and leak a useless password);
- **Password**: a random UI password is generated and printed (`🔑 OpenChamber web UI password: ...`) unless you pass your own `--ui-password`;
- Extra args pass through to `openchamber serve`.

```bash
ocp web                     # auto free port (starting at 3000) + generated password
ocp web --port 3200         # pin the port (reclaimed from zombie daemons when possible)
ocp web --ui-password s3cret # bring your own password
```

#### Web port and password policy

| Situation | What `ocp web` does |
| :--- | :--- |
| No `--port` / `-p` / `--port=N` given | Picks the first **free** port in `3000–3199` and injects it |
| `--port 0` (random) requested | Resolved to the first free port in `3000–3199` too |
| Explicit port busy (zombie daemon holding it) | Runs `openchamber stop --port <n>`, waits up to 5s, then force-kills the listener **only if** its command line proves it is an OpenChamber process. If the port still cannot be reclaimed: the `ocp` / `opencode-prime` dispatcher exits with the blocking PID so you can `taskkill` / `kill` manually, while the TS-engine path (`install.ps1 web`) falls back to the next free port |
| OpenChamber already running | Stops the running instance and starts a fresh session with a new password |

### `ocp desktop` (alias `ocp ui`) — native desktop app

The Tauri-based desktop app is not usually on `PATH`, so the launcher probes the common install locations (Windows: `%LOCALAPPDATA%\Programs`, `%LOCALAPPDATA%`, `Program Files*`; Linux: `~/.Applications`, `/usr/local/bin`, `/opt`; macOS: `open -a OpenChamber` via LaunchServices). If it cannot be found, the error message points you to <https://openchamber.dev/download> — the installer never downloads the desktop app; it only provisions the `openchamber` **CLI** that powers `ocp web`.

---

## Installer Subcommands

`install` / `update` / `upgrade` / `init` / `uninstall` / `status` / `generate` are thin wrappers over `install.ps1` / `install.sh` (the same TypeScript engine). Common flags that pass through:

| Flag | Aliases | Meaning |
| :--- | :--- | :--- |
| `-Target <dir>` | `--target`, `-t` | Override the install target directory (default `~/.config/opencode`) |
| `-Force` | `--force`, `-f` | Reapply every manifest file even if unchanged |
| `-BinDir <dir>` | | Custom directory for `register` / `unregister` shims (default `~/.local/bin`) |

```bash
ocp install                 # normal install / upgrade (credentials preserved)
ocp install -Force          # force reapply all files
ocp install -t ~/oc-test    # install into a scratch target
ocp register -BinDir ~/bin  # shims into a custom directory
```

### `register` and `unregister`

`register` now does two things: it writes the three shims into the bin directory, **and** makes sure that directory resolves in new terminals — by appending it to your user `PATH` (Windows registry, via `[Environment]::SetEnvironmentVariable` — never `setx`, so long PATH values are safe) or to your shell profile (`~/.zshrc`, `~/.bashrc` or `~/.profile`, guarded by a managed marker). `unregister` removes the shims; it does not touch your `PATH`.

### `ocp session` — session management

Unified session management surface. `list` and `delete` pass through to the `opencode` CLI verbatim; `clean` adds batch cleanup by date.

#### Passthrough commands

```bash
ocp session list                        # list recent sessions
ocp session list --format json -n 20    # JSON output, last 20
ocp session delete <sessionID>          # delete a specific session
```

#### `ocp session clean` — batch cleanup

Delete old sessions via the official `opencode session delete` CLI — no direct database access, all storage operations go through the engine. Requires `opencode` on PATH.

| Flag | Aliases | Meaning |
| :--- | :--- | :--- |
| `--days <n>` | `-d <n>` | Delete sessions older than *n* days (default: 7) |
| `--dry-run` | | Preview what would be deleted without actually deleting |
| `--include-subagents` | | Also delete subagent (child) sessions (default: excluded) |
| `-y`, `--yes` | | Skip the confirmation prompt |

```bash
ocp session clean --dry-run             # preview — what would be deleted?
ocp session clean --days 3              # delete sessions older than 3 days
ocp session clean --days 30 -y          # delete sessions older than 30 days, no prompt
ocp session clean -d 7 --include-subagents  # include subagent sessions
```

The command prints a summary before deleting: session count, age breakdown, token totals, and up to 10 sample session titles. Deletion is performed via `opencode session delete` (the official CLI), so all storage operations go through the engine — no direct database access.

---

## In-Session Companion: the `/ocp` Slash Command

Inside any OpenCode chat, the bundled `plugins/ocp` plugin exposes the same management surface without leaving the session:

| Command | Effect |
| :--- | :--- |
| `/ocp update` | Check whether a newer release is available (read-only, same as the CLI) |
| `/ocp upgrade` | Pull the latest release and re-apply the installer (same as the CLI) |
| `/ocp status` | Show installed vs repo version |
| `/ocp version` | Print the repo's `install/VERSION` |
| `/ocp` (or unknown) | Print the help text |

The command is handled entirely in-process — the LLM is never invoked, and the output appears directly in your chat as a user-visible message. To force-reapply the current manifest without a remote pull, run `ocp install -Force` in a terminal.

---

## Related Pages

- [Installation & Options](/maintenance/options) — installer commands, `options.jsonc` switches (including `global_commands` and `openchamber`), and preserved fields
- [Quick Install & Dashboard](/getting-started/) — first install and the TUI control center
- [Clients & UI Options](/getting-started/clients) — TUI / Web / Desktop surfaces side by side
