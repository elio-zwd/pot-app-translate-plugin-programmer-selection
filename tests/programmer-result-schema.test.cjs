const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PROGRAMMER_RESULT_SCHEMA,
    assertValidProgrammerResultV1,
    createProgrammerResultV1,
    isProgrammerResultV1
} = require('../src/runtime-08-programmer-result-schema.js');

const NAMING_KEYS = [
    'camelCase',
    'pascalCase',
    'snakeCase',
    'screamingSnakeCase',
    'kebabCase'
];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
    return value;
}

function localFixture({ input, detectedType, words, programmingText, meanings }) {
    return {
        model: {
            input,
            detectedType,
            words,
            acronymStyle: 'standard'
        },
        sections: {
            programmingText,
            generalLines: meanings.map(({ token, meaning, phonetic }) =>
                `- ${token}${phonetic ? ` /${phonetic}/` : ''}：${meaning}`
            ),
            unknownWords: meanings.filter((item) => item.meaning === '未收录').map((item) => item.token),
            warning: ''
        }
    };
}

function createNfcResult() {
    const fixture = localFixture({
        input: 'NFC_WriteU16LE',
        detectedType: 'function',
        words: ['NFC', 'write', 'U16', 'LE'],
        programmingText: '以小端序向 NFC 设备写入 16 位无符号整数',
        meanings: [
            { token: 'NFC', meaning: '近场通信' },
            { token: 'write', meaning: '写入' },
            { token: 'U16', meaning: '16 位无符号整数' },
            { token: 'LE', meaning: '小端序' }
        ]
    });
    return createProgrammerResultV1(fixture.model, fixture.sections, { status: 'skipped', reason: 'off' }, {
        preferredDensity: 'minimal',
        initiallyExpanded: []
    });
}

test('NFC_WriteU16LE 生成纯本地完整 v1 结果', () => {
    const result = createNfcResult();

    assert.equal(result.schema, PROGRAMMER_RESULT_SCHEMA);
    assert.deepEqual(result.summary, {
        text: '以小端序向 NFC 设备写入 16 位无符号整数',
        source: 'local',
        fallback: false
    });
    assert.deepEqual(result.identifier, {
        original: 'NFC_WriteU16LE',
        detectedType: 'function',
        detectionMode: 'auto',
        tokens: ['NFC', 'write', 'U16', 'LE']
    });
    assert.deepEqual(result.tokenMeanings, [
        { index: 0, token: 'NFC', meaning: '近场通信', source: 'local' },
        { index: 1, token: 'write', meaning: '写入', source: 'local' },
        { index: 2, token: 'U16', meaning: '16 位无符号整数', source: 'local' },
        { index: 3, token: 'LE', meaning: '小端序', source: 'local' }
    ]);
    assert.deepEqual(result.naming, {
        camelCase: 'nfcWriteU16Le',
        pascalCase: 'NfcWriteU16Le',
        snakeCase: 'nfc_write_u16_le',
        screamingSnakeCase: 'NFC_WRITE_U16_LE',
        kebabCase: 'nfc-write-u16-le'
    });
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.presentation, { preferredDensity: 'minimal', initiallyExpanded: [] });
    assert.equal(result.plainText, [
        '函数名：NFC_WriteU16LE',
        '词语拆分：NFC · write · U16 · LE',
        '核心释义：以小端序向 NFC 设备写入 16 位无符号整数',
        '词义：',
        '- NFC：近场通信',
        '- write：写入',
        '- U16：16 位无符号整数',
        '- LE：小端序',
        '命名：',
        '- camelCase：nfcWriteU16Le',
        '- PascalCase：NfcWriteU16Le',
        '- snake_case：nfc_write_u16_le',
        '- SCREAMING_SNAKE_CASE：NFC_WRITE_U16_LE',
        '- kebab-case：nfc-write-u16-le'
    ].join('\n'));
    assert.equal(isProgrammerResultV1(result), true);
});

