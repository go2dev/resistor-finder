/**
 * Client-side BOM / spreadsheet parsing for resistor extraction.
 * Uses SheetJS (vendored xlsx.full.min.js) for .xlsx / .xls / .ods when loaded in the browser.
 */
(function (global) {
    'use strict';

    const DNP_PATTERNS = [
        /\bdnf\b/i,
        /\bdnp\b/i,
        /\bdni\b/i,
        /\bdo not (fit|populate|install)\b/i,
        /\bnot (fitted|populated|installed)\b/i,
        /\bexclude(d)?\b/i,
        /\bomit(ted)?\b/i,
        /\bn\/a\b/i,
        /\bno (fit|load)\b/i,
        /\bnf\b/i,
        /\bnoc\b/i
    ];

    const STRONG_KEYWORDS = [
        /\bresistors?\b/i,
        /\bresistance\b/i,
        /\bresistive\b/i,
        /\bohms?\b/i,
        /Ω/,
        /Ω/,
        /\b\d+(?:\.\d+)?\s*[kKmMgGrRlL][ωωΩ]?\b/i,
        /\b\d+(?:\.\d+)?\s*ω\b/i,
        /\bchip\s*res\b/i,
        /\bthick\s*film\b/i,
        /\bthin\s*film\b/i
    ];

    const ZERO_OHM_PATTERNS = [
        /\b0\s*ohm/i,
        /\b0r\b/i,
        /^0r$/i,
        /\b0Ω\b/i,
        /\bjumper\b/i,
        /\bzero\s*ohm/i,
        /\b0\.0+\s*ohm/i
    ];

    const VALUE_HEADER_HINT = /^(value|resistance|res\.?|ohms?|comp(ONENT)?\s*value|size|description|comment|part\s*comment|notes?)$/i;
    const QTY_HEADER_HINT = /^(qty|quantity|q\.?ty|count|amount|#|#\.?\s*of|pieces?|multiples?|mqty|order\s*qty|usage)$/i;
    const DESIGNATOR_HEADER_HINT = /^(designator|reference|ref|id|pos)$/i;

    /** Plain numbers that match IPC / metric footprint sizes — not resistance (e.g. 1210 in "1210 (3225 Metric)"). */
    const FOOTPRINT_SIZE_CODE = new Set([
        '01005', '02016', '0201', '0402', '0603', '0805', '1206', '1210', '2010', '2512', '1812',
        '1005', '1608', '2012', '2520', '3216', '3225', '3528', '4532', '5664', '5750',
        '2220', '2225', '2824', '3040', '3640', '02032', '03015', '05025', '0612', '0617', '1020'
    ]);

    function isFootprintSizeCodeToken(t) {
        const u = String(t || '').trim();
        if (!u) return false;
        if (FOOTPRINT_SIZE_CODE.has(u)) return true;
        if (/^0\d{3}$/.test(u)) return true;
        return false;
    }
    const TOL_HEADER_HINT = /tol|precision|accuracy|pct|%/i;
    const SERIES_HEADER_HINT = /e\s*(24|48|96|192)|series|decade/i;

    function stripBom(s) {
        if (!s || s.length === 0) return s;
        if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
        return s;
    }

    function parseCsvLine(line) {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (inQuotes) {
                if (c === '"') {
                    if (line[i + 1] === '"') {
                        cur += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cur += c;
                }
            } else if (c === '"') {
                inQuotes = true;
            } else if (c === ',') {
                out.push(cur);
                cur = '';
            } else {
                cur += c;
            }
        }
        out.push(cur);
        return out.map(cell => cell.trim());
    }

    function csvTextToTable(text) {
        const t = stripBom(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!t.trim()) return [];
        const lines = t.split('\n');
        return lines.map(line => parseCsvLine(line));
    }

    function tableToObjects(table) {
        if (!table || table.length === 0) return { headers: [], rows: [] };
        const headers = (table[0] || []).map((h, i) => {
            const s = String(h == null ? '' : h).trim();
            return s || `col_${i}`;
        });
        const rows = [];
        for (let r = 1; r < table.length; r++) {
            const line = table[r];
            if (!line || line.every(c => String(c == null ? '' : c).trim() === '')) continue;
            const obj = {};
            headers.forEach((h, i) => {
                obj[h] = line[i] != null ? String(line[i]).trim() : '';
            });
            rows.push(obj);
        }
        return { headers, rows };
    }

    function rowObjectToSearchText(row) {
        return Object.values(row)
            .map(v => String(v == null ? '' : v))
            .join(' | ');
    }

    function rowHasDnp(rowText) {
        const lower = rowText.toLowerCase();
        return DNP_PATTERNS.some(re => re.test(rowText) || re.test(lower));
    }

    function rowHasStrongKeyword(text) {
        return STRONG_KEYWORDS.some(re => re.test(text));
    }

    function rowHasDesignatorR(text) {
        return /\bR\d{1,5}\b/i.test(text);
    }

    function rowSuggestsZeroOhm(text) {
        return ZERO_OHM_PATTERNS.some(re => re.test(text));
    }

    function scoreHeaderForValue(h) {
        const s = String(h || '').trim();
        if (QTY_HEADER_HINT.test(s)) return -1000;
        if (DESIGNATOR_HEADER_HINT.test(s)) return -1000;
        if (VALUE_HEADER_HINT.test(s)) return 10;
        if (/mpn|manufacturer|package|footprint|libref|sku|part\s*number|partnumber|supplier/i.test(s)) return 0;
        return 1;
    }

    function scoreHeaderForTolerance(h) {
        return TOL_HEADER_HINT.test(String(h || '').trim()) ? 5 : 0;
    }

    function scoreHeaderForSeries(h) {
        return SERIES_HEADER_HINT.test(String(h || '').trim()) ? 5 : 0;
    }

    function tryParseResistanceToken(token) {
        if (!token || typeof token !== 'string') return null;
        const t = token.trim();
        if (!t || t.length > 80) return null;
        if (isFootprintSizeCodeToken(t)) return null;
        try {
            const v = ResistorUtils.parseResistorValue(t);
            if (!Number.isFinite(v) || v <= 0) return null;
            return { raw: t, value: v };
        } catch (e) {
            return null;
        }
    }

    function tryParseFullCell(cell) {
        if (!cell || typeof cell !== 'string') return null;
        const s = cell.trim();
        if (!s) return null;
        if (isFootprintSizeCodeToken(s)) return null;
        if (/^\d+$/.test(s)) {
            const n = parseInt(s, 10);
            if (n >= 2 && n <= 999999) return null;
        }
        try {
            const parsed = ResistorUtils.parseResistorInput(s, { snapToSeries: false });
            if (!Number.isFinite(parsed.value) || parsed.value <= 0) return null;
            return { parsed, raw: s };
        } catch (e) {
            return null;
        }
    }

    function extractSeriesFromText(text) {
        const m = String(text || '').match(/\bE(24|48|96|192)\b/i);
        if (m) return 'E' + m[1];
        return null;
    }

    function extractToleranceFromText(text, warnings) {
        const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) {
            const n = parseFloat(m[1]);
            if (Number.isFinite(n)) return n;
        }
        const letter = String(text || '').match(/\b([ABCDEGFHJKLMNPW])\b/i);
        if (letter && ResistorUtils.toleranceLetterMap[letter[1].toUpperCase()] != null) {
            return ResistorUtils.toleranceLetterMap[letter[1].toUpperCase()];
        }
        return null;
    }

    function pickValueCell(row, headers) {
        let best = null;
        let bestScore = -1;
        headers.forEach(h => {
            const cell = row[h];
            if (cell == null || String(cell).trim() === '') return;
            const full = tryParseFullCell(String(cell));
            const tok = full ? null : tryParseResistanceToken(String(cell));
            const sc = scoreHeaderForValue(h) + (full ? 8 : tok ? 4 : 0);
            if (sc > bestScore) {
                bestScore = sc;
                if (full) {
                    best = { type: 'full', parsed: full.parsed, displayRaw: full.raw };
                } else if (tok) {
                    best = { type: 'token', value: tok.value, displayRaw: tok.raw };
                }
            }
        });
        if (best) return best;
        headers.forEach(h => {
            if (scoreHeaderForValue(h) < 0) return;
            const cell = row[h];
            if (!cell) return;
            const parts = String(cell).split(/[\s,;/|]+/).filter(Boolean);
            for (const p of parts) {
                const tok = tryParseResistanceToken(p);
                if (tok && (!best || tok.value > 0)) {
                    best = { type: 'token', value: tok.value, displayRaw: tok.raw };
                }
            }
        });
        return best;
    }

    function mergeParsedMeta(primary, rowText, headers, row) {
        let tolerance = primary.tolerance != null ? primary.tolerance : null;
        let series = primary.series || null;
        headers.forEach(h => {
            if (scoreHeaderForTolerance(h) && row[h]) {
                const t = ResistorUtils.parseToleranceInput(String(row[h]), null);
                if (t != null) tolerance = t;
            }
            if (scoreHeaderForSeries(h) && row[h]) {
                const s = extractSeriesFromText(row[h]);
                if (s) series = s;
            }
        });
        if (tolerance == null) {
            const t2 = extractToleranceFromText(rowText, null);
            if (t2 != null) tolerance = t2;
        }
        if (!series) series = extractSeriesFromText(rowText);
        if (!series && tolerance != null) {
            series = ResistorUtils.getSeriesForTolerance(tolerance);
        }
        return { tolerance, series };
    }

    function isResistorRow(row, headers, rowText) {
        const strong = rowHasStrongKeyword(rowText);
        const hasR = rowHasDesignatorR(rowText);
        const valuePick = pickValueCell(row, headers);
        if (strong) return { match: true, reason: 'strong' };
        if (hasR && valuePick) return { match: true, reason: 'ref+value' };
        return { match: false, reason: 'none' };
    }

    function formatOhmValueForInput(value) {
        return ResistorUtils.formatResistorValue(value).replace(/Ω/g, '').trim();
    }

    function buildInputString(value, tolerance, series) {
        const base = formatOhmValueForInput(value);
        const bracketParts = [];
        if (tolerance != null && Number.isFinite(tolerance)) {
            const dec = tolerance % 1 === 0 ? String(Math.round(tolerance)) : String(tolerance);
            bracketParts.push(dec + '%');
        } else if (series && /^E\d+/i.test(series)) {
            bracketParts.push(series.toUpperCase());
        }
        if (bracketParts.length) return `${base}(${bracketParts.join(', ')})`;
        return base;
    }

    function dedupeKey(value, tolerance, series, powerRating, powerCode, footprint) {
        const tol = tolerance != null && Number.isFinite(tolerance) ? tolerance : '';
        const ser = series || '';
        const pr = powerRating != null ? powerRating : '';
        const pc = powerCode || '';
        const fp = footprint != null && String(footprint).trim() !== '' ? String(footprint).trim() : '';
        return `${value}|${tol}|${ser}|${pr}|${pc}|${fp}`;
    }

    /**
     * @param {object} options
     * @param {Array<object>} options.rows - row objects from tableToObjects
     * @param {string[]} options.headers
     * @param {boolean} options.includeDnp
     * @returns {{ csv: string, warnings: string[], stats: object }}
     */
    function extractResistorsFromRows(options) {
        const { rows, headers, includeDnp } = options;
        const warnings = [];
        const entries = [];
        let skippedZero = 0;
        let skippedDnp = 0;
        let skippedNoMatch = 0;

        rows.forEach((row, idx) => {
            const rowText = rowObjectToSearchText(row);
            if (!rowText.trim()) return;
            if (row._in_bom === 'no' && !includeDnp) {
                skippedDnp++;
                return;
            }
            const dnp = rowHasDnp(rowText);
            if (dnp && !includeDnp) {
                skippedDnp++;
                return;
            }
            const { match } = isResistorRow(row, headers, rowText);
            if (!match) {
                skippedNoMatch++;
                return;
            }
            if (rowSuggestsZeroOhm(rowText)) {
                skippedZero++;
                return;
            }
            const pick = pickValueCell(row, headers);
            if (!pick) {
                warnings.push(`Row ${idx + 2}: matched as resistor but no parseable value`);
                return;
            }
            let parsed;
            if (pick.type === 'full') {
                parsed = pick.parsed;
            } else {
                try {
                    parsed = ResistorUtils.parseResistorInput(pick.displayRaw, { snapToSeries: false });
                } catch (e) {
                    warnings.push(`Row ${idx + 2}: could not parse "${pick.displayRaw}"`);
                    return;
                }
            }
            if (!Number.isFinite(parsed.value) || parsed.value <= 0) {
                skippedZero++;
                return;
            }
            if (parsed.value < 1e-9) {
                skippedZero++;
                return;
            }
            const merged = mergeParsedMeta(parsed, rowText, headers, row);
            const tolerance = merged.tolerance != null ? merged.tolerance : parsed.tolerance;
            const series = merged.series || parsed.series;
            const footprint = row.Footprint != null ? String(row.Footprint).trim() : '';
            entries.push({
                value: parsed.value,
                tolerance: tolerance != null ? tolerance : null,
                series: series || null,
                powerRating: parsed.powerRating,
                powerCode: parsed.powerCode,
                footprint: footprint || null,
                dnp
            });
        });

        const seen = new Map();
        const unique = [];
        entries.forEach(e => {
            const key = dedupeKey(e.value, e.tolerance, e.series, e.powerRating, e.powerCode, e.footprint);
            if (seen.has(key)) return;
            seen.set(key, true);
            unique.push(e);
        });

        unique.sort((a, b) => {
            if (a.value !== b.value) return a.value - b.value;
            const ta = a.tolerance != null ? a.tolerance : -1;
            const tb = b.tolerance != null ? b.tolerance : -1;
            if (ta !== tb) return ta - tb;
            return String(a.series || '').localeCompare(String(b.series || ''));
        });

        const strings = unique.map(e => buildInputString(e.value, e.tolerance, e.series));
        const csv = strings.join(', ');

        return {
            csv,
            warnings,
            stats: {
                count: unique.length,
                skippedZero,
                skippedDnp,
                skippedNoMatch
            }
        };
    }

    function workbookToFirstTable(workbook) {
        const XLSX = global.XLSX;
        if (!XLSX || !workbook.SheetNames || !workbook.SheetNames.length) {
            throw new Error('No sheets in workbook');
        }
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        return { table: aoa, sheetName };
    }

    function parseSpreadsheetArrayBuffer(buf) {
        const XLSX = global.XLSX;
        if (!XLSX || !XLSX.read) {
            throw new Error('Spreadsheet parser not loaded');
        }
        const workbook = XLSX.read(buf, { type: 'array' });
        return workbookToFirstTable(workbook);
    }

    function tableFromTextDelimited(text, delimiter) {
        const t = stripBom(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!t.trim()) return [];
        const lines = t.split('\n');
        if (delimiter === '\t') {
            return lines.map(line => line.split('\t').map(c => c.trim()));
        }
        return lines.map(line => parseCsvLine(line));
    }

    function sniffBinarySpreadsheet(buf) {
        if (!buf || buf.byteLength < 4) return false;
        const u8 = new Uint8Array(buf);
        if (u8[0] === 0x50 && u8[1] === 0x4b) return true;
        if (u8[0] === 0xd0 && u8[1] === 0xcf) return true;
        return false;
    }

    function applyBomToInput(inputEl, file, includeDnp, onDone) {
        const name = (file && file.name) || '';
        const dot = name.lastIndexOf('.');
        const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
        const mime = (file && file.type) || '';
        const isTextBom = ext === 'csv' || ext === 'txt' || mime === 'text/csv' || mime === 'text/plain';
        const isTsv = ext === 'tsv' || mime === 'text/tab-separated-values';
        const isKnownSheet = ['xlsx', 'xls', 'ods', 'xlsm', 'xltx', 'xltm'].indexOf(ext) >= 0
            || mime.indexOf('spreadsheet') >= 0
            || mime.indexOf('excel') >= 0
            || mime.indexOf('opendocument') >= 0;
        const isKicadSch = ext === 'kicad_sch' || name.toLowerCase().endsWith('.kicad_sch');

        const reader = new FileReader();
        reader.onerror = () => {
            if (onDone) onDone({ ok: false, error: 'Failed to read file' });
        };
        reader.onload = e => {
            try {
                let table;
                if (isTextBom) {
                    const text = typeof e.target.result === 'string' ? e.target.result : '';
                    table = csvTextToTable(text);
                } else if (isKicadSch) {
                    const text = typeof e.target.result === 'string' ? e.target.result : '';
                    const KSP = global.KicadSchParser;
                    if (!KSP || !KSP.schematicToResistorRows) {
                        throw new Error('KiCad schematic parser not loaded');
                    }
                    const warnings = [];
                    const sch = KSP.schematicToResistorRows(text);
                    sch.warnings.forEach(w => warnings.push(w));
                    const { csv, warnings: ew, stats } = extractResistorsFromRows({
                        rows: sch.rows,
                        headers: sch.headers,
                        includeDnp
                    });
                    ew.forEach(w => warnings.push(w));
                    if (inputEl) inputEl.value = csv;
                    if (onDone) {
                        onDone({
                            ok: true,
                            csv,
                            warnings,
                            stats: Object.assign({}, stats, { source: 'kicad_sch' }),
                            filename: name
                        });
                    }
                    return;
                } else if (isTsv) {
                    const text = typeof e.target.result === 'string' ? e.target.result : '';
                    table = tableFromTextDelimited(text, '\t');
                } else {
                    const buf = e.target.result;
                    const tryBinary = isKnownSheet || (buf && buf.byteLength > 0 && sniffBinarySpreadsheet(buf));
                    if (tryBinary && global.XLSX) {
                        try {
                            table = workbookToFirstTable(global.XLSX.read(buf, { type: 'array' })).table;
                        } catch (binErr) {
                            const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
                            table = csvTextToTable(text);
                        }
                    } else {
                        const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
                        table = csvTextToTable(text);
                    }
                }
                const { headers, rows } = tableToObjects(table);
                const { csv, warnings, stats } = extractResistorsFromRows({ rows, headers, includeDnp });
                if (inputEl) inputEl.value = csv;
                if (onDone) onDone({ ok: true, csv, warnings, stats, filename: name });
            } catch (err) {
                if (onDone) onDone({ ok: false, error: err.message || String(err) });
            }
        };
        if (isTextBom || isTsv || isKicadSch) {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    }

    function initResistorBomDropZone(options) {
        const inputEl = options && options.input;
        if (!inputEl || !inputEl.parentElement) return;
        const wrap = document.createElement('div');
        wrap.className = 'resistor-input-bom-wrap';
        inputEl.parentNode.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);

        const hint = document.createElement('div');
        hint.className = 'bom-drop-hint';
        hint.innerHTML = 'Drag and drop a BOM or KiCad schematic (.kicad_sch) here (CSV, Excel .xlsx/.xls, OpenDocument .ods). Parsed entirely in your browser.';

        const row = document.createElement('div');
        row.className = 'bom-dnp-row';
        const label = document.createElement('label');
        label.className = 'bom-dnp-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        const pageKey = (document.body && document.body.dataset && document.body.dataset.page) || 'app';
        cb.id = `bomIncludeDnp_${pageKey}`;
        const stored = global.localStorage && global.localStorage.getItem(`bomIncludeDnp_${pageKey}`);
        cb.checked = stored === '1';
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' Include DNP / DNF / excluded lines from BOM'));
        row.appendChild(label);

        const status = document.createElement('div');
        status.className = 'bom-status';
        status.setAttribute('aria-live', 'polite');

        wrap.appendChild(hint);
        wrap.appendChild(row);
        wrap.appendChild(status);

        cb.addEventListener('change', () => {
            if (global.localStorage) global.localStorage.setItem(`bomIncludeDnp_${pageKey}`, cb.checked ? '1' : '0');
        });

        function setStatus(msg, isError) {
            status.textContent = msg || '';
            status.classList.toggle('bom-status-error', Boolean(isError));
        }

        function handleFiles(files) {
            if (!files || !files.length) return;
            const file = files[0];
            applyBomToInput(inputEl, file, cb.checked, result => {
                if (!result.ok) {
                    setStatus(result.error || 'Could not parse file', true);
                    return;
                }
                const w = (result.warnings && result.warnings.length)
                    ? ` (${result.warnings.length} warning(s))`
                    : '';
                const src = result.stats && result.stats.source === 'kicad_sch' ? 'Schematic' : 'BOM';
                setStatus(`${src}: ${result.stats.count} resistor value(s) from "${result.filename || 'file'}"${w}`, false);
                if (options.onApplied) options.onApplied(result);
            });
        }

        ['dragenter', 'dragover'].forEach(ev => {
            wrap.addEventListener(ev, e => {
                e.preventDefault();
                e.stopPropagation();
                wrap.classList.add('bom-dragover');
            });
        });
        ['dragleave', 'drop'].forEach(ev => {
            wrap.addEventListener(ev, e => {
                e.preventDefault();
                e.stopPropagation();
                wrap.classList.remove('bom-dragover');
            });
        });
        wrap.addEventListener('drop', e => {
            handleFiles(e.dataTransfer && e.dataTransfer.files);
        });

        inputEl.addEventListener('paste', ev => {
            const items = ev.clipboardData && ev.clipboardData.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (it.kind === 'file') {
                    const f = it.getAsFile();
                    if (f) {
                        ev.preventDefault();
                        handleFiles([f]);
                        return;
                    }
                }
            }
        });
    }

    global.BomParser = {
        csvTextToTable,
        tableToObjects,
        extractResistorsFromRows,
        parseSpreadsheetArrayBuffer,
        workbookToFirstTable,
        initResistorBomDropZone,
        applyBomToInput,
        _test: {
            rowHasDnp: rowText => rowHasDnp(rowText),
            isResistorRow: (row, headers, rowText) => isResistorRow(row, headers, rowText)
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
