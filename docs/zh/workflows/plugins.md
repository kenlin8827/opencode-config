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
| `md-to-pdf.ts` | `/pdf`、`/md-to-pdf` 命令与 `md_to_pdf` 工具 —— 将 Markdown 一键导出为高质量 A4 PDF（基于 Pandoc + Playwright） |

---

## ADR 铁律与活化架构治理（`adr-guard` 与 `/adr`）

企业级架构决策记录（ADR）治理体系，由两大互补能力构成：

1. **提交铁律门禁（`/adr-guard`）** — 软/硬双层护栏，杜绝在 `feat`/`refactor` 提交中出现未记录的架构漂移。
2. **分层活化架构引擎（`/adr`）** — 极简脚手架、决策生命周期流转、多层级拓扑与 Mermaid DAG 可视化。

### 开关与治理模式

提交门禁开关为**项目级**（存储于 `opencode.jsonc`）：

```text
/adr-guard on       # 对本项目启用提交门禁拦截
/adr-guard off      # 关闭提交门禁
/adr-guard          # 状态报告（开关 + ADR 目录）
```

分层治理模式通过 `/adr mode` 进行配置：

```text
/adr mode                   # 查看当前治理模式 (auto | flat | hierarchical)
/adr mode flat              # 极简纯扁平单层模式 (仅 docs/adr/)
/adr mode hierarchical      # 严格分层模式 (强制 L1/L2/L3 多层划分)
/adr mode auto              # 智能自适应模式 (默认: 单体项目保持扁平，出现子包时自动拓展)
```

### Slash 命令族（`/adr`）

| 命令 | 说明 | 示例 |
|---|---|---|
| `/adr new [layer/scope] <title>` | 自动计算序号生成 MADR 模板并更新 `INDEX.md` | `/adr new "采用 PostgreSQL 作为主库"` |
| `/adr supersede <old-id> <new-title>` | 原子化将旧 ADR 标记为 superseded，生成新决策并建立双向交叉溯源 | `/adr supersede 0001 "从 RabbitMQ 迁移至 NATS"` |
| `/adr migrate [h\|f\|a] [--confirm]` | 预览或执行 ADR 架构目录结构双向自动化重构 | `/adr migrate h` |
| `/adr tree` / `/adr map` | 生成 Markdown 决策层级树与 Mermaid DAG 依赖图 | `/adr tree` |
| `/adr check` / `/adr lint` | 审计引用完整性、父子决策断链及复杂度升级建议 | `/adr check` |

#### 1. 创建新决策（`/adr new`）
* **基础用法（扁平模式 / 常规单体）**：
  ```text
  /adr new "Use PostgreSQL as Primary Database"
  ```
  自动在 `docs/adr/` 创建下一个自增编号文件（如 `0003-use-postgresql-as-primary-database.md`），填充标准 MADR 骨架，并自动更新 `INDEX.md` 索引表。
* **分层用法（多包 / Monorepo）**：
  ```text
  /adr new system "Global Event Bus Standard"          # L1 宏观决策（根目录 docs/adr/）
  /adr new domain/payment "Stripe Webhook Processing"  # L2 领域决策（packages/payment/docs/adr/）
  /adr new component/auth "JWT Refresh Rotation"       # L3 模块决策
  ```

#### 2. 替代废弃旧决策（`/adr supersede`）
架构决策不可随意篡改历史，方案演进必须通过 `supersede` 记录演进原因：
```text
/adr supersede 0001 "Migrate from RabbitMQ to NATS JetStream"
```
**系统原子化自动完成三件事**：
1. 旧决策（`0001`）状态更新为 `status: superseded by 0004` 并注明废弃原因；
2. 新决策（`0004`）自动创建，Frontmatter 自动关联 `parent: docs/adr/0001-use-rabbitmq.md`；
3. 自动同步刷新目录下的 `INDEX.md`。

#### 3. 自动化重构与迁移（`/adr migrate`）
随着项目规模扩大，随时可以无痛双向重构 ADR 结构：
* **预览迁移方案（Dry-Run）**：`/adr migrate h`（或 `/adr migrate hierarchical`），输出文件移动映射表，不修改任何文件；
* **确认执行重构**：`/adr migrate h --confirm`，自动迁移文件、重写 frontmatter 与相互引用，并刷新全仓索引。

### 双轨驱动：自然语言与 Slash 命令

ADR 治理系统支持 **Slash 命令（确定性本地执行）** 与 **自然语言交互（AI 智能深度起草）** 双轨并行：

| 场景 | 自然语言交互（AI 深度思考与起草） | Slash 命令（本地秒级脚手架） |
| :--- | :--- | :--- |
| **新建决策** | “帮我记录一个关于引入 Redis 做分布式锁的 ADR”<br>$\to$ **AI 会自动调研背景、列出候选方案对比（Redlock vs ETCD vs DB锁），填充完整论证后落盘并同步索引** | `/adr new "Redis 分布式锁规范"` |
| **废弃/替代** | “0001 号决策废弃掉，我们现在改用 Kafka 代替 RabbitMQ”<br>$\to$ **AI 自动将 0001 标记为 `superseded by 0005`，生成新 ADR 并写入迁移原因和上下文溯源** | `/adr supersede 0001 "迁移至 Kafka"` |
| **健康体检** | “帮我看看目前 ADR 依赖关系有没有断链，有没有缺失的字段”<br>$\to$ **AI 逐一检查全仓 frontmatter、父子指向，给出修复方案** | `/adr check` |
| **架构重构** | “项目拆成 Monorepo 了，帮我把支付和用户相关的 ADR 移到各自子包”<br>$\to$ **AI 分析目录结构并安全执行重构，更新引用与索引** | `/adr migrate h --confirm` |

### 三层架构决策模型（从粗到细）


- **L1: 宏观系统级 (`layer: system`)** — 根目录 `docs/adr/`（全局技术栈、通信协议、系统安全体系）。
- **L2: 领域子系统级 (`layer: domain`)** — `packages/<name>/docs/adr/` 或 `apps/<name>/docs/adr/`（业务服务边界、领域状态机、分库分表）。
- **L3: 组件模块级 (`layer: component`)** — 模块内部 `docs/adr/`（局部复杂算法、前端状态管理）。



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

---

## 文档导出与排版渲染（`md-to-pdf` 与 `/pdf`）

将项目中的 Markdown 文档（API 规范、ADR 方案、调研报告）一键导出为出版级高保真 A4 PDF。

### 核心能力

- **自然语言直接驱动**：在聊天框发送 `@doc/api-v1.md 转PDF` 或 `帮我把 @README.md 导出为 PDF`，智能体自动提取路径并调用 `md_to_pdf` 工具完成生成。
- **Slash 命令确定性执行**：
  ```text
  /pdf README.md                         # 渲染为 README.pdf
  /pdf doc/api-v1.md dist/api-v1.pdf     # 指定输出路径
  /pdf --doctor                          # 环境与依赖健康检查
  /pdf --install-deps                    # 自动修复/安装缺失依赖
  ```
- **工业级排版与隔离打印**：
  - **Pandoc 引擎**：生成符合 GFM 规范的 standalone HTML，内置代码高亮与资源内联。
  - **优雅 A4 样式**：A4 页面、页边距、现代化字体族、代码块及表格自适应边框。
  - **Playwright 无头打印**：通过隔离 Node runner 驱动 Chromium 打印矢量 PDF，保证毫秒级生成。

