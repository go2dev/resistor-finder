import { formatResistorValue } from '$lib/domain/resistor';
import seriesData from '$lib/domain/resistor-series-data.json';
import type { DividerResult, Network } from '$lib/domain/voltage-divider';

type WireR = {
	value: number;
	powerRating?: number | null;
	formatted?: string;
	tolerance?: number | null;
	series?: string | null;
};

type ComboFlat = [WireR, WireR] & { type: 'series' | 'parallel' };

type Section = WireR | ComboFlat;

const packagePowerRatings = [
	{ imperial: '01005', metric: '0402', rating: 0.031 },
	{ imperial: '0201', metric: '0603', rating: 0.05 },
	{ imperial: '0402', metric: '1005', rating: 0.062 },
	{ imperial: '0603', metric: '1608', rating: 0.1 },
	{ imperial: '0805', metric: '2012', rating: 0.125 },
	{ imperial: '1206', metric: '3216', rating: 0.25 },
	{ imperial: '1210', metric: '3225', rating: 0.33 },
	{ imperial: '2010', metric: '5025', rating: 0.5 },
	{ imperial: '1812', metric: '4532', rating: 0.75 },
	{ imperial: '2512', metric: '6332', rating: 1 }
];

export function formatWatts(value: number): string {
	if (value < 1) {
		return `${(value * 1000).toFixed(1)}mW`;
	}
	return `${value.toFixed(2)}W`;
}

export function getPackageRecommendation(power: number): {
	imperial: string;
	metric: string;
	rating: number;
} {
	const match = packagePowerRatings.find((entry) => power <= entry.rating);
	return match || packagePowerRatings[packagePowerRatings.length - 1];
}

function totalResistance(section: Section): number {
	if (!Array.isArray(section)) {
		return section.value;
	}
	const [a, b] = section;
	const av = a.value;
	const bv = b.value;
	const type = section.type || 'series';
	if (type === 'parallel') {
		return (av * bv) / (av + bv);
	}
	return av + bv;
}

function getParallelLegPowerStats(leg: Section, voltageAcrossLeg: number) {
	if (!Array.isArray(leg)) {
		const value = leg.value;
		const power = (voltageAcrossLeg * voltageAcrossLeg) / value;
		return {
			total: power,
			components: [{ resistor: leg, power }],
			maxComponentPower: power
		};
	}

	const type = leg.type || 'series';
	if (type === 'parallel') {
		return getSectionPowerStats(leg, null as unknown as number, voltageAcrossLeg);
	}

	const rTotal = totalResistance(leg);
	const legCurrent = voltageAcrossLeg / rTotal;
	return getSectionPowerStats(leg, legCurrent, voltageAcrossLeg);
}

function getSectionPowerStats(section: Section, seriesCurrent: number | null, voltageDrop: number) {
	if (!Array.isArray(section)) {
		const value = section.value;
		const sc = seriesCurrent ?? 0;
		const power = sc * sc * value;
		return {
			total: power,
			components: [{ resistor: section, power }],
			maxComponentPower: power
		};
	}

	const type = section.type || 'series';
	if (type === 'parallel') {
		let components: { resistor: WireR; power: number }[] = [];
		let totalPower = 0;
		let maxComponentPower = 0;
		const pair = section as ComboFlat;
		for (const leg of [pair[0], pair[1]]) {
			const legStats = getParallelLegPowerStats(leg, voltageDrop);
			components = components.concat(legStats.components);
			totalPower += legStats.total;
			maxComponentPower = Math.max(maxComponentPower, legStats.maxComponentPower);
		}
		return { total: totalPower, components, maxComponentPower };
	}

	let components: { resistor: WireR; power: number }[] = [];
	let totalPower = 0;
	let maxComponentPower = 0;
	const sc = seriesCurrent ?? 0;
	const serPair = section as ComboFlat;
	for (const child of [serPair[0], serPair[1]]) {
		const rEq = totalResistance(child);
		const vChild = sc * rEq;
		const childStats = getSectionPowerStats(child, sc, vChild);
		components = components.concat(childStats.components);
		totalPower += childStats.total;
		maxComponentPower = Math.max(maxComponentPower, childStats.maxComponentPower);
	}
	return { total: totalPower, components, maxComponentPower };
}

