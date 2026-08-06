# Skill 审计与项目映射

本表基于 Superpowers 6.2.0 的实际 Skill 文件。引入正文位于 `skills/<name>/SKILL.md`。

| Skill | 是否引入 | 本仓库用途 | 适配要求 |
|---|---|---|---|
| `brainstorming` | 是 | 新功能、协议、架构和交互设计 | 用户已批准的设计不重复追问；遵守中文和方案分支门禁 |
| `dispatching-parallel-agents` | 否 | 不适用 | 不模拟控制其他独立 AI 对话 |
| `executing-plans` | 是 | 按已批准 Plan/Tasks 开发 | 使用 GitHub task 分支和 Draft PR |
| `finishing-a-development-branch` | 是 | 验证、PR 与交接收尾 | 未经授权不得合并、Ready 或删除分支 |
| `receiving-code-review` | 是 | 处理 PR 审查意见 | 逐条验证，保留安全与兼容边界 |
| `requesting-code-review` | 是 | 完成任务后的独立审查 | 使用 GitHub PR 或只读 AI 对话 |
| `subagent-driven-development` | 否 | 不适用 | 多对话通过 GitHub 对象交接，不视为子代理 |
| `systematic-debugging` | 是 | 测试失败、CI 失败、运行异常 | 先根因，后最小修复；不得盲改 |
| `test-driven-development` | 是 | JavaScript/Python/Pot 契约功能和 Bug | 无执行环境时只能设计 RED、写测试、静态核对并标为未执行 |
| `using-git-worktrees` | 否 | 远端工作流不需要 | 仅有真实本地工作区且明确适用时另行使用 |
| `using-superpowers` | 否 | 插件自举流程 | 仓库内资料不冒充已安装插件 |
| `verification-before-completion` | 是 | 防止虚构测试、CI、Artifact | 按实际证据分类报告 |
| `writing-plans` | 是 | 多步实现 Plan 和任务拆分 | 使用现有 `docs/` 约定和真实文件路径 |
| `writing-skills` | 否 | 当前不维护新 Skill | 不适用 |

## 引入的辅助资料

保留 brainstorming 的规格审阅提示、writing-plans 的计划审阅提示、systematic-debugging 的根因/纵深防御/条件等待资料、test-driven-development 的测试编写资料和 requesting-code-review 的审查者提示。

## 冲突优先级

系统与安全规则 > 用户当前明确要求 > 最近的 `AGENTS.md` > 任务计划和开发包 > 本项目工作流 > 上游 Skill 通用正文。
