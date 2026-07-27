# Gemini 第二层开发交接

本文档定义当前 Gemini API 层的运行边界。第一层本地词典位于 `src/runtime-01.js`；Gemini 编排、Key 池与 Interactions 适配器位于后续 `src/runtime-*.js`。运行前由 `scripts/build_runtime.py` 合成为 Pot 所需的单文件 `main.js`，不要直接修改生成文件。

## 第一层提供的接口

- `prepareIdentifier(text, config)`：输入校验、标识符拆分和类型识别；
- `lookupGeneralDictionary(words, options)`：读取本地 `dictionary.db`；
- `programmingPhraseParts(words, entries)`：编程术语优先、ECDICT 兜底的组合含义；
- `buildDictionarySections(model, options)`：生成编程含义、普通词义、未知词和词典错误；
- `translate(...)`：仅在完整分析或中文输出时进入 Gemini；命名格式保持纯本地快速路径。

## Gemini 层固定边界

Gemini 只处理本地层无法可靠解决的语义，不负责标识符拆分、缩写边界或命名格式生成。

```text
aiMode: off | unknown_only | always
apiKeyPool: 最多 20 个 Key，# 前缀禁用
maxKeyAttempts: 1～20，默认 5
modelPreset: 四个稳定预设 | custom
customModel: 仅 custom 时使用
sendScope: unknown_tokens | identifier
```

默认必须是 `aiMode=off`，此模式在解析 Key 或打开状态数据库之前返回，保证零网络、零状态写入。未配置可用 Key、请求失败、超时、限流或响应格式不合法时，必须逐字保留完整第一层结果。

## Key 池与状态

Key 池支持换行、英文逗号、中文逗号和分号分隔，也支持 `名称=Key`。同一 Key 使用 SHA-256 指纹去重，保留第一次出现的位置、名称与启用状态，最多接受 20 个唯一合法 Key。

调度策略为 `failover_only`：成功后继续使用当前 Key，只有失败才切换；单次逻辑请求默认最多尝试 5 个不同 Key，不实现成功请求轮询。

运行期状态路径：

```text
sqlite:plugins/translate/plugin.com.elio.programmer-selection-translator/gemini_state.db
```

状态库只允许保存 fingerprint、状态、冷却时间、频控次数和时间戳，禁止保存完整 Key、Key 尾号、用户输入或模型输出。状态库不可用时降级为无持久化调度，不得影响本地回退。

## Interactions API 契约

固定端点：

```text
POST https://generativelanguage.googleapis.com/v1beta/interactions
```

必须满足：

- Key 只通过 `x-goog-api-key` 请求头发送；
- 默认模型为 `gemini-3.5-flash-lite`；
- 其他预设为 `gemini-3.6-flash`、`gemini-3.5-flash`、`gemini-3.1-flash-lite`；
- 顶层包含 `model`、`input`、`system_instruction`、`response_format`、`generation_config`；
- 显式 `store: false`、`stream: false`、`background: false`；
- 不使用 `previous_interaction_id`、工具、后台任务、流式响应或备用模型；
- 不发送 `temperature`、`top_p`、`top_k`。

## 错误动作

- `400`：停止并本地回退，不换 Key；
- `401/403`：标记 Key 无效并切换；
- `404`：停止并本地回退，不换 Key、不换模型；
- `408`：当前 Key 额外重试 1 次，仍失败才切换；
- `429`：按 `Retry-After` 或阶梯策略冷却并切换；
- `5xx`：当前 Key 额外重试最多 2 次，仍失败才切换；
- 网络异常或超时：当前 Key 额外重试 1 次，仍失败才切换；
- Interaction 未完成、空文本、非 JSON 或本地 Schema 校验失败：停止并本地回退，不换 Key。

单次 Gemini 增强具有 30 秒全局截止时间，单个 HTTP 请求最长 15 秒并受剩余全局时间约束。

## 数据最小化与响应校验

- `unknown_only` 只发送未知 token 和最少必要相邻词；
- 只有用户显式选择 `identifier` 时才发送完整标识符；
- 不发送源码行、文件路径、项目名或未选择的剪贴板内容；
- 不记录请求正文、API Key 或完整配置对象；
- 只接受 Interaction `status=completed`；
- 只拼接 `steps[type=model_output].content[type=text].text`；
- 顶层字段必须且只能为 `translatedWords`、`semanticDescription`；
- `translatedWords` 的键必须属于本次 `requestedTokens`；
- 本地继续校验数量、类型、长度、总长度和代码围栏；
- 不执行模型输出。

## 配置页限制

Gemini API Key 池在 Pot 插件设置页可能以明文显示。本仓库不修改 Pot 主程序，README 必须保持醒目风险提示。完整 Key 不得进入日志、异常、插件输出、URL、状态数据库、Git 或 Artifact。

## 自动测试要求

- 第一层测试必须继续全部通过；
- Key 池解析、禁用、去重、20 个上限、旧配置兼容和 SHA-256 指纹必须覆盖；
- 粘滞调度、尝试上限、冷却、错误重试与切换必须覆盖；
- Interactions endpoint、headers、body、`store:false` 和响应解析必须精确断言；
- Gemini 失败必须完整回退本地结果；
- Pot `eval()` 加载契约必须继续通过；
- 所有网络测试必须 mock，不调用真实 Gemini API；
- Node 测试使用内存状态库，不依赖真实 SQLite。
