/**
 * Gemini 可选语义增强编排层。
 *
 * 标识符拆分、缩写边界和命名格式始终由第一层本地算法负责；Gemini 只解释
 * 未知 token 或补充最小上下文语义。Key 池与 Interactions 细节位于后续片段。
 */
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_MODEL_PRESETS = [
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite'
];
const MAX_GEMINI_REQUEST_TOKENS = 12;
const MAX_GEMINI_UNKNOWN_TOKENS = 8;
const MAX_GEMINI_TOKEN_LENGTH = 64;
const MAX_GEMINI_WORD_TRANSLATION_LENGTH = 120;
const MAX_GEMINI_DESCRIPTION_LENGTH = 300;
const MAX_GEMINI_RESPONSE_TEXT_LENGTH = 4000;
const MAX_GEMINI_TOTAL_RESULT_LENGTH = 1200;

function normalizeAiMode(value) {
    return ['off', 'unknown_only', 'always'].includes(value) ? value : 'off';
}

function normalizeSendScope(value) {
    return value === 'identifier' ? 'identifier' : 'unknown_tokens';
}

function normalizeCustomGeminiModel(value) {
    const model = String(value || '').trim();
    if (!model || model.length > 80 || !/^[A-Za-z0-9._-]+$/.test(model)) return '';
    if (model.startsWith('models/') || model.includes('/') || model.includes('?') || model.includes('#')) return '';
    return model;
}

function resolveGeminiModel(config = {}) {
    const preset = String(config.modelPreset || '').trim();
    if (preset) {
        if (GEMINI_MODEL_PRESETS.includes(preset)) return preset;
        if (preset === 'custom') return normalizeCustomGeminiModel(config.customModel);
        return '';
    }
    const legacy = String(config.model || '').trim();
    return legacy ? normalizeCustomGeminiModel(legacy) : DEFAULT_GEMINI_MODEL;
}

function normalizeGeminiModel(value) {
    return normalizeCustomGeminiModel(value) || (!String(value || '').trim() ? DEFAULT_GEMINI_MODEL : '');
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

    if (aiMode === 'off') return { shouldRequest: false, reason: 'off', requestedTokens: [], payload: null };
    if (aiMode === 'unknown_only' && semanticUnknown.length === 0) {
        return { shouldRequest: false, reason: 'local_hit', requestedTokens: [], payload: null };
    }
    const requestedTokens = aiMode === 'unknown_only' ? semanticUnknown : allTokens;
    if (requestedTokens.length === 0) return { shouldRequest: false, reason: 'no_tokens', requestedTokens: [], payload: null };

    const payload = {
        task: '解释程序标识符 token 的中文语义',
        requestedTokens,
        contextTokens: aiMode === 'unknown_only' ? minimalAdjacentTokens(words, requestedTokens) : allTokens
    };
    if (sendScope === 'identifier') payload.identifier = String(input || '').slice(0, 500);
    return { shouldRequest: true, reason: '', requestedTokens, payload };
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
    try { parsed = JSON.parse(rawText); } catch (_) { return { ok: false, reason: 'invalid_json' }; }
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
        if (!allowedTokens.has(token) || typeof translation !== 'string') return { ok: false, reason: 'unknown_token_key' };
        const value = translation.trim();
        if (!value || value.length > MAX_GEMINI_WORD_TRANSLATION_LENGTH || value.includes('```')) {
            return { ok: false, reason: 'invalid_translation' };
        }
        totalLength += token.length + value.length;
        translatedWords[token] = value;
    }
    const semanticDescription = parsed.semanticDescription.trim();
    if (!semanticDescription || semanticDescription.length > MAX_GEMINI_DESCRIPTION_LENGTH || semanticDescription.includes('```')) {
        return { ok: false, reason: 'invalid_description' };
    }
    totalLength += semanticDescription.length;
    if (totalLength > MAX_GEMINI_TOTAL_RESULT_LENGTH) return { ok: false, reason: 'result_too_long' };
    return { ok: true, translatedWords, semanticDescription };
}

async function safeStateCall(store, method, ...args) {
    if (!store || typeof store[method] !== 'function') return undefined;
    try { return await store[method](...args); } catch (_) { return undefined; }
}

