# 方案一：稳妥优化方案——插件开发包

## 0. 分支与状态

- 仓库：`elio-zwd/pot-app-translate-plugin-programmer-selection`
- 本分支：`backup/safe-ui-optimization`
- 固定基线：`main@1d51041810f7c91128ae9436fab56b188f2ded37`
- 对应桌面端分支：`elio-zwd/pot-desktop@backup/programmer-safe-ui-optimization`
- 状态：**备用冻结，不得开发，除非用户明确激活**
- 激活后的目标 PR Base：`main`

本方案保持现有 Pot 词典对象与配置模型，重点优化内容顺序、密度和正常状态噪声。它是主方案无法落地或需要快速兼容发布时的低风险回退。

## 1. Plan

### 1.1 目标

在不引入新结构化结果协议的前提下：

1. 将核心释义提前；
2. 标识符类型与拆分紧邻展示；
3. 保留完整逐词解释；
4. 保留三组命名转换；
5. 正常状态静默，只显示异常诊断；
6. AI 成功只显示 AI 释义，不重复本地释义；
7. 无 `setResult` 的纯文本回退保持完整。

### 1.2 插件输出顺序

建议旧 native explanation 顺序：

1. `核心释义`：本地、AI 或本地回退；
2. `标识符结构`：类型、原文和 token 拆分；
3. `词义`：保持现有本地/AI 来源标记；
4. `常用命名`；
5. `分隔命名`；
6. `常量命名`。

`associations` 仅保留：

- 未解析 token；
- 本地词典不可用；
- AI 需要 Key 但未配置；
- AI 请求失败并回退；
- 无法处理的中文输入。

以下正常状态不得默认输出：AI 已关闭、本地完整命中未请求 AI、普通英语已命中。

### 1.3 设置策略

保留现有 12 个配置 key 和旧 `input/select` 类型，只调整中文标签、顺序和帮助文档。不得依赖新版 `pot-desktop` 的 secret、switch、条件显示或卡片协议。

### 1.4 验收场景

- `NFC_WriteU16LE`：核心本地释义第一行，正常无状态提示。
- `getCustomxyzValue`：AI 只补未知词，逐词区标记 AI 来源。
- `RxBufLen`：AI 始终模式显示 AI 核心释义，本地固定词义保持不变。
- `ST25DV_i2c_WriteData`：AI 失败后显示本地核心释义和一条异常提示。

## 2. Tasks

### 2.1 激活门禁

任一 AI 开始前必须在用户消息或该分支最新文档中看到明确“激活方案一”。未激活时只允许：读取、风险评审、更新计划；禁止修改运行时代码、测试、manifest 或创建功能 PR。

### 2.2 激活后的并行波次

#### Wave 0

- `SAFE-PLUGIN-00`：协调者重新基于最新 `main` 评估是否需要 rebase；冻结 explanation trait、顺序和状态策略。

#### Wave 1：可并行

- `SAFE-PLUGIN-01 输出顺序与状态静默`
  - 分支：`task/safe-plugin-report-order`
  - 只修改最终 native/plain-text 报告模块及对应报告测试。
  - 不修改 `info.json`、Gemini 请求或本地复合语义。

- `SAFE-PLUGIN-02 设置文案与兼容检查`
  - 分支：`task/safe-plugin-settings-copy`
  - 只修改 `info.json`、README、manifest/CI 对应检查。
  - 保持所有配置 key、类型和默认语义。

#### Wave 2

- `SAFE-PLUGIN-03 集成回归`
  - 合并任务 PR，验证 native 与无 `setResult` 文本输出一致、数据库池不关闭、零网络和 AI 回退边界。

### 2.3 文件冲突规则

- 报告 AI 不修改 manifest；设置 AI 不修改 runtime。
- 不新增新的 Gemini 接口、模型路由或数据库字段。
- 不顺带调整标识符拆分、类型识别和命名算法。

## 3. Handoff

### 3.1 给桌面端的假设

桌面端仅需继续支持现有字符串与旧词典对象，不要求理解 `pot.programmer-result.v1`。本方案的视觉改进主要来自插件输出顺序，桌面端只做通用旧词典结果的间距、换行和对象复制兼容。

### 3.2 组合验收

记录插件和桌面端各自 Commit SHA，验证：

- 旧 Pot 可用；
- fork Pot 可用；
- 结构化对象能力不存在时不影响结果；
- 四个场景在两种宿主中内容一致；
- 正常状态静默、异常状态明确。

### 3.3 风险

- 仍受旧 `explanations/associations` 表达能力限制；
- 无内部折叠和逐项复制；
- 配置页仍较长；
- explanation trait 和顺序测试可能需要精确更新。

## 4. AI Prompts

### 4.1 备用方案守门 Prompt

```text
你负责评审插件仓库 backup/safe-ui-optimization。先读取 AGENTS.md 和 docs/programmer-ui/DEVELOPMENT-PACK.md，并确认用户是否已明确激活方案一。
若未激活，只能检查基线、开放 PR、风险和计划，不得修改功能文件、创建 task 分支或 PR。若已激活，固定最新 Base/Head SHA，并按开发包拆分不重叠任务。
```

### 4.2 报告优化任务 Prompt

```text
仅在用户明确激活方案一后，从 backup/safe-ui-optimization 最新 Head 创建 task/safe-plugin-report-order。
只实现 SAFE-PLUGIN-01：调整最终 native 和 plain-text 报告顺序，将核心释义提前，正常状态静默，异常状态保留；保持 AI 不覆盖本地、共享数据库池、零网络和旧 Pot 兼容。
只修改报告运行时与对应测试，不修改 info.json、Gemini 请求、本地复合语义或命名算法。创建 Draft PR，Base 为 backup/safe-ui-optimization。
```

### 4.3 设置文案任务 Prompt

```text
仅在用户明确激活方案一后，从 backup/safe-ui-optimization 最新 Head 创建 task/safe-plugin-settings-copy。
只修改 info.json、README 和对应 manifest/CI 检查，优化设置标签和顺序说明；所有配置 key、旧 input/select 能力和核心默认语义必须兼容。
不要修改运行时代码。创建 Draft PR，Base 为 backup/safe-ui-optimization，并列出每个顺序或默认值变化的测试影响。
```

### 4.4 只读验收 AI Prompt

```text
检出协调者指定的方案一 Commit，只允许读取、构建、测试和 Pot GUI 验收；禁止修改、提交、push 或合并。
记录环境、命令、退出码和日志。验证 NFC_WriteU16LE、getCustomxyzValue、RxBufLen、ST25DV_i2c_WriteData 的内容顺序、状态静默、AI 回退、无 setResult 文本路径、旧 Pot 与 fork Pot 兼容。不要调用真实 Gemini API。
```
