const POT_NATIVE_CONTEXT_TERMS = Object.freeze({
    gemini: 'Gemini',
    real: '真实',
    pot: 'Pot',
    smoke: '冒烟',
    test: '测试'
});

/**
 * 为产品名和测试术语提供稳定的上下文含义，同时不把它们标记为本地完整命中。
 * 这样 unknown_only 仍可让 Gemini 解释 gemini、pot 等未知 token。
 */
function programmingPhraseParts(words, generalEntries = new Map()) {
    const lowerWords = words.map(lowerWord);
    const parts = [];
    const usedProgramming = new Set();
    let index = 0;
    while (index < words.length) {
        let phraseMatch = null;
        for (const [phrase, translation] of SORTED_PROGRAMMING_PHRASES) {
            const length = phrase.split(' ').length;
            if (lowerWords.slice(index, index + length).join(' ') === phrase) {
                phraseMatch = { length, translation };
                break;
            }
        }
        if (phraseMatch) {
            parts.push(phraseMatch.translation);
            for (let offset = 0; offset < phraseMatch.length; offset += 1) usedProgramming.add(index + offset);
            index += phraseMatch.length;
            continue;
        }

        const word = words[index];
        const lower = lowerWord(word);
        const acronym = canonicalAcronym(word);
        if (acronym) {
            parts.push(acronym);
            usedProgramming.add(index);
        } else if (programmingTerm(lower)) {
            parts.push(programmingTerm(lower));
            usedProgramming.add(index);
        } else if (POT_NATIVE_CONTEXT_TERMS[lower]) {
            parts.push(POT_NATIVE_CONTEXT_TERMS[lower]);
            usedProgramming.add(index);
        } else {
            const entry = generalEntries.get(lower);
            parts.push(conciseGloss(entry && entry.translation) || word);
        }
        index += 1;
    }
    return { text: joinChineseParts(parts), hasProgrammingMeaning: usedProgramming.size > 0 };
}

/**
 * Pot 会把同一路径的 Database.load 连接池跨调用复用。
 * 在真实 Pot 运行时主动 close 会让后续查询拿到已关闭池，因此交由 Pot 生命周期管理。
 * 无 setResult 的 Node/兼容调用仍关闭测试连接，维持原有独立调用语义。
 */
async function lookupGeneralDictionary(words, options = {}) {
    const Database = options.utils && options.utils.Database;
    if (!Database || typeof Database.load !== 'function') {
        return { entries: new Map(), warning: '普通英语词典未加载；当前结果仅使用内置编程术语。' };
    }

    const potManagedRuntime = typeof options.setResult === 'function';
    let db;
    try {
        db = await Database.load(DICTIONARY_DB_PATH);
        const rows = await selectDictionaryRows(db, words);
        const entries = new Map();
        for (const row of rows || []) entries.set(lowerWord(row.word), row);
        return { entries, warning: '' };
    } catch (_) {
        return {
            entries: new Map(),
            warning: '普通英语词典暂不可用；已保留内置编程释义。'
        };
    } finally {
        if (!potManagedRuntime && db && typeof db.close === 'function') {
            try { await db.close(); } catch (_) { /* 忽略关闭失败 */ }
        }
    }
}

function parseNativeDictionaryLine(line) {
    const clean = String(line || '').replace(/^\s*-\s*/, '').trim();
    const separator = clean.indexOf('：');
    if (separator < 0) return { trait: '词义', explain: clean };
    return {
        trait: `词义 · ${clean.slice(0, separator).trim()}`,
        explain: clean.slice(separator + 1).trim()
    };
}

