# AGENTS.md

本文件适用于本仓库全部目录。后续自动化开发、代码审查、测试、PR 与交接工作必须遵守本文件。

## 1. 项目身份

- 中文名称：程序员划词翻译
- 英文名称：Programmer Selection Translator
- 插件 ID：`plugin.com.elio.programmer-selection-translator`
- Homepage：`https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection`
- 图标：`icon.svg`
- 最终安装包：`plugin.com.elio.programmer-selection-translator.potext`

不得恢复或引入 Lingva 模板身份、请求地址配置或示例 API 逻辑。

## 2. 开发职责

### 网页端 ChatGPT

网页端 ChatGPT 是本项目的主开发者，负责：

- 读取真实 GitHub 源码、提交历史、分支、PR 与 Actions；
- 技术方案、架构与兼容性决策；
- 创建和修改远端开发分支；
- 编写、重构和修复代码；
- 编写并运行 JavaScript、Python 与加载契约测试；
- 创建 Draft PR，跟踪并修复 GitHub Actions；
- 构建、下载、检查 `.potext` Artifact；
- 输出给本地 AI 的只读验证指令；
- 在 CI、Artifact 和必要验收证据齐全前，不宣称阶段完成。

### 本地 AI

本地 AI 只负责验证，不参与开发。允许执行：

1. `git fetch origin`
2. checkout 指定分支；
3. reset 到网页端 ChatGPT 指定 SHA；
4. 运行明确指定的 npm、Node.js、Python 测试或构建命令；
5. 下载或使用指定 GitHub Actions Artifact；
6. 安装 `.potext`；
7. 执行 Pot GUI 烟测；
8. 原样回传命令、日志、截图与实际输出。

本地 AI 禁止：

- 修改、格式化或自动修复代码；
- 重新设计功能或改变架构；
- 创建提交、分支、标签或 PR；
- push 或合并任何分支；
- 使用真实 Gemini API 做自动化测试；
- 隐瞒失败、删改日志或用推测结果代替实际结果。

## 3. 读取与修改顺序

开始任何功能前必须：

1. 先读取本文件；
2. 再确认目标仓库、目标分支、Base SHA 与 Head SHA；
3. 读取目标分支真实源码、测试和工作流；
4. 涉及迁移时读取固定来源分支或固定提交，不能使用旧示例、伪代码或记忆替代；
5. 确认真正运行路径与打包路径后才修改代码。

不得因为 README、旧 PR 描述或模板示例与真实代码冲突，就忽略真实代码。

## 4. 分支与 PR 规则

- 功能代码不得直接提交到 `main`。
- 第一层本地词典分支：`feat/migrate-local-dictionary`，PR Base 为 `main`。
- Gemini 第二层分支：`feat/gemini-semantic-layer`，必须从通过验收的 `feat/migrate-local-dictionary` 创建，PR Base 为 `feat/migrate-local-dictionary`。
- Gemini Key 池与 Interactions API 分支：`feat/gemini-key-pool-and-model-routing`，必须从固定的 PR-B Head `4508d3b8f9490c3d02cf4f14b14662f7955127c2` 创建，PR Base 为 `feat/gemini-semantic-layer`。
- 各 PR 均先创建为 Draft PR。
- 未经用户明确指示不得合并、关闭或转换为 Ready for review。
- 不得修改、关闭或合并旧仓库迁移来源 PR。
- 每次远端写入后记录最新 Head SHA。

Git Commit 必须使用 `英文 Tag: 中文描述`，例如：

- `feat: 迁移本地词典运行时与标识符解析`
- `fix: 修复数据库加载失败时的回退逻辑`
- `test: 增加 Gemini 错误回退测试`
- `ci: 添加词典构建与 Pot 插件打包检查`
- `docs: 更新安装与隐私说明`

## 5. 第一层本地优先原则

第一层必须在无网络条件下完成核心功能，包括：

- 标识符识别、拆分、缩写保护与命名格式转换；
- 编程术语、编程短语和普通英语词典查询；
- 音标、中文释义、词形原型与中文转英文标识符；
- 数据库不可用时的内置词典回退；
- Pot `eval` 加载契约兼容。

