# PR-C：Gemini Key 池、模型选择与 Interactions API 迁移计划

> 状态：产品决策已确认，等待实现  
> 仓库：https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection  
> 开发分支：`feat/gemini-key-pool-and-model-routing`  
> PR Base：`feat/gemini-semantic-layer`  
> Base SHA：`4508d3b8f9490c3d02cf4f14b14662f7955127c2`  
> 前置 PR：Draft PR #2，保持不合并

## 1. 目标

在现有“本地词典优先、Gemini 可关闭、失败完整回退”的基础上，将单 Key、单自由模型、`generateContent` 请求升级为：

1. 最多 20 个用户自有 Gemini API Key；
2. 文本配置式启用/禁用与去重；
3. 默认粘滞 Key，只有失败时才切换下一个 Key；
4. 单次调用最多尝试可配置数量的不同 Key，默认 5 个；
5. 提供稳定模型预设与自定义模型；
6. 默认模型为 `gemini-3.5-flash-lite`；
7. 使用 Gemini Interactions API；
8. 不做备用模型自动切换；
9. 所有 Key 或模型请求失败时，完整返回第一层本地结果。

## 2. 已确认产品决策

| 项目 | 固定决策 |
|---|---|
| Key 调度 | `failover_only`：成功后继续使用当前 Key，失败才切换 |
| Key 上限 | 20 个唯一 Key |
| 单次不同 Key 上限 | 用户可配置 1～20，默认 5 |
| Key 保存 | 接受 Pot 插件设置页明文保存，README 必须醒目提示 |
| 单 Key 管理 | 不修改 Pot 主程序；使用文本语法控制启用/禁用 |
| 模型选择 | 稳定模型预设下拉框 + 自定义模型 |
| 模型回退 | 不实现；当前模型失败后只允许换 Key，最终回退本地结果 |
| PR 组织 | 新建 PR-C，Base 为 `feat/gemini-semantic-layer` |
| API 形态 | Interactions API，无 `generateContent` 主路径 |

## 3. 官方事实基线

实现前必须重新核对 Google 官方文档；截至 2026-07-27，本计划采用以下事实：

- Interactions API 已被官方推荐用于新项目；REST 创建端点为：
  `POST https://generativelanguage.googleapis.com/v1beta/interactions`
- API Key 仅通过 `x-goog-api-key` 请求头发送；不得放入 URL。
- Interactions 默认会保存请求；本插件是单次、无状态翻译，必须显式发送 `store: false`。
- 结构化输出使用顶层 `response_format`：
  `type: "text"`、`mime_type: "application/json"` 和 JSON Schema。
- 不使用 `previous_interaction_id`、后台任务、流式输出或工具调用。
- 不发送已废弃的 `temperature`、`top_p`、`top_k`。

官方参考：

- 用户指定文档：
  - https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite.md.txt?hl=zh-cn
  - https://ai.google.dev/gemini-api/docs/latest-model.md.txt?hl=zh-cn
- 规范页面：
  - https://ai.google.dev/gemini-api/docs/interactions-overview
  - https://ai.google.dev/api/interactions-api-v1
  - https://ai.google.dev/gemini-api/docs/structured-output
  - https://ai.google.dev/gemini-api/docs/changelog

## 4. 模型配置

### 4.1 预设模型

按以下顺序出现在 `info.json` 的 `select` 中，第一项即默认值：

| 显示名称 | 模型 ID |
|---|---|
| Gemini 3.5 Flash-Lite（默认，快速低成本） | `gemini-3.5-flash-lite` |
| Gemini 3.6 Flash | `gemini-3.6-flash` |
| Gemini 3.5 Flash | `gemini-3.5-flash` |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` |
| 自定义模型 | `custom` |

### 4.2 模型解析规则

新增配置：

```text
modelPreset
customModel
```

规则：

1. `modelPreset` 为四个预设 ID 时直接使用；
2. `modelPreset=custom` 时读取 `customModel`；
3. 自定义模型只允许 `[A-Za-z0-9._-]`，长度 1～80；
4. 不允许 URL、路径、查询参数或 `models/` 前缀；
5. 没有新配置时，为兼容 PR-B，先读取旧 `model`；旧值为空再使用 `gemini-3.5-flash-lite`；
6. 不使用 `gemini-flash-latest` 等浮动别名；
7. 不配置备用模型，也不因 404 自动改用其他模型。

## 5. Key 池配置格式

### 5.1 新配置项

```text
apiKeyPool
maxKeyAttempts
```

`apiKeyPool` 仍是 Pot 普通输入配置，可能明文显示。支持换行、英文逗号、中文逗号和分号分隔。

### 5.2 文本语法

```text
AIzaEnabledKey1
K2=AIzaEnabledKey2
#AIzaDisabledKey3
#K4=AIzaDisabledKey4
```

也可单行填写：

```text
K1=AIzaKey1,#K2=AIzaKey2,AIzaKey3
```

语义：

- 行或条目前缀 `#`：持久禁用；
- 可选 `名称=Key`，名称只用于诊断，去除首尾空格，最长 24 字符；
- 未命名项自动显示为 `K1`、`K2`……；
- 名称不得被当作 Key 或发送到 Google；
- Key 去除外围引号与首尾空格；Key 内部含空白、为空或超过 512 字符即非法；
- 使用 SHA-256 指纹去重，完整 Key 不进入状态数据库；
- 同一 Key 重复出现时保留第一次出现的位置、名称和启用状态，并计入重复数；
- 最多接受前 20 个唯一合法 Key，其余计为超限；
- 新 `apiKeyPool` 为空时，将旧 `apiKey` 作为一个启用 Key 使用，以兼容 PR-B；两者同时存在时只使用新池。

