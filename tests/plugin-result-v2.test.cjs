const test = require('node:test');
const assert = require('node:assert/strict');

const plugin = require('../main.js');
const routeModule = require('../src/runtime-09-output-style-compat.js');

const V2_SCHEMA = 'pot.plugin-result.v2';
const V1_SCHEMA = 'pot.programmer-result.v1';
const TEST_KEY = 'test-gemini-key-not-real';

function serializerModule() {
    return require('../src/runtime-10-plugin-result-v2.js');
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
    return value;
}

function createV1Fixture({
    original = 'NFC_WriteU16LE',
    detectedType = 'function',
    detectionMode = 'auto',
    tokens = ['NFC', 'write', 'U16', 'LE'],
    summaryText = '以小端序向 NFC 设备写入 16 位无符号整数',
    summarySource = 'local',
    summaryFallback = false,
    tokenMeanings = [
        { index: 0, token: 'NFC', meaning: '近场通信', source: 'local' },
        { index: 1, token: 'write', phonetic: 'raɪt', meaning: '写入', source: 'local' },
        { index: 2, token: 'U16', meaning: '16 位无符号整数', source: 'local' },
        { index: 3, token: 'LE', meaning: '小端序', source: 'local' }
    ],
    naming = {
        camelCase: 'nfcWriteU16Le',
        pascalCase: 'NfcWriteU16Le',
        snakeCase: 'nfc_write_u16_le',
        screamingSnakeCase: 'NFC_WRITE_U16_LE',
        kebabCase: 'nfc-write-u16-le'
    },
    diagnostics = [],
    plainText
} = {}) {
    return {
        schema: V1_SCHEMA,
        plainText: plainText || [
            `${detectedType}：${original}`,
            `词语拆分：${tokens.join(' · ')}`,
            `核心释义：${summaryText}`,
            '词义：',
            ...tokenMeanings.map((item) => `- ${item.token}：${item.meaning}`),
            '命名：',
            `- camelCase：${naming.camelCase}`,
            `- PascalCase：${naming.pascalCase}`,
            `- snake_case：${naming.snakeCase}`,
            `- SCREAMING_SNAKE_CASE：${naming.screamingSnakeCase}`,
            `- kebab-case：${naming.kebabCase}`,
            ...diagnostics.map((item) => `诊断：${item.message}`)
        ].join('\n'),
        summary: {
            text: summaryText,
            source: summarySource,
            fallback: summaryFallback
        },
        identifier: {
            original,
            detectedType,
            detectionMode,
            tokens: [...tokens]
        },
        tokenMeanings: tokenMeanings.map((item) => ({ ...item })),
        naming: { ...naming },
        diagnostics: diagnostics.map((item) => ({ ...item }))
    };
}

function section(result, id) {
    return result.sections.find((item) => item.id === id);
}

function assertFixedSectionOrder(result, diagnostics = []) {
    assert.deepEqual(
        result.sections.map((item) => item.id),
        ['summary', 'identifier', 'token-meanings', 'naming', ...diagnostics]
    );
}

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
    config = {}
} = {}) {
    const state = {
        databaseLoads: 0,
        selectCalls: 0,
        closeCalls: 0,
        networkCalls: 0
    };
    const database = {
        async select() {
            state.selectCalls += 1;
            return [];
        },
        async close() {
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
                async load(path) {
                    if (String(path).includes('gemini_state.db')) {
                        throw new Error('测试使用内存状态库');
                    }
                    state.databaseLoads += 1;
                    return database;
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
                return interactionResponse({ translatedWords: {}, semanticDescription: '测试语义' });
            }
        }
    };
    if (host !== undefined) options.host = host;
    if (withSetResult) options.setResult = () => {};
    return { options, state };
}

function host(...resultSchemas) {
    return { name: '任意宿主名称', resultSchemas };
}

test('V2 serializer 映射纯本地固定输入并保持 copyText 原样', () => {
    const { PLUGIN_RESULT_V2_VERSION, createPluginResultV2, isPluginResultV2 } = serializerModule();
    const v1 = createV1Fixture();
    const result = createPluginResultV2(v1);

    assert.equal(PLUGIN_RESULT_V2_VERSION, 2);
    assert.equal(result.schemaVersion, 2);
    assert.equal(result.copyText, v1.plainText);
    assert.equal(isPluginResultV2(result), true);
    assertFixedSectionOrder(result);
    assert.deepEqual(section(result, 'summary'), {
        id: 'summary',
        type: 'summary',
        title: '核心释义',
        content: v1.summary.text,
        source: 'local',
        copyText: v1.summary.text
    });
    assert.deepEqual(section(result, 'identifier'), {
        id: 'identifier',
        type: 'metadata',
        title: '标识符信息',
        collapsible: true,
        defaultCollapsed: true,
        items: [
            { label: '类型', value: 'function' },
            { label: '原文', value: 'NFC_WriteU16LE', copyText: 'NFC_WriteU16LE' },
            { label: '检测方式', value: 'auto' }
        ],
        tokens: ['NFC', 'write', 'U16', 'LE']
    });
});

