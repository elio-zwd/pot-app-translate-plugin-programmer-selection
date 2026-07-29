const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const plugin = require('../main.js');
const TEST_KEY = 'test-gemini-key-not-real';

const DICTIONARY_ROWS = Object.fromEntries([
    ['write', '写入'], ['read', '读取'], ['parse', '解析'], ['value', '值'],
    ['check', '检查'], ['packet', '数据包'], ['count', '计数'], ['address', '地址'],
    ['data', '数据']
].map(([word, translation]) => [word, {
    word,
    lemma: word,
    phonetic: word,
    translation: `v. ${translation}`,
    pos: 'v:100'
}]));

function interactionResponse(payload) {
    return {
        ok: true,
        status: 200,
        data: {
            status: 'completed',
            steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(payload) }] }]
        }
    };
}

function createOptions({ aiMode = 'off', fetchImpl, rows = DICTIONARY_ROWS, config = {} } = {}) {
    const state = { networkCalls: 0, requests: [], closeCalls: 0 };
    const options = {
        setResult() {},
        config: {
            outputStyle: 'report',
            dictionaryMode: 'both',
            identifierType: 'auto',
            acronymStyle: 'standard',
            showNamingConversions: 'show',
            showStatusMessages: 'show',
            aiMode,
            apiKeyPool: aiMode === 'off' ? '' : TEST_KEY,
            maxKeyAttempts: 'v1',
            modelPreset: 'gemini-3.5-flash-lite',
            customModel: '',
            sendScope: 'unknown_tokens',
            ...config
        },
        utils: {
            Database: {
                async load(databasePath) {
                    if (databasePath.includes('gemini_state.db')) throw new Error('测试使用内存状态库');
                    return {
                        async select(_sql, params) {
                            return params.map((word) => rows[word]).filter(Boolean);
                        },
                        async close() {
                            state.closeCalls += 1;
                        }
                    };
                }
            },
            geminiStateStore: plugin.createMemoryGeminiStateStore(),
            geminiNow: () => 1000,
            http: { Body: { json(payload) { return { type: 'Json', payload }; } } },
            async tauriFetch(url, request) {
                state.networkCalls += 1;
                state.requests.push({ url, request });
                if (fetchImpl) return fetchImpl(url, request, state);
                return interactionResponse({ translatedWords: {}, semanticDescription: '默认测试语义' });
            }
        }
    };
    return { options, state };
}

function explanationMap(result) {
    return new Map((result.explanations || []).map((item) => [item.trait, item.explains]));
}

function requestSemanticPayload(state, index = 0) {
    return JSON.parse(state.requests[index].request.body.payload.input);
}

test('复合类型、字节序和数字协议保持完整 token', () => {
    assert.deepEqual(plugin.splitIdentifier('NFC_WriteU16LE'), ['NFC', 'write', 'U16', 'LE']);
    assert.deepEqual(plugin.splitIdentifier('ReadS32BE'), ['read', 'S32', 'BE']);
    assert.deepEqual(plugin.splitIdentifier('WriteU8'), ['write', 'U8']);
    assert.deepEqual(plugin.splitIdentifier('ParseU24Value'), ['parse', 'U24', 'value']);
    assert.deepEqual(plugin.splitIdentifier('CRC16Check'), ['CRC16', 'check']);
    assert.deepEqual(plugin.splitIdentifier('getIPv6Address'), ['get', 'IPv6', 'address']);
    assert.deepEqual(plugin.splitIdentifier('ST25DV_i2c_WriteData'), ['ST25DV', 'I2C', 'write', 'data']);
});

test('支持大小写、下划线、短横线和连续大写变体', () => {
    assert.deepEqual(plugin.splitIdentifier('writeu16le'), ['write', 'U16', 'LE']);
    assert.deepEqual(plugin.splitIdentifier('Writeu16le'), ['write', 'U16', 'LE']);
    assert.deepEqual(plugin.splitIdentifier('WRITE_U16_LE'), ['WRITE', 'U16', 'LE']);
    assert.deepEqual(plugin.splitIdentifier('read-s32-be'), ['read', 'S32', 'BE']);
    assert.deepEqual(plugin.splitIdentifier('PARSEF32BEVALUE'), ['parse', 'F32', 'BE', 'value']);
});

