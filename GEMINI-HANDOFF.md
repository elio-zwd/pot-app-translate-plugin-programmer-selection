# Gemini 第二层开发交接

本文档定义 Gemini API 层的边界。第一层本地词典源码位于 `src/runtime-*.js`，运行前由 `scripts/build_runtime.py` 合成为 Pot 要求的单文件 `main.js`；不要直接修改生成文件。

## 第一层提供的接口

- `prepareIdentifier(text, config)`：输入校验、标识符拆分和类型识别。
- `lookupGeneralDictionary(words, options)`：读取本地 `dictionary.db`。
- `programmingPhraseParts(words, entries)`：编程术语优先、ECDICT 兜底的组合含义。
- `buildDictionarySections(model, options)`：生成编程含义、普通词义、未知词和词典错误。
- `translate(...)`：仅在完整分析或中文输出时读取数据库；其他命名格式保持纯本地快速路径。

## Gemini 层边界

Gemini 只处理本地层无法可靠解决的语义，不负责标识符拆分、缩写边界或命名格式生成。建议配置：

```text
aiMode: off | unknown_only | always
apiKey: 用户自行填写
model: 用户可填写，空值使用开发时核实的稳定模型
sendScope: unknown_tokens | identifier
```

默认必须是 `off`。未配置 Key、请求失败、超时、限流或返回格式不合法时，必须完整回退第一层结果。

## 配置页限制

Pot 通用外部插件配置页可能只提供普通输入框，Gemini API Key 在插件设置页可能以明文显示。本仓库不为此修改 Pot 主程序，README 必须明确提示该限制。

## 数据最小化

- `unknown_only` 只发送未知 token 和最少必要相邻词。
- 只有用户显式选择 `identifier` 时才发送完整标识符。
- 不发送源码行、文件路径、项目名、未选择的剪贴板内容。
- 不记录请求正文、API Key 或完整配置对象。

## 推荐接口

```javascript
async function resolveGeminiSemantics({
  input,
  words,
  unknownWords,
  localProgrammingText,
  config,
  utils
})
```

模型响应只接受严格 JSON：

```json
{
  "translatedWords": {
    "unknownToken": "中文解释"
  },
  "semanticDescription": "结合标识符上下文后的中文含义"
}
```

本地必须校验字段白名单、请求 token 白名单、token 数量、单项长度、总长度、空响应和 Markdown 代码围栏。不得执行模型返回内容，不得让模型输出进入本地命名格式生成逻辑。

## 必补测试

- `aiMode=off` 时零网络调用；
- 本地全部命中且 `unknown_only` 时零网络调用；
- 未知 token 只触发一次请求；
- `always` 模式触发请求；
- `unknown_tokens` 不发送完整标识符；
- 只有 `identifier` 模式发送完整标识符；
- HTTP 400、401、403、429、500、网络异常和超时全部回退本地结果；
- 空响应、非 JSON、代码围栏、未知 key 和超长结果被拒绝；
- 测试 Key 不出现在输出、异常、日志、快照或 Artifact；
- 中文转英文命名仍由本地算法生成；
- Pot `eval()` 加载契约和现有第一层测试继续通过。

所有测试必须 mock 网络，禁止调用真实 Gemini API。