test('四种 summary source 严格映射到社区来源', () => {
    const { createPluginResultV2 } = serializerModule();
    const expected = {
        local: 'local',
        local_ai: 'mixed',
        ai: 'ai',
        local_fallback: 'local'
    };
    for (const [source, mapped] of Object.entries(expected)) {
        const diagnostics = source === 'local_fallback' ? [{
            code: 'ai.request_failed',
            severity: 'warning',
            message: 'AI 请求未完成，已使用完整本地结果。',
            recoverable: true
        }] : [];
        const result = createPluginResultV2(createV1Fixture({
            summarySource: source,
            summaryFallback: source === 'local_fallback',
            diagnostics
        }));
        assert.equal(section(result, 'summary').source, mapped, source);
    }
});

test('token meanings 映射 phonetic、source、literal 可见语义与单项复制', () => {
    const { createPluginResultV2 } = serializerModule();
    const result = createPluginResultV2(createV1Fixture({
        original: 'ST25DV_i2c_Customxyz',
        tokens: ['ST25DV', 'I2C', 'Customxyz'],
        tokenMeanings: [
            { index: 0, token: 'ST25DV', meaning: '技术缩写或数字，保留原文', source: 'literal' },
            { index: 1, token: 'I2C', phonetic: 'aɪ tuː siː', meaning: 'I²C 总线', source: 'local' },
            { index: 2, token: 'Customxyz', meaning: '自定义 XYZ', source: 'ai' }
        ],
        naming: {
            camelCase: 'st25dvI2cCustomxyz',
            pascalCase: 'St25dvI2cCustomxyz',
            snakeCase: 'st25dv_i2c_customxyz',
            screamingSnakeCase: 'ST25DV_I2C_CUSTOMXYZ',
            kebabCase: 'st25dv-i2c-customxyz'
        }
    }));
    const dictionary = section(result, 'token-meanings');

    assert.deepEqual(dictionary.items, [
        {
            token: 'ST25DV',
            meaning: '技术缩写或数字，保留原文',
            source: 'unknown',
            copyText: 'ST25DV：技术缩写或数字，保留原文'
        },
        {
            token: 'I2C',
            phonetic: 'aɪ tuː siː',
            meaning: 'I²C 总线',
            source: 'local',
            copyText: 'I2C /aɪ tuː siː/：I²C 总线'
        },
        {
            token: 'Customxyz',
            meaning: '自定义 XYZ',
            source: 'ai',
            copyText: 'Customxyz：自定义 XYZ'
        }
    ]);

    const appended = createPluginResultV2(createV1Fixture({
        tokens: ['RAW'],
        tokenMeanings: [{ index: 0, token: 'RAW', meaning: '产品代号', source: 'literal' }],
        naming: {
            camelCase: 'raw', pascalCase: 'Raw', snakeCase: 'raw',
            screamingSnakeCase: 'RAW', kebabCase: 'raw'
        }
    }));
    assert.equal(section(appended, 'token-meanings').items[0].meaning, '产品代号（按原文保留）');
});

test('命名 section 固定五项顺序且 copyText 只含纯值', () => {
    const { createPluginResultV2 } = serializerModule();
    const result = createPluginResultV2(createV1Fixture());
    assert.deepEqual(section(result, 'naming').items, [
        { label: '小驼峰', value: 'nfcWriteU16Le', copyText: 'nfcWriteU16Le' },
        { label: '大驼峰', value: 'NfcWriteU16Le', copyText: 'NfcWriteU16Le' },
        { label: '下划线', value: 'nfc_write_u16_le', copyText: 'nfc_write_u16_le' },
        { label: '大写下划线', value: 'NFC_WRITE_U16_LE', copyText: 'NFC_WRITE_U16_LE' },
        { label: '短横线', value: 'nfc-write-u16-le', copyText: 'nfc-write-u16-le' }
    ]);
});

