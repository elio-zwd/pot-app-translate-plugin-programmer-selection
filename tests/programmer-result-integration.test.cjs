const test = require('node:test');
const assert = require('node:assert/strict');

const plugin = require('../main.js');

const TEST_KEY = 'test-gemini-key-not-real';
const V1_SCHEMA = 'pot.programmer-result.v1';

function interactionResponse(payload) {
    return {
        ok: true,
        status: 200,
        data: {
            status: 'completed',
            steps: [{
                type: 'model_output',
                content: [{ type: 'text', text: JSON.stringify(payload) }]
            }]
        }
    };
}

function createOptions({
    outputStyle = 'minimal',
    aiMode = 'off',
    host,
    withSetResult = false,
    fetchImpl,
    dictionaryRows = {},
    config = {}
} = {}) {
    const state = {
        databaseLoads: 0,
        selectCalls: 0,
        closeCalls: 0,
        networkCalls: 0,
        requests: []
    };
    let closed = false;
    const dictionaryDb = {
        async select(_sql, params) {
            if (closed) throw new Error('attempted to acquire a connection on a closed pool');
            state.selectCalls += 1;
            return params.map((word) => dictionaryRows[word]).filter(Boolean);
        },
        async close() {
            closed = true;
            state.closeCalls += 1;
        }
    };
    const options = {
        config: {
            outputStyle,
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
                    state.databaseLoads += 1;
                    return dictionaryDb;
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
                state.requests.push({ url, request });
                if (fetchImpl) return fetchImpl(url, request, state);
                return interactionResponse({
                    translatedWords: {},
                    semanticDescription: '默认测试语义'
                });
            }
        }
    };
    if (host !== undefined) options.host = host;
    if (withSetResult) options.setResult = () => {};
    return { options, state };
}

function v1Host(name = 'pot-desktop') {
    return {
        name,
        resultSchemas: [V1_SCHEMA]
    };
}

function assertCompletePlainText(text) {
    assert.equal(typeof text, 'string');
    assert.match(text, /词语拆分：|拆分：/);
    assert.match(text, /词义：|普通词义：/);
    assert.match(text, /camelCase：/);
    assert.match(text, /PascalCase：/);
    assert.match(text, /snake_case：/);
    assert.match(text, /SCREAMING_SNAKE_CASE：/);
    assert.match(text, /kebab-case：/);
}

test('NFC_WriteU16LE 在 v1 宿主中返回纯本地 minimal 结构化结果', async () => {
    const { options, state } = createOptions({
        outputStyle: 'minimal',
        aiMode: 'off',
        host: v1Host(),
        withSetResult: true
    });

    const result = await plugin.translate('NFC_WriteU16LE', 'auto', 'zh_cn', options);

    assert.equal(result.schema, V1_SCHEMA);
    assert.deepEqual(result.summary, {
        text: '以小端序向 NFC 设备写入 16 位无符号整数',
        source: 'local',
        fallback: false
    });
    assert.deepEqual(result.presentation, {
        preferredDensity: 'minimal',
        initiallyExpanded: []
    });
    assert.equal(state.networkCalls, 0);
    assert.deepEqual(result.identifier.tokens, ['NFC', 'write', 'U16', 'LE']);
    assert.deepEqual(result.tokenMeanings, [
        { index: 0, token: 'NFC', meaning: '近场通信', source: 'local' },
        { index: 1, token: 'write', meaning: '写入', source: 'local' },
        { index: 2, token: 'U16', meaning: '16 位无符号整数', source: 'local' },
        { index: 3, token: 'LE', meaning: '小端序', source: 'local' }
    ]);
    assert.deepEqual(result.diagnostics, []);
    assertCompletePlainText(result.plainText);
});

test('getCustomxyzValue 只让 AI 补全未知 token', async () => {
    const { options, state } = createOptions({
        outputStyle: 'minimal',
        aiMode: 'unknown_only',
        host: v1Host(),
        fetchImpl: async () => interactionResponse({
            translatedWords: { customxyz: '自定义 XYZ' },
            semanticDescription: '获取自定义 XYZ 值'
        })
    });

    const result = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', options);

    assert.equal(state.networkCalls, 1);
    assert.equal(result.schema, V1_SCHEMA);
    assert.deepEqual(result.summary, {
        text: '获取自定义 XYZ 值',
        source: 'local_ai',
        fallback: false
    });
    assert.deepEqual(result.tokenMeanings, [
        { index: 0, token: 'get', meaning: '获取', source: 'local' },
        { index: 1, token: 'Customxyz', meaning: '自定义 XYZ', source: 'ai' },
        { index: 2, token: 'Value', meaning: '值', source: 'local' }
    ]);
    assert.deepEqual(result.naming, {
        camelCase: 'getCustomxyzValue',
        pascalCase: 'GetCustomxyzValue',
        snakeCase: 'get_customxyz_value',
        screamingSnakeCase: 'GET_CUSTOMXYZ_VALUE',
        kebabCase: 'get-customxyz-value'
    });
});

