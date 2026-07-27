/**
 * 程序员划词翻译 Pot 插件运行时。
 *
 * Pot 使用 eval() 加载插件脚本，因此运行时不使用 import；依赖由 options.utils 注入。
 */
const PLUGIN_ID = 'plugin.com.elio.programmer-selection-translator';
const DICTIONARY_DB_PATH = `sqlite:plugins/translate/${PLUGIN_ID}/dictionary.db`;

const KNOWN_ACRONYMS = [
    'ACK', 'ADC', 'AES', 'AI', 'API', 'ASCII', 'BLE', 'BSP', 'CAN', 'CPU', 'CRC',
    'CSS', 'DAC', 'DMA', 'DNS', 'EEPROM', 'EXTI', 'FIFO', 'GPIO', 'GPU', 'HAL', 'HTML',
    'HTTP', 'HTTPS', 'I2C', 'IDE', 'ID', 'IP', 'IPv4', 'IPv6', 'IRQ', 'ISR', 'JSON',
    'JTAG', 'MAC', 'MCU', 'NACK', 'NDEF', 'NFC', 'OTA', 'PID', 'PWM', 'RAM',
    'REST', 'ROM', 'RPC', 'RS232', 'RS485', 'RTOS', 'SDK', 'SPI', 'SQL', 'SRAM',
    'SSH', 'ST25DV', 'TCP', 'TLS', 'UART', 'UDP', 'UI', 'UID', 'URI', 'URL',
    'USART', 'USB', 'UTF8', 'UUID', 'UX', 'XML'
];
const ACRONYM_MAP = new Map(KNOWN_ACRONYMS.map((item) => [item.toLowerCase(), item]));
const SORTED_ACRONYMS = [...KNOWN_ACRONYMS].sort((a, b) => b.length - a.length);

const ACTION_WORDS = new Set([
    'add', 'build', 'calculate', 'check', 'clear', 'clone', 'close', 'compare',
    'convert', 'copy', 'create', 'decode', 'delete', 'deserialize', 'disable',
    'enable', 'encode', 'fetch', 'filter', 'find', 'format', 'generate', 'get',
    'handle', 'init', 'initialize', 'join', 'load', 'merge', 'open', 'parse',
    'process', 'read', 'receive', 'reduce', 'remove', 'reset', 'retry', 'save',
    'search', 'send', 'serialize', 'set', 'sort', 'split', 'start', 'stop',
    'update', 'validate', 'verify', 'wait', 'write'
]);
const BOOLEAN_PREFIXES = new Set([
    'is', 'has', 'can', 'should', 'needs', 'supports', 'enabled', 'disabled',
    'available', 'valid', 'invalid'
]);
const FUNCTION_PREFIXES = new Set([...ACTION_WORDS, 'on']);
const FUNCTION_SUFFIXES = new Set([
    'callback', 'handler', 'hook', 'init', 'initialize', 'listener', 'process', 'processor'
]);

