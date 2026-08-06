import type { Network } from '$lib/domain/voltage-divider';
import { getDiagramConstructor, type LegacyDiagram } from '$lib/adapters/schematic-browser';

export function networkToDiagramSection(network: Network): string {
	const [a, b] = network.parts;
	if (network.kind === 'single') {
		return `${a},series`;
	}
	if (network.kind === 'series') {
		return `${a},${b},series`;
	}
	return `${a},${b},parallel`;
}

export function renderVoltageDividerDiagram(
	containerId: string,
	top: Network,
	bottom: Network,
	supplyVoltage: number,
	targetVoltage: number,
	options: Record<string, unknown> = {}
): LegacyDiagram | null {
	const Diagram = getDiagramConstructor();
	if (!Diagram) return null;

	const el = document.getElementById(containerId);
	if (!el) return null;

	el.innerHTML = '';

	const diagram = new Diagram(containerId, 300, 220);
	diagram.renderCustom(networkToDiagramSection(top), networkToDiagramSection(bottom), supplyVoltage, targetVoltage, options);
	return diagram;
}
