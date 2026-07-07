/**
 * Pure math for the total-resistance histogram filter.
 *
 * The x axis is logarithmic (resistance spans decades), so the view/zoom
 * functions operate on generic linear "axis units" — callers feed log10(Ω)
 * coordinates. Ported behaviours (constrain/zoom/pan/initial-view) mirror the
 * legacy zoomable-range-filter.js parity floor, just in log space.
 */

export type ViewDomain = { viewMin: number; viewMax: number };

export function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/** Keep the view inside the full domain and no narrower than minViewSpan. */
export function constrainViewDomain(
	viewMin: number,
	viewMax: number,
	fullMin: number,
	fullMax: number,
	minViewSpan: number
): ViewDomain {
	const fullSpan = fullMax - fullMin;
	let span = viewMax - viewMin;

	if (span < minViewSpan) {
		const mid = (viewMin + viewMax) / 2;
		viewMin = mid - minViewSpan / 2;
		viewMax = mid + minViewSpan / 2;
		span = minViewSpan;
	}

	if (span >= fullSpan) {
		return { viewMin: fullMin, viewMax: fullMax };
	}
	if (viewMin < fullMin) {
		viewMin = fullMin;
		viewMax = fullMin + span;
	}
	if (viewMax > fullMax) {
		viewMax = fullMax;
		viewMin = fullMax - span;
	}
	return { viewMin, viewMax };
}

/** View framing a filter selection with 50% padding either side (legacy "show selection"). */
export function initialViewForFilter(
	fullMin: number,
	fullMax: number,
	filterMin: number,
	filterMax: number,
	minViewSpan: number
): ViewDomain {
	const fullSpan = fullMax - fullMin;
	const filterSpan = Math.max(filterMax - filterMin, fullSpan * 0.01);
	const padding = filterSpan * 0.5;
	return constrainViewDomain(filterMin - padding, filterMax + padding, fullMin, fullMax, minViewSpan);
}

/** Zoom by `factor` (>1 in, <1 out) keeping `anchorValue` at the same fraction of the view. */
export function zoomViewAround(
	viewMin: number,
	viewMax: number,
	anchorValue: number,
	factor: number,
	fullMin: number,
	fullMax: number,
	minViewSpan: number
): ViewDomain {
	const oldSpan = viewMax - viewMin;
	const newSpan = oldSpan / factor;
	const anchorRatio = oldSpan > 0 ? (anchorValue - viewMin) / oldSpan : 0.5;
	const nextMin = anchorValue - anchorRatio * newSpan;
	return constrainViewDomain(nextMin, nextMin + newSpan, fullMin, fullMax, minViewSpan);
}

/** Pan by a fraction of the current span (positive = towards fullMax). */
export function panViewByFraction(
	viewMin: number,
	viewMax: number,
	fraction: number,
	fullMin: number,
	fullMax: number,
	minViewSpan: number
): ViewDomain {
	const delta = (viewMax - viewMin) * fraction;
	return constrainViewDomain(viewMin + delta, viewMax + delta, fullMin, fullMax, minViewSpan);
}

/** First index in `sorted` with sorted[i] >= x (lower bound). */
export function lowerBound(sorted: number[], x: number): number {
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (sorted[mid] < x) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** First index in `sorted` with sorted[i] > x (upper bound). */
export function upperBound(sorted: number[], x: number): number {
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (sorted[mid] <= x) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Count of sorted values within [min, max] inclusive. */
export function countInRange(sorted: number[], min: number, max: number): number {
	if (max < min) return 0;
	return upperBound(sorted, max) - lowerBound(sorted, min);
}

/**
 * Log-x data domain over positive values, padded to ±0.05 decades when the
 * data collapses to a point so the histogram/zoom always has extent.
 */
export function logDomainOf(values: number[]): { minLog: number; maxLog: number } | null {
	let min = Infinity;
	let max = -Infinity;
	for (const v of values) {
		if (!Number.isFinite(v) || v <= 0) continue;
		if (v < min) min = v;
		if (v > max) max = v;
	}
	if (!Number.isFinite(min)) return null;
	let minLog = Math.log10(min);
	let maxLog = Math.log10(max);
	if (maxLog - minLog < 0.1) {
		const mid = (minLog + maxLog) / 2;
		minLog = mid - 0.05;
		maxLog = mid + 0.05;
	}
	return { minLog, maxLog };
}

export type HistogramBin = {
	/** Bin edges in ohms. */
	x0: number;
	x1: number;
	count: number;
};

/**
 * Equal-width bins in log space over [minLog, maxLog].
 * `sortedValues` must be ascending; counting is O(bins·log n) so it can run
 * on every zoom/pan frame without touching the full result set.
 */
export function computeLogBins(
	sortedValues: number[],
	minLog: number,
	maxLog: number,
	binCount: number
): HistogramBin[] {
	if (!(maxLog > minLog) || binCount <= 0) return [];
	const bins: HistogramBin[] = [];
	const step = (maxLog - minLog) / binCount;
	let prevEdge = Math.pow(10, minLog);
	let prevIdx = lowerBound(sortedValues, prevEdge);
	for (let i = 1; i <= binCount; i += 1) {
		const edgeLog = minLog + step * i;
		const edge = Math.pow(10, edgeLog);
		// Last bin is closed on the right so the domain max lands in a bin.
		const idx = i === binCount ? upperBound(sortedValues, edge) : lowerBound(sortedValues, edge);
		bins.push({ x0: prevEdge, x1: edge, count: idx - prevIdx });
		prevEdge = edge;
		prevIdx = idx;
	}
	return bins;
}

/** Legacy overview sizing: one bar per ~8px, clamped to a readable band. */
export function binCountForWidth(width: number): number {
	return Math.max(16, Math.min(100, Math.round(width / 8)));
}

/**
 * Axis tick values (in ohms) for a log view: 1/2/5 per decade, thinned to
 * decade steps (then every-other-decade, …) until they fit `maxTicks`.
 */
export function logTickValues(minLog: number, maxLog: number, maxTicks: number): number[] {
	if (!(maxLog > minLog) || maxTicks < 2) return [];
	const candidates: { lg: number; value: number; isDecade: boolean }[] = [];
	const startDecade = Math.floor(minLog) - 1;
	const endDecade = Math.ceil(maxLog) + 1;
	for (const mantissa of [1, 2, 5]) {
		for (let d = startDecade; d <= endDecade; d += 1) {
			const lg = d + Math.log10(mantissa);
			if (lg >= minLog - 1e-9 && lg <= maxLog + 1e-9) {
				candidates.push({ lg, value: mantissa * Math.pow(10, d), isDecade: mantissa === 1 });
			}
		}
	}
	candidates.sort((a, b) => a.lg - b.lg);
	let ticks = candidates;
	// Thin: full 1-2-5 → decades only → every k-th decade.
	if (ticks.length > maxTicks) {
		ticks = candidates.filter((t) => t.isDecade);
	}
	let stride = 1;
	while (ticks.length / stride > maxTicks) stride += 1;
	const out: number[] = [];
	for (let i = 0; i < ticks.length; i += stride) out.push(ticks[i].value);
	return out;
}

/**
 * Round a filter bound for display/emission: whole ohms at ≥100Ω (legacy
 * rounded to integers), 3 significant figures below that so sub-100Ω data
 * doesn't collapse.
 */
export function roundFilterValue(v: number): number {
	if (!Number.isFinite(v)) return v;
	if (Math.abs(v) >= 100) return Math.round(v);
	if (v === 0) return 0;
	const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2);
	return Math.round(v / mag) * mag;
}
