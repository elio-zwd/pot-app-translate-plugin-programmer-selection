const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const plugin = require('../main.js');

const TEST_KEY = 'test-gemini-key-not-real';

const DICTIONARY_ROWS = {
    real: {
        word: 'real', lemma: 'real', phonetic: "'ri:əl",
        translation: 'a. 真实的；实际的', pos: 'a:100'
    },
    smoke: {
        word: 'smoke', lemma: 'smoke', phonetic: 'sməuk',
        translation: 'n. 烟；烟雾\nv. 冒烟', pos: 'n:70/v:30'
    },
    test: {
        word: 'test', lemma: 'test', phonetic: 'test',
        translation: 'n. 测试；试验\nv. 测试', pos: 'n:70/v:30'
    }
};

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

function createPotOptions({ aiMode = 'off', fetchImpl, databaseRows = DICTIONARY_ROWS, config = {} } = {}) {
    const state = { closeCalls: 0, selectCalls: 0, networkCalls: 0 };
    let closed = false;
    const sharedDictionaryDb = {
        async select(_sql, params) {
            if (closed) throw new Error('attempted to acquire a connection on a closed pool');
            state.selectCalls += 1;
            return params.map((word) => databaseRows[word]).filter(Boolean);
        },
        async close() {
            closed = true;
            state.closeCalls += 1;
        }
    };

    return {
        state,
        options: {
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
                        if (databasePath.includes('gemini_state.db')) {
                            throw new Error('测试使用内存状态库');
                        }
                        return sharedDictionaryDb;
                    }
                },
                geminiStateStore: plugin.createMemoryGeminiStateStore(),
                geminiNow: () => 1000,
                http: {
                    Body: {
                        json(payload) {
                            return { type: 'Json', payload };
                        }
                    }
                },
                async tauriFetch(url, request) {
                    state.networkCalls += 1;
                    if (fetchImpl) return fetchImpl(url, request);
                    return interactionResponse({ translatedWords: {}, semanticDescription: '默认测试语义' });
                }
            }
        }
    };
}

function explanationMap(result) {
    return new Map((result.explanations || []).map((item) => [item.trait, item.explains]));
}

function splitNativeLines(value) {
    return String(value || '').split(plugin.COMPACT_NATIVE_LINE_SEPARATOR);
}

test('Pot 运行时复用词典连接池且不会主动关闭', async () => {
    const { options, state } = createPotOptions();

    const first = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);
    const second = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);

    assert.equal(typeof first, 'object');
    assert.equal(typeof second, 'object');
    assert.equal(state.selectCalls, 2);
    assert.equal(state.closeCalls, 0);
    assert.doesNotMatch(JSON.stringify(second), /closed pool/);
});

test('AI 关闭时回退本地释义并逐词展示音标和未收录项', async () => {
    const { options } = createPotOptions();
    const result = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);
    const rows = explanationMap(result);

    assert.equal(rows.get('文件名')[0], 'gemini-real-api-pot-smoke-test');
    assert.equal(rows.get('词语拆分')[0], 'gemini · real · API · pot · smoke · test');
    assert.equal(rows.get('本地释义')[0], 'Gemini 真实 API Pot 冒烟测试');
    assert.equal(rows.has('AI 释义'), false);
    assert.deepEqual(splitNativeLines(rows.get('词义')[0]), [
        'gemini：未收录',
        "real /'ri:əl/：真实的、实际的",
        'API：应用程序编程接口',
        'pot：未收录',
        'smoke /sməuk/：烟、烟雾、冒烟',
        'test /test/：测试、试验、测试'
    ]);
    assert.match((result.associations || []).join('\n'), /AI 状态：已关闭，仅显示本地结果/);
});

test('minimal 和 report 在旧 Pot 中返回同一完整紧凑原生报告', async () => {
    const results = [];
    for (const outputStyle of ['minimal', 'report']) {
        const { options, state } = createPotOptions({ config: { outputStyle } });
        const result = await plugin.translate('NFC_WriteU16LE', 'auto', 'zh_cn', options);
        const rows = explanationMap(result);

        assert.equal(typeof result, 'object', outputStyle);
        assert.equal(Object.hasOwn(result, 'schema'), false, outputStyle);
        assert.equal(rows.get('函数名')[0], 'NFC_WriteU16LE', outputStyle);
        assert.equal(rows.get('词语拆分')[0], 'NFC · write · U16 · LE', outputStyle);
        assert.equal(rows.get('本地释义')[0], '以小端序向 NFC 设备写入 16 位无符号整数', outputStyle);
        assert.deepEqual(splitNativeLines(rows.get('词义')[0]), [
            'NFC：近场通信',
            'write：未收录',
            'U16：16 位无符号整数',
            'LE：小端序'
        ], outputStyle);
        assert.deepEqual(splitNativeLines(rows.get('常用命名')[0]), [
            '小驼峰：nfcWriteU16Le',
            '大驼峰：NfcWriteU16Le'
        ], outputStyle);
        assert.deepEqual(splitNativeLines(rows.get('分隔命名')[0]), [
            '下划线：nfc_write_u16_le',
            '短横线：nfc-write-u16-le'
        ], outputStyle);
        assert.equal(rows.get('常量命名')[0], '大写下划线：NFC_WRITE_U16_LE', outputStyle);
        assert.equal(state.selectCalls, 1, outputStyle);
        assert.equal(state.closeCalls, 0, outputStyle);
        assert.equal(state.networkCalls, 0, outputStyle);
        results.push(result);
    }

    assert.deepEqual(results[0], results[1]);
});

