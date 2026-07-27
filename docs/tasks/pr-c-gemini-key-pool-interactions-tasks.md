# PR-C Task：Gemini Key 池、模型选择与 Interactions API

> 对应 Plan：`docs/planning/pr-c-gemini-key-pool-interactions-plan.md`  
> 分支：`feat/gemini-key-pool-and-model-routing`  
> Base：`feat/gemini-semantic-layer`  
> Base SHA：`4508d3b8f9490c3d02cf4f14b14662f7955127c2`

## T0：进入任务与冻结基线

- [ ] 先读取仓库根目录 `AGENTS.md`。
- [ ] 再读取 Plan、本文档和交接文档。
- [ ] 确认 PR #2 仍为 Draft、未合并，Head 起点为固定 Base SHA。
- [ ] 读取真实文件：
  - [ ] `src/runtime-01.js`
  - [ ] `src/runtime-02-gemini.js`
  - [ ] `tests/main.test.cjs`
  - [ ] `tests/gemini.test.cjs`
  - [ ] `scripts/build_runtime.py`
  - [ ] `info.json`
  - [ ] `README.md`
  - [ ] `GEMINI-HANDOFF.md`
  - [ ] `.github/workflows/build.yml`
- [ ] 重新核对 Google 官方 Interactions API、结构化输出、模型与变更日志。
- [ ] 记录修改前测试结果与当前 Head SHA。

## T1：配置模型与兼容层

- [ ] 在 `info.json` 中删除可见的旧 `apiKey`、`model` 配置。
- [ ] 新增 `apiKeyPool` 普通输入配置，并标注“设置页明文”。
- [ ] 新增 `maxKeyAttempts` select，顺序固定为 `5、1、3、10、20`，第一项 `5` 为默认。
- [ ] 新增 `modelPreset` select，顺序固定为：
  - [ ] `gemini-3.5-flash-lite`
  - [ ] `gemini-3.6-flash`
  - [ ] `gemini-3.5-flash`
  - [ ] `gemini-3.1-flash-lite`
  - [ ] `custom`
- [ ] 新增 `customModel` input。
- [ ] 实现模型规范化与白名单校验。
- [ ] 新配置缺失时兼容旧 `config.model`；旧值也为空时使用 `gemini-3.5-flash-lite`。
- [ ] 新 Key 池为空时兼容旧 `config.apiKey`，新旧同时存在时仅用新池。
- [ ] 禁止浮动 latest 别名成为预设。

验收：

- [ ] 默认模型断言为 `gemini-3.5-flash-lite`。
- [ ] 非法自定义模型不会发起网络请求。
- [ ] PR-B 老配置仍能正常进入 Gemini 层或完整本地回退。

## T2：实现 Key 池解析

建议新增：`src/runtime-03-gemini-key-pool.js`。

- [ ] 实现换行、英文逗号、中文逗号、分号分隔。
- [ ] 实现 `名称=Key` 可选名称。
- [ ] 实现前缀 `#` 的持久禁用语义。
- [ ] 实现外围引号清理与首尾空格清理。
- [ ] 拒绝空 Key、内部空白和超过 512 字符的 Key。
- [ ] 名称最长 24 字符，超长时安全截断或判非法，并通过测试固定行为。
- [ ] 使用 SHA-256 指纹去重。
- [ ] 重复项保留第一次出现的名称、位置和启用状态。
- [ ] 自动生成 `K1...Kn` 显示名。
- [ ] 最多接受 20 个唯一合法 Key。
- [ ] 解析结果包含 added/duplicate/invalid/overflow/disabled 计数，诊断不得含 Key。
- [ ] 完整 Key 不得进入异常、输出或持久化状态对象。

单测至少覆盖：

- [ ] 1、2、20、21 个 Key；
- [ ] 四种分隔方式；
- [ ] 单行混合启用/禁用；
- [ ] 自定义名称；
- [ ] 重复、空值、引号、内部空格、超长；
- [ ] 新旧配置兼容；
- [ ] 假 Key 不进入公开诊断。

## T3：实现无秘密状态库

- [ ] 新增 SQLite 状态适配器，路径固定：
  `sqlite:plugins/translate/plugin.com.elio.programmer-selection-translator/gemini_state.db`。
- [ ] 创建 `gemini_key_state` 表。
- [ ] 创建单行 `gemini_scheduler_state` 表。
- [ ] 只保存 fingerprint、状态、冷却时间、限流次数、成功/更新时间。
- [ ] 禁止保存完整 Key、Key 尾号、用户输入和模型输出。
- [ ] 配置变化后清理陈旧 fingerprint 状态。
- [ ] 冷却到期自动恢复可用。
- [ ] 成功时清零 `rate_limit_count`。
- [ ] 状态库读取、建表、写入、事务或关闭失败时不得影响本地翻译。
- [ ] 状态库不可用时使用确定性无持久化降级。
- [ ] 抽象 `stateStore` 接口，Node 测试使用内存 fake，不依赖真实 SQLite。

