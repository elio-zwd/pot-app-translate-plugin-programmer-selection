# 程序员划词翻译

Programmer Selection Translator 是一个面向程序员的 Pot 外部翻译插件，用于拆分、解释和转换函数名、变量名、类名、常量、文件名，也可以离线查询普通英文单词的中文释义，并按用户选择启用 Gemini 语义增强。

- 插件 ID：`plugin.com.elio.programmer-selection-translator`
- Homepage：`https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection`
- 许可证：GPL-3.0-only

## 本地能力

第一层完全本地运行，不发送选中文本或代码：

- 拆分 `camelCase`、`PascalCase`、`snake_case`、`SCREAMING_SNAKE_CASE`、`kebab-case`；
- 保护连续大写和带数字缩写，如 `HTTP`、`IPv6`、`I2C`、`RS485`、`ST25DV`；
- 识别函数名、变量名、布尔变量、类名、常量/宏和文件名；
- 使用内置编程术语与编程短语生成中文上下文含义；
- 使用 ECDICT 离线数据库补充普通词义、音标和词形原型；
- 支持常见中文描述转英文标识符；
- 数据库不可用时保留内置编程词典结果；
- 最终命名格式始终由本地规则生成。

## Pot 完整分析布局

输入：

```text
gemini-real-api-pot-smoke-test
```

启用 AI 后，主要显示：

```text
文件名
  gemini-real-api-pot-smoke-test

词语拆分
  gemini · real · API · pot · smoke · test

本地释义
  Gemini 真实 API Pot 冒烟测试

AI 解释
  用于验证 Gemini 真实 API 在 Pot 插件中的基本连通性与功能可用性。

词义
  gemini：Gemini 模型〔AI〕
  real /'ri:əl/：真实的、实际的
  API：应用程序编程接口
  pot：Pot 应用〔AI〕
  smoke /sməuk/：烟、烟雾、冒烟
  test /test/：测试、试验、测试

常用命名
  小驼峰：geminiRealApiPotSmokeTest
  大驼峰：GeminiRealApiPotSmokeTest

分隔命名
  下划线：gemini_real_api_pot_smoke_test
  短横线：gemini-real-api-pot-smoke-test

常量命名
  大写下划线：GEMINI_REAL_API_POT_SMOKE_TEST
```

设计原则：

- 本地释义始终保留；
- AI 只提供整体语义解释；
- 所有本地词义都在同一个“词义”分组中按原顺序展示；
- 本地未收录 token 在 Gemini 成功时用 AI 补全，并标记 `〔AI〕`；
- AI 关闭、失败或未返回某个 token 时，该项继续显示“未收录”；
- 命名转换压缩成三个中文分组，避免五种格式各占一个区块。

## 配置

### 输出格式

- 完整分析
- 小驼峰命名（`camelCase`）
- 大驼峰命名（`PascalCase`）
- 下划线命名（`snake_case`）
- 大写下划线命名（`SCREAMING_SNAKE_CASE`）
- 短横线命名（`kebab-case`）
- 拆分词组
- 仅中文含义

### 本地词典显示

- 编程术语 + 普通词义
- 仅编程术语优先
- 仅普通英语词典

### 标识符类型

- 自动判断
- 函数名
- 变量名
- 布尔变量
- 类名
- 常量/宏
- 文件名

### 缩写格式

- 标准驼峰：`getHTTPResponse` 转为 `getHttpResponse`
- 保留大写：`getHTTPResponse` 保持 `getHTTPResponse`

### AI 翻译方式

- `关闭，仅使用本地结果`：默认值，零网络请求、零 Gemini 状态库写入；
- `智能补全本地未知词`：仅当本地层仍有未知 token 时请求，推荐日常使用；
- `每次使用 AI，并与本地结果同时显示`：完整分析或仅中文含义时始终请求。

Gemini 不参与标识符拆分、缩写边界或命名格式生成。任何 Gemini 失败都不会删改本地结果。

### Gemini 发送范围

- `unknown_tokens`：默认值。仅发送未知 token 和最少必要相邻 token，不发送完整标识符；
- `identifier`：用户明确选择后，才在请求中增加完整标识符。

插件不会发送完整源码行、文件路径、项目名称、未选中的剪贴板内容或本地数据库内容。

## Gemini Key 池

`apiKeyPool` 最多接受 20 个唯一合法 Key，支持换行、英文逗号、中文逗号和分号分隔。可以添加本地名称，也可以用 `#` 前缀禁用：

```text
主要=<KEY_1>
备用=<KEY_2>
#停用=<KEY_3>
```

调度策略固定为 `failover_only`：