test('RxBufLen 在 report 模式使用 AI 摘要但保留本地 token 含义', async () => {
    const { options } = createOptions({
        outputStyle: 'report',
        aiMode: 'always',
        host: v1Host(),
        fetchImpl: async () => interactionResponse({
            translatedWords: {},
            semanticDescription: '接收缓冲区的长度'
        })
    });

    const result = await plugin.translate('RxBufLen', 'auto', 'zh_cn', options);

    assert.equal(result.schema, V1_SCHEMA);
    assert.deepEqual(result.summary, {
        text: '接收缓冲区的长度',
        source: 'ai',
        fallback: false
    });
    assert.deepEqual(result.presentation, {
        preferredDensity: 'report',
        initiallyExpanded: ['identifier', 'tokenMeanings', 'naming', 'diagnostics']
    });
    assert.deepEqual(result.tokenMeanings, [
        { index: 0, token: 'Rx', meaning: '接收', source: 'local' },
        { index: 1, token: 'Buf', meaning: '缓冲区', source: 'local' },
        { index: 2, token: 'Len', meaning: '长度', source: 'local' }
    ]);
    assertCompletePlainText(result.plainText);
});

test('ST25DV_i2c_WriteData 在 AI 失败时返回脱敏的本地 v1 回退', async () => {
    const { options, state } = createOptions({
        outputStyle: 'minimal',
        aiMode: 'always',
        host: v1Host(),
        fetchImpl: async () => {
            throw new Error('x-goog-api-key: test-secret https://example.invalid/private');
        }
    });

    const result = await plugin.translate('ST25DV_i2c_WriteData', 'auto', 'zh_cn', options);

    assert.ok(state.networkCalls > 0);
    assert.equal(result.schema, V1_SCHEMA);
    assert.deepEqual(result.summary, {
        text: 'ST25DV I2C 写入数据',
        source: 'local_fallback',
        fallback: true
    });
    assert.deepEqual(result.tokenMeanings, [
        { index: 0, token: 'ST25DV', meaning: '技术缩写或数字，保留原文', source: 'literal' },
        { index: 1, token: 'I2C', meaning: 'I²C 总线', source: 'local' },
        { index: 2, token: 'write', meaning: '写入', source: 'local' },
        { index: 3, token: 'data', meaning: '数据', source: 'local' }
    ]);
    assert.deepEqual(result.diagnostics, [{
        code: 'ai.request_failed',
        severity: 'warning',
        message: 'AI 请求未完成，已使用完整本地结果。',
        recoverable: true
    }]);
    assert.doesNotMatch(
        JSON.stringify(result),
        /test-secret|x-goog-api-key|example\.invalid|请求头|完整 URL|sqlite:|SELECT|\n\s*at\s/i
    );
    assertCompletePlainText(result.plainText);
});

test('只有精确 resultSchemas 声明决定结构化路径，setResult 只决定旧回退形态', async () => {
    const cases = [
        ['v1 minimal + setResult', 'minimal', v1Host(), true, 'structured'],
        ['v1 minimal no setResult', 'minimal', v1Host(), false, 'structured'],
        ['v1 report + setResult', 'report', v1Host(), true, 'structured'],
        ['v1 report no setResult', 'report', v1Host(), false, 'structured'],
        ['missing host + setResult', 'minimal', undefined, true, 'native'],
        ['missing host no setResult', 'minimal', undefined, false, 'text'],
        ['resultSchemas non-array', 'minimal', { resultSchemas: V1_SCHEMA }, true, 'native'],
        ['schema case mismatch', 'minimal', { resultSchemas: ['POT.PROGRAMMER-RESULT.V1'] }, false, 'text'],
        ['setResult only', 'minimal', undefined, true, 'native'],
        ['other host exact schema', 'minimal', v1Host('third-party-host'), false, 'structured']
    ];

    for (const [name, outputStyle, host, withSetResult, expected] of cases) {
        const { options } = createOptions({ outputStyle, host, withSetResult });
        const result = await plugin.translate('getValue', 'auto', 'zh_cn', options);
        if (expected === 'structured') {
            assert.equal(result.schema, V1_SCHEMA, name);
        } else if (expected === 'native') {
            assert.equal(typeof result, 'object', name);
            assert.ok(Array.isArray(result.explanations), name);
            assert.equal(Object.hasOwn(result, 'schema'), false, name);
        } else {
            assert.equal(typeof result, 'string', name);
            assertCompletePlainText(result);
        }
    }
});

