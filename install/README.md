# install

Self-installing opencode config. Each tagged version carries a file manifest;
install removes the previous manifest's files from the target and overwrites
them with the current manifest's files.

## Usage (PowerShell — Windows default)

```pwsh
# 1. Edit install/VERSION (one line).
# 2. Apply (manifest for the new version is auto-generated if missing):
pwsh install/install.ps1 -Mode Install

# Force re-apply, or just check state:
pwsh install/install.ps1 -Mode Install -Force
pwsh install/install.ps1 -Mode Status

# Generate the manifest for the current VERSION without installing:
pwsh install/install.ps1 -Mode Generate
```

Default target is `~/.config/opencode`. To test without touching your real
config, point `-Target` at a scratch directory:

```pwsh
$tmp = Join-Path $env:TEMP "opencode-test-$(Get-Random)"
pwsh install/install.ps1 -Mode Install -Target $tmp
Get-ChildItem -Force $tmp
Remove-Item -Recurse -Force $tmp
```

## Usage (Bash — macOS / Linux / WSL / Git Bash)

Requires `jq`. Install with `sudo apt install jq` or `brew install jq`.

```bash
# 1. Edit install/VERSION.
# 2. Apply:
./install/install.sh

# Force, status, generate, custom target:
./install/install.sh -f
./install/install.sh status
./install/install.sh generate
./install/install.sh install -t /path/to/target
```

## Configuring credentials (PowerShell)

```pwsh
# Interactive (prompts for all 7 fields, Enter=skip):
pwsh install/config.ps1

# Scripted:
pwsh install/config.ps1 set baseURL https://router.example.com/v1
pwsh install/config.ps1 set apiKey  sk-xxxx
pwsh install/config.ps1 set model  advisor my-advisor-v2
pwsh install/config.ps1 get
pwsh install/config.ps1 reset
```

## Configuring credentials (Bash)

```bash
./install/config.sh                              # interactive
./install/config.sh get
./install/config.sh set baseURL https://router.example.com/v1
./install/config.sh set apiKey sk-xxxx
./install/config.sh set model advisor my-advisor-v2
./install/config.sh reset
```

Both versions edit only `provider.llm-router.options.{baseURL,apiKey}` and
`provider.llm-router.models.<name>.id`. Press Enter / pass empty value to
skip a field.

## Files

| Path                                  | Role                                |
| ------------------------------------- | ----------------------------------- |
| `install/VERSION`                     | Current version string (first line) |
| `install/versions/<ver>.manifest.txt` | One repo-relative path per line     |
| `<target>/.CONFIG_VERSION`            | Records the active version          |

## What gets shipped

The manifest whitelists exactly the paths opencode reads at runtime:

| Path           | Why                                           |
| -------------- | --------------------------------------------- |
| `agents/`      | Agent definitions (20 files)                  |
| `commands/`    | Slash commands (4 files)                      |
| `plugins/`     | TypeScript plugins (12 files)                 |
| `opencode.json`| Main config                                   |

Everything else stays in the repo and never reaches the target:

| Path            | Reason                                    |
| --------------- | ----------------------------------------- |
| `.git/`         | VCS metadata — not part of the config     |
| `node_modules/` | Dependency cache — not part of the config |
| `.metrics/`     | Runtime metrics — not part of the config  |
| `install/`      | This installer and its manifests          |
| `tests/`        | Test scripts — not part of the config     |
| `package.json`, `bun.lock`, `package-lock.json` | npm metadata — not needed by opencode |
| `tsconfig.json` | TS build config — not needed at runtime   |
| `tui.json`      | TUI tweak kept locally only               |
| `.gitignore`, `README.md` | Repo metadata — not config          |

In particular, **`.git/` is never copied to the target** — the target should
be a clean config directory, not a working copy.

## How cleanup works

`.CONFIG_VERSION` holds the active version string (single line, no newline).
On the next install, the script reads it, looks up
`install/versions/<that>.manifest.txt`, deletes each entry from the target,
then copies the current manifest and rewrites `.CONFIG_VERSION`. To uninstall
a version manually, delete `<target>/.CONFIG_VERSION`.

`.CONFIG_VERSION` itself is never deleted by the script (even if an old
manifest listed it) — it is always rewritten at the end of each install.

## Preserved fields

When the manifest contains `opencode.json`, both scripts preserve any
user-supplied credentials under `provider.*.options`:

| Field                      | Why preserved                         |
| -------------------------- | ------------------------------------- |
| `provider.<name>.options.baseURL` | User's API endpoint          |
| `provider.<name>.options.apiKey`  | User's API key (secret)      |

Everything else in `opencode.json` is overwritten from the repo. To add more
preserved fields, extend `$preserveJsonKeys` (PowerShell) or `PRESERVE_KEYS`
(Bash).

**Note on the shipped template.** The repo's `opencode.json` ships with
`{env:LLM_ROUTER_BASE_URL}` / `{env:LLM_ROUTER_API_KEY}` as
[opencode-style env-var substitution tokens](https://opencode.ai/docs/providers#environment-variables).
This is the **recommended** setup: keep the token in the config, set the
real values in your shell environment, and never commit a real key. The
preservation logic simply round-trips the token through every reinstall.

If you prefer hardcoded values over env vars, use
`config.ps1 set apiKey sk-...` once to replace the token with a literal.
The script will preserve that literal across future reinstalls, so a
literal key is never silently overwritten.

## Scripts

| Script             | Language   | Purpose                                    |
| ------------------ | ---------- | ------------------------------------------ |
| `install.ps1`      | PowerShell | Install / generate / status                |
| `install.sh`       | Bash 4+    | Same, with `jq` for JSON                   |
| `config.ps1`       | PowerShell | Set / get / reset credentials + model IDs  |
| `config.sh`        | Bash 4+    | Same, with `jq`                            |

The two implementations share the same contract — same manifest format, same
preserved fields, same default target — but are tested independently. If you
find a behavioural drift, file it.