const PROGRAMMING_TERMS = {
    abstract: '抽象', access: '访问', account: '账户', action: '操作', activity: 'Activity',
    adapter: '适配器', add: '添加', address: '地址', algorithm: '算法', allocate: '分配',
    allocation: '分配', argument: '实参', array: '数组', asset: '资源', async: '异步',
    atomic: '原子', auth: '认证', available: '可用', await: '等待', base: '基础',
    batch: '批量', body: '请求体', boot: '启动', bootloader: '引导加载程序', branch: '分支',
    buffer: '缓冲区', build: '构建', builder: '构建器', bundle: 'Bundle', cache: '缓存',
    callback: '回调', calculate: '计算', can: '可以', cancel: '取消', channel: '通道',
    character: '角色', check: '检查', checksum: '校验和', class: '类', clear: '清除',
    client: '客户端', clone: '克隆', close: '关闭', code: '代码', column: '列',
    command: '命令', commit: '提交', compare: '比较', compiler: '编译器', component: '组件',
    compose: 'Compose', config: '配置', configuration: '配置', connection: '连接',
    constant: '常量', context: '上下文', controller: '控制器', convert: '转换', cookie: 'Cookie',
    copy: '复制', coroutine: '协程', count: '次数', create: '创建', current: '当前',
    data: '数据', database: '数据库', debug: '调试', decode: '解码', default: '默认',
    delay: '延时', delete: '删除', dependency: '依赖', deserialize: '反序列化', device: '设备',
    directory: '目录', disable: '禁用', disabled: '已禁用', driver: '驱动', edge: '边',
    enable: '启用', enabled: '已启用', encode: '编码', encoder: '编码器', endpoint: '端点',
    entity: '实体', error: '错误', event: '事件', exception: '异常', expression: '表达式',
    factory: '工厂', failed: '失败', failure: '失败', fetch: '获取', field: '字段',
    file: '文件', filter: '过滤', find: '查找', firmware: '固件', flag: '标志',
    folder: '文件夹', format: '格式化', fragment: 'Fragment', frame: '帧', framework: '框架',
    function: '函数', future: 'Future', generate: '生成', get: '获取', graph: '图',
    handle: '处理', handler: '处理函数', hardware: '硬件', has: '具有', header: '请求头',
    heap: '堆', hook: '钩子', id: 'ID', ids: 'ID', index: '索引', init: '初始化',
    initialize: '初始化', injection: '注入', instance: '实例', intent: 'Intent', interface: '接口',
    interpreter: '解释器', interrupt: '中断', interval: '间隔', invalid: '无效', is: '是否',
    item: '项', join: '连接', key: '键', library: '库', lifecycle: '生命周期', list: '列表',
    listener: '监听器', load: '加载', lock: '锁', log: '日志', login: '登录',
    logout: '退出登录', machine: '机器', manager: '管理器', map: '映射', member: '成员',
    memory: '内存', merge: '合并', message: '消息', method: '方法', middleware: '中间件',
    migration: '迁移', min: '最小', max: '最大', model: '模型', module: '模块', motor: '电机',
    mutex: '互斥锁', name: '名称', navigation: '导航', needs: '需要', network: '网络',
    next: '下一个', node: '节点', object: '对象', observable: '可观察对象', offset: '偏移',
    open: '打开', option: '选项', package: '包', packet: '数据包', parameter: '形参',
    parse: '解析', parser: '解析器', path: '路径', payload: '负载', permission: '权限',
    pointer: '指针', previous: '上一个', process: '进程', processor: '处理器', promise: 'Promise',
    property: '属性', protocol: '协议', provider: '提供方', query: '查询', queue: '队列',
    read: '读取', receive: '接收', record: '记录', reduce: '归并', reference: '引用',
    register: '寄存器', remaining: '剩余', remove: '移除', repository: '仓库', request: '请求',
    reset: '重置', resource: '资源', response: '响应', result: '结果', retry: '重试',
    retryable: '可重试', return: '返回', role: '角色', route: '路由', row: '行', runtime: '运行时',
    save: '保存', schema: '模式', search: '搜索', semaphore: '信号量', send: '发送',
    sensor: '传感器', serialize: '序列化', server: '服务器', service: '服务', session: '会话',
    set: '设置', setting: '设置', should: '应当', size: '大小', sort: '排序', source: '源',
    split: '拆分', stack: '栈', start: '启动', state: '状态', statement: '语句', status: '状态',
    stop: '停止', stream: '流', success: '成功', successful: '成功', sync: '同步', syntax: '语法',
    supports: '支持', table: '表', task: '任务', thread: '线程', timeout: '超时', timer: '定时器',
    token: '令牌', tokenizer: '分词器', trace: '跟踪', transaction: '事务', translate: '翻译',
    translation: '翻译', tree: '树', tuple: '元组', type: '类型', unknown: '未知', update: '更新',
    user: '用户', valid: '有效', validate: '校验', value: '值', variable: '变量', verify: '验证',
    view: '视图', viewmodel: '视图模型', wait: '等待', warning: '警告', watchdog: '看门狗',
    worker: '工作线程', write: '写入', actuator: '执行器', callbackflow: '回调流',
    currentflow: '状态流', firmwareupdate: '固件更新', bootloaderupdate: '引导加载程序更新'
};

