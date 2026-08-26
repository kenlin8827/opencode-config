# 客户端与交互界面

OpenCode 拥有开放的前端生态。无论你习惯纯键盘流的终端环境，还是偏好现代图形化的双栏 Diff 审查，均可根据场景灵活切换。

---

## 多端形态一览

| 客户端形态 | 推荐人群 | 核心优势 | 启动 / 使用方式 |
|---|---|---|---|
| **终端 TUI（默认）** | 命令行极客、SSH 远程开发 | 极轻量、毫秒级响应、原生键盘流交互 | 终端直接执行 `opencode` |
| **OpenChamber 桌面端** | 偏好图形界面、精细 Code Review 用户 | **双栏可视化 Diff**、多模型并行对比与熔合（Fusion）、会话时间线管理 | 下载 [OpenChamber](https://openchamber.dev) 桌面应用或 VS Code 扩展 |
| **内置 Web 端** | 局域网访问、轻量浏览器体验 | 浏览器内即开即用，无需安装桌面额外程序 | 终端执行 `opencode serve` 并在浏览器打开 |

---

## 配置无缝共享机制

无论你选择哪种客户端形态，本项目安装在 `~/.config/opencode` 的全部工程能力均会自动生效并完全共享：

- **21 位专家智能体团队**：`@java-dev`、`@security`、`@dba` 等随时调度；
- **MCP 代码智能服务**：Serena LSP 语言服务、CodeGraph 图谱分析、DBHub 数据库网关开箱即用；
- **模型分层预设（Profiles）**：`/profile` 配置的模型映射在所有客户端完全一致；
- **项目级工程护栏**：ADR 门控、密钥防护与提交规范在各端统一拦截。

你可以随时在终端 TUI、桌面端与 Web 端之间无缝切换，无需重复配置！

---

## 下一步

- 查看快速安装指南：**[快速安装与全景控制台](/zh/getting-started/)**
- 查看项目初始化：**[项目初始化与工程护栏](/zh/getting-started/project-init)**
- 查看环境要求：**[环境要求与源码开发](/zh/getting-started/prerequisites)**
