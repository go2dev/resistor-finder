import { getDividerWorkerInitData } from '$lib/domain/resistor-series-data';
import { calculateLegacyComboResistance, type LegacyCombination } from '$lib/domain/legacy-divider-combos';
import {
	dedupeDividerRatiosRaw,
	workerRawToDividerResult,
	type WorkerRawDividerResult
} from '$lib/domain/worker-divider-result';
import type { DividerResult } from '$lib/domain/voltage-divider';

export type DividerWorkerMeta = {
	durationMs: number;
	workerCount: number;
	combinationCount: number;
};

function createDividerWorker(): Worker {
	const url = new URL('../../../../resistor-worker.js', import.meta.url);
	return new Worker(url, { type: 'classic' });
}

/** Mirrors legacy `findVoltageDividerCombinationsParallel` + multi-chunk dedupe */
export async function computeVoltageDividerViaLegacyWorkers(params: {
	combinations: LegacyCombination[];
	supplyVoltage: number;
	targetVoltage: number;
	allowOvershoot: boolean;
}): Promise<{ results: DividerResult[]; meta: DividerWorkerMeta }> {
	const { combinations, supplyVoltage, targetVoltage, allowOvershoot } = params;

	const resistanceCache = new Map<number, number>();
	for (let i = 0; i < combinations.length; i += 1) {
		resistanceCache.set(i, calculateLegacyComboResistance(combinations[i]));
	}

	const sortedIndices = Array.from({ length: combinations.length }, (_, i) => i).sort(
		(a, b) => resistanceCache.get(a)! - resistanceCache.get(b)!
	);

	const targetRatio = targetVoltage / supplyVoltage;
	const resistanceCacheArray = Array.from(resistanceCache.entries());

	const numWorkers =
		typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
	const chunkSize = Math.ceil(sortedIndices.length / numWorkers);
	const chunks: number[][] = [];
	for (let i = 0; i < numWorkers; i += 1) {
		const start = i * chunkSize;
		const end = Math.min(start + chunkSize, sortedIndices.length);
		if (start < end) {
			chunks.push(Array.from({ length: end - start }, (_, j) => start + j));
		}
	}

	const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

	const workers: Worker[] = [];
	const promises = chunks.map(
		(r2Indices) =>
			new Promise<WorkerRawDividerResult[]>((resolve, reject) => {
				const worker = createDividerWorker();
				workers.push(worker);

				worker.onmessage = (e: MessageEvent) => {
					const { type } = e.data;
					if (type === 'initialized') {
						worker.postMessage({
							type: 'processChunk',
							data: {
								r2Indices,
								combinations,
								resistanceCacheArray,
								sortedIndices,
								supplyVoltage,
								targetVoltage,
								allowOvershoot,
								targetRatio
							}
						});
					} else if (type === 'chunkComplete') {
						const raw = e.data.results as WorkerRawDividerResult[] | undefined;
						worker.terminate();
						resolve(raw ?? []);
					} else if (type === 'error') {
						worker.terminate();
						reject(new Error(e.data.error));
					}
				};

				worker.onerror = (err) => {
					worker.terminate();
					reject(err);
				};

				worker.postMessage({
					type: 'init',
					data: getDividerWorkerInitData()
				});
			})
	);

	let chunksRaw: WorkerRawDividerResult[] = [];
	try {
		const parts = await Promise.all(promises);
		for (const part of parts) {
			chunksRaw = chunksRaw.concat(part);
		}
	} catch (err) {
		for (const w of workers) {
			try {
				w.terminate();
			} catch {
				/* ignore */
			}
		}
		throw err;
	}

	const merged = dedupeDividerRatiosRaw(chunksRaw);
	const mapped = merged.map(workerRawToDividerResult);

	const endMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

	return {
		results: mapped,
		meta: {
			durationMs: Math.round(endMs - startMs),
			workerCount: chunks.length,
			combinationCount: combinations.length
		}
	};
}
