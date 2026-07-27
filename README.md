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
- `camelCase`
- `PascalCase`
- `snake_case`
- `SCREAMING_SNAKE_CASE`
- `kebab-case`
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

只有“完整分析”和“仅中文含义”需要读取普通英语数据库；单纯转换命名格式不会打开数据库，也不会调用 Gemini。

## 第二层：Gemini 语义增强

Gemini 只负责未知词的中文语义与标识符上下文解释，不参与标识符拆分、缩写边界或命名格式生成。

### Gemini 语义增强模式

- `off`：默认值，零网络请求；
- `unknown_only`：仅当本地层仍有未知 token 时请求一次；
- `always`：完整分析或仅中文含义时始终请求一次。

### Gemini 发送范围

- `unknown_tokens`：默认值。`unknown_only` 只发送未知 token 和其前后最多一个相邻 token，不发送完整标识符；
- `identifier`：用户明确选择后，才在请求中增加完整标识符。

无论选择哪种模式，插件都不会发送：

- 完整源码行；
- 文件路径；
- 项目名称；
- 剪贴板中未被用户选中的内容；
- 本地数据库内容；
- API Key 以外的账户信息。

### API 与模型

本分支依据 2026 年 7 月的 Google 官方 Gemini API 文档实现：

- 默认稳定模型：`gemini-3.6-flash`；
- REST 接口：`v1beta/models/{model}:generateContent`；
- API Key 通过 `x-goog-api-key` 请求头传递，不拼接到 URL；
- 使用 `systemInstruction` 限制任务边界；
- 请求 `responseMimeType: application/json`；
- 模型响应仍由本地代码执行字段白名单、token 白名单、长度和 JSON 校验。

模型输入框留空时使用上述稳定模型；也可以填写 Google 当前支持的其他模型 ID。模型名只能包含字母、数字、点、下划线和连字符。

Google 官方依据：

- `https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash`
- `https://ai.google.dev/api/generate-content`
- `https://ai.google.dev/api`
- `https://ai.google.dev/gemini-api/docs/troubleshooting`
- `https://ai.google.dev/gemini-api/docs/rate-limits`
- `https://ai.google.dev/gemini-api/docs/safety-settings`

### API Key 明文限制

**Gemini API Key 在 Pot 插件设置页面可能以明文显示。**

当前 Pot 通用外部插件配置页没有专用密码输入类型，本项目不会修改 Pot 主程序。请只使用用户自行创建的 Gemini API Key，并避免在录屏、截图或远程协助时暴露设置页面。

本仓库不会：

- 提交或内置真实 API Key；
- 在日志、异常、插件输出或 URL 中显示 Key；
- 将 Key 写入 `.env`、测试快照、数据库或 Artifact；
- 输出完整请求头或包含 Key 的配置对象。

### 回退策略

以下情况全部静默回退到完整本地结果：

- 未填写 API Key；
- HTTP 400、401、403、429 或 5xx；
- 网络异常或超时；
- 空响应、非 JSON 响应；
- Markdown 代码围栏；
- 返回未请求的 token；
- 返回额外字段、字段类型错误或内容超长；
- Pot 当前环境不提供网络函数。

Gemini 成功时，完整分析末尾增加：

```text
AI 语义增强：……
AI 未知词：customToken：……
```

Gemini 失败时，不附加错误信息，也不删减本地的原文、识别类型、拆分、编程含义、普通词义、未知词和命名格式转换。

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

`npm test` 会先把 `src/runtime-*.js` 合成为 Pot 要求的单文件 `main.js`，再运行第一层与 Gemini 的 JavaScript 单元测试和 Pot `eval()` 加载契约测试。Gemini 测试全部使用 mock 网络，不请求真实 Gemini API。

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

## 已知限制

- 标识符中文组合采用本地规则，不等同于完整句子机器翻译；
- 一个英文词可能有多种含义，普通模式展示 ECDICT 的前两行释义；
- 自动类型判断是启发式规则，特殊函数可手动选择类型；
- Gemini 语义解释具有不确定性，因此不会参与命名格式生成；
- 第一层处理单个标识符、短词组或单词，不重构完整源代码。
