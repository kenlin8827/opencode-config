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

### Available profiles overview
 
| Profile | Category | Description |
|---|---|---|
| `deepseek` | Official API Direct | Official DeepSeek API (V3.2 Reasoner, Chat, V4 Flash) |
| `anthropic` | Official API Direct | Official Anthropic API (Claude 3.5/3.7 Sonnet, Opus, Haiku) |
| `openai` | Official API Direct | Official OpenAI API (GPT-5, o3-mini, o4-preview) |
| `google` | Official API Direct | Official Google Gemini API (Gemini 2.5 Flash, 2.5 Pro) |
| `kimi-for-coding` | Official Coding Plan | Moonshot Kimi For Coding official coding plan (K1.5 / K2 series) |
| `alibaba-coding-plan` / `-cn` | Official Coding Plan | Alibaba Bailian Tongyi Qwen coding plan (Qwen3-Coder, Qwen3.7-Plus) |
| `alibaba-token-plan` / `-cn` | Official Coding Plan | Alibaba Bailian Token plan (DeepSeek V4 Flash / Qwen 3.8 Max) |
| `minimax-coding-plan` / `-cn` | Official Coding Plan | MiniMax official coding plan (M2.5, M2.7, M3) |
| `zhipuai-coding-plan` | Official Coding Plan | Zhipu AI official coding plan (GLM-5.1, GLM-5.2, GLM-5v) |
| `zai-coding-plan` | Official Coding Plan | Z.AI official coding plan (GLM series) |
| `tencent-coding-plan` | Official Coding Plan | Tencent Hunyuan Coding Plan (Hunyuan Turbo, TC Code, MiniMax M2.5) |
| `tencent-token-plan` | Official Coding Plan | Tencent Hunyuan Token Plan (HY3) |
| `xiaomi-token-plan-cn` / `-ams` / `-sgp` | Official Coding Plan | Xiaomi LLM Token Plan (China / Europe / Singapore nodes, MiMo v2.5) |
| `opencode-go-ultimate` | OpenCode Go Gateway | Ultimate quality first flagship ladder (Kimi K3 / MiniMax M3 / GPT-5.6 / Qwen 3.8 Max) |
| `opencode-go-performance` | OpenCode Go Gateway | Daily driver balance ladder |
| `opencode-go-economy` | OpenCode Go Gateway | Cost-effective balanced tier |
| `opencode-go-lite` | OpenCode Go Gateway | Minimum viable cost high-velocity tier |
| `opencode-go-deepseek` | OpenCode Go Gateway | All-DeepSeek family fallback |
| `opencode-go-kimi` | OpenCode Go Gateway | All-Kimi family fallback |
| `opencode-go-qwen` | OpenCode Go Gateway | All-Qwen family fallback |
| `opencode-go-glm` | OpenCode Go Gateway | All-GLM family fallback |
| `qoder` | Subscription & Gateway | Qoder subscription via opencode-qoder-bridge (needs `qoder login`) |
| `qoder-deepseek` / `qoder-qwen` | Subscription & Gateway | All-DeepSeek / All-Qwen on Qoder platform |
| `antigravity-router` | Custom Gateway | Self-hosted Antigravity gateway (Gemini Flash/Pro + Claude Sonnet/Opus Thinking) |
| `claude-code-router` | Custom Gateway | Self-hosted Claude Code gateway (Anthropic protocol) |
| `codex-router` | Custom Gateway | Self-hosted codex gateway (Sol/Luna series) |
| `qoder-router` | Custom Gateway | Self-hosted qoder gateway (Ultimate/Performance/Lite) |
| `llm-router` | Custom Gateway | Server-side routing baseline |

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
| `flash` | Fast, lightweight, exploration, high-throughput | explorer, fast-coder |
| `standard` | General orchestrator, high-traffic workhorse (root model) | build, plan, researcher, tech-writer |
| `pro` | Professional engineering, code generation & debugging | code, java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `max` | Deep reasoning, system design, security, red-team review | advisor, architect, security, code-review |
| `vision` | Multimodal visual analysis, UI critique | vision |

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
