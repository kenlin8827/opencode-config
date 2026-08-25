# 常见问题与排查 FAQ

升级指南、卸载重置以及常见故障排查。

---

## 升级指南

```powershell
# Windows
git pull origin main
pwsh install/install.ps1
```

```bash
# macOS / Linux / WSL
git pull origin main
./install/install.sh
```

安装器读取目标目录中的 `.CONFIG_VERSION`，查找该版本的清单，删除旧文件并应用最新清单。你的凭证和模型选择会被完整保留。

---

## 卸载与全新初始化

### 彻底卸载

```bash
rm -rf ~/.config/opencode
```

```powershell
Remove-Item -Recurse -Force "$HOME/.config/opencode"
```

### Init 模式（备份 + 清空）

```powershell
pwsh install/install.ps1 init
```

```bash
./install/install.sh init
```

---

## 常见问题排查 FAQ

### "provider.llm-router not configured"

通过环境变量 `LLM_ROUTER_BASE_URL` / `LLM_ROUTER_API_KEY` 设置凭证（见 [模型配置与预设](/zh/core/profiles)），或直接编辑 `~/.config/opencode/opencode.jsonc`，然后重启 opencode。

### Auto-advisor 模式不切换

检查项目 `opencode.jsonc` 中的 `autoAdvisorMode` 字段（在项目根目录运行）：

```powershell
Select-String -Path "opencode.jsonc" -Pattern "autoAdvisorMode"
```

如果字段不存在，模式为 `off`（默认）。运行 `/auto-advisor lite` 将字段写入项目配置并启用 advisor 咨询。

### `/profile` 不保留 JSONC 注释

`/profile` 插件在重写 `opencode.jsonc` 时会去除注释。如果注释对你很重要，请在仓库模板（`opencode.jsonc`）中维护 —— 每次重装会复制原始文件（注释恢复），但下次 `/profile` 修改时会再次去除。

### Windows 下模型频繁使用 Bash 命令报错（自适应支持）

OpenCode 内置工具原生命名为 `bash`，大语言模型倾向于输出 Unix/POSIX 命令。本配置体系已内置**双层自适应机制**：

1. **安装器自动探测与环境自适应**：
   运行 `pwsh install/install.ps1` 时，安装器会自动探测系统中的 Git Bash 并为用户配置 `SHELL` 环境变量。如果希望手动配置，可执行：
   ```powershell
   [System.Environment]::SetEnvironmentVariable('SHELL', 'C:\Program Files\Git\bin\bash.exe', [System.EnvironmentVariableTarget]::User)
   ```
2. **全局指令自适应（Adaptive Shell Execution）**：
   在 `instructions/coding-principles.md` 中注入了全局自适应执行准则。即使在未安装 Git Bash 的纯 PowerShell/CMD 环境中，所有 Agent 也会自适应使用 PowerShell 原生语法（如 `$env:VAR = "val"`, `Get-ChildItem`, `Remove-Item`）或跨平台命令（`git`, `npm`, `node`），并在遇到命令语法错误时自动切换语法重试。


