---
description: "Review-fix loop — iterative review & fix until no P0/P1 remain. Usage: /review-fix-loop [scope]  |  scope = last commit | HEAD~N | branch | PR | files | (empty=uncommitted)"
agent: orchestrator
model: llm-router/default
---

Execute the **review-fix-loop** workflow — an iterative review-and-fix cycle that coordinates between `@code-review` (for finding issues) and domain specialists (for fixing them), looping until no P0/P1 issues remain.

$ARGUMENTS

## Determining review scope

Before starting the loop, determine what to review:

1. **If the user specified a commit/branch/PR** → review that specific change set. Use `git diff`, `git log`, `git show` to identify changed files.
2. **If the user said "latest commit"** → run `git log -1` and `git diff HEAD~1` to find the changes.
3. **If the user specified files** → review those files and their diff against the base branch.
4. **If nothing specific** → run `git status` and `git diff` to discover uncommitted changes.
5. **If still unclear** → ask the user one focused question to clarify scope.

## The loop

### Maximum iterations: 5 rounds

The loop runs at most 5 rounds. If P0/P1 issues remain after 5 rounds, stop and report.

### Round structure

Each round consists of:

1. **Review** — dispatch to `@code-review` with the current change set and any context from previous rounds.
2. **Triage** — if P0/P1 issues are found, classify each by domain:
   - Backend / API / service logic → `@java-dev`, `@python-dev`, `@go-dev`, or `@node-dev` (based on repository language).
   - Frontend / UI / component / CSS → `@frontend-dev`.
   - Database / SQL / migration / query issue → `@dba`.
   - Security / auth / permission / injection / secret handling → `@security`.
   - DevOps / deployment / CI / Docker / infra issue → `@devops`.
3. **Fix** — dispatch to the matching specialist for each P0/P1 issue. Provide the specific finding, file:line reference, and the fix suggestion from the review. Fix ONLY blocking issues — leave P2/P3 for later.
4. **Re-review** — dispatch to `@code-review` again on the updated changes.

### Stop conditions

- **Stop immediately** when `@code-review` reports no P0/P1 issues.
- **Stop** after 5 rounds, even if P0/P1 issues remain — report them as unresolved blockers.
- **Stop** if a fix introduces a new critical issue that can't be resolved within the same round — escalate to the user.

### Post-loop

Once the loop exits (cleared or max rounds reached):

1. If cleared → optionally dispatch to `@qa` for regression test recommendations.
2. Summarize the full loop (see Output format below).

## Dispatching guidelines

When dispatching to `@code-review`:
```
@code-review

Context: Review round N of the review-fix-loop. Previous rounds found and fixed: <summary of prior fixes>.
Task: Review the following changes for P0/P1 issues only. Focus on correctness, security, and data integrity.
Scope: <files/commits to review>
Expected output: Severity-ranked findings list with file:line references and concrete fix suggestions.
```

When dispatching to a specialist for a fix:
```
@<domain-dev>

Context: Review-fix-loop round N. @code-review found the following P0/P1 issue:
  - `<file>:<line>` — <problem description>. Suggested fix: <suggestion>.
Task: Apply a minimal, targeted fix for this issue. Do not refactor or change unrelated code.
Constraints: Keep the fix minimal. Do not introduce new patterns or dependencies.
Expected output: The fix applied, with a brief explanation of what changed and why.
```

## Hard rules

- **Do not stop after the first review** if blocking issues remain — that defeats the purpose of the loop.
- **Fix only P0/P1 issues** — do not fix P2/P3/nits unless they directly block the review loop.
- **Prefer minimal, targeted fixes** — one issue, one fix. No drive-by refactoring.
- **Carry context forward** — pass prior round findings to the next `@code-review` dispatch so it doesn't re-report fixed issues.
- **One specialist per issue** — don't combine multiple issues into one dispatch. Each issue gets a focused fix.
- **If the repository language is unclear**, choose the most likely specialist based on the files involved.
- **Escalate when stuck** — if a fix can't be applied without user input (e.g., ambiguous requirement, breaking change), stop and ask the user.

## Output format

### Per-round output

```
### Review Round N
- Findings: <P0 count>P0, <P1 count>P1, <P2+ count>P2+
- Fixes applied: <list of files changed and what was fixed>
- Remaining blockers: <yes/no> — <count> P0/P1 issues remain
```

### Final summary

```
## Review-Fix Loop Summary

**Verdict: <Cleared | Remaining blockers>**

### Loop statistics
- Rounds completed: <N>
- Issues found: <total>
- Issues fixed: <count>
- Issues remaining: <count>

### Fixed issues
- `path/to/file.ts:42` — <issue> → <fix applied>

### Remaining issues (if any)
- `path/to/file.ts:15` — <issue> — <why it wasn't fixed>

### Recommended next steps
- <regression test / follow-up / escalate>
```

## Output protocol (mandatory)

Applies to all explanation, summary, and analysis output (not code itself).

### Conclusion first
First sentence states the core conclusion with confidence level and one-line rationale.
Format: `**Conclusion**: <one sentence> (Confidence: High/Medium/Low — <reason>)`

### Visual overview
Prefer diagrams over prose. Architecture → Mermaid structure diagrams, flows → Mermaid flowcharts, comparisons → tables, data → charts.

### Layered exposition
Organize body in three layers, each independently readable:
- **Summary** (1-3 sentences: conclusion + key numbers)
- **Key points** (one sentence each, numbered)
- **Details** (expansion, skippable)

### Content labeling
Label all key content as one of three types:
- [Fact] — verifiable (code, docs, test results)
- [Inference] — derived from known information
- [Assumption] — unverified, needs validation

Assumptions get their own section: `## Assumptions (to confirm)`

### Counterargument
Each key conclusion gets one line: `> Counter: This conclusion fails when <condition>, because <reason>.`

### Decision checklist
End with:
```
## Decisions to confirm
1. [ ] <decision point> — Agree/Modify?
```
User replies Agree or Modify per item.

### Verifiable data
Cite sources for all data (file paths, URLs, test output). Show calculation steps, not just results.

### Concise language
Max 30 words per sentence. One idea per paragraph. Explain jargon on first use in one sentence.

### Optional analogy
Complex concepts may include an analogy in a `> 💡 Analogy: ...` callout, not in the main body.

<!--
  ════════════════════════════════════════════════════════════════
  使用说明 (Reference — 不作为 prompt 指令执行)
  ════════════════════════════════════════════════════════════════

  用法:  /review-fix-loop [scope]

  scope 可选值:
    (空)              → 自动检测未提交的变更 (git status + git diff)
    最后一个commit      → 审查最近一次提交 (git diff HEAD~1)
    HEAD~3            → 审查最近 3 次提交
    feat/auth         → 审查指定分支 (与当前分支的 diff)
    src/api/           → 审查指定文件/目录
    #42               → 审查 PR #42 的变更

  示例:
    /review-fix-loop
    /review-fix-loop 最后一个commit
    /review-fix-loop HEAD~3
    /review-fix-loop feat/auth
    /review-fix-loop src/api/user.ts

  工作流:
    1. @code-review 发现 P0/P1 问题
    2. 按领域分发给 specialist 修复 (java/python/go/node-dev, frontend-dev, dba, security, devops)
    3. @code-review 复审
    4. 重复 1-3 直到无 P0/P1，最多 5 轮
    5. 输出最终报告

  以下内容为 prompt 模板，请勿删除。
  ════════════════════════════════════════════════════════════════
-->
