/**
 * 本地复合缩写、固定宽度数据类型与字节序语义解析。
 *
 * 本片段位于现有运行时之后，只覆盖本地纯函数和 AI 请求上下文边界，
 * 不修改 Key 池、模型路由、Interactions API 或状态数据库实现。
 */
const LOCAL_FIXED_WIDTH_TYPES = Object.freeze({
    U8: { kind: 'integer', bits: 8, signed: false, gloss: '8 位无符号整数' },
    U16: { kind: 'integer', bits: 16, signed: false, gloss: '16 位无符号整数' },
    U24: { kind: 'integer', bits: 24, signed: false, gloss: '24 位无符号整数' },
    U32: { kind: 'integer', bits: 32, signed: false, gloss: '32 位无符号整数' },
    U64: { kind: 'integer', bits: 64, signed: false, gloss: '64 位无符号整数' },
    S8: { kind: 'integer', bits: 8, signed: true, gloss: '8 位有符号整数' },
    S16: { kind: 'integer', bits: 16, signed: true, gloss: '16 位有符号整数' },
    S24: { kind: 'integer', bits: 24, signed: true, gloss: '24 位有符号整数' },
    S32: { kind: 'integer', bits: 32, signed: true, gloss: '32 位有符号整数' },
    S64: { kind: 'integer', bits: 64, signed: true, gloss: '64 位有符号整数' },
    I8: { kind: 'integer', bits: 8, signed: true, gloss: '8 位有符号整数' },
    I16: { kind: 'integer', bits: 16, signed: true, gloss: '16 位有符号整数' },
    I32: { kind: 'integer', bits: 32, signed: true, gloss: '32 位有符号整数' },
    I64: { kind: 'integer', bits: 64, signed: true, gloss: '64 位有符号整数' },
    F32: { kind: 'float', bits: 32, gloss: '32 位浮点数' },
    F64: { kind: 'float', bits: 64, gloss: '64 位浮点数' }
});

const LOCAL_ENDIAN_TOKENS = Object.freeze({
    LE: { endian: 'little', gloss: '小端序' },
    BE: { endian: 'big', gloss: '大端序' }
});

const LOCAL_PROGRAMMING_ABBREVIATIONS = Object.freeze({
    buf: '缓冲区',
    len: '长度',
    cfg: '配置',
    addr: '地址',
    ptr: '指针',
    idx: '索引',
    cnt: '计数',
    num: '数量',
    seq: '序号',
    tmp: '临时',
    src: '源',
    dst: '目标'
});

const LOCAL_RX_TX_CONTEXT = new Set([
    'buf', 'buffer', 'packet', 'frame', 'data', 'queue', 'count', 'cnt', 'len',
    'length', 'byte', 'bytes', 'message', 'response', 'command', 'register', 'reg'
]);

const LOCAL_COMMUNICATION_DEVICE_ACRONYMS = new Set([
    'NFC', 'I2C', 'SPI', 'UART', 'USART', 'CAN', 'RS232', 'RS485', 'BLE', 'USB'
]);

const LOCAL_ACRONYM_GLOSSES = Object.freeze({
    NFC: '近场通信',
    CRC: '循环冗余校验',
    CRC8: '8 位循环冗余校验',
    CRC16: '16 位循环冗余校验',
    CRC32: '32 位循环冗余校验',
    IPv4: '互联网协议第 4 版',
    IPv6: '互联网协议第 6 版',
    UTF8: 'UTF-8 编码',
    RS232: 'RS-232 串行通信标准',
    RS485: 'RS-485 串行通信标准',
    I2C: 'I²C 总线'
});

for (const acronym of ['CRC8', 'CRC16', 'CRC32']) {
    if (!ACRONYM_MAP.has(acronym.toLowerCase())) {
        KNOWN_ACRONYMS.push(acronym);
        ACRONYM_MAP.set(acronym.toLowerCase(), acronym);
        SORTED_ACRONYMS.push(acronym);
    }
}
SORTED_ACRONYMS.sort((a, b) => b.length - a.length);

