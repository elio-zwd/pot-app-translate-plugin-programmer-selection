const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {
    analyzeIdentifier,
    splitIdentifier,
    tokenizeChinese,
    detectIdentifierType,
    toCamelCase,
    toPascalCase,
    toSnakeCase,
    toScreamingSnakeCase,
    translate
} = require('../main.js');

const SAMPLE_ROWS = {
    translate: {
        word: 'translate', lemma: 'translate', phonetic: "træns'leit",
        translation: 'v. 翻译；转化；解释', pos: 'v:100'
    },
    service: {
        word: 'service', lemma: 'service', phonetic: "'sɜːvɪs",
        translation: 'n. 服务；服役；公共事业\nv. 维修；检修', pos: 'n:80/v:20'
    },
    services: {
        word: 'services', lemma: 'service', phonetic: "'sɜːvɪs",
        translation: 'n. 服务；服役；公共事业\nv. 维修；检修', pos: 'n:80/v:20'
    },
    list: {
        word: 'list', lemma: 'list', phonetic: 'list',
        translation: 'n. 清单；目录；列表\nv. 列出；登记', pos: 'n:70/v:30'
    },
    apple: {
        word: 'apple', lemma: 'apple', phonetic: "'æpl",
        translation: 'n. 苹果；苹果树', pos: 'n:100'
    },
    hello: {
        word: 'hello', lemma: 'hello', phonetic: "hə'ləʊ",
        translation: 'int. 你好；喂', pos: 'int:100'
    }
};

function createDictionaryOptions(rows = SAMPLE_ROWS) {
    const state = { closed: 0, loads: 0, lastPath: '' };
    return {
        state,
        options: {
            utils: {
                Database: {
                    async load(databasePath) {
                        state.loads += 1;
                        state.lastPath = databasePath;
                        return {
                            async select(_sql, params) {
                                return params.map((key) => rows[key]).filter(Boolean);
                            },
                            async close() {
                                state.closed += 1;
                            }
                        };
                    }
                }
            }
        }
    };
}

test('拆分 camelCase', () => {
    assert.deepEqual(splitIdentifier('getUserName'), ['get', 'user', 'name']);
});

test('保护连续大写缩写', () => {
    assert.deepEqual(splitIdentifier('HTTPRequestCode'), ['HTTP', 'request', 'code']);
    assert.deepEqual(splitIdentifier('HTTPServer'), ['HTTP', 'server']);
    assert.deepEqual(splitIdentifier('HTTPSClient'), ['HTTPS', 'client']);
});

test('处理 MCU 风格混合标识符', () => {
    assert.deepEqual(splitIdentifier('ST25DV_i2c_WriteData'), ['ST25DV', 'I2C', 'write', 'data']);
});

test('保护带数字的嵌入缩写', () => {
    assert.deepEqual(splitIdentifier('ST25DVConfig'), ['ST25DV', 'config']);
    assert.deepEqual(splitIdentifier('getST25DVUID'), ['get', 'ST25DV', 'UID']);
    assert.deepEqual(splitIdentifier('IPv6Address'), ['IPv6', 'address']);
    assert.deepEqual(splitIdentifier('getIPv6Address'), ['get', 'IPv6', 'address']);
    assert.deepEqual(splitIdentifier('I2CAddress'), ['I2C', 'address']);
    assert.deepEqual(splitIdentifier('i2cAddress'), ['I2C', 'address']);
    assert.deepEqual(splitIdentifier('RS485Frame'), ['RS485', 'frame']);
});

test('不会围绕已知子串拆开更大的未知缩写', () => {
    assert.deepEqual(splitIdentifier('RAIIHelper'), ['RAII', 'helper']);
});

test('处理已知缩写旁的数字', () => {
    assert.deepEqual(splitIdentifier('parseJSON2Object'), ['parse', 'JSON', '2', 'object']);
});

test('转换多种命名风格', () => {
    const words = ['get', 'HTTP', 'response', 'code'];
    assert.equal(toCamelCase(words), 'getHttpResponseCode');
    assert.equal(toCamelCase(words, 'preserve'), 'getHTTPResponseCode');
    assert.equal(toPascalCase(words), 'GetHttpResponseCode');
    assert.equal(toSnakeCase(words), 'get_http_response_code');
    assert.equal(toScreamingSnakeCase(words), 'GET_HTTP_RESPONSE_CODE');
});

test('支持常见中文命名描述', () => {
    assert.deepEqual(tokenizeChinese('读取用户配置').words, ['read', 'user', 'config']);
    assert.equal(
        analyzeIdentifier('读取用户配置', { identifierType: 'function', outputStyle: 'camel' }),
        'readUserConfig'
    );
    assert.match(analyzeIdentifier('读取用户配置'), /识别类型：函数名/);
});

