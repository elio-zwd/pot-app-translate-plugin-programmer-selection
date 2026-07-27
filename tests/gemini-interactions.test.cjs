const test = require('node:test');
const assert = require('node:assert/strict');
const plugin = require('../main.js');

const KEY = 'test-gemini-key-not-real';

function completed(payload) {
    return {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(payload) }] }]
    };
}

test('Interactions 请求契约固定且显式关闭存储、流式与后台', () => {
    const body = plugin.createGeminiInteractionBody('gemini-3.5-flash-lite', { requestedTokens: ['foo'] });
    assert.equal(body.model, 'gemini-3.5-flash-lite');
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.equal(body.background, false);
    assert.equal(body.response_format.type, 'text');
    assert.equal(body.response_format.mime_type, 'application/json');
    assert.deepEqual(body.response_format.schema.required, ['translatedWords', 'semanticDescription']);
    assert.equal(body.generation_config.max_output_tokens, 512);
    assert.equal('temperature' in body.generation_config, false);
    assert.equal('top_p' in body.generation_config, false);
    assert.equal('top_k' in body.generation_config, false);
    assert.equal('previous_interaction_id' in body, false);
});

test('从多个 model_output 文本片段按顺序拼接', () => {
    const result = plugin.extractInteractionText({
        status: 'completed',
        steps: [
            { type: 'thought', summary: [] },
            { type: 'model_output', content: [{ type: 'text', text: '{"translatedWords":{}' }] },
            { type: 'model_output', content: [{ type: 'image', data: 'x' }, { type: 'text', text: ',"semanticDescription":"说明"}' }] }
        ]
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, '{"translatedWords":{},"semanticDescription":"说明"}');
});

for (const status of ['failed', 'in_progress', 'requires_action']) {
    test(`Interaction 状态 ${status} 被拒绝`, () => {
        assert.equal(plugin.extractInteractionText({ status, steps: [] }).ok, false);
    });
}

test('空 steps、非文本内容与非法 JSON 响应被拒绝', () => {
    assert.equal(plugin.extractInteractionText({ status: 'completed', steps: [] }).ok, false);
    assert.equal(plugin.extractInteractionText({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image' }] }] }).ok, false);
    assert.equal(plugin.extractInteractionText('not-json').ok, false);
});

test('错误分类符合停止、重试和切换边界', () => {
    assert.equal(plugin.classifyGeminiFailure(400, 0, false), 'stop');
    assert.equal(plugin.classifyGeminiFailure(404, 0, false), 'stop');
    assert.equal(plugin.classifyGeminiFailure(401, 0, false), 'switch');
    assert.equal(plugin.classifyGeminiFailure(408, 0, false), 'retry');
    assert.equal(plugin.classifyGeminiFailure(408, 1, false), 'switch');
    assert.equal(plugin.classifyGeminiFailure(500, 0, false), 'retry');
    assert.equal(plugin.classifyGeminiFailure(500, 1, false), 'retry');
    assert.equal(plugin.classifyGeminiFailure(500, 2, false), 'switch');
    assert.equal(plugin.classifyGeminiFailure(0, 0, true), 'retry');
    assert.equal(plugin.classifyGeminiFailure(0, 1, true), 'switch');
});

test('429 优先 Retry-After 秒数，否则使用阶梯冷却', () => {
    assert.equal(plugin.cooldownSeconds(1, { headers: { 'Retry-After': '12' } }), 12);
    assert.deepEqual([1, 2, 3, 4].map((count) => plugin.cooldownSeconds(count, {})), [60, 300, 1800, 86400]);
    assert.equal(plugin.cooldownSeconds(2, { headers: { 'Retry-After': 'date-value' } }), 300);
});

test('单 Key 的 5xx 最多额外重试两次', async () => {
    let calls = 0;
    const result = await plugin.executeGeminiInteraction({
        keyEntry: { key: KEY },
        model: 'gemini-3.5-flash-lite',
        payload: { requestedTokens: ['foo'] },
        deadlineAt: 30000,
        now: () => 0,
        utils: {
            tauriFetch: async () => { calls += 1; return { ok: false, status: 500 }; },
            http: { Body: { json: (payload) => ({ payload }) } }
        }
    });
    assert.equal(calls, 3);
    assert.equal(result.outcome, 'switch');
});

test('Interactions 成功响应不暴露 Key', async () => {
    let captured;
    const result = await plugin.executeGeminiInteraction({
        keyEntry: { key: KEY },
        model: 'gemini-3.5-flash-lite',
        payload: { requestedTokens: ['foo'] },
        deadlineAt: 30000,
        now: () => 0,
        utils: {
            tauriFetch: async (url, request) => {
                captured = { url, request };
                return { ok: true, status: 200, data: completed({ translatedWords: { foo: '值' }, semanticDescription: '说明' }) };
            },
            http: { Body: { json: (payload) => ({ payload }) } }
        }
    });
    assert.equal(result.outcome, 'success');
    assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(captured.request.headers['x-goog-api-key'], KEY);
    assert.doesNotMatch(captured.url, new RegExp(KEY));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(KEY));
});
