const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readInfo() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../info.json'), 'utf8'));
}

const EXPECTED_KEYS = [
    'outputStyle',
    'dictionaryMode',
    'identifierType',
    'acronymStyle',
    'showNamingConversions',
    'showStatusMessages',
    'aiMode',
    'apiKeyPool',
    'maxKeyAttempts',
    'modelPreset',
    'customModel',
    'sendScope'
];

const EXPECTED_OPTIONS = {
    outputStyle: {
        minimal: '极简结果（默认）',
        report: '完整分析',
        camel: '小驼峰命名',
        pascal: '大驼峰命名',
        snake: '下划线命名',
        screaming: '大写下划线命名',
        kebab: '短横线命名',
        words: '拆分词组',
        chinese: '仅中文含义'
    },
    dictionaryMode: {
        both: '编程术语 + 普通词义',
        programming: '仅编程术语优先',
        general: '仅普通英语词典'
    },
    identifierType: {
        auto: '自动判断',
        function: '函数名',
        variable: '变量名',
        boolean: '布尔变量',
        class: '类名',
        constant: '常量/宏',
        file: '文件名'
    },
    acronymStyle: {
        standard: '标准驼峰（HTTP → Http）',
        preserve: '保留大写（HTTP → HTTP）'
    },
    showNamingConversions: {
        show: '显示（默认）',
        hide: '不显示'
    },
    showStatusMessages: {
        show: '显示（默认）',
        hide: '不显示'
    },
    aiMode: {
        off: '关闭，仅使用本地结果（默认）',
        unknown_only: '智能补全本地未知词（推荐）',
        always: '每次使用 AI，并与本地结果同时显示'
    },
    maxKeyAttempts: {
        v5: '5（默认）',
        v1: '1',
        v3: '3',
        v10: '10',
        v20: '20'
    },
    modelPreset: {
        'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite（默认，快速低成本）',
        'gemini-3.6-flash': 'Gemini 3.6 Flash',
        'gemini-3.5-flash': 'Gemini 3.5 Flash',
        'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
        custom: '自定义模型'
    },
    sendScope: {
        unknown_tokens: '仅 token（默认）',
        identifier: '完整标识符'
    }
};

function fieldsByKey(info) {
    return new Map(info.needs.map((field) => [field.key, field]));
}

test('设置 Schema V2 保留全部旧键、顺序、类型和选项值', () => {
    const info = readInfo();
    const fields = fieldsByKey(info);

    assert.deepEqual(info.needs.map((field) => field.key), EXPECTED_KEYS);
    for (const [key, options] of Object.entries(EXPECTED_OPTIONS)) {
        assert.equal(fields.get(key).type, 'select', key);
        assert.deepEqual(fields.get(key).options, options, key);
    }
    assert.equal(fields.get('apiKeyPool').type, 'input');
    assert.equal(fields.get('customModel').type, 'input');
});

test('设置项按基础、结果与命名、AI 凭据、高级 AI 四组排列', () => {
    const info = readInfo();
    const actual = info.needs.map((field) => [field.key, field.group]);
    assert.deepEqual(actual, [
        ['outputStyle', 'basic'],
        ['dictionaryMode', 'basic'],
        ['identifierType', 'basic'],
        ['acronymStyle', 'result_display'],
        ['showNamingConversions', 'result_display'],
        ['showStatusMessages', 'result_display'],
        ['aiMode', 'basic'],
        ['apiKeyPool', 'ai_credentials'],
        ['maxKeyAttempts', 'advanced_ai'],
        ['modelPreset', 'advanced_ai'],
        ['customModel', 'advanced_ai'],
        ['sendScope', 'advanced_ai']
    ]);

    const fields = fieldsByKey(info);
    assert.equal(fields.get('outputStyle').groupDisplay, '基础使用');
    assert.equal(fields.get('acronymStyle').groupDisplay, '结果与命名');
    assert.equal(fields.get('apiKeyPool').groupDisplay, 'AI 凭据');
    assert.equal(fields.get('maxKeyAttempts').groupDisplay, '高级 AI');
    assert.equal(fields.get('maxKeyAttempts').groupAdvanced, true);
});

test('apiKeyPool 使用遮罩、多行输入、合理行数和 aiMode 条件', () => {
    const field = fieldsByKey(readInfo()).get('apiKeyPool');
    assert.equal(field.key, 'apiKeyPool');
    assert.equal(field.type, 'input');
    assert.equal(field.secret, true);
    assert.equal(field.multiline, true);
    assert.equal(field.rows, 4);
    assert.deepEqual(field.visibleWhen, {
        key: 'aiMode',
        operator: 'notEquals',
        value: 'off'
    });
    assert.match(field.description, /遮罩/);
    assert.match(field.description, /不代表加密|并非加密/);
    assert.match(field.description, /每行/);
    assert.doesNotMatch(field.description, /网络校验|自动验证有效/);
});

test('高级 AI 设置只在 AI 开启时显示，自定义模型仅在 custom 时显示', () => {
    const fields = fieldsByKey(readInfo());
    for (const key of ['maxKeyAttempts', 'modelPreset', 'sendScope']) {
        assert.deepEqual(fields.get(key).visibleWhen, {
            key: 'aiMode',
            operator: 'notEquals',
            value: 'off'
        }, key);
    }
    assert.deepEqual(fields.get('customModel').visibleWhen, {
        key: 'modelPreset',
        operator: 'equals',
        value: 'custom'
    });
});

test('高级 AI 组默认折叠且不使用旧临时 Schema 字段', () => {
    const info = readInfo();
    const advanced = info.needs.filter((field) => field.group === 'advanced_ai');
    assert.ok(advanced.length > 0);
    assert.equal(advanced[0].groupAdvanced, true);

    for (const field of info.needs) {
        assert.notEqual(field.type, 'secret', field.key);
        assert.notEqual(field.type, 'section', field.key);
        assert.equal(Object.hasOwn(field, 'section'), false, field.key);
        if (field.visibleWhen) {
            assert.ok(['equals', 'notEquals', 'in', 'notIn'].includes(field.visibleWhen.operator), field.key);
            assert.equal(Object.hasOwn(field.visibleWhen, 'value'), true, field.key);
            assert.equal(Object.hasOwn(field.visibleWhen, 'equals'), false, field.key);
            assert.equal(Object.hasOwn(field.visibleWhen, 'notEquals'), false, field.key);
            assert.equal(Object.hasOwn(field.visibleWhen, 'oneOf'), false, field.key);
        }
    }
});

test('配置描述不包含真实 Key fixture，JSON 仍可安全解析', () => {
    const raw = fs.readFileSync(path.join(__dirname, '../info.json'), 'utf8');
    assert.doesNotMatch(raw, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotThrow(() => JSON.parse(raw));
});