const PROGRAMMING_PHRASES = {
    'access token': '访问令牌', 'api key': 'API 密钥', 'base url': '基础 URL',
    'callback function': '回调函数', 'connection status': '连接状态', 'current value': '当前值',
    'free rtos': 'FreeRTOS', 'data frame': '数据帧', 'error code': '错误码',
    'interrupt handler': '中断处理函数', 'machine code': '机器码',
    'max retry count': '最大重试次数', 'motor current': '电机电流', 'read data': '读取数据',
    'refresh token': '刷新令牌', 'remaining retryable character ids': '剩余可重试角色 ID',
    'request timeout': '请求超时', 'response code': '响应码', 'service instance': '服务实例',
    'service instance list': '服务实例列表', 'service list': '服务列表', 'source code': '源代码',
    'state machine': '状态机', 'status code': '状态码', 'translate service list': '翻译服务列表',
    'translation service': '翻译服务', 'user config': '用户配置', 'view model': '视图模型',
    'write data': '写入数据'
};

const CHINESE_PHRASES = {
    '最大重试次数': ['max', 'retry', 'count'],
    '剩余可重试角色': ['remaining', 'retryable', 'character'],
    '读取用户配置': ['read', 'user', 'config'],
    '检查连接状态': ['check', 'connection', 'status'],
    '连接是否成功': ['is', 'connection', 'successful'],
    '读取NFC配置': ['read', 'NFC', 'config'],
    '写入NFC数据': ['write', 'NFC', 'data'],
    '解析数据帧': ['parse', 'data', 'frame'],
    '校验数据帧': ['validate', 'data', 'frame'],
    '发送命令': ['send', 'command'], '接收响应': ['receive', 'response'],
    '重试失败角色': ['retry', 'failed', 'character'], '初始化设备': ['init', 'device'],
    '重置看门狗': ['reset', 'watchdog'], '更新固件': ['update', 'firmware'],
    '用户配置': ['user', 'config'], '连接状态': ['connection', 'status'],
    '数据帧': ['data', 'frame'], '错误码': ['error', 'code'], '状态码': ['status', 'code'],
    '重试次数': ['retry', 'count'], '函数名': ['function', 'name'], '变量名': ['variable', 'name'],
    '标识符': ['identifier'], '最大': ['max'], '最小': ['min'], '剩余': ['remaining'],
    '可重试': ['retryable'], '获取': ['get'], '读取': ['read'], '写入': ['write'],
    '设置': ['set'], '更新': ['update'], '删除': ['delete'], '创建': ['create'],
    '检查': ['check'], '验证': ['verify'], '校验': ['validate'], '解析': ['parse'],
    '转换': ['convert'], '格式化': ['format'], '初始化': ['init'], '启动': ['start'],
    '停止': ['stop'], '重试': ['retry'], '发送': ['send'], '接收': ['receive'],
    '加载': ['load'], '保存': ['save'], '清除': ['clear'], '重置': ['reset'],
    '处理': ['handle'], '等待': ['wait'], '查找': ['find'], '搜索': ['search'],
    '构建': ['build'], '生成': ['generate'], '是否': ['is'], '可以': ['can'],
    '支持': ['supports'], '启用': ['enabled'], '禁用': ['disabled'], '用户': ['user'],
    '配置': ['config'], '数据': ['data'], '状态': ['status'], '响应': ['response'],
    '请求': ['request'], '错误': ['error'], '结果': ['result'], '消息': ['message'],
    '连接': ['connection'], '超时': ['timeout'], '失败': ['failed'], '成功': ['successful'],
    '角色': ['character'], '函数': ['function'], '变量': ['variable'], '名称': ['name'],
    '设备': ['device'], '帧': ['frame'], '协议': ['protocol'], '地址': ['address'],
    '寄存器': ['register'], '中断': ['interrupt'], '定时器': ['timer'], '任务': ['task'],
    '队列': ['queue'], '信号量': ['semaphore'], '看门狗': ['watchdog'], '固件': ['firmware'],
    '参数': ['parameter'], '命令': ['command'], '长度': ['length'], '缓冲区': ['buffer'],
    '值': ['value'], '代码': ['code'], '次数': ['count']
};

