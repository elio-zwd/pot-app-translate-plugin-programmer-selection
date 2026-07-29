# 本地复合缩写与数据类型语义解析交接

## 仓库与分支

- 仓库：`https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection`
- 分支：`feat/local-composite-identifier-semantics`
- Draft PR：`https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection/pull/6`
- Base：`main`
- Base SHA：`ec5948083060cc7878be7637fef9b1e35980f8fa`
- 前置 PR：#5 已合并。

## 必读顺序

1. 根目录 `README.md`；
2. 根目录 `AGENTS.md`；
3. `plans/LOCAL_COMPOSITE_IDENTIFIER_SEMANTICS_PLAN.md`；
4. `tasks/LOCAL_COMPOSITE_IDENTIFIER_SEMANTICS_TASKS.md`；
5. 当前分支真实源码、测试和工作流。

## 实现文件

- `src/runtime-07-local-composite-semantics.js`：复合技术 token、类型、字节序、程序员缩写、本地语序、类型判断和 AI 请求白名单覆盖；
- `tests/local-composite-semantics.test.cjs`：核心正例、反例、AI、Pot 原生结果与兼容性测试；
- `tests/local-programming-abbreviations.test.cjs`：全部程序员缩写固定词义测试。

`main.js` 仍由 `scripts/build_runtime.py` 按 `src/runtime-*.js` 文件名排序生成，不提交生成文件。

## 已实现规则

- 类型：`U8/U16/U24/U32/U64`、`S8/S16/S24/S32/S64`、`I8/I16/I32/I64`、`F32/F64`；
- 字节序：仅在已识别类型后解释 `LE/BE`；
- 数字协议：新增 `CRC8/CRC16/CRC32` 完整保护；
- 缩写：`Buf/Len/Cfg/Addr/Ptr/Idx/Cnt/Num/Seq/Tmp/Src/Dst`；
- `Rx/Tx` 只在通信对象上下文识别，`RxJava/RxSwift` 不误判；
- Read/Write/Parse、通信设备写入类型、CRC Check 使用有限确定性模板；
- 动作词和缩写前缀动作词优先于 PascalCase 类名判断；
- `RxBufLen`、`TxPacketCount` 不强行判为变量。

## AI 边界

- `aiMode=off` 零网络；
- `unknown_only` 本地完整命中零网络；
- `always` 可请求整体语义，但 `translatedWords` 白名单只包含本地未知 token；
- 类型、位宽、字节序和本地缩写只作为上下文，不允许 AI 覆盖；
- Gemini 失败完整回退本地结果；
- Key 池、模型路由、Interactions API、重试和状态库主流程未修改。

## 目标输出

```text
NFC_WriteU16LE → 以小端序向 NFC 设备写入 16 位无符号整数
ReadS32BE      → 读取大端序 32 位有符号整数
WriteU8        → 写入 8 位无符号整数
ParseU24Value  → 解析 24 位无符号整数值
CRC16Check     → CRC16 校验
RxBufLen       → 接收缓冲区长度
TxPacketCount  → 发送数据包计数
```

## 首轮自动验证

- PR Head：`0cf99148d1c8afa47d5458e0dfe161d618ba98b3`；
- Actions Run：`30413824108`（Run #134）；
- Job：`90455802684`；
- 结果：`success`；
- JavaScript：`80/80` 通过；
- Python 词典构建 fixture：通过；
- 固定 ECDICT 全量构建、生成运行时审计、Key 泄漏扫描、Pot 打包与上传：通过。

首轮 Artifact：

- ID：`8709403719`；
- 外层大小：`12,595,074` bytes；
- Digest：`sha256:bcb5ea49039f7cce9220290b56c6a5ec5bf4da3ab4695794077667137e0012ae`；
- 内层 `.potext`：`12,591,381` bytes；
- 根目录固定六文件；
- `main.js`：`91,939` bytes；
- `dictionary.db`：`28,745,728` bytes；
- 词典记录：`401,405`；
- 未发现真实 Key、测试 Key、`.env`、`gemini_state.db`、Lingva、`?key=` 或 `generateContent` 残留。

补充缩写测试和文档提交后，以 PR #6 最新 Head 对应的最终 Actions 与 Artifact 为交付依据。

## Pot GUI 烟测步骤

1. 从 PR #6 最新成功 Actions 下载 `plugin.com.elio.programmer-selection-translator.potext` Artifact；
2. 解压 GitHub 外层 ZIP，得到同名 `.potext`；
3. 在 Pot 中安装或覆盖插件；
4. 设置：完整分析、编程术语 + 普通词义、自动判断、AI 关闭；
5. 依次测试：

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

6. 核对拆分、顶部本地释义、逐词词义和命名转换；
7. 反例测试：

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

8. 将 AI 改为“智能补全本地未知词”，确认已完整识别样例不请求 AI；
9. 输入 `NFC_WriteU16LECustomxyz`，确认只补 `customxyz`；
10. 将“显示命名转换”和“显示状态提示”分别关闭，确认对应区块消失；
11. 连续翻译多次，确认不出现词典连接池关闭错误；
12. 原样回传实际输出和异常截图。

## 禁止事项

- 不修改或弱化 PR #5 的连接池修复；
- 不调用真实 Gemini API 做自动化测试；
- 不提交真实 API Key、`.env`、`dictionary.db`、`gemini_state.db` 或生成后的 `main.js`；
- 不引入新的运行时第三方依赖；
- PR #6 保持 Draft；未经用户明确授权不得转 Ready 或合并。

## 本地 AI 只读验证约束

本地 AI 仅允许 fetch、checkout/reset 指定 SHA、运行明确测试、下载 Artifact、安装 `.potext` 和执行 Pot GUI 烟测。禁止修改代码、格式化、提交、push、创建 PR 或自动修复。