test('空、单个和多个 diagnostics 保持顺序、code、严重度与 recoverable', () => {
    const { createPluginResultV2 } = serializerModule();
    assertFixedSectionOrder(createPluginResultV2(createV1Fixture()));

    const one = createPluginResultV2(createV1Fixture({ diagnostics: [{
        code: 'dictionary.unavailable',
        severity: 'warning',
        message: '普通英语词典暂不可用；已保留本地编程语义。',
        recoverable: true
    }] }));
    assertFixedSectionOrder(one, ['diagnostic-dictionary-unavailable']);
    assert.deepEqual(section(one, 'diagnostic-dictionary-unavailable'), {
        id: 'diagnostic-dictionary-unavailable',
        type: 'status',
        title: '诊断 · dictionary.unavailable',
        content: '普通英语词典暂不可用；已保留本地编程语义。\n可恢复：是',
        severity: 'warning',
        copyText: '普通英语词典暂不可用；已保留本地编程语义。',
        collapsible: true,
        defaultCollapsed: true
    });

    const multiple = createPluginResultV2(createV1Fixture({ diagnostics: [
        {
            code: 'dictionary.unavailable', severity: 'warning',
            message: '词典暂不可用。', recoverable: true
        },
        {
            code: 'input.partial', severity: 'info',
            message: '部分输入按原文保留。', recoverable: false
        }
    ] }));
    assertFixedSectionOrder(multiple, [
        'diagnostic-dictionary-unavailable',
        'diagnostic-input-partial'
    ]);
    assert.equal(section(multiple, 'diagnostic-input-partial').content, '部分输入按原文保留。\n可恢复：否');
});

test('local_fallback 与 ai.request_failed 合并为唯一 summary-fallback', () => {
    const { createPluginResultV2 } = serializerModule();
    const result = createPluginResultV2(createV1Fixture({
        summarySource: 'local_fallback',
        summaryFallback: true,
        diagnostics: [{
            code: 'ai.request_failed',
            severity: 'warning',
            message: 'AI 请求未完成，已使用完整本地结果。',
            recoverable: true
        }]
    }));

    assertFixedSectionOrder(result, ['summary-fallback']);
    assert.equal(result.sections.filter((item) => item.type === 'status').length, 1);
    assert.deepEqual(section(result, 'summary-fallback'), {
        id: 'summary-fallback',
        type: 'status',
        title: '诊断 · ai.request_failed',
        content: 'AI 请求未完成，已使用完整本地结果。\n可恢复：是',
        severity: 'warning',
        copyText: 'AI 请求未完成，已使用完整本地结果。',
        collapsible: true,
        defaultCollapsed: false
    });

    const synthesized = createPluginResultV2(createV1Fixture({
        summarySource: 'local_fallback',
        summaryFallback: true,
        diagnostics: []
    }));
    assertFixedSectionOrder(synthesized, ['summary-fallback']);
    assert.match(section(synthesized, 'summary-fallback').content, /完整本地结果/);
});

test('section ID 只由语义 code 决定且跨更新稳定', () => {
    const { createPluginResultV2 } = serializerModule();
    const first = createPluginResultV2(createV1Fixture({ diagnostics: [{
        code: 'dictionary.unavailable', severity: 'warning', message: '第一条安全文案', recoverable: true
    }] }));
    const second = createPluginResultV2(createV1Fixture({ diagnostics: [{
        code: 'dictionary.unavailable', severity: 'warning', message: '第二条安全文案', recoverable: true
    }] }));
    assert.deepEqual(first.sections.map((item) => item.id), second.sections.map((item) => item.id));
    assert.equal(section(first, 'diagnostic-dictionary-unavailable').id, 'diagnostic-dictionary-unavailable');
});

test('serializer 不修改冻结的 v1 输入', () => {
    const { createPluginResultV2 } = serializerModule();
    const v1 = createV1Fixture({ diagnostics: [{
        code: 'dictionary.unavailable', severity: 'warning', message: '词典暂不可用。', recoverable: true
    }] });
    const snapshot = clone(v1);
    deepFreeze(v1);
    createPluginResultV2(v1);
    assert.deepEqual(v1, snapshot);
});

