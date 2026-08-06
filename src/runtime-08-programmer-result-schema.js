/**
 * pot.programmer-result.v1 纯序列化与校验模块。
 *
 * 本模块不接入 translate()，只把现有本地分析模型、词典区块和已校验的
 * Gemini 结果转换为完整结构化结果。所有输出均由新对象组成，不修改输入。
 */
const PROGRAMMER_RESULT_SCHEMA = 'pot.programmer-result.v1';
const PROGRAMMER_RESULT_SUMMARY_SOURCES = new Set(['local', 'local_ai', 'ai', 'local_fallback']);
const PROGRAMMER_RESULT_TOKEN_SOURCES = new Set(['local', 'ai', 'literal']);
const PROGRAMMER_RESULT_TYPES = new Set([
    'function', 'variable', 'boolean', 'class', 'constant', 'file', 'text', 'unknown'
]);
const PROGRAMMER_RESULT_DETECTION_MODES = new Set(['auto', 'configured']);
const PROGRAMMER_RESULT_NAMING_KEYS = [
    'camelCase', 'pascalCase', 'snakeCase', 'screamingSnakeCase', 'kebabCase'
];
const PROGRAMMER_RESULT_PRESENTATION_SECTIONS = new Set([
    'identifier', 'tokenMeanings', 'naming', 'diagnostics'
]);
const PROGRAMMER_RESULT_TYPE_LABELS = Object.freeze({
    function: '函数名',
    variable: '变量名',
    boolean: '布尔变量',
    class: '类名',
    constant: '常量/宏',
    file: '文件名',
    text: '文本',
    unknown: '未知类型'
});

function programmerResultIsPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function programmerResultText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function programmerResultCanonicalToken(token) {
    const value = programmerResultText(token);
    if (!value) return '';
    if (typeof canonicalAcronym === 'function') {
        try { return canonicalAcronym(value) || value; } catch (_) { /* 使用原始 token */ }
    }
    return value;
}

function programmerResultFallbackPascalToken(token) {
    const value = programmerResultText(token);
    if (!value) return '';
    if (/^[A-Za-z]\d+$/.test(value)) return `${value[0].toUpperCase()}${value.slice(1)}`;
    const lower = value.toLowerCase();
    return `${lower[0].toUpperCase()}${lower.slice(1)}`;
}

function programmerResultFallbackNaming(words) {
    const tokens = words.map(programmerResultText).filter(Boolean);
    const pascalTokens = tokens.map(programmerResultFallbackPascalToken);
    return {
        camelCase: tokens.length > 0
            ? `${tokens[0].toLowerCase()}${pascalTokens.slice(1).join('')}`
            : '',
        pascalCase: pascalTokens.join(''),
        snakeCase: tokens.map((token) => token.toLowerCase()).join('_'),
        screamingSnakeCase: tokens.map((token) => token.toUpperCase()).join('_'),
        kebabCase: tokens.map((token) => token.toLowerCase()).join('-')
    };
}

function programmerResultNaming(model, words) {
    const fallback = programmerResultFallbackNaming(words);
    const acronymStyle = programmerResultText(model && model.acronymStyle) || 'standard';
    const safeCall = (name, args, fallbackValue) => {
        try {
            if (name === 'camel' && typeof toCamelCase === 'function') return String(toCamelCase(...args));
            if (name === 'pascal' && typeof toPascalCase === 'function') return String(toPascalCase(...args));
            if (name === 'snake' && typeof toSnakeCase === 'function') return String(toSnakeCase(...args));
            if (name === 'screaming' && typeof toScreamingSnakeCase === 'function') return String(toScreamingSnakeCase(...args));
            if (name === 'kebab' && typeof toKebabCase === 'function') return String(toKebabCase(...args));
        } catch (_) { /* 使用独立纯函数回退 */ }
        return fallbackValue;
    };
    return {
        camelCase: safeCall('camel', [words, acronymStyle], fallback.camelCase),
        pascalCase: safeCall('pascal', [words, acronymStyle], fallback.pascalCase),
        snakeCase: safeCall('snake', [words], fallback.snakeCase),
        screamingSnakeCase: safeCall('screaming', [words], fallback.screamingSnakeCase),
        kebabCase: safeCall('kebab', [words], fallback.kebabCase)
    };
}

