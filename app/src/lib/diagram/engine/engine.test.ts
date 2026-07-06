import { describe, expect, it } from 'vitest';

import { formatAmps, formatWatts, partTooltipLines } from './format';
import {
	layoutCircuit,
	layoutNetwork,
	nodeHeight,
	nodeWidth,
	transposeBlock
} from './layout';
import { componentCount, networkToNetNode, parallel, r, series, totalResistance } from './model';
import { RES_BODY_LEN, resistorPathH, resistorPathV } from './symbols';

describe('totalResistance', () => {
	it('handles series, parallel and nesting', () => {
		expect(totalResistance(series(r(1000), r(2200)))).toBe(3200);
		expect(totalResistance(parallel(r(10000), r(10000)))).toBeCloseTo(5000);
		expect(
			totalResistance(series(r(1000), parallel(r(2200), r(4700))))
		).toBeCloseTo(1000 + (2200 * 4700) / 6900);
	});
});

describe('networkToNetNode bridge', () => {
	it('converts single/series/parallel Network rows', () => {
		const single = networkToNetNode(
			{ kind: 'single', parts: [4700], total: 4700, label: '4.7K', componentCount: 1 },
			['R_TOP']
		);
		expect(single).toEqual({ kind: 'r', value: 4700, ref: 'R_TOP' });

		const ser = networkToNetNode({
			kind: 'series',
			parts: [1000, 2200],
			total: 3200,
			label: '1K + 2.2K',
			componentCount: 2
		});
		expect(totalResistance(ser)).toBe(3200);
		expect(componentCount(ser)).toBe(2);

		const par = networkToNetNode({
			kind: 'parallel',
			parts: [1000, 1000],
			total: 500,
			label: '1K || 1K',
			componentCount: 2
		});
		expect(totalResistance(par)).toBeCloseTo(500);
	});

	it('carries refs into layout glyphs', () => {
		const layout = layoutCircuit([r(1000, 'R_TOP'), r(5100, 'R_BOT')], 3.3);
		expect(layout.resistors.map((g) => g.ref)).toEqual(['R_TOP', 'R_BOT']);
	});
});

describe('layoutCircuit electrical annotation', () => {
	it('splits voltage across series sections by resistance ratio', () => {
		const layout = layoutCircuit([r(1000), r(5100)], 3.3);
		const [top, bottom] = layout.resistors;
		expect(top.volts).toBeCloseTo(3.3 * (1000 / 6100));
		expect(bottom.volts).toBeCloseTo(3.3 * (5100 / 6100));
		expect(top.watts).toBeCloseTo((top.volts * top.volts) / 1000);
	});

	it('gives parallel branches the same voltage and correct branch currents', () => {
		const net = parallel(r(1000), series(r(500), r(500)));
		const layout = layoutCircuit([net], 10);
		const volts = layout.resistors.map((g) => g.volts);
		// lone 1k sees the full 10V; each 500R in the series branch sees 5V
		expect(volts[0]).toBeCloseTo(10);
		expect(volts[1]).toBeCloseTo(5);
		expect(volts[2]).toBeCloseTo(5);
		expect(layout.resistors[0].amps).toBeCloseTo(0.01);
	});

	it('conserves power: sum of part power equals supply power', () => {
		const sections = [
			series(r(1000), parallel(r(2200), r(4700))),
			parallel(r(5100), series(r(3300), r(1000)))
		];
		const supply = 5;
		const layout = layoutCircuit(sections, supply);
		const totalR = sections.reduce((s, n) => s + totalResistance(n), 0);
		const supplyPower = (supply * supply) / totalR;
		const partPower = layout.resistors.reduce((s, g) => s + g.watts, 0);
		expect(partPower).toBeCloseTo(supplyPower, 10);
	});
});

