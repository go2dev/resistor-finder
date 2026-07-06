import type { ParsedResistor } from './resistor';
import { formatResistorValue } from './resistor';

type NetworkKind = 'single' | 'series' | 'parallel';

export type Network = {
	kind: NetworkKind;
	parts: number[];
	total: number;
	label: string;
	componentCount: number;
};

export type SortBy = 'error' | 'components' | 'totalResistanceAsc' | 'totalResistanceDesc';

export type DividerResult = {
	top: Network;
	bottom: Network;
	outputVoltage: number;
	error: number;
	totalResistance: number;
	componentCount: number;
	/** Present when computed via legacy worker (E-series tolerances) */
	voltageRange?: { min: number; max: number };
	/** Worker combo trees for power dissipation / rated-power warnings */
	legacySections?: { r1: unknown; r2: unknown };
};

export type DividerComputeInput = {
	resistors: ParsedResistor[];
	supplyVoltage: number;
	targetVoltage: number;
	allowOvershoot: boolean;
	sortBy: SortBy;
};

const MAX_INPUT_RESISTORS = 30;

export function sanitizeInputResistors<T extends ParsedResistor>(input: T[]): {
	resistors: T[];
	warnings: string[];
} {
	if (input.length <= MAX_INPUT_RESISTORS) {
		return { resistors: input, warnings: [] };
	}
	return {
		resistors: input.slice(0, MAX_INPUT_RESISTORS),
		warnings: [
			`Input limited to first ${MAX_INPUT_RESISTORS} unique values to keep calculation responsive.`
		]
	};
}

export function generateNetworks(resistors: ParsedResistor[]): Network[] {
	const values = resistors.map((r) => r.value);
	const networks: Network[] = [];

	for (const value of values) {
		networks.push({
			kind: 'single',
			parts: [value],
			total: value,
			label: formatResistorValue(value),
			componentCount: 1
		});
	}

	for (let i = 0; i < values.length; i += 1) {
		for (let j = i; j < values.length; j += 1) {
			const a = values[i];
			const b = values[j];
			networks.push({
				kind: 'series',
				parts: [a, b],
				total: a + b,
				label: `${formatResistorValue(a)} + ${formatResistorValue(b)}`,
				componentCount: 2
			});
			networks.push({
				kind: 'parallel',
				parts: [a, b],
				total: (a * b) / (a + b),
				label: `${formatResistorValue(a)} || ${formatResistorValue(b)}`,
				componentCount: 2
			});
		}
	}

	return networks;
}

/**
 * Nominal-error differences below this fraction of the supply voltage are
 * physically meaningless (smaller than the Vout shift of even 0.1%-tolerance
 * parts), so the error sort treats them as ties.
 */
export const DIVIDER_ERROR_BUCKET_FRACTION = 0.001;

/**
 * Collapse divider results that realise the exact same ratio, keeping the
 * network with the fewest components (then the lowest total resistance).
 * Same preference as the raw worker-result dedupe in worker-divider-result.ts.
 */
export function dedupeDividerResults(results: DividerResult[]): DividerResult[] {
	const byRatio = new Map<string, DividerResult>();
	for (const r of results) {
		const denominator = r.top.total + r.bottom.total;
		if (!Number.isFinite(denominator) || denominator <= 0) continue;
		const key = (r.bottom.total / denominator).toFixed(10);
		const prev = byRatio.get(key);
		if (
			!prev ||
			r.componentCount < prev.componentCount ||
			(r.componentCount === prev.componentCount && r.totalResistance < prev.totalResistance)
		) {
			byRatio.set(key, r);
		}
	}
	return [...byRatio.values()];
}

/**
 * In 'error' mode, |error| is quantized into buckets of
 * DIVIDER_ERROR_BUCKET_FRACTION * supplyVoltage; within a bucket, fewer
 * components win, then exact |error|, then total resistance — so a plain
 * two-resistor answer is not buried under 3-4 part networks whose nominal
 * advantage is smaller than any real-world tolerance.
 */
export function sortDividerResults(
	results: DividerResult[],
	sortBy: SortBy,
	opts: { supplyVoltage?: number } = {}
): DividerResult[] {
	const sorted = [...results];
	if (sortBy === 'components') {
		sorted.sort((a, b) => {
			if (a.componentCount !== b.componentCount) return a.componentCount - b.componentCount;
			return Math.abs(a.error) - Math.abs(b.error);
		});
		return sorted;
	}
	if (sortBy === 'totalResistanceAsc') {
		sorted.sort((a, b) => a.totalResistance - b.totalResistance);
		return sorted;
	}
	if (sortBy === 'totalResistanceDesc') {
		sorted.sort((a, b) => b.totalResistance - a.totalResistance);
		return sorted;
	}
	const eps =
		Math.abs(opts.supplyVoltage ?? 0) * DIVIDER_ERROR_BUCKET_FRACTION || Number.EPSILON;
	sorted.sort((a, b) => {
		const bucketA = Math.floor(Math.abs(a.error) / eps);
		const bucketB = Math.floor(Math.abs(b.error) / eps);
		if (bucketA !== bucketB) return bucketA - bucketB;
		if (a.componentCount !== b.componentCount) return a.componentCount - b.componentCount;
		const errDiff = Math.abs(a.error) - Math.abs(b.error);
		if (errDiff !== 0) return errDiff;
		return a.totalResistance - b.totalResistance;
	});
	return sorted;
}

export function filterSortLimitDividerResults(
	results: DividerResult[],
	opts: { minR: number; maxR: number; sortBy: SortBy; limit: number; supplyVoltage?: number }
): DividerResult[] {
	const filtered = results.filter(
		(r) => r.totalResistance >= opts.minR && r.totalResistance <= opts.maxR
	);
	const deduped = dedupeDividerResults(filtered);
	const sorted = sortDividerResults(deduped, opts.sortBy, { supplyVoltage: opts.supplyVoltage });
	return sorted.slice(0, opts.limit);
}

/** Exhaustive main-thread search (no tolerance voltage range). Used when Workers are unavailable. */
export function computeDividerResults(input: DividerComputeInput): {
	results: DividerResult[];
	networksTested: number;
	networkCount: number;
} {
	const networks = generateNetworks(input.resistors);
	const results: DividerResult[] = [];

	for (const top of networks) {
		for (const bottom of networks) {
			const denominator = top.total + bottom.total;
			if (!Number.isFinite(denominator) || denominator <= 0) continue;
			const outputVoltage = (bottom.total / denominator) * input.supplyVoltage;
			const error = outputVoltage - input.targetVoltage;
			if (!input.allowOvershoot && error > 0) continue;
			results.push({
				top,
				bottom,
				outputVoltage,
				error,
				totalResistance: top.total + bottom.total,
				componentCount: top.componentCount + bottom.componentCount
			});
		}
	}

	const sorted = sortDividerResults(results, input.sortBy);
	return {
		results: sorted,
		networksTested: networks.length * networks.length,
		networkCount: networks.length
	};
}

