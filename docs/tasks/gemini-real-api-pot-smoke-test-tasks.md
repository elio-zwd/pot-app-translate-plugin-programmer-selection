# Gemini 真实 API 与 Pot GUI 烟测任务清单

## 0. 执行原则

- 本地 AI 只负责验证，不修改代码；
- 禁止提交、push、建分支、建 PR、合并或自动修复；
- 真实 Gemini API 只允许少量人工 GUI 烟测；
- 真实 API Key 必须由用户本人在 Pot 设置页粘贴；
- 不得要求用户在聊天中发送 Key；
- 不得读取、复制、打印、截图、记录或回显完整 Key及尾号；
- 所有自动化测试继续使用 mock 网络，不调用真实 Gemini API。

## 1. 固定信息

```text
仓库：https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection
目标分支：main
目标 SHA：0e5bcf1dd96cba504f527f80744281926f5bab2e
验证 Artifact Run：30270627215
Artifact ID：8654645803
Artifact 名称：plugin.com.elio.programmer-selection-translator.potext
Artifact digest：sha256:d0d81592a63687dd6232556813ce3b4b60bb0375914085d7a7615c67f1382724
```

## 2. 仓库只读确认

- [ ] 执行 `git fetch origin`；
- [ ] checkout `main`；
- [ ] reset 到固定 SHA；
- [ ] 确认 `git rev-parse HEAD` 等于固定 SHA；
- [ ] 确认 `git status --short` 无输出；
- [ ] 不执行任何会修改仓库的命令。

建议命令：

```powershell
git fetch origin
git checkout main
git reset --hard 0e5bcf1dd96cba504f527f80744281926f5bab2e
git rev-parse HEAD
git status --short
```

若本地有未提交内容，立即停止，不得使用 `reset --hard` 覆盖用户工作；先原样回报。

## 3. 自动化回归测试

这些测试不使用真实 API：

```powershell
python scripts/test_dictionary_build.py
python scripts/build_runtime.py
node --test tests/*.test.cjs
```

- [ ] Python 词典 fixture 测试退出码 0；
- [ ] 运行时生成退出码 0；
- [ ] JavaScript 测试 60 项通过、0 项失败；
- [ ] 确认测试输出没有真实 Key；
- [ ] 确认测试使用 mock 网络。

注意：`python scripts/build_runtime.py` 会重新生成仓库内的 `main.js`。执行后必须检查 `git status --short`；若产生差异，只报告，不提交、不格式化、不自动修复。固定版本正常情况下应无差异。

## 4. Artifact 安装

- [ ] 从 Run `30270627215` 下载 Artifact `8654645803`；
- [ ] 确认 Artifact digest；
- [ ] 解压外层 ZIP，获得 `.potext`；
- [ ] 不把 API Key 写入 `.potext` 或解压目录；
- [ ] 在 Pot 中安装插件：

```text
偏好设置 → 服务设置 → 翻译 → 添加外部插件 → 安装外部插件
```

- [ ] 将“程序员划词翻译”加入翻译服务列表；
- [ ] 记录 Pot 版本与 Windows 版本。

## 5. 设置页字段确认

进入：

```text
偏好设置 → 服务设置 → 翻译 → 程序员划词翻译 → 配置
```

确认存在：

- [ ] 输出格式；
- [ ] 本地词典显示；
- [ ] 标识符类型；
- [ ] 缩写格式；
- [ ] Gemini 语义增强；
- [ ] Gemini Key 池（设置页明文，# 前缀禁用）；
- [ ] 单次最多尝试不同 Key 数；
- [ ] Gemini 模型；
- [ ] 自定义 Gemini 模型 ID；
- [ ] Gemini 发送范围。

默认值确认：

- [ ] Gemini 语义增强：关闭；
- [ ] 单次最多尝试不同 Key 数：5（默认）；
- [ ] Gemini 模型：Gemini 3.5 Flash-Lite；
- [ ] Gemini 发送范围：仅 token；
- [ ] 不存在旧的单 `apiKey` 和自由 `model` 配置项。

不得截取包含 Key 输入框内容的截图。

## 6. 用户填写 API Key

本地 AI 只提示用户操作，不接触 Key 内容。

用户本人填写：

```text
Gemini Key 池（设置页明文，# 前缀禁用）
```

推荐单 Key 格式：

```text
主要=<用户本人粘贴真实 Key>
```

首次烟测设置：

```text
Gemini 语义增强：仅本地未知词
单次最多尝试不同 Key 数：1
Gemini 模型：Gemini 3.5 Flash-Lite（默认）
自定义 Gemini 模型 ID：留空
Gemini 发送范围：仅 token（默认）
输出格式：完整分析
```

- [ ] 用户确认已自行粘贴并保存；
- [ ] 本地 AI 不复述 Key；
- [ ] 不截图设置页；
- [ ] 不读取 Pot 配置文件中的 Key。

## 7. 场景 A：AI 关闭基线

设置：

```text
Gemini 语义增强：关闭
```

输入：

```text
translate_service_list
getIPv6Address
```

- [ ] 返回本地拆分、编程含义、普通词义和命名转换；
- [ ] 不出现“AI 语义增强”；
- [ ] 不显示远端错误；
- [ ] Pot 无白屏、无崩溃。

## 8. 场景 B：unknown_only 本地命中

设置：

```text
Gemini 语义增强：仅本地未知词
```

输入：

```text
translate_service_list
```

