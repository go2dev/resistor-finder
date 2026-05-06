import d3Url from '$legacy/vendor/d3-7.9.0.min.js?url';
import nouisliderJsUrl from '$legacy/nuis/nouislider.js?url';
import zoomFilterUrl from '$legacy/zoomable-range-filter.js?url';

function injectScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = src;
		s.async = true;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error(`Failed to load ${src}`));
		document.head.appendChild(s);
	});
}

let depsPromise: Promise<void> | null = null;

type HistogramWindow = Window & {
	d3?: unknown;
	noUiSlider?: unknown;
	ZoomableRangeFilter?: {
		create: (el: HTMLElement, opts: Record<string, unknown>) => ZoomableHistogramApi;
	};
};

export type ZoomableHistogramApi = {
	destroy: () => void;
	updateFullDomain: (
		results: { id: string; value: number }[],
		opts?: { forceReset?: boolean }
	) => void;
	getFilterRange: () => { min: number; max: number };
};

export async function ensureZoomableHistogramDepsLoaded(): Promise<void> {
	if (typeof window === 'undefined') return;

	const w = window as HistogramWindow;

	if (w.d3 && w.noUiSlider && w.ZoomableRangeFilter) return;

	if (!depsPromise) {
		depsPromise = (async () => {
			const ww = window as HistogramWindow;
			if (!ww.d3) await injectScript(d3Url);
			if (!ww.noUiSlider) await injectScript(nouisliderJsUrl);
			if (!ww.ZoomableRangeFilter) await injectScript(zoomFilterUrl);
		})();
	}

	await depsPromise;

	if (!(window as HistogramWindow).ZoomableRangeFilter?.create) {
		throw new Error('ZoomableRangeFilter missing after load');
	}
}

export function createZoomableHistogramFilter(
	container: HTMLElement,
	options: Record<string, unknown>
): ZoomableHistogramApi {
	const w = window as HistogramWindow;
	const Z = w.ZoomableRangeFilter;
	if (!Z?.create) {
		throw new Error('ZoomableRangeFilter not loaded');
	}
	return Z.create(container, options);
}
