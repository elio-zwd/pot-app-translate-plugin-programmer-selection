# 方案三：极简程序员工具方案——插件开发包

## 0. 分支与状态

- 仓库：`elio-zwd/pot-app-translate-plugin-programmer-selection`
- 本分支：`backup/minimal-programmer-tool-ui`
- 固定基线：`main@1d51041810f7c91128ae9436fab56b188f2ded37`
- 对应桌面端分支：`elio-zwd/pot-desktop@backup/programmer-minimal-tool-ui`
- 状态：**备用冻结，不得开发，除非用户明确激活**
- 激活后的目标 PR Base：`main`

本方案面向高频快速查询：默认只显示一个核心结论和极少状态，详细 token、命名和诊断由新版桌面端按需展开。原版 Pot 仍需获得可理解的完整文本回退。

## 1. Plan

### 1.1 产品目标

首屏只回答两个问题：

1. 这个标识符是什么意思？
2. 结果来自本地、AI 还是本地回退？

详细信息按需提供：

- 标识符结构；
- 逐词解释；
- 命名转换；
- 异常诊断。

正常情况下不显示类型推断说明、网络状态、词典状态和完整五种命名。

### 1.2 数据协议

优先复用跨仓库协议名 `pot.programmer-result.v1`，避免为视觉方案创建不兼容的数据模型。极简差异由数据优先级和桌面端默认折叠决定。

插件必须提供：

```js
{
  schema: 'pot.programmer-result.v1',
  plainText: '完整可复制文本',
  summary: {
    text: '接收缓冲区长度',
    source: 'local | ai | local_fallback',
    fallback: false
  },
  identifier: { original, detectedType, detectionMode, tokens },
  tokenMeanings: [],
  naming: {},
  diagnostics: []
}
```

可增加可选但非强制字段：

```js
presentation: {
  preferredDensity: 'minimal',
  initiallyExpanded: []
}
```

桌面端只能把它当提示，不能因缺少该字段拒绝结果。

### 1.3 原版 Pot 回退

- 新 fork 支持 Schema 时返回结构化对象；
- 旧 Pot native 路径默认输出核心释义、拆分和异常信息；
- 无 `setResult` 路径返回完整纯文本；
- 用户选择完整分析时仍必须包含逐词和命名，不得因极简默认丢失数据。

### 1.4 设置策略

激活后可考虑将结果形式改为：

- `minimal`：默认；
- `report`：完整；
- 命名格式直接输出模式保持现有行为。

但不得未经迁移处理直接删除现有 `outputStyle` 选项。配置默认变更必须更新测试、README、CI 和升级兼容说明。

### 1.5 四场景

- `NFC_WriteU16LE`：首屏只显示本地核心释义和本地标签，无诊断。
- `getCustomxyzValue`：首屏显示 AI 补全释义，展开后区分本地和 AI token。
- `RxBufLen`：首屏显示 AI 释义与 AI 标签，固定本地 token 保留在详情数据。
- `ST25DV_i2c_WriteData`：首屏显示本地回退释义和一个失败提示，详细错误不泄漏敏感数据。

## 2. Tasks

### 2.1 激活门禁

用户未明确激活方案三时，只允许评审和更新计划，不得修改运行时、manifest、测试或创建功能 PR。

### 2.2 激活后的并行计划

#### Wave 0

- `MIN-PLUGIN-00`：协调者冻结与方案二相同的 `pot.programmer-result.v1` 核心字段，确认是否使用可选 presentation 提示，并评估默认值迁移。

#### Wave 1：可并行

- `MIN-PLUGIN-01 极简摘要与完整详情数据`
  - 分支：`task/min-plugin-result-schema`
  - 新增/适配结构化序列化模块，保证 summary 极简但详情数据完整。
  - 只修改结果序列化与独立测试，不修改 manifest。

- `MIN-PLUGIN-02 输出模式与配置迁移`
  - 分支：`task/min-plugin-output-mode`
  - 只修改 `info.json`、配置解析、README、manifest/CI 测试；设计旧值到 `minimal/report` 的兼容映射。
  - 不修改 Gemini 请求和词典实现。

#### Wave 2

- `MIN-PLUGIN-03 宿主协商和旧 Pot 回退`
  - 分支：`task/min-plugin-host-fallback`
  - 支持新版 Schema、旧 native 和纯文本三路径；验证用户显式完整模式不会丢详情。

