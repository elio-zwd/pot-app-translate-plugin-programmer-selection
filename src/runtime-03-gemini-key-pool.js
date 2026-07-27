/**
 * Gemini Key 池解析、SHA-256 指纹与无秘密调度状态。
 */
const GEMINI_STATE_DB_PATH = `sqlite:plugins/translate/${PLUGIN_ID}/gemini_state.db`;
const MAX_GEMINI_KEYS = 20;
const DEFAULT_MAX_KEY_ATTEMPTS = 5;

function sha256Hex(value) {
    let ascii = unescape(encodeURIComponent(String(value || '')));
    const maxWord = Math.pow(2, 32);
    const words = [];
    const bitLength = ascii.length * 8;
    const hash = [];
    const constants = [];
    const isComposite = {};
    for (let candidate = 2, count = 0; count < 64; candidate += 1) {
        if (isComposite[candidate]) continue;
        for (let multiple = candidate * candidate; multiple < 313; multiple += candidate) isComposite[multiple] = true;
        if (count < 8) hash[count] = Math.pow(candidate, 0.5) * maxWord | 0;
        constants[count] = Math.pow(candidate, 1 / 3) * maxWord | 0;
        count += 1;
    }
    ascii += '\x80';
    while (ascii.length % 64 !== 56) ascii += '\x00';
    for (let index = 0; index < ascii.length; index += 1) {
        const code = ascii.charCodeAt(index);
        if (code >> 8) throw new Error('sha256_ascii_only');
        words[index >> 2] = (words[index >> 2] || 0) | code << ((3 - index) % 4) * 8;
    }
    words.push(Math.floor(bitLength / maxWord));
    words.push(bitLength);
    for (let block = 0; block < words.length;) {
        const schedule = words.slice(block, block += 16);
        const previous = hash.slice(0);
        for (let round = 0; round < 64; round += 1) {
            const w15 = schedule[round - 15];
            const w2 = schedule[round - 2];
            const a = hash[0];
            const e = hash[4];
            const sigma0 = round < 16 ? 0 : ((w15 >>> 7 | w15 << 25) ^ (w15 >>> 18 | w15 << 14) ^ w15 >>> 3);
            const sigma1 = round < 16 ? 0 : ((w2 >>> 17 | w2 << 15) ^ (w2 >>> 19 | w2 << 13) ^ w2 >>> 10);
            const word = schedule[round] = round < 16 ? schedule[round] : (schedule[round - 16] + sigma0 + schedule[round - 7] + sigma1) | 0;
            const temp1 = (hash[7] + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7))
                + (e & hash[5] ^ ~e & hash[6]) + constants[round] + word) | 0;
            const temp2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10))
                + (a & hash[1] ^ a & hash[2] ^ hash[1] & hash[2])) | 0;
            hash.unshift((temp1 + temp2) | 0);
            hash[4] = (hash[4] + temp1) | 0;
            hash.pop();
        }
        for (let index = 0; index < 8; index += 1) hash[index] = (hash[index] + previous[index]) | 0;
    }
    return hash.map((word) => (word >>> 0).toString(16).padStart(8, '0')).join('');
}

function normalizeMaxKeyAttempts(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 20 ? number : DEFAULT_MAX_KEY_ATTEMPTS;
}

function stripOuterQuotes(value) {
    const text = String(value || '').trim();
    if (text.length >= 2 && ((text[0] === '"' && text.at(-1) === '"') || (text[0] === "'" && text.at(-1) === "'"))) {
        return text.slice(1, -1).trim();
    }
    return text;
}

