/**
 * Gemini 可选语义增强层。
 *
 * 本文件在第一层运行时之后拼接。标识符拆分、缩写边界和命名格式始终由
 * 第一层本地算法负责；Gemini 只解释未知 token 或补充上下文中文含义。
 */
const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_GEMINI_REQUEST_TOKENS = 12;
const MAX_GEMINI_UNKNOWN_TOKENS = 8;
const MAX_GEMINI_TOKEN_LENGTH = 64;
const MAX_GEMINI_WORD_TRANSLATION_LENGTH = 120;
const MAX_GEMINI_DESCRIPTION_LENGTH = 300;
const MAX_GEMINI_RESPONSE_TEXT_LENGTH = 4000;
const MAX_GEMINI_TOTAL_RESULT_LENGTH = 1200;
const DEFAULT_GEMINI_TIMEOUT_MS = 15000;

function normalizeAiMode(value) {
    return ['off', 'unknown_only', 'always'].includes(value) ? value : 'off';
}

function normalizeSendScope(value) {
    return value === 'identifier' ? 'identifier' : 'unknown_tokens';
}

function normalizeGeminiModel(value) {
    const model = String(value || '').trim();
    if (!model) return DEFAULT_GEMINI_MODEL;
    if (model.length > 80 || !/^[A-Za-z0-9._-]+$/.test(model)) return '';
    return model;
}

function normalizedUniqueTokens(tokens, limit) {
    const result = [];
    const seen = new Set();
    for (const rawToken of tokens || []) {
        const token = String(rawToken || '').trim();
        if (!token || token.length > MAX_GEMINI_TOKEN_LENGTH || seen.has(token)) continue;
        seen.add(token);
        result.push(token);
        if (result.length >= limit) break;
    }
    return result;
}

function semanticUnknownWords(words, reportedUnknownWords) {
    const reported = new Set((reportedUnknownWords || []).map(lowerWord));
    return normalizedUniqueTokens(
        (words || [])
            .filter((word) => reported.has(lowerWord(word)))
            .filter((word) => !canonicalAcronym(word) && !programmingTerm(word))
            .map(lowerWord),
        MAX_GEMINI_UNKNOWN_TOKENS
    );
}

function minimalAdjacentTokens(words, requestedTokens) {
    const requested = new Set((requestedTokens || []).map(lowerWord));
    const selectedIndexes = new Set();
    (words || []).forEach((word, index) => {
        if (!requested.has(lowerWord(word))) return;
        if (index > 0) selectedIndexes.add(index - 1);
        selectedIndexes.add(index);
        if (index + 1 < words.length) selectedIndexes.add(index + 1);
    });
    return normalizedUniqueTokens(
        [...selectedIndexes].sort((a, b) => a - b).map((index) => words[index]),
        MAX_GEMINI_REQUEST_TOKENS
    );
}

function createGeminiRequestContext({ input, words, unknownWords, config }) {
    const aiMode = normalizeAiMode(config && config.aiMode);
    const sendScope = normalizeSendScope(config && config.sendScope);
    const semanticUnknown = semanticUnknownWords(words, unknownWords);
    const allTokens = normalizedUniqueTokens(words, MAX_GEMINI_REQUEST_TOKENS);

    if (aiMode === 'off') {
        return { shouldRequest: false, reason: 'off', requestedTokens: [], payload: null };
    }
    if (aiMode === 'unknown_only' && semanticUnknown.length === 0) {
        return { shouldRequest: false, reason: 'local_hit', requestedTokens: [], payload: null };
    }

    const requestedTokens = aiMode === 'unknown_only' ? semanticUnknown : allTokens;
    if (requestedTokens.length === 0) {
        return { shouldRequest: false, reason: 'no_tokens', requestedTokens: [], payload: null };
    }

    const payload = {
        task: '解释程序标识符 token 的中文语义',
        requestedTokens,
        contextTokens: aiMode === 'unknown_only'
            ? minimalAdjacentTokens(words, requestedTokens)
            : allTokens
    };
    if (sendScope === 'identifier') {
        payload.identifier = String(input || '').slice(0, 500);
    }
    return { shouldRequest: true, reason: '', requestedTokens, payload };
}

