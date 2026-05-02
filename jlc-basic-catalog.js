/**
 * Loads JLC "basic" chip resistor data from jlcsearch (with localStorage cache)
 * and ships with a bundled JSON fallback under data/.
 *
 * jlcsearch offset pagination is unreliable for is_basic listings; we merge
 * an unscoped page plus per-package queries and de-duplicate by lcsc.
 */
(function (global) {
    const STORAGE_KEY = 'resistorFinder.jlcBasicResistors.v1';
    const TTL_MS = 24 * 60 * 60 * 1000;
    const PACKAGES = ['0402', '0603', '0805', '1206', '1210', '2010', '2512', '0201', '01005'];

    const API_URLS = [
        'https://jlcsearch.tscircuit.com/resistors/list.json?is_basic=true&limit=100'
    ].concat(
        PACKAGES.map(
            (p) =>
                `https://jlcsearch.tscircuit.com/resistors/list.json?is_basic=true&package=${encodeURIComponent(
                    p
                )}&limit=500`
        )
    );

    const EMBEDDED_URL = 'data/jlc_basic_resistors_embedded.json';

    /** @type {{ rows: object[], ohmSet: Set<number>, byOhms: Map<number, { packages: Set<string>, tolerances: Set<number> }>, source: string, fetchedAt: number } | null} */
    let state = null;
    let initPromise = null;

    function normalizeRow(x) {
        const lcsc = x.lcsc;
        const resistance = typeof x.resistance === 'number' ? x.resistance : parseFloat(x.resistance);
        const pkg = (x.package || '').trim();
        const tf = x.tolerance_fraction;
        const tolPct =
            typeof x.tolerance_percent === 'number'
                ? x.tolerance_percent
                : tf != null
                    ? Number(tf) * 100
                    : null;
        const pm = x.power_milliwatts;
        const powerMw =
            typeof pm === 'number'
                ? pm
                : x.power_watts != null && typeof x.power_watts === 'number'
                    ? x.power_watts * 1000
                    : null;
        return {
            lcsc,
            mfr: x.mfr || '',
            package: pkg,
            resistance: Number.isFinite(resistance) ? resistance : null,
            tolerance_percent: tolPct != null && Number.isFinite(tolPct) ? tolPct : null,
            power_milliwatts: powerMw != null && Number.isFinite(powerMw) ? powerMw : null
        };
    }

    function readCache() {
        try {
            const raw = global.localStorage?.getItem(STORAGE_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || typeof o.fetchedAt !== 'number' || !Array.isArray(o.rows)) return null;
            return o;
        } catch {
            return null;
        }
    }

    function writeCache(rows, fetchedAt) {
        try {
            global.localStorage?.setItem(
                STORAGE_KEY,
                JSON.stringify({ fetchedAt, rows })
            );
        } catch {
            /* quota / private mode */
        }
    }

    function mergeRows(map, list, sourceTag) {
        for (const x of list) {
            if (!x || x.lcsc == null) continue;
            const r = normalizeRow(x);
            if (r.resistance == null || r.resistance < 0) continue;
            const prev = map.get(r.lcsc);
            if (!prev || sourceTag === 'api') {
                map.set(r.lcsc, { ...r, _source: sourceTag });
            }
        }
    }

    /** Ensure static JLC_BASIC LUT nominals are always matchable (offline / API gap). */
    function mergeLutFallback(map) {
        const RU = global.ResistorUtils;
        const lut = RU && RU.luts && RU.luts.JLC_BASIC;
        if (!Array.isArray(lut)) return;
        for (const token of lut) {
            let oh;
            try {
                oh = RU.parseResistorValue(token);
            } catch {
                continue;
            }
            if (!Number.isFinite(oh) || oh < 0) continue;
            const key = `lut:${oh}`;
            if (!map.has(key)) {
                map.set(key, {
                    lcsc: key,
                    mfr: '',
                    package: '',
                    resistance: oh,
                    tolerance_percent: null,
                    power_milliwatts: null,
                    _source: 'lut'
                });
            }
        }
    }

    function buildIndexes(map) {
        const rows = Array.from(map.values());
        const ohmSet = new Set();
        const byOhms = new Map();
        for (const r of rows) {
            const oh = r.resistance;
            if (oh == null || !Number.isFinite(oh) || oh < 0) continue;
            ohmSet.add(oh);
            let agg = byOhms.get(oh);
            if (!agg) {
                agg = { packages: new Set(), tolerances: new Set() };
                byOhms.set(oh, agg);
            }
            if (r.package) agg.packages.add(r.package);
            if (r.tolerance_percent != null) agg.tolerances.add(r.tolerance_percent);
        }
        return { rows, ohmSet, byOhms };
    }

    async function fetchJson(url) {
        const res = await global.fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`${res.status} ${url}`);
        return res.json();
    }

    async function fetchApiMerged() {
        const merged = new Map();
        for (const url of API_URLS) {
            try {
                const data = await fetchJson(url);
                const batch = data.resistors || data.components || [];
                mergeRows(merged, batch, 'api');
            } catch {
                /* continue other URLs */
            }
        }
        return merged;
    }

    async function loadEmbedded() {
        try {
            const data = await fetchJson(EMBEDDED_URL);
            const rows = data.rows || [];
            const m = new Map();
            mergeRows(m, rows, 'embedded');
            return m;
        } catch {
            return new Map();
        }
    }

    async function initInternal() {
        const embeddedMap = await loadEmbedded();
        const cached = readCache();
        const now = Date.now();
        const cacheFresh = cached && now - cached.fetchedAt < TTL_MS;

        const merged = new Map(embeddedMap);
        mergeLutFallback(merged);

        if (cacheFresh) {
            mergeRows(merged, cached.rows, 'api');
        } else {
            const apiMap = await fetchApiMerged();
            for (const [k, v] of apiMap) merged.set(k, v);
            if (apiMap.size > 0) {
                writeCache(Array.from(merged.values()), now);
            }
        }
        mergeLutFallback(merged);

        const { rows, ohmSet, byOhms } = buildIndexes(merged);
        state = {
            rows,
            ohmSet,
            byOhms,
            source: cacheFresh ? 'cache+embedded' : 'api+embedded',
            fetchedAt: cacheFresh ? cached.fetchedAt : now
        };

        if (global.ResistorUtils && typeof global.ResistorUtils.setJlcBasicOhmSet === 'function') {
            global.ResistorUtils.setJlcBasicOhmSet(ohmSet);
        }
        return state;
    }

    function init() {
        if (!initPromise) {
            initPromise = initInternal().catch(() => {
                state = state || { rows: [], ohmSet: new Set(), byOhms: new Map(), source: 'none', fetchedAt: 0 };
                return state;
            });
        }
        return initPromise;
    }

    function getState() {
        return state;
    }

    /**
     * @param {number} ohms
     * @returns {{ packages: string[], tolerances: number[] } | null}
     */
    function getMetaForOhms(ohms) {
        if (!state || typeof ohms !== 'number' || !Number.isFinite(ohms) || ohms <= 0) return null;
        for (const ref of state.ohmSet) {
            const tol = Math.max(1e-12, Math.min(ohms, ref) * 1e-9);
            if (Math.abs(ohms - ref) <= tol) {
                const agg = state.byOhms.get(ref);
                if (!agg) return { packages: [], tolerances: [] };
                return {
                    packages: Array.from(agg.packages).sort(),
                    tolerances: Array.from(agg.tolerances).sort((a, b) => a - b)
                };
            }
        }
        return null;
    }

    global.JlcBasicCatalog = { init, getState, getMetaForOhms, TTL_MS, STORAGE_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