test('getCustomxyzValue 只允许 AI 补全本地未知 token', () => {
    const fixture = localFixture({
        input: 'getCustomxyzValue',
        detectedType: 'function',
        words: ['get', 'Customxyz', 'Value'],
        programmingText: '获取自定义 XYZ 值',
        meanings: [
            { token: 'get', meaning: '获取' },
            { token: 'Customxyz', meaning: '未收录' },
            { token: 'Value', meaning: '值' }
        ]
    });
    const result = createProgrammerResultV1(fixture.model, fixture.sections, {
        status: 'success',
        translatedWords: {
            get: '恶意覆盖获取',
            Customxyz: '自定义 XYZ',
            Value: '恶意覆盖值'
        },
        semanticDescription: '获取自定义 XYZ 值'
    });

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
    assert.deepEqual(result.identifier, {
        original: 'getCustomxyzValue',
        detectedType: 'function',
        detectionMode: 'auto',
        tokens: ['get', 'Customxyz', 'Value']
    });
    assert.deepEqual(result.naming, {
        camelCase: 'getCustomxyzValue',
        pascalCase: 'GetCustomxyzValue',
        snakeCase: 'get_customxyz_value',
        screamingSnakeCase: 'GET_CUSTOMXYZ_VALUE',
        kebabCase: 'get-customxyz-value'
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.plainText, [
        '函数名：getCustomxyzValue',
        '词语拆分：get · Customxyz · Value',
        '核心释义：获取自定义 XYZ 值',
        '词义：',
        '- get：获取',
        '- Customxyz：自定义 XYZ〔AI〕',
        '- Value：值',
        '命名：',
        '- camelCase：getCustomxyzValue',
        '- PascalCase：GetCustomxyzValue',
        '- snake_case：get_customxyz_value',
        '- SCREAMING_SNAKE_CASE：GET_CUSTOMXYZ_VALUE',
        '- kebab-case：get-customxyz-value'
    ].join('\n'));
    assert.doesNotMatch(result.plainText, /恶意覆盖/);
});

test('RxBufLen 使用 AI 整体摘要但保留三个本地 token 含义', () => {
    const fixture = localFixture({
        input: 'RxBufLen',
        detectedType: 'class',
        words: ['Rx', 'Buf', 'Len'],
        programmingText: '接收缓冲区长度',
        meanings: [
            { token: 'Rx', meaning: '接收' },
            { token: 'Buf', meaning: '缓冲区' },
            { token: 'Len', meaning: '长度' }
        ]
    });
    const result = createProgrammerResultV1(fixture.model, fixture.sections, {
        status: 'success',
        translatedWords: {},
        semanticDescription: '接收缓冲区的长度'
    });

    assert.deepEqual(result.summary, {
        text: '接收缓冲区的长度',
        source: 'ai',
        fallback: false
    });
    assert.deepEqual(result.identifier, {
        original: 'RxBufLen',
        detectedType: 'class',
        detectionMode: 'auto',
        tokens: ['Rx', 'Buf', 'Len']
    });
    assert.deepEqual(result.tokenMeanings, [
        { index: 0, token: 'Rx', meaning: '接收', source: 'local' },
        { index: 1, token: 'Buf', meaning: '缓冲区', source: 'local' },
        { index: 2, token: 'Len', meaning: '长度', source: 'local' }
    ]);
    assert.deepEqual(result.naming, {
        camelCase: 'rxBufLen',
        pascalCase: 'RxBufLen',
        snakeCase: 'rx_buf_len',
        screamingSnakeCase: 'RX_BUF_LEN',
        kebabCase: 'rx-buf-len'
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.plainText, [
        '类名：RxBufLen',
        '词语拆分：Rx · Buf · Len',
        'AI 释义：接收缓冲区的长度',
        '词义：',
        '- Rx：接收',
        '- Buf：缓冲区',
        '- Len：长度',
        '命名：',
        '- camelCase：rxBufLen',
        '- PascalCase：RxBufLen',
        '- snake_case：rx_buf_len',
        '- SCREAMING_SNAKE_CASE：RX_BUF_LEN',
        '- kebab-case：rx-buf-len'
    ].join('\n'));
});

test('ST25DV_i2c_WriteData 在 AI 失败时生成脱敏本地回退', () => {
    const fixture = localFixture({
        input: 'ST25DV_i2c_WriteData',
        detectedType: 'function',
        words: ['ST25DV', 'I2C', 'write', 'data'],
        programmingText: 'ST25DV I2C 写入数据',
        meanings: [
            { token: 'ST25DV', meaning: '技术缩写或数字，保留原文' },
            { token: 'I2C', meaning: 'I²C 总线' },
            { token: 'write', meaning: '写入' },
            { token: 'data', meaning: '数据' }
        ]
    });
    const result = createProgrammerResultV1(fixture.model, fixture.sections, {
        status: 'failed',
        reason: 'network_unavailable',
        error: {
            message: 'x-goog-api-key: AIzaNotReal https://example.invalid?q=secret',
            stack: 'Error: leaked\n at request (/home/user/plugin.js:1:1)'
        },
        rawResponse: 'secret remote response'
    }, {
        preferredDensity: 'minimal',
        initiallyExpanded: ['diagnostics']
    });

    assert.deepEqual(result.summary, {
        text: 'ST25DV I2C 写入数据',
        source: 'local_fallback',
        fallback: true
    });
    assert.deepEqual(result.identifier, {
        original: 'ST25DV_i2c_WriteData',
        detectedType: 'function',
        detectionMode: 'auto',
        tokens: ['ST25DV', 'I2C', 'write', 'data']
    });
    assert.deepEqual(result.tokenMeanings, [
        { index: 0, token: 'ST25DV', meaning: '技术缩写或数字，保留原文', source: 'literal' },
        { index: 1, token: 'I2C', meaning: 'I²C 总线', source: 'local' },
        { index: 2, token: 'write', meaning: '写入', source: 'local' },
        { index: 3, token: 'data', meaning: '数据', source: 'local' }
    ]);
    assert.deepEqual(result.naming, {
        camelCase: 'st25dvI2cWriteData',
        pascalCase: 'St25dvI2cWriteData',
        snakeCase: 'st25dv_i2c_write_data',
        screamingSnakeCase: 'ST25DV_I2C_WRITE_DATA',
        kebabCase: 'st25dv-i2c-write-data'
    });
    assert.deepEqual(result.diagnostics, [{
        code: 'ai.request_failed',
        severity: 'warning',
        message: 'AI 请求未完成，已使用完整本地结果。',
        recoverable: true
    }]);
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /AIzaNotReal|x-goog-api-key|example\.invalid|raw response|\/home\/user|stack/i);
    assert.deepEqual(result.presentation, {
        preferredDensity: 'minimal',
        initiallyExpanded: ['diagnostics']
    });
    assert.equal(result.plainText, [
        '函数名：ST25DV_i2c_WriteData',
        '词语拆分：ST25DV · I2C · write · data',
        '核心释义：ST25DV I2C 写入数据',
        '词义：',
        '- ST25DV：技术缩写或数字，保留原文',
        '- I2C：I²C 总线',
        '- write：写入',
        '- data：数据',
        '命名：',
        '- camelCase：st25dvI2cWriteData',
        '- PascalCase：St25dvI2cWriteData',
        '- snake_case：st25dv_i2c_write_data',
        '- SCREAMING_SNAKE_CASE：ST25DV_I2C_WRITE_DATA',
        '- kebab-case：st25dv-i2c-write-data',
        '诊断：AI 请求未完成，已使用完整本地结果。'
    ].join('\n'));
});


test('词典底层错误只转换为固定脱敏诊断', () => {
    const fixture = localFixture({
        input: 'getValue',
        detectedType: 'function',
        words: ['get', 'Value'],
        programmingText: '获取值',
        meanings: [
            { token: 'get', meaning: '获取' },
            { token: 'Value', meaning: '值' }
        ]
    });
    fixture.sections.warning = 'SELECT * FROM dictionary; sqlite:/home/user/private/dictionary.db';

    const result = createProgrammerResultV1(
        fixture.model,
        fixture.sections,
        { status: 'skipped', reason: 'off' }
    );

    assert.deepEqual(result.diagnostics, [{
        code: 'dictionary.unavailable',
        severity: 'warning',
        message: '普通英语词典暂不可用；已保留本地编程语义。',
        recoverable: true
    }]);
    assert.doesNotMatch(JSON.stringify(result), /SELECT|sqlite:|dictionary\.db|\/home\/user/i);
});

test('summary.fallback 仅允许与 local_fallback 同时为 true', () => {
    const result = createNfcResult();
    const invalidLocal = clone(result);
    invalidLocal.summary.fallback = true;
    assert.throws(() => assertValidProgrammerResultV1(invalidLocal), /fallback/);

    const invalidFallback = clone(result);
    invalidFallback.summary.source = 'local_fallback';
    assert.throws(() => assertValidProgrammerResultV1(invalidFallback), /fallback/);
});

test('token 数量、index 或 token 不匹配时拒绝结果', () => {
    const result = createNfcResult();

    const missing = clone(result);
    missing.tokenMeanings.pop();
    assert.throws(() => assertValidProgrammerResultV1(missing), /tokenMeanings/);

    const wrongIndex = clone(result);
    wrongIndex.tokenMeanings[1].index = 9;
    assert.throws(() => assertValidProgrammerResultV1(wrongIndex), /index/);

    const wrongToken = clone(result);
    wrongToken.tokenMeanings[2].token = 'U32';
    assert.throws(() => assertValidProgrammerResultV1(wrongToken), /token/);
});

test('缺少任一 naming 固定键时不能生成有效 v1', () => {
    const result = createNfcResult();
    for (const key of NAMING_KEYS) {
        const invalid = clone(result);
        delete invalid.naming[key];
        assert.equal(isProgrammerResultV1(invalid), false, key);
        assert.throws(() => assertValidProgrammerResultV1(invalid), /naming/);
    }
});

test('非法 summary.source 不能生成有效 v1', () => {
    const result = createNfcResult();
    result.summary.source = 'remote';

    assert.equal(isProgrammerResultV1(result), false);
    assert.throws(() => assertValidProgrammerResultV1(result), /summary\.source/);
});

test('敏感 diagnostic 与不安全 plainText 不能进入有效 v1', () => {
    const result = createNfcResult();
    result.diagnostics = [{
        code: 'ai.request_failed',
        severity: 'warning',
        message: '请求头 x-goog-api-key: AIzaNotReal，URL https://example.invalid',
        recoverable: true
    }];
    result.plainText += `\n诊断：${result.diagnostics[0].message}`;

    assert.equal(isProgrammerResultV1(result), false);
    assert.throws(() => assertValidProgrammerResultV1(result), /敏感/);
});

test('plainText 缺少逐词详情或五种命名时不是完整结果', () => {
    const result = createNfcResult();
    const summaryOnly = clone(result);
    summaryOnly.plainText = result.summary.text;
    assert.throws(() => assertValidProgrammerResultV1(summaryOnly), /plainText/);

    const missingNaming = clone(result);
    missingNaming.plainText = missingNaming.plainText.replace(/\n- kebab-case：[^\n]+/, '');
    assert.throws(() => assertValidProgrammerResultV1(missingNaming), /plainText/);
});

test('presentation 缺失或非法不影响核心协议有效性', () => {
    const withoutPresentation = createNfcResult();
    delete withoutPresentation.presentation;
    assert.equal(isProgrammerResultV1(withoutPresentation), true);

    const fixture = localFixture({
        input: 'RxBufLen',
        detectedType: 'class',
        words: ['Rx', 'Buf', 'Len'],
        programmingText: '接收缓冲区长度',
        meanings: [
            { token: 'Rx', meaning: '接收' },
            { token: 'Buf', meaning: '缓冲区' },
            { token: 'Len', meaning: '长度' }
        ]
    });
    const omitted = createProgrammerResultV1(
        fixture.model,
        fixture.sections,
        { status: 'skipped', reason: 'off' },
        { preferredDensity: 'dense', initiallyExpanded: ['unknown', 1] }
    );
    assert.equal(Object.hasOwn(omitted, 'presentation'), false);
    assert.equal(isProgrammerResultV1(omitted), true);

    const manuallyInvalid = createNfcResult();
    manuallyInvalid.presentation = { preferredDensity: 'dense', initiallyExpanded: 'all' };
    assert.equal(isProgrammerResultV1(manuallyInvalid), true);
});

test('序列化不修改 model、sections、Gemini 结果或 presentation', () => {
    const fixture = localFixture({
        input: 'getCustomxyzValue',
        detectedType: 'function',
        words: ['get', 'Customxyz', 'Value'],
        programmingText: '获取自定义 XYZ 值',
        meanings: [
            { token: 'get', meaning: '获取' },
            { token: 'Customxyz', meaning: '未收录' },
            { token: 'Value', meaning: '值' }
        ]
    });
    const geminiResult = {
        status: 'success',
        translatedWords: { Customxyz: '自定义 XYZ' },
        semanticDescription: '获取自定义 XYZ 值'
    };
    const presentation = { preferredDensity: 'minimal', initiallyExpanded: [] };
    const snapshots = [fixture.model, fixture.sections, geminiResult, presentation].map(clone);
    deepFreeze(fixture.model);
    deepFreeze(fixture.sections);
    deepFreeze(geminiResult);
    deepFreeze(presentation);

    createProgrammerResultV1(fixture.model, fixture.sections, geminiResult, presentation);

    assert.deepEqual(fixture.model, snapshots[0]);
    assert.deepEqual(fixture.sections, snapshots[1]);
    assert.deepEqual(geminiResult, snapshots[2]);
    assert.deepEqual(presentation, snapshots[3]);
});
