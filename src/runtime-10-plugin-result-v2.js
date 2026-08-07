const PLUGIN_RESULT_V2_VERSION = 2;

const PLUGIN_RESULT_V2_SUMMARY_SOURCES = Object.freeze({
    local: 'local',
    local_ai: 'mixed',
    ai: 'ai',
    local_fallback: 'local'
});
const PLUGIN_RESULT_V2_TOKEN_SOURCES = Object.freeze({
    local: 'local',
    ai: 'ai',
    literal: 'unknown'
});
const PLUGIN_RESULT_V2_SEVERITIES = new Set(['info', 'success', 'warning', 'error']);
const PLUGIN_RESULT_V2_NAMING_FIELDS = Object.freeze([
    ['小驼峰', 'camelCase'],
    ['大驼峰', 'pascalCase'],
    ['下划线', 'snakeCase'],
    ['大写下划线', 'screamingSnakeCase'],
    ['短横线', 'kebabCase']
]);
const PLUGIN_RESULT_V2_SENSITIVE_PATTERNS = Object.freeze([
    /AIza[0-9A-Za-z_-]{20,}/i,
    /x-goog-api-key/i,
    /authorization\s*:/i,
    /bearer\s+[0-9A-Za-z._-]+/i,
    /(?:api|access|secret)[-_ ]?key\s*[:=]/i,
    /key\s*(?:尾号|后四位|末四位)/i,
    /https?:\/\/[^\s]+/i,
    /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b[\s\S]*\b(?:FROM|INTO|TABLE|SET|VALUES)\b/i,
    /\bsqlite\s*:/i,
    /(?:^|[\s"'`])(?:[A-Za-z]:\\|\/(?:home|Users|var|tmp|data)\/)[^\s"'`]+/i,
    /(?:^|\n)\s*at\s+[^\n]+/i,
    /\b(?:dictionary|gemini_state|plugin_state)\.db\b/i,
    /(?:request|response)\s*(?:headers?|body)\s*[:=]/i
]);

function pluginResultV2IsPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pluginResultV2Text(value, field, { allowEmpty = false, preserve = false } = {}) {
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new Error(`社区结果 Schema V2 字段无效：${field}`);
    }
    const raw = String(value);
    const text = preserve ? raw : raw.trim();
    if (!allowEmpty && text.trim() === '') {
        throw new Error(`社区结果 Schema V2 字段为空：${field}`);
    }
    return text;
}

function pluginResultV2AssertSafeText(value, field) {
    const text = String(value || '');
    if (PLUGIN_RESULT_V2_SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
        throw new Error(`社区结果 Schema V2 拒绝敏感或不安全内容：${field}`);
    }
    return text;
}

function pluginResultV2ResolveV1Validator() {
    if (typeof assertValidProgrammerResultV1 === 'function') {
        return assertValidProgrammerResultV1;
    }
    if (typeof require === 'function') {
        try {
            return require('./runtime-08-programmer-result-schema.js').assertValidProgrammerResultV1;
        } catch (_) {
            return null;
        }
    }
    return null;
}

function pluginResultV2AssertV1(result) {
    const validator = pluginResultV2ResolveV1Validator();
    if (validator) return validator(result);

    if (!pluginResultV2IsPlainObject(result)
        || result.schema !== 'pot.programmer-result.v1'
        || typeof result.plainText !== 'string'
        || !pluginResultV2IsPlainObject(result.summary)
        || !pluginResultV2IsPlainObject(result.identifier)
        || !Array.isArray(result.tokenMeanings)
        || !pluginResultV2IsPlainObject(result.naming)
        || !Array.isArray(result.diagnostics)) {
        throw new Error('社区结果 Schema V2 只能从有效的程序员结果 v1 创建');
    }
    return result;
}

function pluginResultV2SafeDiagnosticCode(value) {
    const code = pluginResultV2Text(value, 'diagnostic.code');
    if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(code)) {
        throw new Error('社区结果 Schema V2 diagnostic code 无效');
    }
    return code;
}

function pluginResultV2DiagnosticId(code) {
    const suffix = code
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
    return `diagnostic-${suffix || 'status'}`;
}