export type DividerPowerStats = {
	current: number;
	totalPower: number;
	maxComponentPower: number;
	r1Stats: { total: number; components: { resistor: WireR; power: number }[]; maxComponentPower: number };
	r2Stats: { total: number; components: { resistor: WireR; power: number }[]; maxComponentPower: number };
};

function gcdInt(a: number, b: number): number {
	let x = Math.abs(a);
	let y = Math.abs(b);
	while (y) {
		const temp = y;
		y = x % y;
		x = temp;
	}
	return x || 1;
}

export function formatDividerRatio(r1Value: number, r2Value: number): string {
	if (!Number.isFinite(r1Value) || !Number.isFinite(r2Value) || r2Value === 0) {
		return '—';
	}
	const scale = 1000;
	const r1Int = Math.round(r1Value * scale);
	const r2Int = Math.round(r2Value * scale);
	const divisor = gcdInt(r1Int, r2Int);
	const left = r1Int / divisor;
	const right = r2Int / divisor;
	const exact = Number.isInteger(r1Value) && Number.isInteger(r2Value);
	return `${exact ? '' : '≈'}${left}:${right}`;
}

function networkToWireSection(net: Network): Section {
	if (net.kind === 'single') {
		return { value: net.parts[0] };
	}
	const [a, b] = net.parts;
	const pair = [{ value: a }, { value: b }] as [WireR, WireR];
	if (net.kind === 'parallel') {
		return Object.assign(pair, { type: 'parallel' as const });
	}
	return Object.assign(pair, { type: 'series' as const });
}

function resolveSections(result: DividerResult): { r1: Section; r2: Section } {
	if (result.legacySections) {
		return {
			r1: result.legacySections.r1 as Section,
			r2: result.legacySections.r2 as Section
		};
	}
	return {
		r1: networkToWireSection(result.top),
		r2: networkToWireSection(result.bottom)
	};
}

const SERIES_ORDER = ['E24', 'E48', 'E96', 'E192'] as const;
const SERIES_FP_TOL = 0.0001;

function findResistorSeriesForBounds(value: number): string | null {
	const tables = seriesData.series;
	let normalized = value;
	while (normalized >= 10) normalized /= 10;
	while (normalized < 1 && normalized > 0) normalized *= 10;

	for (const seriesName of SERIES_ORDER) {
		const arr = tables[seriesName];
		if (!arr) continue;
		const found = arr.some((seriesValue) => Math.abs(normalized - seriesValue) < SERIES_FP_TOL);
		if (found) return seriesName;
	}
	return null;
}

function calculateResistorBounds(resistor: WireR): { lower: number; upper: number } {
	const value = resistor.value;
	let tolerance = resistor.tolerance;
	if (tolerance == null) {
		const seriesName = resistor.series || findResistorSeriesForBounds(value);
		tolerance =
			seriesName != null ? (seriesData.resistorTolerances as Record<string, number>)[seriesName] ?? 0 : 0;
	}
	const multiplier = tolerance / 100;
	return {
		lower: value * (1 - multiplier),
		upper: value * (1 + multiplier)
	};
}

function calculateSectionResistanceBounds(section: Section): { lower: number; upper: number } {
	if (!Array.isArray(section)) {
		return calculateResistorBounds(section);
	}

	const type = section.type || 'series';
	const bounds = (section as ComboFlat).map((resistor) => calculateSectionResistanceBounds(resistor));

	if (type === 'parallel') {
		const lower = 1 / bounds.reduce((sum, b) => sum + 1 / b.lower, 0);
		const upper = 1 / bounds.reduce((sum, b) => sum + 1 / b.upper, 0);
		return { lower, upper };
	}

	const lower = bounds.reduce((sum, b) => sum + b.lower, 0);
	const upper = bounds.reduce((sum, b) => sum + b.upper, 0);
	return { lower, upper };
}

