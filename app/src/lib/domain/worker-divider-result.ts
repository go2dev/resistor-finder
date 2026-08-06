import { legacySectionToNetwork } from '$lib/domain/legacy-section-network';
import type { DividerResult } from '$lib/domain/voltage-divider';

export type WorkerRawDividerResult = {
	r1: unknown;
	r2: unknown;
	r1Value: number;
	r2Value: number;
	outputVoltage: number;
	error: number;
	componentCount: number;
	voltageRange: { min: number; max: number };
	totalResistance: number;
};

export function workerRawToDividerResult(r: WorkerRawDividerResult): DividerResult {
	return {
		top: legacySectionToNetwork(r.r1),
		bottom: legacySectionToNetwork(r.r2),
		outputVoltage: r.outputVoltage,
		error: r.error,
		totalResistance: r.totalResistance,
		componentCount: r.componentCount,
		voltageRange: r.voltageRange,
		legacySections: { r1: r.r1, r2: r.r2 }
	};
}

/** Matches within-worker dedupe key preference when collapsing ratios across chunks */
export function dedupeDividerRatiosRaw(results: WorkerRawDividerResult[]): WorkerRawDividerResult[] {
	const map = new Map<string, WorkerRawDividerResult>();
	for (const r of results) {
		const ratio = r.r2Value / (r.r1Value + r.r2Value);
		const key = ratio.toFixed(10);
		const prev = map.get(key);
		if (
			!prev ||
			r.componentCount < prev.componentCount ||
			(r.componentCount === prev.componentCount && r.totalResistance < prev.totalResistance)
		) {
			map.set(key, r);
		}
	}
	return [...map.values()];
}
