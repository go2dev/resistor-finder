import jlcCatalogUrl from '$legacy/jlc-basic-catalog.js?url';

import { ensureResistorUtilsLoaded } from '$lib/adapters/resistor-utils-browser';

export type JlcBasicCatalogApi = {
	init: () => Promise<unknown>;
	getMetaForOhms: (ohms: number) => { packages: string[]; tolerances: number[] } | null;
	getState: () => unknown;
};

let catalogLoadPromise: Promise<void> | null = null;

function injectCatalogScript(): Promise<void> {
	return new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = jlcCatalogUrl;
		s.async = true;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error('Failed to load jlc-basic-catalog.js'));
		document.head.appendChild(s);
	});
}

export async function ensureJlcBasicCatalogLoaded(): Promise<void> {
	if (typeof window === 'undefined') return;

	await ensureResistorUtilsLoaded();

	const w = window as Window & { JlcBasicCatalog?: JlcBasicCatalogApi };

	if (!catalogLoadPromise) {
		catalogLoadPromise = (async () => {
			if (!w.JlcBasicCatalog) {
				await injectCatalogScript();
			}
			const catalog = w.JlcBasicCatalog;
			if (!catalog?.init) {
				throw new Error('JlcBasicCatalog missing after script load');
			}
			await catalog.init();
		})();
	}

	try {
		await catalogLoadPromise;
	} catch (e) {
		catalogLoadPromise = null;
		throw e;
	}
}