function dividerOutputFromTotals(r1Total: number, r2Total: number, supplyVoltage: number): number {
	return (r2Total / (r1Total + r2Total)) * supplyVoltage;
}

/** Matches legacy `resistor-worker.js` / slider behaviour for tolerance-aware Vout bands at an arbitrary supply. */
export function calculateDividerVoltageRangeForSupply(
	result: DividerResult,
	supplyVoltage: number
): { min: number; max: number } {
	const { r1, r2 } = resolveSections(result);
	const r1Bounds = calculateSectionResistanceBounds(r1);
	const r2Bounds = calculateSectionResistanceBounds(r2);
	const combos = [
		{ r1: r1Bounds.lower, r2: r2Bounds.lower },
		{ r1: r1Bounds.lower, r2: r2Bounds.upper },
		{ r1: r1Bounds.upper, r2: r2Bounds.lower },
		{ r1: r1Bounds.upper, r2: r2Bounds.upper }
	];
	const voltages = combos.map((c) => dividerOutputFromTotals(c.r1, c.r2, supplyVoltage));
	return {
		min: Math.min(...voltages),
		max: Math.max(...voltages)
	};
}

export function getDividerPowerStats(result: DividerResult, supplyVoltage: number): DividerPowerStats {
	const { r1, r2 } = resolveSections(result);
	const totalR = result.totalResistance;
	const current = supplyVoltage / totalR;
	const vDropR1 = current * result.top.total;
	const vDropR2 = current * result.bottom.total;
	const r1Stats = getSectionPowerStats(r1, current, vDropR1);
	const r2Stats = getSectionPowerStats(r2, current, vDropR2);
	const totalPower = r1Stats.total + r2Stats.total;
	const maxComponentPower = Math.max(r1Stats.maxComponentPower, r2Stats.maxComponentPower);
	return {
		current,
		totalPower,
		maxComponentPower,
		r1Stats,
		r2Stats
	};
}

export function getDividerPowerWarnings(stats: DividerPowerStats): string[] {
	const warnings: string[] = [];
	const pushWarnings = (entries: { resistor: WireR; power: number }[]) => {
		for (const entry of entries) {
			const rating = entry.resistor?.powerRating;
			if (rating != null && rating > 0 && entry.power > rating) {
				const label = entry.resistor.formatted ?? formatResistorValue(entry.resistor.value);
				warnings.push(`${label} exceeds ${formatWatts(rating)}`);
			}
		}
	};
	pushWarnings(stats.r1Stats.components);
	pushWarnings(stats.r2Stats.components);
	return warnings;
}

export type DividerPowerPresentation = {
	ratioText: string;
	powerTopLabel: string;
	powerBotLabel: string;
	totalPowerLabel: string;
	packageLine: string;
	warnings: string[];
	pngExtras: string[];
};

export function getDividerPowerPresentation(
	result: DividerResult,
	supplyVoltage: number
): DividerPowerPresentation {
	const stats = getDividerPowerStats(result, supplyVoltage);
	const pkg = getPackageRecommendation(stats.maxComponentPower);
	const warnings = getDividerPowerWarnings(stats);

	const ratioText = formatDividerRatio(result.top.total, result.bottom.total);
	const powerTopLabel = formatWatts(stats.r1Stats.total);
	const powerBotLabel = formatWatts(stats.r2Stats.total);
	const totalPowerLabel = formatWatts(stats.totalPower);
	const packageLine = `${pkg.imperial}/${pkg.metric} (rated ≥ ${formatWatts(pkg.rating)})`;

	const pngExtras = [
		`Power R_TOP: ${powerTopLabel}, R_BOT: ${powerBotLabel}, total: ${totalPowerLabel}`,
		`Min package: ${packageLine}`
	];

	return {
		ratioText,
		powerTopLabel,
		powerBotLabel,
		totalPowerLabel,
		packageLine,
		warnings,
		pngExtras
	};
}