test('serializer 拒绝 Key、请求头、URL、SQL、数据库路径和堆栈泄漏', () => {
    const { createPluginResultV2 } = serializerModule();
    const unsafeValues = [
        'x-goog-api-key: test-secret-not-real',
        'https://example.invalid/private',
        'SELECT value FROM secrets WHERE id = 1',
        'sqlite:/home/user/private/dictionary.db',
        'Error: failed\n at request (/home/user/plugin.js:1:1)'
    ];
    for (const unsafe of unsafeValues) {
        const v1 = createV1Fixture({
            plainText: `完整报告\n${unsafe}`,
            diagnostics: [{
                code: 'ai.request_failed', severity: 'warning', message: unsafe, recoverable: true
            }]
        });
        assert.throws(() => createPluginResultV2(v1), /敏感|安全/, unsafe);
    }
});

test('宿主能力只接受 resultSchemas 中大小写敏感的精确 V2 成员', () => {
    assert.equal(routeModule.PLUGIN_RESULT_V2_SCHEMA, V2_SCHEMA);
    assert.equal(routeModule.hostSupportsPluginResultV2({ host: host(V2_SCHEMA) }), true);
    assert.equal(routeModule.hostSupportsPluginResultV2({ host: host('other.schema', V2_SCHEMA) }), true);
    assert.equal(routeModule.hostSupportsPluginResultV2({ host: host('POT.PLUGIN-RESULT.V2') }), false);
    assert.equal(routeModule.hostSupportsPluginResultV2({ host: { resultSchemas: V2_SCHEMA } }), false);
    assert.equal(routeModule.hostSupportsPluginResultV2({ host: { resultSchemas: [] } }), false);
    assert.equal(routeModule.hostSupportsPluginResultV2({ setResult() {} }), false);
    assert.equal(routeModule.hostSupportsPluginResultV2({}), false);
});

test('多 Schema 路由固定为 V2、v1、旧对象、完整纯文本优先级', () => {
    const cases = [
        [host(V2_SCHEMA), 'plugin-result-v2'],
        [host(V1_SCHEMA), 'structured'],
        [host(V2_SCHEMA, V1_SCHEMA), 'plugin-result-v2'],
        [host('unknown.schema'), 'legacy-report'],
        [{ resultSchemas: [] }, 'legacy-report'],
        [{ resultSchemas: V2_SCHEMA }, 'legacy-report'],
        [host('POT.PLUGIN-RESULT.V2'), 'legacy-report']
    ];
    for (const [hostValue, resultKind] of cases) {
        const route = routeModule.decideProgrammerOutputRoute(
            { outputStyle: 'minimal' },
            { host: hostValue, setResult() {} }
        );
        assert.equal(route.resultKind, resultKind, JSON.stringify(hostValue));
    }
});

