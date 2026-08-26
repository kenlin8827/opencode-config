# 快速安装与全景控制台

开箱即用的 [OpenCode](https://opencode.ai) 生产级工程化配置：一支专家智能体团队、三种编排模式、分层 MCP 代码智能与数据库网关、一键模型预设、工作流斜杠命令、可选的项目级护栏 —— 一条命令安装到 `~/.config/opencode`。

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

> 💡 **零风险平滑升级**：已安装的用户重复执行上述命令可直接升级到最新版本，你的 **API 密钥、自定义模型和模型梯队选择均会完整保留**，不会丢失。

---

## 单屏 TUI 全景控制台

执行安装命令后（或后续随时在终端运行全局命令 `ocp` / `opencode-prime`），终端将直接唤出 **单屏 TUI 全景控制台**：

![OpenCode TUI 全景控制台](/images/tui-dashboard-zh.webp)

### 核心功能与交互说明

- **实时微调**：按空格键秒级切换启用的 MCP 服务、外部插件、RTK 令牌压缩器，或按空格键循环调整各 Agent 所属模型梯队（`flash` / `standard` / `pro` / `max` / `vision`）；
- **快捷键指南**：
  - `↑` / `↓` 或 `j` / `k`：上下移动光标选择配置项
  - `Space`（空格键）：切换 MCP/插件开关，或循环切换 Agent 梯队
  - `Enter`（回车键）：执行当前选中的操作（如“保存配置并执行安装”）
  - `L` 键：即时切换控制台显示语言（中/英）
  - `Q` 键：退出控制台

---

## 全局快捷命令 (`ocp` / `opencode-prime`)

安装完成后，系统已自动注册全局快捷命令。你可以在**任意终端路径下**直接输入以下任一命令：

```bash
ocp              # 极简 3 字母直达（推荐）
opencode-prime   # 完整品牌命令
opencode-config  # 兼容命令
```

后续无需记住复杂的安装路径，即可随时秒级唤出全景控制台进行配置微调或一键平滑升级！

---

## 核心特性矩阵

| 特性 | 对你的意义 |
|---|---|
| **专家智能体团队** | 21 位专家（`@java-dev`、`@security`、`@dba`、`@frontend-dev`、`@fast-coder` 等），提示词按领域调优，自动路由 |
| **三种工作模式** | `@code`（直接开发，默认）、`@build`（编排执行）、`@plan`（只读分析）—— 可在 `install/options.jsonc` 中切换 |
| **代码智能与数据库（MCP）** | 预配置 MCP 服务（Serena LSP、CodeGraph 图谱、GitNexus、DBHub 数据库网关），开箱按需自动装 CLI |
| **配置预设（Profiles）** | `/profile` 一次性把 5 个模型层级映射到某服务商的模型 —— 无需逐智能体 `set model` |
| **工作流斜杠命令** | `/review-fix-loop`、`/goal`、`/handoff`、`/grill-me`、advisor 模式等 |
| **可选护栏** | 按项目启用的 ADR 强制（`/adr-guard`）、密钥文件门控（`env-guard`）、E2E 门控（`/e2e-guard`）、提交纪律（`/project`）—— 全部默认关闭 |
| **一键安装器** | PowerShell + Bash 双平台，基于清单升级；凭证和模型选择在每次重装后完好保留 |
| **Token 节省** | 安装时自动配置 [rtk](https://github.com/rtk-ai/rtk) 输出压缩（60–90%） |
| **第二意见顾问** | `@advisor` 为阻塞性决策提供独立意见，设计审查时可切换对抗式 red-team 立场 |

---

## ⚖️ 方案横向对比（为什么选择 OpenCode Prime？）

| 核心维度 / 场景 | 官方原生 (Vanilla OpenCode) | omp (`omp.sh`) | **OpenCode Prime (`OCP`)** |
| :--- | :--- | :--- | :--- |
| **核心哲学** | 极简单会话驱动 | 电池全装的独立智能体外壳（Rust 核心，直接替换运行时） | **基于 OpenCode 的生产级工程纪律 + 精准分级掌控** |
| **日常微调 / 快速修 Bug** | ✅ 快速（单模型） | ✅ 快速（单智能体，`smol` 角色） | ⚡ **`/quick-dev` 闪电秒级交付（零委托开销）** |
| **敏捷特性交付** | ⚠️ 无内置审查闭环 | ⚠️ 单轨推进，`/review` 判级在交付之后 | 🚀 **`/fast-dev` 敏捷单审闭环（修复在闭环内收敛）** |
| **核心架构与重大重构** | ❌ 无多模型审查能力 | ⚠️ `/review` 按 P0–P3 判级，但单一审查者、无仲裁 | 🧠 **`/deep-dev` 旗舰双审 + `@advisor` 安全仲裁机制** |
| **Token 消耗与成本** | 🟢 低 | 🟢 高效（hashline 锚定编辑、进程内工具） | 🟢 **精细治理（Tier 路由 + RTK 60–90% 输出压缩）** |
| **代码情报与索引** | 基础文本搜索 / Grep | 🟢 内置 LSP/DAP/AST（需自备各语言服务器） | 🧭 **Serena (LSP) + CodeGraph (调用图) + GitNexus + DBHub (数据库网关)** |
| **工程守卫 (Guardrails)** | ❌ 无 | ⚠️ 流式规则纠偏模型行为（无策略级治理） | 🛡️ **策略级治理：ADR/MADR 强制 + Secret 拦截 + E2E 门控 + 提交纪律** |
| **环境与配置管理** | 手动修改 JSON | 交互式 `omp setup`，角色制模型路由 | 🖥️ **交互式 TUI 仪表盘 + `/profile` 预设（含国内 Coding Plan）** |
| **升级体验** | 手动替换 | 二进制重装 | 🔄 **基于清单的零风险升级（Key 与配置完整保留）** |

### 🎯 选型建议指引
* **选择官方原生 (Vanilla)**：只需最基础的单文件代码补全或简单对话，不涉及复杂工程重构与多 Agent 协作。
* **选择 `omp.sh`**：希望开箱即得一个电池全装的独立外壳（原生 LSP/DAP/浏览器/记忆），并且愿意整体替换现有运行时。
* **选择 OpenCode Prime**：**真实企业与商业代码库开发**——在 OpenCode 生态内需要显式交付分档、多模型审查门控、可审计的策略级护栏与国内服务商治理。

---

## 下一步：项目初始化

安装好全局配置后，**进入任意代码仓库后的黄金第一步就是运行 `/project init`**，自动构建本地代码知识图谱与工程护栏：

👉 **前往查看：[项目初始化与工程护栏](/zh/getting-started/project-init)**
