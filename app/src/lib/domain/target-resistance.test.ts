import { describe, expect, it } from 'vitest';

import {
	LIMITS,
	applyErrorFilter,
	applyResistorHeuristic,
	buildResults,
	dedupeResults,
	filterResultsByExcludedKeys,
	formatCombination,
	generateCombinations,
	getEffectiveLimits,
	sortResults,
	wrapText,
	type ComboNode,
	type ComboResistor,
	type ComboSection
} from './target-resistance';

function r(value: number, tolerance = 1, id?: number | string): ComboResistor {
	return { id: id ?? value, key: `k-${id ?? value}`, value, tolerance };
}

function series(...children: ComboNode[]): ComboSection {
	const section = [...children] as ComboSection;
	section.type = 'series';
	return section;
}

function parallel(...children: ComboNode[]): ComboSection {
	const section = [...children] as ComboSection;
	section.type = 'parallel';
	return section;
}

/** Structural key so combination lists can be compared order-sensitively. */
function comboKey(section: ComboNode): string {
	if (!Array.isArray(section)) return String(section.value);
	return `${section.type || 'series'}[${section.map(comboKey).join(',')}]`;
}

/* ------------------------------------------------------------------------ *
 * Legacy oracle: verbatim port of target-resistance-worker.js
 * generateCombinations (lines 96-296), with progress posting stripped
 * (progress does not influence which combinations are produced) and bounds
 * using the pre-resolved `tolerance` field like the app engine.
 * ------------------------------------------------------------------------ */
/* eslint-disable @typescript-eslint/no-explicit-any */
function legacyCalculateResistorBounds(resistor: any) {
	const value = resistor.value ?? resistor;
	const tolerance = resistor.tolerance ?? 0;
	const multiplier = tolerance / 100;
	return { lower: value * (1 - multiplier), upper: value * (1 + multiplier) };
}

function legacyCalculateSectionBounds(section: any): { lower: number; upper: number } {
	if (!Array.isArray(section)) {
		return legacyCalculateResistorBounds(section);
	}
	const type = (section as ComboSection).type || 'series';
	const bounds = section.map((child) => legacyCalculateSectionBounds(child));
	if (bounds.some((bound) => !bound || !Number.isFinite(bound.lower) || !Number.isFinite(bound.upper))) {
		return { lower: NaN, upper: NaN };
	}
	if (type === 'parallel') {
		const min = 1 / bounds.reduce((sum, b) => sum + 1 / b.lower, 0);
		const max = 1 / bounds.reduce((sum, b) => sum + 1 / b.upper, 0);
		return { lower: min, upper: max };
	}
	const lower = bounds.reduce((sum, b) => sum + b.lower, 0);
	const upper = bounds.reduce((sum, b) => sum + b.upper, 0);
	return { lower, upper };
}

function legacyResistanceOf(section: any): number {
	if (!Array.isArray(section)) {
		return section.value ?? section;
	}
	const type = (section as ComboSection).type || 'series';
	if (type === 'parallel') {
		const reciprocal = section.reduce((sum, item) => sum + 1 / legacyResistanceOf(item), 0);
		return 1 / reciprocal;
	}
	return section.reduce((sum, item) => sum + legacyResistanceOf(item), 0);
}

function legacyBuildSingleBounds(resistors: any[]) {
	return resistors.map((resistor) => ({
		lower: legacyCalculateResistorBounds(resistor).lower,
		upper: legacyCalculateResistorBounds(resistor).upper
	}));
}

function legacyOverlapsSingle(bounds: any, singleBounds: any[]) {
	return singleBounds.some((single) => bounds.lower <= single.upper && bounds.upper >= single.lower);
}

function legacyGetChunkRange(total: number, chunkIndex: number, chunkCount: number) {
	if (chunkCount <= 1 || total <= 0) return [0, total];
	const size = Math.ceil(total / chunkCount);
	const start = chunkIndex * size;
	const end = Math.min(start + size, total);
	return [start, end];
}

