// Diagram engine public surface. Renderers are Svelte components emitting
// SVG; model + layout are pure and unit-tested. See docs/overhaul-plan.md §2
// for the engine decision record.

export {
	componentCount,
	networkToNetNode,
	parallel,
	r,
	series,
	totalResistance,
	type NetNode,
	type ResistorNode
} from './model';
export {
	layoutCircuit,
	layoutNetwork,
	nodeHeight,
	nodeWidth,
	transposeBlock,
	type AnyResistorGlyph,
	type BlockLayout,
	type DotGlyph,
	type HBlockLayout,
	type HResistorGlyph,
	type NetworkLayout,
	type Orientation,
	type ResistorGlyph,
	type WireGlyph
} from './layout';
export { formatAmps, formatWatts, partTooltipLines, type PartElectrical } from './format';
export * from './symbols';
export { default as NetworkSchematic } from './network-schematic.svelte';
export { default as UpadSchematic } from './upad-schematic.svelte';
export { default as ResistorPart } from './resistor-part.svelte';
export { default as PartTooltip } from './part-tooltip.svelte';