## 6. Key 状态与持久化

Pot 每次调用会重新 `eval()` 插件脚本，不能依赖 JS 全局变量保持轮询状态。使用独立运行期 SQLite 文件：

```text
sqlite:plugins/translate/plugin.com.elio.programmer-selection-translator/gemini_state.db
```

该文件运行时创建，不提交、不打包；不得保存完整 Key。

建议表：

```sql
CREATE TABLE IF NOT EXISTS gemini_key_state (
  fingerprint TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  rate_limit_count INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gemini_scheduler_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_fingerprint TEXT,
  updated_at INTEGER NOT NULL
);
```

状态白名单：

```text
available | invalid | cooldown
```

要求：

- 配置变化后删除不再存在于当前 Key 池的陈旧指纹状态；
- 被 `#` 禁用的 Key 不参与调度；
- 冷却到期后自动恢复 `available`，但保留频控计数；
- Key 成功后重置频控计数，并记录为当前粘滞 Key；
- 状态库不可用时降级为无持久化模式：从第一个启用 Key 开始执行当前请求，仍须保证本地回退和 Key 不泄漏。

## 7. 调度算法

### 7.1 粘滞 Key

1. 读取启用、非无效、未冷却的 Key；
2. 若状态库中的 `active_fingerprint` 仍可用，将其排在第一位；
3. 其余 Key 按用户配置顺序排列；
4. 每次请求成功后保持该 Key 为活动 Key；
5. 只有当前 Key 出现允许切换的失败，才尝试下一个 Key；
6. 同一次逻辑请求中每个不同 Key 最多进入一次 Key 尝试计划；
7. 不随机、不在成功请求间主动轮转。

### 7.2 尝试预算

- `maxKeyAttempts` 合法范围 1～20，默认 5；
- 该值限制不同 Key 数量，不是 HTTP 总请求数；
- 单次 Gemini 增强增加 30 秒全局硬截止时间；
- 单个 HTTP 请求沿用最大 15 秒超时，并受全局截止时间约束；
- 达到不同 Key 上限或全局截止时间后立即返回完整本地结果。

## 8. 错误分类与动作

| 情况 | 当前 Key 动作 | 是否换 Key | 备注 |
|---|---|---|---|
| 2xx + 合法结构化结果 | 设为活动 Key、清零频控 | 否 | 返回 AI 增强结果 |
| 400 | 不改 Key 状态 | 否 | 请求结构问题，直接本地回退 |
| 401/403 | 标记 `invalid` | 是 | 本次继续下一个 Key |
| 404 | 不改 Key 状态 | 否 | 模型或端点问题；禁止模型回退 |
| 408 | 同 Key额外重试 1 次 | 重试仍失败才换 | 受全局截止限制 |
| 429 | 进入冷却 | 是 | 优先解析 `Retry-After` |
| 5xx | 同 Key额外重试最多 2 次 | 仍失败才换 | 不标记永久无效 |
| 网络异常 | 同 Key额外重试 1 次 | 仍失败才换 | 不泄漏底层异常全文 |
| 超时 | 同网络异常 | 仍失败才换 | 全局截止优先 |
| 响应为空、非 JSON、Schema 不符 | 不改 Key 状态 | 否 | 服务已成功响应，直接本地回退 |

429 无有效 `Retry-After` 时采用：

```text
第 1 次：60 秒
第 2 次：5 分钟
第 3 次：30 分钟
第 4 次及以后：24 小时
```

仅接受 `Retry-After` 秒数格式；非法值回退上述冷却策略。

## 9. Interactions API 请求契约

请求端点固定：

```text
POST https://generativelanguage.googleapis.com/v1beta/interactions
```

请求头：

```text
Content-Type: application/json
x-goog-api-key: <当前 Key>
```

请求体目标结构：

```json
{
  "model": "gemini-3.5-flash-lite",
  "input": "序列化后的最小语义任务 JSON",
  "system_instruction": "程序标识符语义解释器约束",
  "response_format": {
    "type": "text",
    "mime_type": "application/json",
    "schema": {
      "type": "object",
      "properties": {
        "translatedWords": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        },
        "semanticDescription": { "type": "string" }
      },
      "required": ["translatedWords", "semanticDescription"]
    }
  },
  "generation_config": {
    "max_output_tokens": 512
  },
  "store": false,
  "stream": false,
  "background": false
}
```

说明：