test('缺失、空白和未知 outputStyle 对新宿主为 minimal，对旧宿主为完整 report', async () => {
    const values = [undefined, null, '', '   ', 'unknown'];
    for (const value of values) {
        const structured = createOptions({
            outputStyle: value,
            host: v1Host(),
            withSetResult: false
        });
        const structuredResult = await plugin.translate('getValue', 'auto', 'zh_cn', structured.options);
        assert.equal(structuredResult.schema, V1_SCHEMA, String(value));
        assert.equal(structuredResult.presentation.preferredDensity, 'minimal', String(value));

        const legacy = createOptions({ outputStyle: value, withSetResult: false });
        const legacyResult = await plugin.translate('getValue', 'auto', 'zh_cn', legacy.options);
        assert.equal(typeof legacyResult, 'string', String(value));
        assertCompletePlainText(legacyResult);
        assert.doesNotMatch(legacyResult, /^获取值$/);
    }
});

test('六种旧直接输出保持零词典、零网络字符串路径', async () => {
    const expectedByStyle = {
        camel: 'translateServiceList',
        pascal: 'TranslateServiceList',
        snake: 'translate_service_list',
        screaming: 'TRANSLATE_SERVICE_LIST',
        kebab: 'translate-service-list',
        words: 'translate service list'
    };

    for (const [outputStyle, expected] of Object.entries(expectedByStyle)) {
        for (const variant of [
            { host: v1Host(), withSetResult: true },
            { host: undefined, withSetResult: false }
        ]) {
            const { options, state } = createOptions({
                outputStyle,
                aiMode: 'always',
                ...variant,
                fetchImpl: async () => {
                    throw new Error('直接输出不应调用网络');
                }
            });
            const result = await plugin.translate('translate_service_list', 'auto', 'zh_cn', options);
            assert.equal(result, expected, outputStyle);
            assert.equal(state.databaseLoads, 0, outputStyle);
            assert.equal(state.networkCalls, 0, outputStyle);
        }
    }
});

test('chinese 保留词典与 Gemini 附加语义，且永远不包装 v1', async () => {
    const local = createOptions({
        outputStyle: 'chinese',
        aiMode: 'off',
        host: v1Host()
    });
    const localResult = await plugin.translate('NFC_WriteU16LE', 'auto', 'zh_cn', local.options);
    assert.equal(typeof localResult, 'string');
    assert.match(localResult, /编程含义：以小端序向 NFC 设备写入 16 位无符号整数/);
    assert.match(localResult, /普通词义：/);
    assert.equal(local.state.databaseLoads, 1);
    assert.equal(local.state.networkCalls, 0);

    const success = createOptions({
        outputStyle: 'chinese',
        aiMode: 'unknown_only',
        fetchImpl: async () => interactionResponse({
            translatedWords: { customxyz: '自定义 XYZ' },
            semanticDescription: '获取自定义 XYZ 值'
        })
    });
    const successResult = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', success.options);
    assert.equal(typeof successResult, 'string');
    assert.match(successResult, /AI 语义增强：获取自定义 XYZ 值/);
    assert.match(successResult, /AI 未知词：customxyz：自定义 XYZ/);

    const failure = createOptions({
        outputStyle: 'chinese',
        aiMode: 'always',
        host: v1Host(),
        fetchImpl: async () => {
            throw new Error('底层失败不应进入用户输出');
        }
    });
    const failureResult = await plugin.translate('ST25DV_i2c_WriteData', 'auto', 'zh_cn', failure.options);
    assert.equal(typeof failureResult, 'string');
    assert.match(failureResult, /编程含义：ST25DV I2C 写入数据/);
    assert.doesNotMatch(failureResult, /底层失败|pot\.programmer-result\.v1/);
});

test('无 setResult 的 minimal/report 都返回完整纯文本，AI 失败也不删减本地详情', async () => {
    for (const outputStyle of ['minimal', 'report']) {
        const { options } = createOptions({
            outputStyle,
            aiMode: 'always',
            fetchImpl: async () => {
                throw new Error('test-secret https://example.invalid/private');
            }
        });
        const result = await plugin.translate('ST25DV_i2c_WriteData', 'auto', 'zh_cn', options);
        assert.equal(typeof result, 'string', outputStyle);
        assert.match(result, /ST25DV_i2c_WriteData/);
        assert.match(result, /ST25DV .* I2C .* write .* data/);
        assert.match(result, /编程含义：ST25DV I2C 写入数据/);
        assertCompletePlainText(result);
        assert.doesNotMatch(result, /test-secret|example\.invalid|x-goog-api-key/i);
    }
});

test('路由接入不修改 options、config 或 host', async () => {
    const { options } = createOptions({
        outputStyle: 'minimal',
        host: v1Host('immutable-host'),
        withSetResult: true,
        config: { nested: { keep: true } }
    });
    const before = {
        config: JSON.parse(JSON.stringify(options.config)),
        host: JSON.parse(JSON.stringify(options.host))
    };

    await plugin.translate('getValue', 'auto', 'zh_cn', options);

    assert.deepEqual(options.config, before.config);
    assert.deepEqual(options.host, before.host);
});