- [ ] 本地全部命中；
- [ ] 不出现“AI 语义增强”；
- [ ] 不因已配置 Key 而强制远端增强；
- [ ] 本地结果与场景 A 一致。

## 9. 场景 C：真实 API 成功路径

输入一个无敏感信息的人工 token：

```text
elioSemanticProbeToken
```

- [ ] 本地结果完整保留；
- [ ] 末尾出现“AI 语义增强”；
- [ ] 出现“AI 未知词”；
- [ ] 返回内容与输入 token 相关；
- [ ] 不显示 Key、请求头、URL 查询参数或异常堆栈；
- [ ] 请求在合理时间内完成；
- [ ] 记录脱敏输出。

再执行一次：

```text
elioRoutingProbeToken
```

- [ ] 第二次仍成功；
- [ ] 无需重启 Pot；
- [ ] 不再继续进行更多真实 API 请求。

真实成功路径总请求次数建议不超过 2 次。

## 10. 场景 D：失败完整回退

优先采用断网验证：

1. 保持已填写 Key；
2. 临时断开网络；
3. 输入：

```text
elioOfflineProbeToken
```

4. 等待结果；
5. 恢复网络。

- [ ] 返回完整本地结果；
- [ ] 不出现“AI 语义增强”；
- [ ] 不白屏、不崩溃；
- [ ] 不泄漏 Key；
- [ ] 不连续重试；
- [ ] 总等待不超过设计的全局截止时间附近。

若连续两次失败，立即停止，不得重复点击制造更多请求。

## 11. 场景 E：状态数据库检查

关闭 Pot 后，在 Pot 用户数据目录内搜索：

```text
gemini_state.db
```

只读检查：

- [ ] 实际路径；
- [ ] 文件大小；
- [ ] 表 `gemini_key_state`；
- [ ] 表 `gemini_scheduler_state`；
- [ ] 字段 `fingerprint`；
- [ ] 字段 `status`；
- [ ] 字段 `cooldown_until`；
- [ ] 字段 `rate_limit_count`；
- [ ] 字段 `last_success_at`；
- [ ] 字段 `updated_at`；
- [ ] 字段 `active_fingerprint`；
- [ ] fingerprint 为 64 位十六进制字符串；
- [ ] 不存在明文 Key；
- [ ] 不存在 `key_tail`；
- [ ] 不存在用户输入、prompt、response 或 model output 字段。

允许使用本机已有 SQLite 只读工具；不得安装不明来源工具，不得上传数据库，不得修改数据库。

## 12. 可选场景：多 Key 与禁用语法

只有用户明确要求且拥有两个自己管理的 Key 时执行。

填写：

```text
主要=<KEY_1>
备用=<KEY_2>
```

- [ ] 两个 Key 均由用户本人粘贴；
- [ ] 不记录名称对应的 fingerprint；
- [ ] `maxKeyAttempts=1` 时正常成功；
- [ ] 将备用行改为 `#备用=<KEY_2>` 后仍可由主要 Key 成功；
- [ ] 不通过高频请求制造 429；
- [ ] 不强制执行 401/403 切换；
- [ ] 不超过额外 2 次真实请求。

## 13. 停止条件

出现以下情况立即停止并回报：

- [ ] 完整 Key 出现在输出、日志、截图或终端；
- [ ] Pot 白屏、崩溃或服务配置损坏；
- [ ] 本地结果被 Gemini 失败覆盖；
- [ ] 连续两次真实请求失败；
- [ ] 返回 400/404；
- [ ] 返回 401/403 且用户确认 Key 有效；
- [ ] 返回 429；
- [ ] 请求超过 30 秒仍无结果；
- [ ] 状态库出现敏感字段。

不得自动修复，必须保留脱敏后的原始错误信息。

## 14. 测试后恢复

- [ ] 将“Gemini 语义增强”恢复为“关闭”，除非用户要求继续启用；
- [ ] 用户自行决定是否清空 Key 池；
- [ ] 不读取或导出 Key；
- [ ] 不删除或修改仓库文件；
- [ ] 不自动删除 `gemini_state.db`；
- [ ] 再次确认仓库工作区 Clean；
- [ ] 输出最终报告。

## 15. 最终报告模板

```text
一、固定版本
- 仓库：
- HEAD：
- Artifact Run / ID：
- Windows：
- Pot：

二、自动化测试
- dictionary builder：
- build runtime：
- JavaScript：pass / fail：
- 工作区最终状态：

三、设置页检查
- 字段完整性：
- 默认值：
- Key 是否由用户本人填写：是/否
- 是否发生 Key 暴露：是/否

四、GUI 场景
- AI 关闭：通过/失败
- unknown_only 本地命中：通过/失败
- 真实 API 成功：通过/失败/跳过
- 第二次成功：通过/失败/跳过
- 断网回退：通过/失败/跳过
- 多 Key 可选场景：通过/失败/跳过

五、状态数据库
- 找到路径：
- 表名：
- 字段名：
- 记录数：
- 是否仅保存指纹与状态：
- 是否发现敏感字段：

六、脱敏输出
- 输入：
- 本地结果是否完整：
- 是否出现 AI 语义增强：
- 错误类型/HTTP 状态：

七、结论
- 是否达到真实 API 烟测通过标准：
- 是否建议继续使用：
- 是否需要新修复 PR：

八、禁止内容确认
- 未输出真实 Key：是/否
- 未输出 Key 尾号：是/否
- 未输出完整请求头：是/否
- 未上传数据库：是/否
- 未修改或提交代码：是/否
```
