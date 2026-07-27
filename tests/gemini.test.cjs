const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const plugin = require('../main.js');
const TEST_KEY = 'test-gemini-key-not-real';
const SECOND_KEY = 'test-gemini-key-two-not-real';

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

function createOptions({ config = {}, fetchImpl, dictionaryRows = {}, stateStore } = {}) {
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
                async load(databasePath) {
                    if (databasePath.includes('gemini_state.db')) throw new Error('测试不使用真实状态数据库');
                    state.databaseLoads += 1;
                    return {
                        async select(_sql, params) {
                            return params.map((word) => dictionaryRows[word]).filter(Boolean);
                        },
                        async close() {}
                    };
                }
            },
            geminiStateStore: stateStore,
            geminiNow: () => 1000,
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
                return interactionResponse({ translatedWords: {}, semanticDescription: '默认测试语义' });
            }
        }
    };
    if (!stateStore) delete options.utils.geminiStateStore;
    return { options, state };
}

function requestBody(state, index = 0) {
    return state.requests[index].request.body.payload;
}

function semanticPayload(state, index = 0) {
    return JSON.parse(requestBody(state, index).input);
}

async function localResult(input) {
    const { options } = createOptions({ config: { aiMode: 'off' } });
    return plugin.translate(input, 'auto', 'zh_cn', options);
}

test('aiMode=off 时零网络且不打开状态库', async () => {
    let initialized = 0;
    const store = { async initialize() { initialized += 1; } };
    const { options, state } = createOptions({
        config: { aiMode: 'off', apiKeyPool: TEST_KEY },
        stateStore: store,
        fetchImpl: async () => { throw new Error('不应调用网络'); }
    });
    const result = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 0);
    assert.equal(initialized, 0);
    assert.doesNotMatch(result, /AI 语义增强/);
});

test('unknown_only 且本地全部命中时零网络调用', async () => {
    const { options, state } = createOptions({ config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY } });
    const result = await plugin.translate('translate_service_list', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 0);
    assert.match(result, /编程含义：翻译服务列表/);
});

test('未知 token 经 Interactions 成功增强', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY },
        fetchImpl: async () => interactionResponse({
            translatedWords: { customxyz: '自定义业务值' },
            semanticDescription: '获取自定义业务值。'
        })
    });
    const result = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 1);
    assert.match(result, /AI 语义增强：获取自定义业务值/);
    assert.match(result, /AI 未知词：customxyz：自定义业务值/);
});

test('unknown_tokens 不发送完整标识符，identifier 模式才发送', async () => {
    const first = createOptions({ config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY, sendScope: 'unknown_tokens' } });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', first.options);
    assert.equal(semanticPayload(first.state).identifier, undefined);
    assert.deepEqual(semanticPayload(first.state).requestedTokens, ['customxyz']);
    assert.deepEqual(semanticPayload(first.state).contextTokens, ['get', 'customxyz', 'value']);

    const second = createOptions({ config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY, sendScope: 'identifier' } });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', second.options);
    assert.equal(semanticPayload(second.state).identifier, 'getCustomxyzValue');
});

test('默认模型、端点、请求头与禁用存储契约正确', async () => {
    const { options, state } = createOptions({ config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY } });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    const { url, request } = state.requests[0];
    const body = requestBody(state);
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(request.headers['x-goog-api-key'], TEST_KEY);
    assert.doesNotMatch(url, new RegExp(TEST_KEY));
    assert.equal(body.model, 'gemini-3.5-flash-lite');
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.equal(body.background, false);
    assert.equal(body.response_format.mime_type, 'application/json');
    assert.equal('temperature' in body.generation_config, false);
});

test('四个预设与合法自定义模型进入 model 字段', async () => {
    for (const modelPreset of plugin.GEMINI_MODEL_PRESETS) {
        const { options, state } = createOptions({ config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY, modelPreset } });
        await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
        assert.equal(requestBody(state).model, modelPreset);
    }
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY, modelPreset: 'custom', customModel: 'gemini-custom_1.0' }
    });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.equal(requestBody(state).model, 'gemini-custom_1.0');
});

test('非法自定义模型零网络并完整回退本地', async () => {
    const expected = await localResult('getCustomxyzValue');
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY, modelPreset: 'custom', customModel: 'models/bad?key=x' }
    });
    assert.equal(await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options), expected);
    assert.equal(state.calls, 0);
});

test('兼容 PR-B 旧 apiKey 与 model 配置', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKey: TEST_KEY, model: 'legacy-model-1' }
    });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 1);
    assert.equal(requestBody(state).model, 'legacy-model-1');
    assert.equal(state.requests[0].request.headers['x-goog-api-key'], TEST_KEY);
});

for (const status of [400, 404]) {
    test(`HTTP ${status} 停止当前逻辑请求且不切换 Key`, async () => {
        const expected = await localResult('getCustomxyzValue');
        const { options, state } = createOptions({
            config: { aiMode: 'unknown_only', apiKeyPool: `${TEST_KEY},${SECOND_KEY}` },
            fetchImpl: async () => ({ ok: false, status })
        });
        assert.equal(await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options), expected);
        assert.equal(state.calls, 1);
    });
}

