# 工作流斜杠命令

OpenCode 多智能体配置自带一系列生产级工作流斜杠命令。

---

## 命令一览表

| 命令 | 说明 |
|---|---|
| `/auto-advisor off\|lite\|full` | 切换 advisor 模式 |
| `/provider` | 打开服务商向导（仅限 TUI）：为已激活或仓库自带的服务商配置凭证（baseURL → apiKey 输入），或管理服务商的模型清单 |
| `/profile` | 打开弹窗选择器：列出所有可用的模型服务商预设（活跃项带标记）；选中预设后进入层级审阅，可逐个 tier 选择模型并一键应用 |
| `/review-fix-loop [scope] [--max-rounds=N]` | 自动化 审查→验证→修复→复审 循环，直到没有 P0/P1。范围：`last commit`、`HEAD~N`、`branch`、`PR`，或空（未提交变更）。`--max-rounds=N` 覆盖默认 5 轮 |
| `/goal [text]` | 结构化目标执行协议，包含审计友好的验收清单和可机械检测的停止条件 |
| `/handoff [focus]` | 将当前会话压缩为一份交接文档（保存到操作系统临时目录），让新会话能接手工作 |
| `/project init` | 脚手架生成项目基线文件（`.opencode/opencode.jsonc`、`docs/git-commits.md`、`AGENTS.md`）并执行 `codegraph init` 与 `gitnexus analyze` 后端索引 |
| `/project index` | 手动刷新已有索引：`codegraph sync`、`gitnexus analyze` |
| `/project sync` | 只做配置补齐：把模板中新增、而现有 `.opencode/opencode.jsonc` 还没有的开关注释行追加进去 |
| `/grill-me <topic>` | 逐题逼问式访谈，磨砺计划或设计 |
| `/grill-with-docs <topic>` | 同 `/grill-me`，同时创建 `CONTEXT.md` 术语表和 ADR |
| `/adr [new\|supersede\|tree\|check\|mode]` | 架构决策记录（ADR）治理：脚手架生成、替代生命周期流转、DAG 拓扑图、断链体检与分层模式切换 |
| `/adr-guard [on\|off\|status]` | 切换项目级 ADR 提交铁律门禁（拦截缺少 ADR 的 feat/refactor 提交） |
| `/queued` | 管理排队提示 —— 交互式 TUI 对话框，查看 / 编辑 / 取消会话忙碌时提交的消息 |


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
