import { describe, expect, it } from 'vitest';

import {
	componentCount,
	layoutCircuit,
	nodeHeight,
	nodeWidth,
	parallel,
	r,
	series,
	totalResistance
} from './poc-network';

describe('totalResistance', () => {
	it('handles series, parallel and nesting', () => {
		expect(totalResistance(series(r(1000), r(2200)))).toBe(3200);
		expect(totalResistance(parallel(r(10000), r(10000)))).toBeCloseTo(5000);
		expect(
			totalResistance(series(r(1000), parallel(r(2200), r(4700))))
		).toBeCloseTo(1000 + (2200 * 4700) / 6900);
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
});