test('401 标记无效后切换下一 Key，成功 Key 后续保持粘滞', async () => {
    const store = plugin.createMemoryGeminiStateStore();
    const seen = [];
    const fetchImpl = async (_url, request) => {
        const key = request.headers['x-goog-api-key'];
        seen.push(key);
        if (key === TEST_KEY) return { ok: false, status: 401 };
        return interactionResponse({ translatedWords: { customxyz: '值' }, semanticDescription: '说明' });
    };
    const first = createOptions({
        config: { aiMode: 'unknown_only', apiKeyPool: `${TEST_KEY},${SECOND_KEY}` },
        stateStore: store,
        fetchImpl
    });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', first.options);
    assert.deepEqual(seen, [TEST_KEY, SECOND_KEY]);
    seen.length = 0;
    const second = createOptions({
        config: { aiMode: 'unknown_only', apiKeyPool: `${TEST_KEY},${SECOND_KEY}` },
        stateStore: store,
        fetchImpl
    });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', second.options);
    assert.deepEqual(seen, [SECOND_KEY]);
});

test('默认最多尝试 5 个不同 Key', async () => {
    const pool = Array.from({ length: 6 }, (_, index) => `test-key-${index}-not-real`).join(',');
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKeyPool: pool },
        fetchImpl: async () => ({ ok: false, status: 401 })
    });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.equal(state.calls, 5);
});

test('408 同 Key 额外重试一次，5xx 额外重试两次后才切换', async () => {
    for (const [status, expectedFirstKeyCalls] of [[408, 2], [500, 3]]) {
        const calls = [];
        const { options } = createOptions({
            config: { aiMode: 'unknown_only', apiKeyPool: `${TEST_KEY},${SECOND_KEY}` },
            fetchImpl: async (_url, request) => {
                const key = request.headers['x-goog-api-key'];
                calls.push(key);
                if (key === TEST_KEY) return { ok: false, status };
                return interactionResponse({ translatedWords: { customxyz: '值' }, semanticDescription: '说明' });
            }
        });
        await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
        assert.equal(calls.filter((key) => key === TEST_KEY).length, expectedFirstKeyCalls);
        assert.equal(calls.at(-1), SECOND_KEY);
    }
});

test('429 冷却当前 Key 并切换，Retry-After 被保存', async () => {
    const store = plugin.createMemoryGeminiStateStore();
    const { options } = createOptions({
        config: { aiMode: 'unknown_only', apiKeyPool: `${TEST_KEY},${SECOND_KEY}` },
        stateStore: store,
        fetchImpl: async (_url, request) => request.headers['x-goog-api-key'] === TEST_KEY
            ? { ok: false, status: 429, headers: { 'Retry-After': '12' } }
            : interactionResponse({ translatedWords: { customxyz: '值' }, semanticDescription: '说明' })
    });
    await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
    const fingerprint = plugin.sha256Hex(TEST_KEY);
    assert.equal(store.debug().states[fingerprint].status, 'cooldown');
    assert.equal(store.debug().states[fingerprint].cooldown_until, 13000);
});

test('结构化响应非法时停止且不换 Key', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'unknown_only', apiKeyPool: `${TEST_KEY},${SECOND_KEY}` },
        fetchImpl: async () => ({ ok: true, status: 200, data: { status: 'completed', steps: [] } })
    });
    const expected = await localResult('getCustomxyzValue');
    assert.equal(await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options), expected);
    assert.equal(state.calls, 1);
});

test('全部 Key 被 # 禁用时零网络并完整本地回退', async () => {
    const expected = await localResult('getCustomxyzValue');
    const { options, state } = createOptions({ config: { aiMode: 'unknown_only', apiKeyPool: `#${TEST_KEY},#${SECOND_KEY}` } });
    assert.equal(await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options), expected);
    assert.equal(state.calls, 0);
});

test('API Key 不出现在结果、错误、日志或公开状态中', async () => {
    const captured = [];
    const original = { log: console.log, warn: console.warn, error: console.error };
    console.log = (...args) => captured.push(args.join(' '));
    console.warn = (...args) => captured.push(args.join(' '));
    console.error = (...args) => captured.push(args.join(' '));
    try {
        const store = plugin.createMemoryGeminiStateStore();
        const { options } = createOptions({
            config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY },
            stateStore: store,
            fetchImpl: async () => { throw new Error(`network ${TEST_KEY}`); }
        });
        const result = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);
        assert.doesNotMatch(result, new RegExp(TEST_KEY));
        assert.doesNotMatch(captured.join('\n'), new RegExp(TEST_KEY));
        assert.doesNotMatch(JSON.stringify(store.debug()), new RegExp(TEST_KEY));
    } finally {
        console.log = original.log;
        console.warn = original.warn;
        console.error = original.error;
    }
});

test('中文转英文命名仍由本地算法完成且不调用网络', async () => {
    const { options, state } = createOptions({
        config: { aiMode: 'always', apiKeyPool: TEST_KEY, outputStyle: 'camel', identifierType: 'function' },
        fetchImpl: async () => { throw new Error('命名格式不应调用网络'); }
    });
    assert.equal(await plugin.translate('读取用户配置', 'auto', 'en', options), 'readUserConfig');
    assert.equal(state.calls, 0);
});

test('Pot eval 加载契约在 Interactions 层继续通过', async () => {
    const script = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    const pluginTranslate = vm.runInNewContext(`${script}\ntranslate`, { setTimeout, clearTimeout, unescape, encodeURIComponent });
    const { options } = createOptions({ config: { aiMode: 'unknown_only', apiKeyPool: TEST_KEY } });
    const result = await pluginTranslate('getCustomxyzValue', 'auto', 'zh_cn', options);
    assert.match(result, /AI 语义增强/);
});
