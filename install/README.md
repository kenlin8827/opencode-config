# install

Self-installing opencode config. Each tagged version carries a file manifest;
install removes the previous manifest's files from the target and overwrites
them with the current manifest's files.

## Usage (PowerShell — Windows default)

```pwsh
# 1. Edit install/VERSION (one line).
# 2. Apply (manifest for the new version is auto-generated if missing):
pwsh install/install.ps1

# Force re-apply, or just check state:
pwsh install/install.ps1 install -Force
pwsh install/install.ps1 status

# Generate the manifest for the current VERSION without installing:
pwsh install/install.ps1 generate

# Backup + clear the entire target directory (fresh start):
pwsh install/install.ps1 init
pwsh install/install.ps1 init -NoBackup   # clear without backup
pwsh install/install.ps1 init -Yes       # skip confirmation prompt
```

Default target is `~/.config/opencode`. To test without touching your real
config, point `-Target` at a scratch directory:

```pwsh
$tmp = Join-Path $env:TEMP "opencode-test-$(Get-Random)"
pwsh install/install.ps1 install -Target $tmp
Get-ChildItem -Force $tmp
Remove-Item -Recurse -Force $tmp
```

## Usage (Bash — macOS / Linux / WSL / Git Bash)

Requires `jq`. Install with `sudo apt install jq` or `brew install jq`.

```bash
# 1. Edit install/VERSION.
# 2. Apply:
./install/install.sh

# Force, status, generate, custom target, init:
./install/install.sh -f
./install/install.sh status
./install/install.sh generate
./install/install.sh install -t /path/to/target
./install/install.sh init               # backup + clear target
./install/install.sh init --no-backup    # clear without backup
./install/install.sh init -y            # skip confirmation prompt

# Global command:
./install/install.sh register
./install/install.sh register --bin-dir ~/bin
./install/install.sh unregister
```

## Global command

After installing the files, register the repo as a global `opencode-config`
command so you can run it from any directory.

PowerShell:

```pwsh
pwsh install/install.ps1 register              # shim to ~/.local/bin
pwsh install/install.ps1 register -BinDir C:\Tools\bin  # custom location
pwsh install/install.ps1 unregister            # remove shim
```

Bash:

```bash
./install/install.sh register
./install/install.sh register --bin-dir ~/bin
./install/install.sh unregister
```

`register` writes a tiny trampoline that re-executes the in-repo dispatcher
(`bin/opencode-config.ps1` on PowerShell, `bin/opencode-config` on Bash), so
`git pull` updates the command immediately. It will refuse to overwrite a file
it didn't create.

Add `~/.local/bin` to your user PATH, then run:

```pwsh
# PowerShell
[Environment]::SetEnvironmentVariable('Path', "$env:Path;$HOME\.local\bin", 'User')
# then in a fresh session:
opencode-config status
opencode-config install -Force
```

