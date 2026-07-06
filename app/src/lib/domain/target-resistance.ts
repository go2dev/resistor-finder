/**
 * Target-resistance search engine ported from the legacy implementation
 * (repo-root `target-resistance.js` + `target-resistance-worker.js`).
 *
 * All logic lives inside `createTargetResistanceEngine` so the whole engine can
 * be embedded verbatim into the route's inline Blob worker via
 * `createTargetResistanceEngine.toString()`. The factory must therefore stay
 * fully self-contained: no imports, no references to module-level identifiers.
 *
 * Behaviour notes vs legacy:
 * - `generateCombinations` is the legacy worker variant (chunk-aware, with
 *   optional progress reporting). Running it with chunkIndex 0 / chunkCount 1
 *   enumerates the same combinations as the legacy main-thread variant.
 * - `calculateResistorBounds` expects `tolerance` to already be resolved to a
 *   percentage number (legacy resolved missing tolerances from the E-series via
 *   ResistorUtils at this point; the route resolves it before calling in).
 */

export type TargetSortBy = 'error' | 'components' | 'totalResistanceAsc' | 'totalResistanceDesc';

export type ComboResistor = {
	id?: number | string;
	key?: string;
	value: number;
	tolerance?: number | null;
	series?: string | null;
	powerRating?: number | null;
	powerCode?: string | null;
};

export interface ComboSection extends Array<ComboNode> {
	type?: 'series' | 'parallel';
}

export type ComboNode = ComboResistor | ComboSection;

export type Bounds = { lower: number; upper: number };

export type TargetLimits = {
	maxParallel: number;
	maxSeriesBlocks: number;
	maxBlocks: number;
	maxCombos: number;
	maxParallelCombos: number;
	maxInputResistors: number;
};

export type GenerateCombinationsOptions = {
	maxParallel?: number;
	maxSeriesBlocks?: number;
	maxBlocks?: number;
	maxCombos?: number;
	maxParallelCombos?: number;
	targetValue?: number | null;
	chunkIndex?: number;
	chunkCount?: number;
	onProgress?: (processed: number, total: number) => void;
};

export type GenerateCombinationsStats = {
	blockCount: number;
	comboCount: number;
	prunedBlocks: number;
	prunedCombos: number;
	maxParallel: number;
	maxSeriesBlocks: number;
	maxBlocks: number;
	maxCombos: number;
};

export type EvaluatedCombo = {
	combo: ComboNode;
	totalResistance: number;
	error: number;
	errorPercent: number;
	componentCount: number;
};

export type HeuristicResult = {
	resistors: ComboResistor[];
	trimmed: boolean;
	removedCount: number;
};

