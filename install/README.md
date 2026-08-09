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
# Interactive (pick providers, then pick a model per tier):
pwsh install/config.ps1

# Scripted (target the default `llm-router` provider; use -p <name> for others):
pwsh install/config.ps1 set baseURL https://router.example.com/v1
pwsh install/config.ps1 set apiKey  sk-xxxx
pwsh install/config.ps1 set model  advisor my-advisor-v2
pwsh install/config.ps1 profile                        # numbered menu, pick one to apply
pwsh install/config.ps1 profile list                   # list presets in install/profiles/
pwsh install/config.ps1 profile apply opencode-go-balanced
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
./install/config.sh profile                            # numbered menu, pick one to apply
./install/config.sh profile list                       # list presets in install/profiles/
./install/config.sh profile apply opencode-go-balanced
./install/config.sh reset
```

The interactive flow in both versions works the same way:

1. Multi-select providers (e.g. `1 3`). The list is the union of
   `opencode models` (CLI-authenticated) and `llm-router` (custom provider
   defined in `opencode.jsonc`, not in models.dev). `0` or Enter keeps all.
2. For each tier defined in the repo template, pick a model from the
   selected providers' models only. Empty input keeps the current value,
   even when it belongs to a provider that wasn't selected (a note is
   shown in that case).

`baseURL` / `apiKey` for `llm-router` are prompted right after provider
selection when `llm-router` is among the selected providers, before the
tier model picks. Every agent of a tier gets rewritten to the
chosen `provider/model_id` in lockstep.

Non-interactive `set` commands target a single provider (default
`llm-router`, override with `-p <name>`) and edit one field at a time.
`reset` restores that provider's `baseURL` / `apiKey` / model ids from the
repo template.

## Profiles

A profile is a named preset bundling a provider with a per-tier model pick,
applied in one shot instead of one `set model` per tier. Bare `profile`
shows a numbered menu — pick a number to apply it (Enter/`0` cancels):

```pwsh
pwsh install/config.ps1 profile                 # same on bash: ./install/config.sh
pwsh install/config.ps1 profile list            # plain listing, no prompt
pwsh install/config.ps1 profile apply <name>    # scripted, no prompt
```

Profiles live in `install/profiles/<name>.json`:

```json
{
  "description": "human-readable summary shown by `profile list`",
  "tiers": {
    "default": "opencode-go/kimi-k3",
    "code": "opencode-go/kimi-k2.7-code",
    "advisor": "opencode-go/gpt-5.6-luna"
  }
}
```

Semantics:

- Tier values are full `<provider>/<model_id>` refs, applied verbatim.
- A profile is **single-provider**: every ref must share the same provider
  part — mixed providers (or refs missing `/`) are rejected. Split mixed
  setups into separate profiles.
- Tiers not listed by the profile are left untouched (e.g. the bundled
  `opencode-go-*` profiles omit `vision` — it needs a multimodal pick).
- Unknown tier names in a profile are rejected; every agent of a tier is
  rewritten in lockstep, and the root `model` tracks the `default` tier.
- Apply validates everything up front per tier and backs up the target
  (`opencode.jsonc.bak`) before writing, same as `set`.

Bundled profiles: `llm-router` (template baseline, equivalent to `reset`),
`opencode-go-balanced`, `opencode-go-budget`.

## Files

| Path                                  | Role                                |
| ------------------------------------- | ----------------------------------- |
| `install/VERSION`                     | Current version string (first line) |
| `install/versions/<ver>.manifest.txt` | One repo-relative path per line     |
| `<target>/.CONFIG_VERSION`            | Records the active version          |

## What gets shipped

The manifest whitelists exactly the paths opencode reads at runtime:

| Path             | Why                                           |
| ---------------- | --------------------------------------------- |
| `agents/`        | Agent definitions (20 files)                  |
| `commands/`      | Slash commands (4 files)                      |
| `plugins/`       | TypeScript plugins (12 files)                 |
| `instructions/`  | Shared protocols injected into all agents     |
| `opencode.jsonc` | Main config                                   |

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

When the manifest contains `opencode.jsonc`, both scripts snapshot the user's
state from the target file **before** overwriting it with the repo template,
then write it back afterwards:

| Field                      | Why preserved                         |
| -------------------------- | ------------------------------------- |
| `provider.<name>.options.baseURL` | User's API endpoint          |
| `provider.<name>.options.apiKey`  | User's API key (secret)      |
| `model` (root)             | User's model pick for `tier.default`  |
| `agent.<name>.model`       | User's per-tier model picks           |

Model picks are preserved **per tier** (the same semantics `config.ps1` /
`config.sh` use — every agent of a tier shares one `provider/model_id` ref):
a reinstall rewrites all agents of a tier to the user's ref, including agents
that the newer template added. Tiers with no prior pick keep the template
default. To discard the preserved picks, run `config.ps1 reset`.

Everything else in `opencode.jsonc` is overwritten from the repo. To add more
preserved credential fields, extend `$preserveJsonKeys` (PowerShell) or
`PRESERVE_KEYS` (Bash).

**Note on the shipped template.** The repo's `opencode.jsonc` ships with
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