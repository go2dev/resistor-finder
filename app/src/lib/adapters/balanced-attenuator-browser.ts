import attenuatorEngineUrl from '$legacy/attenuator-engine.js?url';
import commonUiUrl from '$legacy/common-ui.js?url';
import diagramExportUrl from '$legacy/diagram-export.js?url';

import { ensureJlcBasicCatalogLoaded } from '$lib/adapters/jlc-basic-catalog-browser';
import { ensureLegacyMainScriptLoaded } from '$lib/adapters/legacy-main-script-browser';
import { ensureResistorUtilsLoaded } from '$lib/adapters/resistor-utils-browser';
import { ensureSchematicLoaded } from '$lib/adapters/schematic-browser';

const injected = new Set<string>();

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

async function injectOnce(src: string): Promise<void> {
	if (injected.has(src)) return;
	await injectScript(src);
	injected.add(src);
}

/**
 * Boots repo-root balanced attenuator flow (`balanced-attenuator.html` parity): resistor-utils → catalog → engine → diagram-export → common-ui → `script.js` → schematic.
 * Requires matching DOM ids and `document.body.dataset.page === 'balanced-attenuator'`.
 */
export async function mountBalancedAttenuatorLegacy(): Promise<void> {
	if (typeof document === 'undefined') return;

	document.body.dataset.page = 'balanced-attenuator';

	await ensureResistorUtilsLoaded();
	try {
		await ensureJlcBasicCatalogLoaded();
	} catch {
		/* optional catalog — parsing still works with LUT-only meta */
	}

	await injectOnce(attenuatorEngineUrl);
	await injectOnce(diagramExportUrl);
	await injectOnce(commonUiUrl);

	await ensureLegacyMainScriptLoaded();
	await ensureSchematicLoaded();

	const w = window as Window & {
		__rfWireCalculatorDomListeners?: () => void;
		calculateAndDisplayResults?: () => unknown | Promise<unknown>;
		__rfBalancedAttenuatorWired?: boolean;
	};

	if (!w.__rfBalancedAttenuatorWired) {
		w.__rfWireCalculatorDomListeners?.();
		w.__rfBalancedAttenuatorWired = true;
	}

	try {
		type WC = Window & {
			JlcBasicCatalog?: { init?: () => Promise<unknown> };
			CommonUI?: { refreshJlcBasicParsedBoxes?: (root?: Document | ParentNode) => void };
		};
		const catalog = (window as WC).JlcBasicCatalog;
		if (catalog?.init) {
			void catalog.init().then(() => (window as WC).CommonUI?.refreshJlcBasicParsedBoxes?.(document));
		}
	} catch {
		/* ignore */
	}

	await w.calculateAndDisplayResults?.();
}