const SORTED_CHINESE_PHRASES = Object.entries(CHINESE_PHRASES).sort((a, b) => b[0].length - a[0].length);
const SORTED_PROGRAMMING_PHRASES = Object.entries(PROGRAMMING_PHRASES)
    .sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);
const TYPE_LABELS = {
    auto: '自动判断', function: '函数名', variable: '变量名', boolean: '布尔变量',
    class: '类名', constant: '常量/宏', file: '文件名'
};

function canonicalAcronym(token) {
    return ACRONYM_MAP.get(String(token).toLowerCase()) || null;
}

function normalizeWord(token) {
    const clean = String(token).replace(/^\$+/, '').replace(/[^A-Za-z0-9]/g, '');
    if (!clean) return null;
    const acronym = canonicalAcronym(clean);
    if (acronym) return acronym;
    if (/^[A-Z]{2,}\d*$/.test(clean)) return clean;
    return clean.toLowerCase();
}

function findKnownAcronym(chunk) {
    let best = null;
    for (let index = 0; index < chunk.length; index += 1) {
        for (const acronym of SORTED_ACRONYMS) {
            const nextCharacter = chunk[index + acronym.length];
            const leftBoundary = index === 0 || /[a-z0-9]/.test(chunk[index - 1]);
            const rightBoundary = nextCharacter === undefined || /[A-Z0-9]/.test(nextCharacter);
            const exactMatch = leftBoundary && rightBoundary && chunk.startsWith(acronym, index);
            const digitAcronymAtStart = index === 0 && /\d/.test(acronym)
                && chunk.slice(0, acronym.length).toLowerCase() === acronym.toLowerCase()
                && rightBoundary;
            if (exactMatch || digitAcronymAtStart) {
                if (!best || index < best.index || (index === best.index && acronym.length > best.acronym.length)) {
                    best = { index, acronym };
                }
            }
        }
        if (best && best.index === index) break;
    }
    return best;
}

function splitChunkWithoutKnownAcronyms(chunk) {
    return chunk
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([A-Za-z])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-z])/g, '$1 $2')
        .split(/\s+/)
        .map(normalizeWord)
        .filter(Boolean);
}

function splitChunk(chunk) {
    const trimmed = chunk.trim();
    if (!trimmed) return [];
    const exactAcronym = canonicalAcronym(trimmed);
    if (exactAcronym) return [exactAcronym];
    const match = findKnownAcronym(trimmed);
    if (!match) return splitChunkWithoutKnownAcronyms(trimmed);
    return [
        ...splitChunk(trimmed.slice(0, match.index)),
        match.acronym,
        ...splitChunk(trimmed.slice(match.index + match.acronym.length))
    ];
}

