# 程序员划词翻译

Programmer Selection Translator 是一个面向程序员的 Pot 外部翻译插件，用于拆分、解释和转换函数名、变量名、类名、常量、文件名，也可以离线查询普通英文单词的中文释义。

- 插件 ID：`plugin.com.elio.programmer-selection-translator`
- Homepage：`https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection`
- 许可证：GPL-3.0-only

## 第一层能力

当前第一层完全本地运行，不发送选中文本或代码：

- 拆分 `camelCase`、`PascalCase`、`snake_case`、`SCREAMING_SNAKE_CASE`、`kebab-case`；
- 保护连续大写和带数字缩写，如 `HTTP`、`IPv6`、`I2C`、`RS485`、`ST25DV`；
- 识别函数名、变量名、布尔变量、类名、常量/宏和文件名；
- 使用内置编程术语与编程短语生成上下文中文含义；
- 使用 ECDICT 离线数据库补充普通词义、音标和词形原型；
- 支持常见中文描述转英文标识符；
- 数据库不可用时保留内置编程词典结果；
- 最终命名格式由本地规则生成。

## 示例

输入：

```text
translate_service_list
```

输出重点：

```text
编程含义：翻译服务列表
普通词义：
- translate /.../：v. 翻译；转化；解释
- service /.../：n. 服务；服役；公共事业
- list /.../：n. 清单；目录；列表
```

其他推荐输入：

```text
getIPv6Address
ST25DV_i2c_WriteData
apple
services
helloWorld
读取用户配置
连接是否成功
```

`services` 会尽量显示 `service` 作为原形；未知词会明确标记为“未收录”，不会把英文原样冒充中文释义。

## 配置

### 输出格式

- 完整分析
- `camelCase`
- `PascalCase`
- `snake_case`
- `SCREAMING_SNAKE_CASE`
- `kebab-case`
- 拆分词组
- 仅中文含义

### 本地词典显示

- 编程术语 + 普通词义
- 仅编程术语优先
- 仅普通英语词典

### 标识符类型

- 自动判断
- 函数名
- 变量名
- 布尔变量
- 类名
- 常量/宏
- 文件名

### 缩写格式

- 标准驼峰：`getHTTPResponse` 转为 `getHttpResponse`
- 保留大写：`getHTTPResponse` 保持 `getHTTPResponse`

只有“完整分析”和“仅中文含义”需要读取普通英语数据库；单纯转换命名风格不会打开数据库。

## 安装

1. 打开本仓库的 **Actions** 页面。
2. 进入 `Programmer Selection Translator` 工作流。
3. 下载 `plugin.com.elio.programmer-selection-translator.potext` Artifact。
4. 解压 GitHub Artifact 外层 ZIP，得到同名 `.potext` 文件。
5. 在 Pot 中打开：`偏好设置 → 服务设置 → 翻译 → 添加外部插件 → 安装外部插件`。
6. 选择 `.potext`，保存配置，并将“程序员划词翻译”加入翻译服务列表。

## ECDICT 数据来源与隐私

普通英语数据来自 MIT 许可的 ECDICT，构建固定使用提交：

```text
bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b
```

完整数据源文件为 `ecdict.csv`。GitHub Actions 下载固定版本并生成 `dictionary.db`；数据库是构建产物，不提交到 Git。许可和转换说明见 `THIRD_PARTY_NOTICES.md`。

第一层运行时：

- 不访问 ECDICT 网站；
- 不发送网络请求；
- 不上传代码、标识符或查询记录；
- 只读取插件目录内的 `dictionary.db`。

## 本地开发与测试

要求 Node.js 18+ 和 Python 3.10+。

```bash
npm test
python scripts/test_dictionary_build.py
```

`npm test` 会先把 `src/runtime-*.js` 合成为 Pot 要求的单文件 `main.js`，再运行 JavaScript 单元测试和 Pot `eval()` 加载契约测试。

构建完整离线词典：

```bash
curl -L --fail \
  -o /tmp/ecdict.csv \
  https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv

python scripts/build_dictionary.py \
  --input /tmp/ecdict.csv \
  --output dictionary.db \
  --meta dictionary.meta.json \
  --source-commit bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b
```

最终 `.potext` 根目录只包含：

```text
main.js
info.json
icon.svg
dictionary.db
dictionary.meta.json
THIRD_PARTY_NOTICES.md
```

## Gemini 第二层

Gemini 语义增强在独立分支开发，必须保持本地优先和完整回退。设计边界见 `GEMINI-HANDOFF.md`。

Pot 通用外部插件配置页可能以普通输入框展示配置值。Gemini 第二层启用后，**Gemini API Key 在 Pot 插件设置页面可能以明文显示**；本仓库不会提交、记录或打包用户的 Key。

## 已知限制

- 标识符中文组合采用本地规则，不等同于完整句子机器翻译；
- 一个英文词可能有多种含义，普通模式展示 ECDICT 的前两行释义；
- 自动类型判断是启发式规则，特殊函数可手动选择类型；
- 第一层处理单个标识符、短词组或单词，不重构完整源代码。
