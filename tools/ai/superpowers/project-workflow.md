# 程序员划词翻译插件项目工作流

本文件把 Superpowers 工作流映射到 `pot-app-translate-plugin-programmer-selection`。仓库 `AGENTS.md`、用户要求、安全规则和任务专用计划优先于本文件及任何通用 Skill。

## 推荐顺序

1. 新功能、架构和交互设计：使用 `brainstorming`，先确认目标、边界、兼容性与验收标准。
2. 编写实施方案：使用 `writing-plans`，计划必须指向真实 runtime、测试、构建脚本、CI 和 Artifact 路径。
3. 按批准计划开发：使用 `executing-plans`；每个 AI 对话只负责一个任务分支和一个 Draft PR。
4. Bug、测试失败或行为异常：使用 `systematic-debugging`，先建立复现、证据和根因链。
5. 适合 TDD 的实现：使用 `test-driven-development`，按 JavaScript、Python、Pot `eval()` 和现有 CI 契约执行。
6. 完成前验证：使用 `verification-before-completion`，区分实际执行、GitHub CI、静态核对和尚未验证。
7. 请求代码审查：使用 `requesting-code-review`，优先通过独立只读 AI 对话或 GitHub PR 审查。
8. 处理审查意见：使用 `receiving-code-review`，逐条核对代码和测试，不盲目照改。
9. 准备 PR 与收尾：使用 `finishing-a-development-branch`；未经用户授权不得合并、标记 Ready、关闭 PR 或删除分支。

## 上游指令覆盖

| 上游 Skill 指令 | 本仓库替代行为 |
|---|---|
| 使用 `using-git-worktrees` | 仅在真实本地 Git 工作区且确有需要时使用；远端 GitHub 工作流使用独立分支。 |
| 使用 `subagent-driven-development` | 不模拟或控制其他 ChatGPT 对话；通过 task 分支、Commit、PR 和交接文档协作。 |
| 使用 `dispatching-parallel-agents` | 不调用；仅在用户分别启动独立对话后，按文件边界并行。 |
| 分派 reviewer subagent | 使用独立只读审查对话或 GitHub PR Review。 |
| 启动 Visual Companion | 当前能力不存在时跳过，不视为流程失败。 |
| 使用 Forge CLI | CLI 不可用时使用 GitHub 插件。 |
| 自动合并或清理分支 | 必须等待用户明确授权。 |

## 本仓库不可变边界

- 先读取根目录 `AGENTS.md`、目标分支、Base/Head SHA、相关源码、测试和工作流。
- 默认本地优先；`aiMode=off` 和本地完整命中的 `unknown_only` 必须零网络。
- AI 不得覆盖本地拆分、固定技术语义和最终命名格式。
- Gemini 失败必须完整回退本地结果，测试不得调用真实 Gemini API。
- 不提交、打印、返回或打包真实 Key；不在状态库保存完整 Key。
- 不提前关闭共享数据库池；无 `setResult` 路径必须保留纯文本兼容。
- 不引入无必要运行时依赖，不把 `tools/`、`tests/` 或开发资料放入 `.potext`。
- 无法运行命令时明确写“未执行”及原因，不得声称通过。
- 只在实际读取到 CI、Artifact 或命令输出后声明相应结果。

## 多对话协作

- 一个对话只负责一个明确 Task、一个独立分支和一个 Draft PR。
- 开始前检查开放 PR 和同文件冲突。
- 强依赖任务串行；只有文件范围不重叠的任务才并行。
- 跨仓库依赖必须固定对方 Commit SHA，不依赖口头总结。
- 集成任务由单独对话负责，不允许多个对话同时修改高冲突主路径。

## 能力降级

当 Superpowers 插件接口不可调用但本目录可读时，直接阅读对应 `SKILL.md` 并执行等价人工流程，同时明确说明接口不可调用。仓库内 Skill 是参考资料，不会自动注册成 ChatGPT 插件。
