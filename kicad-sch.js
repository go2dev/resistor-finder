/**
 * Minimal KiCad 6+ schematic (.kicad_sch) S-expression parser for extracting
 * symbol instances (Reference, Value, Footprint, properties). All client-side.
 */
(function (global) {
    'use strict';

    function skipWs(s, i) {
        while (i < s.length && /\s/.test(s[i])) i++;
        return i;
    }

    function readString(s, i) {
        let out = '';
        i++;
        while (i < s.length) {
            const c = s[i];
            if (c === '\\') {
                i++;
                if (i < s.length) out += s[i++];
                continue;
            }
            if (c === '"') {
                i++;
                return { str: out, i };
            }
            out += s[i++];
        }
        throw new Error('Unterminated string in schematic');
    }

    function readAtom(s, i) {
        let out = '';
        while (i < s.length && !/\s|\)|\(/.test(s[i])) {
            out += s[i++];
        }
        return { str: out, i };
    }

    function parseList(s, i) {
        i = skipWs(s, i);
        if (i >= s.length || s[i] !== '(') {
            throw new Error('Expected "(" in schematic');
        }
        i++;
        const list = [];
        while (true) {
            i = skipWs(s, i);
            if (i >= s.length) throw new Error('Unexpected end in schematic');
            if (s[i] === ')') {
                return { list, i: i + 1 };
            }
            if (s[i] === '(') {
                const inner = parseList(s, i);
                list.push(inner.list);
                i = inner.i;
            } else if (s[i] === '"') {
                const r = readString(s, i);
                list.push(r.str);
                i = r.i;
            } else {
                const r = readAtom(s, i);
                list.push(r.str);
                i = r.i;
            }
        }
    }

    function parseKicadSchText(text) {
        const t = (text || '').replace(/^\uFEFF/, '');
        const trimmed = t.trim();
        if (!trimmed.startsWith('(')) {
            throw new Error('Not a KiCad s-expression schematic');
        }
        return parseList(trimmed, 0).list;
    }

    function collectSymbolInstances(ast) {
        const out = [];
        function walk(node, inLibSymbols) {
            if (!Array.isArray(node) || node.length === 0) return;
            const head = node[0];
            if (head === 'lib_symbols') {
                for (let k = 1; k < node.length; k++) {
                    const ch = node[k];
                    if (Array.isArray(ch)) walk(ch, true);
                }
                return;
            }
            if (head === 'symbol' && !inLibSymbols && typeof node[1] === 'string') {
                out.push(node);
            }
            for (let k = 1; k < node.length; k++) {
                const ch = node[k];
                if (Array.isArray(ch)) walk(ch, inLibSymbols);
            }
        }
        walk(ast, false);
        return out;
    }

    function findFirstStringDeep(node, token) {
        if (!Array.isArray(node)) return '';
        if (node[0] === token) {
            for (let i = 1; i < node.length; i++) {
                if (typeof node[i] === 'string') return node[i];
            }
        }
        for (let i = 1; i < node.length; i++) {
            if (Array.isArray(node[i])) {
                const v = findFirstStringDeep(node[i], token);
                if (v) return v;
            }
        }
        return '';
    }

    function getPropertyMap(symbolNode) {
        const map = Object.create(null);
        for (let i = 1; i < symbolNode.length; i++) {
            const ch = symbolNode[i];
            if (!Array.isArray(ch) || ch[0] !== 'property') continue;
            const key = typeof ch[1] === 'string' ? ch[1] : '';
            const val = typeof ch[2] === 'string' ? ch[2] : '';
            if (key) map[key] = val;
        }
        return map;
    }

    function inBomFromSymbol(symbolNode) {
        for (let i = 1; i < symbolNode.length; i++) {
            const ch = symbolNode[i];
            if (Array.isArray(ch) && ch[0] === 'in_bom') {
                const v = typeof ch[1] === 'string' ? ch[1].toLowerCase() : '';
                return v !== 'no';
            }
        }
        return true;
    }

    /**
     * @param {string} text - full .kicad_sch file contents
     * @returns {{ rows: object[], headers: string[], warnings: string[] }}
     */
    function schematicToResistorRows(text) {
        const warnings = [];
        let ast;
        try {
            ast = parseKicadSchText(text);
        } catch (e) {
            throw e;
        }
        if (!Array.isArray(ast) || ast[0] !== 'kicad_sch') {
            throw new Error('Expected (kicad_sch ...) root');
        }
        const instances = collectSymbolInstances(ast);
        const headers = ['Reference', 'Value', 'Footprint', 'Description', 'Properties'];
        const rows = [];

        instances.forEach((sym, idx) => {
            const libId = typeof sym[1] === 'string' ? sym[1] : '';
            const props = getPropertyMap(sym);
            let reference = props.Reference || props.reference || '';
            if (!reference) {
                reference = findFirstStringDeep(sym, 'reference');
            }
            const value = props.Value || props.value || '';
            const footprint = props.Footprint || props.footprint || '';
            const desc = libId;
            const inBom = inBomFromSymbol(sym);
            const propLine = Object.keys(props)
                .map(k => `${k}=${props[k]}`)
                .join(' | ');
            const row = {
                Reference: reference,
                Value: value,
                Footprint: footprint,
                Description: desc,
                Properties: propLine,
                _lib_id: libId,
                _in_bom: inBom ? 'yes' : 'no'
            };
            if (!reference && !value && !libId) {
                warnings.push(`Symbol instance ${idx + 1}: empty reference and value`);
            }
            rows.push(row);
        });

        return { rows, headers, warnings };
    }

    global.KicadSchParser = {
        parseKicadSchText,
        schematicToResistorRows
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
