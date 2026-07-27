# PR-C 开发交接：Gemini Key 池与 Interactions API

## 1. 仓库与分支

仓库：

```text
https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection
```

开发分支：

```text
feat/gemini-key-pool-and-model-routing
```

PR Base：

```text
feat/gemini-semantic-layer
```

固定起始 Base SHA：

```text
4508d3b8f9490c3d02cf4f14b14662f7955127c2
```

前置 PR：

```text
https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection/pull/2
```

PR #2 目前为 Draft、未合并。PR-C 必须继续保持独立 Draft PR，禁止合并任何 PR。

## 2. 新对话执行顺序

必须严格按顺序读取：

1. 根目录 `AGENTS.md`；
2. `docs/planning/pr-c-gemini-key-pool-interactions-plan.md`；
3. `docs/tasks/pr-c-gemini-key-pool-interactions-tasks.md`；
4. 本交接文档；
5. 当前分支真实源码、测试、README、工作流；
6. Google 官方 Gemini Interactions API、结构化输出、模型与变更日志。

不要重新从零规划，不要改变用户已确认的产品决策。发现官方接口已变化时，只调整必要技术细节，并在提交与 PR 中记录依据。

## 3. 已确认产品决策

```text
Key 策略：failover_only，成功后继续使用当前 Key，失败才切换
Key 上限：20
单次不同 Key 尝试上限：可配置，默认 5
Key 保存：接受 Pot 设置页明文，必须提示风险
启用/禁用：文本语法，# 前缀表示禁用
模型：稳定预设 + 自定义
默认模型：gemini-3.5-flash-lite
其他预设：gemini-3.6-flash、gemini-3.5-flash、gemini-3.1-flash-lite
模型回退：不实现
API：Interactions API
PR：独立 PR-C，Base 为 feat/gemini-semantic-layer
```

## 4. 官方 API 固定边界

截至 2026-07-27 已核实：

```text
POST https://generativelanguage.googleapis.com/v1beta/interactions
```

必须：

- `x-goog-api-key` 请求头；
- `store: false`；
- 顶层 `response_format` 结构化 JSON；
- 单次无状态请求；
- 不使用 `previous_interaction_id`；
- 不使用流式、后台、工具或备用模型；
- 不发送废弃采样参数。

官方文档：

- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite.md.txt?hl=zh-cn
- https://ai.google.dev/gemini-api/docs/latest-model.md.txt?hl=zh-cn
- https://ai.google.dev/gemini-api/docs/interactions-overview
- https://ai.google.dev/api/interactions-api-v1
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/changelog

## 5. 当前真实基线

PR-B Head：

```text
4508d3b8f9490c3d02cf4f14b14662f7955127c2
```

当前基线行为：

- 第一层本地词典完整工作；
- Gemini 默认关闭；
- 当前是单 `apiKey`、单自由填写 `model`；
- 当前网络路径是 `generateContent`；
- Gemini 失败完整回退本地结果；
- PR-B 自动测试和 CI 已通过；
- 不得直接修改生成的 `main.js`。

主要真实文件：

```text
AGENTS.md
src/runtime-01.js
src/runtime-02-gemini.js
scripts/build_runtime.py
info.json
README.md
GEMINI-HANDOFF.md
tests/main.test.cjs
tests/gemini.test.cjs
.github/workflows/build.yml
```

## 6. 实现重点

详细步骤以 Plan 和 Task 为唯一施工依据。核心不可偏离：

1. 新 Key 池解析兼容换行、逗号、分号、名称和 `#` 禁用；
2. SHA-256 指纹去重，最多 20 个；
3. Pot 每次会重新 eval 插件，调度状态必须使用独立 `gemini_state.db`；
4. 状态库只保存 fingerprint 和状态，不保存完整 Key；
5. 粘滞活动 Key 成功后保持，失败才推进；
6. 默认最多尝试 5 个不同 Key；
7. 401/403 invalid，429 冷却，网络/408/5xx 按 Task 重试；
8. 400、404、结构化响应非法时停止并回退本地；
9. Interactions 请求显式 `store:false`；
10. 没有任何备用模型切换；
11. 第一层和命名格式输出始终本地；
12. 所有自动测试 mock 网络，不调用真实 Gemini API。

## 7. 预期代码组织

```text
src/runtime-01.js
src/runtime-02-gemini.js
src/runtime-03-gemini-key-pool.js
src/runtime-04-gemini-interactions.js

tests/main.test.cjs
tests/gemini.test.cjs
tests/gemini-key-pool.test.cjs
tests/gemini-interactions.test.cjs
```

可以在不改变职责边界的前提下微调文件名，但必须继续由 `scripts/build_runtime.py` 合并为单一 `main.js`。

## 8. 提交与 PR 规则

- 不直接写 `main`、`feat/migrate-local-dictionary` 或 `feat/gemini-semantic-layer`；
- 只修改 `feat/gemini-key-pool-and-model-routing`；
- Git Commit 使用 `英文 Tag: 中文描述`；
- PR Base 必须为 `feat/gemini-semantic-layer`；
- PR 保持 Draft；
- 未经用户明确指示不得合并、关闭或转 Ready；
- 每次提交后记录 Head SHA；
- CI 失败必须修复真实问题，禁止删测试或弱化安全门禁。

建议提交拆分：

```text
feat: 添加 Gemini Key 池解析与无秘密状态存储
feat: 实现粘滞 Key 调度与错误冷却策略
refactor: 迁移 Gemini 请求到 Interactions API
feat: 添加稳定模型选择与旧配置兼容
 test: 补充 Key 池调度与 Interactions API 测试
ci: 更新 Interactions API 与密钥泄漏门禁
docs: 更新 Key 池模型配置与隐私说明
```

实际提交中修正 `test:` 前多余空格。

## 9. 完成前验证

至少执行：

```text
npm test
python scripts/test_dictionary_build.py
python scripts/build_runtime.py
```

并由 GitHub Actions完成完整词典构建、eval 契约、泄漏扫描和 `.potext` 打包。

必须下载 Artifact 检查：

- 包内文件清单；
- `main.js` 使用 `/v1beta/interactions`；
- 无 Gemini `:generateContent` 主路径；
- 存在 `store:false` 与 `x-goog-api-key`；
- 不包含 `gemini_state.db`；
- 不包含真实/假 Key、`.env` 或请求日志。

## 10. 最终汇报格式

最终汇报必须包含：

- 仓库、分支、Base SHA、最终 Head SHA；
- 修改和删除文件；
- 各测试数量与结果；
- Draft PR URL；
- Actions Run URL、Job 状态；
- Artifact ID、大小、SHA-256、包内清单；
- 自动验证、人工验证、未验证项；
- 可直接交给本地 AI 的只读验证指令。

本地 AI 禁止修改代码、提交、push、创建 PR、合并或自动修复。
