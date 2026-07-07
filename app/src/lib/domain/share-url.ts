/**
 * Deep-link query schema (owner decision 2026-07-06: human-readable key=value;
 * inputs always encoded, sort/filter only when they differ from defaults).
 * Documented in docs/url-schema.md — treat parameter names as a public API.
 */
import type { SortBy } from './voltage-divider';

export type DividerShareState = {
	/** As typed — number inputs bind numbers at runtime, so both are accepted. */
	supply: string | number;
	target: string | number;
	resistors: string;
	allowOvershoot: boolean;
	snapToSeries: boolean;
	snapSeries: string;
	sortBy: SortBy;
	/** Included only when the user narrowed the band (Ω, plain numbers). */
	filterMin?: string;
	filterMax?: string;
};

export type TargetShareState = {
	target: string | number;
	resistors: string;
	snapToSeries: boolean;
	snapSeries: string;
};

export const DIVIDER_SHARE_DEFAULTS = {
	allowOvershoot: true,
	snapToSeries: false,
	snapSeries: 'E24',
	sortBy: 'error' as SortBy
};

const SORT_TOKENS: Record<SortBy, string> = {
	error: 'error',
	components: 'parts',
	totalResistanceAsc: 'rasc',
	totalResistanceDesc: 'rdesc'
};
const SORT_FROM_TOKEN: Record<string, SortBy> = Object.fromEntries(
	Object.entries(SORT_TOKENS).map(([k, v]) => [v, k as SortBy])
);

/** Collapse whitespace/comma-separated resistor input to a canonical comma list. */
export function normalizeResistorList(raw: string): string {
	return raw
		.split(/[\s,]+/)
		.filter(Boolean)
		.join(',');
}

/**
 * Query-string encoding that keeps the sharing format readable: commas and
 * parens stay literal (both are legal in query values per RFC 3986);
 * everything else follows encodeURIComponent (%, &, =, spaces, …).
 */
function encodeReadable(value: string): string {
	return encodeURIComponent(value)
		.replace(/%2C/gi, ',')
		.replace(/%28/g, '(')
		.replace(/%29/g, ')');
}

function toQuery(pairs: [string, string][]): string {
	if (pairs.length === 0) return '';
	return '?' + pairs.map(([k, v]) => `${k}=${encodeReadable(v)}`).join('&');
}

function searchParamsOf(qs: string | URLSearchParams): URLSearchParams {
	return typeof qs === 'string' ? new URLSearchParams(qs.replace(/^\?/, '')) : qs;
}

export function buildDividerShareQuery(s: DividerShareState): string {
	const pairs: [string, string][] = [];
	const vs = String(s.supply ?? '').trim();
	const vt = String(s.target ?? '').trim();
	if (vs) pairs.push(['vs', vs]);
	if (vt) pairs.push(['vt', vt]);
	const list = normalizeResistorList(s.resistors);
	if (list) pairs.push(['r', list]);
	if (s.allowOvershoot !== DIVIDER_SHARE_DEFAULTS.allowOvershoot) pairs.push(['os', '0']);
	if (s.snapToSeries) pairs.push(['snap', s.snapSeries]);
	if (s.sortBy !== DIVIDER_SHARE_DEFAULTS.sortBy) pairs.push(['sort', SORT_TOKENS[s.sortBy]]);
	if (s.filterMin != null && s.filterMax != null) {
		pairs.push(['rmin', s.filterMin], ['rmax', s.filterMax]);
	}
	return toQuery(pairs);
}

/** Parsed deep-link state — always strings (they feed text/number inputs). */
export type ParsedDividerShare = Partial<
	Omit<DividerShareState, 'supply' | 'target'> & { supply: string; target: string }
>;

export function parseDividerShareQuery(qs: string | URLSearchParams): ParsedDividerShare {
	const p = searchParamsOf(qs);
	const out: ParsedDividerShare = {};
	const vs = p.get('vs');
	const vt = p.get('vt');
	const r = p.get('r');
	if (vs != null && vs.trim()) out.supply = vs.trim();
	if (vt != null && vt.trim()) out.target = vt.trim();
	if (r != null && r.trim()) out.resistors = normalizeResistorList(r).split(',').join(', ');
	if (p.get('os') === '0') out.allowOvershoot = false;
	const snap = p.get('snap');
	if (snap && /^E(24|48|96|192)$/.test(snap)) {
		out.snapToSeries = true;
		out.snapSeries = snap;
	}
	const sort = p.get('sort');
	if (sort && SORT_FROM_TOKEN[sort]) out.sortBy = SORT_FROM_TOKEN[sort];
	const rmin = p.get('rmin');
	const rmax = p.get('rmax');
	if (rmin != null && rmax != null) {
		const lo = Number(rmin);
		const hi = Number(rmax);
		if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi) {
			out.filterMin = rmin;
			out.filterMax = rmax;
		}
	}
	return out;
}

export function buildTargetShareQuery(s: TargetShareState): string {
	const pairs: [string, string][] = [];
	const rt = String(s.target ?? '').trim();
	if (rt) pairs.push(['rt', rt]);
	const list = normalizeResistorList(s.resistors);
	if (list) pairs.push(['r', list]);
	if (s.snapToSeries) pairs.push(['snap', s.snapSeries]);
	return toQuery(pairs);
}

export type ParsedTargetShare = Partial<Omit<TargetShareState, 'target'> & { target: string }>;

export function parseTargetShareQuery(qs: string | URLSearchParams): ParsedTargetShare {
	const p = searchParamsOf(qs);
	const out: ParsedTargetShare = {};
	const rt = p.get('rt');
	const r = p.get('r');
	if (rt != null && rt.trim()) out.target = rt.trim();
	if (r != null && r.trim()) out.resistors = normalizeResistorList(r).split(',').join(', ');
	const snap = p.get('snap');
	if (snap && /^E(24|48|96|192)$/.test(snap)) {
		out.snapToSeries = true;
		out.snapSeries = snap;
	}
	return out;
}