function parseGeminiKeyPool(config = {}) {
    const rawPool = String(config.apiKeyPool || '');
    const hasNewPool = rawPool.trim().length > 0;
    const source = hasNewPool ? rawPool : String(config.apiKey || '');
    const rawItems = source.split(/[\n,，;]+/);
    const entries = [];
    const seen = new Set();
    const diagnostics = { added: 0, duplicate: 0, invalid: 0, overflow: 0, disabled: 0 };

    for (const rawItem of rawItems) {
        let item = String(rawItem || '').trim();
        if (!item) continue;
        let enabled = true;
        if (item.startsWith('#')) {
            enabled = false;
            item = item.slice(1).trim();
        }
        let name = '';
        const separator = item.indexOf('=');
        if (separator >= 0) {
            name = item.slice(0, separator).trim().slice(0, 24);
            item = item.slice(separator + 1);
        }
        const key = stripOuterQuotes(item);
        if (!key || key.length > 512 || /\s/.test(key)) {
            diagnostics.invalid += 1;
            continue;
        }
        const fingerprint = sha256Hex(key);
        if (seen.has(fingerprint)) {
            diagnostics.duplicate += 1;
            continue;
        }
        seen.add(fingerprint);
        if (entries.length >= MAX_GEMINI_KEYS) {
            diagnostics.overflow += 1;
            continue;
        }
        const displayName = name || `K${entries.length + 1}`;
        entries.push({ key, fingerprint, displayName, enabled, position: entries.length });
        diagnostics.added += 1;
        if (!enabled) diagnostics.disabled += 1;
    }
    return { entries, diagnostics, source: hasNewPool ? 'pool' : 'legacy' };
}

function createMemoryGeminiStateStore(initial = {}) {
    const states = new Map(Object.entries(initial.states || {}).map(([key, value]) => [key, { ...value }]));
    let activeFingerprint = initial.activeFingerprint || '';
    return {
        async initialize(fingerprints, now) {
            const allowed = new Set(fingerprints || []);
            for (const fingerprint of [...states.keys()]) if (!allowed.has(fingerprint)) states.delete(fingerprint);
            if (activeFingerprint && !allowed.has(activeFingerprint)) activeFingerprint = '';
            for (const state of states.values()) {
                if (state.status === 'cooldown' && Number(state.cooldown_until || 0) <= now) {
                    state.status = 'available';
                    state.cooldown_until = 0;
                }
            }
        },
        async snapshot() {
            return { activeFingerprint, states: new Map([...states].map(([key, value]) => [key, { ...value }])) };
        },
        async markInvalid(fingerprint, now) {
            states.set(fingerprint, { ...(states.get(fingerprint) || {}), status: 'invalid', cooldown_until: 0, updated_at: now });
            if (activeFingerprint === fingerprint) activeFingerprint = '';
        },
        async markCooldown(fingerprint, cooldownUntil, rateLimitCount, now) {
            states.set(fingerprint, { ...(states.get(fingerprint) || {}), status: 'cooldown', cooldown_until: cooldownUntil, rate_limit_count: rateLimitCount, updated_at: now });
            if (activeFingerprint === fingerprint) activeFingerprint = '';
        },
        async markSuccess(fingerprint, now) {
            states.set(fingerprint, { status: 'available', cooldown_until: 0, rate_limit_count: 0, last_success_at: now, updated_at: now });
            activeFingerprint = fingerprint;
        },
        async close() {},
        debug() { return { activeFingerprint, states: Object.fromEntries(states) }; }
    };
}

async function dbExecute(db, sql, params = []) {
    if (db && typeof db.execute === 'function') return db.execute(sql, params);
    if (db && typeof db.run === 'function') return db.run(sql, params);
    throw new Error('gemini_state_write_unavailable');
}