if (!SORTED_PROGRAMMING_PHRASES.some(([phrase]) => phrase === 'packet count')) {
    PROGRAMMING_PHRASES['packet count'] = '数据包计数';
    SORTED_PROGRAMMING_PHRASES.push(['packet count', '数据包计数']);
    SORTED_PROGRAMMING_PHRASES.sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);
}

function parseFixedWidthTypeToken(token) {
    const canonical = String(token || '').trim().toUpperCase();
    const value = LOCAL_FIXED_WIDTH_TYPES[canonical];
    return value ? { canonical, ...value } : null;
}

function parseEndianToken(token) {
    const canonical = String(token || '').trim().toUpperCase();
    const value = LOCAL_ENDIAN_TOKENS[canonical];
    return value ? { canonical, ...value } : null;
}

function splitCompositeTechnicalChunk(chunk) {
    const clean = String(chunk || '').trim();
    const match = clean.match(/^(read|write|parse)([USIF])(8|16|24|32|64)(LE|BE)?(value)?$/i);
    if (!match) return null;
    const type = parseFixedWidthTypeToken(`${match[2]}${match[3]}`);
    if (!type) return null;
    return [
        match[1].toLowerCase(),
        type.canonical,
        ...(match[4] ? [match[4].toUpperCase()] : []),
        ...(match[5] ? ['value'] : [])
    ];
}

function mergeFixedWidthTypeWithinChunk(tokens) {
    const result = [];
    for (let index = 0; index < (tokens || []).length; index += 1) {
        const current = String(tokens[index] || '');
        const next = String(tokens[index + 1] || '');
        const candidate = /^[USIF]$/i.test(current) && /^\d+$/.test(next)
            ? `${current.toUpperCase()}${next}`
            : '';
        if (candidate && parseFixedWidthTypeToken(candidate)) {
            result.push(candidate);
            index += 1;
        } else {
            result.push(current);
        }
    }
    return result;
}

function canonicalizeEndianAfterType(words) {
    return (words || []).map((word, index, allWords) => {
        const endian = parseEndianToken(word);
        return endian && index > 0 && parseFixedWidthTypeToken(allWords[index - 1])
            ? endian.canonical
            : word;
    });
}