function splitIdentifier(input) {
    const cleaned = String(input)
        .trim()
        .replace(/^[\'"`]+|[\'"`;]+$/g, '')
        .replace(/\(\s*\)$/, '')
        .replace(/[\s_.\-/:\\]+/g, ' ');
    return cleaned.split(/\s+/).flatMap(splitChunk).filter(Boolean);
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
            words.push(...splitChunk(ascii[0]));
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
    return { words, unknown: [...new Set(unknown)].join('') };
}

function isAcronym(word) {
    return canonicalAcronym(word) !== null || /^[A-Z]{2,}\d*$/.test(word);
}
function lowerWord(word) { return String(word).toLowerCase(); }
function titleWord(word, acronymStyle) {
    const canonical = canonicalAcronym(word) || word;
    if (isAcronym(canonical) && acronymStyle === 'preserve') return canonical;
    const lower = canonical.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function toCamelCase(words, acronymStyle = 'standard') {
    if (!words.length) return '';
    return lowerWord(words[0]) + words.slice(1).map((word) => titleWord(word, acronymStyle)).join('');
}
function toPascalCase(words, acronymStyle = 'standard') {
    return words.map((word) => titleWord(word, acronymStyle)).join('');
}
function toSnakeCase(words) { return words.map(lowerWord).join('_'); }
function toScreamingSnakeCase(words) { return words.map((word) => lowerWord(word).toUpperCase()).join('_'); }
function toKebabCase(words) { return words.map(lowerWord).join('-'); }

function detectIdentifierType(input, words) {
    const original = String(input).trim();
    const lowerWords = words.map(lowerWord);
    const firstWord = lowerWords[0];
    const lastWord = lowerWords[lowerWords.length - 1];
    if (/^[A-Z][A-Z0-9_]*$/.test(original) && original.includes('_')) return 'constant';
    if (BOOLEAN_PREFIXES.has(firstWord)) return 'boolean';
    if (/[.\-]/.test(original)) return 'file';
    if (/^[A-Z][A-Za-z0-9]*$/.test(original) && !/^[A-Z0-9]+$/.test(original)) return 'class';
    if (FUNCTION_PREFIXES.has(firstWord) || FUNCTION_SUFFIXES.has(lastWord)) return 'function';
    const vendorActionIndex = lowerWords.findIndex((word, index) =>
        index > 0 && ACTION_WORDS.has(word) && words.slice(0, index).every((prefix) => isAcronym(prefix))
    );
    return vendorActionIndex >= 0 ? 'function' : 'variable';
}

function applyTypeHints(words, type) {
    const result = [...words];
    if (type === 'boolean' && !BOOLEAN_PREFIXES.has(lowerWord(result[0] || ''))) result.unshift('is');
    return result;
}

function joinChineseParts(parts) {
    return parts.reduce((result, part) => {
        if (!result) return part;
        const needsSpace = /[A-Za-z0-9]$/.test(result) || /^[A-Za-z0-9]/.test(part);
        return result + (needsSpace ? ' ' : '') + part;
    }, '');
}

function conciseGloss(translation) {
    if (!translation) return '';
    const firstLine = String(translation).split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !/^\[(?:网络|网络释义|例句)\]/.test(line));
    if (!firstLine) return '';
    return firstLine.replace(/^(?:[a-z]{1,5}\.|\[[^\]]+\])\s*/i, '').split(/[；;，,。]/)[0].trim();
}

function generalEntryLines(entry, maxLines = 2) {
    if (!entry || !entry.translation) return [];
    return String(entry.translation).split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/^\[(?:网络|网络释义|例句)\]/.test(line))
        .slice(0, maxLines);
}

function programmingTerm(word) {
    const lower = lowerWord(word);
    if (PROGRAMMING_TERMS[lower]) return PROGRAMMING_TERMS[lower];
    const candidates = [];
    if (lower.endsWith('ies') && lower.length > 3) candidates.push(`${lower.slice(0, -3)}y`);
    if (lower.endsWith('es') && lower.length > 2) candidates.push(lower.slice(0, -2));
    if (lower.endsWith('s') && lower.length > 1) candidates.push(lower.slice(0, -1));
    return candidates.map((candidate) => PROGRAMMING_TERMS[candidate]).find(Boolean) || '';
}

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
        } else {
            const entry = generalEntries.get(lower);
            parts.push(conciseGloss(entry && entry.translation) || word);
        }
        index += 1;
    }
    return { text: joinChineseParts(parts), hasProgrammingMeaning: usedProgramming.size > 0 };
}

