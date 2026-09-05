# Git 工作流

五个 slash 命令包装的是**原生 git**。没有任何自造机制：不写自己的补丁搬运循环，不发明合并引擎。
Agent 只替代一个角色 —— **冲突现场的那个人**。其余部分就是你熟悉的那条 git 命令，
外加前置检查、guard 备份、验证与审计轨迹。

| 命令 | 原生 git | 是否重写历史？ | guard 备份 |
|---|---|---|---|
| [`/git-pull`](#git-pull) | `git pull --ff-only`，之后再调和 | 仅当分叉**且**加了 `--rebase` | 当前分支 tip（仅分叉时） |
| [`/git-push`](#git-push) | 普通 `git push`，被拒后再调和 | 仅当分叉**且**加了 `--rebase` | 调和前的当前分支 tip |
| [`/git-merge`](#git-merge) | `git merge` | 否 | target tip |
| [`/git-pick`](#git-pick) | `git cherry-pick` | 否 —— source 不受影响 | target tip |
| [`/git-rebase`](#git-rebase) | `git rebase` | **是** —— source 获得新 SHA | **两个** tip |

五者都是 **agent-less**（frontmatter 里没有 `agent:`）：由当前 agent 执行（默认的 `lite`
agent 恰好只被授权这五个 skill）。

---

## 怎么选

| 你想做的事 | 用哪个 |
|---|---|
| 把当前分支同步到它的上游 | `/git-pull` |
| 同步当前分支，并把本地提交线性重放上去 | `/git-pull --rebase` |
| 安全推送当前分支，自动调和「远端领先」拒绝 | `/git-push` |
| 明确选择线性重放或生成 merge commit 后推送 | `/git-push --rebase` · `/git-push --merge` |
| 明确允许受 lease 保护的历史改写推送 | `/git-push --force-with-lease` |
| 落地整条特性分支，保留双方拓扑 | `/git-merge <source> <target>` |
| 把整条特性分支压成**一个**干净提交 | `/git-merge <source> <target> --squash` |
| 把某分支的全部独有提交线性重放到另一分支 | `/git-rebase <source> <target>` |
| 只搬运**指定的几个**提交 | `/git-pick <source> <target> <sha>…` |
| 搬运该分支独有的全部非 merge 提交（不产生 merge commit，source 不动） | `/git-pick <source> <target> --all` |
| 继续 / 放弃一个暂停中的操作 | 同一命令上的 `--continue` · `--skip` · `--abort` |

**硬边界。**`/git-pull` 永不接受 `--squash` —— 把自己分支已发布的远端历史压成一个提交等于重写
共享历史，任何情况下都不正当。`/git-pick` 永不产生 merge commit，每次 pick 落地为一个新的
普通单亲提交。当重放区间内含 merge 提交时，`/git-rebase` 会停下而不是悄悄压平拓扑 ——
请改用 `/git-merge`，或明确要求走单独审计的 `--rebase-merges` 流程。

---

## 共享教义

五份协议刻意保持同构。下面是它们共同行为的唯一说明；后面的分命令小节只讲差异。

### 1. 前置检查只会停下 —— 绝不替你收拾残局

每个命令都会检查：在 git 仓库内 · 分支存在 · source ≠ target · 工作区干净
（`git status --porcelain --untracked-files=no`）· 无进行中的操作（`MERGE_HEAD`、
`CHERRY_PICK_HEAD`、`.git/rebase-merge`、`.git/rebase-apply`）· 非 detached HEAD ·
无残留 `.git/index.lock` · 记录 `rerere.enabled` 并在本次运行中**禁用**它
（`-c rerere.enabled=false`），避免旧的重用解决方案被静默注入。

检查失败时 agent **停下并报告**，绝不自动 stash、自动 reset 或丢弃你未提交的工作 ——
由你修复，或由你显式授权。调用里给全两个分支**就是**放行信号：不再多问一轮确认。
缺分支时它会提问，绝不猜。

`git-rebase` 与 `git-pick` 还会额外确认当前 git 版本支持它们依赖的选项
（`--reapply-cherry-picks` / `--empty` / `--allow-empty`），否则停下请你升级 git，
而不是退化成会丢提交的行为。`git-rebase` 还会记录 `commit.gpgsign`：若重写后的提交
需要在非 TTY 会话里交互式 pinentry，它会交还给你，而不是关掉签名。

### 2. 先把 target 同步到 origin

`git checkout <target>` → `git pull --ff-only`。基线必须正好是 origin 的最新状态；
把新工作叠在过期的本地 target 上，正是回归问题偷偷溜进来的方式。与上游分叉 → 停下，
由你调和。没有配置远端 → 在本地 HEAD 上继续并明确说明。**禁止使用裸 `git pull`** ——
它隐含的 merge/rebase 会污染基线。

### 3. 动手前先建 guard 备份

`git branch guard/<repo>-<sha>-<ts>`。`git-rebase` 会备份**两个** tip，因为它重写 source。
Agent **永不删除 guard 分支**：在报告里列出来，清理由你决定。

### 4. 权威基线（authoritative baseline）

target HEAD 是基线；另一方**叠加在它之上**，如同其作者是针对 target 的最新状态写下这个改动。

- **基线 ≠ 赢家。** 任何一方都不是「更新所以正确」。对着合并基（`:1:`）逐 hunk 读，
  **把双方有意的改动组合起来** —— 丢掉任何一方意图的解决方案都是错的。
- 叠加方必须**增加**自己的意图，绝不可静默移除或撤销基线内容 —— 无论是新增、修改
  **还是删除** —— 除非移除正是该改动的明确目的。
- **删除是有意为之，不是缺失。** 基线里刻意的删除要被尊重；存活的一侧应适配删除后的世界，
  而不是把代码复活。

侧别标签：merge → `ours`/`:2:` = target，`theirs`/`:3:` = source。rebase 与 pick →
`:2:`/HEAD = onto 一侧（target 加上已落地的提交），`:3:` = 正在应用的提交。
**这个映射永不翻转。**

### 5. 先取证，再动手

改动冲突文件前，agent 会先建立意图档案：提交/区间信息、双方对基线的完整 diff、邻近测试、
相关的 `git log`/`git blame`。优先查询可用的符号/图索引，把改动的定义映射到调用方、类型、
schema、配置、生成文件与测试；只有在没有索引时才退回定向文本搜索，并把这一局限记录下来。
随后声明结果必须保持（或有意改变）的不变量：API 与数据兼容性、错误行为、安全/鉴权、
并发、顺序。**一个 hunk 只有在它的决策引用了这些证据之后才算解决。**

### 6. 按冲突形态解决

| 形态 | 解决方式 |
|---|---|
| 内容冲突（双方都改） | 保留基线的形状（接口、重构、命名），把另一方的新逻辑重新表达进去。双方意图都存活 |
| modify/delete —— 基线删了 | 删除成立；只搬运另一方仍真正需要的部分 |
| modify/delete —— 另一方删了 | 移除正是它的明确目的 —— 执行；把基线存活的需求挪到别处，或在理由中标注 |
| add/add | 把 `:1:` 视为空；组合两个各自独立新增的版本 |
| rename/rename、rename/delete、文件↔目录 | 追踪两个目的地，把内容完整保留一次，放在自洽的最终路径上 |
| submodule / gitlink | 检查双方 SHA 与子模块历史；使用同时包含两者的后代，或停下来要一个明确决定 |
| 二进制、symlink、mode | 可读处照常解决；不透明二进制可以按路径 `git checkout --ours\|--theirs -- <path>` 取一侧，再 `git add`，并记录取了哪一侧及原因 |

所有标记都要清掉 —— 包括 diff3 的 `|||||||`。然后 agent **把整个文件重读一遍做全局自洽检查**，
因为 hunk 之间并不独立：一个 hunk 里定下的签名，必须和另一个 hunk 里的调用点一致。
之后才 `git add`。

**绝不**在文本可读文件上用 `git checkout --theirs/--ours`，也绝不用 `-X` ——
整片覆盖会静默丢掉逻辑。上面那个记录在案的不透明二进制是唯一的例外。

### 7. 置信度自检 → `@advisor` → 交还给你

暂存前，每个 hunk 都要标为 **confident**（双方意图都能从基线推出、组合无歧义，
且有引用的符号/调用方/测试或不变量证据支撑）或 **uncertain**（意图含糊、两种读法都成立，
或自洽重读没能修好的接缝）。**犹豫时选 uncertain** —— 错误的解决方案是灾难，
而自我评估的确定性天然偏高。

uncertain 的 hunk 会派发给只读的 `@advisor` 子代理，附上三方内容、证据、不变量与具体歧义点 ——
**但不透露自己的解决方案**，以保证第二意见的独立性。advisor 返回建议、1–10 的置信度，
以及 FACTUAL/PREFERENCE 分类。

- **FACTUAL + 置信度 ≥ 8** → 采纳，改标为 `advisor ✓ (n/10)`。
- 其余情况 —— `< 8`、仍然不确定，或 **PREFERENCE**（答案只存在于作者脑子里）→
  **绝不猜**。操作停在该 hunk，不暂存、不越过它继续，收尾审计包，并把该 hunk 连同双方内容
  与 advisor 的分析一起交还给你。
- **advisor 是尽力而为，绝不是硬依赖。** 派发失败、超时或返回内容无法解析时，不重试循环、
  不阻塞：该 hunk 按未解决处理并交还给你（日志记为 `advisor unavailable`），其余 hunk 继续。
  缺少第二意见永远不会变成一次猜测。

只有真正不确定的 hunk 才上报 —— 常规 hunk 不上报，以节制成本。

### 8. 语义交互审计 —— 即便 git 一次都没停

文本不重叠**不等于**兼容。每次运行 —— 包括干净的自动合并、无冲突的 pick 与未停顿的重放 ——
都会比对双方改动的符号与契约：定义↔调用方、接口↔实现、schema↔迁移、配置↔消费方、
生成物↔源、测试↔行为。每一处实质性交互都要映射到已有的定向测试或静态检查，否则标为
uncertain；未解决的业务意图会阻止落地。

### 9. 机械检查，然后只验证一次 —— 且诚实

`git ls-files -u` 必须为空，且不得残留 `U` 状态。冲突标记 grep **只**在带上记录下来的
冲突路径、且每个路径单独加引号时运行 —— 绝不用空路径集，那会扫描整棵树。

然后项目自身的测试/构建命令跑**一次**，由分级推断选出 —— 命中即止：

1. 仓库自己 CI 跑的测试/构建/lint 门禁（`.github/workflows/*.yml`、`.gitlab-ci.yml`、
   `Jenkinsfile`）
2. `package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod` 或 `Makefile` 里的
   `test`/`check`/`verify` 脚本
3. 这些 manifest 隐含的 runner（`bun test`、`npm test`、`pytest`、`cargo test`、
   `go test ./...`、`make test`）
4. 仓库内的测试入口（`tests/run*`、`tests/test-all.*`、`scripts/test*`、`scripts/verify.*`）
5. `CONTRIBUTING.md`、`DEVELOPING.md`、`AGENTS.md` 或 `README.md` 里写明的命令

报告会说明命中的是哪一级。**「推断不出」意味着五级全部落空** —— manifest 里没有 `test`
脚本不算落空，那恰恰是去查第 1 级的理由。这个区分正是防止一次解决得完全正确的合并
被当作未验证交还给你的原因；也是 CI 排第一的原因：workflow 文件是一个仓库唯一明确写出
「什么才算绿」的地方。围绕这次运行的规则：

- **解决过冲突且推断不出命令 → 不落地。** agent 停下、收尾审计包，
  以 *resolved-but-unverified*（已解决但未验证）交还给你。
- `--no-verify` **只**在你显式选择时有效，绝不被推断出来。
- 失败最多修 **2** 次，且只限于冲突文件及其直接破坏面上的最小编译/测试修复。
  需要越界的业务逻辑改动时，记录理由并交还给你，而不是动手改。
- 只报告真实结果 —— 没跑过的命令绝不打 `✅`。

`git-pick` 与 `git-rebase` 还有**逐提交**闸门：需要人工解决的提交，在 `--continue` 之前先验证。
当成本或上下文不允许时，报告里会显式声明（`picked commits not individually verified`、
`intermediate commits not guaranteed buildable`）—— 明说的局限，绝不含糊承诺。

`git-rebase` 在 **source tip** 上验证，之后 target 才移动：验证失败或缺失时，target 永不前进。

### 10. 审计轨迹 —— 每次调用都写

每次运行 —— 包括 `--dry-run` 和完全干净的运行 —— 都会写出：

```
.git/ocp-<op>-reports/<operation-id>.jsonl   脱敏、哈希链式的命令轨迹
.git/ocp-<op>-reports/<operation-id>.md      人类可读摘要 + 决策日志
```

`<op>` 是 `merge` / `pick` / `pull` / `push` / `rebase`；`operation-id` 形如
`git-<op>-<UTC>-<short-head>-<random>`。**每条 git 命令之前**都会追加并 flush 一个
`command_start` 事件，紧随其后是与之关联的 `command_end` —— 缺失 end 事件即证明被中断，
而不是让这次尝试被静默抹掉。事件携带 `schema_version: 1`、`operation_id`、`seq`、UTC `ts`、
`event`、`phase`、脱敏后的 `argv` **数组**（绝不是 shell 文本）、`cwd_repo_relative`、
`prev_event_sha256`，以及覆盖除自身外全部规范化 JSON 的 `event_sha256`。end 事件另含
`command_seq`、`exit_code`、`duration_ms`、事后的 refs/SHA、脱敏并截断的 `stdout`/`stderr`，
以及每个完整输出流的流式 SHA-256。冲突状态、决策、advisor/交还、验证与恢复事件共用同一条链；
Markdown 摘要记录最终事件哈希。

**这条链是什么、不是什么。** 它能发现截断与意外篡改。它**不是**数字签名，
面对蓄意重写者不具备证明力。

**绝不会被写入的内容：**环境变量、凭据、`Authorization` 头、URL userinfo/token、私钥，
以及冲突文件的原始内容。`argv` 与输出都会脱敏，每段摘录上限 **4 KiB**，
并在平台支持处使用受限文件权限。

两个文件都待在 `.git/` 内 —— 永不弄脏 `git status`，永不被推送，永不自动删除；
清理由你决定。创建轨迹是 `--dry-run` 唯一允许的副作用。若创建失败，操作在改动任何东西之前
停下；若后续追加失败，则安全暂停并报告，而不是自动 abort 把证据抹掉。`/git-pull`
会为被委托的 merge/rebase 轨迹创建子 operation ID，并在双方轨迹中记录父子关联。

### 11. Agent 绝不做的事

绝不 `--force` 推送，也绝不对你已有的远端执行 `git reset --hard` —— 结果只落在本地，
推送由你决定（rebase 之后要更新已推送的 source，需要 `git push --force-with-lease`，
且只有你能决定）。绝不删除 guard 分支。绝不静默绕过失败的 hook 或关掉签名 ——
它会报告真实输出、保持暂停状态并交还给你。绝不在未验证的情况下落地人工解决的冲突。

也绝不把你留在死胡同。**每一次停下都会给出该故障对应的确切恢复命令** —— 工作区脏就给
`git stash push` / `git commit` 那一行，target 分叉就给 `/git-pull`（或
`/git-rebase <target> @{u}`），有残留操作就给 `--continue` / `--abort`，detached HEAD 就给
`git switch <branch>`。停下而不猜是安全动作；停下却不给回路才是缺陷。

---

## 分命令说明

### `/git-pull`

同步的是**当前**分支，不接受分支参数。`@{u}` 是「这个分支从哪儿拉」的唯一事实来源 ——
除非 `origin` 就是配置好的上游，否则绝不硬编码它。流程：前置检查 → `git fetch <remote>` →
`git pull --ff-only`。成功就是常见情况下的全部工作：`fast-forwarded @ <sha>`，结束，什么都没重写。

被拒绝 → **分叉**：它会报告双方状态（`git rev-list --left-right --count` 加各自的
`git log --oneline`），为分支建 guard 备份，然后**委托**：

- 默认 → 走 `git-merge` 协议，source = `@{u}`（已 fetch 的上游 ref），target = 本地分支；
- `--rebase` → 走 `git-rebase` 协议，source = 本地分支，onto = `@{u}`；跳过 rebase 自己的备份
  （tip 已有 guard）与最后的 fast-forward（当前检出的分支**就是**落地结果，
  而远程跟踪 ref 绝不可被检出或移动）。

冲突解决、交互审计、验证、归档与报告全部来自被委托的协议 —— `/git-pull` 不重复实现它们。

### `/git-push`

安全推送**当前**分支到其配置的上游，不接受分支参数。上游以 `@{u}` 为唯一事实来源，
因此不会擅自假定远端名是 `origin`。流程如下：

1. 检查仓库、分支、上游、干净工作区与是否存在进行中的操作；
2. fetch 配置的远端；
3. 先尝试普通 push；
4. 若因 `non-fast-forward` 被拒且确认远端领先，报告双方状态并为本地 tip 建 guard；
5. `--merge` 委托 `git-merge`，`--rebase` 委托 `git-rebase`；调和并验证干净后再重试普通 push。

认证、权限、保护分支、必须走 PR、hook、签名、网络错误，以及无法确认原因的拒绝，都不是
合并冲突：原样报告并交还给你。内容冲突也绝不靠猜测或整片覆盖解决。

`--force-with-lease` 是历史被 rebase 改写后的显式 opt-in。执行前会立即重新 fetch，并保护
预期的远端 tip；裸 `--force` 永远禁止。报告写入 `.git/ocp-push-reports/`；push 失败就报告
失败，绝不从代码逻辑推断为成功。

### `/git-merge`

因为 git 自己会算出真正的共同祖先，冲突只出现在双方确实动了同一区域的地方 ——
绝不会因为用错了逐提交基线而静默撤销基线。对于 criss-cross 历史，`git merge-base`
只有解释意义：stage `:1:` 是 git 的 recursive/ort 虚拟基，且对每个冲突路径而言才是权威。

落地方式：`--squash` 会把结果暂存，由 agent 用 `git log --oneline $BASE..<source>`
生成规范化提交信息后提交（绝不用 `git merge --continue`，没有 `MERGE_HEAD` 时它并不适用）。
干净的非 squash 合并已经自己产生了提交。有冲突的非 squash 合并会把主题与解决摘要写进
`.git/MERGE_MSG`，再以 `GIT_EDITOR=true` 非交互地 continue。

### `/git-pick`

`--all` 精确等于 `git rev-list --reverse --topo-order --no-merges <target>..<source>`：
即**source 独有的全部非 merge 提交** —— 不是 source 的整段历史，也不是 target 已有的提交。
merge 提交被排除，是因为它们的 mainline 有歧义；agent 绝不自己发明 `-m`，并把它们报告为已跳过。
显式点名的 merge 提交会停下并解释，要求你选定 mainline。

空提交被区分对待，不混为一谈：**原本就是空**的提交用 `--allow-empty` 保留（里程碑/审计意图），
而非空提交因为 target 已含其改动而**变成空**时用 `--skip` 跳过并报告。
`--allow-empty` 绝不会用在后者上。

### `/git-rebase`

重写之前先规划拓扑：`git rev-list --reverse --topo-order <target>..<source>` 是计划，
而 `--min-parents=2` 结果非空时停下（见上面的硬边界）。重放时使用 `--reapply-cherry-picks`，
使补丁等价的提交不会被静默预先丢弃；并使用 `--empty=stop`，使变空的提交被显式记录并跳过，
而不是被丢掉。

落地前会重新 fetch target 上游并与同步时的 SHA 比对：若 rebase 期间它移动了，agent 会停下
并提议重新 rebase，而不是落地过期结果。否则 target 快进到线性 tip。撤销方式是
`git reset --hard guard/<repo>-<source-sha>-<ts>`；`git reflog` 同样保留着 rebase 前的 tip。

---

## Flag 一览

| Flag | `/git-pull` | `/git-push` | `/git-merge` | `/git-pick` | `/git-rebase` |
|---|:--:|:--:|:--:|:--:|:--:|
| `--dry-run` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `--no-verify` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `--abort` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `--continue` | — | ✓ | ✓ | ✓ | ✓ |
| `--skip` | — | — | — | ✓ | ✓ |
| `--squash` | **绝不** | — | ✓ | — | — |
| `--no-ff` | — | — | ✓ | — | — |
| `--all` | — | — | — | ✓ | — |
| `--rebase` | ✓ | ✓ | — | — | — |
| `--merge` | — | ✓ | — | — | — |
| `--force-with-lease` | — | ✓ | — | — | — |

Flag 可以出现在调用中的任意位置；解析宽松，但大小写敏感。

`--dry-run` 只做预览，不建 guard ref、不改工作区 —— 但它执行的那次 target 同步仍可能
快进本地 target，且 `.git/` 审计包照常写入。只要已经解决过冲突或已存在决策日志，
`--abort` 都会**先收尾审计包再 abort**，因为 abort 会丢弃这些解决结果。

---

## 报告

每个命令都以固定结构的报告收尾：source/target 与同步后的 SHA、结果
（fast-forwarded / merge commit / linear / squashed / paused → handed to human / dry-run）、
一个枚举的 `Outcome:` 标记、真实的验证命令与其真实结果，以及 —— 在解决过冲突时 ——
置信度汇总：

```
Outcome: <landed-verified | landed-clean | landed-fast-forward | landed-no-verify-opt-in
        | no-op | dry-run | handed-over:<reason>>
Confidence: <H> confident · <A> advisor ✓ · <U> unresolved → handed to human
```

`landed-*` 表示这次操作自主完成。`handed-over:<reason>` 让每一次交还都自我分类：
`unresolved-hunk`、`verify-failed`、`no-verify-command`、`hook-failed`、
`signing-interactive`、`preflight-<check>`，外加 `mainline-ambiguous`（pick）与
`topology-ambiguous` / `target-moved`（rebase）。同一个标记也会写进 `.md` 审计摘要，
所以**你自己的自主落地率只需一行 grep**：

```bash
grep -hoE 'Outcome: [^ ]*' .git/ocp-*-reports/*.md | sort | uniq -c | sort -rn
```

把 `landed-*` 加 `no-op` 除以除 `dry-run` 之外的全部 —— 预览不是一次落地尝试。是这个数字
而不是承诺，才能告诉你这些命令是否真的扛下了你的日常合并；而当它不达标时，
`handed-over:` 直方图会直接指出下一处该消除的摩擦，不用你猜。

报告还包含逐 hunk（或逐提交）的决策表及每条理由，以及安全轨迹：guard 分支、审计路径，
和用于复核或撤销的确切命令。`/git-pick` 还会报告提交映射 `<source-sha> → <new-target-sha>`
和每一个被跳过的提交及其原因。

报告使用你的会话语言；提交信息、路径、命令与协议标签保持英文。

---

## 常见故障

| 症状 | 原因 | 处理方式 |
|---|---|---|
| `fatal: not a git repository` | 不在仓库内 | 停下；建议 `cd <repo>` |
| `error: pathspec '<X>' did not match` | 分支名写错或不存在 | 停下；列出分支并重新确认 |
| `git pull --ff-only` 被拒 | 本地 target 与 origin 分叉 | 停下；由你先调和 target |
| `git push` 以 `non-fast-forward` 被拒 | 远端有本地没有的提交 | `/git-push` fetch、建 guard、按所选策略调和后重试 |
| `git push` 因认证、策略、hook 或网络失败 | 不是分叉问题 | 停下并报告真实远端错误；绝不改用 force |
| rebase 后需要 `git push --force` | 本地历史已被改写 | 仅在明确选择时使用 `/git-push --force-with-lease` |
| `There is no tracking information` | 未配置上游 | 停下（`/git-pull`），或在本地 HEAD 上继续并说明（其余命令）；绝不当作分叉 |
| `Unable to create .git/index.lock` | 有并发 git 进程或残留锁 | 停下；确认无 git 进程活动后才移除残留锁 |
| `Your local changes would be overwritten` | 工作区脏 | 停下；由你 commit 或 stash |
| `Already up to date` / `is up to date` | source ⊆ target | 报告无事可做；不建 guard、不改动 |
| `CONFLICT (content)` | 双方改了同一区域 | 走教义 §4–§7：基线优先的语义解决 |
| `CONFLICT (modify/delete)` | 一方删除、一方修改 | 按意图裁决；绝不自动复活 |
| `No changes - did you forget to use 'git add'?` | 解决方案让该提交变空 | `--skip`，并记录 SHA 与原因 |
| 重放区间内有独有 merge 提交 | 默认 rebase 会压平拓扑 | 停下；建议改用 `/git-merge` |
| `@advisor` 失败 / 超时 | 拿不到第二意见 | 尽力而为：该 hunk 交还给你，其余继续，绝不猜 |
| hook 或签名失败 / 需要交互 | 仓库策略或需要交互式凭据 | 保持暂停状态、报告真实输出、交还给你 —— 绝不绕过 |
| 无验证命令 + 有人工解决 | 无法证明结果可靠 | 停下；归档并以 *resolved-but-unverified* 交还，target 不前进 |
| `fatal: … merge/rebase/cherry-pick in progress` | 上一次运行的残留 | 走该命令的 `--abort` 流程，以便在 abort **之前**归档决策日志 |