async function createSqliteGeminiStateStore(utils = {}) {
    if (utils.geminiStateStore) return utils.geminiStateStore;
    const Database = utils.Database;
    if (!Database || typeof Database.load !== 'function') return null;
    let db;
    try {
        db = await Database.load(GEMINI_STATE_DB_PATH);
        await dbExecute(db, `CREATE TABLE IF NOT EXISTS gemini_key_state (
            fingerprint TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            cooldown_until INTEGER NOT NULL DEFAULT 0,
            rate_limit_count INTEGER NOT NULL DEFAULT 0,
            last_success_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        )`);
        await dbExecute(db, `CREATE TABLE IF NOT EXISTS gemini_scheduler_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active_fingerprint TEXT,
            updated_at INTEGER NOT NULL
        )`);
        return {
            async initialize(fingerprints, now) {
                const rows = await db.select('SELECT fingerprint FROM gemini_key_state', []);
                const allowed = new Set(fingerprints || []);
                for (const row of rows || []) if (!allowed.has(row.fingerprint)) {
                    await dbExecute(db, 'DELETE FROM gemini_key_state WHERE fingerprint = $1', [row.fingerprint]);
                }
                const scheduler = await db.select('SELECT active_fingerprint FROM gemini_scheduler_state WHERE id = 1', []);
                if (scheduler[0] && scheduler[0].active_fingerprint && !allowed.has(scheduler[0].active_fingerprint)) {
                    await dbExecute(db, 'UPDATE gemini_scheduler_state SET active_fingerprint = NULL, updated_at = $1 WHERE id = 1', [now]);
                }
                await dbExecute(db, "UPDATE gemini_key_state SET status = 'available', cooldown_until = 0, updated_at = $1 WHERE status = 'cooldown' AND cooldown_until <= $1", [now]);
            },
            async snapshot() {
                const rows = await db.select('SELECT fingerprint, status, cooldown_until, rate_limit_count, last_success_at, updated_at FROM gemini_key_state', []);
                const scheduler = await db.select('SELECT active_fingerprint FROM gemini_scheduler_state WHERE id = 1', []);
                return { activeFingerprint: scheduler[0] && scheduler[0].active_fingerprint || '', states: new Map((rows || []).map((row) => [row.fingerprint, row])) };
            },
            async markInvalid(fingerprint, now) {
                await dbExecute(db, `INSERT INTO gemini_key_state (fingerprint,status,cooldown_until,rate_limit_count,last_success_at,updated_at)
                    VALUES ($1,'invalid',0,0,0,$2) ON CONFLICT(fingerprint) DO UPDATE SET status='invalid',cooldown_until=0,updated_at=$2`, [fingerprint, now]);
                await dbExecute(db, 'UPDATE gemini_scheduler_state SET active_fingerprint = NULL, updated_at = $1 WHERE id = 1 AND active_fingerprint = $2', [now, fingerprint]);
            },
            async markCooldown(fingerprint, cooldownUntil, rateLimitCount, now) {
                await dbExecute(db, `INSERT INTO gemini_key_state (fingerprint,status,cooldown_until,rate_limit_count,last_success_at,updated_at)
                    VALUES ($1,'cooldown',$2,$3,0,$4) ON CONFLICT(fingerprint) DO UPDATE SET status='cooldown',cooldown_until=$2,rate_limit_count=$3,updated_at=$4`, [fingerprint, cooldownUntil, rateLimitCount, now]);
                await dbExecute(db, 'UPDATE gemini_scheduler_state SET active_fingerprint = NULL, updated_at = $1 WHERE id = 1 AND active_fingerprint = $2', [now, fingerprint]);
            },
            async markSuccess(fingerprint, now) {
                await dbExecute(db, `INSERT INTO gemini_key_state (fingerprint,status,cooldown_until,rate_limit_count,last_success_at,updated_at)
                    VALUES ($1,'available',0,0,$2,$2) ON CONFLICT(fingerprint) DO UPDATE SET status='available',cooldown_until=0,rate_limit_count=0,last_success_at=$2,updated_at=$2`, [fingerprint, now]);
                await dbExecute(db, `INSERT INTO gemini_scheduler_state (id,active_fingerprint,updated_at) VALUES (1,$1,$2)
                    ON CONFLICT(id) DO UPDATE SET active_fingerprint=$1,updated_at=$2`, [fingerprint, now]);
            },
            async close() { if (db && typeof db.close === 'function') await db.close(); }
        };
    } catch (_) {
        if (db && typeof db.close === 'function') try { await db.close(); } catch (_) { /* 忽略 */ }
        return null;
    }
}

function createGeminiAttemptPlan(entries, snapshot, now, maxAttempts) {
    const states = snapshot && snapshot.states instanceof Map ? snapshot.states : new Map();
    const available = (entries || []).filter((entry) => {
        if (!entry.enabled) return false;
        const state = states.get(entry.fingerprint);
        if (!state) return true;
        if (state.status === 'invalid') return false;
        if (state.status === 'cooldown' && Number(state.cooldown_until || 0) > now) return false;
        return true;
    });
    const active = snapshot && snapshot.activeFingerprint;
    if (active) available.sort((a, b) => (a.fingerprint === active ? -1 : b.fingerprint === active ? 1 : a.position - b.position));
    else available.sort((a, b) => a.position - b.position);
    return available.slice(0, normalizeMaxKeyAttempts(maxAttempts));
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        DEFAULT_MAX_KEY_ATTEMPTS,
        GEMINI_STATE_DB_PATH,
        MAX_GEMINI_KEYS,
        createGeminiAttemptPlan,
        createMemoryGeminiStateStore,
        createSqliteGeminiStateStore,
        normalizeMaxKeyAttempts,
        parseGeminiKeyPool,
        sha256Hex
    });
}
