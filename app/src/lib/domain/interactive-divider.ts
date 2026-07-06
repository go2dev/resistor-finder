// Domain model for the interactive divider editor: arbitrary-depth
// series/parallel trees of resistor entries (value + tolerance/series/power
// metadata from the legacy parser), immutable edit operations addressed by
// child-index paths, and the electrical math the results panel shows.
// Semantics replicate interactive-divider.js, including its editing quirks
// (an insert-series strip on a parallel leg adds a branch to that group).

import { parallel, r, series, type NetNode } from '$lib/diagram/engine/model';
import seriesData from '$lib/domain/resistor-series-data.json';

export type InteractiveEntry = {
	value: number;
	/** Raw user input string (preserved for the edit dialog). */
	input?: string;
	tolerance?: number | null;
	series?: string | null;
	powerRating?: number | null;
	powerCode?: string | null;
};

export type InteractiveNode =
	| { kind: 'r'; entry: InteractiveEntry }
	| { kind: 'series' | 'parallel'; children: InteractiveNode[] };

export const entryNode = (entry: InteractiveEntry): InteractiveNode => ({ kind: 'r', entry });

/** Root of each divider branch: a series stack, as in the legacy editor. */
export const sectionRoot = (...entries: InteractiveEntry[]): InteractiveNode => ({
	kind: 'series',
	children: entries.map(entryNode)
});

// --- addressing ----------------------------------------------------------

/**
 * Engine glyph/bus ids look like `s0.1.0`: section index, then child indices
 * into the section root — the same paths the edit operations take.
 */
export function parseGlyphId(id: string): { section: number; indices: number[] } {
	const parts = id.split('.');
	return {
		section: Number(parts[0].slice(1)),
		indices: parts.slice(1).map(Number)
	};
}

export function nodeAt(root: InteractiveNode, indices: number[]): InteractiveNode | null {
	let cur: InteractiveNode = root;
	for (const i of indices) {
		if (cur.kind === 'r') return null;
		const next: InteractiveNode | undefined = cur.children[i];
		if (!next) return null;
		cur = next;
	}
	return cur;
}

// --- immutable edit operations -------------------------------------------

function withChildren(
	node: InteractiveNode,
	indices: number[],
	edit: (parent: Extract<InteractiveNode, { kind: 'series' | 'parallel' }>, index: number) => InteractiveNode[]
): InteractiveNode {
	if (node.kind === 'r' || indices.length === 0) return node;
	const [head, ...rest] = indices;
	if (rest.length === 0) {
		return { kind: node.kind, children: edit(node, head) };
	}
	return {
		kind: node.kind,
		children: node.children.map((c, i) => (i === head ? withChildren(c, rest, edit) : c))
	};
}

export function updateEntry(
	root: InteractiveNode,
	indices: number[],
	entry: InteractiveEntry
): InteractiveNode {
	return withChildren(root, indices, (parent, i) =>
		parent.children.map((c, j) => (j === i && c.kind === 'r' ? entryNode(entry) : c))
	);
}

/**
 * Insert `entry` before/after the node at `indices`, into that node's parent
 * (legacy behaviour: if the parent is a parallel group this adds a branch).
 */
export function insertSeries(
	root: InteractiveNode,
	indices: number[],
	where: 'above' | 'below',
	entry: InteractiveEntry
): InteractiveNode {
	return withChildren(root, indices, (parent, i) => {
		const at = where === 'above' ? i : i + 1;
		const children = [...parent.children];
		children.splice(at, 0, entryNode(entry));
		return children;
	});
}

/** Replace the node at `indices` with a parallel group of it and `entry`. */
export function addParallel(
	root: InteractiveNode,
	indices: number[],
	entry: InteractiveEntry
): InteractiveNode {
	return withChildren(root, indices, (parent, i) =>
		parent.children.map((c, j) =>
			j === i ? ({ kind: 'parallel', children: [c, entryNode(entry)] } as InteractiveNode) : c
		)
	);
}

export function canRemove(root: InteractiveNode, indices: number[]): boolean {
	if (!indices.length) return false;
	const parent = nodeAt(root, indices.slice(0, -1));
	return !!parent && parent.kind !== 'r' && parent.children.length > 1;
}

/** Remove the node at `indices`; refuses to empty its parent (legacy guard). */
export function removeAt(root: InteractiveNode, indices: number[]): InteractiveNode {
	if (!canRemove(root, indices)) return root;
	return withChildren(root, indices, (parent, i) => parent.children.filter((_, j) => j !== i));
}

// --- electrical math ------------------------------------------------------