function toProgrammingDescription(words) { return programmingPhraseParts(words).text; }
function formatByStyle(words, style, acronymStyle) {
    switch (style) {
        case 'camel': return toCamelCase(words, acronymStyle);
        case 'pascal': return toPascalCase(words, acronymStyle);
        case 'snake': return toSnakeCase(words);
        case 'screaming': return toScreamingSnakeCase(words);
        case 'kebab': return toKebabCase(words);
        case 'words': return words.map((word) => canonicalAcronym(word) || lowerWord(word)).join(' ');
        case 'chinese': return toProgrammingDescription(words);
        default: return '';
    }
}

function prepareIdentifier(text, config = {}) {
    const input = String(text ?? '').trim();
    if (!input) throw new Error('请输入函数名、变量名、英文单词或中文命名描述。');
    if (input.length > 500) throw new Error('输入过长。当前版本仅处理 500 个字符以内的标识符或简短文本。');
    const isChineseInput = /[\u3400-\u9fff]/.test(input);
    const tokenized = isChineseInput ? tokenizeChinese(input) : { words: splitIdentifier(input), unknown: '' };
    if (!tokenized.words.length) throw new Error('没有识别到可处理的英文单词或编程标识符。');
    const configuredType = config.identifierType || 'auto';
    const detectedType = configuredType === 'auto' ? detectIdentifierType(input, tokenized.words) : configuredType;
    return {
        input,
        isChineseInput,
        unknownChinese: tokenized.unknown,
        detectedType,
        words: applyTypeHints(tokenized.words, detectedType),
        acronymStyle: config.acronymStyle || 'standard',
        outputStyle: config.outputStyle || 'report',
        dictionaryMode: config.dictionaryMode || 'both'
    };
}

