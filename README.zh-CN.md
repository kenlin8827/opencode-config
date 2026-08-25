# OpenCode 生产级工程化配置

开箱即用的 [OpenCode](https://opencode.ai) 生产级工程化配置：分层 MCP 代码智能与数据库网关、全链路工程护栏（ADR 铁律 / 密钥防护 / E2E 门控 / 提交纪律）、17 位专家智能体协作与一键模型分层治理 —— 一条命令安装到 `~/.config/opencode`。

> [English](README.md) | **中文** | 📖 **[在线文档站 (GitBook / Docs)](https://kenlin8827.github.io/opencode-config/zh/)**
>
> 本 README 是用户手册。如果你想修改本仓库本身（智能体、插件、测试、发布），请看 **[DEVELOPING.md](DEVELOPING.md)**。

---

## ⚡ 10 秒一键安装

无需手动克隆仓库，复制并在终端中运行单行命令即可直接安装到 `~/.config/opencode`：

### macOS / Linux / WSL
```bash
curl -fsSL https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.tar.gz -o /tmp/oc-config.tar.gz && tar xzf /tmp/oc-config.tar.gz -C /tmp && /tmp/opencode-config-*/install/install.sh
```

### Windows (PowerShell)
```powershell
$url = "https://github.com/kenlin8827/opencode-config/releases/latest/download/opencode-config-latest.zip"; Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\oc.zip"; Expand-Archive -Path "$env:TEMP\oc.zip" -DestinationPath "$env:TEMP\oc" -Force; & (Get-ChildItem "$env:TEMP\oc\opencode-config-*\install\install.ps1").FullName
```

> 💡 **零风险平滑升级**：已安装的用户重复执行上述命令可直接升级到最新版本，你的 API 密钥、自定义模型和层级选择均会**完整保留**。

---

<details>
<summary><b>📑 点击展开完整目录导航 (Table of Contents)</b></summary>

- [一、快速起步](#一快速起步)
  - [你将获得什么（特性矩阵）](#你将获得什么)
  - [前置条件](#前置条件)
  - [快速上手（4 步实操）](#快速上手)
- [二、核心能力与日常使用](#二核心能力与日常使用)
  - [日常使用与工作模式](#日常使用与工作模式)
    - [Code 模式（默认主力）](#code-模式默认)
    - [Build 模式（跨领域编排）](#build-模式编排)
    - [Plan 模式（只读分析）](#plan-模式只读)
    - [直接调用专家](#直接调用专家)
    - [多步工作流示例](#多步工作流示例)
  - [MCP 服务器：代码智能与数据库矩阵](#mcp-服务器代码智能与数据库)
    - [为什么集成 MCP？（核心意义）](#为什么集成-mcp核心意义与设计哲学)
    - [内置 MCP 服务概览表](#内置-mcp-服务概览)
    - [自动化装配与配置](#自动化装配与配置)
  - [模型配置与预设（Profiles）](#模型配置与预设profiles)
    - [在 opencode 内配置服务商](#在-opencode-内配置服务商推荐)
    - [配置预设（Profiles 列表与使用）](#配置预设profiles)
    - [模型路由与 5 大层级架构](#模型路由与层级架构)
    - [自定义服务商（/provider 向导）](#自定义服务商provider-向导)
    - [LLM Router 凭证](#llm-router-凭证)
    - [Qoder 官方服务商集成](#qoder-服务商opencode-qoder-bridge)
- [三、进阶工作流与项目护栏](#三进阶工作流与项目护栏)
  - [工作流斜杠命令](#工作流斜杠命令)
    - [命令一览表](#工作流斜杠命令)
    - [示例：review-fix-loop 自动化闭环](#示例review-fix-loop)
  - [Auto-advisor 模式](#auto-advisor-模式)
    - [模式说明与切换](#auto-advisor-模式)
    - [Red-team 立场（对抗式设计审查）](#red-team-立场对抗式设计审查)
  - [插件系统与项目护栏](#插件系统与项目护栏)
    - [插件总览表](#插件系统与项目护栏)
    - [ADR 铁律（adr-guard）](#adr-铁律adr-guard)
    - [密钥文件门控（env-guard）](#密钥文件门控env-guard)
    - [E2E 门控（e2e-guard）](#e2e-门控e2e-guard)
    - [提交纪律（project-manager）](#提交纪律project-manager)
    - [管理排队提示（/queued）](#管理排队提示queued)
- [四、安装进阶与运维参考](#四安装进阶与运维参考)
  - [安装器进阶与选项](#安装器进阶与选项)
    - [安装机制与命令一览](#安装命令一览)
    - [安装选项配置（options.jsonc）](#安装选项optionsjsonc)
    - [Token 节省（rtk 压缩）](#token-节省rtk)
    - [重装时保留的字段规则](#重装时保留的字段)
    - [全局命令与自定义目录](#全局命令)
  - [升级指南](#升级)
  - [卸载与初始化（init 模式）](#卸载与初始化)
  - [常见问题排查 (FAQ)](#常见问题排查)
  - [文档地图](#文档地图)

</details>

---

# 一、快速起步

## 你将获得什么

| 特性 | 对你的意义 |
|---|---|
| **专家智能体团队** | 17 位专家（`@java-dev`、`@security`、`@dba`、`@frontend-dev` 等），提示词按领域调优，自动路由 |
| **三种工作模式** | `@code`（直接开发，默认）、`@build`（编排执行）、`@plan`（只读分析）—— 可在 `install/options.jsonc` 中切换 |
| **代码智能与数据库（MCP）** | 预配置 MCP 服务（Serena LSP、CodeGraph 图谱、GitNexus、DBHub 数据库网关），开箱按需自动装 CLI |
| **配置预设（Profiles）** | `/profile` 一次性把 5 个模型层级映射到某服务商的模型 —— 无需逐智能体 `set model` |
| **工作流斜杠命令** | `/review-fix-loop`、`/goal`、`/handoff`、`/grill-me`、advisor 模式等 |
| **可选护栏** | 按项目启用的 ADR 强制（`/adr-guard`）、密钥文件门控（`env-guard`）、E2E 门控（`/e2e-guard`）、提交纪律（`/project`）—— 全部默认关闭 |
| **一键安装器** | PowerShell + Bash 双平台，基于清单升级；凭证和模型选择在每次重装后完好保留 |
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
| Node.js 22.5+ + npm（可选） | CodeGraph / GitNexus / DBHub MCP 运行环境 | [Node.js 官网](https://nodejs.org/) |
| uv / Python 3.13+（可选） | Serena LSP MCP 运行环境 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

> - Bun 仅在开发本仓库时需要（见 [DEVELOPING.md](DEVELOPING.md)）—— opencode 会在运行时编译内置的 TypeScript 插件。
> - Node.js 和 uv 仅在启用对应的 MCP 服务器时需要。在 `install/options.jsonc` 开启且本地缺失 CLI 时，安装器会自动调用 `npm` / `uv` 执行配置好的 `install` 命令。

---

## 快速上手

运行顶部的 [一键安装](#-10-秒一键安装) 之后，只需 3 步即可进入高效开发：

1. **进入你的项目并启动**：在任意代码仓库根目录打开终端，输入 `opencode` 启动。
2. **🎯 一键初始化项目环境（强烈推荐）**：
   ```
   /project init        # 自动构建 CodeGraph 代码图谱、生成项目级配置、dbhub 模板与提交规范
   ```
3. **连接服务商与预设**：
   ```
   /connect deepseek    # 连接你的服务商（或 kimi、anthropic、openai 等）
   /profile             # 打开弹窗选择对应预设，一键分配 5 个模型层级
   ```
4. **开始编码**：默认即为 `@code` 模式，直接用自然语言描述需求即可！

> 💡 **为什么必须跑 `/project init`？**
> 它会在不覆盖既有代码的前提下，自动完成项目级基础设施装配：
> - 运行 `codegraph init` 建立本地代码知识图谱（供智能体秒查调用链与影响面）。
> - 自动生成 `dbhub.toml` 数据库网关模板与 `docs/git-commits.md` 规范提交护栏。

---

### 开发者方式：克隆仓库安装

如果你想参与本配置的开发或通过 Git 管理修改，可使用克隆方式：

```bash
# 1. 克隆仓库
git clone https://github.com/kenlin8827/opencode-config.git
cd opencode-config

# 2. 执行安装（Windows 用 pwsh install/install.ps1）
./install/install.sh
```

> **术语约定**：下文中的"专家团"指各专家智能体（`@java-dev`、`@security` 等）组成的团队；`@build` / `@plan` 是调度它们的编排器（团长）。技术标识符（agent 名、`@` 引用）保持英文，是 opencode 平台约定。

---

# 二、核心能力与日常使用

## 日常使用与工作模式

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

## MCP 服务器（代码智能与数据库）

### 为什么集成 MCP？（核心意义与设计哲学）

在传统的 AI 辅助编程中，智能体主要依赖纯文本搜索（grep / glob）和逐个读取文件来理解代码库。对于中大型项目，这种方式存在严重缺陷：
1. **Token 爆炸与上下文污染**：为了搞清楚一个函数的调用链，模型往往需要翻阅十几个文件，消耗海量 Token 并迅速填满上下文窗口，导致推理质量大幅下降。
2. **缺乏结构化全局视野**：纯文本搜索无法理解 AST 语法树、动态分发、接口实现或多跳调用路径（Multi-hop call paths），极易遗漏代码变更引发的**连锁影响（Blast Radius）**。
3. **数据库操作盲目试错**：面对复杂数据库，模型常靠猜测表名或列名构造 SQL，导致频繁报错和低效重试。

为了彻底解决这些痛点，本配置通过 **Model Context Protocol (MCP)** 构建了**分层代码智能与数据网关矩阵**：

```
                               ┌────────────────────────────────────────────────────────┐
                               │                 OpenCode 智能体团队                     │
                               └───────┬─────────────────┬────────────────────┬─────────┘
                                       │                 │                    │
              ┌────────────────────────┴────────┐ ┌──────┴───────────────┐ ┌──┴─────────────────────────┐
              │          符号级实时定位          │ │      宏观架构与图谱      │ │       通用数据库网关          │
              │         (Symbol Layer)          │ │       (Graph Layer)   │ │      (Database Layer)         │
              ├─────────────────────────────────┤ ├───────────────────────┤ ├─────────────────────────────┤
              │ Serena MCP (基于实时 LSP)         │ │ CodeGraph / GitNexus  │ │ DBHub MCP (Bytebase)        │
              │ • find_symbol                   │ │ • codegraph_explore   │ │ • search_objects (表结构)    │
              │ • find_referencing_symbols      │ │ • 调用链 / 影响面分析   │ │ • execute_sql (安全只读查询) │
              │ • get_symbols_overview          │ │ • 跨文件架构全貌       │ │                             │
              └─────────────────────────────────┘ └───────────────────────┘ └─────────────────────────────┘
```

- **精准定点用 Serena (LSP)**：查询函数定义、所有引用位置、文件符号大纲。极小 Payload，直接返回精确结果，不浪费哪怕 1 个额外文件的上下文。
- **全局链路用 CodeGraph / GitNexus**：“这个模块怎么工作的？”、“修改这个接口会影响哪些下游服务？” —— 单次调用直接返回完整调用路径与影响面分析。
- **数据探索用 DBHub**：先查真实 schema（`search_objects`）再执行查询（`execute_sql`），杜绝幻觉猜测。

---

### 内置 MCP 服务概览

| 服务 | 类型 | 协议 / 许可证 | 核心工具 | 适用场景 | 索引与生命周期 |
|---|---|---|---|---|---|
| **Serena** | 实时 LSP 语义引擎 | MIT | `find_symbol`, `find_referencing_symbols`, `get_symbols_overview` | 精确的符号定义、引用查找、重命名、文件大纲（零幻觉） | 随会话启动实时连接 LSP，**无需**预先构建索引 |
| **CodeGraph** | 代码知识图谱（默认） | MIT | `codegraph_explore` | 架构全貌、“X 是如何工作的”、完整调用链路、修改影响面（Blast radius） | 项目首次运行 `codegraph init`（或 `/project init`），之后由内置文件监控器**自动增量热同步** |
| **GitNexus** | 深度代码图谱（可选） | PolyForm Noncommercial | Cypher 查询、聚类分析工具 | 复杂多仓库关系、执行任意 Cypher 图查询、流程可视化 | 大规模改动后手动执行 `gitnexus analyze`（或 `/project index`） |
| **DBHub** | 通用数据库网关 | MIT (Bytebase) | `search_objects`, `execute_sql` | 连接 PostgreSQL / MySQL / SQLite / SQL Server / MariaDB，高效查询与元数据探测 | 按项目放置 `dbhub.toml`，支持 `${ENV_VAR}` 环境变量 |

---

### 自动化装配与配置

整个 MCP 体系深度整合到安装器与智能体运行时中，做到**完全免手动折腾**：

#### 1. 集中开关与自动安装（`install/options.jsonc`）

在 [`install/options.jsonc`](install/options.jsonc) 中设置每个 MCP 的启用状态：

```jsonc
// install/options.jsonc
{
  "mcp": {
    "serena": true,     // LSP 语义检索（启用且本地缺失时，安装器自动通过 uv 安装）
    "codegraph": true,  // 代码图谱（启用且本地缺失时，安装器自动通过 npm 全局安装）
    "gitnexus": false,  // 深度 Cypher 图谱（商业使用需注意 PolyForm 许可证）
    "dbhub": true       // 数据库网关（启用且本地缺失时，安装器自动通过 npm 全局安装）
  }
}
```

- **CLI 自动拉取**：运行 `pwsh install/install.ps1` 或 `./install/install.sh` 时，安装器检测到某 MCP 处于启用状态且本地 PATH 缺失该命令，会自动根据 `opencode.jsonc` 中声明的 `install` 指令完成 CLI 自动安装。

#### 2. 运行时智能调度（`project-profiler` 插件）

无需记住何时调用什么 MCP。内置的 [`project-profiler.ts`](plugins/project-profiler/project-profiler.ts) 插件会在会话启动时自动探测：
- 当前代码库的项目语言构成。
- 已启用的 MCP 服务与本地索引状态（`.codegraph/`、`.gitnexus/`）。
- **立下铁律**：向智能体系统提示词注入指导准则 —— **必须优先调用代码图谱或 LSP 获取精确结构，严禁盲目遍历文件**。

#### 3. 项目生命周期管理（`/project` 命令）

在具体项目中，只需通过 [`/project`](#提交纪律project-manager) 命令即可一键完成环境初始化与索引维护：

```text
/project init       # 一键脚手架：若 MCP 已启用且 CLI 已就绪，自动执行 codegraph init，
                    # 并生成 dbhub.toml 模板、项目配置等
/project index      # 刷新索引：执行 codegraph sync 与 gitnexus analyze
```

#### 4. 数据库配置示例（`dbhub.toml`）

在项目根目录创建 `dbhub.toml`（或通过 `/project init` 自动生成），使用环境变量引用凭证，避免明文泄露：

```toml
# dbhub.toml
[[sources]]
id = "default"
dsn = "${DBHUB_DSN}"   # 推荐使用环境变量，例如 postgres://user:pass@localhost:5432/mydb

[[tools]]
name = "execute_sql"
source = "default"
readonly = true        # 生产环境安全：限制为只读查询
```

---

## 模型配置与预设（Profiles）

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

### 配置预设（Profiles）

配置预设是一个命名预设，将服务商与各层级模型选择打包在一起，一次性应用，而非逐层级 `set model`。

#### 可用预设

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

#### 使用预设

通过在 opencode 会话内的 `/profile` 斜杠命令应用预设（详见 [工作流斜杠命令](#工作流斜杠命令)）—— 无需参数，直接打开原生弹窗选择器：

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

### 模型路由与层级架构

系统使用 5 个模型层级，每个层级映射到一组智能体：

| 层级 | 用途 | 智能体 |
|---|---|---|
| `default` | 通用，强推理 | build, plan, code, researcher, architect, security, tech-writer |
| `code` | 代码生成，实现 | java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `advisor` | 分析，审查，反馈 | code-review, advisor |
| `explorer` | 快速，廉价，高吞吐 | explorer |
| `vision` | 图像理解 | vision |

每个层级解析到当前活跃预设为它映射的 provider/模型。**Variant**（low/medium/high）控制每个智能体的思考/推理深度；如果后端模型不支持 variant，会被静默忽略。

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

对于 `llm-router` 自定义服务商，通过下面的环境变量设置 `baseURL` / `apiKey`（推荐）、通过 `/provider` 向导（交互式），或直接编辑 `~/.config/opencode/opencode.jsonc`。

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

# 三、进阶工作流与项目护栏

## 工作流斜杠命令

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
| `/md-to-pdf <file.md> [output.pdf]` | Markdown 一键转高清 A4 PDF，支持自然语言 `@filepath 转PDF`、`--doctor` 自检与 `--install-deps` 自动修复（详见 [文档导出与排版渲染](#文档导出与排版渲染md-to-pdf)） |
| `/md-to-docx <file.md> [output.docx]` | Markdown 导出为出版级 Word (.docx)，支持中文字体排版、自动TOC、智能表格与代码美化（详见 [Word 文档排版与导出](#word-文档排版与导出md-to-docx)） |


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

## 插件系统与项目护栏

插件提供仅靠提示词无法实现的运行时强制与工作流。以下全部随安装默认启用 —— 无需额外安装。

| 插件 | 对你的作用 |
|---|---|
| `project-profiler.ts` | 启动时探测语言与激活的 MCP 后端，向系统提示词注入代码智能指引与检索铁律 |
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
| `e2e-guard.ts` | `/e2e-guard` 命令 + 系统提示词协议注入 —— 按项目开关：引导 LLM 评估 `feat`/`fix` 任务的 E2E 影响、提示补充缺失用例，并通过 `ask` 交互式确认放行（见下文） |
| `project-manager.ts` | `/project` 命令 + 提交纪律（见下文） |
| `queue-manager.ts` | `/queued` 命令 —— 管理会话忙碌时排队的提示（见下文） |
| `profile-wizard.ts`、`provider-wizard.ts`、`project-wizard.ts` | `/profile`、`/provider` 与 `/project-wizard` TUI 弹窗向导（支持两级可视化向导并自动回显已有配置） |
| `md-to-pdf.ts` | `/md-to-pdf` 与 `md_to_pdf` —— Markdown 一键导出为高质量 A4 PDF（基于 Pandoc + Playwright） |
| `md-to-docx.ts` | `/md-to-docx` 与 `md_to_docx` —— Markdown 导出为出版级 Word (.docx) 文档（宋体/黑体排版、自动TOC、智能表格与代码美化） |

各插件使用的 OpenCode hook 与注册方式等内部细节，见 [DEVELOPING.md](DEVELOPING.md#plugin-system)。

### ADR 铁律（`adr-guard`）

按项目可选的架构决策记录（ADR）强制机制。开关为**项目级**，默认关闭：

```text
/adr-guard on       # 对本项目启用（写入 <project>/.opencode/.adr-guard）
/adr-guard off      # 关闭
/adr-guard          # 状态报告（开关 + ADR 目录）
```

启用后：

- **软层** — 铁律协议注入系统提示词：智能体在提交前主动编写/更新 ADR。
- **硬层** — 当提交信息类型为 `feat`/`refactor`（包括带 scope 或 breaking 的变体）且工作区变更集（暂存、未暂存或未跟踪）中没有 ADR 目录下的文件时，阻断 `git commit`。`--amend`、其他提交类型、无内联 message 的提交不受限。
- **ADR 格式** — 严格 MADR（行业标准，无私有扩展）：frontmatter `status` + `date`, 正文 `## Context and Problem Statement` + `## Decision Outcome`。按顺序编号（`docs/adr/NNNN-slug.md`，永不重置）；变更的决策通过新增替代 ADR（`status: superseded by NNNN`）而非直接编辑原文件。

项目配置字段（均为可选，位于项目的 `opencode.jsonc` 中）：

```jsonc
{
  "adrGuard": "on",            // 全团队提交默认值
  "adrGuardDir": "docs/adr",   // ADR 目录
  "adrMode": "auto"            // auto (自适应) | flat (单层) | hierarchical (分层)
}
```

支持 `/adr` 全套命令：`/adr new`、`/adr supersede`、`/adr tree`、`/adr check`、`/adr migrate` 与 `/adr mode`。


### 密钥文件门控（`env-guard`）

按项目可选的门控机制，防止含敏感信息的 env 文件进入 LLM 上下文。开关为**项目级**，默认关闭：

```text
# 对本项目启用（任选一种）
echo on > <project>/.opencode/.env-guard
# 或在项目的 opencode.jsonc 中添加 "envGuard": "on"
```

启用后，在执行前阻断以下智能体访问：

- 针对 `.env`、`.env.local`、`.env.production` 等敏感文件的文件工具（read/edit/write/patch/multiedit）与 grep 工具
- 将敏感 `.env` 文件读取到输出的 bash/shell 命令（`cat`、`grep`、`Get-Content` 等）、重定向到 stdin（`< .env`）或复制到其他路径（`cp .env out`）

始终允许：`.env.example`（推荐的脚手架模板）、`cp .env.example .env`、非读取类动词（`touch`、`ls`、`rm`、`git`）。阻断消息会指出安全替代方案，包括用于查看变量名而不显示值的 `npx envsitter keys`。

已知边界：subshell 包装器（`bash -c '...'`）、命令替换和通配符引用（`*.env`）不做检查 —— 该门控是常见路径上的硬防线，不是形式化沙箱。

### E2E 护栏（`e2e-guard`）

按项目可选的 E2E 最佳实践与质量红线开关。**e2e-guard 不做机械式命令行硬阻断，而是在开启（`on`）时将 E2E 红线协议动态注入到 LLM 系统提示词中**，赋予 LLM 自主评估 `feat` 和 `fix` 任务影响的能力，并通过交互式提问工具（`ask`）将最终放行决定权交给用户。开关为**项目级**，默认关闭：

```text
/e2e-guard on            # 对本项目启用（写入项目 opencode.jsonc 的 "e2eGuard": "on"）
/e2e-guard off           # 关闭
/e2e-guard status        # 查看门控状态（on / off）
```

开启后（`on`）：

1. **触发范围**：
   - 凡是 **`feat`（新功能）** 与 **`fix`（缺陷修复）** 类型的任务必须触发评估。
   - 在任务完成收尾（Handoff）或执行 `git commit` / `git push` 前必须触发评估。
2. **影响与范围评估**：
   - **局部 E2E（Targeted）**：改动局限于特定模块，映射到对应的 spec 测试文件（如 `playwright test tests/login.spec.ts`）。
   - **全量 E2E（Full Suite）**：改动涉及核心认证、全局状态、路由或底层架构等跨流程层。
   - **跳过（Skip）**：纯文档、样式修饰或内部非功能性重构。
3. **缺失用例检测与补齐提示（Test Gap & Case Supplement）**：
   - 当 `feat` 或 `fix` 缺乏现有 E2E 用例覆盖时，LLM 会主动指出测试盲区，并提示用户是否编写/补充对应的 E2E 测试用例。
4. **通过 `ask` 工具交互确认**：
   - LLM 绝不静默运行 E2E 或擅自跳过，必须通过 `ask` 交互工具向用户呈现评估选项（局部测试 / 全量测试 / 补充用例 / 跳过），由用户决定是否放行。
5. **主 Agent 定向注入**：
   - 仅注入给具备交互与交付权限的主 Agent（`code`、`build`、`architect` 等主会话）；Subagent 自动免扰。

```jsonc
// 项目 opencode.jsonc — 全团队默认配置（可选）
{ "e2eGuard": "on" }
```

### 提交纪律与项目脚手架（`project-manager` / `project-wizard`）

按项目的提交规范强制机制，采用**文件即开关**：无状态文件、无 on/off 命令 —— `docs/git-commits.md` 存在即生效。

```text
/project-wizard     # [TUI 模式] 弹出两级交互向导 Dialog（一站式初始化/配置开关/同步/重建索引）
/project            # [CLI 模式] 显示可用子命令帮助手册
/project init       # [静默/直接] 脚手架生成基线文件与首次索引初始化（绝不覆盖已有内容；
                    #   已存在的项目配置自动追加模板新增开关）：
                    #   .opencode/opencode.jsonc、docs/git-commits.md、AGENTS.md
                    #   随后自动执行已启用的后端首次索引构建（codegraph init、gitnexus analyze）
/project setup      # 命令行模式下查看当前项目开关与状态指引
/project index      # 手动刷新已有索引：codegraph sync、stale 时的 gitnexus analyze
/project sync       # 仅做配置补齐（增量追加新模板开关）
```

**`/project-wizard` 交互向导核心特性**：
- **两级可视化向导**：一级为主功能入口（初始化/配置开关/模板同步/刷新索引/退出），二级为开关与质量门控定制列表。
- **安全内存草稿**：修改开关仅在弹窗内存生效，未显式保存前按 `Esc` 或返回绝不触碰磁盘；点击 `💾 Save & Apply` 时才安全持久化。
- **闭环交互与原生弹框**：所有初始化、保存、同步与索引操作均弹出原生 `DialogAlert` 确认结果，确认后平滑返回菜单，绝不意外退出。
- **自适应防截断**：精简对齐徽标（`🟢 ON` / `🔴 OFF` / `⚪ default`）与操作描述，在小窗口或分屏终端下依然整齐清晰。

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

### 文档导出与排版渲染（`md-to-pdf`）

将 Markdown 文档（API 规范、ADR 方案、调研报告）一键导出为出版级高保真 A4 PDF。

- **自然语言直接驱动**：发送 `@doc/api-v1.md 转PDF` 或 `帮我把 @README.md 导出为 PDF`，智能体自动提取路径并调用 `md_to_pdf` 工具完成生成。
- **Slash 命令**：`/md-to-pdf README.md`（渲染为 PDF）、`/md-to-pdf --doctor`（自检）、`/md-to-pdf --install-deps`（自动安装修复依赖）。
- **现代 A4 排版**：Pandoc GFM 转换 + 优雅 A4 页面与代码高亮 + 隔离 Node.js Playwright 矢量打印。

### Word 文档排版与导出（`md-to-docx`）

将 Markdown 文档一键导出为符合专业出版标准的中文 Word (`.docx`) 文档。

- **自然语言直接驱动**：发送 `@docs/design.md 转word` 或 `将 @README.md 导出为 docx`，智能体自动调用 `md_to_docx` 工具。
- **Slash 命令**：`/md-to-docx README.md`（渲染为 DOCX）、`/md-to-docx --doctor`（自检）、`/md-to-docx --install-deps`（自动补齐依赖）。
- **出版级中文排版**：标准宋体/黑体样式 + A4 页边距 + 自动中文化 TOC 目录与点线对齐 + 100% 满宽自适应美化表格（深蓝底纹表头）+ 代码块高亮与浅灰底框 + 图片智能校准与高清转换。



---

# 四、安装进阶与运维参考

## 安装器进阶与选项

安装器将白名单内的运行时文件（`agents/`、`commands/`、`plugins/`、`instructions/`、`opencode.jsonc`、`tui.json`、`profiles/`、`providers/`）复制到 `~/.config/opencode/`。其他所有内容（`.git/`、`install/`、`tests/`、`node_modules/` 等）保留在仓库中。

### 安装命令一览

| 模式 | PowerShell | Bash | 说明 |
|---|---|---|---|
| 安装（默认） | `pwsh install/install.ps1` | `./install/install.sh` | 将当前清单应用到目标目录 |
| 强制重装 | `pwsh install/install.ps1 install -Force` | `./install/install.sh install -f` | 重新应用相同版本 |
| 查看状态 | `pwsh install/install.ps1 status` | `./install/install.sh status` | 显示已安装版本与仓库版本 |
| 生成清单 | `pwsh install/install.ps1 generate` | `./install/install.sh generate` | 扫描仓库，写入清单（不安装） |
| 初始化（全新开始） | `pwsh install/install.ps1 init` | `./install/install.sh init` | 备份并清空整个目标目录 |
| 注册全局命令 | `pwsh install/install.ps1 register` | `./install/install.sh register` | 将 `opencode-config` shim 安装到 `~/.local/bin` |
| 注销全局命令 | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | 移除 shim |

### 安装选项（`options.jsonc`）

[`install/options.jsonc`](install/options.jsonc) 是控制安装配置的单一事实来源。修改后重新运行安装器（版本未变时用 `install -Force`）即可生效：

```jsonc
// install/options.jsonc
{
  // 是否启用 rtk 输出压缩
  "rtk": true,
  // 默认主控智能体（code / build / plan）
  "default_agent": "code",
  // MCP 服务开关（启用且缺失时自动拉取 CLI）
  "mcp": {
    "serena": true,
    "codegraph": true,
    "gitnexus": false,
    "dbhub": true
  },
  // 外部 npm 插件开关
  "plugin": {
    "@dietrichgebert/ponytail": true,
    "opencode-qoder-bridge": true,
    "@frankhommers/opencode-smart-title": true,
    "opencode-mem@2.24.3": false
  }
}
```

### Token 节省（rtk）

安装时自动配置 [rtk](https://github.com/rtk-ai/rtk) —— 一个在命令输出（git status、测试、构建等）到达模型前将其压缩 60-90% 的 CLI 代理。无需任何手动步骤：若 PATH 中没有 `rtk`，安装器会将固定版本的二进制下载到 `~/.local/bin`（SHA256 校验，Windows 上必要时自动加入用户 PATH）。opencode 钩子以仓库内置的 vendored [openrtk](https://github.com/martinstannard/openrtk) 插件（`plugins/openrtk.ts`）形式随配置分发 —— 透明地把 shell 命令经 rtk 重写，无需 `rtk init` 步骤；若之前通过 `rtk init -g --opencode` 装过官方插件，安装时会自动清理。安装后遥测默认关闭。

完全不需要时：在 `install/options.jsonc` 中设 `"rtk": false` 后重新安装 —— options 文件每次安装都会覆盖目标，因此跳过下载并自动从目标目录移除内置 openrtk 插件。事后移除二进制：删除 `~/.local/bin/rtk(.exe)`。

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

## 卸载与初始化

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
