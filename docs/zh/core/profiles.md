# 模型配置与预设（Profiles）

在 OpenCode 内完成服务商连接、5 大模型层级映射与自定义路由配置。

---

## 在 opencode 内配置服务商（推荐）

对于现有服务商（如官方 DeepSeek、Kimi、通义千问等 API，非自建 LLM Router），通过 OpenCode 的斜杠命令配置：

```
/connect <provider-name>    # 连接到现有服务商
/profile                    # 打开预设选择弹窗
```

**配置流程：**

1. **连接服务商** — 使用 `/connect` 命令连接到已存在的 provider
2. **选择预设** — 使用 `/profile` 打开选择弹窗，选中该服务商对应的配置预设

**示例：**

```
> /connect deepseek
  → 连接到 DeepSeek 服务商
> /profile
  → 弹窗打开 — 选中 "deepseek" 条目即可应用官方 API 预设配置
```

**重要提示：** 配置完成后请退出当前 opencode 会话并重新进入，以确保新的 provider 和 profile 配置完全生效。

---

## 配置预设（Profiles）

配置预设是一个命名预设，将服务商与各层级模型选择打包在一起，一次性应用，而非逐层级 `set model`。

### 可用预设全景表

| 预设 | 分类 | 说明 |
|---|---|---|
| `deepseek` | 官方 API 直连 | 官方 DeepSeek API 直连 (V3.2 Reasoner, Chat, V4 Flash) |
| `anthropic` | 官方 API 直连 | 官方 Anthropic API (Claude 3.5/3.7 Sonnet, Opus, Haiku) |
| `openai` | 官方 API 直连 | 官方 OpenAI API (GPT-5, o3-mini, o4-preview) |
| `google` | 官方 API 直连 | 官方 Google Gemini API (Gemini 2.5 Flash, 2.5 Pro) |
| `kimi-for-coding` | 官方 Coding Plan | 月之暗面 Kimi For Coding 官方开发套餐 (K1.5 / K2 系列) |
| `alibaba-coding-plan` / `-cn` | 官方 Coding Plan | 阿里百炼通义千问 Coding 计划 (Qwen3-Coder, Qwen3.7-Plus) |
| `alibaba-token-plan` / `-cn` | 官方 Coding Plan | 阿里百炼 Token 计划 (DeepSeek V4 Flash / Qwen 3.8 Max) |
| `minimax-coding-plan` / `-cn` | 官方 Coding Plan | 稀宇科技 MiniMax 官方开发套餐 (M2.5, M2.7, M3) |
| `zhipuai-coding-plan` | 官方 Coding Plan | 智谱 AI 官方 Coding 计划 (GLM-5.1, GLM-5.2, GLM-5v) |
| `zai-coding-plan` | 官方 Coding Plan | Z.AI 官方开发套餐 (GLM 系列) |
| `tencent-coding-plan` | 官方 Coding Plan | 腾讯混元 Coding 计划 (Hunyuan Turbo, TC Code, MiniMax M2.5) |
| `tencent-token-plan` | 官方 Coding Plan | 腾讯混元 Token 计划 (HY3) |
| `xiaomi-token-plan-cn` / `-ams` / `-sgp` | 官方 Coding Plan | 小米大模型 Token 计划（国内 / 欧洲 / 新加坡节点，MiMo v2.5 系列） |
| `opencode-go-ultimate` | OpenCode Go 网关 | 旗舰满血阶梯 (Kimi K3 / MiniMax M3 / GPT-5.6 / Qwen 3.8 Max) |
| `opencode-go-performance` | OpenCode Go 网关 | 日常主力性价比平衡阶梯 |
| `opencode-go-economy` | OpenCode Go 网关 | 经济实惠高性价比阶梯 |
| `opencode-go-lite` | OpenCode Go 网关 | 最低可用成本极速阶梯 |
| `opencode-go-deepseek` | OpenCode Go 网关 | 全 DeepSeek 模型族纯享预设 |
| `opencode-go-kimi` | OpenCode Go 网关 | 全 Kimi 模型族纯享预设 |
| `opencode-go-qwen` | OpenCode Go 网关 | 全 Qwen 模型族纯享预设 |
| `opencode-go-glm` | OpenCode Go 网关 | 全 GLM 模型族纯享预设 |
| `qoder` | 订阅与网关 | Qoder 订阅，经 opencode-qoder-bridge（需 `qoder login`） |
| `qoder-deepseek` / `qoder-qwen` | 订阅与网关 | Qoder 平台上的 DeepSeek / Qwen 纯享预设 |
| `antigravity-router` | 自建网关 | 自建 Antigravity 网关（Gemini Flash/Pro + Claude Sonnet/Opus Thinking） |
| `claude-code-router` | 自建网关 | 自建 Claude Code 网关（Anthropic 协议） |
| `codex-router` | 自建网关 | 自建 codex 网关（Sol/Luna 系列） |
| `qoder-router` | 自建网关 | 自建 qoder 网关（Ultimate/Performance/Lite） |
| `llm-router` | 自建网关 | 服务端路由基线 |

