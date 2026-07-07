import { describe, expect, it } from 'vitest';

import {
	binCountForWidth,
	clamp,
	computeLogBins,
	constrainViewDomain,
	countInRange,
	initialViewForFilter,
	logDomainOf,
	logTickValues,
	lowerBound,
	panViewByFraction,
	roundFilterValue,
	upperBound,
	zoomViewAround
} from './range-filter-math';

describe('constrainViewDomain (legacy parity, axis units)', () => {
	it('returns the full domain when the requested span covers it', () => {
		expect(constrainViewDomain(-5, 20, 0, 10, 0.1)).toEqual({ viewMin: 0, viewMax: 10 });
	});

	it('slides the window back inside the full domain preserving span', () => {
		expect(constrainViewDomain(-2, 3, 0, 10, 0.1)).toEqual({ viewMin: 0, viewMax: 5 });
		expect(constrainViewDomain(8, 13, 0, 10, 0.1)).toEqual({ viewMin: 5, viewMax: 10 });
	});

	it('enforces the minimum span around the midpoint', () => {
		const { viewMin, viewMax } = constrainViewDomain(4.99, 5.01, 0, 10, 1);
		expect(viewMax - viewMin).toBeCloseTo(1);
		expect((viewMin + viewMax) / 2).toBeCloseTo(5);
	});
});

describe('zoomViewAround', () => {
	it('keeps the anchor at the same view fraction', () => {
		const before = { viewMin: 0, viewMax: 8 };
		const anchor = 2; // 25% into the view
		const z = zoomViewAround(before.viewMin, before.viewMax, anchor, 2, 0, 10, 0.01);
		expect(z.viewMax - z.viewMin).toBeCloseTo(4);
		expect((anchor - z.viewMin) / (z.viewMax - z.viewMin)).toBeCloseTo(0.25);
	});

	it('zooming out clamps to the full domain', () => {
		const z = zoomViewAround(2, 4, 3, 0.1, 0, 10, 0.01);
		expect(z).toEqual({ viewMin: 0, viewMax: 10 });
	});
});

describe('panViewByFraction', () => {
	it('pans by the requested fraction of the span', () => {
		expect(panViewByFraction(2, 4, 0.5, 0, 10, 0.01)).toEqual({ viewMin: 3, viewMax: 5 });
	});
	it('stops at the domain edge', () => {
		expect(panViewByFraction(8, 10, 0.5, 0, 10, 0.01)).toEqual({ viewMin: 8, viewMax: 10 });
	});
});

describe('initialViewForFilter', () => {
	it('pads the selection by 50% on each side', () => {
		const v = initialViewForFilter(0, 100, 40, 60, 0.01);
		expect(v.viewMin).toBeCloseTo(30);
		expect(v.viewMax).toBeCloseTo(70);
	});
});

describe('sorted counting helpers', () => {
	const sorted = [1, 2, 2, 2, 5, 9];
	it('lowerBound/upperBound', () => {
		expect(lowerBound(sorted, 2)).toBe(1);
		expect(upperBound(sorted, 2)).toBe(4);
		expect(lowerBound(sorted, 10)).toBe(6);
		expect(upperBound(sorted, 0)).toBe(0);
	});
	it('countInRange is inclusive on both ends', () => {
		expect(countInRange(sorted, 2, 5)).toBe(4);
		expect(countInRange(sorted, 3, 4)).toBe(0);
		expect(countInRange(sorted, 5, 2)).toBe(0);
	});
});

describe('logDomainOf', () => {
	it('spans the positive data in log10', () => {
		const d = logDomainOf([100, 10000, 0, -5, NaN]);
		expect(d).not.toBeNull();
		expect(d!.minLog).toBeCloseTo(2);
		expect(d!.maxLog).toBeCloseTo(4);
	});
	it('pads a single-value domain', () => {
		const d = logDomainOf([1000, 1000]);
		expect(d!.maxLog - d!.minLog).toBeCloseTo(0.1);
	});
	it('returns null with no positive values', () => {
		expect(logDomainOf([0, -1])).toBeNull();
	});
});

describe('computeLogBins', () => {
	it('bins every in-domain value exactly once, including both edges', () => {
		const values = [10, 20, 50, 100, 200, 500, 1000, 5000, 10000].sort((a, b) => a - b);
		const bins = computeLogBins(values, 1, 4, 12); // 10Ω → 10kΩ
		const total = bins.reduce((s, b) => s + b.count, 0);
		expect(total).toBe(values.length);
		expect(bins).toHaveLength(12);
		// Bin edges are log-spaced: constant ratio.
		const ratio = bins[0].x1 / bins[0].x0;
		for (const b of bins) expect(b.x1 / b.x0).toBeCloseTo(ratio, 6);
	});

	it('counts match a brute-force filter for a zoomed view', () => {
		const values = Array.from({ length: 500 }, (_, i) => 10 * Math.pow(1.02, i)).sort(
			(a, b) => a - b
		);
		const bins = computeLogBins(values, 2, 3, 10); // zoomed into 100Ω–1kΩ
		for (const [i, b] of bins.entries()) {
			const brute = values.filter(
				(v) => v >= b.x0 && (i === bins.length - 1 ? v <= b.x1 : v < b.x1)
			).length;
			expect(b.count).toBe(brute);
		}
	});
});

describe('logTickValues', () => {
	it('emits 1-2-5 mantissas when there is room', () => {
		expect(logTickValues(2, 3, 10)).toEqual([100, 200, 500, 1000]);
	});
	it('falls back to decades when 1-2-5 would overflow', () => {
		const ticks = logTickValues(0, 6, 8);
		expect(ticks).toEqual([1, 10, 100, 1000, 10000, 100000, 1000000]);
	});
	it('strides decades for very wide domains', () => {
		const ticks = logTickValues(0, 12, 5);
		expect(ticks.length).toBeLessThanOrEqual(5);
		expect(ticks[0]).toBe(1);
	});
});

describe('misc', () => {
	it('clamp', () => {
		expect(clamp(5, 0, 3)).toBe(3);
		expect(clamp(-1, 0, 3)).toBe(0);
	});
	it('binCountForWidth clamps to [16, 100]', () => {
		expect(binCountForWidth(40)).toBe(16);
		expect(binCountForWidth(800)).toBe(100);
		expect(binCountForWidth(400)).toBe(50);
	});
	it('roundFilterValue: integers ≥100Ω, 3 sig figs below', () => {
		expect(roundFilterValue(1234.4)).toBe(1234);
		expect(roundFilterValue(47.123)).toBeCloseTo(47.1);
		expect(roundFilterValue(0.4567)).toBeCloseTo(0.457);
		expect(roundFilterValue(0)).toBe(0);
	});
});
