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

function createPotOptions({ aiMode = 'off', fetchImpl, databaseRows = DICTIONARY_ROWS } = {}) {
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
                aiMode,
                apiKeyPool: aiMode === 'off' ? '' : TEST_KEY,
                maxKeyAttempts: 'v1',
                modelPreset: 'gemini-3.5-flash-lite',
                customModel: '',
                sendScope: 'unknown_tokens'
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

test('Pot 原生报告采用方案 B 的完整中文布局', async () => {
    const { options } = createPotOptions();
    const result = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);
    const rows = explanationMap(result);

    assert.equal(rows.get('文件名')[0], 'gemini-real-api-pot-smoke-test');
    assert.equal(rows.get('词语拆分')[0], 'gemini · real · API · pot · smoke · test');
    assert.equal(rows.get('本地释义')[0], 'Gemini 真实 API Pot 冒烟测试');
    assert.deepEqual(splitNativeLines(rows.get('本地词义')[0]), [
        "real /'ri:əl/：真实的、实际的",
        'smoke test：冒烟测试',
        'API：应用程序编程接口'
    ]);
    assert.deepEqual(splitNativeLines(rows.get('常用命名')[0]), [
        '小驼峰：geminiRealApiPotSmokeTest',
        '大驼峰：GeminiRealApiPotSmokeTest'
    ]);
    assert.deepEqual(splitNativeLines(rows.get('分隔命名')[0]), [
        '下划线：gemini_real_api_pot_smoke_test',
        '短横线：gemini-real-api-pot-smoke-test'
    ]);
    assert.equal(rows.get('常量命名')[0], '大写下划线：GEMINI_REAL_API_POT_SMOKE_TEST');
    assert.equal(rows.has('AI 解释'), false);
    assert.match((result.associations || []).join('\n'), /AI 状态：已关闭，仅显示本地结果/);
});

test('本地词义只保留最多三项高价值内容', async () => {
    const { options } = createPotOptions({
        databaseRows: {
            ...DICTIONARY_ROWS,
            gemini: { word: 'gemini', lemma: 'gemini', phonetic: '', translation: 'n. 双子座', pos: 'n:100' },
            pot: { word: 'pot', lemma: 'pot', phonetic: 'pɒt', translation: 'n. 锅；罐', pos: 'n:100' }
        }
    });
    const result = await plugin.translate('gemini-real-api-pot-smoke-test', 'auto', 'zh_cn', options);
    const rows = explanationMap(result);
    const items = splitNativeLines(rows.get('本地词义')[0]);

    assert.equal(items.length, 3);
    assert.deepEqual(items, [
        "real /'ri:əl/：真实的、实际的",
        'smoke test：冒烟测试',
        'API：应用程序编程接口'
    ]);
    assert.doesNotMatch(items.join('\n'), /双子座|锅|未收录/);
});

test('Pot 原生报告只显示 AI 整体解释并保留本地结果', async () => {
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
    assert.equal(rows.get('本地释义')[0], 'Gemini 真实 API Pot 冒烟测试');
    assert.equal(rows.get('AI 解释')[0], '用于验证 Gemini 真实 API 在 Pot 插件中的基本连通性与功能可用性。');
    assert.equal(rows.has('AI 补充'), false);
    assert.doesNotMatch(JSON.stringify(result), /Gemini 模型|Pot 应用|词语补充/);
    assert.doesNotMatch((result.associations || []).join('\n'), /AI 状态：已关闭/);
});

test('设置页使用中文命名选项并明确 AI 翻译方式', () => {
    const info = JSON.parse(fs.readFileSync(path.join(__dirname, '../info.json'), 'utf8'));
    const needs = new Map(info.needs.map((item) => [item.key, item]));

    assert.equal(needs.get('outputStyle').options.camel, '小驼峰命名');
    assert.equal(needs.get('outputStyle').options.pascal, '大驼峰命名');
    assert.equal(needs.get('outputStyle').options.snake, '下划线命名');
    assert.equal(needs.get('aiMode').display, 'AI 翻译方式');
    assert.match(needs.get('aiMode').options.off, /仅使用本地结果/);
    assert.match(needs.get('aiMode').options.unknown_only, /智能补全/);
    assert.match(needs.get('aiMode').options.always, /与本地结果同时显示/);
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