async function selectDictionaryRows(db, words) {
    const keys = [...new Set(words.map(lowerWord).filter((word) => /^[a-z][a-z0-9'\-]*$/.test(word)))];
    if (!keys.length) return [];
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    return db.select(
        `SELECT word, lemma, phonetic, translation, pos FROM dictionary WHERE word IN (${placeholders})`,
        keys
    );
}

async function lookupGeneralDictionary(words, options = {}) {
    const Database = options.utils && options.utils.Database;
    if (!Database || typeof Database.load !== 'function') {
        return { entries: new Map(), warning: '普通英语词典未加载；当前结果仅使用内置编程术语。' };
    }
    let db;
    try {
        db = await Database.load(DICTIONARY_DB_PATH);
        const rows = await selectDictionaryRows(db, words);
        const entries = new Map();
        for (const row of rows || []) entries.set(lowerWord(row.word), row);
        return { entries, warning: '' };
    } catch (error) {
        return {
            entries: new Map(),
            warning: `普通英语词典读取失败：${error && error.message ? error.message : String(error)}`
        };
    } finally {
        if (db && typeof db.close === 'function') {
            try { await db.close(); } catch (_) { /* 忽略关闭失败 */ }
        }
    }
}

function formatGeneralDictionary(words, entries) {
    const lines = [];
    const unknownWords = [];
    for (const word of words) {
        const lower = lowerWord(word);
        const entry = entries.get(lower);
        const acronym = canonicalAcronym(word);
        if (entry) {
            const phonetic = entry.phonetic ? ` /${entry.phonetic}/` : '';
            const lemma = entry.lemma && lowerWord(entry.lemma) !== lower ? `（原形：${entry.lemma}）` : '';
            const senses = generalEntryLines(entry);
            lines.push(`- ${canonicalAcronym(word) || lower}${phonetic}${lemma}：${senses.join('；') || '暂无中文释义'}`);
        } else if (acronym || /^\d+$/.test(lower)) {
            lines.push(`- ${acronym || word}：技术缩写或数字，保留原文`);
        } else {
            lines.push(`- ${lower}：未收录`);
            unknownWords.push(lower);
        }
    }
    return { lines, unknownWords: [...new Set(unknownWords)] };
}

async function buildDictionarySections(model, options = {}) {
    const lookup = await lookupGeneralDictionary(model.words, options);
    const programming = programmingPhraseParts(model.words, lookup.entries);
    const general = formatGeneralDictionary(model.words, lookup.entries);
    return {
        programmingText: programming.text,
        programmingLabel: programming.hasProgrammingMeaning ? '编程含义' : '组合含义',
        generalLines: general.lines,
        unknownWords: general.unknownWords,
        warning: lookup.warning
    };
}

function renderChineseOnly(model, sections) {
    let lines;
    switch (model.dictionaryMode) {
        case 'programming': lines = [sections.programmingText]; break;
        case 'general': lines = [...sections.generalLines]; break;
        case 'both':
        default:
            lines = [`${sections.programmingLabel}：${sections.programmingText}`, '普通词义：', ...sections.generalLines];
            break;
    }
    if (sections.warning && model.dictionaryMode !== 'programming') lines.push(`词典提示：${sections.warning}`);
    return lines.join('\n');
}

function createReport(model, sections) {
    const lines = [
        `原文：${model.input}`,
        `识别类型：${TYPE_LABELS[model.detectedType] || model.detectedType}`,
        `拆分：${model.words.map((word) => canonicalAcronym(word) || word).join(' | ')}`
    ];
    if (model.dictionaryMode === 'programming' || model.dictionaryMode === 'both') {
        lines.push(`${sections.programmingLabel}：${sections.programmingText}`);
    }
    if (model.dictionaryMode === 'general' || model.dictionaryMode === 'both') {
        lines.push('普通词义：', ...sections.generalLines);
    }
    if (sections.unknownWords.length > 0) lines.push(`未收录英文：${sections.unknownWords.join(', ')}`);
    if (model.unknownChinese) lines.push(`未收录中文：${model.unknownChinese}`);
    if (sections.warning) lines.push(`词典提示：${sections.warning}`);
    lines.push(
        '',
        `camelCase：${toCamelCase(model.words, model.acronymStyle)}`,
        `PascalCase：${toPascalCase(model.words, model.acronymStyle)}`,
        `snake_case：${toSnakeCase(model.words)}`,
        `SCREAMING_SNAKE_CASE：${toScreamingSnakeCase(model.words)}`,
        `kebab-case：${toKebabCase(model.words)}`
    );
    return lines.join('\n');
}

function analyzeIdentifier(text, config = {}) {
    const model = prepareIdentifier(text, config);
    if (model.outputStyle !== 'report') return formatByStyle(model.words, model.outputStyle, model.acronymStyle);
    const emptySections = {
        programmingText: toProgrammingDescription(model.words),
        programmingLabel: '编程含义',
        generalLines: [],
        unknownWords: [],
        warning: '普通英语词典未加载；当前结果仅使用内置编程术语。'
    };
    return createReport({ ...model, dictionaryMode: 'programming' }, emptySections);
}

async function translate(text, _from, _to, options = {}) {
    const model = prepareIdentifier(text, options.config || {});
    if (model.outputStyle !== 'report' && model.outputStyle !== 'chinese') {
        return formatByStyle(model.words, model.outputStyle, model.acronymStyle);
    }
    const sections = await buildDictionarySections(model, options);
    if (model.outputStyle === 'chinese') return renderChineseOnly(model, sections);
    return createReport(model, sections);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        analyzeIdentifier,
        buildDictionarySections,
        conciseGloss,
        detectIdentifierType,
        formatGeneralDictionary,
        lookupGeneralDictionary,
        prepareIdentifier,
        programmingPhraseParts,
        splitIdentifier,
        tokenizeChinese,
        toCamelCase,
        toKebabCase,
        toPascalCase,
        toScreamingSnakeCase,
        toSnakeCase,
        translate
    };
}
