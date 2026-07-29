# 本地复合缩写与数据类型语义解析任务清单

## A. 基线与文档

- [x] 合并已验收的 PR #5；
- [x] 从 `main@ec5948083060cc7878be7637fef9b1e35980f8fa` 创建功能分支；
- [x] 保存 Plan；
- [x] 保存 Task；
- [x] 保存交接文档。

## B. 拆分与解析

- [x] 新增固定宽度整数、浮点类型解析纯函数；
- [x] 新增字节序解析纯函数；
- [x] 在单个原始 chunk 内合并 `U + 16` 等连续片段；
- [x] 不跨下划线、空格或短横线把 `U_16` 合并为 `U16`；
- [x] 新增 `CRC8/CRC16/CRC32` 完整缩写保护；
- [x] 保持 `IPv4/IPv6/UTF8/RS232/RS485/I2C/ST25DV` 保护；
- [x] 验证 `unit16`、`culture16`、`customu16value` 反例。

## C. 本地词义与语序

- [x] 为类型 token 生成固定中文词义；
- [x] 为相邻类型后的 `LE/BE` 生成固定中文词义；
- [x] 支持 `Buf/Len/Cfg/Addr/Ptr/Idx/Cnt/Num/Seq/Tmp/Src/Dst`；
- [x] 对 `Rx/Tx` 增加通信对象上下文限制；
- [x] 实现 Read/Write/Parse 类型模板；
- [x] 实现通信缩写写入类型模板；
- [x] 实现 CRC Check 模板；
- [x] 保持普通顺序组合可预测且无猜测。

## D. 类型判断

- [x] 动作词前缀优先于 PascalCase 类名判断；
- [x] 缩写前缀加动作词优先于 PascalCase 类名判断；
- [x] 不强行把 `RxBufLen`、`TxPacketCount` 判为变量。

## E. AI 边界

- [x] 技术 token 不进入 `unknownWords`；
- [x] `unknown_only` 本地完整命中零网络；
- [x] `always` 每次可生成整体语义，但只允许未知 token 进入 `requestedTokens`；
- [x] AI 返回本地类型、字节序或缩写键时验证失败；
- [x] Gemini 失败完整回退；
- [x] 不修改 Key 池、模型路由和 Interactions API 主流程。

## F. 自动化测试

### 正例

- [x] `NFC_WriteU16LE`；
- [x] `ReadS32BE`；
- [x] `WriteU8`；
- [x] `ParseU24Value`；
- [x] `CRC16Check`；
- [x] `RxBufLen`；
- [x] `TxPacketCount`；
- [x] `getIPv6Address`；
- [x] `ST25DV_i2c_WriteData`；
- [x] 大小写、下划线、短横线和连续大写变体；
- [x] 全部支持的数据类型枚举；
- [x] 全部程序员缩写固定词义。

### 反例

- [x] `unit16`；
- [x] `culture16`；
- [x] `customu16value`；
- [x] `beValue`；
- [x] `backend`；
- [x] `LEBuffer`；
- [x] `RxJava`；
- [x] `RxSwift`；
- [x] 未知组合继续保留并交给 AI。

### 回归

- [x] 中文转英文标识符零网络；
- [x] 命名格式转换保持；
- [x] Pot `eval()` 加载；
- [x] Pot 原生结果格式；
- [x] 显示开关；
- [x] 词典连接池复用；
- [x] API Key 泄漏扫描；
- [x] Artifact 六文件结构。

## G. PR 与交付

- [x] 提交实现与测试；
- [x] 创建 Draft PR #6，Base 为 `main`；
- [x] Run #134 完整 GitHub Actions 首轮通过；
- [x] 首轮 JavaScript 测试 `80/80` 通过；
- [x] 首轮 Artifact `8709403719` 下载与六文件检查通过；
- [x] 首轮敏感信息、旧 API 与模板残留扫描通过；
- [x] 补充全部程序员缩写显式测试；
- [ ] 等待最终文档提交后的最新 GitHub Actions；
- [ ] 下载并检查最终 Head 对应 `.potext` Artifact；
- [x] 输出 Pot GUI 烟测步骤；
- [ ] 用户执行 Pot GUI 烟测并回传结果；
- [x] 保持 Draft，未经授权不合并。