async function resolveGeminiSemantics({ input, words, unknownWords, localProgrammingText, config = {}, utils = {} }) {
    const requestContext = createGeminiRequestContext({ input, words, unknownWords, config });
    if (!requestContext.shouldRequest) return { status: 'skipped', reason: requestContext.reason };

    const model = resolveGeminiModel(config);
    if (!model) return { status: 'failed', reason: 'invalid_model' };
    const parsedPool = parseGeminiKeyPool(config);
    if (!parsedPool.entries.some((entry) => entry.enabled)) return { status: 'skipped', reason: 'missing_key' };
    if (typeof utils.tauriFetch !== 'function') return { status: 'failed', reason: 'network_unavailable' };

    const requestPayload = {
        ...requestContext.payload,
        localMeaning: normalizeAiMode(config.aiMode) === 'always'
            ? String(localProgrammingText || '').slice(0, 300)
            : undefined
    };
    if (requestPayload.localMeaning === undefined) delete requestPayload.localMeaning;

    const now = typeof utils.geminiNow === 'function' ? utils.geminiNow : Date.now;
    const startedAt = now();
    const deadlineAt = startedAt + GEMINI_GLOBAL_DEADLINE_MS;
    let store = await createSqliteGeminiStateStore(utils);
    let snapshot = { activeFingerprint: '', states: new Map() };
    try {
        if (store) {
            await safeStateCall(store, 'initialize', parsedPool.entries.map((entry) => entry.fingerprint), startedAt);
            snapshot = await safeStateCall(store, 'snapshot') || snapshot;
        }
        const plan = createGeminiAttemptPlan(parsedPool.entries, snapshot, startedAt, config.maxKeyAttempts);
        if (!plan.length) return { status: 'skipped', reason: 'no_available_key' };
        const requestUtils = { ...utils, geminiTimeoutMs: config.geminiTimeoutMs };
        for (const entry of plan) {
            if (now() >= deadlineAt) return { status: 'failed', reason: 'global_deadline' };
            const outcome = await executeGeminiInteraction({
                keyEntry: entry,
                model,
                payload: requestPayload,
                utils: requestUtils,
                deadlineAt,
                now
            });
            if (outcome.outcome === 'success') {
                const validated = validateGeminiResponseText(outcome.text, requestContext.requestedTokens);
                if (!validated.ok) return { status: 'failed', reason: validated.reason };
                await safeStateCall(store, 'markSuccess', entry.fingerprint, now());
                return {
                    status: 'success',
                    translatedWords: validated.translatedWords,
                    semanticDescription: validated.semanticDescription
                };
            }
            if (outcome.invalid) await safeStateCall(store, 'markInvalid', entry.fingerprint, now());
            if (outcome.rateLimited) {
                const state = snapshot.states.get(entry.fingerprint) || {};
                const count = Number(state.rate_limit_count || 0) + 1;
                await safeStateCall(store, 'markCooldown', entry.fingerprint, now() + cooldownSeconds(count, outcome.response) * 1000, count, now());
            }
            if (outcome.outcome === 'stop') return { status: 'failed', reason: outcome.reason };
        }
        return { status: 'failed', reason: 'key_attempts_exhausted' };
    } finally {
        await safeStateCall(store, 'close');
        store = null;
    }
}

function appendGeminiSection(localText, result) {
    if (!result || result.status !== 'success') return localText;
    const lines = [String(localText), '', `AI 语义增强：${result.semanticDescription}`];
    const entries = Object.entries(result.translatedWords || {});
    if (entries.length > 0) lines.push(`AI 未知词：${entries.map(([token, value]) => `${token}：${value}`).join('；')}`);
    return lines.join('\n');
}

async function translate(text, _from, _to, options = {}) {
    const model = prepareIdentifier(text, options.config || {});
    if (model.outputStyle !== 'report' && model.outputStyle !== 'chinese') {
        return formatByStyle(model.words, model.outputStyle, model.acronymStyle);
    }
    const sections = await buildDictionarySections(model, options);
    const localText = model.outputStyle === 'chinese' ? renderChineseOnly(model, sections) : createReport(model, sections);
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
        GEMINI_MODEL_PRESETS,
        appendGeminiSection,
        createGeminiRequestContext,
        minimalAdjacentTokens,
        normalizeGeminiModel,
        resolveGeminiModel,
        resolveGeminiSemantics,
        semanticUnknownWords,
        translate,
        validateGeminiResponseText
    });
}
