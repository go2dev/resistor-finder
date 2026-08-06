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

export function ensureSchematicLoaded(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();

	const w = window as Window & { Diagram?: new (containerId: string, width?: number, height?: number) => LegacyDiagram };
	if (w.Diagram) return Promise.resolve();

	if (!loadPromise) {
		loadPromise = new Promise((resolve, reject) => {
			const s = document.createElement('script');
			s.src = schematicScriptUrl;
			s.async = true;
			s.onload = () => resolve();
			s.onerror = () => reject(new Error('Failed to load schematic.js'));
			document.head.appendChild(s);
		});
	}

	return loadPromise;
}

export function getDiagramConstructor(): (new (containerId: string, width?: number, height?: number) => LegacyDiagram) | undefined {
	if (typeof window === 'undefined') return undefined;
	return (window as Window & { Diagram?: new (containerId: string, width?: number, height?: number) => LegacyDiagram }).Diagram;
}
