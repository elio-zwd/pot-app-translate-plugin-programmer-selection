# 方案三：极简程序员工具方案——插件开发包

## 0. 分支、基线与当前状态

- 仓库：`elio-zwd/pot-app-translate-plugin-programmer-selection`
- 方案分支：`backup/minimal-programmer-tool-ui`
- 协调任务分支：`task/min-plugin-contract`
- 方案分支协调基线：`467e364ae1f15eb8ed9bcf0d83516cb9870deab9`
- 固定原始基线：`main@1d51041810f7c91128ae9436fab56b188f2ded37`
- 对应桌面端分支：`elio-zwd/pot-desktop@backup/programmer-minimal-tool-ui`
- 对应桌面端方案 Head：`1a7b3297dfd5b9cc2244e33f6ab3b7ac78073f9b`
- 状态：**已激活，契约冻结阶段**
- 当前任务：`MIN-PLUGIN-00`
- 当前 Draft PR Base：`backup/minimal-programmer-tool-ui`

本阶段只冻结跨仓库协议、兼容迁移、fixture、职责边界和并行文件范围，不修改运行时代码、`info.json`、Gemini 请求、Key 池、本地词典、数据库生命周期或 CI 功能逻辑。

当前方案分支存在 Draft PR #7 `chore/vendor-superpowers-workflow`，其差异仅位于 `tools/ai/superpowers/`，与本任务修改的 `docs/programmer-ui/DEVELOPMENT-PACK.md` 不重叠。后续任务开始前仍须重新检查开放 PR 和方案分支最新 Head。

## 1. 契约冻结结论

### 1.1 协议名称与版本

跨仓库结构化结果协议固定为：

```text
pot.programmer-result.v1
```

规则：

1. 插件不得为极简方案创建新的不兼容协议名。
2. `v1` 的核心必需字段为：
   - `schema`
   - `plainText`
   - `summary`
   - `identifier`
   - `tokenMeanings`
   - `naming`
   - `diagnostics`
3. `presentation` 是可选展示提示，不属于协议有效性的必需条件。
4. 桌面端不得通过解析插件中文 trait 或 `plainText` 重建结构化详情。
5. 未知 Schema 必须安全回退到 `plainText`；旧字符串和旧 Pot 原生对象继续走旧渲染路径。

### 1.2 完整数据结构

```js
{
  schema: 'pot.programmer-result.v1',

  // 完整、可复制、可进入历史记录的纯文本。
  // minimal 和 report 均不得只放首屏摘要。
  plainText: '完整纯文本',

  summary: {
    text: '首屏核心释义',
    source: 'local | local_ai | ai | local_fallback',
    fallback: false
  },

  identifier: {
    original: 'NFC_WriteU16LE',
    detectedType: 'function',
    detectionMode: 'auto',
    tokens: ['NFC', 'write', 'U16', 'LE']
  },

  tokenMeanings: [
    {
      index: 0,
      token: 'NFC',
      meaning: '近场通信',
      source: 'local'
      // phonetic: '...' // 只有本地词典有可靠音标时才可选提供
    }
  ],

  naming: {
    camelCase: 'nfcWriteU16Le',
    pascalCase: 'NfcWriteU16Le',
    snakeCase: 'nfc_write_u16_le',
    screamingSnakeCase: 'NFC_WRITE_U16_LE',
    kebabCase: 'nfc-write-u16-le'
  },

  diagnostics: [
    {
      code: 'ai.request_failed',
      severity: 'warning',
      message: 'AI 请求未完成，已使用完整本地结果。',
      recoverable: true
    }
  ],

  // 整体可省略。
  presentation: {
    preferredDensity: 'minimal',
    initiallyExpanded: []
  }
}
```

### 1.3 字段约束

#### `schema`

- 类型：非空字符串。
- 固定值：`pot.programmer-result.v1`。
- 大小写敏感。
- 桌面端不接受前缀匹配或模糊匹配。

#### `plainText`

- 类型：非空字符串。
- 是复制全文、自动复制和历史记录的唯一可信全文。
- 在 `minimal` 和 `report` 模式下都必须包含当前结果的核心释义、拆分、逐词解释、五种命名以及安全诊断。
- 不得只包含首屏摘要。
- 不得包含 API Key、请求头、完整远端响应、状态数据库内容或底层异常堆栈。
- 桌面端可以直接显示它作为结构化渲染失败时的回退，但不得反向解析它来生成详情卡片。

