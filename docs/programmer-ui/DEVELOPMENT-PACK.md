# 方案二：卡片分层方案——插件开发包

## 0. 分支与状态

- 仓库：`elio-zwd/pot-app-translate-plugin-programmer-selection`
- 本分支：`feat/card-layered-ui`
- 固定基线：`main@1d51041810f7c91128ae9436fab56b188f2ded37`
- 对应桌面端分支：`elio-zwd/pot-desktop@feat/programmer-card-layered-ui`
- 状态：**主方案，可启动开发**
- 目标 PR Base：`main`

本分支只负责插件侧结构化数据、兼容回退、配置元数据和测试。真正的卡片、折叠、复制按钮、密钥显隐与响应式布局由 `pot-desktop` 对应分支实现。

## 1. Plan

### 1.1 目标

新增版本化结果协议 `pot.programmer-result.v1`，让新版 `pot-desktop` 能渲染：

1. 核心释义卡片；
2. 标识符结构；
3. 可折叠逐词解释；
4. 可逐项复制的命名转换；
5. 仅异常时出现的诊断区。

同时必须保留旧版 Pot：

- `setResult` 旧词典对象输出；
- 无 `setResult` 时纯文本返回；
- 本地完整命中零网络；
- AI 不能覆盖本地拆分、固定技术类型、大小端和命名转换；
- Gemini 失败完整回退本地结果；
- 共享数据库连接池不能被插件提前关闭；
- 不泄漏 API Key。

### 1.2 协议草案

新版宿主通过 `options.host.resultSchemas` 声明支持能力。插件仅在包含 `pot.programmer-result.v1` 时输出新版对象，否则输出现有兼容结果。

必需字段：

```js
{
  schema: 'pot.programmer-result.v1',
  plainText: '用于复制、历史记录和旧能力回退的完整文本',
  summary: {
    text: '核心释义',
    source: 'local | ai | local_fallback',
    fallback: false
  },
  identifier: {
    original: 'NFC_WriteU16LE',
    detectedType: 'function',
    detectionMode: 'heuristic | explicit',
    tokens: ['NFC', 'write', 'U16', 'LE']
  },
  tokenMeanings: [
    {
      token: 'NFC',
      meaning: '近场通信',
      source: 'local_technical | local_dictionary | ai | unresolved',
      phonetic: ''
    }
  ],
  naming: {
    camel: '',
    pascal: '',
    snake: '',
    kebab: '',
    screaming: ''
  },
  diagnostics: [
    { code: 'AI_REQUEST_FAILED', level: 'warning', message: 'AI 请求失败，已回退本地结果' }
  ]
}
```

约束：

- `source`、`code` 和 `level` 使用稳定枚举，不把颜色、图标或 `〔AI〕` 写死进文本；
- `diagnostics` 正常时为空；
- `plainText` 不得含 Key、请求头、完整配置或未经清洗的上游错误；
- 本地已有词义必须保持本地来源，AI 只能补未知项；
- `summary.source=local_fallback` 只表示 AI 失败后的本地回退，不表示本地结果质量降低。

### 1.3 配置元数据

在保持现有 `needs[].key/type/options/display` 可被旧 Pot 读取的前提下，可增加新版宿主忽略安全的可选字段：

- `section`: `result | ai | display | advanced`；
- `control`: `input | select | switch | secret | textarea`；
- `help`；
- `visibleWhen`；
- `sensitive: true`；
- `rows`。

不得更改现有配置 key 的语义。调整默认值或顺序时必须同步工作流和测试。

### 1.4 四个验收场景

- `NFC_WriteU16LE`：AI 关闭，本地完整；`summary.source=local`，无诊断，零网络。
- `getCustomxyzValue`：部分未知；只允许 AI 补 `xyz` 等本地未知项，已知词保持本地来源。
- `RxBufLen`：AI 始终；可由 AI 生成整体释义，但 `Rx/Buf/Len` 的本地固定含义不得被覆盖。
- `ST25DV_i2c_WriteData`：AI 失败；输出完整本地释义并产生一条安全诊断。

## 2. Tasks

### 2.1 并行规则

每个 AI 对话只负责一个任务分支和一个 Draft PR。所有任务分支从本分支当时固定 Head 创建，PR Base 指向 `feat/card-layered-ui`。不得让两个任务同时修改同一文件。

推荐并行波次：

#### Wave 0：协调者冻结契约

- `CARD-PLUGIN-00`：确认协议字段、枚举、能力协商和文件边界；只更新本开发包，不写运行时代码。

#### Wave 1：可并行

- `CARD-PLUGIN-01 结构化结果序列化`
  - 建议分支：`task/card-plugin-result-schema`
  - 只新增独立运行时模块和独立测试文件；避免修改 `info.json`、README、工作流。
  - 完成 `plainText`、来源枚举、诊断清洗和四个验收 fixture。

- `CARD-PLUGIN-02 配置 Schema 元数据`
  - 建议分支：`task/card-plugin-config-schema`
  - 只修改 `info.json`、对应 manifest 测试、README 设置说明和必要 CI 校验。
  - 保证旧 Pot 继续识别原有 input/select。

#### Wave 2：依赖 Wave 1

- `CARD-PLUGIN-03 运行路径接入与旧版回退`
  - 建议分支：`task/card-plugin-host-negotiation`
  - 接入 `options.host.resultSchemas`；新版输出新对象，旧版保持现有 native/plain-text 行为。
  - 重点检查 `setResult`、数据库关闭时机、AI 失败回退及中文转英文不调用 Gemini。

#### Wave 3：串行集成

