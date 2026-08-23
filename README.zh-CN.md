# OpenCode 多智能体配置

开箱即用的 [OpenCode](https://opencode.ai) 配置：一支专家智能体团队、三种编排模式、一键模型预设、工作流斜杠命令、可选的项目级护栏 —— 一条命令安装到 `~/.config/opencode`。

> [English](README.md) | **中文**
>
> 本 README 是用户手册。如果你想修改本仓库本身（智能体、插件、测试、发布），请看 **[DEVELOPING.md](DEVELOPING.md)**。

---

## 你将获得什么

| 特性 | 对你的意义 |
|---|---|
| **专家智能体团队** | 17 位专家（`@java-dev`、`@security`、`@dba`、`@frontend-dev` 等），提示词按领域调优，自动路由 |
| **三种工作模式** | `@code`（直接开发，默认）、`@build`（编排执行）、`@plan`（只读分析）—— 可在 `install/options.jsonc` 中切换 |
| **一键安装器** | PowerShell + Bash 双平台，基于清单升级；凭证和模型选择在每次重装后完好保留 |
| **配置预设（Profiles）** | `/profile` 一次性把 5 个模型层级映射到某服务商的模型 —— 无需逐智能体 `set model` |
| **工作流斜杠命令** | `/review-fix-loop`、`/goal`、`/handoff`、`/grill-me`、advisor 模式等 |
| **可选护栏** | 按项目启用的 ADR 强制（`/adr-guard`）、密钥文件门控（`env-guard`）、E2E 门控（`/e2e-guard`）、提交纪律（`/project`）—— 全部默认关闭 |
| **Token 节省** | 安装时自动配置 [rtk](https://github.com/rtk-ai/rtk) 输出压缩（60–90%） |
| **第二意见顾问** | `@advisor` 为阻塞性决策提供独立意见，设计审查时可切换对抗式 red-team 立场 |

---

## 前置条件

| 要求 | 用途 | 安装方式 |
|---|---|---|
| [opencode](https://opencode.ai) CLI | 运行时，读取配置并调度智能体 | `curl -fsSL https://opencode.ai/install \| bash` |
| PowerShell 7+（Windows） | 安装脚本 | `winget install Microsoft.PowerShell` |
| Bash 4+ + `jq`（macOS / Linux / WSL） | 同上，Bash 版本 | `brew install jq` 或 `sudo apt install jq` |
| Git | 版本控制 & 清单回退 | — |

> Bun 仅在开发本仓库时需要（见 [DEVELOPING.md](DEVELOPING.md)）—— opencode 会在运行时编译内置的 TypeScript 插件。

## 快速上手

### 方式 A：从 Release 安装（无需克隆仓库）

从 [Releases 页面](https://github.com/kenlin8827/opencode-config/releases) 下载最新归档，然后：

```bash
# macOS / Linux / WSL
curl -fsSL https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.tar.gz -o /tmp/oc-config.tar.gz
tar xzf /tmp/oc-config.tar.gz -C /tmp
cd /tmp/opencode-config-*/
./install/install.sh
```

```powershell
# Windows（PowerShell）
$url = "https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.zip"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\oc-config.zip"
Expand-Archive -Path "$env:TEMP\oc-config.zip" -DestinationPath "$env:TEMP\oc-config" -Force
Set-Location "$env:TEMP\oc-config\opencode-config-*"
pwsh install/install.ps1
```

### 方式 B：克隆仓库安装（2 步）

```powershell
# 1. 克隆仓库
git clone <repo-url> opencode-config
cd opencode-config

# 2. 安装配置到 ~/.config/opencode
pwsh install/install.ps1
```

macOS / Linux / WSL：

```bash
./install/install.sh
```

完成后，在你的项目目录中启动 `opencode` — 在会话内配置服务商（`/connect`、`/provider`、`/profile`，见[配置](#配置)）；默认智能体是 `@code` 直接开发者（可通过[默认智能体](#默认智能体optionsjsonc)小节调整）。

> **术语约定**：下文中的"专家团"指各专家智能体（`@java-dev`、`@security` 等）组成的团队；`@build` / `@plan` 是调度它们的编排器（团长）。技术标识符（agent 名、`@` 引用）保持英文，是 opencode 平台约定。

---

## 安装

安装器将白名单内的运行时文件（`agents/`、`commands/`、`plugins/`、`instructions/`、`opencode.jsonc`、`tui.json`、`profiles/`、`providers/`）复制到 `~/.config/opencode/`。其他所有内容（`.git/`、`install/`、`tests/`、`node_modules/` 等）保留在仓库中。

### 命令

| 模式 | PowerShell | Bash | 说明 |
|---|---|---|---|
| 安装（默认） | `pwsh install/install.ps1` | `./install/install.sh` | 将当前清单应用到目标目录 |
| 强制重装 | `pwsh install/install.ps1 install -Force` | `./install/install.sh install -f` | 重新应用相同版本 |
| 查看状态 | `pwsh install/install.ps1 status` | `./install/install.sh status` | 显示已安装版本与仓库版本 |
| 生成清单 | `pwsh install/install.ps1 generate` | `./install/install.sh generate` | 扫描仓库，写入清单（不安装） |
| 初始化（全新开始） | `pwsh install/install.ps1 init` | `./install/install.sh init` | 备份并清空整个目标目录 |
| 禁用 rtk | 在 `options.jsonc` 中设 `"rtk": false` | 同左 | 跳过二进制下载并移除内置 openrtk 插件 |
| 切换默认智能体 | 在 `options.jsonc` 中设 `"default_agent"` | 同左 | opencode 启动时进入哪个主控智能体（`code` / `build` / `plan`） |
| 注册全局命令 | `pwsh install/install.ps1 register` | `./install/install.sh register` | 将 `opencode-config` shim 安装到 `~/.local/bin` |
| 注销全局命令 | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | 移除 shim |

### 默认智能体（options.jsonc）

opencode 启动时进入哪个主控智能体，由 [`install/options.jsonc`](install/options.jsonc) 中的 `default_agent` 字段控制 —— 安装器在**每次**安装时把它应用到 `opencode.jsonc` 根级 `default_agent` 字段：

```jsonc
// install/options.jsonc
{
  // code  — 直接开发者；自己动手写代码（日常主力）
  // build — 编排器；把编码任务路由给专家团
  // plan  — 只读协调器；分析与设计类工作
  "default_agent": "code"
}
```

切换方法：修改该字段的值，然后重新运行安装器（版本未变时用 `install -Force`）。未知的智能体名会被拒绝并给出警告，保留模板值。会话内无论默认值是什么，都可以随时通过 Tab 或 `@code` / `@build` / `@plan` 切换模式。

### 自定义目标目录（安全测试）

```powershell
$tmp = Join-Path $env:TEMP "opencode-test-$(Get-Random)"
pwsh install/install.ps1 install -Target $tmp
# 检查...
Remove-Item -Recurse -Force $tmp
```

```bash
./install/install.sh install -t /tmp/opencode-test
```

### 全局命令

首次安装后，可将仓库注册为全局 `opencode-config` 命令：

```powershell
pwsh install/install.ps1 register              # shim 位于 ~/.local/bin
pwsh install/install.ps1 register -BinDir C:\Tools\bin  # 自定义目录
```

```bash
./install/install.sh register
./install/install.sh register --bin-dir ~/bin
```

`register` 创建的是一个跳板，会重新执行仓库内的调度脚本，因此 `git pull` 后命令立即更新。它拒绝覆盖不是自己创建的文件。将 `~/.local/bin` 加入用户 PATH 后即可使用：

```powershell
opencode-config status
opencode-config install -Force
opencode-config unregister   # 移除 shim
```

### 重装时保留的字段

当 `opencode.jsonc` 被新模板覆盖时，以下字段会从你的现有配置中快照并在覆盖后恢复：

| 字段 | 保留原因 |
|---|---|
| `provider.<name>.options.baseURL` | 你的 API 端点 |
| `provider.<name>.options.apiKey` | 你的 API 密钥 |
| `provider.<name>.models` | 你的模型定义（自定义 model id、用户自加的模型）—— 深度合并回填：逐模型你的字段优先，仅模板中存在的模型和字段照常保留 |
| `model`（根级别） | 你为 default 层级选择的模型 |
| `agent.<name>.model`（每个层级） | 你为各层级分配的模型 |

其他所有字段来自仓库模板。如需丢弃保留的设置，在重装前删除 `<target>/opencode.jsonc`。

### Token 节省（rtk）

安装时自动配置 [rtk](https://github.com/rtk-ai/rtk) —— 一个在命令输出（git status、测试、构建等）到达模型前将其压缩 60-90% 的 CLI 代理。无需任何手动步骤：若 PATH 中没有 `rtk`，安装器会将固定版本的二进制下载到 `~/.local/bin`（SHA256 校验，Windows 上必要时自动加入用户 PATH）。opencode 钩子以仓库内置的 vendored [openrtk](https://github.com/martinstannard/openrtk) 插件（`plugins/openrtk.ts`）形式随配置分发 —— 透明地把 shell 命令经 rtk 重写，无需 `rtk init` 步骤；若之前通过 `rtk init -g --opencode` 装过官方插件，安装时会自动清理。安装后遥测默认关闭。

完全不需要时：在 `install/options.jsonc` 中设 `"rtk": false` 后重新安装 —— options 文件每次安装都会覆盖目标，因此跳过下载并自动从目标目录移除内置 openrtk 插件。事后移除二进制：删除 `~/.local/bin/rtk(.exe)`。

---

## 配置

所有服务商/模型配置均在 opencode 会话内完成 — 旧的 `install/config.ps1` /
`install/config.sh` 脚本已废弃：

1. **现有服务商配置** — 通过 `/connect` 斜杠命令连接官方 API（推荐）
2. **自定义服务商配置** — 针对仓库自带的路由定义（`codex-router`、`qoder-router` 等）使用 `/provider` 弹窗向导：凭证（baseURL/apiKey）和模型清单维护全部通过弹窗完成
3. **LLM Router 配置** — 自建或第三方路由服务，通过环境变量设置凭证（或直接编辑 `opencode.jsonc`）
4. **Qoder 配置** — `opencode-qoder-bridge` 插件已全局启用，启动时自动注入 `qoder` 服务商；只需用 Qoder CLI 登录（`qoder login`）并应用 `qoder` 预设即可

> **选择指南**：如需直接连接 DeepSeek、Kimi 等官方 API，请选择方式 1（更简单快速）；使用仓库自带的路由定义请选方式 2；如需自建 LLM Router 或使用第三方路由服务，请选择方式 3；如果你有 Qoder 订阅、想通过官方 Qoder Agent SDK 使用其模型目录（Ultimate/Performance/Kimi/DeepSeek/Qwen/GLM/…），请选择方式 4。

### 在 opencode 内配置服务商（推荐）

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

这种配置方式适用于：
- 已有现成的 LLM 服务商（如 DeepSeek、Kimi、通义千问等）
- 不想自建 LLM Router 的用户
- 希望通过交互方式快速配置的场景

预设会自动配置各层级的模型映射，无需手动设置每个层级的模型。

### 自定义服务商（`/provider` 向导）

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

说明：

- 仅限 TUI：向导运行在 opencode TUI 内，headless 会话没有等价功能。
- 凭证修改需重启 opencode 生效；重装时会作为保留字段保留。
- 这里新增的模型会立即出现在 `/profile` 的层级选择器中。

### LLM Router 凭证

对于 `llm-router` 自定义服务商，通过下面的环境变量设置 `baseURL` /
`apiKey`（推荐）、通过 `/provider` 向导（交互式），或直接编辑
`~/.config/opencode/opencode.jsonc`。

#### 环境变量（推荐用于 API 密钥）

仓库自带的 `opencode.jsonc` 使用环境变量替换令牌：

```jsonc
"baseURL": "{env:LLM_ROUTER_BASE_URL}",
"apiKey":  "{env:LLM_ROUTER_API_KEY}"
```

在 shell 配置文件中设置（PowerShell）：

```powershell
# 添加到 $PROFILE
$env:LLM_ROUTER_BASE_URL = "https://router.example.com/v1"
$env:LLM_ROUTER_API_KEY  = "sk-xxxx"
```

Bash（`~/.bashrc` 或 `~/.zshrc`）：

```bash
export LLM_ROUTER_BASE_URL="https://router.example.com/v1"
export LLM_ROUTER_API_KEY="sk-xxxx"
```

该令牌会在每次重装时原样保留。如果你更喜欢硬编码字面量，直接编辑 `~/.config/opencode/opencode.jsonc` — 字面量之后会被自动保留。

### Qoder 服务商（`opencode-qoder-bridge`）

[opencode-qoder-bridge](https://github.com/naoufalelbani/opencode-qoder-bridge) 插件已列入仓库自带 `opencode.jsonc` 的 `plugin` 数组，启动时自动注入 `qoder` 服务商及其完整模型目录 —— 无需 provider 块或 API 密钥。它通过官方 `@qoder-ai/qoder-agent-sdk` 与 Qoder 通信，使用你的 Qoder CLI 凭证。

前置条件：

- Node.js `^22.18 || >=24.11`
- 已安装 Qoder CLI 并登录：`qoder login`（凭证存于 `~/.qoder/.auth/user`）

然后重启 opencode，通过 `/profile` 应用自带的 `qoder` 预设。可用模型跟随你的 Qoder 账户/套餐 —— bridge 通过 SDK 实时发现模型目录（auto、ultimate、performance、efficient、lite、cmodel、qmodel*、kmodel*、gm51model、dmodel、dfmodel、mmodel 等）。

bridge 附带的额外能力：

- opencode 内的 `/qoder-usage`，或终端里的 `qoder-usage` —— 分模型的消耗/token 台账 + 实时账户额度
- bridge 首次加载时会向全局 `tui.json` 添加一个 TUI 入口（显示实时 Qoder 额度；若重装覆盖了 `tui.json` 会自动补回）

故障排查：启动时弹认证 → 执行 `qoder login` 后重启；提示 `qodercli not found` → 把 Qoder CLI 加入 PATH。如果你不使用 Qoder，从 `~/.config/opencode/opencode.jsonc` 的 `plugin` 数组中移除 `"opencode-qoder-bridge"` 即可。

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

通过在 opencode 会话内的 `/profile` 斜杠命令应用预设（详见 [斜杠命令](#斜杠命令)）—— 无需参数，直接打开原生弹窗选择器：

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

被覆盖层级的所有智能体会被统一重写为预设的 `provider/model_id` 引用，根级 `model` 跟随 `default` 层级。预设未列出的层级保持不变。应用前会校验所有内容；热应用路径由服务端用 patch 方式写 `opencode.jsonc`（保留注释），降级路径会先备份 `opencode.jsonc.bak` 再全量重写，且需重启生效。注意：热应用会销毁重建服务端 instance，切换瞬间正在进行的回复流可能被中断（会话历史不受影响）。

---

## 模型路由

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

## 日常使用

### Code 模式（默认）

`@code` 是默认入口 —— 直接开发者，自己动手编写、修改、测试和验证代码，不主动委托：

```
> @code 修复分页逻辑里的差一错误
> @code 给注册表单加上输入校验
```

仍可按需手动委托辅助类 subagent（`@advisor`、`@explorer`、`@code-review`、`@vision`）。如果任务实际上是跨领域的，`@code` 会建议切换到 `@build`。

### Build 模式（编排）

跨领域任务切换到 `@build` — 它会自动将你的任务路由给专家团里合适的成员：

```
> 添加一个 Spring Boot 用户注册接口，使用 JPA 和 BCrypt
  → @build 调度到 @java-dev

> 审查我最近的提交，关注安全问题
  → @build 调度到 @code-review（敏感时追加 @security）

> 设计一个新支付服务的架构
  → @build 调度到 @architect（先展示多步计划）
```

你不需要手动指定智能体 — 只需描述任务。对于跨领域任务，`@build` 会先展示执行计划再开始。

### Plan 模式（只读）

切换到 `@plan` 进行仅分析任务（不修改代码）：

```
> @plan 审计代码库的技术债务和安全漏洞
  → @plan 并行调度 @architect、@security、@code-review、@qa
  → 汇总报告，按优先级给出建议
```

通过 Tab 或 `@code` / `@build` / `@plan` 在三种模式之间切换。

### 直接调用专家

你可以跳过编排器，直接调用专家团的成员：

```
> @dba 优化 orders 表的索引
> @frontend-dev 用设计令牌创建一个可复用的 Button 组件
> @code-review 审查 PR #42
```

### 多步工作流示例

对于复杂功能，`@build` 会创建并执行计划：

```
## 执行计划

1. [@architect] — 设计事件溯源架构 → ADR + 设计文档
2. [@dba] — 设计事件存储 schema → DDL + 迁移脚本
3. [@java-dev] — 实现生产者和消费者 → 代码 + 测试
4. [@qa] — 编写集成测试 → 测试套件
5. [@security] — 安全审查 → 报告
6. [@code-review] — 代码审查 → 审查报告
7. [@tech-writer] — 编写文档 → README + API 文档

是否继续？
```

---

## 斜杠命令

| 命令 | 说明 |
|---|---|
| `/auto-advisor off\|lite\|full` | 切换 advisor 模式（详见下文） |
| `/provider` | 打开服务商向导（仅限 TUI）：为已激活或仓库自带的服务商配置凭证（baseURL → apiKey 输入），或管理服务商的模型清单（按 key/上游 id/显示名三步新增，删除需确认）。详见[自定义服务商](#自定义服务商provider-向导) |
| `/profile` | 打开弹窗选择器：列出所有可用的模型服务商预设（活跃项带标记）；选中预设后进入层级审阅，可逐个 tier 通过 provider → model 选择修改模型再应用（provider/模型列表来自 opencode 服务目录：内置 + 已配置），重写 `opencode.jsonc` 中的层级→模型映射。首个条目用于查看当前活跃预设和层级→模型映射 |
| `/review-fix-loop [scope] [--max-rounds=N]` | 自动化 审查→验证→修复→复审 循环，直到没有 P0/P1。范围：`last commit`、`HEAD~N`、`branch`、`PR`，或空（未提交变更）。`--max-rounds=N` 覆盖默认 5 轮 |
| `/goal [text]` | 结构化目标执行协议，包含审计友好的验收清单和可机械检测的停止条件。带文本：执行目标；不带文本：goal-builder 模式（交互式访谈构建 5 段式目标） |
| `/handoff [focus]` | 将当前会话压缩为一份交接文档（保存到操作系统临时目录），让新会话能接手工作。可选参数用于把文档聚焦到下一会话要处理的方向 |
| `/project init` | 脚手架生成项目基线文件——仅当缺失时创建 `.opencode/opencode.jsonc`、`docs/git-commits.md`、`AGENTS.md`（绝不覆盖）；已存在的项目配置会做只追加补齐：模板在 init 之后新增的开关注释行自动补入（既有内容不动）；随后执行各后端的首次初始化（仅当对应 CLI 已安装且启用）：`codegraph init`、索引缺失时的 `gitnexus analyze`。`docs/git-commits.md` 存在期间提交纪律生效（详见下文「提交纪律」小节） |
| `/project index` | 手动刷新已有索引：`codegraph sync`（增量追平 watcher 未运行期间的变更）、索引过期时的 `gitnexus analyze` 重建。只刷新、不首次建库（首次归 `/project init`）；CLI 未安装则跳过报告、绝不调用 |
| `/project sync` | 只做配置补齐：把模板中新增、而现有 `.opencode/opencode.jsonc` 还没有的开关注释行追加进去（只追加、不改既有内容；文件不存在时提示跑 `/project init`） |
| `/grill-me <topic>` | 逐题逼问式访谈，磨砺计划或设计 |
| `/grill-with-docs <topic>` | 同 `/grill-me`，同时创建 `CONTEXT.md` 术语表和 ADR |
| `/queued` | 管理排队提示 —— 交互式 TUI 对话框，查看 / 编辑 / 取消会话忙碌时提交的消息（详见 [管理排队提示](#管理排队提示queued)） |

### 示例：review-fix-loop

```
> /review-fix-loop last commit
  → @code-review 发现 P0/P1 问题
  → 验证每个发现（读代码、追踪数据流、检查上游守卫）
  → 若为误报 → @advisor 确认后方可跳过
  → 若确认真 BUG → @<领域开发> 修复每个已验证问题
  → @code-review 复审
  → 重复直到清零或达到最大轮次（默认 5）
  → 输出总结：结论 + 统计数据

> /review-fix-loop HEAD~3 --max-rounds=8
  → 相同流程，允许最多 8 轮（适用于较大 diff）
```

---

## Auto-advisor 模式

`@advisor` 仅在**阻塞性**决策上提供独立的第二意见 —— 且仅在确有必要时（见 advisor 协议中的节俭规则）。非阻塞决策始终以声明假设的方式继续推进。

| 模式 | 行为 |
|---|---|
| **off**（默认） | 不调度 `@advisor`；编排器独自决策。手动 `@advisor` 仍可用。 |
| **lite** | 调度 `@advisor`；向用户同时展示两方意见，由用户决定。 |
| **full** | 调度 `@advisor`；FACTUAL 类问题置信度 >= 8 → 自动执行（每会话最多 10 次，之后降级为 lite）；否则走 lite 流程。 |

### 切换

```
/auto-advisor off
/auto-advisor lite
/auto-advisor full
```

`auto-advisor-mode` 插件在 LLM 看到命令之前就写入了配置，因此切换是代码级可靠的。

### 状态持久化

- **存储位置**：`opencode.jsonc` 中的 `autoAdvisorMode` 字段——无隐藏状态文件、无环境变量。取值：`off` / `lite` / `full`（旧字段名 `advisorMode` 和旧值 `advisory` / `decisive` 自动归一化）。
- **解析顺序**：项目配置（`opencode.jsonc` 或 `.opencode/opencode.jsonc`）→ `off`（默认）。纯项目级 —— 没有全局回退。
- **写入仅限项目级**：`/auto-advisor <mode>` 在项目 `opencode.jsonc` 中更新该字段（保留注释与其他字段）；永远不修改全局配置
- 取值跨会话和跨进程持久化，作用域为单个项目

### Red-team 立场（对抗式设计审查）

一种可选的调度方式，`@advisor` 会反对提案而非平衡选项：

- **触发条件**：用户明确要求（"压测这个方案" / "red team this" / "唱反调"），或编排器在不可逆设计决策前自动触发（schema 迁移、公开 API 契约、认证重构、破坏性数据操作）
- **输出**：裁决（`HOLDS` / `HOLDS WITH CAVEATS` / `FAILS`）+ 按严重性排序的攻击列表 + 钢铁人辩护
- **FAILS 时**：编排器将攻击发回设计负责人要求反驳/修订，然后向用户同时展示攻击和反驳
- **自动执行隔离**：red-team 输出不携带置信度分数；代码级守卫抑制所有自动执行指令 —— 对抗式裁决永远不会触发 full 模式自动执行

---

## 插件

插件提供仅靠提示词无法实现的运行时强制与工作流。以下全部随安装默认启用 —— 无需额外安装。

| 插件 | 对你的作用 |
|---|---|
| `design-token-guard.ts` | 阻止写入硬编码的颜色/间距/圆角 —— 让前端代码坚守设计令牌 |
| `ai-slop-scanner.ts` | 警告前端文件中的 AI 反模式（渐变汤、div 汤等） |
| `metrics.ts` | 自动记录工具调用指标（耗时、成功、智能体），JSONL 格式，存于 `~/.config/opencode/.metrics/` |
| `auto-format.ts` | 文件编辑后自动运行 prettier/eslint/ruff/gofmt/rustfmt |
| `auto-advisor-mode.ts` | `/auto-advisor` 命令、协议注入、模式门控、red-team 抑制（见 [Auto-advisor 模式](#auto-advisor-模式)） |
| `review-fix-loop.ts` | `/review-fix-loop` 命令与协议 |
| `goal.ts` | `/goal` 命令与协议 |
| `handoff.ts` | `/handoff` 命令与协议 |
| `deepseek-anchor.ts` | `/deepseek-anchor` 命令 —— 基于锚点的推理协议与 DeepSeek 模型集成 |
| `adr-guard.ts` | `/adr-guard` 命令 —— 按项目的 ADR 强制（见下文） |
| `env-guard.ts` | 按项目的密钥文件门控（见下文） |
| `e2e-guard.ts` | `/e2e-guard` 命令 —— 按项目门控：E2E 运行需用户确认；整套运行每次消耗一次性放行，定向 spec 重跑在首次确认后解锁（见下文） |
| `project-manager.ts` | `/project` 命令 + 提交纪律（见下文） |
| `queue-manager.ts` | `/queued` 命令 —— 管理会话忙碌时排队的提示（见下文） |
| `profile-wizard.ts`、`provider-wizard.ts` | `/profile` 与 `/provider` TUI 弹窗向导 |

各插件使用的 OpenCode hook 与注册方式等内部细节，见 [DEVELOPING.md](DEVELOPING.md#plugin-system)。

### ADR 铁律（`adr-guard`）

按项目可选的架构决策记录（ADR）强制机制。开关为**项目级**，默认关闭：

```text
/adr-guard on       # 对本项目启用（写入 <project>/.opencode/.adr-guard）
/adr-guard off      # 关闭
/adr-guard          # 状态报告（开关 + ADR 目录）
```

开启后：

- **软层** —— 铁律协议注入 system prompt：智能体在提交前主动新增/更新 ADR。
- **硬层** —— 当 commit message 类型为 `feat`/`refactor`（含 scope 和 breaking 变体）且工作区变更集（已暂存/未暂存/未跟踪）中没有任何 ADR 目录下的文件时，`git commit` 被阻断。`--amend`、其他提交类型、无内联 message 的提交不受限。
- **ADR 格式** —— 严格 MADR（行业标准，不加料）：frontmatter `status` + `date`，正文 `## Context and Problem Statement` + `## Decision Outcome`。顺序编号（`docs/adr/NNNN-slug.md`，永不重置）；决策变更时写一条新的取代 ADR（旧 ADR 置 `status: superseded by NNNN`），不改写原文。

项目配置字段（均可选，写在项目的 `opencode.jsonc`）：

```jsonc
{
  "adrGuard": "on",            // 提交到仓库的团队默认值
  "adrGuardDir": "docs/adr"    // ADR 目录
}
```

### 密钥文件门控（`env-guard`）

按项目可选的门控，把含密钥的 env 文件挡在 LLM 上下文之外。开关为**项目级**，默认关闭：

```text
# 对本项目启用（二选一）
echo on > <project>/.opencode/.env-guard
# 或在项目 opencode.jsonc 中加 "envGuard": "on"
```

开启后，智能体的以下访问会在执行前被阻断：

- 文件工具（read/edit/write/patch/multiedit）与 grep 工具针对 `.env`、`.env.local`、`.env.production` 等的访问
- 将敏感 `.env` 文件内容读入输出的 bash/shell 命令（`cat`、`grep`、`Get-Content` 等）、stdin 重定向（`< .env`）、以及把文件拷贝到别处的命令（`cp .env out`）

始终放行：`.env.example`（合法脚手架）、`cp .env.example .env`、不读内容的动词（`touch`、`ls`、`rm`、`git`）。阻断消息会给出安全替代方案，包括 `npx envsitter keys`（只看键名不看值）。

已知边界：子壳包装（`bash -c '...'`）、命令替换、glob 引用（`*.env`）不在机械检测范围 —— 它是常见路径上的硬墙，不是形式化沙箱。

### E2E 门控（`e2e-guard`）

按项目可选的门控：任何 E2E 套件运行前必须获得用户明确确认。E2E 慢、易抖动、成本高，是最后手段的测试层级 —— 仅靠提示词软规则无法保证智能体遵守，此门控直接拦截执行本身。开关为**项目级**，默认关闭：

```text
/e2e-guard on       # 对本项目启用（写入项目 opencode.jsonc 的 "e2eGuard": "on"）
/e2e-guard off      # 关闭
/e2e-guard          # 状态报告
```

开启后，运行 E2E 套件的 bash/shell 调用会在执行前被阻断：

- 名称含 `e2e` 的包管理器脚本（`npm|pnpm|yarn|bun [run] e2e`、`test:e2e`、`e2e:smoke` 等）
- 运行器 CLI：`playwright test`、`cypress run`、`nightwatch`、`codeceptjs run`（`playwright install` 等纯安装动词不管控）
- Python 运行器 —— 仅当调用本身带 e2e 证据时门控：`pytest tests/e2e/...`、`pytest -m e2e`、`python -m pytest ...`、`uv|poetry|pdm|pipenv run pytest ...`、`tox -e e2e`（裸 `pytest` 不管控 —— 它通常是单测套件）
- 链式命令逐段判断 —— 只要有一段是 E2E，整条命令被门控（取最高风险级别）

门控按风险分级：

| 风险级别 | 形态 | 门控 |
|---|---|---|
| **full（整套）** | 无明确目标的套件运行（`npm run e2e`、裸 `playwright test`） | 每次运行都需要新的一次性 `/e2e-guard allow` 放行 |
| **targeted（定向）** | 带明确 spec/测试文件参数（`playwright test tests/login.spec.ts`、`cypress run --spec ...`） | 会话内有过任一已确认放行后自动通过 |

确有必要跑 E2E 时的流程：

1. 智能体通过交互式问答给出选项：(a) 推荐 —— 只跑受当前 diff 影响的 spec；(b) 仍要跑整套；(c) 跳过 E2E，用轻量层验证。
2. 你的选择对应不同放行：
   - 只跑受影响的 → `/e2e-guard allow targeted` —— 会话内解锁定向重跑，整套运行仍被门控
   - 跑整套 → `/e2e-guard allow` —— 下一次整套运行的一次性放行（同时获得定向解锁）
3. 智能体重试所选命令。整套放行被消耗（下次整套运行需重新确认）；定向重跑 —— 典型的修复后重试循环 —— 在会话剩余时间内保持解锁。放行随会话结束作废，绝不持久化。

```jsonc
// 项目 opencode.jsonc —— 提交到仓库的团队默认值（可选）
{ "e2eGuard": "on" }
```

已知边界：壳包装（`bash -c '...'`）不在机械检测范围 —— 它是常见路径上的硬墙，不是形式化沙箱。

### 提交纪律（`project-manager`）

按项目的提交规范强制机制，采用**文件即开关**：无状态文件、无 on/off 命令 —— `docs/git-commits.md` 存在即生效。

```text
/project init       # 脚手架生成基线文件（仅当缺失时创建，绝不覆盖；
                    #   已存在的项目配置自动追加模板新增的开关行）：
                    #   .opencode/opencode.jsonc、docs/git-commits.md、AGENTS.md
                    # 随后做后端首次初始化（CLI 已安装且启用才执行）：
                    #   codegraph init、索引缺失时的 gitnexus analyze
/project index      # 手动刷新已有索引：codegraph sync、
                    #   stale 时的 gitnexus analyze
/project sync       # 只做配置补齐（只追加）
/project            # 帮助
```

`docs/git-commits.md` 存在期间：

- **软层（渐进式披露）** —— 仅向 system prompt 注入紧凑指针（约 50 token）指明文件位置；文档全文绝不进上下文。智能体提交前自行读取；机械门控为未读先提交兜底。
- **硬层** —— 当 commit message 违反 Conventional Commits 的可机械校验子集时阻断 `git commit`：首行须匹配 `type(scope): summary`（type 限 feat、fix、refactor、docs、test、chore、perf、ci、build、style、revert）且 ≤ 72 字符。`--amend`（逐次判定）、`Merge`/`Revert`/`fixup!`/`squash!` 消息、无内联 message 的提交不受限。
- 删除文件 → 双层立即失效。

注意：门控只强制机械可校验的结构；`docs/git-commits.md` 的其余内容由软层引导。

### 管理排队提示（`/queued`）

会话忙碌时提交的提示，OpenCode 会立即持久化为用户消息（TUI 显示 QUEUED 徽章），并在当前运行结束后逐条处理。内置的 `queue-manager.ts` TUI 插件为这个队列提供交互式管理界面 —— 已通过 `tui.json` 默认启用，无需安装。

**用法**：`/queued`（或命令面板 → "Manage queued messages"）打开选择对话框，列出全部排队消息（预览 + 排队时长）。选中某条后进入单条菜单 —— **编辑文本**、**取消消息**、**查看全文** —— 列表还提供 **Cancel ALL** 批量取消。

**关键行为**：

- "队列"从会话历史计算得出：所有尚无助手回复的用户消息，排除内部消息（compaction、subtask）和插件反馈。
- 编辑立即写回存储；处理循环每一步都重读消息，所以轮到该消息时用的就是编辑后的文本。
- 取消在会话空闲时直接删除消息。忙碌时 OpenCode 拒绝删除消息（409），插件改为清空该消息 —— 文本替换为墓碑说明、附件删除 —— 模型永远收不到原指令。
- 仅 TUI 插件；headless 会话没有等价入口。

---

## 升级

```powershell
# 1. 拉取最新代码
git pull origin main

# 2. 检查将会变更什么
pwsh install/install.ps1 status

# 3. 安装（凭证 + 模型选择会被保留）
pwsh install/install.ps1
```

```bash
git pull origin main
./install/install.sh status
./install/install.sh
```

安装器读取目标目录中的 `.CONFIG_VERSION`，查找该版本的清单，删除其文件，然后复制当前清单。你的凭证和模型选择会被保留。

从 Release 安装的用户：下载新归档后再次运行安装器即可 —— 保留规则相同。

---

## 卸载

### 彻底卸载

```bash
rm -rf ~/.config/opencode
```

```powershell
Remove-Item -Recurse -Force "$HOME/.config/opencode"
```

这会移除所有智能体、命令、插件、指令和配置。`~/.config/opencode/.metrics/` 中的指标也会被删除。如果注册过全局命令，请先运行 `opencode-config unregister`（或删除 `~/.local/bin` 中的 shim）。

### Init 模式（备份 + 清空）

使用 `init` 将整个目标目录备份到带时间戳的同级目录（`~/.config/opencode.backup.YYYYMMDD-HHMMSS`），然后清空其中所有内容 —— 为全新安装做准备。

```powershell
pwsh install/install.ps1 init             # 备份 + 清空
pwsh install/install.ps1 init -NoBackup   # 不备份直接清空
pwsh install/install.ps1 init -Yes        # 跳过确认提示
```

```bash
./install/install.sh init               # 备份 + 清空
./install/install.sh init --no-backup    # 不备份直接清空
./install/install.sh init -y            # 跳过确认提示
```

`init` 之后，运行 `install` 重装配置文件，然后在 opencode 内配置凭证和模型（`/connect` + `/profile`）。

---

## 常见问题排查

### "provider.llm-router not configured"

通过环境变量 `LLM_ROUTER_BASE_URL` / `LLM_ROUTER_API_KEY` 设置凭证（见 [LLM Router 凭证](#llm-router-凭证)），或直接编辑 `~/.config/opencode/opencode.jsonc`，然后重启 opencode。

### Auto-advisor 模式不切换

检查项目 `opencode.jsonc` 中的 `autoAdvisorMode` 字段（在项目根目录运行）：

```powershell
Select-String -Path "opencode.jsonc" -Pattern "autoAdvisorMode"
```

如果字段不存在，模式为 `off`（默认）。运行 `/auto-advisor lite` 将字段写入项目配置并启用 advisor 咨询。

### `/profile` 不保留 JSONC 注释

`/profile` 插件在重写 `opencode.jsonc` 时会去除注释。如果注释对你很重要，请在仓库模板（`opencode.jsonc`）中维护 —— 每次重装会复制原始文件（注释恢复），但下次 `/profile` 修改时会再次去除。

### 其他问题？

安装器内部机制（清单、保留字段、自定义目标）见 [`install/README.md`](install/README.md)。仓库开发类问题（插件类型错误、测试）见 [`DEVELOPING.md`](DEVELOPING.md)。

---

## 文档地图

| 文档 | 面向读者 |
|---|---|
| [`README.md`](README.md) / `README.zh-CN.md`（本文件） | 用户 —— 安装、配置、日常工作流 |
| [`DEVELOPING.md`](DEVELOPING.md) | 贡献者 —— 架构、提示词规范、测试、发布 |
| [`install/README.md`](install/README.md) | 安装器内部机制 —— 清单、保留字段、init、自定义目标 |
| [`tests/README.md`](tests/README.md) | 测试套件参考 |
