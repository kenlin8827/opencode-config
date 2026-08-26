# 快速起步

开箱即用的 [OpenCode](https://opencode.ai) 配置：一支专家智能体团队、三种编排模式、分层 MCP 代码智能与数据库网关、一键模型预设、工作流斜杠命令、可选的项目级护栏 —— 一条命令安装到 `~/.config/opencode`。

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

> - Bun 仅在开发本仓库时需要（见 [DEVELOPING.md](https://github.com/kenlin8827/opencode-config/blob/main/DEVELOPING.md)）—— opencode 会在运行时编译内置的 TypeScript 插件。
> - Node.js 和 uv 仅在启用对应的 MCP 服务器时需要。在 `install/options.jsonc` 开启且本地缺失 CLI 时，安装器会自动调用 `npm` / `uv` 执行配置好的 `install` 命令。

---

## 快速上手

运行顶部的 [一键安装](#-10-秒一键安装) 之后，即可按需开始使用：

### 1. 立即启动开发（最常用）
在任意代码仓库根目录打开终端，输入 `opencode` 启动：
```bash
opencode
```
- **🎯 初始化项目环境（强烈推荐）**：首次进入项目运行 `/project init`，自动构建本地代码图谱与项目护栏。
- **连接服务商与预设**：运行 `/connect deepseek`（或 kimi、anthropic 等），然后运行 `/profile` 打开弹窗一键选择预设并自动分层分配模型！
- **直接对话编码**：默认即为 `@code` 模式，直接用自然语言描述需求即可。

### 2. 随时打开全景控制台（调整开关与 Agent 梯队）
在仓库目录下随时运行：
```powershell
# Windows
pwsh install/install.ps1

# macOS / Linux / WSL
./install/install.sh
```
即可进入 **单屏 TUI 全景控制台**，按空格键秒级切换启用的 MCP 服务、外部插件、RTK 令牌压缩器，或按空格键循环调整各 Agent 所属模型梯队（`default` / `code` / `advisor` / `explorer` / `vision`）。

### 3. 一键注册全局快捷命令（随时随地配置）
在向导菜单中选择 `🌐 注册全局快捷命令 (opencode-config)`，或执行：
```bash
opencode-config
```
后续在系统的任意路径下输入 `opencode-config`，均可秒级唤出全景控制台或安装向导！

---

## 🖥️ 交互界面与客户端选择

你可以根据个人习惯或场景灵活选择与 OpenCode 交互的前端：

| 客户端形态 | 推荐人群 | 核心优势 | 启动/使用方式 |
|---|---|---|---|
| **终端 TUI（默认）** | 命令行极客、SSH 远程开发 | 极轻量、极低资源占用、原生键盘流交互 | 终端直接执行 `opencode` |
| **OpenChamber 桌面端** | 偏好图形界面、精细 Code Review 用户 | **双栏可视化 Diff**、多模型并行对比与熔合（Fusion）、会话时间线管理 | 下载 [OpenChamber](https://openchamber.dev) 桌面应用或 VS Code 扩展 |
| **内置 Web 端** | 局域网访问、轻量浏览器体验 | 浏览器内即开即用，无需安装桌面额外程序 | 终端执行 `opencode serve` 并在浏览器打开 |

> 💡 **无缝兼容**：无论你选择哪种客户端，本项目安装在 `~/.config/opencode` 的 **17 个专家智能体、MCP 服务（CodeGraph / DBHub 等）与模型预设（Profiles）** 均会自动生效并完全共享。

---

### 进阶：自定义可选配置后再安装

若你想在安装前先按需开启或关闭特定功能（例如开启 `opencode-codex-bridge`、`opencode-claude-bridge` 桥接插件，或调整 Serena / CodeGraph / DBHub 等 MCP 开关、切换默认主控智能体）：

1. **克隆仓库**：
   ```bash
   git clone https://github.com/kenlin8827/opencode-config.git
   cd opencode-config
   ```
2. **编辑 `install/options.jsonc`**：
   按需调整各项开关（`true` / `false`），例如：
   ```jsonc
   // install/options.jsonc
   {
     // 是否启用 rtk 输出压缩（60-90% token 节省）
     "rtk": true,
     // 默认主控智能体（code: 直接开发 / build: 编排派发 / plan: 只读分析）
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
       // 会话标题智能自动生成
       "@frankhommers/opencode-smart-title": true,
       // 持久化项目记忆库（向量存储，空闲时产生额外 LLM 捕获调用）
       "opencode-mem@2.24.3": false
     }
   }
   ```
3. **执行安装**：
   ```bash
   # macOS / Linux / WSL
   ./install/install.sh

   # Windows (PowerShell)
   pwsh install/install.ps1
   ```
   > 💡 安装脚本会读取 `install/options.jsonc` 并自动应用至目标配置；若开启了尚未安装 CLI 的 MCP 服务，安装器会自动拉取。后续如需变更选项，只需修改该文件后带 `-Force`（或 `-f`）重新执行安装即可。

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

