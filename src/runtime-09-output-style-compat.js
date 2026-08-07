/**
 * 输出模式兼容与宿主路由决策。
 *
 * 本模块只提供纯函数，不接入 translate()，不修改配置或宿主能力对象。
 */
const PLUGIN_RESULT_V2_SCHEMA = 'pot.plugin-result.v2';
const PROGRAMMER_RESULT_V1_SCHEMA = 'pot.programmer-result.v1';
const DIRECT_OUTPUT_STYLES = Object.freeze([
    'camel', 'pascal', 'snake', 'screaming', 'kebab', 'words', 'chinese'
]);
const PROGRAMMER_OUTPUT_STYLES = new Set([
    'minimal', 'report', ...DIRECT_OUTPUT_STYLES
]);

function normalizeProgrammerOutputStyle(value) {
    if (typeof value !== 'string') return 'minimal';
    const normalized = value.trim();
    return PROGRAMMER_OUTPUT_STYLES.has(normalized) ? normalized : 'minimal';
}

function hostSupportsResultSchema(options, schema) {
    return Array.isArray(options && options.host && options.host.resultSchemas)
        && options.host.resultSchemas.includes(schema);
}

function hostSupportsPluginResultV2(options = {}) {
    return hostSupportsResultSchema(options, PLUGIN_RESULT_V2_SCHEMA);
}

function hostSupportsProgrammerResultV1(options = {}) {
    return hostSupportsResultSchema(options, PROGRAMMER_RESULT_V1_SCHEMA);
}

function decideProgrammerOutputRoute(config = {}, options = {}) {
    const outputStyle = normalizeProgrammerOutputStyle(config && config.outputStyle);

    if (DIRECT_OUTPUT_STYLES.includes(outputStyle)) {
        return {
            outputStyle,
            resultKind: 'direct',
            structuredDensity: null,
            legacyOutputStyle: outputStyle
        };
    }

    if (hostSupportsPluginResultV2(options)) {
        return {
            outputStyle,
            resultKind: 'plugin-result-v2',
            structuredDensity: outputStyle,
            legacyOutputStyle: 'report'
        };
    }

    if (hostSupportsProgrammerResultV1(options)) {
        return {
            outputStyle,
            resultKind: 'structured',
            structuredDensity: outputStyle,
            legacyOutputStyle: 'report'
        };
    }

    return {
        outputStyle,
        resultKind: 'legacy-report',
        structuredDensity: null,
        legacyOutputStyle: 'report'
    };
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        PLUGIN_RESULT_V2_SCHEMA,
        PROGRAMMER_RESULT_V1_SCHEMA,
        DIRECT_OUTPUT_STYLES,
        normalizeProgrammerOutputStyle,
        hostSupportsPluginResultV2,
        hostSupportsProgrammerResultV1,
        decideProgrammerOutputRoute
    });
}