test('不跨分隔符合并类型并保护普通单词反例', () => {
    assert.deepEqual(plugin.splitIdentifier('WRITE_U_16_LE'), ['WRITE', 'u', '16', 'LE']);
    assert.deepEqual(plugin.splitIdentifier('unit16'), ['unit', '16']);
    assert.deepEqual(plugin.splitIdentifier('culture16'), ['culture', '16']);
    assert.deepEqual(plugin.splitIdentifier('customu16value'), ['customu', '16', 'value']);
    assert.deepEqual(plugin.splitIdentifier('beValue'), ['be', 'value']);
    assert.deepEqual(plugin.splitIdentifier('backend'), ['backend']);
    assert.deepEqual(plugin.splitIdentifier('LEBuffer'), ['LE', 'buffer']);
});

test('覆盖第一版全部固定宽度类型', () => {
    const expected = {
        U8: '8 位无符号整数', U16: '16 位无符号整数', U24: '24 位无符号整数',
        U32: '32 位无符号整数', U64: '64 位无符号整数',
        S8: '8 位有符号整数', S16: '16 位有符号整数', S24: '24 位有符号整数',
        S32: '32 位有符号整数', S64: '64 位有符号整数',
        I8: '8 位有符号整数', I16: '16 位有符号整数', I32: '32 位有符号整数', I64: '64 位有符号整数',
        F32: '32 位浮点数', F64: '64 位浮点数'
    };
    for (const [token, gloss] of Object.entries(expected)) {
        assert.equal(plugin.parseFixedWidthTypeToken(token).gloss, gloss, token);
        assert.equal(plugin.parseFixedWidthTypeToken(token.toLowerCase()).canonical, token, token);
    }
    assert.equal(plugin.parseFixedWidthTypeToken('U12'), null);
    assert.equal(plugin.parseFixedWidthTypeToken('unit16'), null);
});

test('本地确定性语序符合目标', () => {
    const cases = {
        NFC_WriteU16LE: '以小端序向 NFC 设备写入 16 位无符号整数',
        ReadS32BE: '读取大端序 32 位有符号整数',
        WriteU8: '写入 8 位无符号整数',
        ParseU24Value: '解析 24 位无符号整数值',
        CRC16Check: 'CRC16 校验',
        RxBufLen: '接收缓冲区长度',
        TxPacketCount: '发送数据包计数',
        getIPv6Address: '获取 IPv6 地址',
        ST25DV_i2c_WriteData: 'ST25DV I2C 写入数据'
    };
    for (const [input, expected] of Object.entries(cases)) {
        assert.equal(plugin.programmingPhraseParts(plugin.splitIdentifier(input)).text, expected, input);
    }
});

test('动作前缀和缩写前缀动作词优先识别为函数', () => {
    for (const input of ['ReadS32BE', 'WriteU8', 'ParseU24Value', 'CRC16Check']) {
        const words = plugin.splitIdentifier(input);
        assert.equal(plugin.detectIdentifierType(input, words), 'function', input);
    }
    assert.equal(plugin.detectIdentifierType('RxBufLen', plugin.splitIdentifier('RxBufLen')), 'class');
    assert.equal(plugin.detectIdentifierType('TxPacketCount', plugin.splitIdentifier('TxPacketCount')), 'class');
});

test('Rx 和 Tx 只在通信对象上下文扩展', () => {
    assert.equal(plugin.programmingPhraseParts(plugin.splitIdentifier('RxBufLen')).text, '接收缓冲区长度');
    assert.equal(plugin.programmingPhraseParts(plugin.splitIdentifier('TxPacketCount')).text, '发送数据包计数');
    assert.equal(plugin.expandProgrammingAbbreviation(plugin.splitIdentifier('RxJava'), 0), '');
    assert.equal(plugin.expandProgrammingAbbreviation(plugin.splitIdentifier('RxSwift'), 0), '');
});

test('本地完整识别时 unknown_only 零网络', async () => {
    for (const input of ['NFC_WriteU16LE', 'ReadS32BE', 'RxBufLen', 'TxPacketCount']) {
        const { options, state } = createOptions({ aiMode: 'unknown_only' });
        const result = await plugin.translate(input, 'auto', 'zh_cn', options);
        assert.equal(state.networkCalls, 0, input);
        const rows = explanationMap(result);
        assert.ok(rows.has('本地释义'), input);
        assert.equal(rows.has('AI 释义'), false, input);
    }
});

