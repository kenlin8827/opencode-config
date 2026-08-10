# 使用指南

从克隆到日常工作流 — 使用本多智能体 OpenCode 配置所需的一切。

> [English](USAGE.md) | **中文**

---

## 前置条件

| 要求 | 用途 | 安装方式 |
|---|---|---|
| [opencode](https://opencode.ai) CLI | 运行时，读取配置并调度智能体 | `curl -fsSL https://opencode.ai/install \| bash` |
| PowerShell 7+（Windows） | 安装与配置脚本 | `winget install Microsoft.PowerShell` |
| Bash 4+ + `jq`（macOS / Linux / WSL） | 同上，Bash 版本 | `brew install jq` 或 `sudo apt install jq` |
| [Bun](https://bun.sh) | TypeScript 插件编译 | `curl -fsSL https://bun.sh/install \| bash` |
| Git | 版本控制 & 清单回退 | — |

## 快速上手（3 步）

```powershell
# 1. 克隆仓库
git clone <repo-url> opencode-config
cd opencode-config

# 2. 安装配置到 ~/.config/opencode
pwsh install/install.ps1 -Mode Install

# 3. 配置凭证（交互式 — 先选服务商，再为每个层级选模型）
pwsh install/config.ps1
```

macOS / Linux / WSL：

```bash
./install/install.sh
./install/config.sh
```

完成后，在你的项目目录中启动 `opencode` — `@build` 编排器是默认智能体，会自动路由你的任务。

---

## 安装

安装器将白名单内的运行时文件（`agents/`、`commands/`、`plugins/`、`instructions/`、`opencode.jsonc`）复制到 `~/.config/opencode/`。其他所有内容（`.git/`、`install/`、`tests/`、`node_modules/` 等）保留在仓库中。

### 命令

| 模式 | PowerShell | Bash | 说明 |
|---|---|---|---|
| 安装（默认） | `pwsh install/install.ps1 -Mode Install` | `./install/install.sh` | 将当前清单应用到目标目录 |
| 强制重装 | `pwsh install/install.ps1 -Mode Install -Force` | `./install/install.sh install -f` | 重新应用相同版本 |
| 查看状态 | `pwsh install/install.ps1 -Mode Status` | `./install/install.sh status` | 显示已安装版本与仓库版本 |
| 生成清单 | `pwsh install/install.ps1 -Mode Generate` | `./install/install.sh generate` | 扫描仓库，写入清单（不安装） |

### 自定义目标目录（安全测试）

```powershell
$tmp = Join-Path $env:TEMP "opencode-test-$(Get-Random)"
pwsh install/install.ps1 -Mode Install -Target $tmp
# 检查...
Remove-Item -Recurse -Force $tmp
```

```bash
./install/install.sh install -t /tmp/opencode-test
```

### 重装时保留的字段

当 `opencode.jsonc` 被新模板覆盖时，以下字段会从你的现有配置中快照并在覆盖后恢复：

| 字段 | 保留原因 |
|---|---|
| `provider.<name>.options.baseURL` | 你的 API 端点 |
| `provider.<name>.options.apiKey` | 你的 API 密钥 |
| `model`（根级别） | 你为 default 层级选择的模型 |
| `agent.<name>.model`（每个层级） | 你为各层级分配的模型 |

其他所有字段来自仓库模板。如需丢弃保留的设置：`config.ps1 reset` / `config.sh reset`。

---

## 配置

### 交互式（首次配置推荐）

```powershell
pwsh install/config.ps1    # PowerShell
```

```bash
./install/config.sh        # Bash
```

交互流程：

1. **多选服务商** — 从 `opencode models` 输出 + `llm-router`（自定义服务商）中选择。`0` 或回车 = 全选。
2. **llm-router 凭证** — 如果选了 `llm-router`，会提示输入 baseURL 和 apiKey。回车 = 保留现有值。
3. **为每个层级选模型** — 对每个层级（default、code、advisor、explorer、vision），从已选服务商的模型中选择。回车 = 保留当前值。

同一层级的所有智能体会被统一重写为相同的 `provider/model_id` 引用。

### 脚本式（非交互）

```powershell
# 设置凭证
pwsh install/config.ps1 set baseURL https://router.example.com/v1
pwsh install/config.ps1 set apiKey  sk-xxxx

# 为指定层级设置模型
pwsh install/config.ps1 set model code claude-sonnet-4-5
pwsh install/config.ps1 set model advisor gpt-5.6-luna -p opencode-go

# 查看当前状态
pwsh install/config.ps1 get

# 重置为模板默认值
pwsh install/config.ps1 reset
```

Bash 等价命令：

```bash
./install/config.sh set baseURL https://router.example.com/v1
./install/config.sh set apiKey sk-xxxx
./install/config.sh set model code claude-sonnet-4-5
./install/config.sh get
./install/config.sh reset
```

### 环境变量（推荐用于 API 密钥）

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

该令牌会在每次重装时原样保留。如果你更喜欢硬编码字面量，执行一次 `config.ps1 set apiKey sk-...` — 字面量之后会被自动保留。

---

## 配置预设（Profiles）

配置预设是一个命名预设，将服务商与各层级模型选择打包在一起，一次性应用，而非逐层级 `set model`。

### 可用预设

| 预设 | 说明 |
|---|---|
| `llm-router` | 服务端路由基线（等同于 `reset`） |
| `opencode-go-ultimate` | 质量优先，不计成本 |
| `opencode-go-performance` | 日常主力 |
| `opencode-go-economy` | 性价比平衡 |
| `opencode-go-lite` | 最低可用成本 |
| `opencode-go-qwen` | 全通义千问系列备选 |
| `opencode-go-kimi` | 全Kimi系列备选 |
| `kimi-code` | Kimi For Coding（官方计划） |
| `opencode-go-deepseek` | 全DeepSeek系列备选 |
| `opencode-go-glm` | 全GLM系列备选 |

### 使用预设

```powershell
# 交互式编号菜单
pwsh install/config.ps1 profile

# 仅列出，不应用
pwsh install/config.ps1 profile list

# 直接应用
pwsh install/config.ps1 profile apply opencode-go-performance
```

```bash
./install/config.sh profile
./install/config.sh profile list
./install/config.sh profile apply opencode-go-performance
```

预设是**单服务商**的 — 每个层级的引用必须属于同一服务商。预设未列出的层级保持不变。应用前会校验所有内容，并在写入前备份 `opencode.jsonc.bak`。

---

## 模型路由

系统使用 5 个模型层级，每个层级映射到一组智能体：

| 层级 | 模型 ID | 用途 | 智能体 |
|---|---|---|---|
| `default` | `llm-router/default` | 通用，强推理 | build, plan, researcher, architect, security, tech-writer |
| `code` | `llm-router/code` | 代码生成，实现 | java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `advisor` | `llm-router/advisor` | 分析，审查，反馈 | code-review, advisor |
| `explorer` | `llm-router/explorer` | 快速，廉价，高吞吐 | explorer |
| `vision` | `llm-router/vision` | 图像理解 | vision |

> **Variant**（low/medium/high）控制每个智能体的思考/推理深度。如果后端模型不支持 variant，会被静默忽略。

---

## 日常使用

### Build 模式（默认）

`@build` 是默认入口。它会自动将你的任务路由到合适的专家智能体：

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

通过 Tab 或 `@plan` / `@build` 在两种模式间切换。

### 直接调用智能体

你可以跳过编排器，直接调用专家智能体：

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
| `/advisor off\|lite\|full` | 切换 advisor 模式（详见下文） |
| `/review-fix-loop [scope]` | 自动化 审查→修复→复审 循环，直到没有 P0/P1。范围：`last commit`、`HEAD~N`、`branch`、`PR`、`files`，或空（未提交变更） |
| `/grill-me <topic>` | 逐题逼问式访谈，磨砺计划或设计 |
| `/grill-with-docs <topic>` | 同 `/grill-me`，同时创建 `CONTEXT.md` 术语表和 ADR |

### 示例：review-fix-loop

```
> /review-fix-loop last commit
  → @code-review 发现 P0/P1 问题
  → @<领域开发> 修复每个阻塞性问题
  → @code-review 复审
  → 重复直到清零或最多 5 轮
  → 输出总结：结论 + 统计数据
```

---

## Advisor 模式

`@advisor` 在**阻塞性**决策上提供独立的第二意见。非阻塞决策始终以声明假设的方式继续推进。

| 模式 | 行为 |
|---|---|
| **lite**（默认） | 调度 `@advisor`；向用户同时展示两方意见，由用户决定。 |
| **full** | 调度 `@advisor`；FACTUAL 类问题置信度 >= 8 → 自动执行（每会话最多 10 次，之后降级为 lite）；否则走 lite 流程。 |
| **off** | 不调度 `@advisor`；编排器独自决策。 |

### 切换

```
/advisor off
/advisor lite
/advisor full
```

`advisor-mode` 插件在 LLM 看到命令之前就写入了状态文件，因此切换是代码级可靠的。

### 状态持久化

- **状态文件**：`~/.config/opencode/.advisor-mode`（`off` / `lite` / `full`；旧值 `advisory` / `decisive` 自动归一化）
- **冷启动**（无状态文件）：`opencode.jsonc` 中的 `advisorMode` 字段 → 环境锁定为 `off` → `lite`（默认）
- 状态跨会话和跨进程持久化

### Red-team 立场（对抗式设计审查）

一种可选的调度方式，`@advisor` 会反对提案而非平衡选项：

- **触发条件**：用户明确要求（"压测这个方案" / "red team this" / "唱反调"），或编排器在不可逆设计决策前自动触发（schema 迁移、公开 API 契约、认证重构、破坏性数据操作）
- **输出**：裁决（`HOLDS` / `HOLDS WITH CAVEATS` / `FAILS`）+ 按严重性排序的攻击列表 + 钢铁人辩护
- **FAILS 时**：编排器将攻击发回设计负责人（`@architect`）要求反驳/修订，然后向用户同时展示攻击和反驳
- **自动执行隔离**：red-team 输出不携带置信度分数；代码级守卫抑制所有自动执行指令 — 对抗式裁决永远不会触发 full 模式自动执行

---

## 插件（平台级强制执行）

插件提供仅靠提示词无法实现运行时 hook：

| 插件 | Hook | 功能 |
|---|---|---|
| `design-token-guard.ts` | `tool.execute.before` | 阻止写入硬编码的颜色/间距/圆角 |
| `ai-slop-scanner.ts` | `event: file.edited` | 扫描前端文件中的 AI 反模式（渐变汤、div 汤等） |
| `metrics.ts` | `tool.execute.after` + `session.idle` | 自动记录工具调用指标（耗时、成功、智能体），JSONL 格式 |
| `auto-format.ts` | `event: file.edited` | 文件编辑后自动运行 prettier/eslint/ruff/gofmt/rustfmt |
| `advisor-mode.ts`（+ 辅助模块） | 4 个 hook | Advisor 模式、协议注入、off 模式拦截、full 模式自动执行、red-team 抑制 |

指标存储在 `~/.config/opencode/.metrics/` 中，格式为 JSONL。

### 编译插件（一次性，工具链安装后）

```bash
bun install
bunx tsc --noEmit    # 仅类型检查 — opencode 运行时编译
```

---

## 测试

### 结构检查（无 API 调用 — 快速）

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -StructuralOnly
```

验证：文件存在性、frontmatter、协议注入、内容模式、red-team 守卫、预设应用。

### 完整测试（结构 + API 提示测试）

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1
```

### 包含 ponytail 行为测试

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-all.ps1 -IncludePrompts
```

### Advisor 模式端到端（需要 opencode CLI + 环境变量）

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-advisor-e2e.ps1
```

### 预设压力测试（无 API 调用）

```powershell
pwsh -ExecutionPolicy Bypass -File tests/test-profiles.ps1
```

每个预设被应用到一个全新的模板副本；验证智能体引用、根模型、未触及的层级。

### API 测试前置条件

```powershell
$env:LLM_ROUTER_BASE_URL = "https://router.example.com/v1"
$env:LLM_ROUTER_API_KEY  = "<your-api-key>"
```

---

## 升级

```powershell
# 1. 拉取最新代码
git pull origin main

# 2. 检查将会变更什么
pwsh install/install.ps1 -Mode Status

# 3. 安装（凭证 + 模型选择会被保留）
pwsh install/install.ps1 -Mode Install
```

```bash
git pull origin main
./install/install.sh status
./install/install.sh
```

安装器读取目标目录中的 `.CONFIG_VERSION`，查找该版本的清单，删除其文件，然后复制当前清单。你的凭证和模型选择会被保留。

### 发布新版本（维护者）

1. 编辑 `install/VERSION`（一行，例如 `0.0.3`）
2. 生成清单：`pwsh install/install.ps1 -Mode Generate`
3. 运行结构测试：`pwsh tests/test-all.ps1 -StructuralOnly`
4. 类型检查插件：`bun install && bunx tsc --noEmit`
5. 提交 + 打标签

---

## 卸载

### 移除特定版本

删除 `<target>/.CONFIG_VERSION` — 下次安装将不知道要清理什么，因此还需手动删除 `~/.config/opencode/`：

```powershell
# 查看已安装的内容
pwsh install/install.ps1 -Mode Status
# 然后手动删除目标目录：
Remove-Item -Recurse -Force "$HOME/.config/opencode"
```

### 彻底卸载

```bash
rm -rf ~/.config/opencode
```

这会移除所有智能体、命令、插件、指令和配置。`~/.config/opencode/.metrics/` 中的指标也会被删除。

---

## 添加新智能体

1. **创建 `agents/<name>.md`** — 遵循结构模板（frontmatter + 操作循环 + 核心能力 + 硬规则 + 输出格式）
2. **添加到 `build.md`** — 路由表 + 触发词
3. **添加到 `plan.md`** — 团队表（如果具备分析能力）
4. **添加到 `opencode.jsonc`** — `agent.<name>` 块，包含 tier、model、mode 等
5. **添加到 `tests/test-all.ps1`** — `$allFiles` 数组 + 内容检查
6. **生成清单** — `pwsh install/install.ps1 -Mode Generate`（在更新 VERSION 之后）
7. **测试** — `pwsh tests/test-all.ps1 -StructuralOnly`

### Frontmatter 模板

```markdown
---
description: <何时调用 — 用于 build.md 路由>
mode: subagent
variant: <low|medium|high>
temperature: <0.0-0.4>
steps: <最大工具调用数>
permission:
  read: allow
  bash: allow
  edit: <allow|deny>
  webfetch: <allow|ask|deny>
  websearch: <allow|ask|deny>
---

You are a **senior <role>**. <one-line scope>.

## Operating loop
<3-5 step sequential workflow>

## Core competencies
<domain knowledge, bullet lists — NOT compressed>

## Hard rules
<RFC 2119 keywords, 5-12 words/bullet>

## Output format (mandatory — structured)
<markdown template with placeholders>

Invoke via `@<agent-name>` or <keywords>.
```

---

## 常见问题排查

### "provider.llm-router not configured"

运行交互式配置：`pwsh install/config.ps1`（或 `./install/config.sh`）。或通过环境变量设置凭证后重装。

### "no models available"

先运行 `opencode` 完成 CLI 认证，再重新运行 `config.ps1`。交互流程通过 `opencode models` 获取可用模型列表。

### Advisor 模式不切换

检查状态文件：

```powershell
Get-Content "$HOME/.config/opencode/.advisor-mode"
```

如果文件不存在，冷启动链生效：`opencode.jsonc` 中的 `advisorMode` → 环境锁定为 `off` → `lite`（默认）。运行 `/advisor lite` 来创建状态文件。

### 插件类型错误

```bash
bun install
bunx tsc --noEmit
```

修复报告的错误。opencode 运行时编译插件，但类型错误通常表示逻辑问题。

### opencode.jsonc 中的注释丢失

配置脚本（`config.ps1` / `config.sh`）写入时不保留 JSONC 注释。首次写入时会显示警告。如果注释对你很重要，请在仓库模板（`opencode.jsonc`）中维护 — 每次重装会复制原始文件（注释恢复），但下次 `config.ps1` 修改时会再次去除。
