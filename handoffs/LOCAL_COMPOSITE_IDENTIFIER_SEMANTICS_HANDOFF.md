# 本地复合缩写与数据类型语义解析交接

## 仓库与分支

- 仓库：`https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection`
- 分支：`feat/local-composite-identifier-semantics`
- Base：`main`
- Base SHA：`ec5948083060cc7878be7637fef9b1e35980f8fa`
- 前置 PR：#5 已合并。

## 必读顺序

1. 根目录 `README.md`；
2. 根目录 `AGENTS.md`；
3. `plans/LOCAL_COMPOSITE_IDENTIFIER_SEMANTICS_PLAN.md`；
4. `tasks/LOCAL_COMPOSITE_IDENTIFIER_SEMANTICS_TASKS.md`；
5. 当前分支真实源码、测试和工作流。

## 当前代码链路

- `src/runtime-01.js`：缩写表、标识符拆分、类型判断、本地词典、命名格式；
- `src/runtime-02-gemini.js`：unknown token 筛选、AI 请求上下文、响应白名单；
- `src/runtime-03-gemini-key-pool.js`：Key 池与状态；
- `src/runtime-04-gemini-interactions.js`：Interactions API；
- `src/runtime-05-pot-native-report.js`：Pot 词典连接池和本地组合语义覆盖；
- `src/runtime-06-compact-native-report.js`：Pot 原生紧凑结果渲染。

`main.js` 由 `scripts/build_runtime.py` 按 `src/runtime-*.js` 文件名排序生成，不提交生成文件。

## 已确认设计

- 类型：`U8/U16/U24/U32/U64`、`S8/S16/S24/S32/S64`、`I8/I16/I32/I64`、`F32/F64`；
- 字节序：仅在类型后识别 `LE/BE`；
- 数字协议：新增 `CRC8/CRC16/CRC32` 完整保护；
- 缩写：`Buf/Len/Cfg/Addr/Ptr/Idx/Cnt/Num/Seq/Tmp/Src/Dst`；
- `Rx/Tx` 只在通信对象上下文识别；
- 语序只使用有限确定性模板；
- `always` 可每次请求整体语义，但 AI 单词白名单只包含本地未知 token；
- 动作词和缩写前缀动作词优先于 PascalCase 类名判断；
- `RxBufLen`、`TxPacketCount` 不强行判为变量。

## 禁止事项

- 不修改或弱化 PR #5 的连接池修复；
- 不让 AI 覆盖本地类型、字节序和缩写；
- 不修改 Key 池、模型路由、Interactions API 或状态库，除非真实测试证明必须；
- 不调用真实 Gemini API；
- 不提交真实 API Key、`.env`、`dictionary.db`、`gemini_state.db` 或生成后的 `main.js`；
- 不引入新的运行时第三方依赖；
- 不转换新 PR 为 Ready，不合并新 PR。

## 验收重点

必须验证：

```text
NFC_WriteU16LE
ReadS32BE
WriteU8
ParseU24Value
CRC16Check
RxBufLen
TxPacketCount
getIPv6Address
ST25DV_i2c_WriteData
```

反例必须包括：

```text
unit16
culture16
customu16value
beValue
backend
LEBuffer
RxJava
RxSwift
```

完整执行：

```bash
npm test
python scripts/test_dictionary_build.py
```

GitHub Actions 必须继续完成固定 ECDICT 构建、运行时审计、Key 泄漏扫描、Pot 打包和 Artifact 上传。

## 本地 AI 只读验证约束

本地 AI 仅允许 fetch、checkout/reset 指定 SHA、运行明确测试、下载 Artifact、安装 `.potext` 和执行 Pot GUI 烟测。禁止修改代码、格式化、提交、push、创建 PR 或自动修复。