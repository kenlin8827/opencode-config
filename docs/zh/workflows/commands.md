# 工作流斜杠命令

OpenCode 多智能体配置自带一系列生产级工作流斜杠命令。

---

## 命令一览表

| 命令 | 分类 | 说明 |
|---|---|---|
| **`/prd <topic>`** | SDD 规范驱动 | 在 `docs/prd/` 中脚手架生成并起草需求规格说明书 (PRD) |
| **`/adr [new\|supersede\|tree\|check\|migrate\|mode]`** | 架构治理 | 架构决策记录（ADR）治理：自动起草、生命周期替代、DAG 拓扑树、完整性体检、双向分层重构与模式切换 |
| **`/plan <topic>`** | SDD 规范驱动 | 在 `docs/plan/` 中脚手架生成并起草分阶段实施计划 (PLAN)，自动关联 PRD 与 ADR |
| **`/impl [task]`** | SDD 规范驱动 | 依照 PRD/ADR/Plan 规范执行测试驱动编码实现与质量验证 |
| **`/sdd [status\|handoff\|help]`** | SDD 规范驱动 | 规范驱动开发导航、制品状态检查与专属跨会话暂存交接（`/sdd handoff`） |
| **`/grill-me <topic>`** | 架构与构思 | 逐题逼问式苏格拉底访谈，全方位磨砺需求与技术设计 |
| **`/grill-with-docs <topic>`** | 架构与构思 | 同 `/grill-me`，同时自动沉淀 `CONTEXT.md` 领域术语表与对应 ADR |
| **`/review-fix-loop [scope] [--max-rounds=N]`** | 质量自动化 | 自动化 审查→验证→修复→复审 循环，直到没有 P0/P1。范围：`last commit`、`HEAD~N`、`branch`、`PR`，或空（未提交变更） |
| **`/goal [text]`** | 自动化协议 | 结构化目标执行协议，包含审计友好的验收清单和可机械检测的停止条件 |
| **`/handoff [focus]`** | 状态交接 | 将当前会话状态压缩为轻量交接包（存至系统临时目录），生成新会话一键恢复开场白 |
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

## 示例：review-fix-loop

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