```bash
# bash/zsh
export PATH="$HOME/.local/bin:$PATH"
# then:
opencode-config status
opencode-config update
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
pwsh install/config.ps1 profile list                   # list presets in profiles/
pwsh install/config.ps1 profile apply opencode-go-performance
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
./install/config.sh profile list                       # list presets in profiles/
./install/config.sh profile apply opencode-go-performance
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

Profiles live in `profiles/<name>.json`:

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
- Tiers not listed by a profile are left untouched; all bundled profiles
  cover all five tiers, `vision` included.
- Unknown tier names in a profile are rejected; every agent of a tier is
  rewritten in lockstep, and the root `model` tracks the `default` tier.
- Apply validates everything up front per tier and backs up the target
  (`opencode.jsonc.bak`) before writing, same as `set`.

Bundled profiles.
Cost tiers mirror the IDE model-tier vocabulary (Auto / Ultimate / Performance / Economy / Lightweight).
Every opencode-go profile fills `vision`: on this gateway only Qwen accepts
image input, so all opencode-go profiles route vision to `qwen3.8-max`
(mixed families, same provider). Official provider profiles that lack an
image-capable model (GLM, DeepSeek) omit the `vision` tier.

### Tier design principles

The tier-to-model assignment follows a strict quality ladder:

```
explorer  (cheapest/fastest)  <  default  (second-highest)  <  code  (strongest coding)  <=  advisor  (absolute flagship)
```

- **`default` = second-highest**, NOT the cheapest. The default tier drives 6 agents
  (build, plan, architect, security, researcher, tech-writer) — orchestration and
  architecture analysis need strong reasoning. Use the flagship's previous-gen or
  non-pro variant (e.g. qwen3.7-max not qwen3.6-plus, glm-5.1 not glm-4.7).
- **`advisor` = absolute flagship.** Must be >= `code` in quality. Never put a weaker
  model in advisor than code (quality inversion).
- **`code` = strongest coding model.** Prefer codex/coder variants when available.
- **`explorer` = cheapest/fastest variant.** Use flash/turbo/highspeed/lite/mini.
- **`vision` = any model with `attachment: true` + image input.**
- When a provider has <= 2 models, tiers can share — but `advisor` always gets the strongest.

| Profile | Tier | default / code / advisor / explorer / vision |
| --- | --- | --- |
| `llm-router` | Auto — server-side routing baseline (equivalent to `reset`) | its five router slots |
| `opencode-go-ultimate` | Ultimate — quality first, cost no object | kimi-k3 / minimax-m3 / gpt-5.6-luna / kimi-k2.6 / qwen3.8-max |
| `opencode-go-performance` | Performance — daily driver | kimi-k2.6 / kimi-k2.7-code / gpt-5.6-luna / deepseek-v4-flash / qwen3.8-max |
| `opencode-go-economy` | Economy — cost-performance | kimi-k2.6 / kimi-k2.7-code / glm-5.2 / deepseek-v4-flash / qwen3.8-max |
| `opencode-go-lite` | Lightweight — cheapest usable | qwen3.7-plus / mimo-v2.5-pro / glm-5.2 / mimo-v2.5 / qwen3.8-max |
| `opencode-go-qwen` | All-Qwen family fallback | qwen3.7-max / qwen3.8-max / qwen3.8-max / qwen3.6-plus / qwen3.8-max |
| `opencode-go-kimi` | All-Kimi family fallback | kimi-k2.6 / kimi-k2.7-code / kimi-k3 / kimi-k2.6 / qwen3.8-max |
| `kimi-for-coding` | Kimi For Coding (official Kimi Code plan) | kimi-for-coding / kimi-for-coding / k3-256 / kimi-for-coding-highspeed / kimi-for-coding |
| `zai-coding-plan` | Z.AI Coding Plan (official GLM subscription) | glm-5-turbo / glm-5.2 / glm-5.2 / glm-5.2-highspeed / — |
| `deepseek` | DeepSeek (official DeepSeek API) | deepseek-chat / deepseek-v4-pro / deepseek-v4-pro / deepseek-v4-flash / — |
| `anthropic` | Anthropic (official Anthropic API) | claude-haiku-4-5 / claude-sonnet-5 / claude-opus-5 / claude-haiku-4-5 / claude-sonnet-5 |
| `google` | Google (official Vertex AI / Gemini API) | gemini-2.5-flash / gemini-3-pro-preview / gemini-2.5-pro / gemini-flash-lite-latest / gemini-2.5-flash |
| `openai` | OpenAI (official OpenAI API) | gpt-5.5 / gpt-5.3-codex / gpt-5.6-pro / gpt-5.4-fast / gpt-4o |
| `alibaba-coding-plan` | Alibaba Coding Plan (official) | qwen3.7-plus / qwen3-coder-next / MiniMax-M2.5 / qwen3.7-plus / qwen3.7-plus |
| `alibaba-coding-plan-cn` | Alibaba Coding Plan China (official) | qwen3.7-plus / qwen3-coder-next / MiniMax-M2.5 / qwen3.7-plus / qwen3.7-plus |
| `alibaba-token-plan` | Alibaba Token Plan (official) | deepseek-v4-flash-0731 / qwen3.8-max / qwen3.8-max / deepseek-v4-flash-0731 / qwen3.7-plus |
| `alibaba-token-plan-cn` | Alibaba Token Plan China (official) | deepseek-v4-flash-0731 / qwen3.8-max / qwen3.8-max / deepseek-v4-flash-0731 / qwen3.7-plus |
| `minimax-coding-plan` | MiniMax Token Plan minimax.io (official) | MiniMax-M2.7-highspeed / MiniMax-M3 / MiniMax-M3 / MiniMax-M2.7-highspeed / MiniMax-M3 |
| `minimax-cn-coding-plan` | MiniMax Token Plan minimaxi.com (official) | MiniMax-M2.7-highspeed / MiniMax-M3 / MiniMax-M3 / MiniMax-M2.7-highspeed / MiniMax-M3 |
| `zhipuai-coding-plan` | Zhipu AI Coding Plan (official) | glm-5.1 / glm-5.2 / glm-5.2 / glm-5.2-highspeed / glm-5v-turbo |
| `tencent-coding-plan` | Tencent Coding Plan (official) | hunyuan-turbos / tc-code-latest / minimax-m2.5 / hunyuan-turbos / kimi-k2.5 |
| `tencent-token-plan` | Tencent Token Plan (official) | hy3 / hy3 / hy3 / hy3 / — |
| `xiaomi-token-plan-cn` | Xiaomi Token Plan China (official) | mimo-v2.5-pro / mimo-v2.5-pro / mimo-v2.5-pro / mimo-v2.5 / mimo-v2.5 |
| `xiaomi-token-plan-ams` | Xiaomi Token Plan Europe (official) | mimo-v2.5-pro / mimo-v2.5-pro / mimo-v2.5-pro / mimo-v2.5 / mimo-v2.5 |
| `xiaomi-token-plan-sgp` | Xiaomi Token Plan Singapore (official) | mimo-v2.5-pro / mimo-v2.5-pro / mimo-v2.5-pro / mimo-v2.5 / mimo-v2.5 |
| `opencode-go-deepseek` | All-DeepSeek family fallback | deepseek-v4-flash / deepseek-v4-pro / deepseek-v4-pro / deepseek-v4-flash / qwen3.8-max |
| `opencode-go-glm` | All-GLM family fallback | glm-5.1 / glm-5.2 / glm-5.2 / glm-5.1 / qwen3.8-max |

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

## Init mode (fresh start)

`init` (PowerShell and Bash) backs up the entire target directory
to a timestamped sibling (`~/.config/opencode.backup.YYYYMMDD-HHMMSS`), then
clears everything inside it — a clean slate for a fresh install.

```pwsh
pwsh install/install.ps1 init             # backup + clear
pwsh install/install.ps1 init -NoBackup   # clear without backup
pwsh install/install.ps1 init -Yes         # skip confirmation
```

```bash
./install/install.sh init               # backup + clear
./install/install.sh init --no-backup    # clear without backup
./install/install.sh init -y            # skip confirmation
```

After `init`, run `install` to reinstall config files,
then `config.ps1` / `config.sh` to set credentials and model picks.

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

| Script             | Language   | Purpose                                      |
| ------------------ | ---------- | -------------------------------------------- |
| `install.ps1`      | PowerShell | Install / generate / status / init / register |
| `install.sh`       | Bash 4+    | Same, with `jq` for JSON                     |
| `config.ps1`       | PowerShell | Set / get / reset credentials + model IDs    |
| `config.sh`        | Bash 4+    | Same, with `jq`                              |

The two implementations share the same contract — same manifest format, same
preserved fields, same default target — but are tested independently. If you
find a behavioural drift, file it.

## Model name verification principle

**DO NOT GUESS provider model names** based on internal knowledge or naming
patterns. Every `provider/model_id` in a profile **must reference a real,
current model on the provider's official API**. If you cannot verify the
model_id via the provider's official documentation, do not invent it.

If you add a new provider profile (e.g. `anthropic.json`), always:

1. Visit the provider's official API docs (e.g. [Anthropic API models doc](https://docs.anthropic.com/en/docs/about-models)).
2. Copy the exact model_id from the official list.
3. If the provider only supports one model family (e.g. `claude-3-haiku`),
   reference those in your comment and omit speculative versions.
4. Record your research in a TODO and update README or TODO as needed, with links and model names.