test('AI 成功时只显示 AI 释义并补全本地未收录词', async () => {
    const { options, state } = createPotOptions({
        aiMode: 'unknown_only',
        fetchImpl: async () => interactionResponse({
            translatedWords: {
                gemini: 'Gemini 模型',
                pot: 'Pot 应用'
            },
            semanticDescription: '用于验证 Gemini 真实 API 在 Pot 插件中的基本连通性与功能可用性。'
        })
    });

    const result = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);
    const rows = explanationMap(result);

    assert.equal(state.networkCalls, 1);
    assert.equal(rows.get('AI 释义')[0], '用于验证 Gemini 真实 API 在 Pot 插件中的基本连通性与功能可用性。');
    assert.equal(rows.has('本地释义'), false);
    assert.equal(rows.has('AI 解释'), false);
    assert.deepEqual(splitNativeLines(rows.get('词义')[0]), [
        'gemini：Gemini 模型〔AI〕',
        "real /'ri:əl/：真实的、实际的",
        'API：应用程序编程接口',
        'pot：Pot 应用〔AI〕',
        'smoke /sməuk/：烟、烟雾、冒烟',
        'test /test/：测试、试验、测试'
    ]);
});

test('部分 AI 补全后只报告剩余未收录词', async () => {
    const { options } = createPotOptions({
        aiMode: 'unknown_only',
        fetchImpl: async () => interactionResponse({
            translatedWords: { gemini: 'Gemini 模型' },
            semanticDescription: 'Gemini API 的 Pot 冒烟测试。'
        })
    });

    const result = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);
    const rows = explanationMap(result);
    const wordLines = splitNativeLines(rows.get('词义')[0]);

    assert.equal(wordLines[0], 'gemini：Gemini 模型〔AI〕');
    assert.equal(wordLines[3], 'pot：未收录');
    assert.match((result.associations || []).join('\n'), /仍未收录：pot/);
});

test('minimal 和 report 都继续支持隐藏命名转换和状态提示', async () => {
    for (const outputStyle of ['minimal', 'report']) {
        const { options } = createPotOptions({
            config: {
                outputStyle,
                showNamingConversions: 'hide',
                showStatusMessages: 'hide'
            }
        });

        const result = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);
        const rows = explanationMap(result);

        assert.equal(rows.has('常用命名'), false, outputStyle);
        assert.equal(rows.has('分隔命名'), false, outputStyle);
        assert.equal(rows.has('常量命名'), false, outputStyle);
        assert.ok(rows.has('词义'), outputStyle);
        assert.equal(Object.hasOwn(result, 'associations'), false, outputStyle);
    }
});

test('设置页包含中文命名、AI 翻译和附加区块显示选项', () => {
    const info = JSON.parse(fs.readFileSync(path.join(__dirname, '../info.json'), 'utf8'));
    const needs = new Map(info.needs.map((item) => [item.key, item]));

    assert.equal(needs.get('outputStyle').options.camel, '小驼峰命名');
    assert.equal(needs.get('outputStyle').options.pascal, '大驼峰命名');
    assert.equal(needs.get('outputStyle').options.snake, '下划线命名');
    assert.equal(needs.get('aiMode').display, 'AI 翻译方式');
    assert.match(needs.get('aiMode').options.unknown_only, /智能补全/);
    assert.equal(needs.get('showNamingConversions').options.hide, '不显示');
    assert.equal(needs.get('showStatusMessages').options.hide, '不显示');
});

test('无 setResult 的兼容调用继续返回可复制纯文本', async () => {
    const { options } = createPotOptions();
    delete options.setResult;

    const result = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);

    assert.equal(typeof result, 'string');
    assert.match(result, /编程含义：Gemini 真实 API Pot 冒烟测试/);
    assert.match(result, /camelCase：geminiRealApiPotSmokeTest/);
});

test('词典异常只显示用户可读状态，不暴露底层连接错误', async () => {
    const { options } = createPotOptions();
    options.utils.Database.load = async () => ({
        async select() {
            throw new Error('attempted to acquire a connection on a closed pool');
        },
        async close() {}
    });

    const result = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);
    const text = JSON.stringify(result);

    assert.match(text, /普通英语词典暂不可用/);
    assert.doesNotMatch(text, /attempted to acquire/);
    assert.match(text, /Gemini 真实 API Pot 冒烟测试/);
});
