function compactNativeGloss(value) {
    return String(value || '')
        .replace(/(^|；)\s*[a-z]{1,5}\.\s*/gi, '$1')
        .replace(/；{2,}/g, '；')
        .trim();
}

function compactNativeDictionaryText(lines) {
    return (lines || [])
        .map((line) => {
            const parsed = parseNativeDictionaryLine(line);
            return `${parsed.trait.replace(/^词义 · /, '')}：${compactNativeGloss(parsed.explain)}`;
        })
        .join('；');
}

function compactAiText(geminiResult) {
    if (!geminiResult || geminiResult.status !== 'success') return '';
    const tokenText = Object.entries(geminiResult.translatedWords || {})
        .map(([token, value]) => `${token}：${value}`)
        .join('；');
    return tokenText
        ? `${geminiResult.semanticDescription}；词语补充：${tokenText}`
        : geminiResult.semanticDescription;
}

/**
 * Pot 原生报告采用紧凑分组，避免每个词义和命名格式各占一整行。
 * 本地结果始终保留；AI 成功时作为独立补充显示，不覆盖本地判断。
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
        explanations.push({ trait: '本地含义', explains: [sections.programmingText] });
    }

    const aiText = compactAiText(geminiResult);
    if (aiText) explanations.push({ trait: 'AI 补充', explains: [aiText] });

    if (model.dictionaryMode === 'general' || model.dictionaryMode === 'both') {
        const dictionaryText = compactNativeDictionaryText(sections.generalLines);
        if (dictionaryText) explanations.push({ trait: '本地词义', explains: [dictionaryText] });
    }

    explanations.push(
        {
            trait: '常用命名',
            explains: [`小驼峰：${toCamelCase(model.words, model.acronymStyle)}　大驼峰：${toPascalCase(model.words, model.acronymStyle)}`]
        },
        {
            trait: '分隔命名',
            explains: [`下划线：${toSnakeCase(model.words)}　短横线：${toKebabCase(model.words)}`]
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
        compactAiText,
        compactNativeDictionaryText,
        compactNativeGloss,
        createPotNativeReport
    });
}