#### Wave 3

- `MIN-PLUGIN-04 集成验证`
  - 固定桌面端 Commit，验证默认极简、展开详情、复制全文和旧 Pot 完整回退。

### 2.3 并行冲突规则

- Schema AI 不修改 `info.json`；配置 AI不修改结果序列化文件；接入 AI在 Wave 1 合并后开始。
- 不为极简效果删掉本地词义、命名转换或诊断数据，只改变默认展示和输出模式。
- 不修改 Gemini Key 池、Interactions API、本地固定技术语义和数据库池生命周期。

## 3. Handoff

### 3.1 给桌面端的保证

- `summary` 始终存在且适合首屏；
- `plainText` 始终包含当前用户所选输出模式的完整可复制文本；
- 详情数据不会因为默认折叠而删除；
- 正常 `diagnostics=[]`；
- AI 失败时 `summary.source=local_fallback`。

### 3.2 桌面端不能假设

- `presentation` 一定存在；
- token 数量很少；
- 所有命名格式都有值；
- 类型启发式判断绝对正确。

### 3.3 风险与回滚

- 改默认输出形式属于用户可见行为变化，必须有升级说明；
- 极简首屏可能隐藏用户依赖的信息，必须保证一键展开和全文复制；
- 若 fork 主程序未就绪，应回滚到 `report` 默认或使用方案一备用分支，不得发布只有极简摘要且无法展开的版本。

## 4. AI Prompts

### 4.1 备用方案守门 Prompt

```text
你负责评审插件仓库 backup/minimal-programmer-tool-ui。先读取 AGENTS.md 与 docs/programmer-ui/DEVELOPMENT-PACK.md，并确认用户是否明确激活方案三。
未激活时禁止修改功能代码、创建 task 分支或 PR，只能更新风险和计划。已激活后先冻结 pot.programmer-result.v1 核心契约与 outputStyle 迁移策略，再允许并行任务开始。
```

### 4.2 极简结果 Schema 任务 Prompt

```text
仅在方案三已激活后，从 backup/minimal-programmer-tool-ui 最新 Head 创建 task/min-plugin-result-schema。
实现 MIN-PLUGIN-01：复用 pot.programmer-result.v1，生成适合首屏的 summary，同时保留完整 identifier、tokenMeanings、naming、diagnostics 和 plainText。可增加非强制 presentation 提示，但不得创建不兼容的新协议名。
只修改结果序列化模块和独立测试，不修改 info.json、Gemini 请求、本地语义和数据库池。创建 Draft PR，Base 为 backup/minimal-programmer-tool-ui。
```

### 4.3 输出模式迁移任务 Prompt

```text
仅在方案三已激活后，从 backup/minimal-programmer-tool-ui 最新 Head 创建 task/min-plugin-output-mode。
设计 outputStyle 的 minimal/report 兼容迁移，保留现有直接命名格式输出；评估是否改变默认值，并同步 info.json、配置解析、README、manifest/CI 测试和升级说明。
不得删除完整详情能力，不修改 Gemini 请求或词典实现。创建 Draft PR，Base 为 backup/minimal-programmer-tool-ui。
```

### 4.4 宿主回退任务 Prompt

```text
等待 MIN-PLUGIN-01 和 MIN-PLUGIN-02 合并后，从 backup/minimal-programmer-tool-ui 最新 Head 创建 task/min-plugin-host-fallback。
接入新版 Schema、旧 native、无 setResult 纯文本三路径；保证旧 Pot 与用户显式 report 模式得到完整信息，默认 minimal 在新版桌面端可展开详情。
验证四个固定输入、AI 失败回退、零网络、本地词义不可覆盖和 Key 安全。创建 Draft PR，Base 为 backup/minimal-programmer-tool-ui。
```

### 4.5 只读验收 AI Prompt

```text
检出协调者指定的方案三插件 Commit，只允许读取、构建、测试和 Pot GUI 验收；禁止修改、提交、push 或合并。
记录环境、命令和日志。验证默认 minimal、显式 report、命名直接输出、新版 Schema、旧 native 和纯文本路径；覆盖四个固定输入，确认详情数据未丢失、AI 失败安全回退且不使用真实 Gemini API。
```
