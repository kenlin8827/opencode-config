# 提示词披露分层

每个提示词文件在每次注入时都消耗 token。因此 OCP 按**违规代价而非文件体积**
把规则排进披露层——规则只在需要它的 Agent 运行时付费，与无关 Agent 完全隔离。

## 层级定义

| 层级 | 载体 | 付费时机 | 内容 |
|---|---|---|---|
| **L0** | `opencode.jsonc:instructions` | 每个 Agent 的每一步 | 铁律：`rfc-keywords`、`output-protocol`、`verification-honesty`、`routing-index` |
| **L1** | Agent 的 `prompt` 字段，经 `{file:}` 标记拼装 | 该 Agent 运行期间 | 角色规则：编码包、`sql-migration`、评审基准 |
| **L2** | `~/.config/opencode/skills/*/SKILL.md` | Agent 主动调用 `skill` 工具时 | 场景规则：`sdd-workflow` |
| **L3** | 你项目的 `AGENTS.md`（OpenCode 原生） | 读取该目录文件时 | 你的个人 / 项目规则 |

L0 是最贵的层（× 步数 × Agent 数），因此发布门禁用
`scripts/measure-prompts.ts` 对其施加硬性 token 预算。

## L1 路由矩阵

| Agent | 附加规则文件 |
|---|---|
| `code`、`coworker`、`fast-coder`、`java-dev`、`python-dev`、`go-dev`、`rust-dev`、`node-dev`、`frontend-dev`、`devops`、`qa` | 编码包：`coding-principles` + `comment-strategy` + `edit-protocol` + `test-scope` |
| `dba` | 编码包 + `sql-migration` |
| `code-review` | `coding-principles` + `comment-strategy` + `test-scope`（无 `edit-protocol`——编辑权限已禁用） |
| `architect`、`advisor`、`security` | 仅 `coding-principles`（评审基准） |
| `build`、`plan`、`explorer`、`researcher`、`tech-writer`、`vision` | 无——仅吃 L0 |

## 护栏

- `routing-index.md`（L0）保留所有按需规则的指针，规则降级不会丢失其背后的
  铁律义务（例如 SQL 迁移仍必须路由给 `@dba`；SDD 流程仍必须先加载技能）。
- L1 文件之间的简写交叉引用（`cp#N`）**只允许在同一披露单元内**——所有引用
  `cp#N` 的 Agent 都携带 `coding-principles.md`。
- 升级永远可传播：安装器以模板的 `instructions` 数组与出厂 Agent 为准；
  只有你自己新增的 Agent 会原样保留。

## 个人规则

个人或项目专属规则放在 **L3**：项目根目录的 `AGENTS.md`（OpenCode 在该项目
激活时原生加载）。不要修改出厂 `instructions` 数组——安装器每次升级都会以
模板覆盖它，这是设计行为。
