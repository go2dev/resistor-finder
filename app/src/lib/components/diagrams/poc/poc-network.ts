// PoC network model + pure layout for the candidate Svelte SVG engine.
// Proves the two things the fixed divider PoC didn't: arbitrary nested
// series/parallel trees, and electrical annotation (volts/watts per part)
// derivable from the same tree — which is what powers rich mouseovers.

export type NetNode =
	| { kind: 'r'; value: number }
	| { kind: 'series' | 'parallel'; children: NetNode[] };

export const r = (value: number): NetNode => ({ kind: 'r', value });
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

// --- layout ------------------------------------------------------------

const RES_H = 64; // one resistor cell (leads + zigzag)
const COL_W = 64; // horizontal room per parallel branch (zigzag + value label)
const BUS_PAD = 10; // vertical room for parallel bus bars

export type ResistorGlyph = {
	id: string;
	cx: number;
	yTop: number;
	yBottom: number;
	value: number;
	/** Voltage across this resistor for the annotated supply */
	volts: number;
	watts: number;
	amps: number;
};

export type WireGlyph = { x1: number; y1: number; x2: number; y2: number };
export type DotGlyph = { x: number; y: number };

export type NetworkLayout = {
	resistors: ResistorGlyph[];
	wires: WireGlyph[];
	/** Multi-segment wire runs (SVG path data) — corners render as proper mitred joins */
	paths: string[];
	dots: DotGlyph[];
	width: number;
	height: number;
};

export function nodeWidth(node: NetNode): number {
	if (node.kind === 'r') return COL_W;
	if (node.kind === 'series') return Math.max(...node.children.map(nodeWidth));
	return node.children.reduce((sum, c) => sum + nodeWidth(c), 0);
}

export function nodeHeight(node: NetNode): number {
	if (node.kind === 'r') return RES_H;
	if (node.kind === 'series') return node.children.reduce((sum, c) => sum + nodeHeight(c), 0);
	return 2 * BUS_PAD + Math.max(...node.children.map(nodeHeight));
}

type Sink = Pick<NetworkLayout, 'resistors' | 'wires' | 'paths' | 'dots'>;

/**
 * Lay a node out on a vertical rail centred at cx, starting at y.
 * `volts` is the voltage across the whole node; series children split it by
 * resistance ratio, parallel children all see it — from which each leaf gets
 * V, I and P for tooltips.
 */
function layoutNode(node: NetNode, cx: number, y: number, volts: number, idPrefix: string, sink: Sink): number {
	if (node.kind === 'r') {
		const yBottom = y + RES_H;
		sink.resistors.push({
			id: idPrefix,
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

	node.children.forEach((child, i) => {
		const bx = branchXs[i];
		const childHeight = nodeHeight(child);
		const childTop = busTop + (innerHeight - childHeight) / 2;
		const childBottom = childTop + childHeight;
		// one path per branch: along the bus then turn into the branch —
		// corners are real path joins, not two butt-capped lines
		sink.paths.push(`M ${cx} ${busTop} L ${bx} ${busTop} L ${bx} ${childTop}`);
		layoutNode(child, bx, childTop, volts, `${idPrefix}.${i}`, sink);
		sink.paths.push(`M ${bx} ${childBottom} L ${bx} ${busBottom} L ${cx} ${busBottom}`);
	});

	return y + height;
}

export type SectionLayout = {
	/** y of the junction below this section (tap candidates) */
	junctionY: number;
};

/**
 * Full vertical circuit: supply rail at top, sections stacked with junction
 * dots between them, ground at the bottom. Returns glyphs plus the junction
 * y-positions so callers can attach tap wires/labels.
 */
export function layoutCircuit(
	sections: NetNode[],
	supplyVoltage: number
): NetworkLayout & { junctions: number[]; railX: number; topY: number; groundY: number } {
	const sink: Sink = { resistors: [], wires: [], paths: [], dots: [] };
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

	return { ...sink, width, height: groundY + 26, junctions, railX, topY, groundY };
}