单测至少覆盖：

- [ ] 活动 Key 读取与保存；
- [ ] 状态清理；
- [ ] 冷却过期；
- [ ] 不存在表时初始化；
- [ ] 存储异常降级；
- [ ] 状态对象序列化中不存在 secret/key 字段。

## T4：实现粘滞调度与尝试计划

- [ ] 可用 Key 过滤：启用、非 invalid、未冷却。
- [ ] 活动 fingerprint 可用时排第一。
- [ ] 其余按用户配置顺序排列。
- [ ] 同一逻辑请求中不同 Key 不重复。
- [ ] 成功后保持当前 Key，不主动轮转。
- [ ] 失败切换时推进下一个 Key。
- [ ] `maxKeyAttempts` 规范化为 1～20，缺失/非法时为 5。
- [ ] 不同 Key 尝试数量达到上限即停止。
- [ ] 增加 30 秒逻辑请求硬截止时间。
- [ ] 单次 HTTP 超时最大 15 秒，并被剩余全局时间截断。
- [ ] 时钟、sleep 与请求函数均可注入测试。

单测至少覆盖：

- [ ] 默认最多 5 个不同 Key；
- [ ] 配置 1、3、10、20；
- [ ] 粘滞 Key 连续成功不变化；
- [ ] 活动 Key 被禁用、invalid 或冷却后跳过；
- [ ] 无状态降级从第一个启用 Key 开始；
- [ ] 截止时间到达立即停止；
- [ ] 所有 Key 不可用时零网络并本地回退。

## T5：实现错误分类与冷却

- [ ] 400：停止，不换 Key。
- [ ] 401/403：标记 invalid，换 Key。
- [ ] 404：停止，不换模型、不换 Key。
- [ ] 408：同 Key额外重试 1 次，仍失败才换 Key。
- [ ] 429：解析 `Retry-After` 秒数，冷却并换 Key。
- [ ] 5xx：同 Key额外重试最多 2 次，仍失败才换 Key。
- [ ] 网络异常/超时：同 Key额外重试 1 次，仍失败才换 Key。
- [ ] 空响应、非 JSON、Schema 失败：停止，不换 Key。
- [ ] 无 `Retry-After` 时冷却阶梯：60 秒、5 分钟、30 分钟、24 小时。
- [ ] Key 成功后清空频控次数并恢复 available。
- [ ] 用户 `#` 禁用状态优先于运行时状态。
- [ ] 所有可见错误理由使用枚举/短码，不包含响应正文和 Key。

单测必须逐项覆盖以上分支和边界次数。

## T6：迁移到 Interactions API

建议新增：`src/runtime-04-gemini-interactions.js`。

- [ ] 端点改为 `https://generativelanguage.googleapis.com/v1beta/interactions`。
- [ ] 删除最终运行路径中的 `models/{model}:generateContent`。
- [ ] API Key 仅使用 `x-goog-api-key` 请求头。
- [ ] 请求体使用顶层：
  - [ ] `model`
  - [ ] `input`
  - [ ] `system_instruction`
  - [ ] `response_format`
  - [ ] `generation_config`
  - [ ] `store: false`
  - [ ] `stream: false`
  - [ ] `background: false`
- [ ] `response_format` 使用 `text + application/json + schema`。
- [ ] 不使用 `previous_interaction_id`。
- [ ] 不使用工具、后台任务和流式响应。
- [ ] 不发送 `temperature`、`top_p`、`top_k`。
- [ ] 不显式发送 `thinking_level`。
- [ ] 保留 PR-B 的最小 token/上下文数据发送规则。
- [ ] 根据官方当前 JSON Schema 子集确定 `translatedWords` 的 schema 表达；本地白名单校验不可删除。

请求测试：

- [ ] 精确断言 endpoint、method、headers、body；
- [ ] 断言 `store=false`；
- [ ] 断言 Key 不在 URL；
- [ ] 断言请求不含源码行、文件路径、项目名；
- [ ] 断言四个模型和 custom 都进入 `model` 字段；
- [ ] 所有网络测试使用 mock。

## T7：实现 Interaction 响应解析

- [ ] 只接受 HTTP 2xx。
- [ ] 校验 Interaction `status=completed`。
- [ ] 从 `steps[type=model_output].content[type=text].text` 提取并拼接文本。
- [ ] 拒绝没有 model_output、空文本或非 completed 状态。
- [ ] 解析严格 JSON。
- [ ] 顶层字段必须且只能有 `translatedWords`、`semanticDescription`。
- [ ] token 键必须属于 requestedTokens。
- [ ] 沿用 PR-B 的数量、字段长度、总长度与代码围栏限制。
- [ ] 不执行模型输出。
- [ ] 解析失败时逐字返回本地结果，不尝试其他 Key。

至少覆盖 completed、failed、in_progress、空 steps、多 model_output、非 text content、非法 JSON、额外字段和超长内容。

## T8：整合 Gemini 语义层