- 实现时必须根据官方当前支持的 JSON Schema 子集验证 `additionalProperties` 是否可用；若不支持，则使用可被官方接受的等价 schema，并继续执行本地 token 键白名单校验；
- 不显式设置 `thinking_level`，使用各稳定模型默认值；
- 不使用 `previous_interaction_id`；
- 不发送源码行、路径、仓库名、项目名或未选择的剪贴板内容。

## 10. 响应解析

仅接受：

- HTTP 2xx；
- Interaction `status=completed`；
- `steps` 中 `type=model_output` 的文本内容；
- 拼接文本后可解析为严格 JSON；
- 顶层字段只能为 `translatedWords`、`semanticDescription`；
- `translatedWords` 的键只能来自本次 `requestedTokens`；
- 继续沿用 PR-B 的数量、长度、代码围栏和总长度限制。

不得信任便捷字段或模型自由文本替代本地校验。不得执行模型输出。

## 11. 代码结构

保留生成式单文件机制，不直接修改 `main.js`。建议职责：

```text
src/runtime-01.js                    # 第一层本地词典，不改变核心行为
src/runtime-02-gemini.js             # 最小请求上下文、Schema 校验、结果拼接
src/runtime-03-gemini-key-pool.js    # Key 解析、指纹、状态库、调度与重试策略
src/runtime-04-gemini-interactions.js# Interactions 请求/响应适配器
```

要求：

- 纯解析、排序和决策函数必须可注入时钟与状态存储，便于 Node 单测；
- 网络适配器只接收一次尝试所需的 Key，不接收完整配置对象；
- SQLite 适配器与纯调度逻辑分离；
- `translate()` 仍只在 `report` 或 `chinese` 输出模式进入 Gemini；命名格式输出保持纯本地。

## 12. `info.json` 目标配置

保留：

```text
outputStyle
dictionaryMode
identifierType
acronymStyle
aiMode
sendScope
```

新增/替换：

```text
apiKeyPool          # 普通输入，显示明文风险
maxKeyAttempts      # select：1、3、5、10、20；5 为第一项默认
modelPreset         # select：四个稳定模型 + custom
customModel         # input，仅 custom 时使用
```

旧 `apiKey` 与 `model` 不再作为可见设置项，但运行时保留一版只读兼容。

## 13. 隐私与安全

- `aiMode=off` 必须零网络、零状态库写入；
- `unknown_only` 本地全部命中时必须零网络；
- Key 仅出现在 `x-goog-api-key` 请求头；
- URL、日志、输出、异常、测试快照、状态数据库和 Artifact 均不得包含完整 Key；
- 状态数据库只保存 SHA-256 指纹与调度状态；
- `store:false` 必须由测试和 CI 静态检查锁定；
- README 明确说明 Key 池在 Pot 设置页以明文保存；
- 自动化测试只使用假 Key并 mock 网络；
- 本地人工验收可使用用户自有 Key，但不得截图或回传完整 Key。

## 14. 向后兼容

- 第一层 21 项测试必须继续通过；
- PR-B Gemini 测试必须迁移后继续覆盖相同隐私与回退语义；
- 新池为空时兼容旧 `apiKey`；
- 新模型配置不存在时兼容旧 `model`；
- 原 `generateContent` 主路径必须从最终 `main.js` 移除；
- 已安装旧版本升级后，即使未重新配置，也不得导致本地翻译失败。

## 15. CI 与验收门禁

CI 至少验证：

1. `main.js` 包含 `/v1beta/interactions`；
2. `main.js` 不包含 Gemini `:generateContent` 主请求路径；
3. `store: false`、`response_format`、`x-goog-api-key` 存在；
4. 默认模型为 `gemini-3.5-flash-lite`；
5. 四个预设模型 ID 完整；
6. `maxKeyAttempts` 默认 5；
7. Key 上限 20；
8. Key 不进入 URL、状态库夹具、输出、异常或 Artifact；
9. `.potext` 文件清单不增加状态数据库；
10. 所有 Node、Python、Pot `eval()`、词典与 Artifact 检查通过。

## 16. 明确不做

- 不修改 Pot 主程序；
- 不实现系统级安全保险箱；
- 不提供独立 Key 管理 UI；
- 不调用 `models.list` 动态拉取模型；
- 不自动验证全部 Key；
- 不按成功请求轮询 Key；
- 不实现备用模型或模型链；
- 不使用流式、后台或多轮 Interaction；
- 不合并 PR-A、PR-B 或 PR-C。

## 17. 完成定义

只有同时满足以下条件才能汇报 PR-C 实现完成：

- 代码与测试已提交到目标分支；
- Draft PR Base/Head 正确；
- GitHub Actions 全绿；
- Artifact 下载并完成内部文件、敏感信息与运行时字符串检查；
- 自动测试覆盖 Key 解析、禁用、去重、粘滞调度、重试、冷却、模型选择、Interactions 格式和本地回退；
- 提供只读的本地 AI 安装与 Pot GUI 验证指令；
- 清楚区分自动验证、人工验证和未验证项。
