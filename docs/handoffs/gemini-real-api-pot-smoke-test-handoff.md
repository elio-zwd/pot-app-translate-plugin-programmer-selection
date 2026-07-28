# Gemini 真实 API 与 Pot GUI 烟测交接

## 1. 任务定位

本交接用于把已经合并到 `main` 的 Gemini Key 池与 Interactions API 功能交给本地 AI 做只读验证。

本地 AI 不参与开发，不得修改代码。真实 API 只允许由用户本人填写 Key 后进行少量 GUI 烟测。

## 2. 仓库与固定版本

仓库：

```text
https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection
```

测试目标：

```text
分支：main
固定 SHA：0e5bcf1dd96cba504f527f80744281926f5bab2e
```

对应合并 PR：

```text
https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection/pull/3
```

验证 Artifact：

```text
Actions Run：30270627215
Artifact ID：8654645803
Artifact 名称：plugin.com.elio.programmer-selection-translator.potext
Artifact digest：sha256:d0d81592a63687dd6232556813ce3b4b60bb0375914085d7a7615c67f1382724
```

文档分支：

```text
docs/gemini-real-api-pot-smoke-test
```

必须先阅读：

1. `AGENTS.md`；
2. `docs/planning/gemini-real-api-pot-smoke-test-plan.md`；
3. `docs/tasks/gemini-real-api-pot-smoke-test-tasks.md`；
4. 本交接文档。

## 3. API Key 在哪里填写

在 Pot 中进入：

```text
偏好设置
→ 服务设置
→ 翻译
→ 程序员划词翻译
→ 打开该插件配置
```

填写字段：

```text
Gemini Key 池（设置页明文，# 前缀禁用）
```

单 Key 推荐格式：

```text
主要=<用户本人粘贴真实 Gemini API Key>
```

多 Key 示例：

```text
主要=<KEY_1>
备用=<KEY_2>
#停用=<KEY_3>
```

注意：

- Pot 设置页可能明文显示 Key；
- 用户必须亲自粘贴 Key；
- 本地 AI 不得要求用户把 Key 发到聊天；
- 不得读取、复制、复述、截图或记录 Key；
- 不得输出 Key 尾号；
- 名称“主要/备用”只用于本地辨认，不发送给 Google。

## 4. 首次测试推荐配置

```text
输出格式：完整分析
Gemini 语义增强：仅本地未知词
Gemini Key 池：主要=<用户本人粘贴>
单次最多尝试不同 Key 数：1
Gemini 模型：Gemini 3.5 Flash-Lite（默认）
自定义 Gemini 模型 ID：留空
Gemini 发送范围：仅 token（默认）
```

首次设置 `maxKeyAttempts=1`，避免因错误配置触发多个 Key 请求。

## 5. 本地 AI 权限边界

### 允许

- 拉取固定 SHA；
- 运行现有自动化测试；
- 下载指定 Artifact；
- 安装 `.potext`；
- 指导用户打开 Pot 设置页；
- 等待用户自己粘贴 Key；
- 执行少量 GUI 查询；
- 只读检查 `gemini_state.db` 表结构和非敏感状态；
- 回传脱敏后的日志、结果与截图。

### 禁止

- 修改、格式化或自动修复代码；
- commit、push、建分支、建 PR、转 Ready 或合并；
- 使用真实 API 跑自动化测试；
- 循环、并发、压力或配额测试；
- 要求用户发送 Key；
- 打印 Pot 配置文件；
- 输出完整请求头；
- 上传 `gemini_state.db`；
- 把 Key 写进 `.env`、脚本、命令行、临时文件、终端历史、截图或报告；
- 在失败后无上限重试。

## 6. 验证顺序

### 6.1 仓库确认

```powershell
git fetch origin
git checkout main
git reset --hard 0e5bcf1dd96cba504f527f80744281926f5bab2e
git rev-parse HEAD
git status --short
```

如果工作区有用户未提交内容，停止，不执行 `reset --hard`，先回报。

### 6.2 自动化回归

```powershell
python scripts/test_dictionary_build.py
python scripts/build_runtime.py
node --test tests/*.test.cjs
```

预期：

```text
dictionary builder fixture test passed
generated main.js from 4 fragments
JavaScript：60 pass / 0 fail
```

这些测试必须全部使用 mock 网络，不调用真实 Gemini API。

### 6.3 安装 Artifact

```text
Pot → 偏好设置 → 服务设置 → 翻译 → 添加外部插件 → 安装外部插件
```

选择解压后的：

```text
plugin.com.elio.programmer-selection-translator.potext
```

将“程序员划词翻译”加入翻译服务列表。

### 6.4 用户填写 Key

本地 AI 提示用户进入插件配置页后停止操作，由用户本人完成 Key 粘贴和保存。

用户完成后只回复：

```text
已填写并保存
```

不得回复 Key 内容。

### 6.5 AI 关闭基线

```text
Gemini 语义增强：关闭
```

测试：

```text
translate_service_list
getIPv6Address
```

预期：本地结果完整，无“AI 语义增强”。

### 6.6 unknown_only 本地命中

```text
Gemini 语义增强：仅本地未知词
```

测试：

```text
translate_service_list
```

预期：本地全部命中，不出现“AI 语义增强”。

### 6.7 真实 API 成功

