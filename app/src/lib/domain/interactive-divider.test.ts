import { describe, expect, it } from 'vitest';

import {
	addParallel,
	canRemove,
	entryNode,
	insertSeries,
	nodeAt,
	outputVoltageRange,
	parseGlyphId,
	powerWarnings,
	removeAt,
	resistanceBounds,
	sectionPowerStats,
	sectionRoot,
	toNetNode,
	totalResistance,
	updateEntry,
	type InteractiveNode
} from './interactive-divider';
import { layoutCircuit } from '$lib/diagram/engine/layout';
import { formatResistorValue } from './resistor';
import { formatWatts } from './divider-power';

const e = (value: number, extra: Partial<Parameters<typeof entryNode>[0]> = {}) => ({
	value,
	...extra
});

describe('tree editing (legacy interactive-divider semantics)', () => {
	it('inserts series above/below within the parent stack', () => {
		let root = sectionRoot(e(10000));
		root = insertSeries(root, [0], 'below', e(4700));
		root = insertSeries(root, [0], 'above', e(1000));
		expect(
			root.kind !== 'r' && root.children.map((c) => (c.kind === 'r' ? c.entry.value : NaN))
		).toEqual([1000, 10000, 4700]);
	});

	it('add parallel wraps the leaf into a two-branch group', () => {
		let root = sectionRoot(e(10000));
		root = addParallel(root, [0], e(10000));
		const group = nodeAt(root, [0])!;
		expect(group.kind).toBe('parallel');
		expect(totalResistance(group)).toBeCloseTo(5000);
	});

	it('replicates the legacy quirk: series strip on a parallel leg adds a branch', () => {
		let root = sectionRoot(e(10000));
		root = addParallel(root, [0], e(10000));
		root = insertSeries(root, [0, 1], 'below', e(4700));
		const group = nodeAt(root, [0])!;
		expect(group.kind).toBe('parallel');
		expect(group.kind !== 'r' && group.children).toHaveLength(3);
	});

	it('remove respects the last-resistor guard', () => {
		let root = sectionRoot(e(10000));
		expect(canRemove(root, [0])).toBe(false);
		expect(removeAt(root, [0])).toBe(root);
		root = insertSeries(root, [0], 'below', e(4700));
		expect(canRemove(root, [0])).toBe(true);
		root = removeAt(root, [0]);
		expect(totalResistance(root)).toBe(4700);
	});

	it('updates an entry in place', () => {
		let root = sectionRoot(e(10000), e(4700));
		root = updateEntry(root, [1], e(2200, { tolerance: 1 }));
		const leaf = nodeAt(root, [1])!;
		expect(leaf.kind === 'r' && leaf.entry.value).toBe(2200);
		expect(leaf.kind === 'r' && leaf.entry.tolerance).toBe(1);
	});
});

describe('electrical math', () => {
	it('total resistance handles nesting', () => {
		const root: InteractiveNode = {
			kind: 'series',
			children: [
				entryNode(e(1000)),
				{ kind: 'parallel', children: [entryNode(e(2200)), entryNode(e(4700))] }
			]
		};
		expect(totalResistance(root)).toBeCloseTo(1000 + (2200 * 4700) / 6900);
	});

	it('bounds use explicit tolerance, else series tolerance', () => {
		const explicit = resistanceBounds(entryNode(e(1000, { tolerance: 10 })));
		expect(explicit).toEqual({ lower: 900, upper: 1100 });
		// 10k is E24 (5%) when nothing else is specified
		const derived = resistanceBounds(entryNode(e(10000)));
		expect(derived.lower).toBeCloseTo(9500);
		expect(derived.upper).toBeCloseTo(10500);
	});

	it('voltage range covers worst-case corners', () => {
		const top = sectionRoot(e(1000, { tolerance: 5 }));
		const bottom = sectionRoot(e(1000, { tolerance: 5 }));
		const range = outputVoltageRange(top, bottom, 10);
		expect(range.min).toBeCloseTo((950 / (1050 + 950)) * 10);
		expect(range.max).toBeCloseTo((1050 / (950 + 1050)) * 10);
	});

	it('power stats conserve energy and agree with the engine layout', () => {
		const top: InteractiveNode = {
			kind: 'series',
			children: [
				entryNode(e(1000)),
				{ kind: 'parallel', children: [entryNode(e(2200)), entryNode(e(4700))] }
			]
		};
		const bottom = sectionRoot(e(5100));
		const supply = 5;
		const rTop = totalResistance(top);
		const rBot = totalResistance(bottom);
		const vTop = (rTop / (rTop + rBot)) * supply;
		const stats = sectionPowerStats(top, vTop);
		expect(stats.parts).toHaveLength(3);

		const layout = layoutCircuit([toNetNode(top), toNetNode(bottom)], supply);
		const enginePowers = layout.resistors.slice(0, 3).map((g) => g.watts);
		stats.parts.forEach((p, i) => expect(p.power).toBeCloseTo(enginePowers[i], 12));

		const supplyPower = (supply * supply) / (rTop + rBot);
		const bottomStats = sectionPowerStats(bottom, supply - vTop);
		expect(stats.total + bottomStats.total).toBeCloseTo(supplyPower, 10);
	});

	it('flags parts above their power rating in legacy format', () => {
		const parts = [
			{ entry: e(100, { powerRating: 0.125 }), power: 0.5 },
			{ entry: e(1000), power: 2 }
		];
		const warnings = powerWarnings(parts, formatResistorValue, formatWatts);
		expect(warnings).toEqual(['100R exceeds 125.0mW']);
	});
});

describe('engine id addressing', () => {
	it('parses glyph ids into section + indices', () => {
		expect(parseGlyphId('s0.1.0')).toEqual({ section: 0, indices: [1, 0] });
		expect(parseGlyphId('s1.2')).toEqual({ section: 1, indices: [2] });
		expect(parseGlyphId('s0')).toEqual({ section: 0, indices: [] });
	});

	it('round-trips: engine glyph ids address the same tree nodes', () => {
		let root = sectionRoot(e(10000));
		root = addParallel(root, [0], e(4700));
		const layout = layoutCircuit([toNetNode(root)], 5);
		for (const g of layout.resistors) {
			const { indices } = parseGlyphId(g.id);
			const node = nodeAt(root, indices)!;
			expect(node.kind === 'r' && node.entry.value).toBe(g.value);
		}
		// two buses for the single parallel group, id addressing the group node
		expect(layout.buses).toHaveLength(2);
		const busNode = nodeAt(root, parseGlyphId(layout.buses[0].id).indices)!;
		expect(busNode.kind).toBe('parallel');
	});
});
