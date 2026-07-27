/**
 * Gemini Interactions API 请求、响应解析与错误分类。
 */
const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_GLOBAL_DEADLINE_MS = 30000;
const DEFAULT_GEMINI_TIMEOUT_MS = 15000;

function createGeminiInteractionBody(model, payload) {
    return {
        model,
        input: JSON.stringify(payload),
        system_instruction: [
            '你是程序标识符语义解释器。',
            '只解释请求 JSON 中 requestedTokens 的中文语义，并结合 contextTokens 给出简短上下文说明。',
            '不得推断或输出源码、文件路径、项目名称或请求中不存在的 token。',
            '只返回严格 JSON，不要 Markdown，不要代码围栏。',
            '返回字段必须且只能是 translatedWords 与 semanticDescription。',
            'translatedWords 的键只能来自 requestedTokens。'
        ].join(''),
        response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: {
                type: 'object',
                properties: {
                    translatedWords: {
                        type: 'object',
                        additionalProperties: { type: 'string' }
                    },
                    semanticDescription: { type: 'string' }
                },
                required: ['translatedWords', 'semanticDescription'],
                additionalProperties: false
            }
        },
        generation_config: { max_output_tokens: 512 },
        store: false,
        stream: false,
        background: false
    };
}

function extractInteractionText(responseData) {
    let data = responseData;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { return { ok: false, reason: 'invalid_interaction_json' }; }
    }
    if (!data || typeof data !== 'object') return { ok: false, reason: 'invalid_interaction_shape' };
    if (data.status !== 'completed') return { ok: false, reason: `interaction_${String(data.status || 'missing_status')}` };
    if (!Array.isArray(data.steps)) return { ok: false, reason: 'missing_steps' };
    const pieces = [];
    for (const step of data.steps) {
        if (!step || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
        for (const content of step.content) {
            if (content && content.type === 'text' && typeof content.text === 'string') pieces.push(content.text);
        }
    }
    const text = pieces.join('').trim();
    return text ? { ok: true, text } : { ok: false, reason: 'empty_model_output' };
}

function responseStatus(response) {
    const value = response && Number(response.status);
    return Number.isFinite(value) ? value : 0;
}

function responseHeader(response, name) {
    const headers = response && response.headers;
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
    const expected = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) if (String(key).toLowerCase() === expected) return String(value);
    return '';
}

function retryAfterSeconds(response) {
    const value = String(responseHeader(response, 'Retry-After') || '').trim();
    return /^\d+$/.test(value) ? Number(value) : 0;
}

function cooldownSeconds(rateLimitCount, response) {
    const explicit = retryAfterSeconds(response);
    if (explicit > 0) return explicit;
    if (rateLimitCount <= 1) return 60;
    if (rateLimitCount === 2) return 300;
    if (rateLimitCount === 3) return 1800;
    return 86400;
}

function classifyGeminiFailure(status, retryIndex, networkFailure) {
    if (networkFailure) return retryIndex < 1 ? 'retry' : 'switch';
    if (status === 400 || status === 404) return 'stop';
    if (status === 401 || status === 403 || status === 429) return 'switch';
    if (status === 408) return retryIndex < 1 ? 'retry' : 'switch';
    if (status >= 500 && status <= 599) return retryIndex < 2 ? 'retry' : 'switch';
    return 'stop';
}

function withGeminiTimeout(promise, timeoutMs, timers = {}) {
    const setTimer = timers.setTimeout || setTimeout;
    const clearTimer = timers.clearTimeout || clearTimeout;
    return new Promise((resolve, reject) => {
        const timer = setTimer(() => reject(new Error('gemini_timeout')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimer(timer); resolve(value); },
            (error) => { clearTimer(timer); reject(error); }
        );
    });
}

async function executeGeminiInteraction({ keyEntry, model, payload, utils, deadlineAt, now }) {
    const fetch = utils.tauriFetch;
    const Body = utils.http && utils.http.Body;
    const requestBody = createGeminiInteractionBody(model, payload);
    const body = Body && typeof Body.json === 'function'
        ? Body.json(requestBody)
        : { type: 'Json', payload: requestBody };
    let retryIndex = 0;
    while (true) {
        const current = now();
        const remaining = deadlineAt - current;
        if (remaining <= 0) return { outcome: 'stop', reason: 'global_deadline' };
        const configured = Number(utils.geminiTimeoutMs);
        const singleTimeout = Number.isFinite(configured) ? Math.max(1, Math.min(configured, DEFAULT_GEMINI_TIMEOUT_MS)) : DEFAULT_GEMINI_TIMEOUT_MS;
        const timeoutMs = Math.max(1, Math.min(singleTimeout, remaining));
        try {
            const response = await withGeminiTimeout(fetch(GEMINI_INTERACTIONS_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': keyEntry.key
                },
                body,
                responseType: 1,
                timeout: Math.max(1, Math.ceil(timeoutMs / 1000))
            }), timeoutMs, utils);
            if (response && response.ok === true) {
                const extracted = extractInteractionText(response.data);
                if (!extracted.ok) return { outcome: 'stop', reason: extracted.reason };
                return { outcome: 'success', text: extracted.text };
            }
            const status = responseStatus(response);
            if (status === 429) return { outcome: 'switch', reason: 'http_429', rateLimited: true, response };
            if (status === 401 || status === 403) return { outcome: 'switch', reason: `http_${status}`, invalid: true };
            const action = classifyGeminiFailure(status, retryIndex, false);
            if (action === 'retry') { retryIndex += 1; continue; }
            return { outcome: action, reason: status ? `http_${status}` : 'http_error' };
        } catch (error) {
            const action = classifyGeminiFailure(0, retryIndex, true);
            if (action === 'retry') { retryIndex += 1; continue; }
            return { outcome: action, reason: error && error.message === 'gemini_timeout' ? 'timeout' : 'network_error' };
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        DEFAULT_GEMINI_TIMEOUT_MS,
        GEMINI_GLOBAL_DEADLINE_MS,
        GEMINI_INTERACTIONS_ENDPOINT,
        classifyGeminiFailure,
        cooldownSeconds,
        createGeminiInteractionBody,
        executeGeminiInteraction,
        extractInteractionText,
        retryAfterSeconds,
        withGeminiTimeout
    });
}
