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