function createGeminiRequestBody(payload) {
    return {
        systemInstruction: {
            parts: [{
                text: [
                    '你是程序标识符语义解释器。',
                    '只解释请求 JSON 中 requestedTokens 的中文语义，并结合 contextTokens 给出简短上下文说明。',
                    '不得推断或输出源码、文件路径、项目名称或请求中不存在的 token。',
                    '只返回严格 JSON，不要 Markdown，不要代码围栏。',
                    '返回字段必须且只能是 translatedWords 与 semanticDescription。',
                    'translatedWords 的键只能来自 requestedTokens。'
                ].join('')
            }]
        },
        contents: [{
            role: 'user',
            parts: [{ text: JSON.stringify(payload) }]
        }],
        generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 512
        }
    };
}

function extractGeminiText(responseData) {
    let data = responseData;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (_) {
            return '';
        }
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.candidates)) return '';
    const candidate = data.candidates[0];
    if (!candidate || !candidate.content || !Array.isArray(candidate.content.parts)) return '';
    return candidate.content.parts
        .map((part) => part && typeof part.text === 'string' ? part.text : '')
        .join('')
        .trim();
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

function validateGeminiResponseText(text, requestedTokens) {
    const rawText = String(text || '').trim();
    if (!rawText || rawText.length > MAX_GEMINI_RESPONSE_TEXT_LENGTH || rawText.includes('```')) {
        return { ok: false, reason: 'invalid_text' };
    }

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch (_) {
        return { ok: false, reason: 'invalid_json' };
    }
    if (!isPlainObject(parsed)) return { ok: false, reason: 'invalid_shape' };

    const allowedTopLevel = new Set(['translatedWords', 'semanticDescription']);
    const topLevelKeys = Object.keys(parsed);
    if (topLevelKeys.length !== 2 || topLevelKeys.some((key) => !allowedTopLevel.has(key))) {
        return { ok: false, reason: 'extra_fields' };
    }
    if (!isPlainObject(parsed.translatedWords) || typeof parsed.semanticDescription !== 'string') {
        return { ok: false, reason: 'invalid_fields' };
    }

    const allowedTokens = new Set(requestedTokens || []);
    const translatedEntries = Object.entries(parsed.translatedWords);
    if (translatedEntries.length > allowedTokens.size || translatedEntries.length > MAX_GEMINI_REQUEST_TOKENS) {
        return { ok: false, reason: 'too_many_tokens' };
    }

    let totalLength = 0;
    const translatedWords = {};
    for (const [token, translation] of translatedEntries) {
        if (!allowedTokens.has(token) || typeof translation !== 'string') {
            return { ok: false, reason: 'unknown_token_key' };
        }
        const value = translation.trim();
        if (!value || value.length > MAX_GEMINI_WORD_TRANSLATION_LENGTH || value.includes('```')) {
            return { ok: false, reason: 'invalid_translation' };
        }
        totalLength += token.length + value.length;
        translatedWords[token] = value;
    }

    const semanticDescription = parsed.semanticDescription.trim();
    if (!semanticDescription || semanticDescription.length > MAX_GEMINI_DESCRIPTION_LENGTH
        || semanticDescription.includes('```')) {
        return { ok: false, reason: 'invalid_description' };
    }
    totalLength += semanticDescription.length;
    if (totalLength > MAX_GEMINI_TOTAL_RESULT_LENGTH) {
        return { ok: false, reason: 'result_too_long' };
    }

    return {
        ok: true,
        translatedWords,
        semanticDescription
    };
}

function withGeminiTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('gemini_timeout')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

