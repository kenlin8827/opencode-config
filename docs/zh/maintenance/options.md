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
| 注册全局命令 | `pwsh install/install.ps1 register` | `./install/install.sh register` | 将 `opencode-config` shim 安装到 `~/.local/bin` |
| 注销全局命令 | `pwsh install/install.ps1 unregister` | `./install/install.sh unregister` | 移除 shim |

---

## 安装选项（`options.jsonc`）

`install/options.jsonc` 是控制安装配置的单一事实来源。修改后重新运行安装器（版本未变时用 `install -Force`）即可生效：

```jsonc
// install/options.jsonc
{
  // 是否启用 rtk 输出压缩
  "rtk": true,
  // 默认主控智能体（code / build / plan）
  "default_agent": "code",
  // MCP 服务开关（启用且缺失时自动拉取 CLI）
  "mcp": {
    "serena": true,
    "codegraph": true,
    "gitnexus": false,
    "dbhub": true
  },
  // 外部 npm 插件开关
  "plugin": {
    "@dietrichgebert/ponytail": true,
    "opencode-qoder-bridge": true,
    "@frankhommers/opencode-smart-title": true,
    "opencode-mem@2.24.3": false
  }
}
```

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
| `model`（根级别） | 你为 default 层级选择的模型 |
| `agent.<name>.model`（每个层级） | 你为各层级分配的模型 |

---

## 全局命令

首次安装后，可将仓库注册为全局 `opencode-config` 命令：

```powershell
pwsh install/install.ps1 register
```

```bash
./install/install.sh register
```
