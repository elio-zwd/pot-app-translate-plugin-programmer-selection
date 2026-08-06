# Superpowers 项目开发工作流适配

本目录收录经过许可证审计的 Superpowers 6.2.0 必要工作流 Skill，并为程序员划词翻译插件仓库提供适配规则。它们仅供 AI 与开发者在开发阶段阅读，不是 Pot 插件运行时依赖，也不得进入 `.potext` 安装包。

## 使用入口

- [项目工作流](project-workflow.md)：本仓库执行顺序、边界与能力降级规则。
- [Skill 映射](skill-mapping.md)：引入与排除的 Skill、项目适配要求。
- [上游记录](UPSTREAM.md)：来源、固定版本、许可证与更新方式。
- [许可证](LICENSE)：Superpowers 上游 MIT License 原文。

## 引入范围

本目录引入 9 个核心开发工作流 Skill 正文，以及正文直接引用且适合离线阅读的 7 个 Markdown 辅助资料。未引入插件清单、图标、代理配置、Shell/Node 脚本、视觉伴侣运行器、并行代理或 Worktree 辅助流程。

上游 Skill 正文与辅助资料保持英文原文；本仓库适配规则和审计说明使用中文。

## 使用方式

当 Superpowers 插件接口不可调用时，AI 应先阅读本文件和 `project-workflow.md`，再直接读取匹配任务的 `skills/<name>/SKILL.md`，执行等价人工流程。不得仅因目录存在就声称插件接口已成功调用。

## 维护边界

更新前必须重新核验上游版本、来源 Commit、许可证、文件清单和敏感信息。不得把本目录加入插件构建输入、运行时代码、词典数据库或发布 Artifact。