async function resolveGeminiSemantics({ input, words, unknownWords, localProgrammingText, config = {}, utils = {} }) {
    const requestContext = createGeminiRequestContext({ input, words, unknownWords, config });
    if (!requestContext.shouldRequest) {
        return { status: 'skipped', reason: requestContext.reason };
    }

    const apiKey = String(config.apiKey || '').trim();
    if (!apiKey) return { status: 'skipped', reason: 'missing_key' };

    const model = normalizeGeminiModel(config.model);
    if (!model) return { status: 'failed', reason: 'invalid_model' };

    const fetch = utils.tauriFetch;
    if (typeof fetch !== 'function') return { status: 'failed', reason: 'network_unavailable' };

    const requestPayload = {
        ...requestContext.payload,
        localMeaning: normalizeAiMode(config.aiMode) === 'always'
            ? String(localProgrammingText || '').slice(0, 300)
            : undefined
    };
    if (requestPayload.localMeaning === undefined) delete requestPayload.localMeaning;
    const requestBody = createGeminiRequestBody(requestPayload);
    const Body = utils.http && utils.http.Body;
    const body = Body && typeof Body.json === 'function'
        ? Body.json(requestBody)
        : { type: 'Json', payload: requestBody };
    const configuredTimeout = Number(config.geminiTimeoutMs);
    const timeoutMs = Number.isFinite(configuredTimeout)
        ? Math.max(1, Math.min(configuredTimeout, 30000))
        : DEFAULT_GEMINI_TIMEOUT_MS;

    try {
        const response = await withGeminiTimeout(
            fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body,
                responseType: 1,
                timeout: Math.max(1, Math.ceil(timeoutMs / 1000))
            }),
            timeoutMs
        );
        if (!response || response.ok !== true) {
            const status = response && Number.isFinite(Number(response.status))
                ? Number(response.status)
                : 0;
            return { status: 'failed', reason: status ? `http_${status}` : 'http_error' };
        }

        const responseText = extractGeminiText(response.data);
        const validated = validateGeminiResponseText(responseText, requestContext.requestedTokens);
        if (!validated.ok) return { status: 'failed', reason: validated.reason };
        return {
            status: 'success',
            translatedWords: validated.translatedWords,
            semanticDescription: validated.semanticDescription
        };
    } catch (error) {
        return {
            status: 'failed',
            reason: error && error.message === 'gemini_timeout' ? 'timeout' : 'network_error'
        };
    }
}

function appendGeminiSection(localText, result) {
    if (!result || result.status !== 'success') return localText;
    const lines = [String(localText), '', `AI 语义增强：${result.semanticDescription}`];
    const entries = Object.entries(result.translatedWords || {});
    if (entries.length > 0) {
        lines.push(`AI 未知词：${entries.map(([token, value]) => `${token}：${value}`).join('；')}`);
    }
    return lines.join('\n');
}

async function translate(text, _from, _to, options = {}) {
    const model = prepareIdentifier(text, options.config || {});
    if (model.outputStyle !== 'report' && model.outputStyle !== 'chinese') {
        return formatByStyle(model.words, model.outputStyle, model.acronymStyle);
    }

    const sections = await buildDictionarySections(model, options);
    const localText = model.outputStyle === 'chinese'
        ? renderChineseOnly(model, sections)
        : createReport(model, sections);
    const geminiResult = await resolveGeminiSemantics({
        input: model.input,
        words: model.words,
        unknownWords: sections.unknownWords,
        localProgrammingText: sections.programmingText,
        config: options.config || {},
        utils: options.utils || {}
    });
    return appendGeminiSection(localText, geminiResult);
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        DEFAULT_GEMINI_MODEL,
        appendGeminiSection,
        createGeminiRequestBody,
        createGeminiRequestContext,
        extractGeminiText,
        minimalAdjacentTokens,
        normalizeGeminiModel,
        resolveGeminiSemantics,
        semanticUnknownWords,
        translate,
        validateGeminiResponseText,
        withGeminiTimeout
    });
}
