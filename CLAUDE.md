# CLAUDE.md

面向在本仓库工作的 Claude Code 的项目约定。

## Git / PR 工作流

- **每次 `git push` 前,先确认当前分支的上游 PR 是否已合并**(用 GitHub 工具
  `pull_request_read` / `search_pull_requests` 查该分支的 PR 状态)。
- **已合并的 PR 是终态、不可复用**:不得把新提交摞在已合并历史之上。若上游
  PR 已合并,应从 `origin` 默认分支重建同名分支、仅保留未合并提交
  (rebase / cherry-pick),再开**新** PR,而不是继续推旧分支。
- 每批独立工作走独立 PR;不把不相关改动混进正在评审的 PR。

> 该约定亦由 `.claude/settings.json` 的 PreToolUse hook 在 `git push` 前提醒。

## Subagent / Workflow 模型分配

用 subagent(Agent 工具)或 Workflow 跑任务时,**按任务难度分配模型,
不得全部默认主模型(Fable)** — 出于效率与成本考量:

- **haiku**: 机械/批量任务 — 文件检索、grep 汇总、格式核对、清单盘点等
  低推理负担工作。
- **sonnet**: 常规主力 — 代码阅读理解、常规实现、测试编写、一般 review。
- **opus**: 高难度节点 — 复杂 bug 定位、对抗性验证、架构评审、
  设计裁决(judge/verify 类)。
- **主模型(Fable/继承)**: 仅在确有必要时(最高难度推理、需要与主会话
  同等判断力的裁决),不作为缺省选择。

Workflow 脚本里通过 `agent(prompt, {model, effort})` 逐 agent 指定;
低难度批量段配 `effort: 'low'` 进一步降本。
