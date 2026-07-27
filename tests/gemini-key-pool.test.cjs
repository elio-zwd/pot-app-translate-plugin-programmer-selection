const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const plugin = require('../main.js');

const KEY = 'test-gemini-key-not-real';

function keys(count) {
    return Array.from({ length: count }, (_, index) => `key-${index + 1}-not-real`);
}

test('SHA-256 指纹与 Node 标准实现一致', () => {
    assert.equal(plugin.sha256Hex(KEY), crypto.createHash('sha256').update(KEY).digest('hex'));
});

test('Key 池支持四种分隔符、名称与禁用前缀', () => {
    const result = plugin.parseGeminiKeyPool({ apiKeyPool: 'A=key-a\n#B=key-b,key-c，key-d;key-e' });
    assert.equal(result.entries.length, 5);
    assert.deepEqual(result.entries.map((item) => item.displayName), ['A', 'B', 'K3', 'K4', 'K5']);
    assert.equal(result.entries[1].enabled, false);
    assert.equal(result.diagnostics.disabled, 1);
});

test('重复 Key 保留首次位置、名称与启用状态', () => {
    const result = plugin.parseGeminiKeyPool({ apiKeyPool: '#first=duplicate-key,second=duplicate-key' });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].displayName, 'first');
    assert.equal(result.entries[0].enabled, false);
    assert.equal(result.diagnostics.duplicate, 1);
});

test('清理外围引号并拒绝空值、内部空白和超长 Key', () => {
    const result = plugin.parseGeminiKeyPool({ apiKeyPool: '"quoted-key",empty=,bad key,' + 'x'.repeat(513) });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].key, 'quoted-key');
    assert.equal(result.diagnostics.invalid, 3);
});

test('最多接受前 20 个唯一 Key，第 21 个计为超限', () => {
    const result = plugin.parseGeminiKeyPool({ apiKeyPool: keys(21).join(',') });
    assert.equal(result.entries.length, 20);
    assert.equal(result.diagnostics.overflow, 1);
});

test('新池非空时不读取旧 apiKey，新池为空时兼容旧配置', () => {
    assert.equal(plugin.parseGeminiKeyPool({ apiKeyPool: 'new-key', apiKey: 'old-key' }).entries[0].key, 'new-key');
    assert.equal(plugin.parseGeminiKeyPool({ apiKeyPool: ' ', apiKey: 'old-key' }).entries[0].key, 'old-key');
});

test('公开诊断与序列化状态不包含完整 Key', async () => {
    const parsed = plugin.parseGeminiKeyPool({ apiKeyPool: KEY });
    assert.doesNotMatch(JSON.stringify(parsed.diagnostics), new RegExp(KEY));
    const store = plugin.createMemoryGeminiStateStore();
    await store.initialize([parsed.entries[0].fingerprint], 1000);
    await store.markSuccess(parsed.entries[0].fingerprint, 1000);
    assert.doesNotMatch(JSON.stringify(store.debug()), new RegExp(KEY));
    assert.doesNotMatch(JSON.stringify(store.debug()), /secret|apiKey|"key"/i);
});

test('活动 Key 优先，禁用、invalid 和冷却 Key 被跳过', () => {
    const parsed = plugin.parseGeminiKeyPool({ apiKeyPool: 'key-a,#key-b,key-c,key-d' });
    const [a, , c, d] = parsed.entries;
    const states = new Map([
        [a.fingerprint, { status: 'invalid' }],
        [c.fingerprint, { status: 'cooldown', cooldown_until: 2000 }]
    ]);
    const plan = plugin.createGeminiAttemptPlan(parsed.entries, { activeFingerprint: d.fingerprint, states }, 1000, 5);
    assert.deepEqual(plan.map((item) => item.key), ['key-d']);
});

test('冷却过期自动恢复，配置变化清理陈旧状态', async () => {
    const store = plugin.createMemoryGeminiStateStore({
        activeFingerprint: 'old',
        states: {
            old: { status: 'available' },
            keep: { status: 'cooldown', cooldown_until: 500 }
        }
    });
    await store.initialize(['keep'], 1000);
    const snapshot = await store.snapshot();
    assert.equal(snapshot.activeFingerprint, '');
    assert.equal(snapshot.states.has('old'), false);
    assert.equal(snapshot.states.get('keep').status, 'available');
});

test('尝试上限只接受 1 到 20，默认值为 5', () => {
    assert.equal(plugin.normalizeMaxKeyAttempts(undefined), 5);
    assert.equal(plugin.normalizeMaxKeyAttempts('3'), 3);
    assert.equal(plugin.normalizeMaxKeyAttempts(20), 20);
    assert.equal(plugin.normalizeMaxKeyAttempts(0), 5);
    assert.equal(plugin.normalizeMaxKeyAttempts(21), 5);
});