- `CARD-PLUGIN-04 集成与验证`
  - 合并前三个 Draft PR 到本方案分支；解决契约差异；运行全部 CI；生成 Artifact。
  - 与桌面端固定 Commit 做组合验收，不直接合并到 `main`。

### 2.2 禁止重叠

- 结果 Schema AI 不修改 `info.json`。
- 配置 Schema AI 不修改运行时文件。
- 接入 AI 不重写本地复合语义规则，不修改 Gemini Key 池和 Interactions 请求实现，除非出现可证明的接口阻塞。
- 任一 AI 开始前都必须检查本方案分支的开放 PR 和最新 Head。

## 3. Handoff

### 3.1 交给桌面端的数据契约

桌面端可依赖：

- `schema` 精确等于 `pot.programmer-result.v1`；
- `plainText` 始终可用于复制和历史记录；
- `diagnostics=[]` 表示正常；
- 未知 token 使用 `source=unresolved`；
- AI 补全 token 使用 `source=ai`；
- `naming` 中不存在的格式使用空字符串或缺省字段，桌面端不得自行重新生成命名。

桌面端不得依赖：

- explanation 的显示顺序；
- 中文标签文本；
- 插件内部数据库结构；
- Gemini 模型响应原始字段。

### 3.2 组合版本记录

每次组合验收必须在 PR 描述记录：

- 插件仓库分支和 Commit SHA；
- `pot-desktop` 分支和 Commit SHA；
- 协议版本；
- 四个验收场景结果；
- 原版 Pot 的兼容烟测结果；
- 尚未实际执行的项目。

### 3.3 完成定义

只有同时满足以下条件才可称为完成：

- 插件全量 CI 通过；
- `.potext` Artifact 无敏感信息且包结构正确；
- 新桌面端四场景均正确渲染；
- 旧 Pot 的 native 对象与纯文本路径仍可用；
- 复制和历史记录使用 `plainText`；
- 没有真实 Gemini Key 进入测试、日志或 Artifact。

## 4. AI Prompts

### 4.1 插件协调者 Prompt

```text
你负责 elio-zwd/pot-app-translate-plugin-programmer-selection 的方案二协调工作。
先读取 AGENTS.md 和 feat/card-layered-ui 分支上的 docs/programmer-ui/DEVELOPMENT-PACK.md，再检查该分支开放 PR、最新 Head、相关运行时、测试和 CI。
你的职责是冻结 pot.programmer-result.v1 契约、分配不重叠文件边界、审查各 task PR 并按依赖顺序集成。不要直接修改 main，不要合并到 main，不要关闭其他对话的 PR。
每次交接必须记录 Base/Head SHA、修改文件、真实测试或 CI 证据、未验证事项，以及对应 pot-desktop Commit。若不能执行测试，只能标记为静态检查。
```

### 4.2 结构化结果任务 Prompt

```text
在插件仓库从 feat/card-layered-ui 的最新固定 Head 创建 task/card-plugin-result-schema。
只实现 DEVELOPMENT-PACK.md 中 CARD-PLUGIN-01：新增独立的 pot.programmer-result.v1 序列化模块和独立测试，不修改 info.json、README、现有 Gemini 请求实现或本地复合语义规则。
覆盖 NFC_WriteU16LE、getCustomxyzValue、RxBufLen、ST25DV_i2c_WriteData 四个 fixture；验证 plainText、source 枚举、diagnostics 清洗、AI 不覆盖本地词义和无 Key 泄漏。
创建 Draft PR，Base 为 feat/card-layered-ui。不得声称未执行的测试已通过。
```

### 4.3 配置元数据任务 Prompt

```text
在插件仓库从 feat/card-layered-ui 的最新固定 Head 创建 task/card-plugin-config-schema。
只实现 DEVELOPMENT-PACK.md 中 CARD-PLUGIN-02：为现有 needs 增加旧 Pot 可忽略的 section/control/help/visibleWhen/sensitive 等元数据，保持所有现有配置 key 及兼容语义。
只修改 info.json、manifest/CI 对应检查和 README 设置说明，不修改运行时代码。
创建 Draft PR，Base 为 feat/card-layered-ui，并列出所有默认值、顺序变更及其兼容风险。
```

### 4.4 接入任务 Prompt

```text
等待 CARD-PLUGIN-01 和 CARD-PLUGIN-02 契约固定后，从 feat/card-layered-ui 最新 Head 创建 task/card-plugin-host-negotiation。
实现 options.host.resultSchemas 能力协商：支持 pot.programmer-result.v1 时输出新版对象，否则保持当前 setResult native 对象和无 setResult 纯文本路径。
不得破坏共享数据库池、本地完整命中零网络、中文转英文不调用 Gemini、AI 失败本地回退、固定技术词义不可覆盖和 API Key 安全边界。
创建 Draft PR，Base 为 feat/card-layered-ui；提交真实测试证据或明确标注未执行。
```

### 4.5 只读验收 AI Prompt

```text
拉取插件仓库远端最新代码，检出指定 PR 分支并 reset 到协调者提供的 Commit SHA。只允许读取、构建、测试和验收；禁止修改文件、格式化、提交、push、创建或合并 PR。
记录操作系统、Node/Python 版本、全部命令、退出码和关键日志。运行仓库规定的 JavaScript、Python、Pot eval、manifest、词典构建、敏感信息扫描和打包检查。不要使用真实 Gemini API。
重点验证四个固定输入、新旧宿主输出路径、零网络条件、AI 失败回退、数据库连接关闭时机和 Artifact 根目录。把失败项、复现步骤与可能原因原样反馈给远端开发对话。
```