test('always 每次请求整体语义但单词白名单只包含未知 token', async () => {
    const fullLocal = createOptions({
        aiMode: 'always',
        fetchImpl: async () => interactionResponse({ translatedWords: {}, semanticDescription: '本地技术语义的整体说明。' })
    });
    const result = await plugin.translate('NFC_WriteU16LE', 'auto', 'zh_cn', fullLocal.options);
    assert.equal(fullLocal.state.networkCalls, 1);
    assert.deepEqual(requestSemanticPayload(fullLocal.state).requestedTokens, []);
    assert.deepEqual(requestSemanticPayload(fullLocal.state).contextTokens, ['NFC', 'write', 'U16', 'LE']);
    assert.equal(explanationMap(result).get('AI 释义')[0], '本地技术语义的整体说明。');

    const partial = createOptions({
        aiMode: 'always',
        fetchImpl: async () => interactionResponse({
            translatedWords: { customxyz: '自定义值' },
            semanticDescription: '向 NFC 设备写入自定义相关值。'
        })
    });
    await plugin.translate('NFC_WriteU16LECustomxyz', 'auto', 'zh_cn', partial.options);
    assert.deepEqual(requestSemanticPayload(partial.state).requestedTokens, ['customxyz']);
    assert.deepEqual(requestSemanticPayload(partial.state).contextTokens, ['NFC', 'write', 'U16', 'LE', 'customxyz']);
});

test('AI 不得返回或覆盖本地类型和字节序 token', async () => {
    const { options, state } = createOptions({
        aiMode: 'always',
        fetchImpl: async () => interactionResponse({
            translatedWords: { U16: '错误覆盖', LE: '错误覆盖' },
            semanticDescription: '错误响应。'
        })
    });
    const result = await plugin.translate('NFC_WriteU16LE', 'auto', 'zh_cn', options);
    assert.equal(state.networkCalls, 1);
    const rows = explanationMap(result);
    assert.equal(rows.has('AI 释义'), false);
    assert.equal(rows.get('本地释义')[0], '以小端序向 NFC 设备写入 16 位无符号整数');
    assert.doesNotMatch(JSON.stringify(result), /错误覆盖/);
});

test('Pot 原生结果固定展示本地技术词义和命名转换', async () => {
    const { options, state } = createOptions({ aiMode: 'off' });
    const result = await plugin.translate('NFC_WriteU16LE', 'auto', 'zh_cn', options);
    const rows = explanationMap(result);
    assert.equal(rows.get('词语拆分')[0], 'NFC · write · U16 · LE');
    assert.equal(rows.get('本地释义')[0], '以小端序向 NFC 设备写入 16 位无符号整数');
    assert.match(rows.get('词义')[0], /NFC：近场通信/);
    assert.match(rows.get('词义')[0], /U16：16 位无符号整数/);
    assert.match(rows.get('词义')[0], /LE：小端序/);
    assert.match(rows.get('常用命名')[0], /小驼峰：nfcWriteU16Le/);
    assert.match(rows.get('分隔命名')[0], /下划线：nfc_write_u16_le/);
    assert.equal(state.closeCalls, 0);
});

test('显示开关、命名转换和 Pot eval 加载继续兼容', async () => {
    const { options } = createOptions({
        config: { showNamingConversions: 'hide', showStatusMessages: 'hide' }
    });
    const result = await plugin.translate('ReadS32BE', 'auto', 'zh_cn', options);
    const rows = explanationMap(result);
    assert.equal(rows.has('常用命名'), false);
    assert.equal(rows.has('分隔命名'), false);
    assert.equal(rows.has('常量命名'), false);
    assert.equal(Object.hasOwn(result, 'associations'), false);

    assert.equal(plugin.toCamelCase(plugin.splitIdentifier('NFC_WriteU16LE')), 'nfcWriteU16Le');
    assert.equal(plugin.toSnakeCase(plugin.splitIdentifier('NFC_WriteU16LE')), 'nfc_write_u16_le');

    const script = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    const pluginTranslate = vm.runInNewContext(`${script}\ntranslate`, { setTimeout, clearTimeout, unescape, encodeURIComponent });
    assert.equal(typeof pluginTranslate, 'function');
});
