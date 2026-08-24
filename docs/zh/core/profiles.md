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

### 可用预设

| 预设 | 说明 |
|---|---|
| `llm-router` | 服务端路由基线 |
| `codex-router` | 自建 codex 网关（Sol/Luna 系列） |
| `qoder-router` | 自建 qoder 网关（Ultimate/Performance/Lite） |
| `claude-code-router` | 自建 Claude Code 网关（Anthropic 协议，Fable/Opus/Sonnet/Haiku 系列） |
| `antigravity-router` | 自建 Antigravity 网关（Gemini Flash/Pro + Claude Sonnet/Opus Thinking + GPT-OSS） |
| `qoder` | Qoder 订阅，经 opencode-qoder-bridge（官方 Qoder Agent SDK；需 `qoder login`） |
| `qoder-deepseek` | Qoder 上的全 DeepSeek 系列备选（dmodel = DeepSeek-V4-Pro，dfmodel = DeepSeek-V4-Flash） |
| `qoder-qwen` | Qoder 上的全通义千问系列备选（qmodel_preview = Qwen3.8-Max-Preview，qmodel_latest = Qwen3.7-Max，qmodel = Qwen3.7-Plus） |
| `opencode-go-ultimate` | 质量优先，不计成本 |
| `opencode-go-performance` | 日常主力 |
| `opencode-go-economy` | 性价比平衡 |
| `opencode-go-lite` | 最低可用成本 |
| `opencode-go-qwen` | 全通义千问系列备选 |
| `opencode-go-kimi` | 全 Kimi 系列备选 |
| `kimi-code` | Kimi For Coding（官方计划） |
| `opencode-go-deepseek` | 全 DeepSeek 系列备选 |
| `opencode-go-glm` | 全 GLM 系列备选 |

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
| `default` | 通用，强推理 | build, plan, code, researcher, architect, security, tech-writer |
| `code` | 代码生成，实现 | java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `advisor` | 分析，审查，反馈 | code-review, advisor |
| `explorer` | 快速，廉价，高吞吐 | explorer |
| `vision` | 图像理解 | vision |

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