- 成功后继续使用当前 Key；
- 只有请求失败且错误类型允许切换时，才尝试下一个 Key；
- 单次逻辑请求默认最多尝试 5 个不同 Key，可配置为 1、3、5、10 或 20；
- `401/403` 标记当前 Key 无效；
- `429` 按 `Retry-After` 或本地阶梯策略进入冷却；
- `408`、网络异常和超时在当前 Key 额外重试 1 次；
- `5xx` 在当前 Key 额外重试最多 2 次；
- `400`、`404` 或结构化响应非法时停止当前 Gemini 请求，不切换模型。

运行时调度状态保存在插件目录内的 `gemini_state.db`。该数据库只保存 SHA-256 指纹、状态、冷却时间和计数，不保存完整 Key、Key 尾号、用户输入或模型输出。

## API 与模型

默认模型为 `gemini-3.5-flash-lite`。设置页还提供：

- `gemini-3.6-flash`；
- `gemini-3.5-flash`；
- `gemini-3.1-flash-lite`；
- 自定义模型 ID。

Gemini 请求使用 Interactions API：

```text
POST https://generativelanguage.googleapis.com/v1beta/interactions
```

- API Key 只通过 `x-goog-api-key` 请求头传递；
- 请求显式设置 `store: false`、`stream: false`、`background: false`；
- 使用顶层 `response_format` 请求 JSON 结构化文本；
- 不使用 `previous_interaction_id`、工具调用、后台任务或流式输出；
- 模型响应由本地代码执行字段白名单、token 白名单、类型、数量和长度校验。

Google 官方依据：

- `https://ai.google.dev/gemini-api/docs/interactions-overview`
- `https://ai.google.dev/api/interactions-api-v1`
- `https://ai.google.dev/gemini-api/docs/structured-output`
- `https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite`

## API Key 明文限制

**Gemini API Key 池在 Pot 插件设置页面可能以明文显示。**

当前 Pot 通用外部插件配置页没有专用密码输入类型。请避免在录屏、截图或远程协助时暴露设置页面。

本仓库不会：

- 提交或内置真实 API Key；
- 在日志、异常、插件输出或 URL 中显示 Key；
- 将完整 Key 写入 `.env`、测试快照、状态数据库或 Artifact；
- 输出完整请求头或包含 Key 的配置对象。

## 回退策略

以下情况全部保留完整本地结果：

- 未填写可用 Key、全部 Key 被禁用或达到尝试上限；
- 模型配置非法；
- HTTP、网络、超时或全局截止时间失败；
- Interaction 未完成、缺少 `model_output`、响应为空或非 JSON；
- Markdown 代码围栏、额外字段、未知 token 键、字段类型错误或内容超长；
- Pot 当前环境不提供网络或状态数据库能力。

## 安装

1. 打开本仓库的 **Actions** 页面。
2. 进入 `Programmer Selection Translator` 工作流。
3. 下载 `plugin.com.elio.programmer-selection-translator.potext` Artifact。
4. 解压 GitHub Artifact 外层 ZIP，得到同名 `.potext` 文件。
5. 在 Pot 中打开：`偏好设置 → 服务设置 → 翻译 → 添加外部插件 → 安装外部插件`。
6. 选择 `.potext`，保存配置，并将“程序员划词翻译”加入翻译服务列表。

## ECDICT 数据来源

普通英语数据来自 MIT 许可的 ECDICT，构建固定使用提交：

```text
bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b
```

完整数据源文件为 `ecdict.csv`。GitHub Actions 下载固定版本并生成 `dictionary.db`；数据库是构建产物，不提交到 Git。许可和转换说明见 `THIRD_PARTY_NOTICES.md`。

## 本地开发与测试

要求 Node.js 18+ 和 Python 3.10+。

```bash
npm test
python scripts/test_dictionary_build.py
```

构建完整离线词典：

```bash
curl -L --fail \
  -o /tmp/ecdict.csv \
  https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv

python scripts/build_dictionary.py \
  --input /tmp/ecdict.csv \
  --output dictionary.db \
  --meta dictionary.meta.json \
  --source-commit bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b
```

最终 `.potext` 根目录只包含：

```text
main.js
info.json
icon.svg
dictionary.db
dictionary.meta.json
THIRD_PARTY_NOTICES.md
```

`gemini_state.db`、源码、测试、脚本、`.env`、请求日志和开发缓存不会打包。

## 已知边界

- 当前插件只处理 500 个字符以内的标识符或简短文本；
- 普通英语词典主要面向英文单词，不替代通用句子翻译；
- AI 默认关闭，启用后才会访问 Google Gemini API；
- Pot 外部插件设置页可能明文显示 Key；
- 当前版本不实现流式输出、后台任务、工具调用或备用模型自动切换。
