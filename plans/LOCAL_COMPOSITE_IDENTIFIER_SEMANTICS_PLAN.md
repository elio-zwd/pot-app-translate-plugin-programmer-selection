# 本地复合缩写与数据类型语义解析计划

## 1. 基线

- 仓库：`https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection`
- 功能分支：`feat/local-composite-identifier-semantics`
- Base：`main`
- Base SHA：`ec5948083060cc7878be7637fef9b1e35980f8fa`
- 前置 PR：#5 已合并；保留 Pot 原生结果布局、共享词典连接池修复、显示开关与完整本地回退。

## 2. 目标

在第一层本地解析中确定性识别固定宽度数据类型、字节序、数字协议组合和常用程序员缩写，减少 `NFC_WriteU16LE`、`ReadS32BE`、`RxBufLen` 等标识符对 Gemini 的依赖。

目标示例：

```text
NFC_WriteU16LE → 以小端序向 NFC 设备写入 16 位无符号整数
ReadS32BE      → 读取大端序 32 位有符号整数
RxBufLen       → 接收缓冲区长度
```

## 3. 实现边界

### 3.1 固定位宽类型

第一版只支持完整 token 边界：

- `U8/U16/U24/U32/U64`：无符号整数；
- `S8/S16/S24/S32/S64`：有符号整数；
- `I8/I16/I32/I64`：有符号整数；
- `F32/F64`：浮点数。

不在普通单词内部搜索类型片段，不把 `unit16`、`culture16`、`customu16value` 误识别为数据类型。

### 3.2 字节序

- `LE`：小端序；
- `BE`：大端序。

仅当其紧邻已识别的固定宽度类型时生效。`beValue`、`backend`、`LEBuffer` 不按字节序处理。

### 3.3 数字协议组合

新增完整缩写保护：

- `CRC8`；
- `CRC16`；
- `CRC32`。

继续保护现有 `IPv4`、`IPv6`、`UTF8`、`RS232`、`RS485`、`I2C`、`ST25DV` 等缩写。

### 3.4 程序员缩写

完整 token 支持：

- `Buf` 缓冲区；
- `Len` 长度；
- `Cfg` 配置；
- `Addr` 地址；
- `Ptr` 指针；
- `Idx` 索引；
- `Cnt` 计数；
- `Num` 数量；
- `Seq` 序号；
- `Tmp` 临时；
- `Src` 源；
- `Dst` 目标。

`Rx/Tx` 仅在相邻 token 是通信数据对象时解释为“接收/发送”，避免把 `RxJava`、`RxSwift` 等 ReactiveX 名称误判。

### 3.5 确定性语序

只实现可测试模板：

- `Read + 类型 + 可选字节序`；
- `Write + 类型 + 可选字节序`；
- `Parse + 类型 + Value`；
- `通信缩写 + Write + 类型 + 可选字节序`；
- `CRC8/16/32 + Check`；
- 程序员缩写按固定词义顺序组合。

不推断标识符中不存在的 CRC 参数、累计状态、当前状态或设备类型。

## 4. 架构方案

解析规则与显示规则分离：

1. 拆分阶段保留完整复合技术 token；
2. 纯函数解析 token 为结构化技术语义；
3. 本地语义构建器按有限模板生成中文；
4. 普通词义层为技术 token 提供固定词义；
5. 技术 token 不进入 `unknownWords`；
6. Gemini 只能补仍未知的 token。

建议纯函数：

```text
parseFixedWidthTypeToken()
parseEndianToken()
expandProgrammingAbbreviation()
localTechnicalGloss()
buildTypedOperationDescription()
```

## 5. AI 保护策略

- `aiMode=off`：零网络；
- `unknown_only` 本地完整识别：零网络；
- `always` 仍可请求整体 AI 释义，但 `requestedTokens` 只包含本地未知 token；
- 数据类型、位宽、字节序、已知缩写只作为上下文，不允许 AI 返回替代词义；
- Gemini 失败时逐字保留完整本地结果；
- 不修改 Key 池、模型路由、Interactions API、重试与状态库主流程。

## 6. 自动类型判断

将已有动作前缀和“缩写前缀 + 动作词”判断移到 PascalCase 类名判断之前：

- `ReadS32BE`、`WriteU8`、`ParseU24Value` 识别为函数；
- `CRC16Check` 识别为函数；
- `RxBufLen`、`TxPacketCount` 不强行改为变量，继续保留启发式边界或由用户手动指定。

## 7. 兼容性

必须保持：

- Pot `eval()` 加载；
- 输入长度上限 500；
- 中文转英文标识符；
- 所有命名格式转换；
- PR #5 的 Pot 原生结果格式；
- 显示命名转换和状态提示开关；
- 共享词典连接池不被关闭；
- 无新运行时第三方依赖；
- Artifact 固定六文件结构；
- API Key 不进入输出、日志、异常、快照或 Artifact。

## 8. 交付

1. 保存 Plan、Task、交接文档；
2. 实现纯函数和本地语义路径；
3. 增加单元、Gemini、Pot 原生和回归测试；
4. 创建 Draft PR；
5. 等待 GitHub Actions 全部通过；
6. 下载并检查 `.potext` Artifact；
7. 输出 Pot GUI 烟测步骤；
8. 未经用户明确授权不得转 Ready 或合并。