#### `summary`

必需字段：

- `text`：非空字符串，适合首屏直接阅读。
- `source`：固定枚举，见 1.4。
- `fallback`：布尔值。

约束：

- `summary.fallback === true` 当且仅当 `summary.source === 'local_fallback'`。
- `summary.text` 不得是空占位、错误码或远端错误原文。
- 诊断信息放入 `diagnostics`，不得把长错误信息拼入摘要。

#### `identifier`

必需字段：

- `original`：用户原始输入，经过现有长度与安全限制后保存。
- `detectedType`：固定枚举：
  - `function`
  - `variable`
  - `boolean`
  - `class`
  - `constant`
  - `file`
  - `text`
  - `unknown`
- `detectionMode`：固定枚举：
  - `auto`：来自自动识别；
  - `configured`：来自用户显式指定的标识符类型。
- `tokens`：按显示顺序排列的非空字符串数组。

约束：

- `tokens` 保存最终稳定拆分结果，不因默认折叠而删减。
- 技术缩写和复合类型沿用本地解析结果，例如 `U16`、`I2C`、`LE`。
- 桌面端只展示，不重新拆分或改写 token。

#### `tokenMeanings`

每个元素必需字段：

- `index`：从 0 开始，对应 `identifier.tokens[index]`。
- `token`：与对应 token 文本一致。
- `meaning`：非空中文含义或安全的保留原文说明。
- `source`：固定枚举：
  - `local`：本地规则、编程词典或普通词典；
  - `ai`：通过已校验的 AI 响应补全；
  - `literal`：产品名、数字或技术标记按原文保留。

可选字段：

- `phonetic`：只允许来自可靠本地词典；AI、缩写、数字和产品名不得伪造音标。

约束：

- 数组必须与 `identifier.tokens` 一一对应、按 `index` 升序排列。
- AI 不得覆盖已有的可靠 `local` 含义。
- 同一个 token 只允许一个最终条目；来源差异通过 `source` 表达，不重复堆叠多个条目。

#### `naming`

对象始终存在，固定键为：

- `camelCase`
- `pascalCase`
- `snakeCase`
- `screamingSnakeCase`
- `kebabCase`

值为字符串。对于无法转换的普通文本可以为空字符串，但不得省略键。所有命名结果只由本地算法生成，AI 不参与。

#### `diagnostics`

- 类型：数组；正常结果固定为 `[]`。
- 每个元素包含：
  - `code`：稳定、可测试的 ASCII 点分代码；
  - `severity`：`info | warning | error`；
  - `message`：用户可读且脱敏的中文文案；
  - `recoverable`：布尔值。
- 不得包含 API Key、Key 尾号、请求头、完整 URL 查询参数、完整远端响应、SQL、数据库路径或堆栈。
- 桌面端可以按 `severity` 呈现，但不得根据中文 `message` 推断业务逻辑。

### 1.4 `summary.source` 固定枚举

| 值 | 含义 | `fallback` |
|---|---|---|
| `local` | 摘要完全由本地规则、内置编程词典或普通词典生成，未使用 AI 语义 | `false` |
| `local_ai` | 摘要由本地确定性语义与 AI 补全共同组成，例如只有未知 token 由 AI 补齐 | `false` |
| `ai` | 摘要整句来自通过校验的 AI 语义结果；逐词详情仍可包含本地来源 | `false` |
| `local_fallback` | 本次按配置尝试或计划使用 AI，但 AI 不可用，摘要完整回退本地结果 | `true` |

补充规则：

- `aiMode=off` 的纯本地结果是 `local`，不是 `local_fallback`。
- `unknown_only` 本地全部命中且零网络时是 `local`。
- `always` 成功返回整体语义时可为 `ai`。
- 只有未知 token 由 AI 补全、摘要由两层共同组成时为 `local_ai`。
- 请求失败、超时、限流、鉴权失败、空响应或非法响应后保留本地摘要时为 `local_fallback`。

### 1.5 可选展示提示

`presentation` 整体可省略。若提供，允许字段为：

```js
presentation: {
  preferredDensity: 'minimal | report',
  initiallyExpanded: [
    'identifier',
    'tokenMeanings',
    'naming',
    'diagnostics'
  ]
}
```