- [ ] 重构 `resolveGeminiSemantics()` 使用 Key 池调度器和 Interactions 适配器。
- [ ] `aiMode=off` 在解析 Key、打开状态库前直接返回，保证零网络、零状态写入。
- [ ] `unknown_only` 本地全部命中时同样提前返回。
- [ ] 未配置可用 Key时完整本地回退。
- [ ] `report` 与 `chinese` 模式可进入 Gemini。
- [ ] camel/pascal/snake/screaming/kebab/words 仍完全本地。
- [ ] AI 成功输出格式保持 PR-B 的 `AI 语义增强`、`AI 未知词`。
- [ ] 默认不向最终翻译结果输出调度诊断。
- [ ] 若保留内部诊断对象，只能包含显示名、模型、尝试次数和短错误码，禁止 Key 或 fingerprint。

## T9：文档更新

- [ ] 更新 `README.md`：
  - [ ] Key 池格式；
  - [ ] `#` 禁用语法；
  - [ ] 默认 5 个尝试上限；
  - [ ] 粘滞失败切换语义；
  - [ ] 四个模型与默认模型；
  - [ ] Interactions API 与 `store=false`；
  - [ ] Pot 设置页明文风险；
  - [ ] 无备用模型；
  - [ ] 失败完整本地回退。
- [ ] 更新 `GEMINI-HANDOFF.md`，移除单 Key、旧默认模型和 generateContent 描述。
- [ ] 文档不得包含真实或疑似真实 Key。
- [ ] 官方链接指向 Google AI 文档。

## T10：测试文件

- [ ] 保持并迁移 `tests/gemini.test.cjs`。
- [ ] 新增 `tests/gemini-key-pool.test.cjs`。
- [ ] 新增 `tests/gemini-interactions.test.cjs`。
- [ ] 第一层 `tests/main.test.cjs` 全部继续通过。
- [ ] 所有假 Key 使用仓库允许的测试值，并验证不进入 Artifact。
- [ ] 不调用真实 Gemini API。
- [ ] 不依赖网络、系统时间或真实 SQLite。

## T11：CI 与 Artifact 门禁

更新 `.github/workflows/build.yml`：

- [ ] 校验新的 `info.json` 配置键集合和默认顺序。
- [ ] 校验默认模型 `gemini-3.5-flash-lite`。
- [ ] 校验四个预设模型存在。
- [ ] 校验 `maxKeyAttempts` 默认 5。
- [ ] 校验 Key 上限 20 的运行时常量。
- [ ] 校验 `/v1beta/interactions`。
- [ ] 校验最终 `main.js` 不含 Gemini `:generateContent` 主路径。
- [ ] 校验 `store: false`、`response_format`、`x-goog-api-key`。
- [ ] 校验 URL 不含 `?key=`。
- [ ] 扫描假 Key和 `AIza...` 模式泄漏。
- [ ] Artifact 不包含 `gemini_state.db`。
- [ ] `.potext` 根目录仍只有批准文件。
- [ ] Node、Python、词典、eval、打包全部通过。

## T12：Draft PR 与交付

- [ ] PR Base 为 `feat/gemini-semantic-layer`。
- [ ] PR Head 为 `feat/gemini-key-pool-and-model-routing`。
- [ ] 保持 Draft，不合并、不关闭、不转 Ready。
- [ ] PR 描述记录固定产品决策和官方 API 迁移。
- [ ] 等待 Actions 完成；失败时修复代码或测试，不弱化门禁。
- [ ] 下载并检查最终 Artifact。
- [ ] 记录最终 Head SHA、Run ID、Artifact ID、大小和包内清单。
- [ ] 输出本地 AI 只读验证指令，禁止其修改、提交、push、建 PR 或合并。

## T13：本地 Pot GUI 验收清单

本地 AI 只负责验证：

- [ ] 安装 PR-C Artifact。
- [ ] `aiMode=off`：本地结果正常，零 Gemini 请求。
- [ ] 单 Key成功：使用默认 `gemini-3.5-flash-lite`。
- [ ] 两个 Key，第一个无效、第二个有效：切换成功。
- [ ] 成功后下一次仍使用第二个 Key，不主动轮转。
- [ ] `#` 禁用的 Key不参与请求。
- [ ] `maxKeyAttempts=1` 时不尝试第二个 Key。
- [ ] 切换四个模型，确认请求模型正确。
- [ ] 自定义合法模型可提交；非法值完整回退本地。
- [ ] 断网、401/403、429 或模型错误时本地结果仍完整。
- [ ] 设置页明确显示 Key 明文风险提示。
- [ ] 截图和日志不得出现完整 Key。

真实 API 调用只允许人工小规模验收，不得纳入自动测试。

## 最终完成门禁

- [ ] 全部自动测试通过；
- [ ] CI 全绿；
- [ ] Artifact 已审计；
- [ ] GUI 验收结果已回传或明确列为未验证；
- [ ] 没有真实 Key、状态数据库或请求日志进入 Git/Artifact；
- [ ] PR-A、PR-B、PR-C 均未被擅自合并。