function pluginResultV2SummarySection(v1) {
    const content = pluginResultV2AssertSafeText(
        pluginResultV2Text(v1.summary.text, 'summary.text'),
        'summary.text'
    );
    const source = PLUGIN_RESULT_V2_SUMMARY_SOURCES[v1.summary.source];
    if (!source) throw new Error('社区结果 Schema V2 summary source 无效');
    return {
        id: 'summary',
        type: 'summary',
        title: '核心释义',
        content,
        source,
        copyText: content
    };
}

function pluginResultV2IdentifierSection(v1) {
    const original = pluginResultV2AssertSafeText(
        pluginResultV2Text(v1.identifier.original, 'identifier.original'),
        'identifier.original'
    );
    const detectedType = pluginResultV2AssertSafeText(
        pluginResultV2Text(v1.identifier.detectedType, 'identifier.detectedType'),
        'identifier.detectedType'
    );
    const detectionMode = pluginResultV2AssertSafeText(
        pluginResultV2Text(v1.identifier.detectionMode, 'identifier.detectionMode'),
        'identifier.detectionMode'
    );
    if (!Array.isArray(v1.identifier.tokens)) {
        throw new Error('社区结果 Schema V2 identifier tokens 无效');
    }
    const tokens = v1.identifier.tokens.map((token, index) => pluginResultV2AssertSafeText(
        pluginResultV2Text(token, `identifier.tokens[${index}]`),
        `identifier.tokens[${index}]`
    ));
    return {
        id: 'identifier',
        type: 'metadata',
        title: '标识符信息',
        collapsible: true,
        defaultCollapsed: true,
        items: [
            { label: '类型', value: detectedType },
            { label: '原文', value: original, copyText: original },
            { label: '检测方式', value: detectionMode }
        ],
        tokens
    };
}

function pluginResultV2LiteralMeaning(meaning) {
    return meaning.includes('保留原文') ? meaning : `${meaning}（按原文保留）`;
}

function pluginResultV2DictionarySection(v1) {
    const items = v1.tokenMeanings.map((item, index) => {
        if (!pluginResultV2IsPlainObject(item)) {
            throw new Error(`社区结果 Schema V2 token meaning 无效：${index}`);
        }
        const token = pluginResultV2AssertSafeText(
            pluginResultV2Text(item.token, `tokenMeanings[${index}].token`),
            `tokenMeanings[${index}].token`
        );
        let meaning = pluginResultV2AssertSafeText(
            pluginResultV2Text(item.meaning, `tokenMeanings[${index}].meaning`),
            `tokenMeanings[${index}].meaning`
        );
        const source = PLUGIN_RESULT_V2_TOKEN_SOURCES[item.source];
        if (!source) throw new Error(`社区结果 Schema V2 token source 无效：${index}`);
        if (item.source === 'literal') meaning = pluginResultV2LiteralMeaning(meaning);

        const phonetic = typeof item.phonetic === 'string' && item.phonetic.trim()
            ? pluginResultV2AssertSafeText(item.phonetic.trim(), `tokenMeanings[${index}].phonetic`)
            : '';
        const result = {
            token,
            meaning,
            source,
            copyText: `${token}${phonetic ? ` /${phonetic}/` : ''}：${meaning}`
        };
        if (phonetic) result.phonetic = phonetic;
        return result;
    });
    return {
        id: 'token-meanings',
        type: 'dictionary',
        title: '逐词解释',
        collapsible: true,
        defaultCollapsed: true,
        items
    };
}

function pluginResultV2NamingSection(v1) {
    const items = [];
    for (const [label, key] of PLUGIN_RESULT_V2_NAMING_FIELDS) {
        const raw = v1.naming[key];
        if (typeof raw !== 'string' || raw.trim() === '') continue;
        const value = pluginResultV2AssertSafeText(raw.trim(), `naming.${key}`);
        items.push({ label, value, copyText: value });
    }
    return {
        id: 'naming',
        type: 'code-list',
        title: '命名转换',
        collapsible: true,
        defaultCollapsed: true,
        items
    };
}

function pluginResultV2StatusSection(diagnostic, id, defaultCollapsed) {
    if (!pluginResultV2IsPlainObject(diagnostic)) {
        throw new Error('社区结果 Schema V2 diagnostic 无效');
    }
    const code = pluginResultV2SafeDiagnosticCode(diagnostic.code);
    const message = pluginResultV2AssertSafeText(
        pluginResultV2Text(diagnostic.message, `diagnostic.${code}.message`),
        `diagnostic.${code}.message`
    );
    const severity = PLUGIN_RESULT_V2_SEVERITIES.has(diagnostic.severity)
        ? diagnostic.severity
        : 'info';
    const recoverable = diagnostic.recoverable === true;
    return {
        id,
        type: 'status',
        title: `诊断 · ${code}`,
        content: `${message}\n可恢复：${recoverable ? '是' : '否'}`,
        severity,
        copyText: message,
        collapsible: true,
        defaultCollapsed
    };
}

