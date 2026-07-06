// Series/parallel network tree — the engine's input model. Pure data +
// arithmetic; layout and rendering live in layout.ts and the components.

import type { Network } from '$lib/domain/voltage-divider';

export type ResistorNode = {
	kind: 'r';
	value: number;
	/** Reference designator shown alongside the value (R_TOP, R1, …). */
	ref?: string;
};

export type NetNode = ResistorNode | { kind: 'series' | 'parallel'; children: NetNode[] };

export const r = (value: number, ref?: string): NetNode =>
	ref === undefined ? { kind: 'r', value } : { kind: 'r', value, ref };
export const series = (...children: NetNode[]): NetNode => ({ kind: 'series', children });
export const parallel = (...children: NetNode[]): NetNode => ({ kind: 'parallel', children });

export function totalResistance(node: NetNode): number {
	if (node.kind === 'r') return node.value;
	if (node.kind === 'series') {
		return node.children.reduce((sum, c) => sum + totalResistance(c), 0);
	}
	const reciprocal = node.children.reduce((sum, c) => sum + 1 / totalResistance(c), 0);
	return reciprocal > 0 ? 1 / reciprocal : 0;
}

export function componentCount(node: NetNode): number {
	if (node.kind === 'r') return 1;
	return node.children.reduce((sum, c) => sum + componentCount(c), 0);
}

/**
 * Bridge from the UI `Network` rows (also produced from legacy worker combos
 * by `legacySectionToNetwork`) to an engine tree. Optional refs label each
 * part in order (single gets refs[0]).
 */
export function networkToNetNode(network: Network, refs: string[] = []): NetNode {
	if (network.kind === 'single') {
		return r(network.parts[0], refs[0]);
	}
	const parts = network.parts.map((v, i) => r(v, refs[i]));
	return network.kind === 'series' ? series(...parts) : parallel(...parts);
}
