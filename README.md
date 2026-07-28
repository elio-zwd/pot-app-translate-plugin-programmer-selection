# 程序员划词翻译

Programmer Selection Translator 是一个面向程序员的 Pot 外部翻译插件，用于拆分、解释和转换函数名、变量名、类名、常量、文件名，也可以离线查询普通英文单词的中文释义，并按用户选择启用 Gemini 语义增强。

- 插件 ID：`plugin.com.elio.programmer-selection-translator`
- Homepage：`https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection`
- 许可证：GPL-3.0-only

## 第一层：本地词典与命名转换

第一层完全本地运行，不发送选中文本或代码：

- 拆分 `camelCase`、`PascalCase`、`snake_case`、`SCREAMING_SNAKE_CASE`、`kebab-case`；
- 保护连续大写和带数字缩写，如 `HTTP`、`IPv6`、`I2C`、`RS485`、`ST25DV`；
- 识别函数名、变量名、布尔变量、类名、常量/宏和文件名；
- 使用内置编程术语与编程短语生成上下文中文含义；
- 使用 ECDICT 离线数据库补充普通词义、音标和词形原型；
- 支持常见中文描述转英文标识符；
- 数据库不可用时保留内置编程词典结果；
- 最终命名格式始终由本地规则生成。

## 示例

输入：

```text
translate_service_list
```

输出重点：

```text
编程含义：翻译服务列表
普通词义：
- translate /.../：v. 翻译；转化；解释
- service /.../：n. 服务；服役；公共事业
- list /.../：n. 清单；目录；列表
```

其他推荐输入：

```text
getIPv6Address
ST25DV_i2c_WriteData
apple
services
helloWorld
读取用户配置
连接是否成功
```

`services` 会显示 `service` 作为原形；未知词会明确标记为“未收录”，不会把英文原样冒充中文释义。

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

### 附加区块显示

- `显示命名转换`：可选择显示或不显示“常用命名、分隔命名、常量命名”；
- `显示状态提示`：可选择显示或不显示词典状态、AI 状态和剩余未收录词；
- 两项均默认显示，旧配置未保存这些字段时也按显示处理。

只有“完整分析”和“仅中文含义”需要读取普通英语数据库；单纯转换命名格式不会打开数据库，也不会调用 Gemini。

## 第二层：Gemini 语义增强

Gemini 只负责未知词的中文语义与标识符上下文解释，不参与标识符拆分、缩写边界或命名格式生成。任何 Gemini 失败都不会删改第一层结果。

### AI 翻译方式

- `关闭，仅使用本地结果`：默认值，零网络请求、零 Gemini 状态库写入；
- `智能补全本地未知词`：仅当本地层仍有未知 token 时请求，推荐日常使用；
- `每次使用 AI，并与本地结果同时显示`：完整分析或仅中文含义时始终请求。

AI 成功时，完整分析顶部使用一个“AI 释义”作为主释义，不再同时堆叠“本地释义”和“AI 解释”。AI 不可用时自动回退“本地释义”。所有 token 仍在统一“词义”分组中逐词换行展示：

- 本地词典已有可靠音标时保留音标；
- 本地未收录词使用 AI 翻译补全并标记 `〔AI〕`；
- 缩写、数字、产品名和 AI 补全项不伪造音标；
- AI 不覆盖本地已有词义。

### Gemini 发送范围

- `unknown_tokens`：默认值。仅发送未知 token 和最少必要相邻 token，不发送完整标识符；
- `identifier`：用户明确选择后，才在请求中增加完整标识符。

无论选择哪种模式，插件都不会发送完整源码行、文件路径、项目名称、未选中的剪贴板内容或本地数据库内容。

### Gemini Key 池

`apiKeyPool` 最多接受 20 个唯一合法 Key，支持换行、英文逗号、中文逗号和分号分隔。可以为 Key 添加仅用于本地辨认的名称，也可以用 `#` 前缀禁用：

```text
主要=<KEY_1>
备用=<KEY_2>
#停用=<KEY_3>
```

同一 Key 重复出现时保留第一次出现的位置、名称和启用状态。名称不会发送给 Google。

调度策略固定为 `failover_only`：

- 成功后继续使用当前 Key，不在成功请求间轮询；
- 只有请求失败并且错误类型允许切换时，才尝试下一个 Key；
- 单次逻辑请求默认最多尝试 5 个不同 Key，可配置为 1、3、5、10 或 20；
- `401/403` 将当前 Key 标记为无效；
- `429` 按 `Retry-After` 或本地阶梯策略进入冷却；
- `408`、网络异常和超时会在当前 Key 额外重试 1 次；
- `5xx` 会在当前 Key 额外重试最多 2 次；
- `400`、`404` 或结构化响应非法时停止当前 Gemini 请求，不切换模型。