export function createTargetResistanceEngine() {
	// Mirrors legacy target-resistance.js LIMITS.
	const LIMITS: TargetLimits = {
		maxParallel: 10,
		maxSeriesBlocks: 10,
		maxBlocks: 2048,
		maxCombos: 200000,
		maxParallelCombos: 1000000,
		maxInputResistors: 60
	};

	function getSectionType(section: ComboNode): string {
		if (!Array.isArray(section)) return 'resistor';
		return section.type || 'series';
	}

	function resistanceOf(section: ComboNode): number {
		if (!Array.isArray(section)) {
			return section.value;
		}
		const type = section.type || 'series';
		if (type === 'parallel') {
			const reciprocal = section.reduce((sum, item) => sum + 1 / resistanceOf(item), 0);
			return 1 / reciprocal;
		}
		return section.reduce((sum, item) => sum + resistanceOf(item), 0);
	}

	function countComponents(section: ComboNode): number {
		if (!Array.isArray(section)) return 1;
		return section.reduce((sum, item) => sum + countComponents(item), 0);
	}

	function getSectionSortValue(section: ComboNode): number {
		const value = resistanceOf(section);
		return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
	}

	function orderCombination(section: ComboNode): ComboNode {
		if (!Array.isArray(section)) return section;
		const type = section.type || 'series';
		const orderedChildren = section.map((child) => orderCombination(child));
		const sorted = orderedChildren.slice().sort((a, b) => {
			const aType = getSectionType(a);
			const bType = getSectionType(b);
			const aPriority = aType === 'parallel' ? 1 : 0;
			const bPriority = bType === 'parallel' ? 1 : 0;
			if (aPriority !== bPriority) return aPriority - bPriority;
			return getSectionSortValue(a) - getSectionSortValue(b);
		}) as ComboSection;
		sorted.type = type as 'series' | 'parallel';
		return sorted;
	}

	function formatCombination(combo: ComboNode, formatValue: (value: number) => string): string {
		const formatSection = (section: ComboNode): string => {
			if (!Array.isArray(section)) {
				return formatValue(section.value);
			}
			const type = section.type || 'series';
			const values = section.map((item) => formatSection(item));
			const joined = values.join(type === 'parallel' ? ' || ' : ' + ');
			return type === 'parallel' ? `(${joined})` : joined;
		};
		return formatSection(orderCombination(combo));
	}

	function wrapText(text: string, maxLength = 32): string[] {
		if (text.length <= maxLength) return [text];
		const parts = text.split(' + ');
		const lines: string[] = [];
		let current = '';
		parts.forEach((part) => {
			const next = current ? `${current} + ${part}` : part;
			if (next.length > maxLength && current) {
				lines.push(current);
				current = part;
			} else {
				current = next;
			}
		});
		if (current) lines.push(current);
		return lines;
	}

	function estimateComboCount(valueCount: number, comboSize: number, cap = Number.MAX_SAFE_INTEGER): number {
		if (comboSize <= 1) return valueCount;
		let total = 1;
		for (let i = 1; i <= comboSize; i++) {
			total = (total * (valueCount + i - 1)) / i;
			if (total > cap) return cap + 1;
		}
		return total;
	}

	function getResistorSignature(resistor: ComboResistor | null | undefined): string {
		if (resistor == null) return 'R:';
		const value = resistor.value;
		const tolerance = resistor.tolerance ?? '';
		const series = resistor.series ?? '';
		const powerRating = resistor.powerRating ?? '';
		const powerCode = resistor.powerCode ?? '';
		return `R:${value}|${tolerance}|${series}|${powerRating}|${powerCode}`;
	}

	function collectFlattenedChildren(section: ComboSection, type: string, bucket: ComboNode[]): void {
		section.forEach((child) => {
			if (Array.isArray(child) && (child.type || 'series') === type) {
				collectFlattenedChildren(child, type, bucket);
			} else {
				bucket.push(child);
			}
		});
	}

	function getComboSignature(section: ComboNode): string {
		if (!Array.isArray(section)) {
			return getResistorSignature(section);
		}
		const type = section.type || 'series';
		const flattened: ComboNode[] = [];
		collectFlattenedChildren(section, type, flattened);
		const signatures = flattened.map(getComboSignature).sort();
		return `${type}(${signatures.join(',')})`;
	}

	function dedupeResults<T extends { combo: ComboNode }>(results: T[]): T[] {
		const seen = new Set<string>();
		const deduped: T[] = [];
		results.forEach((result) => {
			const signature = getComboSignature(result.combo);
			if (seen.has(signature)) return;
			seen.add(signature);
			deduped.push(result);
		});
		return deduped;
	}

	function calculateResistorBounds(resistor: ComboResistor): Bounds {
		const tolerance = resistor.tolerance ?? 0;
		const multiplier = tolerance / 100;
		return {
			lower: resistor.value * (1 - multiplier),
			upper: resistor.value * (1 + multiplier)
		};
	}

	function calculateSectionBounds(section: ComboNode): Bounds {
		if (!Array.isArray(section)) {
			return calculateResistorBounds(section);
		}

		const type = section.type || 'series';
		const bounds = section.map((child) => calculateSectionBounds(child));
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

	function buildSingleBounds(resistors: ComboResistor[]): Bounds[] {
		return resistors.map((resistor) => ({
			lower: calculateResistorBounds(resistor).lower,
			upper: calculateResistorBounds(resistor).upper
		}));
	}

	function overlapsSingle(bounds: Bounds, singleBounds: Bounds[]): boolean {
		return singleBounds.some((single) => bounds.lower <= single.upper && bounds.upper >= single.lower);
	}

	function applyErrorFilter<T extends EvaluatedCombo>(
		results: T[],
		maxPercent: number
	): { results: T[]; fallbackUsed: boolean } {
		const within = results.filter(
			(result) => Number.isFinite(result.errorPercent) && Math.abs(result.errorPercent) <= maxPercent
		);
		if (within.length > 0) {
			return { results: within, fallbackUsed: false };
		}
		return { results, fallbackUsed: true };
	}

	function getSafeResistanceRange(section: ComboNode): Bounds | null {
		const range = calculateSectionBounds(section);
		if (!Number.isFinite(range.lower) || !Number.isFinite(range.upper)) {
			const total = resistanceOf(section);
			if (Number.isFinite(total)) {
				return { lower: total, upper: total };
			}
			return null;
		}
		return range;
	}

	function sortResults<T extends EvaluatedCombo>(results: T[], sortBy: string): T[] {
		return results.sort((a, b) => {
			if (sortBy === 'components') {
				if (a.componentCount !== b.componentCount) {
					return a.componentCount - b.componentCount;
				}
				return Math.abs(a.error) - Math.abs(b.error);
			}
			if (sortBy === 'totalResistanceAsc') {
				return a.totalResistance - b.totalResistance;
			}
			if (sortBy === 'totalResistanceDesc') {
				return b.totalResistance - a.totalResistance;
			}
			return Math.abs(a.error) - Math.abs(b.error);
		});
	}

	function applyResistorHeuristic(
		resistors: ComboResistor[],
		targetValue: number | null | undefined,
		limit: number
	): HeuristicResult {
		if (!targetValue || resistors.length <= limit) {
			return {
				resistors,
				trimmed: false,
				removedCount: 0
			};
		}

		const sortedByDiff = resistors
			.map((resistor) => ({
				resistor,
				diff: Math.abs(resistor.value - targetValue)
			}))
			.sort((a, b) => a.diff - b.diff);

		const selection = new Map<unknown, ComboResistor>();
		sortedByDiff.slice(0, limit).forEach((entry) => {
			selection.set(entry.resistor.id, entry.resistor);
		});

		const sortedByValue = resistors.slice().sort((a, b) => a.value - b.value);
		sortedByValue.slice(0, 3).forEach((resistor) => selection.set(resistor.id, resistor));
		sortedByValue.slice(-3).forEach((resistor) => selection.set(resistor.id, resistor));

		let filtered = Array.from(selection.values());
		if (filtered.length > limit) {
			filtered = filtered
				.map((resistor) => ({
					resistor,
					diff: Math.abs(resistor.value - targetValue)
				}))
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

	function getEffectiveLimits(resistorCount: number): TargetLimits {
		let maxParallel = LIMITS.maxParallel;
		if (resistorCount > 20) maxParallel = Math.min(maxParallel, 7);
		if (resistorCount > 30) maxParallel = Math.min(maxParallel, 6);
		if (resistorCount > 40) maxParallel = Math.min(maxParallel, 5);
		if (resistorCount > 55) maxParallel = Math.min(maxParallel, 4);
		if (resistorCount > 70) maxParallel = Math.min(maxParallel, 3);
		return {
			...LIMITS,
			maxParallel
		};
	}

	function getChunkRange(total: number, chunkIndex: number, chunkCount: number): [number, number] {
		if (chunkCount <= 1 || total <= 0) return [0, total];
		const size = Math.ceil(total / chunkCount);
		const start = chunkIndex * size;
		const end = Math.min(start + size, total);
		return [start, end];
	}

	function generateCombinations(
		resistors: ComboResistor[],
		options: GenerateCombinationsOptions = {}
	): { combinations: ComboNode[]; stats: GenerateCombinationsStats } {
		const maxParallel = options.maxParallel ?? 5;
		const maxSeriesBlocks = options.maxSeriesBlocks ?? 5;
		const maxBlocks = options.maxBlocks ?? 250;
		const maxCombos = options.maxCombos ?? 20000;
		const maxParallelCombos = options.maxParallelCombos ?? 1000000;
		const targetValue = options.targetValue ?? null;
		const chunkIndex = options.chunkIndex ?? 0;
		const chunkCount = options.chunkCount ?? 1;
		const onProgress = options.onProgress;
		const blocks: ComboNode[] = [];
		const singleBounds = buildSingleBounds(resistors);
		const shouldPruneSingles =
			Number.isFinite(targetValue) &&
			singleBounds.some((single) => (targetValue as number) >= single.lower && (targetValue as number) <= single.upper);
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

		// Single resistors
		resistors.forEach((resistor) => blocks.push(resistor));

		// Parallel blocks up to maxParallel
		for (let size = 2; size <= maxParallel; size++) {
			if (estimateComboCount(resistors.length, size, maxParallelCombos) > maxParallelCombos) {
				break;
			}
			const combos: number[][] = [];
			buildIndexCombos(0, 0, size, [], combos);
			combos.forEach((indices) => {
				const parallel = indices.map((idx) => resistors[idx]) as ComboSection;
				parallel.type = 'parallel';
				const bounds = calculateSectionBounds(parallel);
				if (shouldPruneSingles && overlapsSingle(bounds, singleBounds)) {
					prunedBlocks += 1;
					return;
				}
				blocks.push(parallel);
			});
		}

		let filteredBlocks = blocks;
		if (targetValue) {
			const ranked = blocks
				.map((block) => ({
					block,
					diff: Math.abs(resistanceOf(block) - targetValue)
				}))
				.sort((a, b) => a.diff - b.diff);

			const topBlocks = ranked.slice(0, maxBlocks);
			const extremes = ranked.slice(0, Math.min(5, ranked.length)).concat(ranked.slice(-5));
			const unique = new Map<ComboNode, { block: ComboNode; diff: number }>();
			topBlocks.concat(extremes).forEach((entry) => {
				unique.set(entry.block, entry);
			});
			filteredBlocks = Array.from(unique.values()).map((entry) => entry.block);
		}

		const combinations: ComboNode[] = [];
		let comboCount = 0;

		const singleIndices: number[] = [];
		filteredBlocks.forEach((block, index) => {
			if (!Array.isArray(block)) {
				singleIndices.push(index);
			}
		});
		const [singleStart, singleEnd] = getChunkRange(singleIndices.length, chunkIndex, chunkCount);

		const comboBlockCount = filteredBlocks.length;
		const [comboStart, comboEnd] = getChunkRange(comboBlockCount, chunkIndex, chunkCount);
		const singleWorkTotal = Math.max(0, singleEnd - singleStart);
		const comboWorkTotal = Math.max(0, comboEnd - comboStart) * maxSeriesBlocks;
		const progressTotal = singleWorkTotal + comboWorkTotal;
		const progressEvery = Math.max(1, Math.floor(progressTotal / 100));
		let progressProcessed = 0;
		let lastReported = 0;
		let lastReportedTime = 0;
		const reportProgress = (force = false) => {
			if (!onProgress || !progressTotal) return;
			const now = Date.now();
			const shouldReport =
				force ||
				progressProcessed - lastReported >= progressEvery ||
				(progressProcessed > 0 && now - lastReportedTime >= 250);
			if (!shouldReport) return;
			lastReported = progressProcessed;
			lastReportedTime = now;
			const processedValue = force ? progressTotal : progressProcessed;
			onProgress(processedValue, progressTotal);
		};

		for (let idx = singleStart; idx < singleEnd; idx++) {
			if (comboCount >= maxCombos) break;
			const block = filteredBlocks[singleIndices[idx]];
			if (Array.isArray(block)) continue;
			for (let size = 2; size <= maxSeriesBlocks; size++) {
				if (comboCount >= maxCombos) break;
				const series = Array.from({ length: size }, () => block) as ComboSection;
				series.type = 'series';
				const bounds = calculateSectionBounds(series);
				if (shouldPruneSingles && overlapsSingle(bounds, singleBounds)) {
					prunedCombos += 1;
					continue;
				}
				combinations.push(series);
				comboCount += 1;
			}
			progressProcessed += 1;
			reportProgress();
		}

		for (let size = 1; size <= maxSeriesBlocks; size++) {
			if (estimateComboCount(comboBlockCount, size, maxCombos) > maxCombos) {
				break;
			}
			if (comboCount >= maxCombos) break;
			for (let firstIndex = comboStart; firstIndex < comboEnd; firstIndex++) {
				if (comboCount >= maxCombos) break;
				progressProcessed += 1;
				reportProgress();
				if (size === 1) {
					combinations.push(filteredBlocks[firstIndex]);
					comboCount += 1;
					continue;
				}
				const combos: number[][] = [];
				buildIndexCombos(firstIndex, 1, size, [firstIndex], combos, comboBlockCount);
				combos.forEach((indices) => {
					if (comboCount >= maxCombos) return;
					const series = indices.map((idx) => filteredBlocks[idx]) as ComboSection;
					series.type = 'series';
					const bounds = calculateSectionBounds(series);
					if (shouldPruneSingles && overlapsSingle(bounds, singleBounds)) {
						prunedCombos += 1;
						return;
					}
					combinations.push(series);
					comboCount += 1;
				});
			}
		}
		reportProgress(true);

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

	function buildResults(combinations: ComboNode[], targetValue: number): EvaluatedCombo[] {
		return combinations.map((combo) => {
			const totalResistance = resistanceOf(combo);
			const errorPercent = ((totalResistance - targetValue) / targetValue) * 100;
			return {
				combo,
				totalResistance,
				error: totalResistance - targetValue,
				errorPercent,
				componentCount: countComponents(combo)
			};
		});
	}

	function resultUsesResistorKey(section: ComboNode | null | undefined, resistorKey: string): boolean {
		if (!section) return false;
		if (!Array.isArray(section)) {
			return (section.key ?? section.id ?? null) === resistorKey;
		}
		return section.some((item) => resultUsesResistorKey(item, resistorKey));
	}

	function filterResultsByExcludedKeys<T extends { combo: ComboNode }>(results: T[], excludedKeys: string[]): T[] {
		if (excludedKeys.length === 0) return results;
		return results.filter((result) => !excludedKeys.some((key) => resultUsesResistorKey(result.combo, key)));
	}

	return {
		LIMITS,
		getSectionType,
		resistanceOf,
		countComponents,
		orderCombination,
		formatCombination,
		wrapText,
		estimateComboCount,
		getComboSignature,
		dedupeResults,
		calculateResistorBounds,
		calculateSectionBounds,
		buildSingleBounds,
		overlapsSingle,
		applyErrorFilter,
		getSafeResistanceRange,
		sortResults,
		applyResistorHeuristic,
		getEffectiveLimits,
		getChunkRange,
		generateCombinations,
		buildResults,
		resultUsesResistorKey,
		filterResultsByExcludedKeys
	};
}

const engine = createTargetResistanceEngine();

export const LIMITS = engine.LIMITS;
export const {
	getSectionType,
	resistanceOf,
	countComponents,
	orderCombination,
	formatCombination,
	wrapText,
	estimateComboCount,
	getComboSignature,
	dedupeResults,
	calculateResistorBounds,
	calculateSectionBounds,
	buildSingleBounds,
	overlapsSingle,
	applyErrorFilter,
	getSafeResistanceRange,
	sortResults,
	applyResistorHeuristic,
	getEffectiveLimits,
	getChunkRange,
	generateCombinations,
	buildResults,
	resultUsesResistorKey,
	filterResultsByExcludedKeys
} = engine;