规则：

- `preferredDensity` 仅允许 `minimal` 或 `report`。
- `initiallyExpanded` 是去重后的区块 ID 数组，区块 ID 只允许：
  - `identifier`
  - `tokenMeanings`
  - `naming`
  - `diagnostics`
- `presentation` 只是展示建议：
  - 不改变数据语义；
  - 不允许删减 `plainText` 或详情数据；
  - 桌面端可以忽略；
  - 缺失、未知值或格式错误不得导致整个结果被拒绝。
- 推荐：
  - `minimal`：默认 `initiallyExpanded=[]`；
  - `report`：可建议展开全部已有详情；
  - AI 回退时可以建议 `initiallyExpanded=['diagnostics']`，但桌面端仍可选择只在摘要显示短警告。

## 2. 宿主能力声明与检测

### 2.1 固定放置位置

宿主能力声明固定放在每次 `translate(..., options)` 调用的顶层：

```js
options.host = {
  name: 'pot-desktop',
  resultSchemas: ['pot.programmer-result.v1'],
  configSchemaVersion: 1,
  presentationCapabilities: ['summary-details', 'per-item-copy']
}
```

不得放置在：

- `options.config`
- `info.json`
- 用户持久化插件设置
- Gemini 请求
- `plainText`
- 全局可变状态或数据库

原因：宿主能力属于本次调用环境，不是用户配置，也不应被旧配置持久化。

### 2.2 固定检测方式

插件只通过以下条件判断宿主是否支持 v1：

```js
Array.isArray(options?.host?.resultSchemas)
  && options.host.resultSchemas.includes('pot.programmer-result.v1')
```

规则：

1. `name`、`configSchemaVersion` 和 `presentationCapabilities` 为附加能力信息，不参与 v1 基础接收能力判断。
2. 不要求宿主名称必须是 `pot-desktop`，避免把协议硬编码为单一宿主。
3. `setResult` 只表示旧 Pot 可能接受原生结果对象，**不等于**支持 `pot.programmer-result.v1`。
4. 缺失、非数组、大小写不匹配或不包含精确协议名时，均按“不支持”处理。
5. 插件忽略未知宿主字段；宿主也必须忽略未知 `presentation` 字段。
6. 宿主每次调用都应传入能力声明，不依赖跨调用缓存。

### 2.3 返回路径

| 有效输出模式 | 宿主声明 v1 | 有 `setResult` | 返回 |
|---|---:|---:|---|
| `minimal` | 是 | 任意 | `pot.programmer-result.v1`，建议 `preferredDensity=minimal` |
| `minimal` | 否 | 是 | 现有完整 Pot 原生 `report` 对象 |
| `minimal` | 否 | 否 | 现有完整纯文本 `report` |
| `report` | 是 | 任意 | `pot.programmer-result.v1`，建议 `preferredDensity=report` |
| `report` | 否 | 是 | 现有完整 Pot 原生 `report` 对象 |
| `report` | 否 | 否 | 现有完整纯文本 `report` |
| 直接输出模式 | 任意 | 任意 | 保持现有字符串输出，不包装 v1 |

因此，结构化协议发布不能破坏旧 Pot；旧宿主永远不会只收到一个无法展开的极简摘要。

## 3. `outputStyle` 兼容迁移

### 3.1 固定值

新增值：

- `minimal`：结构化极简首屏；不支持 v1 的宿主自动降级完整 `report`。
- `report`：完整详情展示。

必须继续支持的旧值：

- `report`
- `camel`
- `pascal`
- `snake`
- `screaming`
- `kebab`
- `words`
- `chinese`

不得删除、改名或复用这些旧值的语义。

### 3.2 旧配置映射

| 旧保存值 | 升级后规范值 | 行为 |
|---|---|---|
| `report` | `report` | 保持完整分析，不自动切到极简 |
| `camel` | `camel` | 保持小驼峰直接输出 |
| `pascal` | `pascal` | 保持大驼峰直接输出 |
| `snake` | `snake` | 保持下划线直接输出 |
| `screaming` | `screaming` | 保持大写下划线直接输出 |
| `kebab` | `kebab` | 保持短横线直接输出 |
| `words` | `words` | 保持拆分词组直接输出 |
| `chinese` | `chinese` | 保持仅中文含义纯文本输出 |
| 缺失、空值或未知值 | `minimal` | 使用新默认；旧宿主自动降级完整 `report` |

