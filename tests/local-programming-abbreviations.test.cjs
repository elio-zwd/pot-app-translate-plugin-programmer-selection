const test = require('node:test');
const assert = require('node:assert/strict');
const plugin = require('../main.js');

test('完整 token 程序员缩写均使用固定本地词义', () => {
    const expected = {
        Buf: '缓冲区',
        Len: '长度',
        Cfg: '配置',
        Addr: '地址',
        Ptr: '指针',
        Idx: '索引',
        Cnt: '计数',
        Num: '数量',
        Seq: '序号',
        Tmp: '临时',
        Src: '源',
        Dst: '目标'
    };

    for (const [token, gloss] of Object.entries(expected)) {
        assert.equal(
            plugin.programmingPhraseParts(plugin.splitIdentifier(token)).text,
            gloss,
            token
        );
    }
});