test('布尔变量模式添加前缀', () => {
    assert.equal(
        analyzeIdentifier('连接成功', { identifierType: 'boolean', outputStyle: 'camel' }),
        'isConnectionSuccessful'
    );
});

test('识别常见嵌入式 C 函数模式', () => {
    for (const input of ['ST25DV_i2c_WriteData', 'FreeRTOS_TaskInit', 'UART_IRQHandler', 'HAL_GPIO_EXTI_Callback']) {
        assert.equal(detectIdentifierType(input, splitIdentifier(input)), 'function', input);
    }
});

test('不会把后置名词动作词误判为函数', () => {
    assert.match(analyzeIdentifier('最大 UART 重试次数'), /识别类型：变量名/);
    assert.equal(detectIdentifierType('maxRetryCount', splitIdentifier('maxRetryCount')), 'variable');
});

test('生成完整本地分析报告', () => {
    const report = analyzeIdentifier('retryFailedCharacters');
    assert.match(report, /识别类型：函数名/);
    assert.match(report, /编程含义：重试失败角色/);
    assert.match(report, /camelCase：retryFailedCharacters/);
    assert.match(report, /snake_case：retry_failed_characters/);
});

test('缩写与中文之间保持可读空格', () => {
    assert.match(analyzeIdentifier('ST25DV_i2c_WriteData'), /编程含义：ST25DV I2C 写入数据/);
});

test('组合编程术语与 ECDICT 词义', async () => {
    const { options, state } = createDictionaryOptions();
    const result = await translate('translate_service_list', 'auto', 'zh_cn', {
        ...options,
        config: { dictionaryMode: 'both', outputStyle: 'report' }
    });
    assert.match(result, /编程含义：翻译服务列表/);
    assert.match(result, /普通词义：/);
    assert.match(result, /translate .*：v\. 翻译/);
    assert.match(result, /service .*：n\. 服务/);
    assert.match(result, /list .*：n\. 清单/);
    assert.equal(state.loads, 1);
    assert.equal(state.closed, 1);
    assert.match(state.lastPath, /plugin\.com\.elio\.programmer-selection-translator\/dictionary\.db$/);
});

test('仅显示普通英语词典释义', async () => {
    const { options } = createDictionaryOptions();
    const result = await translate('apple', 'en', 'zh_cn', {
        ...options,
        config: { dictionaryMode: 'general', outputStyle: 'report' }
    });
    assert.doesNotMatch(result, /编程含义：/);
    assert.match(result, /普通词义：/);
    assert.match(result, /apple .*：n\. 苹果/);
});

test('显示词形原型', async () => {
    const { options } = createDictionaryOptions();
    const result = await translate('services', 'en', 'zh_cn', {
        ...options,
        config: { dictionaryMode: 'general', outputStyle: 'chinese' }
    });
    assert.match(result, /原形：service/);
});

test('明确报告未知词而不把英文冒充中文', async () => {
    const { options } = createDictionaryOptions();
    const result = await translate('helloWorld', 'en', 'zh_cn', {
        ...options,
        config: { dictionaryMode: 'both', outputStyle: 'report' }
    });
    assert.match(result, /组合含义：你好 world/);
    assert.match(result, /world：未收录/);
    assert.match(result, /未收录英文：world/);
});

test('数据库不可用时保留编程翻译', async () => {
    const result = await translate('translate_service_list', 'auto', 'zh_cn', {
        config: { dictionaryMode: 'both', outputStyle: 'report' }
    });
    assert.match(result, /编程含义：翻译服务列表/);
    assert.match(result, /词典提示：普通英语词典未加载/);
});

test('仅转换命名风格时不打开数据库', async () => {
    const result = await translate('translate_service_list', 'auto', 'zh_cn', {
        config: { outputStyle: 'camel' },
        utils: {
            Database: {
                async load() {
                    throw new Error('dictionary should not be loaded');
                }
            }
        }
    });
    assert.equal(result, 'translateServiceList');
});

test('通过 Pot 使用的 eval 入口契约加载', async () => {
    const script = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    const pluginTranslate = vm.runInNewContext(`${script}\ntranslate`);
    assert.equal(typeof pluginTranslate, 'function');
    const { options } = createDictionaryOptions();
    const result = await pluginTranslate('getHTTPResponseCode', 'auto', 'zh_cn', {
        ...options,
        config: { dictionaryMode: 'both' }
    });
    assert.match(result, /HTTP/);
    assert.match(result, /响应码/);
});

test('生成入口不包含 Lingva 模板逻辑', () => {
    const script = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.doesNotMatch(script, /lingva/i);
    assert.doesNotMatch(script, /requestPath/);
    assert.doesNotMatch(script, /plugin\.com\.pot-app\.lingva/);
    assert.match(script, /plugin\.com\.elio\.programmer-selection-translator/);
});