function createPotNativeReport(model, sections, geminiResult) {
    const explanations = [
        {
            trait: TYPE_LABELS[model.detectedType] || model.detectedType,
            explains: [model.input]
        },
        {
            trait: '拆分',
            explains: [model.words.map((word) => canonicalAcronym(word) || word).join(' · ')]
        }
    ];

    if (model.dictionaryMode === 'programming' || model.dictionaryMode === 'both') {
        explanations.push({ trait: '核心含义', explains: [sections.programmingText] });
    }

    if (geminiResult && geminiResult.status === 'success') {
        explanations.push({ trait: 'AI 语义', explains: [geminiResult.semanticDescription] });
        for (const [token, value] of Object.entries(geminiResult.translatedWords || {})) {
            explanations.push({ trait: `AI · ${token}`, explains: [value] });
        }
    }

    if (model.dictionaryMode === 'general' || model.dictionaryMode === 'both') {
        for (const line of sections.generalLines) {
            const parsed = parseNativeDictionaryLine(line);
            explanations.push({ trait: parsed.trait, explains: [parsed.explain] });
        }
    }

    explanations.push(
        { trait: '命名 · camelCase', explains: [toCamelCase(model.words, model.acronymStyle)] },
        { trait: '命名 · PascalCase', explains: [toPascalCase(model.words, model.acronymStyle)] },
        { trait: '命名 · snake_case', explains: [toSnakeCase(model.words)] },
        { trait: '命名 · SCREAMING_SNAKE_CASE', explains: [toScreamingSnakeCase(model.words)] },
        { trait: '命名 · kebab-case', explains: [toKebabCase(model.words)] }
    );

    const associations = [];
    if (sections.unknownWords.length > 0) associations.push(`本地未收录：${sections.unknownWords.join(', ')}`);
    if (model.unknownChinese) associations.push(`未收录中文：${model.unknownChinese}`);
    if (sections.warning) associations.push(`词典状态：${sections.warning}`);

    if (!geminiResult || geminiResult.status !== 'success') {
        const reason = geminiResult && geminiResult.reason;
        if (reason === 'off') {
            associations.push('AI 状态：已关闭；在插件设置中选择“仅本地未知词”后才会请求 Gemini。');
        } else if (reason === 'local_hit' || reason === 'no_tokens') {
            associations.push('AI 状态：本地已完整命中，未发起网络请求。');
        } else if (reason === 'missing_key' || reason === 'no_available_key') {
            associations.push('AI 状态：未配置可用 Gemini Key，已使用本地结果。');
        } else if (geminiResult && geminiResult.status === 'failed') {
            associations.push('AI 状态：请求未完成，已保留完整本地结果。');
        }
    }

    return associations.length > 0 ? { explanations, associations } : { explanations };
}

async function translate(text, _from, _to, options = {}) {
    const config = options.config || {};
    const route = decideProgrammerOutputRoute(config, options);
    const model = prepareIdentifier(text, {
        ...config,
        outputStyle: route.outputStyle
    });

    if (route.resultKind === 'direct' && route.outputStyle !== 'chinese') {
        return formatByStyle(model.words, route.outputStyle, model.acronymStyle);
    }

    const sections = await buildDictionarySections(model, options);
    const geminiResult = await resolveGeminiSemantics({
        input: model.input,
        words: model.words,
        unknownWords: sections.unknownWords,
        localProgrammingText: sections.programmingText,
        config,
        utils: options.utils || {}
    });

    if (route.outputStyle === 'chinese') {
        return appendGeminiSection(renderChineseOnly(model, sections), geminiResult);
    }

    if (route.resultKind === 'structured') {
        const presentation = route.structuredDensity === 'report'
            ? {
                preferredDensity: 'report',
                initiallyExpanded: ['identifier', 'tokenMeanings', 'naming', 'diagnostics']
            }
            : {
                preferredDensity: 'minimal',
                initiallyExpanded: []
            };
        return createProgrammerResultV1(model, sections, geminiResult, presentation);
    }

    if (typeof options.setResult === 'function') {
        return createPotNativeReport(model, sections, geminiResult, config);
    }

    return appendGeminiSection(createReport(model, sections), geminiResult);
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        POT_NATIVE_CONTEXT_TERMS,
        createPotNativeReport,
        lookupGeneralDictionary,
        parseNativeDictionaryLine,
        programmingPhraseParts,
        translate
    });
}
