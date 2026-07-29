# 本地复合缩写与数据类型语义解析任务清单

## A. 基线与文档

- [x] 合并已验收的 PR #5；
- [x] 从 `main@ec5948083060cc7878be7637fef9b1e35980f8fa` 创建功能分支；
- [x] 保存 Plan；
- [x] 保存 Task；
- [x] 保存交接文档。

## B. 拆分与解析

- [ ] 新增固定宽度整数、浮点类型解析纯函数；
- [ ] 新增字节序解析纯函数；
- [ ] 在单个原始 chunk 内合并 `U + 16` 等连续片段；
- [ ] 不跨下划线、空格或短横线把 `U_16` 合并为 `U16`；
- [ ] 新增 `CRC8/CRC16/CRC32` 完整缩写保护；
- [ ] 保持 `IPv4/IPv6/UTF8/RS232/RS485/I2C/ST25DV` 保护；
- [ ] 验证 `unit16`、`culture16`、`customu16value` 反例。

## C. 本地词义与语序

- [ ] 为类型 token 生成固定中文词义；
- [ ] 为相邻类型后的 `LE/BE` 生成固定中文词义；
- [ ] 支持 `Buf/Len/Cfg/Addr/Ptr/Idx/Cnt/Num/Seq/Tmp/Src/Dst`；
- [ ] 对 `Rx/Tx` 增加通信对象上下文限制；
- [ ] 实现 Read/Write/Parse 类型模板；
- [ ] 实现通信缩写写入类型模板；
- [ ] 实现 CRC Check 模板；
- [ ] 保持普通顺序组合可预测且无猜测。

## D. 类型判断

- [ ] 动作词前缀优先于 PascalCase 类名判断；
- [ ] 缩写前缀加动作词优先于 PascalCase 类名判断；
- [ ] 不强行把 `RxBufLen`、`TxPacketCount` 判为变量。

## E. AI 边界

- [ ] 技术 token 不进入 `unknownWords`；
- [ ] `unknown_only` 本地完整命中零网络；
- [ ] `always` 每次可生成整体语义，但只允许未知 token 进入 `requestedTokens`；
- [ ] AI 返回本地类型、字节序或缩写键时验证失败；
- [ ] Gemini 失败完整回退；
- [ ] 不修改 Key 池、模型路由和 Interactions API 主流程。

## F. 自动化测试

### 正例

- [ ] `NFC_WriteU16LE`；
- [ ] `ReadS32BE`；
- [ ] `WriteU8`；
- [ ] `ParseU24Value`；
- [ ] `CRC16Check`；
- [ ] `RxBufLen`；
- [ ] `TxPacketCount`；
- [ ] `getIPv6Address`；
- [ ] `ST25DV_i2c_WriteData`；
- [ ] 大小写、下划线、短横线和连续大写变体；
- [ ] 全部支持的数据类型枚举。

### 反例

- [ ] `unit16`；
- [ ] `culture16`；
- [ ] `customu16value`；
- [ ] `beValue`；
- [ ] `backend`；
- [ ] `LEBuffer`；
- [ ] `RxJava`；
- [ ] `RxSwift`；
- [ ] 未知组合继续保留并交给 AI。

### 回归

- [ ] 中文转英文标识符零网络；
- [ ] 命名格式转换保持；
- [ ] Pot `eval()` 加载；
- [ ] Pot 原生结果格式；
- [ ] 显示开关；
- [ ] 词典连接池复用；
- [ ] API Key 泄漏扫描；
- [ ] Artifact 六文件结构。

## G. PR 与交付

- [ ] 提交实现与测试；
- [ ] 创建 Draft PR，Base 为 `main`；
- [ ] 跑完整 GitHub Actions；
- [ ] 检查 Job 结果；
- [ ] 下载并检查 `.potext` Artifact；
- [ ] 输出 Pot GUI 烟测步骤；
- [ ] 保持 Draft，未经授权不合并。