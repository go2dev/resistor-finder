import payload from './resistor-series-data.json';

/** Serialized subset of `resistor-utils.js` passed to `resistor-worker.js` on init (single source: regenerate JSON from repo root if series change). */
export function getDividerWorkerInitData(): {
	ResistorUtils: { series: typeof payload.series };
	resistorTolerances: typeof payload.resistorTolerances;
} {
	return {
		ResistorUtils: { series: payload.series },
		resistorTolerances: payload.resistorTolerances
	};
}
