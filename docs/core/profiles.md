# Configuration & Profiles

Configure AI model providers, routing tiers, and one-shot presets inside OpenCode.

---

## Provider setup inside opencode (recommended)

For existing providers (such as official DeepSeek, Kimi, Qwen APIs, not self-hosted LLM routers), configure through OpenCode slash commands:

```
/connect <provider-name>    # connect to existing provider
/profile                    # open the profile picker dialog
```

**Configuration Flow:**

1. **Connect Provider** — Use `/connect` command to connect to an existing provider
2. **Select Profile** — Use `/profile` to open the picker dialog and select the corresponding configuration profile

**Example:**

```
> /connect deepseek
  → Connect to DeepSeek provider
> /profile
  → Dialog opens — pick the "deepseek" entry to apply the official API profile
```

**Important:** After configuration is complete, please exit the current opencode session and re-enter to ensure the new provider and profile configurations take full effect.

---

## Profiles

A profile is a named preset that maps all model tiers to a specific provider's models in one shot, rather than setting each tier individually.

### Available profiles

| Profile | Description |
|---|---|
| `llm-router` | Server-side routing baseline |
| `codex-router` | Self-hosted codex gateway (Sol/Luna series) |
| `qoder-router` | Self-hosted qoder gateway (Ultimate/Performance/Lite) |
| `claude-code-router` | Self-hosted Claude Code gateway (Anthropic protocol, Fable/Opus/Sonnet/Haiku series) |
| `antigravity-router` | Self-hosted Antigravity gateway (Gemini Flash/Pro + Claude Sonnet/Opus Thinking + GPT-OSS) |
| `qoder` | Qoder subscription via opencode-qoder-bridge (official Qoder Agent SDK; needs `qoder login`) |
| `qoder-deepseek` | Full DeepSeek lineup alternative on Qoder (dmodel = DeepSeek-V4-Pro, dfmodel = DeepSeek-V4-Flash) |
| `qoder-qwen` | Full Qwen lineup alternative on Qoder (qmodel_preview = Qwen3.8-Max-Preview, qmodel_latest = Qwen3.7-Max, qmodel = Qwen3.7-Plus) |
| `opencode-go-ultimate` | Quality first, cost no object |
| `opencode-go-performance` | Daily driver |
| `opencode-go-economy` | Balanced price/performance |
| `opencode-go-lite` | Minimum viable cost |
| `opencode-go-qwen` | Full Qwen lineup alternative |
| `opencode-go-kimi` | Full Kimi lineup alternative |
| `kimi-code` | Kimi For Coding (official plan) |
| `opencode-go-deepseek` | Full DeepSeek lineup alternative |
| `opencode-go-glm` | Full GLM lineup alternative |

### Using profiles

Apply a profile with the `/profile` slash command inside an opencode session — no arguments, opens the native picker dialog:

```
/profile
  → dialog: "( Show current tier mapping )" + one entry per profile
  → pick a profile: opens the tier review dialog — tweak models per tier:
    pick provider then pick model (lists come from opencode's service
    catalog: built-in providers like anthropic/openai + configured custom
    providers; typing '<provider>/<model_id>' manually is also supported as
    a fallback), then "( Apply profile )":
    prefers server-side global config API for hot application (invalidates
    cached config, recreates instances, no restart needed); if unavailable
    (older opencode versions), falls back to direct opencode.jsonc +
    .active-profile writes which require a restart
  → Esc cancels
```

---

## Model Routing & Tier Architecture

The system uses 5 model tiers, each mapped to a set of agents:

| Tier | Purpose | Agents |
|---|---|---|
| `default` | General, strong reasoning | build, plan, code, researcher, architect, security, tech-writer |
| `code` | Code generation, implementation | java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `advisor` | Analysis, review, feedback | code-review, advisor |
| `explorer` | Fast, cheap, high-throughput | explorer |
| `vision` | Image understanding | vision |

Each tier resolves to the provider/model mapped by the active profile. **Variant** (low/medium/high) controls thinking/reasoning effort per agent; silently ignored if the backing model does not support variants.

---

## Custom providers (`/provider` wizard)

The `/provider` slash command (a TUI plugin registered via `tui.json`) configures custom providers end to end through native dialogs — no arguments:

```
/provider
  → dialog: "( Manage provider models )" + one entry per provider
    (active in opencode.jsonc, or available from providers/*.json —
    picking an inactive one activates it from its definition file)
  → pick a provider: baseURL prompt → apiKey prompt → atomic write
    (opencode.jsonc.bak backup) + toast; empty input keeps current values,
    '{env:VAR}' tokens are supported, secrets are never pre-filled
  → "( Manage provider models )": pick an active provider → its model list:
    "( Add model… )" walks three prompts (key → upstream id → display
    name); picking an existing model asks for removal confirmation
  → Esc cancels
```

---

## LLM Router credentials

For the `llm-router` custom provider, set `baseURL` / `apiKey` via the environment variables below (recommended), via the `/provider` wizard (interactive), or by editing `~/.config/opencode/opencode.jsonc` directly.

### Environment variables (recommended for API keys)

```powershell
# PowerShell ($PROFILE)
$env:LLM_ROUTER_BASE_URL = "https://router.example.com/v1"
$env:LLM_ROUTER_API_KEY  = "sk-xxxx"
```

```bash
# Bash (~/.bashrc or ~/.zshrc)
export LLM_ROUTER_BASE_URL="https://router.example.com/v1"
export LLM_ROUTER_API_KEY="sk-xxxx"
```

---

## Qoder provider (`opencode-qoder-bridge`)

The [opencode-qoder-bridge](https://github.com/naoufalelbani/opencode-qoder-bridge) plugin is included in the shipped `opencode.jsonc`'s `plugin` array and injects the `qoder` provider and its full model catalog at startup — no provider block or API keys needed. It communicates with Qoder through the official `@qoder-ai/qoder-agent-sdk` using your Qoder CLI credentials.

Prerequisites:
- Node.js `^22.18 || >=24.11`
- Qoder CLI installed and logged in: `qoder login` (credentials stored in `~/.qoder/.auth/user`)

Then restart opencode and apply the shipped `qoder` profile via `/profile`.
