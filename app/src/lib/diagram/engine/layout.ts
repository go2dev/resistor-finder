// Pure recursive layout for series/parallel trees on a vertical rail, plus
// electrical annotation (per-part V/I/P) derived from the same tree — that
// is what powers the per-part tooltips. No DOM: renderers consume the
// returned glyphs.

import { BUS_PAD, COL_W, LEAD_OVERLAP, RES_CELL } from './symbols';
import { totalResistance, type NetNode } from './model';

export type Orientation = 'vertical' | 'horizontal';

export type ResistorGlyph = {
	id: string;
	ref?: string;
	orientation: 'vertical';
	cx: number;
	yTop: number;
	yBottom: number;
	value: number;
	/** Voltage across this resistor for the annotated supply */
	volts: number;
	watts: number;
	amps: number;
};

/** Horizontal counterpart produced by `transposeBlock`. */
export type HResistorGlyph = {
	id: string;
	ref?: string;
	orientation: 'horizontal';
	cy: number;
	xLeft: number;
	xRight: number;
	value: number;
	volts: number;
	watts: number;
	amps: number;
};

export type AnyResistorGlyph = ResistorGlyph | HResistorGlyph;

export type WireGlyph = { x1: number; y1: number; x2: number; y2: number };
export type DotGlyph = { x: number; y: number };
/** One bus bar of a parallel group (two per group); id is the group's node id. */
export type BusGlyph = { id: string; x1: number; y1: number; x2: number; y2: number };
type Point = { x: number; y: number };

export type NetworkLayout = {
	resistors: ResistorGlyph[];
	wires: WireGlyph[];
	/** Multi-segment wire runs (SVG path data) — corners render as proper mitred joins */
	paths: string[];
	dots: DotGlyph[];
	buses: BusGlyph[];
	width: number;
	height: number;
};

export function nodeWidth(node: NetNode): number {
	if (node.kind === 'r') return COL_W;
	if (node.kind === 'series') return Math.max(...node.children.map(nodeWidth));
	return node.children.reduce((sum, c) => sum + nodeWidth(c), 0);
}

export function nodeHeight(node: NetNode): number {
	if (node.kind === 'r') return RES_CELL;
	if (node.kind === 'series') return node.children.reduce((sum, c) => sum + nodeHeight(c), 0);
	return 2 * BUS_PAD + Math.max(...node.children.map(nodeHeight));
}

type Sink = {
	resistors: ResistorGlyph[];
	wires: WireGlyph[];
	polylines: Point[][];
	dots: DotGlyph[];
	buses: BusGlyph[];
};

const toPathData = (run: Point[]): string =>
	run.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

/**
 * Lay a node out on a vertical rail centred at cx, starting at y.
 * `volts` is the voltage across the whole node; series children split it by
 * resistance ratio, parallel children all see it — from which each leaf gets
 * V, I and P for tooltips.
 */
function layoutNode(
	node: NetNode,
	cx: number,
	y: number,
	volts: number,
	idPrefix: string,
	sink: Sink
): number {
	if (node.kind === 'r') {
		const yBottom = y + RES_CELL;
		sink.resistors.push({
			id: idPrefix,
			ref: node.ref,
			orientation: 'vertical',
			cx,
			yTop: y,
			yBottom,
			value: node.value,
			volts,
			amps: node.value > 0 ? volts / node.value : 0,
			watts: node.value > 0 ? (volts * volts) / node.value : 0
		});
		return yBottom;
	}

	if (node.kind === 'series') {
		const total = totalResistance(node);
		let cursor = y;
		node.children.forEach((child, i) => {
			const share = total > 0 ? (totalResistance(child) / total) * volts : 0;
			cursor = layoutNode(child, cx, cursor, share, `${idPrefix}.${i}`, sink);
		});
		return cursor;
	}

	// parallel: entry/exit stubs on the rail, then one mitred corner-path per
	// branch (bus segment + drop into the branch), with each branch vertically
	// centred between the bus bars.
	const height = nodeHeight(node);
	const innerHeight = height - 2 * BUS_PAD;
	const widths = node.children.map(nodeWidth);
	const totalWidth = widths.reduce((s, w) => s + w, 0);
	const busTop = y + BUS_PAD;
	const busBottom = y + height - BUS_PAD;

	let edge = cx - totalWidth / 2;
	const branchXs = widths.map((w) => {
		const branchCx = edge + w / 2;
		edge += w;
		return branchCx;
	});

	// rail joins the bus bars — continuous with whatever sits above/below
	sink.wires.push({ x1: cx, y1: y, x2: cx, y2: busTop });
	sink.wires.push({ x1: cx, y1: busBottom, x2: cx, y2: y + height });
	sink.dots.push({ x: cx, y: busTop }, { x: cx, y: busBottom });

	// bus extents for hit-testing (the bars themselves render via the
	// per-branch corner paths below)
	const busLeft = Math.min(cx, ...branchXs);
	const busRight = Math.max(cx, ...branchXs);
	sink.buses.push(
		{ id: idPrefix, x1: busLeft, y1: busTop, x2: busRight, y2: busTop },
		{ id: idPrefix, x1: busLeft, y1: busBottom, x2: busRight, y2: busBottom }
	);

	node.children.forEach((child, i) => {
		const bx = branchXs[i];
		const childHeight = nodeHeight(child);
		const childTop = busTop + (innerHeight - childHeight) / 2;
		const childBottom = childTop + childHeight;
		// one path per branch: along the bus then turn into the branch —
		// corners are real path joins, not two butt-capped lines. The path
		// overlaps LEAD_OVERLAP into the branch's own lead so a branch as tall
		// as the block still gets a real mitre (see symbols.LEAD_OVERLAP).
		sink.polylines.push([
			{ x: cx, y: busTop },
			{ x: bx, y: busTop },
			{ x: bx, y: childTop + LEAD_OVERLAP }
		]);
		layoutNode(child, bx, childTop, volts, `${idPrefix}.${i}`, sink);
		sink.polylines.push([
			{ x: bx, y: childBottom - LEAD_OVERLAP },
			{ x: bx, y: busBottom },
			{ x: cx, y: busBottom }
		]);
		// interior branches tap a bus that runs past them: 3-way junction dots
		if (i > 0 && i < node.children.length - 1 && bx !== cx) {
			sink.dots.push({ x: bx, y: busTop }, { x: bx, y: busBottom });
		}
	});

	return y + height;
}

