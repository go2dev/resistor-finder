import resistorUtilsUrl from '$legacy/resistor-utils.js?url';

let loadPromise: Promise<void> | null = null;

function resolveResistorUtilsGlobal(): unknown {
	const w = window as Window & { ResistorUtils?: unknown };
	if (w.ResistorUtils) return w.ResistorUtils;
	try {
		const fromLexical = new Function(
			'return typeof ResistorUtils !== "undefined" ? ResistorUtils : undefined;'
		)();
		if (fromLexical) {
			w.ResistorUtils = fromLexical;
			return fromLexical;
		}
	} catch {
		/* ignore */
	}
	return undefined;
}

export function ensureResistorUtilsLoaded(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();

	if (resolveResistorUtilsGlobal()) return Promise.resolve();

	if (!loadPromise) {
		loadPromise = new Promise((resolve, reject) => {
			const s = document.createElement('script');
			s.src = resistorUtilsUrl;
			s.async = true;
			s.onload = () => {
				// Some environments report onload before global assignment; wait briefly.
				let attempts = 0;
				const maxAttempts = 200;
				const tick = () => {
					if (resolveResistorUtilsGlobal()) {
						resolve();
						return;
					}
					attempts += 1;
					if (attempts >= maxAttempts) {
						reject(new Error('resistor-utils.js loaded but ResistorUtils global not found'));
						return;
					}
					setTimeout(tick, 25);
				};
				tick();
			};
			s.onerror = () => reject(new Error('Failed to load resistor-utils.js'));
			document.head.appendChild(s);
		});
	}

	return loadPromise;
}

/** Narrow typing for fields we use from legacy `ResistorUtils` */
export type LegacyResistorUtilsApi = {
	parseResistorInput: (
		input: string,
		options?: { snapToSeries?: boolean; snapSeries?: string }
	) => {
		value: number;
		tolerance?: number | null;
		powerRating?: number | null;
		powerCode?: string | null;
		series?: string | null;
		source?: string;
		warnings: string[];
	};
	formatResistorValue: (value: number) => string;
	isJlcBasicResistance: (ohms: number) => boolean;
	getJlcBasicMeta: (ohms: number) => {
		packages: string[];
		tolerances: number[];
		detailSource?: string;
	} | null;
	resistorTolerances: Record<string, number>;
	getSeriesForTolerance?: (tolerance: number) => string | null;
	findResistorSeries?: (value: number) => string | null;
	series: Record<string, number[]>;
	luts: { JLC_BASIC: string[] };
};

export function getResistorUtils(): LegacyResistorUtilsApi | undefined {
	if (typeof window === 'undefined') return undefined;
	return resolveResistorUtilsGlobal() as LegacyResistorUtilsApi | undefined;
}
