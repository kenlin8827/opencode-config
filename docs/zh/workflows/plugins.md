# 插件系统与项目护栏

插件提供仅靠提示词无法实现的运行时强制与工作流。以下全部随安装默认启用 —— 无需额外安装。

---

## 插件总览表

| 插件 | 对你的作用 |
|---|---|
| `project-profiler.ts` | 启动时探测语言与激活的 MCP 后端，向系统提示词注入代码智能指引与检索铁律 |
| `design-token-guard.ts` | 阻止写入硬编码的颜色/间距/圆角 —— 让前端代码坚守设计令牌 |
| `ai-slop-scanner.ts` | 警告前端文件中的 AI 反模式（渐变汤、div 汤等） |
| `metrics.ts` | 自动记录工具调用指标（耗时、成功、智能体），JSONL 格式，存于 `~/.config/opencode/.metrics/` |
| `auto-format.ts` | 文件编辑后自动运行 prettier/eslint/ruff/gofmt/rustfmt |
| `auto-advisor-mode.ts` | `/auto-advisor` 命令、协议注入、模式门控、red-team 抑制 |
| `review-fix-loop.ts` | `/review-fix-loop` 命令与协议 |
| `goal.ts` | `/goal` 命令与协议 |
| `handoff.ts` | `/handoff` 命令与协议 |
| `deepseek-anchor.ts` | `/deepseek-anchor` 命令 —— 基于锚点的推理协议与 DeepSeek 模型集成 |
| `adr-guard.ts` | `/adr-guard` 命令 —— 按项目的 ADR 强制 |
| `env-guard.ts` | 按项目的密钥文件门控 |
| `e2e-guard.ts` | `/e2e-guard` 命令 —— 按项目门控：E2E 运行需用户确认 |
| `project-manager.ts` | `/project` 命令 + 提交纪律 |
| `queue-manager.ts` | `/queued` 命令 —— 管理会话忙碌时排队的提示 |
| `profile-wizard.ts`、`provider-wizard.ts` | `/profile` 与 `/provider` TUI 弹窗向导 |

---

## ADR 铁律（`adr-guard`）

按项目可选的架构决策记录（ADR）强制机制。开关为**项目级**，默认关闭：

```text
/adr-guard on       # 对本项目启用（写入 <project>/.opencode/.adr-guard）
/adr-guard off      # 关闭
/adr-guard          # 状态报告（开关 + ADR 目录）
```

启用后：
- **软层** — 铁律协议注入系统提示词：智能体在提交前主动编写/更新 ADR。
- **硬层** — 当提交信息类型为 `feat`/`refactor` 且工作区变更集中没有 ADR 目录下的文件时，阻断 `git commit`。
- **ADR 格式** — 严格 MADR：frontmatter `status` + `date`, 正文 `## Context and Problem Statement` + `## Decision Outcome`。

---

## 密钥文件门控（`env-guard`）

按项目可选的门控机制，防止含敏感信息的 env 文件进入 LLM 上下文。开关为**项目级**，默认关闭：

```text
# 对本项目启用（任选一种）
echo on > <project>/.opencode/.env-guard
# 或在项目的 opencode.jsonc 中添加 "envGuard": "on"
```

启用后，在执行前阻断针对 `.env`、`.env.local`、`.env.production` 等敏感文件的文件读取工具及读取到输出的 shell 命令。

---

## E2E 门控（`e2e-guard`）

按项目可选的门控机制，在运行任何 E2E 测试套件前要求用户明确确认：

```text
/e2e-guard on       # 对本项目启用（项目 opencode.jsonc 中 "e2eGuard": "on"）
/e2e-guard off      # 关闭
/e2e-guard          # 状态报告
```

门控按风险分级：
- **full**：无明确目标的整套运行（`npm run e2e`、裸 `playwright test`）—— 每次运行都需要新的一次性 `/e2e-guard allow` 放行。
- **targeted**：显式指定 spec/测试文件（`playwright test tests/login.spec.ts`）—— 会话内一旦获得过确认，后续自动放行。

---

## 提交纪律（`project-manager`）

按项目的提交规范强制机制，采用**文件即开关**：无状态文件、无 on/off 命令 —— `docs/git-commits.md` 存在即生效。

```text
/project init       # 脚手架生成基线文件（.opencode/opencode.jsonc、docs/git-commits.md、AGENTS.md）
/project index      # 手动刷新已有索引：codegraph sync、gitnexus analyze
/project sync       # 只做配置补齐（只追加）
```

`docs/git-commits.md` 存在期间：
- commit 首行须匹配 `type(scope): summary`（type 限 feat、fix、refactor、docs、test、chore、perf、ci、build、style、revert）且 ≤ 72 字符。

---

## 管理排队提示（`/queued`）

会话忙碌时提交的提示，OpenCode 会立即持久化为用户消息。内置的 `queue-manager.ts` TUI 插件提供交互式管理界面：

- `/queued` 打开选择对话框，列出全部排队消息。
- 选中后可执行：**编辑文本**、**取消消息**、**查看全文**，或 **Cancel ALL** 批量取消。
