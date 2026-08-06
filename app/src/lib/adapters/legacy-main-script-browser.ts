import scriptJsUrl from '$legacy/script.js?url';

let loadPromise: Promise<void> | null = null;

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

/** Loads repo-root `script.js` (ResistorCalculator, divider power helpers, …). Safe when divider/attenuator DOM is absent — handlers are guarded. */
export function ensureLegacyMainScriptLoaded(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();

	const w = window as Window & {
		ResistorCalculator?: unknown;
		getNumericInputValue?: unknown;
	};

	if (w.ResistorCalculator && w.getNumericInputValue) return Promise.resolve();

	if (!loadPromise) {
		loadPromise = injectScript(scriptJsUrl);
	}

	return loadPromise;
}