function pluginResultV2DiagnosticSections(v1) {
    const sections = [];
    const seenCodes = new Set();
    let fallbackHandled = false;

    for (const diagnostic of v1.diagnostics) {
        const code = pluginResultV2SafeDiagnosticCode(diagnostic.code);
        if (seenCodes.has(code)) continue;
        seenCodes.add(code);
        if (v1.summary.fallback === true && code === 'ai.request_failed') {
            sections.push(pluginResultV2StatusSection(diagnostic, 'summary-fallback', false));
            fallbackHandled = true;
            continue;
        }
        sections.push(pluginResultV2StatusSection(
            diagnostic,
            pluginResultV2DiagnosticId(code),
            true
        ));
    }

    if (v1.summary.fallback === true && !fallbackHandled) {
        sections.push(pluginResultV2StatusSection({
            code: 'ai.request_failed',
            severity: 'warning',
            message: 'AI 请求未完成，已使用完整本地结果。',
            recoverable: true
        }, 'summary-fallback', false));
    }
    return sections;
}

function isPluginResultV2(result) {
    try {
        return pluginResultV2IsPlainObject(result)
            && result.schemaVersion === PLUGIN_RESULT_V2_VERSION
            && typeof result.copyText === 'string'
            && Array.isArray(result.sections);
    } catch (_) {
        return false;
    }
}

function assertValidPluginResultV2(result) {
    if (!isPluginResultV2(result)) {
        throw new Error('社区结果 Schema V2 顶层结构无效');
    }
    const topKeys = Object.keys(result);
    if (topKeys.length !== 3
        || !topKeys.includes('schemaVersion')
        || !topKeys.includes('copyText')
        || !topKeys.includes('sections')) {
        throw new Error('社区结果 Schema V2 顶层字段无效');
    }
    pluginResultV2Text(result.copyText, 'copyText', { preserve: true });
    pluginResultV2AssertSafeText(result.copyText, 'copyText');

    const ids = new Set();
    const expectedLeadingIds = ['summary', 'identifier', 'token-meanings', 'naming'];
    for (let index = 0; index < result.sections.length; index += 1) {
        const section = result.sections[index];
        if (!pluginResultV2IsPlainObject(section)) {
            throw new Error(`社区结果 Schema V2 section 无效：${index}`);
        }
        const id = pluginResultV2Text(section.id, `sections[${index}].id`);
        if (!/^[A-Za-z0-9_-]+$/.test(id) || ids.has(id)) {
            throw new Error(`社区结果 Schema V2 section ID 无效或重复：${id}`);
        }
        ids.add(id);
        pluginResultV2AssertSafeText(JSON.stringify(section), `sections[${index}]`);
        if (index < expectedLeadingIds.length && id !== expectedLeadingIds[index]) {
            throw new Error('社区结果 Schema V2 固定 section 顺序无效');
        }
    }
    return result;
}

function createPluginResultV2(programmerResultV1) {
    const v1 = pluginResultV2AssertV1(programmerResultV1);
    const copyText = pluginResultV2AssertSafeText(
        pluginResultV2Text(v1.plainText, 'plainText', { preserve: true }),
        'plainText'
    );
    const result = {
        schemaVersion: PLUGIN_RESULT_V2_VERSION,
        copyText,
        sections: [
            pluginResultV2SummarySection(v1),
            pluginResultV2IdentifierSection(v1),
            pluginResultV2DictionarySection(v1),
            pluginResultV2NamingSection(v1),
            ...pluginResultV2DiagnosticSections(v1)
        ]
    };
    return assertValidPluginResultV2(result);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.PLUGIN_RESULT_V2_VERSION = PLUGIN_RESULT_V2_VERSION;
    module.exports.isPluginResultV2 = isPluginResultV2;
    module.exports.assertValidPluginResultV2 = assertValidPluginResultV2;
    module.exports.createPluginResultV2 = createPluginResultV2;
}