运行时调度状态保存在插件目录内的 `gemini_state.db`，其中只包含 SHA-256 指纹、状态、冷却时间和计数，不保存完整 Key、Key 尾号、用户输入或模型输出。该文件安装后按需创建，不进入 Git 或 Artifact；状态数据库不可用时会降级为从第一个启用 Key 开始的无持久化模式。

### API 与模型

默认模型为 `gemini-3.5-flash-lite`。设置页提供以下稳定模型预设：

- `gemini-3.5-flash-lite`（默认）；
- `gemini-3.6-flash`；
- `gemini-3.5-flash`；
- `gemini-3.1-flash-lite`；
- 自定义模型 ID。

自定义模型只允许字母、数字、点、下划线和连字符，长度最多 80；不接受 URL、路径、查询参数或 `models/` 前缀。插件不使用浮动 `latest` 预设，也不实现备用模型自动切换。

Gemini 请求使用 Interactions API：

```text
POST https://generativelanguage.googleapis.com/v1beta/interactions
```

- API Key 只通过 `x-goog-api-key` 请求头传递，不拼接到 URL；
- 请求显式设置 `store: false`、`stream: false`、`background: false`；
- 使用顶层 `response_format` 请求 JSON 结构化文本；
- 不使用 `previous_interaction_id`、工具调用、后台任务或流式输出；
- 模型响应仍由本地代码执行字段白名单、token 白名单、类型、数量和长度校验。

Google 官方依据：

- `https://ai.google.dev/gemini-api/docs/interactions-overview`
- `https://ai.google.dev/api/interactions-api-v1`
- `https://ai.google.dev/gemini-api/docs/structured-output`
- `https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite`
- `https://ai.google.dev/gemini-api/docs/latest-model`
- `https://ai.google.dev/gemini-api/docs/changelog`

### API Key 明文限制

**Gemini API Key 池在 Pot 插件设置页面可能以明文显示。**

当前 Pot 通用外部插件配置页没有专用密码输入类型，本项目不会修改 Pot 主程序。请只使用用户自行创建的 Gemini API Key，并避免在录屏、截图或远程协助时暴露设置页面。

本仓库不会：

- 提交或内置真实 API Key；
- 在日志、异常、插件输出或 URL 中显示 Key；
- 将完整 Key 写入 `.env`、测试快照、状态数据库或 Artifact；
- 输出完整请求头或包含 Key 的配置对象。

### 回退策略

以下情况全部静默回退到逐字不变的完整本地结果：

- 未填写可用 Key、全部 Key 被禁用或达到尝试上限；
- 模型配置非法；
- HTTP、网络、超时或全局截止时间失败；
- Interaction 未完成、缺少 `model_output`、响应为空或非 JSON；
- Markdown 代码围栏、额外字段、未知 token 键、字段类型错误或内容超长；
- Pot 当前环境不提供网络或状态数据库能力。

Gemini 失败时，不附加远端错误信息，也不删减本地的原文、识别类型、拆分、编程含义、普通词义、未知词和命名格式转换。

## 安装

1. 打开本仓库的 **Actions** 页面。
2. 进入 `Programmer Selection Translator` 工作流。
3. 下载 `plugin.com.elio.programmer-selection-translator.potext` Artifact。
4. 解压 GitHub Artifact 外层 ZIP，得到同名 `.potext` 文件。
5. 在 Pot 中打开：`偏好设置 → 服务设置 → 翻译 → 添加外部插件 → 安装外部插件`。
6. 选择 `.potext`，保存配置，并将“程序员划词翻译”加入翻译服务列表。

## ECDICT 数据来源与隐私

普通英语数据来自 MIT 许可的 ECDICT，构建固定使用提交：

```text
bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b
```

完整数据源文件为 `ecdict.csv`。GitHub Actions 下载固定版本并生成 `dictionary.db`；数据库是构建产物，不提交到 Git。许可和转换说明见 `THIRD_PARTY_NOTICES.md`。

第一层运行时：

- 不访问 ECDICT 网站；
- 不发送网络请求；
- 不上传代码、标识符或查询记录；
- 只读取插件目录内的 `dictionary.db`。

## 本地开发与测试

要求 Node.js 18+ 和 Python 3.10+。

```bash
npm test
python scripts/test_dictionary_build.py
```

`npm test` 会先把 `src/runtime-*.js` 合成为 Pot 要求的单文件 `main.js`，再运行第一层、Key 池、Interactions API 和 Pot `eval()` 加载契约测试。Gemini 测试全部使用 mock 网络，不请求真实 Gemini API，也不依赖真实 SQLite。

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
- 当前版本不实现流式输出、后台任务、工具调用、备用模型自动切换或成功请求轮询；
- `gemini_state.db` 仅保存调度元数据，不保存 Key 或翻译内容。
