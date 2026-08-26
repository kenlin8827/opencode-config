# 安装器进阶与选项

了解安装器命令、options.jsonc 配置开关、rtk 压缩原理以及重装保留字段规则。

---

## 安装命令一览

| 模式 | PowerShell | Bash | 说明 |
|---|---|---|---|
| 安装（默认） | `pwsh install/install.ps1` | `./install/install.sh` | 将当前清单应用到目标目录 |
| 强制重装 | `pwsh install/install.ps1 install -Force` | `./install/install.sh install -f` | 重新应用相同版本 |
| 查看状态 | `pwsh install/install.ps1 status` | `./install/install.sh status` | 显示已安装版本与仓库版本 |
| 生成清单 | `pwsh install/install.ps1 generate` | `./install/install.sh generate` | 扫描仓库，写入清单（不安装） |
| 初始化（全新开始） | `pwsh install/install.ps1 init` | `./install/install.sh init` | 备份并清空整个目标目录 |
| 注册全局命令 | `pwsh install/install.ps1 register` | `./install/install.sh register` | 将 `opencode-prime`、`ocp` 与 `opencode-config` shim 安装到 `~/.local/bin` |
| 注销全局命令 | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | 移除全局 shims |

---

## 安装选项（`options.jsonc`）

`install/options.jsonc` 是控制安装配置的单一事实来源（开关 MCP、外部插件、主控智能体与 rtk 压缩代理）。

### 安装前自定义流程

1. **进入仓库目录**（若使用 Git 克隆或解压了 release 包）：
   ```bash
   cd opencode-prime
   ```
2. **编辑 `install/options.jsonc`** 设定所需的可选功能开关：
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
3. **执行安装命令**：
   ```bash
   # macOS / Linux / WSL
   ./install/install.sh

   # Windows (PowerShell)
   pwsh install/install.ps1
   ```

### 安装后修改与生效

安装器在每次运行时都会严格按照仓库中 `install/options.jsonc` 的开关状态重新计算并应用到目标 `opencode.jsonc`。若后续需要开启或关闭某项功能：
1. 修改 `install/options.jsonc` 中的对应字段（`true` / `false`）。
2. 在版本号未变的情况下，带 `-Force`（PowerShell）或 `-f`（Bash）重新运行安装即可生效：
   ```powershell
   pwsh install/install.ps1 install -Force
   ```
   ```bash
   ./install/install.sh install -f
   ```

---

## 插件自动预热（Ensure-Plugins）

为了避免首次启动 OpenCode 时因在线下载 npm 插件而出现卡顿，安装器会在安装的最后阶段自动探测本地包管理器（`bun` > `npm` > `pnpm`），并将已启用的外部插件自动预装至 OpenCode 原生缓存目录（`~/.cache/opencode`）。

- **零配置目录污染**：插件缓存严格存放在 OpenCode 官方数据目录中，不影响 `~/.config/opencode` 配置清单的原子化升级与卸载。
- **容错降级**：若本地未安装包管理器或网络不可达，安装器会优雅跳过，保留由 OpenCode 启动时自动拉取的保底能力。

---

## Token 节省（rtk）

安装时自动配置 [rtk](https://github.com/rtk-ai/rtk) —— 一个在命令输出（git status、测试、构建等）到达模型前将其压缩 60-90% 的 CLI 代理。

若 PATH 中没有 `rtk`，安装器会将固定版本的二进制下载到 `~/.local/bin`。opencode 钩子以内置的 `plugins/openrtk.ts` 形式随配置分发。

若不需要：在 `install/options.jsonc` 中设 `"rtk": false` 后重新安装即可。

---

## 重装时保留的字段

当 `opencode.jsonc` 被新模板覆盖时，以下字段会从你的现有配置中快照并在覆盖后恢复：

| 字段 | 保留原因 |
|---|---|
| `provider.<name>.options.baseURL` | 你的 API 端点 |
| `provider.<name>.options.apiKey` | 你的 API 密钥 |
| `provider.<name>.models` | 你的模型定义（自定义 model id、用户自加的模型） |
| `model`（根级别） | 你为 standard 层级选择的模型 |
| `agent.<name>.model`（每个层级） | 你为各层级分配的模型 |

---

## 全局命令 (`ocp` / `opencode-prime`)

首次安装后，可将仓库注册为全局快捷命令（`ocp`、`opencode-prime` 与 `opencode-config`）：

```powershell
pwsh install/install.ps1 register
```

```bash
./install/install.sh register
```
