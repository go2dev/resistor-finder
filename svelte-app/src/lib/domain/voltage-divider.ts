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
};

export type DividerComputeInput = {
	resistors: ParsedResistor[];
	supplyVoltage: number;
	targetVoltage: number;
	allowOvershoot: boolean;
	sortBy: SortBy;
	maxResults?: number;
};

const MAX_INPUT_RESISTORS = 30;

export function sanitizeInputResistors(input: ParsedResistor[]): {
	resistors: ParsedResistor[];
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

function sortResults(results: DividerResult[], sortBy: SortBy): DividerResult[] {
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
	sorted.sort((a, b) => Math.abs(a.error) - Math.abs(b.error));
	return sorted;
}

export function computeDividerResults(input: DividerComputeInput): {
	results: DividerResult[];
	networksTested: number;
	networkCount: number;
} {
	const networks = generateNetworks(input.resistors);
	const results: DividerResult[] = [];
	const maxResults = input.maxResults ?? 10;

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

	const sorted = sortResults(results, input.sortBy).slice(0, maxResults);
	return {
		results: sorted,
		networksTested: networks.length * networks.length,
		networkCount: networks.length
	};
}