function programmerResultParseDictionaryLine(line) {
    const clean = String(line || '').replace(/^\s*-\s*/, '').trim();
    const separator = clean.indexOf('：');
    if (separator < 0) return { meaning: '', phonetic: '' };
    const label = clean.slice(0, separator).trim();
    const phoneticMatch = label.match(/\/([^/]+)\//);
    const rawMeaning = clean.slice(separator + 1).trim();
    const meaning = rawMeaning
        .replace(/(^|[；;])\s*[a-z]{1,5}\.\s*/gi, '$1')
        .replace(/^[；;\s]+|[；;\s]+$/g, '')
        .trim();
    return {
        meaning,
        phonetic: phoneticMatch ? phoneticMatch[1].trim() : ''
    };
}

function programmerResultLocalSemantic(words, index) {
    if (typeof localTechnicalGloss === 'function') {
        try {
            const technical = programmerResultText(localTechnicalGloss(words, index));
            if (technical) return technical;
        } catch (_) { /* 继续使用现有 sections */ }
    }
    if (typeof programmingTerm === 'function') {
        try {
            const programming = programmerResultText(programmingTerm(words[index]));
            if (programming) return programming;
        } catch (_) { /* 继续使用现有 sections */ }
    }
    return '';
}

function programmerResultAiTranslations(geminiResult) {
    const translations = new Map();
    if (!geminiResult || geminiResult.status !== 'success') return translations;
    for (const [token, meaning] of Object.entries(geminiResult.translatedWords || {})) {
        const key = programmerResultText(token).toLowerCase();
        const value = programmerResultText(meaning);
        if (key && value && !translations.has(key)) translations.set(key, value);
    }
    return translations;
}

function programmerResultTokenMeanings(words, sections, geminiResult) {
    const lines = Array.isArray(sections && sections.generalLines) ? sections.generalLines : [];
    const aiTranslations = programmerResultAiTranslations(geminiResult);
    return words.map((token, index) => {
        const parsed = programmerResultParseDictionaryLine(lines[index]);
        const deterministic = programmerResultLocalSemantic(words, index);
        const parsedUnknown = !parsed.meaning || /未收录|暂无中文释义/.test(parsed.meaning);
        const localMeaning = deterministic || (!parsedUnknown ? parsed.meaning : '');
        if (localMeaning) {
            const literal = /技术缩写或数字，保留原文/.test(localMeaning);
            const item = {
                index,
                token,
                meaning: localMeaning,
                source: literal ? 'literal' : 'local'
            };
            if (!literal && parsed.phonetic) item.phonetic = parsed.phonetic;
            return item;
        }

        const aiMeaning = aiTranslations.get(token.toLowerCase());
        if (aiMeaning) return { index, token, meaning: aiMeaning, source: 'ai' };

        return {
            index,
            token,
            meaning: parsed.meaning || '未收录，保留原文',
            source: 'literal'
        };
    });
}

function programmerResultSummary(sections, geminiResult, tokenMeanings) {
    const localText = programmerResultText(sections && sections.programmingText);
    const aiText = geminiResult && geminiResult.status === 'success'
        ? programmerResultText(geminiResult.semanticDescription)
        : '';
    let source = 'local';
    if (geminiResult && geminiResult.status === 'success') {
        source = tokenMeanings.some((item) => item.source === 'ai') ? 'local_ai' : 'ai';
    } else if (geminiResult && !(
        geminiResult.status === 'skipped'
        && ['off', 'local_hit', 'no_tokens'].includes(geminiResult.reason)
    )) {
        source = 'local_fallback';
    }
    return {
        text: aiText || localText,
        source,
        fallback: source === 'local_fallback'
    };
}

function programmerResultDiagnostics(sections, summary) {
    const diagnostics = [];
    if (programmerResultText(sections && sections.warning)) {
        diagnostics.push({
            code: 'dictionary.unavailable',
            severity: 'warning',
            message: '普通英语词典暂不可用；已保留本地编程语义。',
            recoverable: true
        });
    }
    if (summary.source === 'local_fallback') {
        diagnostics.push({
            code: 'ai.request_failed',
            severity: 'warning',
            message: 'AI 请求未完成，已使用完整本地结果。',
            recoverable: true
        });
    }
    return diagnostics;
}

function programmerResultPresentation(value) {
    if (!programmerResultIsPlainObject(value)) return null;
    if (!['minimal', 'report'].includes(value.preferredDensity)) return null;
    if (!Array.isArray(value.initiallyExpanded)) return null;
    if (value.initiallyExpanded.some((item) =>
        typeof item !== 'string' || !PROGRAMMER_RESULT_PRESENTATION_SECTIONS.has(item)
    )) return null;
    return {
        preferredDensity: value.preferredDensity,
        initiallyExpanded: [...new Set(value.initiallyExpanded)]
    };
}

function programmerResultPlainText(identifier, summary, tokenMeanings, naming, diagnostics) {
    const typeLabel = PROGRAMMER_RESULT_TYPE_LABELS[identifier.detectedType] || identifier.detectedType;
    const summaryLabel = summary.source === 'ai' ? 'AI 释义' : '核心释义';
    const lines = [
        `${typeLabel}：${identifier.original}`,
        `词语拆分：${identifier.tokens.join(' · ')}`,
        `${summaryLabel}：${summary.text}`,
        '词义：'
    ];
    for (const item of tokenMeanings) {
        const phonetic = item.phonetic ? ` /${item.phonetic}/` : '';
        const aiMark = item.source === 'ai' ? '〔AI〕' : '';
        lines.push(`- ${item.token}${phonetic}：${item.meaning}${aiMark}`);
    }
    lines.push(
        '命名：',
        `- camelCase：${naming.camelCase}`,
        `- PascalCase：${naming.pascalCase}`,
        `- snake_case：${naming.snakeCase}`,
        `- SCREAMING_SNAKE_CASE：${naming.screamingSnakeCase}`,
        `- kebab-case：${naming.kebabCase}`
    );
    for (const diagnostic of diagnostics) lines.push(`诊断：${diagnostic.message}`);
    return lines.join('\n');
}

function programmerResultContainsSensitiveText(value, includePaths = false) {
    const text = String(value || '');
    const basePatterns = [
        /AIza[0-9A-Za-z_-]{8,}/,
        /x-goog-api-key/i,
        /authorization\s*[:=]/i,
        /bearer\s+[A-Za-z0-9._-]+/i,
        /https?:\/\/\S+/i,
        /(?:请求头|Key\s*尾号|密钥尾号|完整\s*URL)/i,
        /\n\s*at\s+\S+\s*\(/i
    ];
    if (basePatterns.some((pattern) => pattern.test(text))) return true;
    if (!includePaths) return false;
    return [
        /\bsqlite:/i,
        /(?:[A-Za-z]:\\|\/(?:home|Users|var|tmp|private)\/)[^\s]+/,
        /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b[\s\S]{0,80}\b(?:FROM|INTO|TABLE|DATABASE|WHERE|SET|VALUES)\b/,
        /\b[\w.-]+\.db\b/i
    ].some((pattern) => pattern.test(text));
}

function programmerResultRequire(condition, message) {
    if (!condition) throw new TypeError(message);
}

function programmerResultAssertPlainTextComplete(result) {
    const text = result.plainText;
    programmerResultRequire(text.includes('词语拆分：'), 'plainText 缺少词语拆分');
    programmerResultRequire(text.includes('词义：'), 'plainText 缺少逐词详情');
    programmerResultRequire(text.includes('命名：'), 'plainText 缺少命名详情');
    programmerResultRequire(text.includes(result.identifier.original), 'plainText 缺少原始标识符');
    programmerResultRequire(text.includes(result.summary.text), 'plainText 缺少完整释义');
    for (const token of result.identifier.tokens) {
        programmerResultRequire(text.includes(token), `plainText 缺少 token：${token}`);
    }
    for (const item of result.tokenMeanings) {
        programmerResultRequire(
            text.includes(item.token) && text.includes(item.meaning),
            `plainText 缺少 token 含义：${item.token}`
        );
    }
    const labels = {
        camelCase: 'camelCase',
        pascalCase: 'PascalCase',
        snakeCase: 'snake_case',
        screamingSnakeCase: 'SCREAMING_SNAKE_CASE',
        kebabCase: 'kebab-case'
    };
    for (const key of PROGRAMMER_RESULT_NAMING_KEYS) {
        programmerResultRequire(
            text.includes(`${labels[key]}：${result.naming[key]}`),
            `plainText 缺少命名详情：${key}`
        );
    }
    for (const diagnostic of result.diagnostics) {
        programmerResultRequire(text.includes(diagnostic.message), 'plainText 缺少安全诊断');
    }
}

function assertValidProgrammerResultV1(result) {
    programmerResultRequire(programmerResultIsPlainObject(result), '结果必须是对象');
    programmerResultRequire(result.schema === PROGRAMMER_RESULT_SCHEMA, 'schema 非法');
    programmerResultRequire(typeof result.plainText === 'string' && result.plainText.trim(), 'plainText 必须是非空字符串');
    programmerResultRequire(!programmerResultContainsSensitiveText(result.plainText), 'plainText 包含敏感内容');

    programmerResultRequire(programmerResultIsPlainObject(result.summary), 'summary 必须是对象');
    programmerResultRequire(programmerResultText(result.summary.text), 'summary.text 必须是非空字符串');
    programmerResultRequire(PROGRAMMER_RESULT_SUMMARY_SOURCES.has(result.summary.source), 'summary.source 非法');
    programmerResultRequire(typeof result.summary.fallback === 'boolean', 'summary.fallback 必须是布尔值');
    programmerResultRequire(
        result.summary.fallback === (result.summary.source === 'local_fallback'),
        'summary.fallback 与 summary.source 不一致'
    );

    programmerResultRequire(programmerResultIsPlainObject(result.identifier), 'identifier 必须是对象');
    programmerResultRequire(programmerResultText(result.identifier.original), 'identifier.original 必须是非空字符串');
    programmerResultRequire(PROGRAMMER_RESULT_TYPES.has(result.identifier.detectedType), 'identifier.detectedType 非法');
    programmerResultRequire(PROGRAMMER_RESULT_DETECTION_MODES.has(result.identifier.detectionMode), 'identifier.detectionMode 非法');
    programmerResultRequire(
        Array.isArray(result.identifier.tokens)
        && result.identifier.tokens.length > 0
        && result.identifier.tokens.every((token) => programmerResultText(token)),
        'identifier.tokens 非法'
    );

    programmerResultRequire(Array.isArray(result.tokenMeanings), 'tokenMeanings 必须是数组');
    programmerResultRequire(
        result.tokenMeanings.length === result.identifier.tokens.length,
        'tokenMeanings 数量必须与 identifier.tokens 一致'
    );
    result.tokenMeanings.forEach((item, index) => {
        programmerResultRequire(programmerResultIsPlainObject(item), `tokenMeanings[${index}] 必须是对象`);
        programmerResultRequire(item.index === index, `tokenMeanings[${index}].index 非法`);
        programmerResultRequire(item.token === result.identifier.tokens[index], `tokenMeanings[${index}].token 不匹配`);
        programmerResultRequire(programmerResultText(item.meaning), `tokenMeanings[${index}].meaning 为空`);
        programmerResultRequire(PROGRAMMER_RESULT_TOKEN_SOURCES.has(item.source), `tokenMeanings[${index}].source 非法`);
        if (Object.hasOwn(item, 'phonetic')) {
            programmerResultRequire(item.source === 'local' && programmerResultText(item.phonetic), `tokenMeanings[${index}].phonetic 非法`);
        }
    });

    programmerResultRequire(programmerResultIsPlainObject(result.naming), 'naming 必须是对象');
    for (const key of PROGRAMMER_RESULT_NAMING_KEYS) {
        programmerResultRequire(typeof result.naming[key] === 'string', `naming 缺少固定键：${key}`);
    }

    programmerResultRequire(Array.isArray(result.diagnostics), 'diagnostics 必须是数组');
    result.diagnostics.forEach((diagnostic, index) => {
        programmerResultRequire(programmerResultIsPlainObject(diagnostic), `diagnostics[${index}] 必须是对象`);
        programmerResultRequire(/^[a-z][a-z0-9]*(?:\.[a-z0-9_]+)+$/.test(diagnostic.code), `diagnostics[${index}].code 非法`);
        programmerResultRequire(['info', 'warning', 'error'].includes(diagnostic.severity), `diagnostics[${index}].severity 非法`);
        programmerResultRequire(programmerResultText(diagnostic.message), `diagnostics[${index}].message 为空`);
        programmerResultRequire(typeof diagnostic.recoverable === 'boolean', `diagnostics[${index}].recoverable 非法`);
        programmerResultRequire(
            !programmerResultContainsSensitiveText(diagnostic.message, true),
            `diagnostics[${index}] 包含敏感内容`
        );
    });

    programmerResultAssertPlainTextComplete(result);
    return result;
}

function isProgrammerResultV1(result) {
    try {
        assertValidProgrammerResultV1(result);
        return true;
    } catch (_) {
        return false;
    }
}

function createProgrammerResultV1(model, sections, geminiResult, presentation) {
    programmerResultRequire(programmerResultIsPlainObject(model), 'model 必须是对象');
    programmerResultRequire(programmerResultIsPlainObject(sections), 'sections 必须是对象');
    const original = programmerResultText(model.input);
    const detectedType = PROGRAMMER_RESULT_TYPES.has(model.detectedType) ? model.detectedType : 'unknown';
    const words = Array.isArray(model.words)
        ? model.words.map(programmerResultCanonicalToken).filter(Boolean)
        : [];
    programmerResultRequire(original, 'model.input 必须是非空字符串');
    programmerResultRequire(words.length > 0, 'model.words 必须包含 token');

    const identifier = {
        original,
        detectedType,
        detectionMode: model.detectionMode === 'configured' ? 'configured' : 'auto',
        tokens: [...words]
    };
    const tokenMeanings = programmerResultTokenMeanings(words, sections, geminiResult);
    const summary = programmerResultSummary(sections, geminiResult, tokenMeanings);
    programmerResultRequire(summary.text, '无法生成非空 summary.text');
    const naming = programmerResultNaming(model, words);
    const diagnostics = programmerResultDiagnostics(sections, summary);
    const result = {
        schema: PROGRAMMER_RESULT_SCHEMA,
        plainText: '',
        summary,
        identifier,
        tokenMeanings,
        naming,
        diagnostics
    };
    result.plainText = programmerResultPlainText(identifier, summary, tokenMeanings, naming, diagnostics);
    const normalizedPresentation = programmerResultPresentation(presentation);
    if (normalizedPresentation) result.presentation = normalizedPresentation;
    return assertValidProgrammerResultV1(result);
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        PROGRAMMER_RESULT_SCHEMA,
        assertValidProgrammerResultV1,
        createProgrammerResultV1,
        isProgrammerResultV1
    });
}
