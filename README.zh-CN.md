# OpenCode Prime (OCP)

> **OpenCode 旗舰级生产工程与多智能体研发套件**

开箱即用的 [OpenCode](https://opencode.ai) 旗舰级生产工程与多智能体研发套件：分层 MCP 代码智能与数据库网关、全链路工程护栏（ADR 铁律 / 密钥防护 / E2E 门控 / 提交纪律）、21 位专家智能体协作与一键模型分层治理 —— 一条命令安装到 `~/.config/opencode`。

> [English](README.md) | **中文** | 📖 **[在线文档站 (GitBook / Docs)](https://kenlin8827.github.io/opencode-prime/zh/)**
>
> 本 README 是用户手册。如果你想修改本仓库本身（智能体、插件、测试、发布），请看 **[DEVELOPING.md](DEVELOPING.md)**。

---

## ⚡ 10 秒一键安装

无需手动克隆仓库，复制并在终端中运行单行命令即可直接安装到 `~/.config/opencode`：

### macOS / Linux / WSL
```bash
curl -fsSL https://github.com/kenlin8827/opencode-prime/releases/latest/download/opencode-prime-latest.tar.gz -o /tmp/ocp.tar.gz && tar xzf /tmp/ocp.tar.gz -C /tmp && bash /tmp/opencode-prime-*/install/install.sh
```

### Windows (PowerShell)
```powershell
$url = "https://github.com/kenlin8827/opencode-prime/releases/latest/download/opencode-prime-latest.zip"; Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\ocp.zip"; Expand-Archive -Path "$env:TEMP\ocp.zip" -DestinationPath "$env:TEMP\ocp" -Force; & (Get-ChildItem "$env:TEMP\ocp\opencode-prime-*\install\install.ps1").FullName
```

> 💡 **零风险平滑升级**：已安装的用户重复执行上述命令可直接升级到最新版本，你的 API 密钥、自定义模型和层级选择均会**完整保留**。

<p align="center" style="margin-top: 18px;">
  <img src="./docs/public/images/tui-dashboard-zh.webp" alt="OpenCode TUI 全景控制台" width="880"/>
</p>

---

<details>
<summary><b>📑 点击展开完整目录导航 (Table of Contents)</b></summary>

- [一、快速起步](#一快速起步)
  - [你将获得什么（特性矩阵）](#你将获得什么)
  - [定位对比：omp 与 OpenCode Prime](#定位对比omp-与-opencode-prime)
  - [前置条件](#前置条件)
  - [快速上手（4 步实操）](#快速上手)
- [二、核心能力与日常使用](#二核心能力与日常使用)
  - [日常使用与工作模式](#日常使用与工作模式)
    - [Code 模式（默认主力）](#code-模式默认)
    - [Co-worker 模式（共创结对编程）](#co-worker-模式共创)
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
    - [规范驱动开发（SDD）](#规范驱动开发-sdd)
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

## ✨ 你将获得什么

| 特性 | 对你的意义 |
|---|---|
| **专家智能体团队** | 21 位专家（`@java-dev`、`@security`、`@dba`、`@frontend-dev`、`@fast-coder` 等），提示词按领域调优，自动路由 |
| **四种工作模式** | `@code`（直接开发，默认）、`@coworker`（共创结对编程，真实客户需求框定）、`@build`（编排执行）、`@plan`（只读分析）—— 可在 `install/options.jsonc` 中切换 |
| **代码智能与数据库（MCP）** | 预配置 MCP 服务（Serena LSP、CodeGraph 图谱、GitNexus、DBHub 数据库网关），开箱按需自动装 CLI |
| **配置预设（Profiles）** | `/profile` 一次性把 5 个模型层级映射到某服务商的模型 —— 无需逐智能体 `set model` |
| **工作流斜杠命令** | `/quick-dev` · `/fast-dev` · `/deep-dev` · `/ultra-dev` 开发闭环、`/review-fix-loop`、`/grill-improve-loop`、`/goal`、`/handoff`、`/grill-me`、advisor 模式等 |
| **可选护栏** | 按项目启用的 ADR 强制（`/adr-guard`）、密钥文件门控（`env-guard`）、E2E 门控（`/e2e-guard`）、提交纪律（`/project`）—— 全部默认关闭 |
| **一键安装器** | PowerShell + Bash 双平台，基于清单升级；凭证和模型选择在每次重装后完好保留 |
| **Token 节省** | 安装时自动配置 [rtk](https://github.com/rtk-ai/rtk) 输出压缩（60–90%） |
| **第二意见顾问** | `@advisor` 为阻塞性决策提供独立意见，设计审查时可切换对抗式 red-team 立场 |

---

## ⚖️ 定位对比：omp 与 OpenCode Prime

两种电池，装在两种车上。omp 自建并交付一个原生运行时；OCP 则把工程纪律的电池装进你正在使用的 OpenCode。

| 维度 | omp (`omp.sh`) | **OpenCode Prime (`OCP`)** |
| :--- | :--- | :--- |
| **与运行时的关系** | 独立智能体外壳——替换你的 Agent 运行时 | ⚡ **零迁移的纪律层——保留 OpenCode 运行时、插件与全部配置** |
| **开箱能力侧重** | 🔧 原生工具火力：~8 万行 Rust 核心、hashline 编辑、内置 LSP/DAP、记忆、浏览器、协作 | 🧰 工程纪律火力：21 位专家智能体、MCP 代码智能、`/profile` 预设、护栏、工作流命令 |
| **交付分档** | 魔法关键词（`ultrathink` / `orchestrate`），单轨自主推进 | 🏆 **`/quick-dev` · `/fast-dev` · `/deep-dev` · `/ultra-dev` 显式人选档位，可写入团队 SOP** |
| **调度与编排** | 🟢 `task` 子智能体扇出至隔离工作树，类型化结果，实时监督面板 | 🏆 **`@build` 编排器 + 预定义角色流水线（执行计划先公示再执行）+ 分级模型调度（Flash 写码、旗舰审查）+ 动态领域人格注入 + 失败自动重试并原任务续跑** |
| **审查门控** | `/review` 事后判级 P0–P3，单一审查者 | 🏆 **`/deep-dev` 旗舰双审 + `@advisor` 安全仲裁，修复在闭环内收敛** |
| **规范驱动生命周期** | 无内置（需外接工具） | 🏆 **`/prd` → `/plan`（自动链接 PRD 与 ADR）→ `/impl` → `/sdd handoff` 完整 SDD 生命周期** |
| **工作流命令套件** | `ultrathink` / `orchestrate` / `workflowz` 关键词 | 🏆 **`/grill-me` 苏格拉底式方案拷问 + `/review-fix-loop` 自动修复至零 P0/P1 + `/grill-improve-loop` 评分驱动改进闭环 + `/goal` 机械可校验的停止条件 + `/handoff` git-safe 会话交接包** |
| **Token 与成本治理** | hashline 编辑省 token + 进程内高效工具 | 🏆 **五级智能体—模型路由（`tiers.json`）+ RTK 代理层输出压缩 60–90%，安装时自动配置** |
| **工程护栏** | 流式规则实时纠偏模型行为 | 🏆 **可审计的策略级门控：ADR/MADR 强制 + 密钥文件拦截 + E2E 门控 + 提交纪律** |
| **代码情报** | 🟢 内置 LSP/DAP/AST（14 LSP + 28 DAP 操作） | Serena LSP + CodeGraph 调用图 + GitNexus + DBHub 数据库网关 |
| **服务商治理** | 60+ 服务商，角色制路由 | 🏆 **`/profile` 一键五级映射——36 个预设全覆盖 OpenCode 内置官方模型族（opencode-go）及 Anthropic / OpenAI / Google / DeepSeek 等一线服务商、路由器方案，国内 Coding Plan 一等公民；TUI 仪表盘** |
| **升级安全性** | 二进制重装 | 🏆 **基于清单的零风险升级——每次重装后 Key 与模型选择完整保留** |
| **文档** | 英文 | 🏆 **完整双语文档树（English + 中文）** |
| **生态与扩展性** | 🟢 TS 扩展模块、插件热重载，兼容继承 8 种已有配置格式 | 🏆 **骑在 OpenCode 生态上——整个 npm 插件库、MCP 生态与社区资产直接复用；OCP 自身亦由 30+ 可插拔插件组合而成** |
| **客户端 / UI 面** | 终端 TUI + Zed（ACP）+ 协作观看页 | 🏆 **TUI + 浏览器 Web UI + OpenChamber 桌面 GUI（并列差异对比、多模型对比）——同一套配置全端共享，零重复配置** |

### 🎯 怎么选？
* **选择 `omp.sh`**：想要一个电池全装的原生外壳，并且愿意整体替换运行时——它的 Rust 工具链、hashline 编辑和 DAP 调试确实出色。
* **选择 OpenCode Prime**：在 OpenCode 上做**真实商业软件**，想要显式交付分档、多模型审查门控、可审计的策略护栏和国内服务商治理——不离开你已投入的生态。
* **两者可以共存**：omp 作为独立火力工具，OCP 作为 OpenCode 技术栈内的团队纪律。

---

## 📋 前置条件

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

## 🚀 快速上手

运行顶部的 [一键安装](#-10-秒一键安装) 之后，即可按需开始使用：

### 1. 立即启动开发（最常用）
在任意代码仓库根目录打开终端，输入 `opencode` 启动：
```bash
opencode
```
- **🎯 初始化项目环境（强烈推荐）**：首次进入项目运行 `/project init`，自动构建本地代码图谱（CodeGraph + Serena LSP）与工程护栏（ADR + 敏感密钥防护）：
  <p align="center" style="margin-top: 10px;">
    <img src="./docs/public/images/tui-project-wizard-zh.webp" alt="Project Wizard 交互向导" width="880"/>
  </p>
- **连接服务商与预设**：运行 `/connect deepseek`（或 kimi、anthropic 等），然后运行 `/profile` 打开弹窗一键选择预设并自动分层分配模型！
- **直接对话编码**：默认即为 `@code` 模式，直接用自然语言描述需求即可。

### 2. 单屏 TUI 全景控制台（调整开关与 Agent 梯队）
执行安装命令后（或后续随时在终端输入 `ocp` / `opencode-prime`），终端将直接唤出 **单屏 TUI 全景控制台**，按空格键秒级切换启用的 MCP 服务、外部插件、RTK 令牌压缩器，或按空格键循环调整各 Agent 所属模型梯队（`flash` / `standard` / `pro` / `max` / `vision`）：

<p align="center">
  <img src="./docs/public/images/tui-dashboard-zh.webp" alt="OpenCode TUI 全景控制台" width="880"/>
</p>

> 💡 **快捷键操作指南**：`↑/↓` 移动光标，`Space` 空格键切换/轮换，`Enter` 回车执行操作，`L` 键秒级切换语言（中/英），`Q` 退出。

### 3. 随时随地调出控制台 (`ocp` / `opencode-prime`)
安装完成后，在系统的**任意终端路径下**直接输入以下任一命令：
```bash
ocp              # 极简 3 字母直达（推荐）
opencode-prime   # 完整品牌命令
opencode-config  # 兼容命令
```
即可秒级再次唤出全景控制台进行配置微调或一键平滑升级！

---

### 开发者方式：克隆仓库安装

如果你想参与本配置的开发或通过 Git 管理修改，可使用克隆方式：

```bash
# 1. 克隆仓库
git clone https://github.com/kenlin8827/opencode-prime.git
cd opencode-prime

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

### Co-worker 模式（共创）

切换到 `@coworker` 获取一位共创结对编程搭档 —— 它将每个任务框定为真实客户的需求：高利害责任（“客户在看着我们交付，不要让他们质疑我们的能力”）加上“你不是一个人在战斗”的战友协作动态。如果有任何需求不清楚，共创者会替你把问题传达给客户（用户）并带回明确答案，而不是猜测：

```
> @coworker 客户需要一个带模糊匹配的分页用户搜索 API
  → 框定利害关系，规划攻击路线，与你共同实现
  → 需求模糊时问你（而不是猜）
  → 报告完成前验证构建 + 测试
```

当你想要额外的动力和协作式的来回讨论时，使用 `@coworker` —— 一位把你任务当作真实交付物而非玩具的高级搭档。

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

通过 Tab 或 `@code` / `@coworker` / `@build` / `@plan` 在四种模式之间切换。

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

被覆盖层级的所有智能体会被统一重写为预设的 `provider/model_id` 引用，根级 `model` 跟随 `standard` 层级。预设未列出的层级保持不变。应用前会校验所有内容；热应用路径由服务端用 patch 方式写 `opencode.jsonc`（保留注释），降级路径会先备份 `opencode.jsonc.bak` 再全量重写，且需重启生效。注意：热应用会销毁重建服务端 instance，切换瞬间正在进行的回复流可能被中断（会话历史不受影响）。

### 模型路由与层级架构

系统使用 5 个模型层级，每个层级映射到一组智能体：

| 层级 | 用途 | 智能体 |
|---|---|---|
| `flash` | 快速，轻量，代码粗筛，高吞吐 | explorer, fast-coder |
| `standard` | 通用编排中枢，高吞吐主力（根模型） | build, plan, researcher, tech-writer |
| `pro` | 专业全栈工程，代码生成与实现 | code, java/python/go/rust/node-dev, frontend-dev, qa, dba, devops |
| `max` | 深度推理，系统架构，安全合规，严苛审查 | advisor, architect, security, code-review |
| `vision` | 图像理解与多模态分析 | vision |

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

| 命令 | 分类 | 说明 |
|---|---|---|
| **`/prd <topic>`** | SDD 规范驱动 | 在 `docs/prd/` 中脚手架生成并起草需求规格说明书 (PRD)（详见 [规范驱动开发 (SDD)](#规范驱动开发-sdd)） |
| **`/adr [new\|supersede\|tree\|check\|migrate\|mode]`** | 架构治理 | 架构决策记录（ADR）治理：自动起草、生命周期替代、DAG 拓扑树、完整性体检、双向分层重构与模式切换（详见 [ADR 铁律](#adr-铁律adr-guard)） |
| **`/plan <topic>`** | SDD 规范驱动 | 在 `docs/plan/` 中脚手架生成并起草分阶段实施计划 (PLAN)，自动关联 PRD 与 ADR |
| **`/impl [task]`** | SDD 规范驱动 | 依照 PRD/ADR/Plan 规范执行测试驱动编码实现与质量验证 |
| **`/sdd [status\|handoff\|help]`** | SDD 规范驱动 | 规范驱动开发全链路导航、制品状态检查与跨会话暂存交接（`/sdd handoff`） |
| **`/grill-me <topic>`** | 架构与构思 | 逐题逼问式苏格拉底访谈，全方位磨砺需求与技术设计 |
| **`/grill-with-docs <topic>`** | 架构与构思 | 同 `/grill-me`，同时自动沉淀 `CONTEXT.md` 领域术语表与对应 ADR |
| **`/quick-dev <task>`** | 闭环开发 | **Quick-Dev 极速免审直通**：Flash 极速编码 + 动态领域灵魂注入（零审查开销，出码即交付，别名 `/flash-dev`，详见 [四阶闭环开发](docs/zh/workflows/dev-loops.md)） |
| **`/fast-dev <task> [--max-rounds=N]`** | 闭环开发 | **Fast-Dev 敏捷单审闭环**：Flash 模型极速编码（动态注入领域灵魂） + 旗舰单审证据驱动严苛把关，多轮迭代直至通过（默认上限 10 轮） |
| **`/deep-dev <task> [--max-rounds=N]`** | 闭环开发 | **Deep-Dev 深度双审共识闭环**：Flash 模型编码 + 双旗舰顶级会审（需求 100% 对齐 + 质量与安全防线） + Advisor 争议仲裁共识，支持全栈多阶段拆解汇总（默认上限 10 轮） |
| **`/ultra-dev <objective> [--max-rounds=N] [--max-phases=N]`** | 闭环开发 | **Ultra-Dev 自主多阶段闭环**：端到端自主执行 —— 将大型目标分解为多阶段，每阶段独立 `/deep-dev` 循环 + 上下文压缩 + 逐阶段 Git 提交隔离 + 支持 `--resume` 断点续跑（默认上限 6 阶段，详见 [四阶闭环开发](docs/zh/workflows/dev-loops.md)） |
| **`/review-fix-loop [scope] [--max-rounds=N]`** | 质量自动化 | 自动化 审查→验证→修复→复审 循环，直到没有 P0/P1。范围：`last commit`、`HEAD~N`、`branch`、`PR`，或空（未提交变更） |
| **`/grill-improve-loop [subject] [--max-rounds=N] [--target=N]`** | 评分驱动闭环 | 评分驱动改进闭环：评分→分析改进路径→修复/重构→验证→重新评分，直到结构性天花板、停滞或最大轮次。每轮触发 verification-honesty 评分机制（规则 5–7） |
| **`/goal [text]`** | 自动化协议 | 结构化目标执行协议，包含审计友好的验收清单和可机械检测的停止条件 |
| **`/handoff [focus]`** | 状态交接 | 将当前会话状态压缩为轻量交接包（存至 Git 忽略的 `.opencode/handoffs/`），生成新会话一键恢复开场白 |
| **`/adr-guard [on\|off\|status]`** | 质量硬门禁 | 项目级 ADR 提交铁律门禁：拦截缺少架构决策记录的 `feat:` 与 `refactor:` 提交 |
| **`/e2e-guard [on\|off\|status]`** | 质量硬门禁 | 项目级 E2E 测试硬门禁：在功能变更和 Bug 修复时强制进行端到端测试覆盖检查 |
| **`/env-guard [on\|off\|status]`** | 安全护栏 | 项目级敏感信息防泄漏护栏：拦截读取或向 Bash 暴露 `.env` 等凭据的行为 |
| **`/deepseek-anchor [on\|off\|status]`** | 模型增强 | DeepSeek V4/Pro 深度思考锚定插件：防止思考过程退化，并在推理阶段实施工具阻断 |
| **`/auto-advisor [off\|lite\|full]`** | 智能决策 | 切换 Advisor 智能决策模式（`off` 关闭 / `lite` 决策建议 / `full` 事实类自动代答） |
| **`/md-to-pdf <file.md> [output.pdf]`** | 出版级导出 | Markdown 一键转高清 A4 PDF，支持 300 DPI Mermaid 图表、CSS 样式定制与 `--doctor` 自检修复 |
| **`/md-to-docx <file.md> [output.docx]`** | 出版级导出 | Markdown 导出为行政级 Word (.docx)，支持纯 TS 引擎、中西双字排版、Mermaid 渲染与样式定制 |
| **`/project [init\|index\|sync]`** | 项目管理 | 脚手架生成项目基线文件（`.opencode/opencode.jsonc` 等），并自动触发 CodeGraph 与 GitNexus 索引 |
| **`/project-wizard`** | 交互向导 (TUI) | 打开交互式项目配置向导：通过终端可视化菜单一键开启或关闭各项 MCP 服务与功能插件 |
| **`/profile`** | 交互向导 (TUI) | 打开模型预设弹窗选择器：一键切换或精细配置 Auto / Ultimate / Performance / Economy / Lightweight 各层级模型 |
| **`/provider`** | 交互向导 (TUI) | 打开服务商向导：为已激活或仓库自带的服务商配置凭证（baseURL / apiKey），管理模型清单 |
| **`/queued`** | 交互向导 (TUI) | 打开排队消息管理对话框：实时查看、编辑或取消在会话忙碌期间提交的排队提示词 |

---

## 规范驱动开发 (SDD)

规范驱动开发（Specification-Driven Development）建立了一套规格先行的工程化研发流程：

> **`PRD (需求规格)` → `ADR (架构决策)` → `PLAN (实施计划)` → `IMPL (编码执行与验证)`**

### 核心特性

1. **任意阶段起手**：
   - 需求构思 → `/prd <feature>` 生成 `docs/prd/<feature>.md`
   - 技术选型 → `/adr <decision>` 生成 `docs/adr/` 架构决策记录
   - 任务分解 → `/plan <feature>` 生成 `docs/plan/<feature>.md`
   - 快速实现 → 直接 `/impl <task>` 测试驱动编码
2. **交互式阶段流转提示（Ask Tool）**：
   - 每个阶段完成时，系统主动弹出交互选项，提供**推荐下一阶段**（如 `/prd` → `/adr`）、**自由跳级**（如 `/prd` 直接跳至 `/impl`）、**阶段回退**与**留在当前阶段**。
3. **与独立 ADR 治理体系（adr-guard）的协同分工**：
   - **`adr-guard`（独立专业引擎）**：独立拥有 `/adr new`、`/adr supersede`、`/adr tree`、`/adr check`、单层扁平/三层分层模式以及 Git 提交铁律门禁。
   - **`sdd`（生命周期编排者）**：负责将 PRD 需求注入 ADR 决策依据，并在 `/plan` 中自动引用最近关联的 ADR 与 PRD。

---


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
| `quick-dev.ts` | `/quick-dev` (及 `/flash-dev`) 命令与协议 —— 极速免审直通：Flash 极速编码 + 动态领域灵魂注入（零审查开销，出码即交付） |
| `fast-dev.ts` | `/fast-dev` 命令与协议 —— 敏捷单审闭环：Flash 极速编码（动态注入领域灵魂） + 旗舰单审证据驱动把关 |
| `deep-dev.ts` | `/deep-dev` 命令与协议 —— 深度双审共识闭环：Flash 编码 + 双旗舰顶级会审 + Advisor 争议仲裁 |
| `review-fix-loop.ts` | `/review-fix-loop` 命令与协议 |
| `grill-improve-loop.ts` | `/grill-improve-loop` 命令与协议 —— 评分驱动改进闭环 |
| `ultra-dev.ts` | `/ultra-dev` 命令与协议 —— 自主多阶段执行闭环 |
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

支持 `/adr` 全套命令（`/adr new`、`/adr supersede`、`/adr tree`、`/adr check`、`/adr migrate`、`/adr mode`）及**自然语言直接交互**（自动调研背景、编写选型对比、落盘 MADR 并同步索引）。


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
| 注册全局命令 | `pwsh install/install.ps1 register` | `./install/install.sh register` | 将 `opencode-prime`、`ocp` 与 `opencode-config` shim 安装到 `~/.local/bin` |
| 注销全局命令 | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | 移除全局 shims |

### 安装选项（`options.jsonc`）

[`install/options.jsonc`](install/options.jsonc) 是控制安装配置的单一事实来源。

#### 1. 安装前自定义选项
若你在初次安装前希望按需开启或关闭特定功能（如开启 `opencode-qoder-bridge`、`opencode-mem` 插件，或调整 Serena / CodeGraph / DBHub 等 MCP 服务开关、切换默认主控智能体为 `code`/`build`/`plan`）：
1. 克隆本仓库或解压 release 包并进入目录：`cd opencode-prime`
2. 编辑 `install/options.jsonc` 调整开关（`true` / `false`）：
   ```jsonc
   // install/options.jsonc
   {
     // 是否启用 rtk 输出压缩（60-90% token 节省）
     "rtk": true,
     // 默认主控智能体（code: 直接开发 / coworker: 共创结对编程 / build: 编排派发 / plan: 只读分析）
     "default_agent": "code",
     // MCP 服务开关（启用且本地缺失 CLI 时自动拉取安装）
     "mcp": {
       // Serena LSP 语义代码检索与符号分析（需 uv / Python 3.13+）
       "serena": true,
       // CodeGraph AST 代码知识图谱（需 npm）
       "codegraph": true,
       // GitNexus 代码图谱（PolyForm 非商用许可；需自行索引）
       "gitnexus": false,
       // DBHub 通用数据库网关（PostgreSQL / MySQL / SQLite 等；需 npm）
       "dbhub": true
     },
     // 外部 npm 插件开关（true: 启用; false: 关闭）
     "plugin": {
       // 偷懒编码协议：实现目标并指出更轻量的替代方案
       "@dietrichgebert/ponytail": true,
       // Qoder 订阅桥接（通过官方 SDK 注入 qoder 服务商及模型，需 qoder login）
       "opencode-qoder-bridge": false,
       // 持久化项目记忆库（向量存储，空闲时产生额外 LLM 捕获调用）
       "opencode-mem@2.24.3": false
     }
   }
   ```
3. 执行安装：
   ```bash
   # macOS / Linux / WSL
   ./install/install.sh

   # Windows (PowerShell)
   pwsh install/install.ps1
   ```

#### 2. 安装后修改与生效
后续如需变更选项，只需再次编辑 `install/options.jsonc`，并在版本未变时带 `-Force` / `-f` 参数重新安装即可生效：
```powershell
pwsh install/install.ps1 install -Force
```
```bash
./install/install.sh install -f
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

### 全局快捷命令 (`ocp` / `opencode-prime`)

首次安装后，可将仓库注册为全局快捷命令（`ocp`、`opencode-prime` 与 `opencode-config`）：

```powershell
pwsh install/install.ps1 register              # shims 位于 ~/.local/bin
pwsh install/install.ps1 register -BinDir C:\Tools\bin  # 自定义目录
```

```bash
./install/install.sh register
./install/install.sh register --bin-dir ~/bin
```

`register` 创建的是跳板脚本，会重新执行仓库内的调度脚本，因此 `git pull` 后命令立即更新。它拒绝覆盖不是自己创建的文件。将 `~/.local/bin` 加入用户 PATH 后即可在任意目录执行：

```powershell
ocp status
ocp install -Force
ocp unregister   # 移除全局 shims
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

这会移除所有智能体、命令、插件、指令和配置。`~/.config/opencode/.metrics/` 中的指标也会被删除。如果注册过全局命令，请先运行 `ocp unregister`（或删除 `~/.local/bin` 中的 shims）。

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