### 3.3 默认值结论

目标默认值改为 `minimal`，但仅影响：

- 新安装；
- 从未持久化 `outputStyle` 的配置；
- 无效或未知值。

已保存为 `report` 的用户继续获得 `report`，不会被强制迁移到 `minimal`。

发布门禁：

1. `info.json` 把 `minimal` 放到选项首位前，必须有对应兼容测试与 CI 默认值检查。
2. 即使桌面端尚未升级，`minimal` 在无 v1 能力声明时也必须完整降级为 `report`。
3. 插件与桌面端组合发布前，桌面端必须固定引用本契约 Commit。
4. 若宿主协商尚未完成，可暂不发布默认值变更；不得发布只返回摘要且无法展开的版本。

主要升级风险：

- 旧配置未持久化 `outputStyle` 时会进入新默认；
- 新旧插件和桌面端版本可能错配；
- 历史与自动复制可能误用摘要而不是 `plainText`；
- 某些第三方宿主可能提供 `setResult` 但不认识 v1。

以上风险分别由旧宿主完整回退、显式能力声明、`plainText` 唯一全文规则和发布门禁处理。

## 4. 四个固定结构化 fixture

以下 fixture 是跨仓库测试基线。实现可以增加向后兼容的可选字段，但不得删除或改写这里冻结的必需字段、枚举和值语义。

### 4.1 `NFC_WriteU16LE`：纯本地结果

```json
{
  "schema": "pot.programmer-result.v1",
  "plainText": "函数名：NFC_WriteU16LE\n词语拆分：NFC · write · U16 · LE\n核心释义：以小端序向 NFC 设备写入 16 位无符号整数\n词义：\n- NFC：近场通信\n- write：写入\n- U16：16 位无符号整数\n- LE：小端序\n命名：\n- camelCase：nfcWriteU16Le\n- PascalCase：NfcWriteU16Le\n- snake_case：nfc_write_u16_le\n- SCREAMING_SNAKE_CASE：NFC_WRITE_U16_LE\n- kebab-case：nfc-write-u16-le",
  "summary": {
    "text": "以小端序向 NFC 设备写入 16 位无符号整数",
    "source": "local",
    "fallback": false
  },
  "identifier": {
    "original": "NFC_WriteU16LE",
    "detectedType": "function",
    "detectionMode": "auto",
    "tokens": ["NFC", "write", "U16", "LE"]
  },
  "tokenMeanings": [
    {"index": 0, "token": "NFC", "meaning": "近场通信", "source": "local"},
    {"index": 1, "token": "write", "meaning": "写入", "source": "local"},
    {"index": 2, "token": "U16", "meaning": "16 位无符号整数", "source": "local"},
    {"index": 3, "token": "LE", "meaning": "小端序", "source": "local"}
  ],
  "naming": {
    "camelCase": "nfcWriteU16Le",
    "pascalCase": "NfcWriteU16Le",
    "snakeCase": "nfc_write_u16_le",
    "screamingSnakeCase": "NFC_WRITE_U16_LE",
    "kebabCase": "nfc-write-u16-le"
  },
  "diagnostics": [],
  "presentation": {
    "preferredDensity": "minimal",
    "initiallyExpanded": []
  }
}
```

### 4.2 `getCustomxyzValue`：本地 + AI 补全

```json
{
  "schema": "pot.programmer-result.v1",
  "plainText": "函数名：getCustomxyzValue\n词语拆分：get · Customxyz · Value\n核心释义：获取自定义 XYZ 值\n词义：\n- get：获取\n- Customxyz：自定义 XYZ〔AI〕\n- Value：值\n命名：\n- camelCase：getCustomxyzValue\n- PascalCase：GetCustomxyzValue\n- snake_case：get_customxyz_value\n- SCREAMING_SNAKE_CASE：GET_CUSTOMXYZ_VALUE\n- kebab-case：get-customxyz-value",
  "summary": {
    "text": "获取自定义 XYZ 值",
    "source": "local_ai",
    "fallback": false
  },
  "identifier": {
    "original": "getCustomxyzValue",
    "detectedType": "function",
    "detectionMode": "auto",
    "tokens": ["get", "Customxyz", "Value"]
  },
  "tokenMeanings": [
    {"index": 0, "token": "get", "meaning": "获取", "source": "local"},
    {"index": 1, "token": "Customxyz", "meaning": "自定义 XYZ", "source": "ai"},
    {"index": 2, "token": "Value", "meaning": "值", "source": "local"}
  ],
  "naming": {
    "camelCase": "getCustomxyzValue",
    "pascalCase": "GetCustomxyzValue",
    "snakeCase": "get_customxyz_value",
    "screamingSnakeCase": "GET_CUSTOMXYZ_VALUE",
    "kebabCase": "get-customxyz-value"
  },
  "diagnostics": [],
  "presentation": {
    "preferredDensity": "minimal",
    "initiallyExpanded": []
  }
}
```

