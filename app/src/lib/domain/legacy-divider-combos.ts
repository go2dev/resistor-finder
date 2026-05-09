import type { RichParsedResistor } from '$lib/domain/parse-rich-resistors';

/** Serialized resistor leaf compatible with `resistor-worker.js` tolerance + power checks */
export type LegacyResistorWire = {
	value: number;
	tolerance?: number | null;
	series?: string | null;
	powerRating?: number | null;
	powerCode?: string | null;
	formatted?: string;
};

export type LegacyCombination =
	| LegacyResistorWire
	| ([LegacyResistorWire, LegacyResistorWire] & { type: 'series' | 'parallel' });

export function calculateLegacyComboResistance(combo: LegacyCombination): number {
	if (!Array.isArray(combo)) {
		const v = combo.value;
		if (!Number.isFinite(v) || v <= 0) return NaN;
		return v;
	}
	const [a, b] = combo;
	const av = a.value;
	const bv = b.value;
	if (!Number.isFinite(av) || !Number.isFinite(bv) || av <= 0 || bv <= 0) return NaN;
	const type = combo.type || 'series';
	if (type === 'parallel') {
		return (av * bv) / (av + bv);
	}
	return av + bv;
}

function toWire(r: RichParsedResistor): LegacyResistorWire {
	return {
		value: r.value,
		tolerance: r.tolerance ?? undefined,
		series: r.series ?? undefined,
		powerRating: r.powerRating ?? undefined,
		powerCode: r.powerCode ?? undefined,
		formatted: r.formatted
	};
}

/** Mirrors legacy `ResistorCalculator.generateCombinations` with tolerance/power metadata per leaf */
export function buildLegacyDividerCombinations(resistors: RichParsedResistor[]): LegacyCombination[] {
	const wires = resistors.map(toWire);
	const combinations: LegacyCombination[] = [];

	for (const w of wires) {
		combinations.push(w);
	}

	for (let i = 0; i < wires.length; i += 1) {
		for (let j = i; j < wires.length; j += 1) {
			const series = [wires[i], wires[j]] as [LegacyResistorWire, LegacyResistorWire] & { type: 'series' };
			series.type = 'series';
			combinations.push(series);
		}
	}

	for (let i = 0; i < wires.length; i += 1) {
		for (let j = i; j < wires.length; j += 1) {
			const parallel = [wires[i], wires[j]] as [LegacyResistorWire, LegacyResistorWire] & { type: 'parallel' };
			parallel.type = 'parallel';
			combinations.push(parallel);
		}
	}

	return combinations;
}