`dictionary.db` 是构建产物，不提交到 Git。完整词典必须由 CI 使用固定 ECDICT 提交构建。

## 6. Gemini 第二层原则

Gemini 只能作为可关闭的语义增强层：

- 默认 `aiMode=off`；
- `off` 必须零网络请求；
- `unknown_only` 在本地全部命中时必须零网络请求；
- 默认只发送未知 token 和最少必要上下文；
- 只有 `sendScope=identifier` 才可发送完整标识符；
- 不发送源码行、文件路径、项目名称、未选中的剪贴板内容；
- 标识符拆分、缩写边界和命名格式生成始终由本地代码负责；
- Gemini 失败、超时、限流、鉴权失败、空响应或非法响应时，必须完整回退本地结果；
- PR-C 使用 Gemini Interactions API，必须显式 `store: false`，不得保留 `generateContent` 主请求路径；
- PR-C 默认模型为 `gemini-3.5-flash-lite`，不实现备用模型自动切换；
- 所有自动化测试必须 mock 网络，不调用真实 Gemini API。

开始 Gemini 实现前，必须通过网页搜索核对 Google 官方 Gemini API 文档，只以官方文档确定模型、接口版本、请求结构、API Key 传递、JSON 响应、安全和配额规则。

## 7. API Key 与隐私

禁止：

- 提交、打印、返回或打包真实 API Key；
- 在 URL、日志、异常、快照、README、`.env` 或 Artifact 中泄漏 Key；
- 输出完整请求头或包含 Key 的配置对象；
- 在运行期调度状态库中保存完整 Key 或 Key 尾号。

测试只能使用：`test-gemini-key-not-real`，并验证该字符串不会进入插件输出、错误信息、日志、快照或 Artifact。

README 必须明确说明：Pot 插件设置页可能以明文显示 Gemini API Key。

PR-C 的 `gemini_state.db` 只能在安装后运行期创建，只能保存 Key 指纹与调度状态，不得提交或打包。

## 8. 测试与 CI 门禁

提交前应运行与改动相关的全部测试。GitHub Actions 至少覆盖：

- 生成最终 `main.js`；
- JavaScript 单元测试；
- Python 词典构建测试；
- Pot `eval` 加载契约测试；
- `info.json` 字段校验；
- 固定 ECDICT 下载与 `dictionary.db` 构建；
- 数据库规模、中文释义与许可检查；
- API Key 泄漏静态检查；
- `.potext` 根目录结构检查；
- Artifact 上传。

CI 未全部通过时不得宣称完成。不得通过跳过测试、弱化断言或移除安全检查来“修复”CI。

## 9. Artifact 规则

最终 `.potext` 根目录至少包含：

- `main.js`
- `info.json`
- `icon.svg`
- `dictionary.db`
- `dictionary.meta.json`
- `THIRD_PARTY_NOTICES.md`

不得包含：

- `src/`
- `tests/`
- `scripts/`
- `.env`
- API Key
- 请求日志
- 开发缓存
- `gemini_state.db`
- `lingva.svg`

生成 Artifact 后必须检查文件名、大小、根目录层级、文件清单、词典元数据和敏感信息泄漏。

## 10. 代码质量要求

- 优先小而清晰的纯函数，网络逻辑与本地解析逻辑分离；
- 保持 Pot 运行环境兼容，不随意引入第三方运行时依赖；
- 对外部输入、数据库结果与模型响应做长度、类型、字段和白名单校验；
- 不执行模型返回内容，不使用 `eval` 处理模型数据；
- 错误信息应可诊断，但不得包含 API Key 或完整敏感配置；
- 代码注释、开发报告和用户交接统一使用中文。

## 11. 阶段汇报与本地验证指令

每个阶段汇报至少包含：

- 仓库、分支、Base SHA、Head SHA；
- 修改文件与删除残留清单；
- 测试命令、数量和结果；
- Draft PR URL；
- Actions Run URL 与各 Job 结果；
- Artifact ID、大小和包内文件清单；
- 已知限制与 Pot GUI 待验收项；
- 一段可直接交给本地 AI 的验证指令。

本地验证指令必须明确禁止本地 AI 修改代码、提交、push、创建 PR 或自动修复。