### 4.3 `RxBufLen`：AI 整体释义 + 本地 token

本 fixture 对应 `aiMode=always` 且 AI 成功；本地 token 语义仍不可被覆盖。

```json
{
  "schema": "pot.programmer-result.v1",
  "plainText": "类名：RxBufLen\n词语拆分：Rx · Buf · Len\nAI 释义：接收缓冲区的长度\n词义：\n- Rx：接收\n- Buf：缓冲区\n- Len：长度\n命名：\n- camelCase：rxBufLen\n- PascalCase：RxBufLen\n- snake_case：rx_buf_len\n- SCREAMING_SNAKE_CASE：RX_BUF_LEN\n- kebab-case：rx-buf-len",
  "summary": {
    "text": "接收缓冲区的长度",
    "source": "ai",
    "fallback": false
  },
  "identifier": {
    "original": "RxBufLen",
    "detectedType": "class",
    "detectionMode": "auto",
    "tokens": ["Rx", "Buf", "Len"]
  },
  "tokenMeanings": [
    {"index": 0, "token": "Rx", "meaning": "接收", "source": "local"},
    {"index": 1, "token": "Buf", "meaning": "缓冲区", "source": "local"},
    {"index": 2, "token": "Len", "meaning": "长度", "source": "local"}
  ],
  "naming": {
    "camelCase": "rxBufLen",
    "pascalCase": "RxBufLen",
    "snakeCase": "rx_buf_len",
    "screamingSnakeCase": "RX_BUF_LEN",
    "kebabCase": "rx-buf-len"
  },
  "diagnostics": [],
  "presentation": {
    "preferredDensity": "minimal",
    "initiallyExpanded": []
  }
}
```

### 4.4 `ST25DV_i2c_WriteData`：AI 失败，本地安全回退

```json
{
  "schema": "pot.programmer-result.v1",
  "plainText": "函数名：ST25DV_i2c_WriteData\n词语拆分：ST25DV · I2C · write · data\n核心释义：ST25DV I2C 写入数据\n词义：\n- ST25DV：技术缩写或数字，保留原文\n- I2C：I²C 总线\n- write：写入\n- data：数据\n命名：\n- camelCase：st25dvI2cWriteData\n- PascalCase：St25dvI2cWriteData\n- snake_case：st25dv_i2c_write_data\n- SCREAMING_SNAKE_CASE：ST25DV_I2C_WRITE_DATA\n- kebab-case：st25dv-i2c-write-data\n诊断：AI 请求未完成，已使用完整本地结果。",
  "summary": {
    "text": "ST25DV I2C 写入数据",
    "source": "local_fallback",
    "fallback": true
  },
  "identifier": {
    "original": "ST25DV_i2c_WriteData",
    "detectedType": "function",
    "detectionMode": "auto",
    "tokens": ["ST25DV", "I2C", "write", "data"]
  },
  "tokenMeanings": [
    {"index": 0, "token": "ST25DV", "meaning": "技术缩写或数字，保留原文", "source": "literal"},
    {"index": 1, "token": "I2C", "meaning": "I²C 总线", "source": "local"},
    {"index": 2, "token": "write", "meaning": "写入", "source": "local"},
    {"index": 3, "token": "data", "meaning": "数据", "source": "local"}
  ],
  "naming": {
    "camelCase": "st25dvI2cWriteData",
    "pascalCase": "St25dvI2cWriteData",
    "snakeCase": "st25dv_i2c_write_data",
    "screamingSnakeCase": "ST25DV_I2C_WRITE_DATA",
    "kebabCase": "st25dv-i2c-write-data"
  },
  "diagnostics": [
    {
      "code": "ai.request_failed",
      "severity": "warning",
      "message": "AI 请求未完成，已使用完整本地结果。",
      "recoverable": true
    }
  ],
  "presentation": {
    "preferredDensity": "minimal",
    "initiallyExpanded": ["diagnostics"]
  }
}
```