测试：

```text
elioSemanticProbeToken
```

预期：

```text
本地结果完整
AI 语义增强：……
AI 未知词：……
```

再测试一次：

```text
elioRoutingProbeToken
```

总成功请求建议不超过 2 次。

禁止使用：

- 公司名称；
- 真实项目名称；
- 文件路径；
- 源码行；
- 客户信息；
- 账号或聊天内容；
- 任何其他敏感文本。

### 6.8 失败回退

优先断网测试：

1. 保持 Key 不变；
2. 临时断开网络；
3. 查询 `elioOfflineProbeToken`；
4. 等待本地结果；
5. 恢复网络。

预期：完整本地回退，无白屏、无 Key 泄漏。

### 6.9 状态数据库

关闭 Pot 后，在 Pot 用户数据目录中搜索：

```text
gemini_state.db
```

只读确认表：

```text
gemini_key_state
gemini_scheduler_state
```

允许字段：

```text
fingerprint
status
cooldown_until
rate_limit_count
last_success_at
updated_at
active_fingerprint
```

不得出现：

```text
api_key
key_tail
input
prompt
response
model_output
```

fingerprint 应为 64 位十六进制 SHA-256。不得上传数据库文件。

## 7. 停止条件

以下任一情况出现时立即停止：

- Key 出现在输出、日志、截图或终端；
- Pot 白屏或崩溃；
- 本地结果被远端失败删减；
- 连续两次真实请求失败；
- HTTP 400/404；
- HTTP 401/403 且用户确认 Key 有效；
- HTTP 429；
- 单次逻辑请求超过约 30 秒；
- 状态数据库出现敏感字段。

不得继续点击重试掩盖问题。

## 8. 测试后恢复

1. 将“Gemini 语义增强”恢复为“关闭”，除非用户要求保持启用；
2. 用户自行决定是否清空 Key 池；
3. 本地 AI 不读取或导出 Key；
4. 不删除 `gemini_state.db`；
5. 确认仓库仍为 Clean；
6. 按任务文档模板回传结果。

## 9. 可直接发送给本地 AI 的指令

```text
你现在接手“程序员划词翻译”插件的 Gemini 真实 API 与 Pot GUI 只读烟测。

仓库：
https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection

固定测试版本：
- 分支：main
- SHA：0e5bcf1dd96cba504f527f80744281926f5bab2e
- Actions Run：30270627215
- Artifact ID：8654645803
- Artifact：plugin.com.elio.programmer-selection-translator.potext
- Digest：sha256:d0d81592a63687dd6232556813ce3b4b60bb0375914085d7a7615c67f1382724

先读取：
1. AGENTS.md
2. docs/planning/gemini-real-api-pot-smoke-test-plan.md
3. docs/tasks/gemini-real-api-pot-smoke-test-tasks.md
4. docs/handoffs/gemini-real-api-pot-smoke-test-handoff.md

你的职责只限验证。禁止修改代码、格式化、自动修复、commit、push、建分支、建 PR、合并或转 Ready。

真实 Gemini API 只能由用户本人在 Pot 设置页填写 Key 后进行少量人工 GUI 烟测。禁止要求用户把 Key 发到聊天，禁止读取、复制、打印、截图、记录或回显完整 Key及 Key 尾号。禁止把 Key 写入仓库、.env、脚本、命令行、临时文件、日志或截图。禁止用真实 API 跑自动化测试、循环测试、并发测试或压力测试。

API Key 填写位置：
Pot → 偏好设置 → 服务设置 → 翻译 → 程序员划词翻译 → 配置 → “Gemini Key 池（设置页明文，# 前缀禁用）”。

单 Key 格式：
主要=<由用户本人粘贴真实 Key>

首次设置：
- Gemini 语义增强：仅本地未知词
- 单次最多尝试不同 Key 数：1
- Gemini 模型：Gemini 3.5 Flash-Lite（默认）
- 自定义模型 ID：留空
- Gemini 发送范围：仅 token
- 输出格式：完整分析

严格执行任务清单：
1. 固定 SHA 与工作区确认；
2. 运行 Python 和 60 项 JavaScript mock 测试；
3. 安装指定 Artifact；
4. 检查设置字段与默认值；
5. 用户本人填写 Key；
6. aiMode=off 测试 translate_service_list、getIPv6Address；
7. unknown_only 本地命中测试 translate_service_list；
8. 真实 API 测试 elioSemanticProbeToken，最多再测一次 elioRoutingProbeToken；
9. 断网测试 elioOfflineProbeToken，确认完整本地回退；
10. 关闭 Pot 后只读检查 gemini_state.db 的表、字段、记录数量和 64 位 SHA-256 fingerprint；
11. 恢复 aiMode=off，并按模板回传脱敏报告。

不要使用公司名称、项目名称、文件路径、源码行、客户信息、账号或聊天内容作为真实 API 输入。

出现 Key 泄漏、Pot 白屏/崩溃、本地结果被覆盖、连续两次失败、400/404、有效 Key 返回 401/403、429、超过约 30 秒或状态库出现敏感字段时，立即停止，不得继续重试。

最终只回传脱敏结果、状态码、输出和状态库字段，不得回传真实 Key、Key 尾号、完整请求头、数据库文件或含 Key 的截图。
```