### 使用预设

通过在 opencode 会话内的 `/profile` 斜杠命令应用预设 —— 无需参数，直接打开原生弹窗选择器：

```
/profile
  → 弹窗："( Show current tier mapping )" 条目 + 每个预设一个条目
  → 选中预设：进入层级审阅弹窗 — 可逐个 tier 修改模型：先选 provider，
    再选 model（列表来自 opencode 服务目录：内置 provider 如
    anthropic/openai + 已配置的自定义 provider；也可手动输入
    '<provider>/<model_id>' 作为兜底），然后 "( Apply profile )" 应用：
    优先走服务端全局配置 API 热生效（失效配置缓存、重建
    instance，无需重启）；若该端点不可用（旧版 opencode）则
    降级为直写 opencode.jsonc + .active-profile，需重启生效
  → Esc 取消
```

---

## 模型路由与 5 大层级架构

系统使用 5 个模型层级，每个层级映射到一组智能体：

| 层级 | 用途 | 智能体 |
|---|---|---|
| `flash` | 快速，轻量，代码粗筛，高吞吐 | explorer, fast-coder |
| `standard` | 通用编排中枢，高吞吐主力（根模型） | build, plan, researcher, tech-writer |
| `pro` | 专业全栈工程，代码生成与实现 | code, java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `max` | 深度推理，系统架构，安全合规，严苛审查 | advisor, architect, security, code-review |
| `vision` | 图像理解与多模态分析 | vision |

每个层级解析到当前活跃预设为它映射的 provider/模型。**Variant**（low/medium/high）控制每个智能体的思考/推理深度；如果后端模型不支持 variant，会被静默忽略。

---

## 自定义服务商（`/provider` 向导）

`/provider` 斜杠命令（通过 `tui.json` 注册的 TUI 插件）以原生弹窗端到端配置自定义服务商 — 无需参数：

```
/provider
  → 弹窗："( Manage provider models )" + 每个服务商一个条目
    （opencode.jsonc 中已激活的，或 providers/*.json 中可用的 —
    选中未激活的条目会从定义文件激活它）
  → 选中服务商：baseURL 输入 → apiKey 输入 → 原子写入
    （opencode.jsonc.bak 备份）+ toast；空输入保留现值，
    支持 '{env:VAR}' 令牌，密钥永不明文预填
  → "( Manage provider models )"：选中已激活服务商 → 模型清单：
    "( Add model… )" 依次三步输入（key → 上游 id → 显示名）；
    选中已有模型则弹出删除确认
  → Esc 取消
```

---

## LLM Router 凭证

对于 `llm-router` 自定义服务商，通过下面的环境变量设置 `baseURL` / `apiKey`（推荐）、通过 `/provider` 向导（交互式），或直接编辑 `~/.config/opencode/opencode.jsonc`。

### 环境变量（推荐用于 API 密钥）

```powershell
# PowerShell ($PROFILE)
$env:LLM_ROUTER_BASE_URL = "https://router.example.com/v1"
$env:LLM_ROUTER_API_KEY  = "sk-xxxx"
```

```bash
# Bash (~/.bashrc 或 ~/.zshrc)
export LLM_ROUTER_BASE_URL="https://router.example.com/v1"
export LLM_ROUTER_API_KEY="sk-xxxx"
```

---

## Qoder 服务商（`opencode-qoder-bridge`）

[opencode-qoder-bridge](https://github.com/naoufalelbani/opencode-qoder-bridge) 插件已列入仓库自带 `opencode.jsonc` 的 `plugin` 数组，启动时自动注入 `qoder` 服务商及其完整模型目录 —— 无需 provider 块或 API 密钥。它通过官方 `@qoder-ai/qoder-agent-sdk` 与 Qoder 通信，使用你的 Qoder CLI 凭证。

前置条件：
- Node.js `^22.18 || >=24.11`
- 已安装 Qoder CLI 并登录：`qoder login`（凭证存于 `~/.qoder/.auth/user`）

然后重启 opencode，通过 `/profile` 应用自带的 `qoder` 预设。
