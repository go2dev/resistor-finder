import schematicScriptUrl from '$legacy/schematic.js?url';

export type LegacyDiagram = {
	renderCustom(
		topSectionStr: string,
		bottomSectionStr: string,
		supplyVoltage: number,
		targetVoltage: number,
		options?: Record<string, unknown>
	): void;
};

let loadPromise: Promise<void> | null = null;

type DiagramCtor = new (containerId: string, width?: number, height?: number) => LegacyDiagram;

/**
 * schematic.js declares `class Diagram` at top level of a classic script,
 * which creates a script-scoped global binding but NOT a window property —
 * so `window.Diagram` alone never resolves. Same workaround as
 * resistor-utils-browser: read the lexical global and cache it on window.
 */
function resolveDiagramGlobal(): DiagramCtor | undefined {
	const w = window as Window & { Diagram?: DiagramCtor };
	if (w.Diagram) return w.Diagram;
	try {
		const fromLexical = new Function(
			'return typeof Diagram !== "undefined" ? Diagram : undefined;'
		)() as DiagramCtor | undefined;
		if (fromLexical) {
			w.Diagram = fromLexical;
			return fromLexical;
		}
	} catch {
		// fall through
	}
	return undefined;
}

export function ensureSchematicLoaded(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();

	if (resolveDiagramGlobal()) return Promise.resolve();

	if (!loadPromise) {
		loadPromise = new Promise((resolve, reject) => {
			const s = document.createElement('script');
			s.src = schematicScriptUrl;
			s.async = true;
			s.onload = () => {
				if (resolveDiagramGlobal()) {
					resolve();
				} else {
					reject(new Error('schematic.js loaded but Diagram is not defined'));
				}
			};
			s.onerror = () => reject(new Error('Failed to load schematic.js'));
			document.head.appendChild(s);
		});
	}

	return loadPromise;
}

export function getDiagramConstructor(): DiagramCtor | undefined {
	if (typeof window === 'undefined') return undefined;
	return resolveDiagramGlobal();
}