function legacyEstimateComboCount(valueCount: number, comboSize: number, cap = Number.MAX_SAFE_INTEGER) {
	if (comboSize <= 1) return valueCount;
	let total = 1;
	for (let i = 1; i <= comboSize; i++) {
		total = (total * (valueCount + i - 1)) / i;
		if (total > cap) return cap + 1;
	}
	return total;
}

function legacyGenerateCombinations(resistors: any[], options: any = {}) {
	const maxParallel = options.maxParallel ?? 5;
	const maxSeriesBlocks = options.maxSeriesBlocks ?? 5;
	const maxBlocks = options.maxBlocks ?? 250;
	const maxCombos = options.maxCombos ?? 20000;
	const maxParallelCombos = options.maxParallelCombos ?? 1000000;
	const targetValue = options.targetValue ?? null;
	const chunkIndex = options.chunkIndex ?? 0;
	const chunkCount = options.chunkCount ?? 1;
	const blocks: any[] = [];
	const singleBounds = legacyBuildSingleBounds(resistors);
	const shouldPruneSingles =
		Number.isFinite(targetValue) &&
		singleBounds.some((single) => targetValue >= single.lower && targetValue <= single.upper);
	let prunedBlocks = 0;
	let prunedCombos = 0;

	const buildIndexCombos = (
		startIdx: number,
		depth: number,
		targetDepth: number,
		current: number[],
		result: number[][],
		valueCount = resistors.length
	) => {
		if (depth === targetDepth) {
			result.push([...current]);
			return;
		}
		for (let i = startIdx; i < valueCount; i++) {
			current.push(i);
			buildIndexCombos(i, depth + 1, targetDepth, current, result, valueCount);
			current.pop();
		}
	};

	resistors.forEach((resistor) => blocks.push(resistor));

	for (let size = 2; size <= maxParallel; size++) {
		if (legacyEstimateComboCount(resistors.length, size, maxParallelCombos) > maxParallelCombos) {
			break;
		}
		const combos: number[][] = [];
		buildIndexCombos(0, 0, size, [], combos);
		combos.forEach((indices) => {
			const parallelBlock: any = indices.map((idx) => resistors[idx]);
			parallelBlock.type = 'parallel';
			const bounds = legacyCalculateSectionBounds(parallelBlock);
			if (shouldPruneSingles && legacyOverlapsSingle(bounds, singleBounds)) {
				prunedBlocks += 1;
				return;
			}
			blocks.push(parallelBlock);
		});
	}

	let filteredBlocks = blocks;
	if (targetValue) {
		const ranked = blocks
			.map((block) => ({
				block,
				diff: Math.abs(legacyResistanceOf(block) - targetValue)
			}))
			.sort((a, b) => a.diff - b.diff);

		const topBlocks = ranked.slice(0, maxBlocks);
		const extremes = ranked.slice(0, Math.min(5, ranked.length)).concat(ranked.slice(-5));
		const unique = new Map();
		topBlocks.concat(extremes).forEach((entry) => {
			unique.set(entry.block, entry);
		});
		filteredBlocks = Array.from(unique.values()).map((entry: any) => entry.block);
	}

	const combinations: any[] = [];
	let comboCount = 0;

	const singleIndices: number[] = [];
	filteredBlocks.forEach((block, index) => {
		if (!Array.isArray(block)) {
			singleIndices.push(index);
		}
	});
	const [singleStart, singleEnd] = legacyGetChunkRange(singleIndices.length, chunkIndex, chunkCount);

	const comboBlockCount = filteredBlocks.length;
	const [comboStart, comboEnd] = legacyGetChunkRange(comboBlockCount, chunkIndex, chunkCount);

	for (let idx = singleStart; idx < singleEnd; idx++) {
		if (comboCount >= maxCombos) break;
		const block = filteredBlocks[singleIndices[idx]];
		if (Array.isArray(block)) continue;
		for (let size = 2; size <= maxSeriesBlocks; size++) {
			if (comboCount >= maxCombos) break;
			const seriesBlock: any = Array.from({ length: size }, () => block);
			seriesBlock.type = 'series';
			const bounds = legacyCalculateSectionBounds(seriesBlock);
			if (shouldPruneSingles && legacyOverlapsSingle(bounds, singleBounds)) {
				prunedCombos += 1;
				continue;
			}
			combinations.push(seriesBlock);
			comboCount += 1;
		}
	}

	for (let size = 1; size <= maxSeriesBlocks; size++) {
		if (legacyEstimateComboCount(comboBlockCount, size, maxCombos) > maxCombos) {
			break;
		}
		if (comboCount >= maxCombos) break;
		for (let firstIndex = comboStart; firstIndex < comboEnd; firstIndex++) {
			if (comboCount >= maxCombos) break;
			if (size === 1) {
				combinations.push(filteredBlocks[firstIndex]);
				comboCount += 1;
				continue;
			}
			const combos: number[][] = [];
			buildIndexCombos(firstIndex, 1, size, [firstIndex], combos, comboBlockCount);
			combos.forEach((indices) => {
				if (comboCount >= maxCombos) return;
				const seriesBlock: any = indices.map((idx) => filteredBlocks[idx]);
				seriesBlock.type = 'series';
				const bounds = legacyCalculateSectionBounds(seriesBlock);
				if (shouldPruneSingles && legacyOverlapsSingle(bounds, singleBounds)) {
					prunedCombos += 1;
					return;
				}
				combinations.push(seriesBlock);
				comboCount += 1;
			});
		}
	}

	return {
		combinations,
		stats: {
			blockCount: filteredBlocks.length,
			comboCount: combinations.length,
			prunedBlocks,
			prunedCombos,
			maxParallel,
			maxSeriesBlocks,
			maxBlocks,
			maxCombos
		}
	};
}

