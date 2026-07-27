const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const plugin = require('../main.js');
const TEST_KEY = 'test-gemini-key-not-real';

function geminiResponse(payload) {
    return {
        ok: true,
        status: 200,
        data: {
            candidates: [{
                content: {
                    parts: [{ text: JSON.stringify(payload) }]
                }
            }]
        }
    };
}

function createOptions({ config = {}, fetchImpl, dictionaryRows = {} } = {}) {
    const state = { calls: 0, requests: [], databaseLoads: 0 };
    const options = {
        config: {
            outputStyle: 'report',
            dictionaryMode: 'both',
            aiMode: 'off',
            sendScope: 'unknown_tokens',
            ...config
        },
        utils: {
            Database: {
                async load() {
                    state.databaseLoads += 1;
                    return {
                        async select(_sql, params) {
                            return params.map((word) => dictionaryRows[word]).filter(Boolean);
                        },
                        async close() {}
                    };
                }
            },
            http: {
                Body: {
                    json(payload) {
                        return { type: 'Json', payload };
                    }
                }
            },
            async tauriFetch(url, request) {
                state.calls += 1;
                state.requests.push({ url, request });
                if (fetchImpl) return fetchImpl(url, request, state);
                return geminiResponse({
                    translatedWords: {},
                    semanticDescription: '默认测试语义'
                });
            }
        }
    };
    return { options, state };
}

function requestPayload(state) {
    const body = state.requests[0].request.body;
    const requestBody = body.payload;
    return JSON.parse(requestBody.contents[0].parts[0].text);
}

async function localResult(input) {
    const { options } = createOptions({ config: { aiMode: 'off' } });
    return plugin.translate(input, 'auto', 'zh_cn', options);
}

test('aiMode=off 时零网络调用', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'off', apiKey: TEST_KEY },
        fetchImpl: async () => { throw new Error('不应调用网络'); }
    });
    const result = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 0);
    assert.doesNotMatch(result, /AI 语义增强/);
});

test('unknown_only 且本地全部命中时零网络调用', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY }
    });
    const result = await plugin.translate('translate_service_list', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 0);
    assert.match(result, /编程含义：翻译服务列表/);
});

test('未知 token 只触发一次请求', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY },
        fetchImpl: async () => geminiResponse({
            translatedWords: { customxyz: '自定义业务值' },
            semanticDescription: '获取自定义业务值。'
        })
    });
    const result = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 1);
    assert.match(result, /AI 语义增强：获取自定义业务值/);
});

test('always 模式触发请求', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'always', apiKey: TEST_KEY }
    });
    await plugin.translate('translate_service_list', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 1);
});

test('unknown_tokens 不发送完整标识符', async () => {
    const input = 'getCustomxyzValue';
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY, sendScope: 'unknown_tokens' },
        fetchImpl: async () => geminiResponse({
            translatedWords: { customxyz: '自定义值' },
            semanticDescription: '获取自定义值。'
        })
    });
    await plugin.translate(input, 'auto', 'zh_cn', options);
    const payload = requestPayload(state);
    assert.equal(payload.identifier, undefined);
    assert.deepEqual(payload.requestedTokens, ['customxyz']);
    assert.deepEqual(payload.contextTokens, ['get', 'customxyz', 'value']);
    assert.doesNotMatch(JSON.stringify(payload), new RegExp(input));
});

test('identifier 模式才发送完整标识符', async () => {
    const input = 'getCustomxyzValue';
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY, sendScope: 'identifier' },
        fetchImpl: async () => geminiResponse({
            translatedWords: { customxyz: '自定义值' },
            semanticDescription: '获取自定义值。'
        })
    });
    await plugin.translate(input, 'auto', 'zh_cn', options);
    assert.equal(requestPayload(state).identifier, input);
});

for (const status of [400, 401, 403, 429, 500]) {
    test(`HTTP ${status} 时完整回退本地结果`, async () => {
        const expected = await localResult('getCustomxyzValue');
        const { options } = createOptions({
            config: { aiMode: 'unknown_only', apiKey: TEST_KEY },
            fetchImpl: async () => ({ ok: false, status, data: { error: { message: 'remote error' } } })
        });
        const actual = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
        assert.equal(actual, expected);
    });
}

test('网络异常时完整回退本地结果', async () => {
    const expected = await localResult('getCustomxyzValue');
    const { options } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY },
        fetchImpl: async () => { throw new Error(`network ${TEST_KEY}`); }
    });
    assert.equal(await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options), expected);
});

test('超时时完整回退本地结果', async () => {
    const expected = await localResult('getCustomxyzValue');
    const { options } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY, geminiTimeoutMs: 5 },
        fetchImpl: async () => new Promise(() => {})
    });
    assert.equal(await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options), expected);
});