## 5. 插件与桌面端职责边界

### 5.1 插件负责

- 标识符识别、拆分、缩写保护和类型判断；
- 本地编程语义、普通词典查询和 AI 语义增强；
- 确定 `summary.source` 与 `summary.fallback`；
- 生成完整 `identifier`、`tokenMeanings`、`naming` 和安全 `diagnostics`；
- 生成完整 `plainText`；
- 检测 `options.host.resultSchemas`；
- 对旧 Pot 原生对象和无 `setResult` 纯文本路径做完整回退；
- 保证 AI 失败不删除本地信息；
- 保证所有命名结果由本地算法生成。

插件不得：

- 根据桌面端 UI 状态删减详情；
- 依赖桌面端解析中文 trait；
- 把宿主能力写入用户配置；
- 把远端原始错误或敏感配置放入诊断；
- 因 `presentation` 缺失而改变协议有效性。

### 5.2 桌面端负责

- 在每次插件调用中声明 `options.host`；
- 统一标准化字符串、旧对象、v1 和未知 Schema；
- 用 `summary` 渲染首屏，用结构化详情字段渲染展开区；
- 使用 `plainText` 完成复制全文、自动复制和历史记录；
- 管理展开/收起、键盘操作、ARIA、窄窗口和逐项复制；
- 未知 Schema 或结构化渲染异常时回退 `plainText`；
- 忽略未知可选字段并保持旧服务行为。

桌面端不得：

- 重新执行标识符拆分或命名转换；
- 根据中文 `message` 或 trait 决定业务分支；
- 把 `summary.text` 当作复制全文；
- 因没有 `presentation` 拒绝 v1；
- 在渲染失败时重新发起 Gemini 请求。

### 5.3 错误与回退边界

1. AI 层失败：
   - 插件返回完整本地数据；
   - `summary.source=local_fallback`；
   - `summary.fallback=true`；
   - 添加脱敏 diagnostic。
2. 普通词典失败：
   - 插件保留内置编程语义；
   - 使用安全 diagnostic；
   - 不泄漏数据库异常。
3. 宿主不支持 v1：
   - `minimal` 和 `report` 均回退完整旧路径。
4. v1 对象校验失败：
   - 桌面端优先显示有效 `plainText`；
   - 若 `plainText` 也无效，再交给旧结果回退组件；
   - 不静默显示空卡片。
5. 展示组件失败：
   - 桌面端显示 `plainText`；
   - 不修改或重试插件业务结果。

## 6. Wave 1 并行文件边界

当前运行时由 `scripts/build_runtime.py` 按 `src/runtime-*.js` 文件名排序合成。现有关键调用链为：

- `src/runtime-05-pot-native-report.js`：`translate()`、旧原生对象和纯文本路由；
- `src/runtime-06-compact-native-report.js`：当前紧凑 Pot 原生报告；
- `src/runtime-07-local-composite-semantics.js`：固定宽度类型、字节序、缩写和本地复合语义；
- `tests/pot-native-report.test.cjs`：旧 Pot 原生对象、纯文本和词典异常回退测试；
- `info.json`：当前 `outputStyle` 及其他配置；
- `.github/workflows/build.yml`：配置默认值与打包门禁。

Wave 1 两项任务必须从协调契约 Commit 分别创建独立分支，不得互相依赖未合并提交。

### 6.1 `MIN-PLUGIN-01 极简摘要与完整详情数据`

分支：

```text
task/min-plugin-result-schema
```

允许创建：

- `src/runtime-08-programmer-result-schema.js`
- `tests/programmer-result-schema.test.cjs`

允许内容：

- v1 常量与纯序列化函数；
- 字段白名单、枚举和不变量校验；
- 从现有 `model`、`sections`、`geminiResult` 生成完整 v1；
- 四个固定 fixture 的结构断言；
- `plainText` 完整性、诊断脱敏和 token 一一对应测试。

禁止修改：

