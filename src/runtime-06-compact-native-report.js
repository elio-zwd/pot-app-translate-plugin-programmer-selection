const COMPACT_NATIVE_PHRASE_GLOSSES = Object.freeze({
    'smoke test': '冒烟测试'
});
const COMPACT_NATIVE_ACRONYM_GLOSSES = Object.freeze({
    API: '应用程序编程接口'
});
const COMPACT_NATIVE_HIDDEN_TERMS = new Set(['gemini', 'pot']);
const DEFAULT_COMPACT_NATIVE_DICTIONARY_LIMIT = 3;
const COMPACT_NATIVE_LINE_SEPARATOR = '\u2028';

function compactNativeGloss(value) {
    return String(value || '')
        .replace(/(^|；)\s*[a-z]{1,5}\.\s*/gi, '$1')
        .replace(/[；;]+/g, '、')
        .replace(/、{2,}/g, '、')
        .replace(/^、|、$/g, '')
        .trim();
}

function indexNativeDictionaryLines(lines) {
    const entries = new Map();
    for (const line of lines || []) {
        const parsed = parseNativeDictionaryLine(line);
        const label = parsed.trait.replace(/^词义 · /, '').trim();
        const token = (label.match(/^([A-Za-z][A-Za-z0-9'_-]*)/) || [])[1];
        if (!token) continue;
        entries.set(lowerWord(token), {
            label,
            explain: compactNativeGloss(parsed.explain)
        });
    }
    return entries;
}

function compactNativeDictionaryItems(model, lines, limit = DEFAULT_COMPACT_NATIVE_DICTIONARY_LIMIT) {
    const words = model && Array.isArray(model.words) ? model.words : [];
    const lowerWords = words.map(lowerWord);
    const dictionaryEntries = indexNativeDictionaryLines(lines);
    const consumedIndexes = new Set();
    const regularItems = [];
    const phraseItems = [];
    const acronymItems = [];
    const seen = new Set();

    const pushUnique = (target, key, text) => {
        if (!text || seen.has(key)) return;
        seen.add(key);
        target.push(text);
    };

    const sortedPhrases = Object.entries(COMPACT_NATIVE_PHRASE_GLOSSES)
        .sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);
    for (let index = 0; index < lowerWords.length; index += 1) {
        for (const [phrase, gloss] of sortedPhrases) {
            const phraseWords = phrase.split(' ');
            if (lowerWords.slice(index, index + phraseWords.length).join(' ') !== phrase) continue;
            pushUnique(phraseItems, `phrase:${phrase}`, `${phrase}：${gloss}`);
            for (let offset = 0; offset < phraseWords.length; offset += 1) consumedIndexes.add(index + offset);
            index += phraseWords.length - 1;
            break;
        }
    }

    for (let index = 0; index < words.length; index += 1) {
        if (consumedIndexes.has(index)) continue;
        const word = words[index];
        const lower = lowerWords[index];
        if (COMPACT_NATIVE_HIDDEN_TERMS.has(lower) || canonicalAcronym(word)) continue;
        const entry = dictionaryEntries.get(lower);
        if (!entry || !entry.explain || /未收录|保留原文/.test(entry.explain)) continue;
        pushUnique(regularItems, `word:${lower}`, `${entry.label}：${entry.explain}`);
    }

    for (const word of words) {
        const acronym = canonicalAcronym(word);
        const gloss = acronym && COMPACT_NATIVE_ACRONYM_GLOSSES[acronym];
        if (!gloss) continue;
        pushUnique(acronymItems, `acronym:${acronym}`, `${acronym}：${gloss}`);
    }

    return [...regularItems, ...phraseItems, ...acronymItems].slice(0, limit);
}

function compactNativeDictionaryText(model, lines, limit = DEFAULT_COMPACT_NATIVE_DICTIONARY_LIMIT) {
    return compactNativeDictionaryItems(model, lines, limit).join(COMPACT_NATIVE_LINE_SEPARATOR);
}

function compactAiText(geminiResult) {
    if (!geminiResult || geminiResult.status !== 'success') return '';
    return String(geminiResult.semanticDescription || '').trim();
}

/**
 * Pot 原生报告采用紧凑分组，避免每个词义和命名格式各占一个独立分组。
 * 本地结果始终保留；AI 只解释整体语义，不显示逐 token 翻译，也不覆盖本地判断。
 */
function createPotNativeReport(model, sections, geminiResult) {
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

    if (model.dictionaryMode === 'programming' || model.dictionaryMode === 'both') {
        explanations.push({ trait: '本地释义', explains: [sections.programmingText] });
    }

    const aiText = compactAiText(geminiResult);
    if (aiText) explanations.push({ trait: 'AI 解释', explains: [aiText] });

    if (model.dictionaryMode === 'general' || model.dictionaryMode === 'both') {
        const dictionaryText = compactNativeDictionaryText(model, sections.generalLines);
        if (dictionaryText) explanations.push({ trait: '本地词义', explains: [dictionaryText] });
    }

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

    const associations = [];
    if (sections.unknownWords.length > 0) associations.push(`本地未收录：${sections.unknownWords.join(', ')}`);
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

    return associations.length > 0 ? { explanations, associations } : { explanations };
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        COMPACT_NATIVE_LINE_SEPARATOR,
        compactAiText,
        compactNativeDictionaryItems,
        compactNativeDictionaryText,
        compactNativeGloss,
        createPotNativeReport,
        indexNativeDictionaryLines
    });
}
