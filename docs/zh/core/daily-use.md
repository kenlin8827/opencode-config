# 日常使用与工作模式

OpenCode 多智能体配置提供三种编排工作模式外加近零开销的 `@lite` 模式，并允许直接调度 17 位领域专家智能体。

---

## Code 模式（默认）

`@code` 是默认入口 —— 直接开发者，自己动手编写、修改、测试和验证代码，不主动委托：

```
> @code 修复分页逻辑里的差一错误
> @code 给注册表单加上输入校验
```

仍可按需手动委托辅助类 subagent（`@advisor`、`@explorer`、`@code-review`、`@vision`）。如果任务实际上是跨领域的，`@code` 会建议切换到 `@build`。

---

## Build 模式（编排）

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

---

## Plan 模式（只读）

切换到 `@plan` 进行仅分析任务（不修改代码）：

```
> @plan 审计代码库的技术债务和安全漏洞
  → @plan 并行调度 @architect、@security、@code-review、@qa
  → 汇总报告，按优先级给出建议
```

通过 `Tab` 或 `@code` / `@build` / `@plan` / `@lite` 在四种模式之间切换。

---

## Lite 模式（近零开销）

`@lite` 是面向日常轻量任务的轻量模式 —— 快速查询、闲聊、小改动。它是唯一做到**实测近零提示词开销**的模式：0 L1 token、0 常驻 skills/MCP 定义、L0 在运行时剥离。满配 Agent 每步要背负 **13k+ token** 的提示词开销，而 `@lite` 的完整系统提示实测仅 **约 2k token**。

```
> @lite 这个函数是干什么的？
> @lite 重命名这个变量并修好所有调用点
```

代价：`@lite` 退出指令层、协议注入、skills 块与 MCP 代码智能。它保留全部原生工具（read/edit/bash/…），但不叠加任何工程纪律 —— 真正的工程任务请路由给 `@code` / `@build`。仍可委托辅助子代理（`@advisor`、`@explorer`、`@code-review`、`@vision`）做二次意见、搜索与审查。

---

## 直接调用专家

你可以跳过编排器，直接调用专家团的成员：

```
> @dba 优化 orders 表的索引
> @frontend-dev 用设计令牌创建一个可复用的 Button 组件
> @code-review 审查 PR #42
```

---

## 多步工作流示例

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