function legacyApplyResistorHeuristic(resistors: any[], targetValue: number, limit: number) {
	if (!targetValue || resistors.length <= limit) {
		return { resistors, trimmed: false, removedCount: 0 };
	}

	const sortedByDiff = resistors
		.map((resistor) => ({ resistor, diff: Math.abs(resistor.value - targetValue) }))
		.sort((a, b) => a.diff - b.diff);

	const selection = new Map();
	sortedByDiff.slice(0, limit).forEach((entry) => {
		selection.set(entry.resistor.id, entry.resistor);
	});

	const sortedByValue = resistors.slice().sort((a, b) => a.value - b.value);
	sortedByValue.slice(0, 3).forEach((resistor) => selection.set(resistor.id, resistor));
	sortedByValue.slice(-3).forEach((resistor) => selection.set(resistor.id, resistor));

	let filtered = Array.from(selection.values());
	if (filtered.length > limit) {
		filtered = filtered
			.map((resistor: any) => ({ resistor, diff: Math.abs(resistor.value - targetValue) }))
			.sort((a, b) => a.diff - b.diff)
			.slice(0, limit)
			.map((entry) => entry.resistor);
	}

	return {
		resistors: filtered,
		trimmed: filtered.length < resistors.length,
		removedCount: resistors.length - filtered.length
	};
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const PRUNE_OPTIONS = {
	maxParallel: 3,
	maxSeriesBlocks: 3,
	maxBlocks: 50,
	maxCombos: 5000,
	maxParallelCombos: 1000000
};

describe('generateCombinations legacy parity', () => {
	const resistors = [r(500), r(1000), r(2000)];

	it('matches the legacy worker output when tolerance-overlap pruning is active', () => {
		// Target 1000 sits inside the 1k ±1% band, so pruning is enabled.
		const options = { ...PRUNE_OPTIONS, targetValue: 1000 };
		const ours = generateCombinations(resistors, options);
		const legacy = legacyGenerateCombinations(resistors, options);

		expect(ours.combinations.map(comboKey)).toEqual(legacy.combinations.map(comboKey));
		expect(ours.stats).toEqual(legacy.stats);
		expect(ours.stats.prunedCombos).toBeGreaterThan(0);
	});

	it('matches the legacy worker output per chunk when pruning is inactive', () => {
		// Target 1500 lies outside every ±1% band, so nothing is pruned.
		for (const chunkIndex of [0, 1]) {
			const options = { ...PRUNE_OPTIONS, targetValue: 1500, chunkIndex, chunkCount: 2 };
			const ours = generateCombinations(resistors, options);
			const legacy = legacyGenerateCombinations(resistors, options);
			expect(ours.combinations.map(comboKey)).toEqual(legacy.combinations.map(comboKey));
			expect(ours.stats).toEqual(legacy.stats);
		}
	});
});

describe('tolerance-overlap pruning semantics', () => {
	const resistors = [r(500), r(1000), r(2000)];

	it('prunes series combos whose band overlaps a single resistor band when the target is inside one', () => {
		const { combinations, stats } = generateCombinations(resistors, {
			...PRUNE_OPTIONS,
			targetValue: 1000
		});
		const keys = combinations.map(comboKey);
		// 500 + 500 spans [990, 1010], overlapping the single 1k ±1% band.
		expect(keys).not.toContain('series[500,500]');
		expect(stats.prunedCombos).toBeGreaterThan(0);
	});

	it('does not prune when the target lies outside every single resistor band', () => {
		const { combinations, stats } = generateCombinations(resistors, {
			...PRUNE_OPTIONS,
			targetValue: 1500
		});
		expect(combinations.map(comboKey)).toContain('series[500,500]');
		expect(stats.prunedBlocks).toBe(0);
		expect(stats.prunedCombos).toBe(0);
	});

	it('prunes parallel blocks whose band overlaps a single resistor band', () => {
		// 1k || 1k = 500 with a band overlapping the single 500R ±1% band.
		const withDupes = [r(500, 1, 'a'), r(1000, 1, 'b'), r(1000, 1, 'c')];
		const { combinations, stats } = generateCombinations(withDupes, {
			...PRUNE_OPTIONS,
			targetValue: 500
		});
		expect(stats.prunedBlocks).toBeGreaterThan(0);
		expect(combinations.map(comboKey)).not.toContain('parallel[1000,1000]');
	});
});

describe('applyResistorHeuristic', () => {
	it('returns the input untouched when under the cap', () => {
		const resistors = [r(100), r(200), r(300)];
		const result = applyResistorHeuristic(resistors, 250, 60);
		expect(result.resistors).toBe(resistors);
		expect(result.trimmed).toBe(false);
		expect(result.removedCount).toBe(0);
	});

	it('keeps the 3 smallest / 3 largest extremes in the pool and re-trims to cap exactly like legacy', () => {
		const resistors = Array.from({ length: 70 }, (_, i) => r((i + 1) * 10, 1, i));
		const target = 350;
		const limit = 60;
		const ours = applyResistorHeuristic(resistors, target, limit);
		const legacy = legacyApplyResistorHeuristic(resistors, target, limit);

		expect(ours.resistors.map((x) => x.id)).toEqual(legacy.resistors.map((x: ComboResistor) => x.id));
		expect(ours.trimmed).toBe(true);
		expect(ours.removedCount).toBe(legacy.removedCount);
		expect(ours.resistors).toHaveLength(limit);
	});

	it('retains extremes that already sit within the closest-to-target cap', () => {
		const resistors = Array.from({ length: 65 }, (_, i) => r((i + 1) * 10, 1, i));
		const ours = applyResistorHeuristic(resistors, 330, 60);
		const legacy = legacyApplyResistorHeuristic(resistors, 330, 60);
		expect(ours.resistors.map((x) => x.id)).toEqual(legacy.resistors.map((x: ComboResistor) => x.id));
	});
});

describe('getEffectiveLimits', () => {
	it('scales only maxParallel using the legacy tiers', () => {
		expect(getEffectiveLimits(10)).toEqual({ ...LIMITS });
		expect(getEffectiveLimits(20).maxParallel).toBe(10);
		expect(getEffectiveLimits(21).maxParallel).toBe(7);
		expect(getEffectiveLimits(30).maxParallel).toBe(7);
		expect(getEffectiveLimits(31).maxParallel).toBe(6);
		expect(getEffectiveLimits(41).maxParallel).toBe(5);
		expect(getEffectiveLimits(56).maxParallel).toBe(4);
		expect(getEffectiveLimits(71)).toEqual({ ...LIMITS, maxParallel: 3 });
	});

	it('keeps the legacy guard limits', () => {
		expect(LIMITS.maxParallelCombos).toBe(1000000);
		expect(LIMITS.maxCombos).toBe(200000);
		expect(LIMITS.maxBlocks).toBe(2048);
		expect(LIMITS.maxInputResistors).toBe(60);
	});
});

describe('progress reporting', () => {
	it('reports monotonic progress and finishes with processed === total', () => {
		const calls: Array<[number, number]> = [];
		generateCombinations([r(100), r(220), r(470), r(1000)], {
			...PRUNE_OPTIONS,
			targetValue: 1500,
			onProgress: (processed, total) => calls.push([processed, total])
		});
		expect(calls.length).toBeGreaterThan(0);
		const total = calls[0][1];
		expect(calls.every(([, t]) => t === total)).toBe(true);
		for (let i = 1; i < calls.length; i++) {
			expect(calls[i][0]).toBeGreaterThanOrEqual(calls[i - 1][0]);
		}
		expect(calls[calls.length - 1][0]).toBe(total);
	});
});

describe('chunked generation', () => {
	it('the union of chunk outputs equals the single-chunk output', () => {
		const resistors = [r(100), r(220), r(470), r(1000)];
		const options = { ...PRUNE_OPTIONS, targetValue: 1500 };
		const whole = generateCombinations(resistors, options).combinations.map(comboKey).sort();
		const merged = [0, 1, 2]
			.flatMap(
				(chunkIndex) =>
					generateCombinations(resistors, { ...options, chunkIndex, chunkCount: 3 }).combinations
			)
			.map(comboKey)
			.sort();
		expect(merged).toEqual(whole);
	});
});

describe('result helpers', () => {
	it('formatCombination orders singles before parallel blocks and formats like legacy', () => {
		const combo = series(parallel(r(2000), r(4000)), r(1000));
		expect(formatCombination(combo, (v) => String(v))).toBe('1000 + (2000 || 4000)');
	});

	it('wrapText wraps on " + " separators at the max length', () => {
		const text = '1000 + 2000 + 3000 + 4000 + 5000 + 6000';
		const lines = wrapText(text, 20);
		expect(lines.length).toBeGreaterThan(1);
		expect(lines.join(' + ')).toBe(text);
		lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(20));
	});

	it('dedupeResults collapses combinations that differ only by ordering', () => {
		const a = series(r(1000), r(2000));
		const b = series(r(2000), r(1000));
		const results = buildResults([a, b], 3000);
		expect(dedupeResults(results)).toHaveLength(1);
	});

	it('sortResults sorts by component count with abs-error tiebreak', () => {
		const results = buildResults(
			[series(r(1000), r(2000)), r(2900), series(r(1000), r(1000), r(1000))],
			3000
		);
		const sorted = sortResults([...results], 'components');
		expect(sorted.map((x) => x.componentCount)).toEqual([1, 2, 3]);
	});

	it('applyErrorFilter falls back to unfiltered results when nothing is within range', () => {
		const results = buildResults([r(10000)], 100);
		const filtered = applyErrorFilter(results, 20);
		expect(filtered.fallbackUsed).toBe(true);
		expect(filtered.results).toHaveLength(1);

		const near = buildResults([r(105), r(10000)], 100);
		const nearFiltered = applyErrorFilter(near, 20);
		expect(nearFiltered.fallbackUsed).toBe(false);
		expect(nearFiltered.results).toHaveLength(1);
	});

	it('filterResultsByExcludedKeys drops any result that uses an excluded resistor', () => {
		const results = buildResults([series(r(1000), r(2000)), r(3000)], 3000);
		expect(filterResultsByExcludedKeys(results, [])).toHaveLength(2);
		const filtered = filterResultsByExcludedKeys(results, ['k-2000']);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].totalResistance).toBe(3000);
	});
});