function splitIdentifier(input) {
    const cleaned = String(input)
        .trim()
        .replace(/^[\'"`]+|[\'"`;]+$/g, '')
        .replace(/\(\s*\)$/, '')
        .replace(/[\s_.\-/:\\]+/g, ' ');
    const words = cleaned.split(/\s+/)
        .flatMap((chunk) => splitCompositeTechnicalChunk(chunk) || mergeFixedWidthTypeWithinChunk(splitChunk(chunk)))
        .filter(Boolean);
    return canonicalizeEndianAfterType(words);
}

function tokenizeChinese(input) {
    const words = [];
    const unknown = [];
    let index = 0;
    while (index < input.length) {
        const rest = input.slice(index);
        const whitespace = rest.match(/^\s+/);
        if (whitespace) {
            index += whitespace[0].length;
            continue;
        }
        const ascii = rest.match(/^[A-Za-z][A-Za-z0-9]*/);
        if (ascii) {
            words.push(...(splitCompositeTechnicalChunk(ascii[0]) || mergeFixedWidthTypeWithinChunk(splitChunk(ascii[0]))));
            index += ascii[0].length;
            continue;
        }
        let matched = false;
        for (const [phrase, tokens] of SORTED_CHINESE_PHRASES) {
            if (rest.startsWith(phrase)) {
                words.push(...tokens.map((token) => canonicalAcronym(token) || token.toLowerCase()));
                index += phrase.length;
                matched = true;
                break;
            }
        }
        if (matched) continue;
        const char = input[index];
        if (/[,，。.!！?？、;；:：()（）]/.test(char)) {
            index += 1;
            continue;
        }
        unknown.push(char);
        index += 1;
    }
    return {
        words: canonicalizeEndianAfterType(words),
        unknown: [...new Set(unknown)].join('')
    };
}

function isRxTxContext(words, index) {
    const lower = lowerWord(words[index]);
    if (lower !== 'rx' && lower !== 'tx') return false;
    return LOCAL_RX_TX_CONTEXT.has(lowerWord(words[index + 1] || ''));
}

function expandProgrammingAbbreviation(words, index) {
    const lower = lowerWord(words[index]);
    if (lower === 'rx') return isRxTxContext(words, index) ? '接收' : '';
    if (lower === 'tx') return isRxTxContext(words, index) ? '发送' : '';
    return LOCAL_PROGRAMMING_ABBREVIATIONS[lower] || '';
}

function localTechnicalSemanticPart(words, index) {
    const type = parseFixedWidthTypeToken(words[index]);
    if (type) return type.gloss;
    const endian = parseEndianToken(words[index]);
    if (endian && index > 0 && parseFixedWidthTypeToken(words[index - 1])) return endian.gloss;
    return expandProgrammingAbbreviation(words, index);
}

function localTechnicalGloss(words, index) {
    const semantic = localTechnicalSemanticPart(words, index);
    if (semantic) return semantic;
    const acronym = canonicalAcronym(words[index]);
    return acronym ? (LOCAL_ACRONYM_GLOSSES[acronym] || '') : '';
}

function buildTypedOperationDescription(words) {
    const lowerWords = (words || []).map(lowerWord);
    const typeIndex = words.findIndex((word) => parseFixedWidthTypeToken(word));
    const firstAcronym = canonicalAcronym(words[0]);

    if (words.length === 2 && /^CRC(?:8|16|32)$/.test(firstAcronym || '') && lowerWords[1] === 'check') {
        return `${firstAcronym} 校验`;
    }
    if (typeIndex < 0) return '';

    const type = parseFixedWidthTypeToken(words[typeIndex]);
    const endian = parseEndianToken(words[typeIndex + 1]);
    const suffixIndex = typeIndex + (endian ? 2 : 1);
    const suffixWords = lowerWords.slice(suffixIndex);
    if (suffixWords.some((word) => word !== 'value')) return '';

    const actionIndex = lowerWords.findIndex((word) => ['read', 'write', 'parse'].includes(word));
    if (actionIndex < 0 || actionIndex >= typeIndex) return '';
    if (lowerWords.slice(actionIndex + 1, typeIndex).length > 0) return '';

    const actionGloss = programmingTerm(lowerWords[actionIndex]);
    const valueSuffix = suffixWords.includes('value') ? '值' : '';
    const endianGloss = endian ? endian.gloss : '';
    const prefixAcronyms = words.slice(0, actionIndex).map(canonicalAcronym);
    const hasCommunicationPrefix = prefixAcronyms.length > 0
        && prefixAcronyms.every((acronym) => acronym && LOCAL_COMMUNICATION_DEVICE_ACRONYMS.has(acronym));

    if (hasCommunicationPrefix && lowerWords[actionIndex] === 'write') {
        const prefix = prefixAcronyms.join(' ');
        const endianLead = endianGloss ? `以${endianGloss}` : '';
        return `${endianLead}向 ${prefix} 设备${actionGloss} ${type.gloss}${valueSuffix}`;
    }

    return `${actionGloss}${endianGloss ? `${endianGloss} ` : ' '}${type.gloss}${valueSuffix}`;
}

function programmingPhraseParts(words, generalEntries = new Map()) {
    const typedDescription = buildTypedOperationDescription(words);
    if (typedDescription) return { text: typedDescription, hasProgrammingMeaning: true };

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
        const technical = localTechnicalSemanticPart(words, index);
        const acronym = canonicalAcronym(word);
        if (technical) {
            parts.push(technical);
            usedProgramming.add(index);
        } else if (acronym) {
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

function formatGeneralDictionary(words, entries) {
    const lines = [];
    const unknownWords = [];
    for (let index = 0; index < words.length; index += 1) {
        const word = words[index];
        const lower = lowerWord(word);
        const entry = entries.get(lower);
        const acronym = canonicalAcronym(word);
        const technicalGloss = localTechnicalGloss(words, index);
        const label = parseFixedWidthTypeToken(word)?.canonical
            || (parseEndianToken(word) && index > 0 && parseFixedWidthTypeToken(words[index - 1])
                ? parseEndianToken(word).canonical
                : (acronym || lower));

        if (technicalGloss) {
            lines.push(`- ${label}：${technicalGloss}`);
        } else if (entry) {
            const phonetic = entry.phonetic ? ` /${entry.phonetic}/` : '';
            const lemma = entry.lemma && lowerWord(entry.lemma) !== lower ? `（原形：${entry.lemma}）` : '';
            const senses = generalEntryLines(entry);
            lines.push(`- ${acronym || lower}${phonetic}${lemma}：${senses.join('；') || '暂无中文释义'}`);
        } else if (acronym || /^\d+$/.test(lower)) {
            const acronymGloss = acronym && LOCAL_ACRONYM_GLOSSES[acronym];
            lines.push(`- ${acronym || word}：${acronymGloss || '技术缩写或数字，保留原文'}`);
        } else {
            lines.push(`- ${lower}：未收录`);
            unknownWords.push(lower);
        }
    }
    return { lines, unknownWords: [...new Set(unknownWords)] };
}

function detectIdentifierType(input, words) {
    const original = String(input).trim();
    const lowerWords = words.map(lowerWord);
    const firstWord = lowerWords[0];
    const lastWord = lowerWords[lowerWords.length - 1];
    if (/^[A-Z][A-Z0-9_]*$/.test(original) && original.includes('_')) return 'constant';
    if (BOOLEAN_PREFIXES.has(firstWord)) return 'boolean';
    if (/[.\-]/.test(original)) return 'file';
    if (FUNCTION_PREFIXES.has(firstWord) || FUNCTION_SUFFIXES.has(lastWord)) return 'function';
    const vendorActionIndex = lowerWords.findIndex((word, index) =>
        index > 0 && ACTION_WORDS.has(word) && words.slice(0, index).every((prefix) => isAcronym(prefix))
    );
    if (vendorActionIndex >= 0) return 'function';
    if (/^[A-Z][A-Za-z0-9]*$/.test(original) && !/^[A-Z0-9]+$/.test(original)) return 'class';
    return 'variable';
}

function createGeminiRequestContext({ input, words, unknownWords, config }) {
    const aiMode = normalizeAiMode(config && config.aiMode);
    const sendScope = normalizeSendScope(config && config.sendScope);
    const semanticUnknown = semanticUnknownWords(words, unknownWords);
    const allTokens = normalizedUniqueTokens(words, MAX_GEMINI_REQUEST_TOKENS);

    if (aiMode === 'off') return { shouldRequest: false, reason: 'off', requestedTokens: [], payload: null };
    if (aiMode === 'unknown_only' && semanticUnknown.length === 0) {
        return { shouldRequest: false, reason: 'local_hit', requestedTokens: [], payload: null };
    }
    if (allTokens.length === 0) return { shouldRequest: false, reason: 'no_tokens', requestedTokens: [], payload: null };

    const requestedTokens = semanticUnknown;
    const payload = {
        task: '解释程序标识符 token 的中文语义',
        requestedTokens,
        contextTokens: aiMode === 'unknown_only'
            ? minimalAdjacentTokens(words, requestedTokens)
            : allTokens
    };
    if (sendScope === 'identifier') payload.identifier = String(input || '').slice(0, 500);
    return { shouldRequest: true, reason: '', requestedTokens, payload };
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        LOCAL_ACRONYM_GLOSSES,
        LOCAL_FIXED_WIDTH_TYPES,
        LOCAL_PROGRAMMING_ABBREVIATIONS,
        buildTypedOperationDescription,
        createGeminiRequestContext,
        detectIdentifierType,
        expandProgrammingAbbreviation,
        formatGeneralDictionary,
        localTechnicalGloss,
        mergeFixedWidthTypeWithinChunk,
        parseEndianToken,
        parseFixedWidthTypeToken,
        programmingPhraseParts,
        splitCompositeTechnicalChunk,
        splitIdentifier,
        tokenizeChinese
    });
}