describe('layout geometry invariants', () => {
	const nasty = parallel(
		series(r(1000), r(2200)),
		r(4700),
		series(r(3300), parallel(r(10000), r(10000)))
	);

	it('renders one glyph per component', () => {
		const layout = layoutCircuit([nasty, r(5100)], 3.3);
		expect(layout.resistors).toHaveLength(componentCount(nasty) + 1);
	});

	it('keeps every glyph inside the viewBox', () => {
		const layout = layoutCircuit([nasty, r(5100)], 3.3);
		for (const g of layout.resistors) {
			expect(g.cx).toBeGreaterThan(0);
			expect(g.cx).toBeLessThan(layout.width);
			expect(g.yTop).toBeGreaterThan(0);
			expect(g.yBottom).toBeLessThan(layout.height);
		}
		for (const w of layout.wires) {
			for (const v of [w.x1, w.x2]) expect(v).toBeGreaterThanOrEqual(0);
			for (const v of [w.y1, w.y2]) expect(v).toBeLessThanOrEqual(layout.height);
		}
	});

	it('parallel branches never overlap horizontally', () => {
		const layout = layoutCircuit([nasty], 3.3);
		const columns = [...new Set(layout.resistors.map((g) => g.cx))].sort((a, b) => a - b);
		for (let i = 1; i < columns.length; i += 1) {
			expect(columns[i] - columns[i - 1]).toBeGreaterThanOrEqual(28);
		}
	});

	it('width/height grow with structure', () => {
		expect(nodeWidth(parallel(r(1), r(1), r(1)))).toBeGreaterThan(nodeWidth(r(1)));
		expect(nodeHeight(series(r(1), r(1)))).toBe(2 * nodeHeight(r(1)));
	});

	it('vertically centres shorter parallel branches between the bus bars', () => {
		// lone 1k (1 cell tall) next to a 2-cell series branch: the 1k should
		// start half a cell lower so both midpoints align
		const layout = layoutCircuit([parallel(r(1000), series(r(500), r(500)))], 10);
		const lone = layout.resistors.find((g) => g.value === 1000)!;
		const branchTop = Math.min(...layout.resistors.filter((g) => g.value === 500).map((g) => g.yTop));
		const cell = lone.yBottom - lone.yTop;
		expect(lone.yTop - branchTop).toBeCloseTo(cell / 2);
	});

	it('connects parallel blocks to the rail (entry/exit stubs exist)', () => {
		const layout = layoutCircuit([parallel(r(1000), r(2000)), r(500)], 10);
		const railX = layout.railX;
		const vertical = layout.wires.filter((w) => w.x1 === railX && w.x2 === railX);
		// supply stub, block entry, block exit, junction run, ground stub
		expect(vertical.length).toBeGreaterThanOrEqual(4);
		// every branch has mitred corner paths top and bottom
		expect(layout.paths.length).toBe(4);
	});
});

describe('standalone blocks and horizontal orientation', () => {
	const block = layoutNetwork(series(r(1000), parallel(r(2200), r(4700))), 5);

	it('lays out a standalone block with entry/exit terminals on the rail', () => {
		expect(block.entry).toEqual({ x: block.width / 2, y: 0 });
		expect(block.exit).toEqual({ x: block.width / 2, y: block.height });
		expect(block.resistors).toHaveLength(3);
	});

	it('transposes to horizontal: dimensions swap, spans swap, containment holds', () => {
		const h = transposeBlock(block);
		expect(h.width).toBe(block.height);
		expect(h.height).toBe(block.width);
		expect(h.entry).toEqual({ x: 0, y: block.width / 2 });
		expect(h.resistors).toHaveLength(block.resistors.length);
		h.resistors.forEach((g, i) => {
			const v = block.resistors[i];
			expect(g.orientation).toBe('horizontal');
			expect(g.cy).toBe(v.cx);
			expect(g.xLeft).toBe(v.yTop);
			expect(g.xRight).toBe(v.yBottom);
			expect(g.volts).toBe(v.volts);
			expect(g.xLeft).toBeGreaterThanOrEqual(0);
			expect(g.xRight).toBeLessThanOrEqual(h.width);
		});
	});

	it('transposes path data by swapping coordinate pairs', () => {
		const h = transposeBlock(block);
		expect(h.paths.length).toBe(block.paths.length);
		const original = block.paths[0].match(/([ML]) (-?[\d.]+) (-?[\d.]+)/g)!;
		const flipped = h.paths[0].match(/([ML]) (-?[\d.]+) (-?[\d.]+)/g)!;
		original.forEach((seg, i) => {
			const [cmd, x, y] = seg.split(' ');
			expect(flipped[i]).toBe(`${cmd} ${y} ${x}`);
		});
	});
});

describe('symbols', () => {
	it('keeps the zigzag body a fixed length regardless of lead span', () => {
		const short = resistorPathV(0, 0, 64);
		const long = resistorPathV(0, 0, 200);
		// body starts at mid - RES_BODY_LEN/2 in both cases
		expect(short).toContain(`L 0 ${32 - RES_BODY_LEN / 2}`);
		expect(long).toContain(`L 0 ${100 - RES_BODY_LEN / 2}`);
		// leads land back on the rail at the ends
		expect(long.endsWith('L 0 200')).toBe(true);
	});

	it('horizontal path spans the full lead length', () => {
		const p = resistorPathH(50, 80, 160);
		expect(p.startsWith('M 80 50')).toBe(true);
		expect(p.endsWith('L 160 50')).toBe(true);
	});
});

describe('format', () => {
	it('scales amps and watts units', () => {
		expect(formatAmps(1.5)).toBe('1.50A');
		expect(formatAmps(0.0032)).toBe('3.20mA');
		expect(formatAmps(0.0000005)).toBe('0.5µA');
		expect(formatWatts(2)).toBe('2.00W');
		expect(formatWatts(0.05)).toBe('50.0mW');
		expect(formatWatts(0.0000004)).toBe('0.4µW');
	});

	it('builds tooltip lines with optional ref', () => {
		const lines = partTooltipLines({ ref: 'R_TOP', value: 1000, volts: 0.541, amps: 0.000541, watts: 0.000293 });
		expect(lines[0]).toMatch(/^R_TOP: 1K/);
		expect(lines).toHaveLength(4);
	});
});