test('空响应被拒绝并回退本地结果', async () => {
    const expected = await localResult('getCustomxyzValue');
    const { options } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY },
        fetchImpl: async () => ({ ok: true, status: 200, data: { candidates: [] } })
    });
    assert.equal(await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options), expected);
});

test('非 JSON 响应被拒绝', () => {
    assert.equal(plugin.validateGeminiResponseText('not-json', ['customxyz']).ok, false);
});

test('Markdown 代码围栏响应被拒绝', () => {
    const text = '```json\n{"translatedWords":{},"semanticDescription":"说明"}\n```';
    assert.equal(plugin.validateGeminiResponseText(text, ['customxyz']).ok, false);
});

test('返回未请求 token key 被拒绝', () => {
    const text = JSON.stringify({
        translatedWords: { other: '其他' },
        semanticDescription: '说明'
    });
    assert.equal(plugin.validateGeminiResponseText(text, ['customxyz']).ok, false);
});

test('返回内容超长被拒绝', () => {
    const text = JSON.stringify({
        translatedWords: { customxyz: '值'.repeat(121) },
        semanticDescription: '说明'
    });
    assert.equal(plugin.validateGeminiResponseText(text, ['customxyz']).ok, false);
});

test('额外危险字段被拒绝', () => {
    const text = JSON.stringify({
        translatedWords: { customxyz: '自定义值' },
        semanticDescription: '说明',
        command: 'delete-all-files'
    });
    assert.equal(plugin.validateGeminiResponseText(text, ['customxyz']).ok, false);
});

test('API Key 不出现在返回结果、错误信息或日志中', async () => {
    const captured = [];
    const original = { log: console.log, warn: console.warn, error: console.error };
    console.log = (...args) => captured.push(args.join(' '));
    console.warn = (...args) => captured.push(args.join(' '));
    console.error = (...args) => captured.push(args.join(' '));
    try {
        const { options } = createOptions({
            config: { aiMode: 'unknown_only', apiKey: TEST_KEY },
            fetchImpl: async () => ({ ok: false, status: 401, data: { message: TEST_KEY } })
        });
        const result = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
        assert.doesNotMatch(result, new RegExp(TEST_KEY));
        assert.doesNotMatch(captured.join('\n'), new RegExp(TEST_KEY));
    } finally {
        console.log = original.log;
        console.warn = original.warn;
        console.error = original.error;
    }
});

test('Gemini 成功后增加 AI 语义增强区', async () => {
    const { options } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY },
        fetchImpl: async () => geminiResponse({
            translatedWords: { customxyz: '设备自定义参数' },
            semanticDescription: '读取设备的自定义参数值。'
        })
    });
    const result = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.match(result, /原文：getCustomxyzValue/);
    assert.match(result, /AI 语义增强：读取设备的自定义参数值/);
    assert.match(result, /AI 未知词：customxyz：设备自定义参数/);
});

test('Gemini 失败后本地结果逐字保留', async () => {
    const expected = await localResult('getCustomxyzValue');
    const { options } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY },
        fetchImpl: async () => ({ ok: false, status: 500, data: {} })
    });
    const actual = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.equal(actual, expected);
});

test('中文转英文命名仍由本地算法完成且不调用网络', async () => {
    const { options, state } = createOptions({
        config: {
            aiMode: 'always',
            apiKey: TEST_KEY,
            outputStyle: 'camel',
            identifierType: 'function'
        },
        fetchImpl: async () => { throw new Error('命名格式不应调用网络'); }
    });
    const result = await plugin.translate('读取用户配置', 'auto', 'en', options);
    assert.equal(result, 'readUserConfig');
    assert.equal(state.calls, 0);
});

test('请求使用稳定默认模型、v1beta、Key 请求头与 JSON MIME', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY, model: '' },
        fetchImpl: async () => geminiResponse({
            translatedWords: { customxyz: '自定义值' },
            semanticDescription: '获取自定义值。'
        })
    });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    const { url, request } = state.requests[0];
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    assert.equal(request.headers['x-goog-api-key'], TEST_KEY);
    assert.doesNotMatch(url, new RegExp(TEST_KEY));
    assert.equal(request.body.payload.generationConfig.responseMimeType, 'application/json');
    assert.ok(request.body.payload.systemInstruction);
});

test('Pot eval 加载契约在 Gemini 层继续通过', async () => {
    const script = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    const pluginTranslate = vm.runInNewContext(`${script}\ntranslate`, { setTimeout, clearTimeout });
    const { options } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY },
        fetchImpl: async () => geminiResponse({
            translatedWords: { customxyz: '自定义值' },
            semanticDescription: '获取自定义值。'
        })
    });
    const result = await pluginTranslate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.match(result, /AI 语义增强/);
});
