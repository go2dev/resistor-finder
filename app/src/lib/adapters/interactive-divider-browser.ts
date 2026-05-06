import interactiveDividerUrl from '$legacy/interactive-divider.js?url';

import { ensureLegacyMainScriptLoaded } from '$lib/adapters/legacy-main-script-browser';
import { ensureResistorUtilsLoaded } from '$lib/adapters/resistor-utils-browser';
import { ensureSchematicLoaded } from '$lib/adapters/schematic-browser';

let interactiveDividerScriptPromise: Promise<void> | null = null;

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

async function ensureInteractiveDividerScriptLoaded(): Promise<void> {
	if (typeof window === 'undefined') return;

	const w = window as Window & { __rfInitInteractiveDivider?: () => void };

	if (typeof w.__rfInitInteractiveDivider === 'function') return;

	if (!interactiveDividerScriptPromise) {
		interactiveDividerScriptPromise = injectScript(interactiveDividerUrl);
	}

	await interactiveDividerScriptPromise;

	if (typeof w.__rfInitInteractiveDivider !== 'function') {
		throw new Error('interactive-divider.js did not register __rfInitInteractiveDivider');
	}
}

/** Loads deps and attaches legacy interactive UI to the current DOM (call from onMount after markup exists). */
export async function mountInteractiveDividerLegacy(): Promise<void> {
	await ensureResistorUtilsLoaded();
	await ensureLegacyMainScriptLoaded();
	await ensureSchematicLoaded();
	await ensureInteractiveDividerScriptLoaded();

	const w = window as Window & { __rfInitInteractiveDivider?: () => void };
	w.__rfInitInteractiveDivider?.();
}
