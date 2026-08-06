const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    PROGRAMMER_RESULT_V1_SCHEMA,
    DIRECT_OUTPUT_STYLES,
    normalizeProgrammerOutputStyle,
    hostSupportsProgrammerResultV1,
    decideProgrammerOutputRoute
} = require('../src/runtime-09-output-style-compat.js');

const LEGACY_DIRECT_STYLES = [
    'camel', 'pascal', 'snake', 'screaming', 'kebab', 'words', 'chinese'
];

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
    return value;
}

test('缺失、空值和未知输出模式规范化为 minimal', () => {
    for (const value of [undefined, null, '', '   ', 'unknown', false, 0, {}, []]) {
        assert.equal(normalizeProgrammerOutputStyle(value), 'minimal', String(value));
    }
});

test('minimal 与 report 保持不变', () => {
    assert.equal(normalizeProgrammerOutputStyle('minimal'), 'minimal');
    assert.equal(normalizeProgrammerOutputStyle('report'), 'report');
});

test('全部旧直接输出值保持不变', () => {
    assert.deepEqual(DIRECT_OUTPUT_STYLES, LEGACY_DIRECT_STYLES);
    for (const style of LEGACY_DIRECT_STYLES) {
        assert.equal(normalizeProgrammerOutputStyle(style), style);
    }
});

test('宿主只在 resultSchemas 精确包含 v1 时视为支持', () => {
    assert.equal(PROGRAMMER_RESULT_V1_SCHEMA, 'pot.programmer-result.v1');
    assert.equal(hostSupportsProgrammerResultV1({
        host: { resultSchemas: ['other.schema', PROGRAMMER_RESULT_V1_SCHEMA] }
    }), true);
    assert.equal(hostSupportsProgrammerResultV1({
        host: { resultSchemas: ['POT.PROGRAMMER-RESULT.V1'] }
    }), false);
    assert.equal(hostSupportsProgrammerResultV1({
        host: { resultSchemas: PROGRAMMER_RESULT_V1_SCHEMA }
    }), false);
    assert.equal(hostSupportsProgrammerResultV1({ setResult() {} }), false);
    assert.equal(hostSupportsProgrammerResultV1({}), false);
});

test('v1 宿主将 minimal 路由到结构化 minimal', () => {
    assert.deepEqual(
        decideProgrammerOutputRoute(
            { outputStyle: 'minimal' },
            { host: { resultSchemas: [PROGRAMMER_RESULT_V1_SCHEMA] } }
        ),
        {
            outputStyle: 'minimal',
            resultKind: 'structured',
            structuredDensity: 'minimal',
            legacyOutputStyle: 'report'
        }
    );
});

test('v1 宿主将 report 路由到结构化 report', () => {
    assert.deepEqual(
        decideProgrammerOutputRoute(
            { outputStyle: 'report' },
            { host: { resultSchemas: [PROGRAMMER_RESULT_V1_SCHEMA] } }
        ),
        {
            outputStyle: 'report',
            resultKind: 'structured',
            structuredDensity: 'report',
            legacyOutputStyle: 'report'
        }
    );
});

test('无 v1 能力时 minimal 与 report 都回退完整旧 report', () => {
    const fallbackOptions = [
        undefined,
        {},
        { host: {} },
        { host: { resultSchemas: PROGRAMMER_RESULT_V1_SCHEMA } },
        { host: { resultSchemas: ['POT.PROGRAMMER-RESULT.V1'] } },
        { setResult() {} }
    ];
    for (const options of fallbackOptions) {
        for (const outputStyle of ['minimal', 'report']) {
            assert.deepEqual(
                decideProgrammerOutputRoute({ outputStyle }, options),
                {
                    outputStyle,
                    resultKind: 'legacy-report',
                    structuredDensity: null,
                    legacyOutputStyle: 'report'
                }
            );
        }
    }
});

test('旧直接输出模式始终保持原字符串路由', () => {
    const options = { host: { resultSchemas: [PROGRAMMER_RESULT_V1_SCHEMA] } };
    for (const outputStyle of LEGACY_DIRECT_STYLES) {
        assert.deepEqual(
            decideProgrammerOutputRoute({ outputStyle }, options),
            {
                outputStyle,
                resultKind: 'direct',
                structuredDensity: null,
                legacyOutputStyle: outputStyle
            }
        );
    }
});

test('决策函数不修改 config 或 options', () => {
    const config = deepFreeze({ outputStyle: 'minimal', nested: { keep: true } });
    const options = deepFreeze({
        host: {
            resultSchemas: [PROGRAMMER_RESULT_V1_SCHEMA],
            extra: { keep: true }
        },
        setResult() {}
    });
    const configSnapshot = JSON.stringify(config);
    const optionsSnapshot = JSON.stringify(options);

    decideProgrammerOutputRoute(config, options);

    assert.equal(JSON.stringify(config), configSnapshot);
    assert.equal(JSON.stringify(options), optionsSnapshot);
});

test('info.json 将 minimal 设为首个默认选项并保留所有旧值', () => {
    const info = JSON.parse(fs.readFileSync(path.join(__dirname, '../info.json'), 'utf8'));
    const outputStyle = info.needs.find((item) => item.key === 'outputStyle');
    assert.ok(outputStyle);
    assert.deepEqual(Object.keys(outputStyle.options), [
        'minimal', 'report', ...LEGACY_DIRECT_STYLES
    ]);
    assert.match(outputStyle.options.minimal, /极简/);
    assert.equal(outputStyle.options.report, '完整分析');
});