- `src/runtime-00-*.js` 至 `src/runtime-07-*.js`
- `src/runtime-09-*.js` 及后续其他任务文件
- `tests/pot-native-report.test.cjs`
- `info.json`
- `README.md`
- `.github/workflows/build.yml`
- Gemini 请求、Key 池、模型路由、重试、状态数据库
- 本地词典、固定技术语义和数据库生命周期
- `main.js` 生成物

边界说明：

- 本任务只产出可独立测试的结构化序列化模块，不接入 `translate()`。
- `translate()` 路由与旧宿主协商留给 Wave 2 `MIN-PLUGIN-03`，从而避免与输出模式任务同时修改 `runtime-05`。

### 6.2 `MIN-PLUGIN-02 输出模式与配置迁移`

分支：

```text
task/min-plugin-output-mode
```

允许修改：

- `info.json`
- `README.md`
- `.github/workflows/build.yml`

允许创建：

- `src/runtime-09-output-style-compat.js`
- `tests/output-style-compat.test.cjs`

允许内容：

- `minimal/report` 与全部旧值的纯兼容映射函数；
- 缺失、空值和未知值到 `minimal` 的规范化；
- 新默认值、升级说明和旧值保留；
- `info.json` 选项顺序和 CI 默认值门禁；
- 旧直接输出模式不变的测试；
- `minimal` 在无 v1 宿主时应降级完整 `report` 的路由决策测试。

禁止修改：

- `src/runtime-00-*.js` 至 `src/runtime-08-*.js`
- `tests/pot-native-report.test.cjs`
- `tests/programmer-result-schema.test.cjs`
- Gemini 请求、Key 池、模型路由、重试、状态数据库
- 本地词典、固定技术语义和数据库生命周期
- `scripts/build_runtime.py`
- `main.js` 生成物

边界说明：

- 本任务创建纯兼容与路由决策函数，但不修改现有 `translate()`。
- Wave 2 `MIN-PLUGIN-03` 在 01、02 合并后统一接入 `runtime-05`，避免 Wave 1 同文件冲突。

### 6.3 Wave 2 接入门禁

`MIN-PLUGIN-03` 只有在 01、02 均合并到方案分支后才能开始。它负责：

- 使用 `options.host` 能力检测；
- 把 `runtime-08` 序列化模块与 `runtime-09` 兼容决策接入 `translate()`；
- 维护新版 v1、旧 Pot 原生对象和纯文本三条路径；
- 更新 `tests/pot-native-report.test.cjs` 与独立集成测试；
- 保证用户显式 `report`、全部直接输出模式和无 `setResult` 路径不回归。

## 7. 任务计划与交接

### 7.1 Wave 0：当前契约冻结

- `MIN-PLUGIN-00`：本文件。
- 交付物：
  - v1 必需字段与子字段；
  - 四种 `summary.source`；
  - 可选 `presentation`；
  - `options.host` 放置与检测；
  - outputStyle 迁移；
  - 四个完整 fixture；
  - 插件/桌面端职责；
  - Wave 1 文件边界。

### 7.2 Wave 1：可并行

- `MIN-PLUGIN-01`：结构化序列化模块与独立测试。
- `MIN-PLUGIN-02`：输出模式、配置迁移、README 与 CI 门禁。

### 7.3 Wave 2：串行接入

- `MIN-PLUGIN-03`：宿主协商、`translate()` 接入和旧 Pot 回退。

### 7.4 Wave 3：组合验收

- `MIN-PLUGIN-04`：固定桌面端契约 Commit，执行新版 Schema、旧原生对象、纯文本、复制全文、历史和四场景组合验证。

## 8. 下游 AI Prompt

### 8.1 插件 Schema 任务

```text
你负责 elio-zwd/pot-app-translate-plugin-programmer-selection 的 MIN-PLUGIN-01。
必须从 backup/minimal-programmer-tool-ui 在已合并的 MIN-PLUGIN-00 契约 Commit 上创建 task/min-plugin-result-schema。
先读取 AGENTS.md、docs/programmer-ui/DEVELOPMENT-PACK.md、src/runtime-05-pot-native-report.js、src/runtime-06-compact-native-report.js、src/runtime-07-local-composite-semantics.js 和相关测试。
只允许创建 src/runtime-08-programmer-result-schema.js 与 tests/programmer-result-schema.test.cjs。
实现 pot.programmer-result.v1 的纯序列化和独立测试；不得接入 translate()，不得修改 info.json、README、CI、Gemini、Key 池、词典或数据库生命周期。
创建 Draft PR，Base 为 backup/minimal-programmer-tool-ui。
```

