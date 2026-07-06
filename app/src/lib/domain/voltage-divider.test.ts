import { describe, expect, it } from 'vitest';

import type { ParsedResistor } from './resistor';
import { formatResistorValue } from './resistor';
import {
	computeDividerResults,
	dedupeDividerResults,
	filterSortLimitDividerResults,
	sortDividerResults,
	type DividerResult
} from './voltage-divider';

function parsed(values: number[]): ParsedResistor[] {
	return values.map((value) => ({
		input: String(value),
		value,
		formatted: formatResistorValue(value)
	}));
}

const VALUES = [100, 220, 470, 1000, 2200, 3300, 4700, 5100, 10000, 22000, 47000, 100000];

function isPlainTwoPart(r: DividerResult, top: number, bottom: number): boolean {
	return (
		r.componentCount === 2 &&
		r.top.kind === 'single' &&
		r.bottom.kind === 'single' &&
		r.top.total === top &&
		r.bottom.total === bottom
	);
}

describe('divider ranking (1k/5k1 from 3V3 regression)', () => {
	const { results } = computeDividerResults({
		resistors: parsed(VALUES),
		supplyVoltage: 3.3,
		targetVoltage: 2.76,
		allowOvershoot: true,
		sortBy: 'error'
	});

	it('search produces the plain 1k/5k1 two-resistor divider', () => {
		expect(results.some((r) => isPlainTwoPart(r, 1000, 5100))).toBe(true);
	});

	it('displayed top 5 includes the two-resistor answer instead of burying it under 3-4 part networks', () => {
		const top5 = filterSortLimitDividerResults(results, {
			minR: 0,
			maxR: Number.MAX_SAFE_INTEGER,
			sortBy: 'error',
			limit: 5,
			supplyVoltage: 3.3
		});
		expect(top5.some((r) => isPlainTwoPart(r, 1000, 5100))).toBe(true);
	});

	it('collapses exact-ratio duplicates to the fewest-part network', () => {
		const ratioKey = (5100 / 6100).toFixed(10);
		const sameRatio = dedupeDividerResults(results).filter(
			(r) => (r.bottom.total / (r.top.total + r.bottom.total)).toFixed(10) === ratioKey
		);
		expect(sameRatio).toHaveLength(1);
		expect(sameRatio[0].componentCount).toBe(2);
	});
});

describe('sortDividerResults', () => {
	const mk = (error: number, componentCount: number, totalResistance: number): DividerResult => ({
		top: { kind: 'single', parts: [1], total: 1, label: '1', componentCount: 1 },
		bottom: { kind: 'single', parts: [1], total: 1, label: '1', componentCount: 1 },
		outputVoltage: 0,
		error,
		totalResistance,
		componentCount
	});

	it('error mode stays a real error sort across buckets', () => {
		const sorted = sortDividerResults([mk(0.2, 2, 1000), mk(0.0005, 4, 5000)], 'error', {
			supplyVoltage: 3.3
		});
		expect(sorted[0].componentCount).toBe(4);
	});

	it('error mode prefers fewer parts within a bucket', () => {
		const sorted = sortDividerResults([mk(0.0001, 4, 5000), mk(0.0009, 2, 6100)], 'error', {
			supplyVoltage: 3.3
		});
		expect(sorted[0].componentCount).toBe(2);
	});

	it('non-error modes keep their existing behaviour', () => {
		const rows = [mk(0.1, 4, 100), mk(0.2, 2, 900), mk(0.05, 3, 500)];
		expect(sortDividerResults(rows, 'components').map((r) => r.componentCount)).toEqual([2, 3, 4]);
		expect(sortDividerResults(rows, 'totalResistanceAsc').map((r) => r.totalResistance)).toEqual([
			100, 500, 900
		]);
		expect(sortDividerResults(rows, 'totalResistanceDesc').map((r) => r.totalResistance)).toEqual([
			900, 500, 100
		]);
	});
});
