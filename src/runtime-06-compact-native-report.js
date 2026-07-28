const COMPACT_NATIVE_ACRONYM_GLOSSES = Object.freeze({
    API: '应用程序编程接口'
});
const COMPACT_NATIVE_LINE_SEPARATOR = '\u2028';

function compactNativeGloss(value) {
    return String(value || '')
        .replace(/(^|；)\s*[a-z]{1,5}\.\s*/gi, '$1')
        .replace(/[；;]+/g, '、')
        .replace(/、{2,}/g, '、')
        .replace(/^、|、$/g, '')
        .trim();
}

function aiTranslatedWord(geminiResult, token) {
    if (!geminiResult || geminiResult.status !== 'success') return '';
    const translatedWords = geminiResult.translatedWords || {};
    const lower = lowerWord(token);
    for (const [key, value] of Object.entries(translatedWords)) {
        if (lowerWord(key) === lower) return String(value || '').trim();
    }
    return '';
}

/**
 * 在同一个“词义”分组中按原顺序展示全部词义。
 * 本地词典已有音标时保留音标；缩写、数字和 AI 补全项不伪造音标。
 */
function compactNativeDictionaryItems(lines, geminiResult) {
    const items = [];
    for (const line of lines || []) {
        const parsed = parseNativeDictionaryLine(line);
        const label = parsed.trait.replace(/^词义 · /, '').trim();
        const token = (label.match(/^([A-Za-z][A-Za-z0-9'_-]*)/) || [])[1] || label;
        const acronym = canonicalAcronym(token);
        const localGloss = compactNativeGloss(parsed.explain);
        const acronymGloss = acronym && COMPACT_NATIVE_ACRONYM_GLOSSES[acronym];

        if (acronymGloss) {
            items.push(`${label}：${acronymGloss}`);
            continue;
        }

        if (/未收录/.test(localGloss)) {
            const aiGloss = aiTranslatedWord(geminiResult, token);
            items.push(aiGloss ? `${label}：${aiGloss}〔AI〕` : `${label}：未收录`);
            continue;
        }

        items.push(`${label}：${localGloss || '未收录'}`);
    }
    return items;
}

function compactNativeDictionaryText(lines, geminiResult) {
    return compactNativeDictionaryItems(lines, geminiResult).join(COMPACT_NATIVE_LINE_SEPARATOR);
}

function compactAiText(geminiResult) {
    if (!geminiResult || geminiResult.status !== 'success') return '';
    return String(geminiResult.semanticDescription || '').trim();
}

function unresolvedUnknownWords(unknownWords, geminiResult) {
    return (unknownWords || []).filter((word) => !aiTranslatedWord(geminiResult, word));
}

function configShows(config, key) {
    return !config || config[key] !== 'hide';
}

/**
 * AI 成功时使用“AI 释义”作为顶部主释义；AI 不可用时回退“本地释义”。
 * 命名转换和状态提示可由用户独立隐藏，词义始终逐词换行展示。
 */
function createPotNativeReport(model, sections, geminiResult, config = {}) {
    const explanations = [
        {
            trait: TYPE_LABELS[model.detectedType] || model.detectedType,
            explains: [model.input]
        },
        {
            trait: '词语拆分',
            explains: [model.words.map((word) => canonicalAcronym(word) || word).join(' · ')]
        }
    ];

    const aiText = compactAiText(geminiResult);
    if (aiText) {
        explanations.push({ trait: 'AI 释义', explains: [aiText] });
    } else if (model.dictionaryMode === 'programming' || model.dictionaryMode === 'both') {
        explanations.push({ trait: '本地释义', explains: [sections.programmingText] });
    }

    if (model.dictionaryMode === 'general' || model.dictionaryMode === 'both') {
        const dictionaryText = compactNativeDictionaryText(sections.generalLines, geminiResult);
        if (dictionaryText) explanations.push({ trait: '词义', explains: [dictionaryText] });
    }

    if (configShows(config, 'showNamingConversions')) {
        explanations.push(
            {
                trait: '常用命名',
                explains: [[
                    `小驼峰：${toCamelCase(model.words, model.acronymStyle)}`,
                    `大驼峰：${toPascalCase(model.words, model.acronymStyle)}`
                ].join(COMPACT_NATIVE_LINE_SEPARATOR)]
            },
            {
                trait: '分隔命名',
                explains: [[
                    `下划线：${toSnakeCase(model.words)}`,
                    `短横线：${toKebabCase(model.words)}`
                ].join(COMPACT_NATIVE_LINE_SEPARATOR)]
            },
            {
                trait: '常量命名',
                explains: [`大写下划线：${toScreamingSnakeCase(model.words)}`]
            }
        );
    }

    const associations = [];
    if (configShows(config, 'showStatusMessages')) {
        const unresolved = unresolvedUnknownWords(sections.unknownWords, geminiResult);
        if (unresolved.length > 0) associations.push(`仍未收录：${unresolved.join(', ')}`);
        if (model.unknownChinese) associations.push(`未收录中文：${model.unknownChinese}`);
        if (sections.warning) associations.push(`词典状态：${sections.warning}`);

        if (!geminiResult || geminiResult.status !== 'success') {
            const reason = geminiResult && geminiResult.reason;
            if (reason === 'off') {
                associations.push('AI 状态：已关闭，仅显示本地结果。');
            } else if (reason === 'local_hit' || reason === 'no_tokens') {
                associations.push('AI 状态：本地已完整命中，本次未请求 AI。');
            } else if (reason === 'missing_key' || reason === 'no_available_key') {
                associations.push('AI 状态：没有可用 Key，已保留本地结果。');
            } else if (geminiResult && geminiResult.status === 'failed') {
                associations.push('AI 状态：请求未完成，已保留本地结果。');
            }
        }
    }

    return associations.length > 0 ? { explanations, associations } : { explanations };
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        COMPACT_NATIVE_LINE_SEPARATOR,
        aiTranslatedWord,
        compactAiText,
        compactNativeDictionaryItems,
        compactNativeDictionaryText,
        compactNativeGloss,
        configShows,
        createPotNativeReport,
        unresolvedUnknownWords
    });
}