### 8.2 输出模式任务

```text
你负责 elio-zwd/pot-app-translate-plugin-programmer-selection 的 MIN-PLUGIN-02。
必须从 backup/minimal-programmer-tool-ui 在已合并的 MIN-PLUGIN-00 契约 Commit 上创建 task/min-plugin-output-mode。
先读取 AGENTS.md、docs/programmer-ui/DEVELOPMENT-PACK.md、info.json、README.md、.github/workflows/build.yml 和输出相关测试。
只允许修改 info.json、README.md、.github/workflows/build.yml，并创建 src/runtime-09-output-style-compat.js、tests/output-style-compat.test.cjs。
新增 minimal，保留 report、camel、pascal、snake、screaming、kebab、words、chinese；新默认 minimal，但旧 report 配置保持 report，无 v1 宿主必须降级完整 report。
不得修改 translate()、runtime-08、Gemini、Key 池、词典或数据库生命周期。
创建 Draft PR，Base 为 backup/minimal-programmer-tool-ui。
```

### 8.3 桌面端协调要求

桌面端 `MIN-DESKTOP-00` 及后续任务必须：

1. 固定引用本契约最终 Commit SHA，不得只引用分支名。
2. 使用相同的 `pot.programmer-result.v1` 字段、枚举和四个 fixture。
3. 把宿主能力放在每次调用的 `options.host`。
4. 仅用 `resultSchemas` 精确包含 v1 判断支持能力。
5. 把 `plainText` 用于复制、自动复制和历史。
6. 未知 Schema 或渲染失败时回退 `plainText`。
7. 不硬编码插件 ID，不解析中文 trait。

### 8.4 本地 AI 只读验收 Prompt

```text
仓库：https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection
目标：验收 MIN-PLUGIN-00 契约文档及后续实现。
先 git fetch origin，再检出协调者给出的 PR 分支并 reset 到指定 Head SHA。
只允许读取、构建、测试和验收；禁止修改文件、格式化、自动修复、提交、push、创建或更新 PR、合并分支。
记录操作系统、Node.js/Python 版本、全部命令、退出码、测试数量和关键日志。
文档阶段核对 pot.programmer-result.v1 必需字段、summary.source 四枚举、presentation 可选性、options.host 检测、outputStyle 映射、四个 fixture 和 Wave 1 文件边界。
实现阶段运行 npm test、python scripts/test_dictionary_build.py，并按指定 Actions/Artifact 做只读检查；不得调用真实 Gemini API。
将失败项、复现步骤、实际输出和可能原因原样反馈给远端开发对话。
```

## 9. 当前验证状态与风险

已完成的静态核对：

- 根目录 `AGENTS.md`；
- `README.md`；
- `info.json`；
- `package.json`；
- `scripts/build_runtime.py`；
- `.github/workflows/build.yml` 的现有配置门禁；
- `src/runtime-05-pot-native-report.js`；
- `src/runtime-06-compact-native-report.js`；
- `src/runtime-07-local-composite-semantics.js` 的职责与现有 PR 记录；
- `tests/pot-native-report.test.cjs`；
- 对应桌面端方案开发包；
- 开放 PR #7 的改动文件清单。

本 PR 只修改 Markdown，未修改功能代码，因此未声称运行时测试、构建或 GUI 已通过。

尚未验证：

- 后续实现代码是否严格生成全部 fixture；
- 新桌面端是否按 `options.host` 传递能力；
- `minimal` 默认值在真实旧 Pot、新桌面端和第三方宿主中的组合行为；
- 复制、历史、自动复制、无障碍与 320px 窄窗口；
- 后续 GitHub Actions、Artifact 和 Pot GUI 结果。

重点风险：

- fixture 文案与后续本地算法真实输出可能出现细微措辞差异；实现必须以本契约为跨仓库期望，若需调整必须先修改契约并协调双方。
- `minimal` 默认变更是用户可见行为，必须受宿主完整回退和组合发布门禁保护。
- Wave 1 若越界修改 `runtime-05` 会造成并行冲突，必须拒绝。
- 桌面端若使用摘要进行复制或历史，会丢失详情，必须以 `plainText` 为唯一全文。
