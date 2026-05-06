import resistorUtilsUrl from '$legacy/resistor-utils.js?url';

let loadPromise: Promise<void> | null = null;

export function ensureResistorUtilsLoaded(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();

	const w = window as Window & { ResistorUtils?: unknown };
	if (w.ResistorUtils) return Promise.resolve();

	if (!loadPromise) {
		loadPromise = new Promise((resolve, reject) => {
			const s = document.createElement('script');
			s.src = resistorUtilsUrl;
			s.async = true;
			s.onload = () => resolve();
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
	series: Record<string, number[]>;
	luts: { JLC_BASIC: string[] };
};

export function getResistorUtils(): LegacyResistorUtilsApi | undefined {
	if (typeof window === 'undefined') return undefined;
	return (window as Window & { ResistorUtils?: LegacyResistorUtilsApi }).ResistorUtils;
}