export function totalResistance(node: InteractiveNode): number {
	if (node.kind === 'r') return node.entry.value;
	if (node.kind === 'series') {
		return node.children.reduce((sum, c) => sum + totalResistance(c), 0);
	}
	const reciprocal = node.children.reduce((sum, c) => sum + 1 / totalResistance(c), 0);
	return reciprocal > 0 ? 1 / reciprocal : 0;
}

const SERIES_ORDER = ['E24', 'E48', 'E96', 'E192'] as const;
const SERIES_FP_TOL = 0.0001;

/** Loosest E-series containing the value (matches legacy findResistorSeries). */
export function findSeriesForValue(value: number): string | null {
	const tables = seriesData.series as Record<string, number[]>;
	let normalized = value;
	while (normalized >= 10) normalized /= 10;
	while (normalized < 1 && normalized > 0) normalized *= 10;
	for (const name of SERIES_ORDER) {
		const arr = tables[name];
		if (arr?.some((v) => Math.abs(normalized - v) < SERIES_FP_TOL)) return name;
	}
	return null;
}

export function entryTolerancePercent(entry: InteractiveEntry): number {
	if (entry.tolerance != null) return entry.tolerance;
	const name = entry.series ?? findSeriesForValue(entry.value);
	if (!name) return 0;
	return (seriesData.resistorTolerances as Record<string, number>)[name] ?? 0;
}

export type Bounds = { lower: number; upper: number };

export function resistanceBounds(node: InteractiveNode): Bounds {
	if (node.kind === 'r') {
		const m = entryTolerancePercent(node.entry) / 100;
		return { lower: node.entry.value * (1 - m), upper: node.entry.value * (1 + m) };
	}
	const bounds = node.children.map(resistanceBounds);
	if (node.kind === 'parallel') {
		return {
			lower: 1 / bounds.reduce((s, b) => s + 1 / b.lower, 0),
			upper: 1 / bounds.reduce((s, b) => s + 1 / b.upper, 0)
		};
	}
	return {
		lower: bounds.reduce((s, b) => s + b.lower, 0),
		upper: bounds.reduce((s, b) => s + b.upper, 0)
	};
}

/** Tolerance-aware Vout band: worst cases over the four bound corners. */
export function outputVoltageRange(
	top: InteractiveNode,
	bottom: InteractiveNode,
	supplyVoltage: number
): { min: number; max: number } {
	const t = resistanceBounds(top);
	const b = resistanceBounds(bottom);
	const corners = [
		[t.lower, b.lower],
		[t.lower, b.upper],
		[t.upper, b.lower],
		[t.upper, b.upper]
	];
	const volts = corners.map(([rt, rb]) => (rb / (rt + rb)) * supplyVoltage);
	return { min: Math.min(...volts), max: Math.max(...volts) };
}

export type PartPower = { entry: InteractiveEntry; power: number };
export type SectionPowerStats = { total: number; maxComponentPower: number; parts: PartPower[] };

/** Per-part dissipation for `volts` across the node (series splits by ratio). */
export function sectionPowerStats(node: InteractiveNode, volts: number): SectionPowerStats {
	if (node.kind === 'r') {
		const power = node.entry.value > 0 ? (volts * volts) / node.entry.value : 0;
		return { total: power, maxComponentPower: power, parts: [{ entry: node.entry, power }] };
	}
	const childVolts =
		node.kind === 'parallel'
			? node.children.map(() => volts)
			: (() => {
					const total = totalResistance(node);
					return node.children.map((c) => (total > 0 ? (totalResistance(c) / total) * volts : 0));
				})();
	const stats = node.children.map((c, i) => sectionPowerStats(c, childVolts[i]));
	return {
		total: stats.reduce((s, st) => s + st.total, 0),
		maxComponentPower: Math.max(...stats.map((st) => st.maxComponentPower)),
		parts: stats.flatMap((st) => st.parts)
	};
}

/** Legacy-format warnings for parts dissipating above their rated power. */
export function powerWarnings(parts: PartPower[], formatValue: (v: number) => string, formatW: (w: number) => string): string[] {
	const warnings: string[] = [];
	for (const { entry, power } of parts) {
		if (entry.powerRating != null && entry.powerRating > 0 && power > entry.powerRating) {
			warnings.push(`${formatValue(entry.value)} exceeds ${formatW(entry.powerRating)}`);
		}
	}
	return warnings;
}

// --- engine bridge ---------------------------------------------------------

/** Engine tree with identical child indices, so glyph ids map back 1:1. */
export function toNetNode(node: InteractiveNode): NetNode {
	if (node.kind === 'r') return r(node.entry.value);
	const children = node.children.map(toNetNode);
	return node.kind === 'series' ? series(...children) : parallel(...children);
}