test('V2 宿主中的固定四输入映射到社区结果并保留 v1 全文', async () => {
    const local = createOptions({ host: host(V2_SCHEMA), aiMode: 'off' });
    const localResult = await plugin.translate('NFC_WriteU16LE', 'auto', 'zh_cn', local.options);
    assert.equal(localResult.schemaVersion, 2);
    assertFixedSectionOrder(localResult);
    assert.equal(section(localResult, 'summary').source, 'local');
    assert.match(localResult.copyText, /NFC_WriteU16LE/);
    assert.equal(local.state.networkCalls, 0);

    const mixed = createOptions({
        host: host(V2_SCHEMA),
        aiMode: 'unknown_only',
        fetchImpl: async () => interactionResponse({
            translatedWords: { customxyz: '自定义 XYZ' },
            semanticDescription: '获取自定义 XYZ 值'
        })
    });
    const mixedResult = await plugin.translate('getCustomxyzValue', 'auto', 'zh_cn', mixed.options);
    assert.equal(section(mixedResult, 'summary').source, 'mixed');
    assert.equal(
        section(mixedResult, 'token-meanings').items.find((item) => item.token === 'Customxyz').source,
        'ai'
    );

    const ai = createOptions({
        host: host(V2_SCHEMA),
        outputStyle: 'report',
        aiMode: 'always',
        fetchImpl: async () => interactionResponse({
            translatedWords: {},
            semanticDescription: '接收缓冲区的长度'
        })
    });
    const aiResult = await plugin.translate('RxBufLen', 'auto', 'zh_cn', ai.options);
    assert.equal(section(aiResult, 'summary').source, 'ai');
    assert.equal(section(aiResult, 'summary').content, '接收缓冲区的长度');

    const fallback = createOptions({
        host: host(V2_SCHEMA),
        aiMode: 'always',
        fetchImpl: async () => {
            throw new Error('底层网络失败，不得进入结果');
        }
    });
    const fallbackResult = await plugin.translate('ST25DV_i2c_WriteData', 'auto', 'zh_cn', fallback.options);
    assert.equal(section(fallbackResult, 'summary').source, 'local');
    assert.equal(fallbackResult.sections.filter((item) => item.id === 'summary-fallback').length, 1);
    assert.equal(
        section(fallbackResult, 'token-meanings').items.find((item) => item.token === 'ST25DV').source,
        'unknown'
    );
    assert.doesNotMatch(JSON.stringify(fallbackResult), /底层网络失败|x-goog-api-key|https?:\/\//i);
});

test('translate 真实返回矩阵覆盖 V2、v1、未知 Schema、有无 setResult', async () => {
    const cases = [
        ['V2 only + setResult', host(V2_SCHEMA), true, 'v2'],
        ['V2 only no setResult', host(V2_SCHEMA), false, 'v2'],
        ['v1 only', host(V1_SCHEMA), false, 'v1'],
        ['V2 + v1', host(V1_SCHEMA, V2_SCHEMA), true, 'v2'],
        ['unknown + setResult', host('unknown.schema'), true, 'native'],
        ['unknown no setResult', host('unknown.schema'), false, 'text'],
        ['empty + setResult', { resultSchemas: [] }, true, 'native'],
        ['non-array no setResult', { resultSchemas: V2_SCHEMA }, false, 'text'],
        ['case mismatch + setResult', host('POT.PLUGIN-RESULT.V2'), true, 'native'],
        ['missing host no setResult', undefined, false, 'text']
    ];

    for (const [name, hostValue, withSetResult, expected] of cases) {
        const { options } = createOptions({ host: hostValue, withSetResult });
        const result = await plugin.translate('getValue', 'auto', 'zh_cn', options);
        if (expected === 'v2') {
            assert.equal(result.schemaVersion, 2, name);
        } else if (expected === 'v1') {
            assert.equal(result.schema, V1_SCHEMA, name);
        } else if (expected === 'native') {
            assert.equal(typeof result, 'object', name);
            assert.ok(Array.isArray(result.explanations), name);
            assert.equal(Object.hasOwn(result, 'schemaVersion'), false, name);
        } else {
            assert.equal(typeof result, 'string', name);
            assert.match(result, /camelCase：/, name);
        }
    }
});

test('六种直接命名模式在 V2 宿主中仍零词典、零网络并返回字符串', async () => {
    const expected = {
        camel: 'translateServiceList',
        pascal: 'TranslateServiceList',
        snake: 'translate_service_list',
        screaming: 'TRANSLATE_SERVICE_LIST',
        kebab: 'translate-service-list',
        words: 'translate service list'
    };
    for (const [outputStyle, value] of Object.entries(expected)) {
        const { options, state } = createOptions({
            outputStyle,
            aiMode: 'always',
            host: host(V2_SCHEMA, V1_SCHEMA),
            withSetResult: true,
            fetchImpl: async () => {
                throw new Error('直接输出不应访问网络');
            }
        });
        const result = await plugin.translate('translate_service_list', 'auto', 'zh_cn', options);
        assert.equal(result, value, outputStyle);
        assert.equal(state.databaseLoads, 0, outputStyle);
        assert.equal(state.networkCalls, 0, outputStyle);
    }
});

test('chinese 在 V2 宿主中继续返回原字符串路径', async () => {
    const { options } = createOptions({
        outputStyle: 'chinese',
        aiMode: 'off',
        host: host(V2_SCHEMA, V1_SCHEMA),
        withSetResult: true
    });
    const result = await plugin.translate('NFC_WriteU16LE', 'auto', 'zh_cn', options);
    assert.equal(typeof result, 'string');
    assert.match(result, /编程含义：以小端序向 NFC 设备写入 16 位无符号整数/);
    assert.doesNotMatch(result, /schemaVersion|pot\.plugin-result\.v2/);
});

test('V2 路由与 translate 不修改 options、host 或 config', async () => {
    const { options } = createOptions({
        host: host(V2_SCHEMA, V1_SCHEMA, 'unknown.schema'),
        withSetResult: true,
        config: { nested: { keep: true } }
    });
    const before = {
        host: clone(options.host),
        config: clone(options.config)
    };
    deepFreeze(options.host);
    deepFreeze(options.config);

    routeModule.decideProgrammerOutputRoute(options.config, options);
    await plugin.translate('getValue', 'auto', 'zh_cn', options);

    assert.deepEqual(options.host, before.host);
    assert.deepEqual(options.config, before.config);
});