/**
 * Full vertical circuit: supply rail at top, sections stacked with junction
 * dots between them, ground at the bottom. Returns glyphs plus the junction
 * y-positions so callers can attach tap wires/labels.
 */
export function layoutCircuit(
	sections: NetNode[],
	supplyVoltage: number
): NetworkLayout & { junctions: number[]; railX: number; topY: number; groundY: number } {
	const sink: Sink = { resistors: [], wires: [], polylines: [], dots: [], buses: [] };
	const maxSectionWidth = Math.max(...sections.map(nodeWidth), COL_W);
	const railX = maxSectionWidth / 2 + 72; // left margin fits the Vin label
	const width = railX + maxSectionWidth / 2 + 130; // right margin fits the tap label

	const grandTotal = sections.reduce((s, n) => s + totalResistance(n), 0);
	const junctions: number[] = [];
	const topY = 26;
	let y = topY + 18; // below supply symbol
	sink.wires.push({ x1: railX, y1: topY, x2: railX, y2: y });

	sections.forEach((section, i) => {
		const sectionVolts = grandTotal > 0 ? (totalResistance(section) / grandTotal) * supplyVoltage : 0;
		y = layoutNode(section, railX, y, sectionVolts, `s${i}`, sink);
		if (i < sections.length - 1) {
			const jy = y + 14;
			sink.wires.push({ x1: railX, y1: y, x2: railX, y2: jy + 14 });
			junctions.push(jy);
			y = jy + 14;
		}
	});

	const groundY = y + 16;
	sink.wires.push({ x1: railX, y1: y, x2: railX, y2: groundY });

	return {
		resistors: sink.resistors,
		wires: sink.wires,
		paths: sink.polylines.map(toPathData),
		dots: sink.dots,
		buses: sink.buses,
		width,
		height: groundY + 26,
		junctions,
		railX,
		topY,
		groundY
	};
}

export type BlockLayout = {
	resistors: ResistorGlyph[];
	wires: WireGlyph[];
	paths: string[];
	dots: DotGlyph[];
	buses: BusGlyph[];
	width: number;
	height: number;
	/** Terminal points the caller wires into the surrounding circuit. */
	entry: Point;
	exit: Point;
};

export type HBlockLayout = Omit<BlockLayout, 'resistors'> & { resistors: HResistorGlyph[] };

/**
 * Lay out a standalone tree (no supply/ground) with `volts` across it —
 * building block for shapes that aren't a single vertical rail.
 */
export function layoutNetwork(node: NetNode, volts = 0): BlockLayout {
	const sink: Sink = { resistors: [], wires: [], polylines: [], dots: [], buses: [] };
	const width = nodeWidth(node);
	const height = nodeHeight(node);
	const cx = width / 2;
	layoutNode(node, cx, 0, volts, 'n', sink);
	return {
		resistors: sink.resistors,
		wires: sink.wires,
		paths: sink.polylines.map(toPathData),
		dots: sink.dots,
		buses: sink.buses,
		width,
		height,
		entry: { x: cx, y: 0 },
		exit: { x: cx, y: height }
	};
}

const transposePathData = (d: string): string =>
	d.replace(
		/([ML]) (-?[\d.]+) (-?[\d.]+)/g,
		(_m, cmd: string, x: string, y: string) => `${cmd} ${y} ${x}`
	);

/**
 * Swap axes of a block layout: current then flows left→right instead of
 * top→bottom (horizontal orientation for shapes like the U-pad legs).
 */
export function transposeBlock(block: BlockLayout): HBlockLayout {
	return {
		resistors: block.resistors.map((g) => ({
			id: g.id,
			ref: g.ref,
			orientation: 'horizontal',
			cy: g.cx,
			xLeft: g.yTop,
			xRight: g.yBottom,
			value: g.value,
			volts: g.volts,
			amps: g.amps,
			watts: g.watts
		})),
		wires: block.wires.map((w) => ({ x1: w.y1, y1: w.x1, x2: w.y2, y2: w.x2 })),
		paths: block.paths.map(transposePathData),
		dots: block.dots.map((d) => ({ x: d.y, y: d.x })),
		buses: block.buses.map((b) => ({ id: b.id, x1: b.y1, y1: b.x1, x2: b.y2, y2: b.x2 })),
		width: block.height,
		height: block.width,
		entry: { x: block.entry.y, y: block.entry.x },
		exit: { x: block.exit.y, y: block.exit.x }
	};
}
