<script lang="ts">
	// Vertical-rail circuit renderer: any stack of series/parallel trees
	// (divider = 2 sections, U-pad = 3), every resistor hoverable/focusable
	// with a live volts/amps/watts tooltip derived from the same tree.
	import { formatResistorValue } from '$lib/domain/resistor';
	import { partTooltipLines } from './format';
	import { layoutCircuit, type AnyResistorGlyph, type ResistorGlyph } from './layout';
	import { totalResistance, type NetNode } from './model';
	import PartTooltip from './part-tooltip.svelte';
	import ResistorPart from './resistor-part.svelte';
	import {
		groundPath,
		LABEL_STYLE,
		STROKE_WIDTH,
		SUPPLY_RADIUS,
		TERMINAL_RADIUS,
		VALUE_STYLE
	} from './symbols';

	let {
		supplyVoltage,
		sections,
		tapAfterIndex = 0,
		tapLabel = 'Vout',
		supplyLabel,
		showTap = true
	}: {
		supplyVoltage: number;
		sections: NetNode[];
		/** Junction (0-based, between section i and i+1) the tap wire attaches to. */
		tapAfterIndex?: number;
		tapLabel?: string;
		/** Defaults to `Vin {supplyVoltage}V`. */
		supplyLabel?: string;
		showTap?: boolean;
	} = $props();

	const layout = $derived(layoutCircuit(sections, supplyVoltage));
	const supplyText = $derived(supplyLabel ?? `Vin ${supplyVoltage}V`);

	const tapVoltage = $derived.by(() => {
		const grand = sections.reduce((s, n) => s + totalResistance(n), 0);
		if (grand <= 0) return 0;
		const below = sections.slice(tapAfterIndex + 1).reduce((s, n) => s + totalResistance(n), 0);
		return (below / grand) * supplyVoltage;
	});

	let tooltip = $state<{ x: number; y: number; lines: string[] } | null>(null);
	let hoveredId = $state<string | null>(null);
	let wrapEl: HTMLElement | null = $state(null);
	let svgEl: SVGSVGElement | null = $state(null);

	function glyphLabelLines(g: ResistorGlyph): string[] {
		const value = formatResistorValue(g.value);
		return g.ref ? [g.ref, value] : [value];
	}

	function showTooltip(g: AnyResistorGlyph, event: PointerEvent) {
		hoveredId = g.id;
		const rect = wrapEl?.getBoundingClientRect();
		if (!rect) return;
		tooltip = {
			x: event.clientX - rect.left + 12,
			y: event.clientY - rect.top + 12,
			lines: partTooltipLines(g)
		};
	}

	function showTooltipAtGlyph(g: AnyResistorGlyph) {
		hoveredId = g.id;
		if (!svgEl || !wrapEl || g.orientation !== 'vertical') return;
		const scale = svgEl.clientWidth / layout.width;
		tooltip = {
			x: (g.cx + 16) * scale,
			y: ((g.yTop + g.yBottom) / 2) * scale,
			lines: partTooltipLines(g)
		};
	}

	function hideTooltip() {
		hoveredId = null;
		tooltip = null;
	}
</script>

<div bind:this={wrapEl} class="relative inline-block w-full max-w-md">
	<svg
		bind:this={svgEl}
		viewBox="0 0 {layout.width} {layout.height}"
		class="h-auto w-full text-wt-ink"
		role="img"
		aria-label="Schematic: {sections.length} sections, {supplyVoltage}V supply, {tapLabel} = {tapVoltage.toFixed(3)}V"
	>
		<!-- supply -->
		<circle
			cx={layout.railX}
			cy={layout.topY - 4}
			r={SUPPLY_RADIUS}
			fill="none"
			stroke="currentColor"
			stroke-width={STROKE_WIDTH}
		/>
		<text
			x={layout.railX - 12}
			y={layout.topY}
			text-anchor="end"
			fill="currentColor"
			style={LABEL_STYLE}
		>
			{supplyText}
		</text>

		<!-- wires and junction dots -->
		{#each layout.wires as w}
			<line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="currentColor" stroke-width={STROKE_WIDTH} />
		{/each}
		{#each layout.paths as d}
			<path {d} fill="none" stroke="currentColor" stroke-width={STROKE_WIDTH} stroke-linejoin="miter" />
		{/each}
		{#each layout.dots as d}
			<circle cx={d.x} cy={d.y} r="3" fill="currentColor" />
		{/each}

		<!-- tap -->
		{#if showTap && layout.junctions[tapAfterIndex] != null}
			{@const jy = layout.junctions[tapAfterIndex]}
			<circle cx={layout.railX} cy={jy} r="3.5" fill="currentColor" />
			<line
				x1={layout.railX}
				y1={jy}
				x2={layout.width - 62}
				y2={jy}
				stroke="currentColor"
				stroke-width={STROKE_WIDTH}
			/>
			<circle
				cx={layout.width - 56}
				cy={jy}
				r={TERMINAL_RADIUS}
				fill="none"
				stroke="currentColor"
				stroke-width={STROKE_WIDTH}
			/>
			<text x={layout.width - 48} y={jy - 4} fill="currentColor" style={LABEL_STYLE}>{tapLabel}</text>
			<text x={layout.width - 48} y={jy + 12} fill="currentColor" style={VALUE_STYLE}>
				{tapVoltage.toFixed(3)}V
			</text>
		{/if}

		<!-- resistors -->
		{#each layout.resistors as g (g.id)}
			<ResistorPart
				glyph={g}
				labelLines={glyphLabelLines(g)}
				ariaLabel="{g.ref ? `${g.ref}, ` : ''}{formatResistorValue(g.value)}, {g.volts.toFixed(3)} volts across"
				hovered={hoveredId === g.id}
				onPointer={showTooltip}
				onLeave={hideTooltip}
				onFocus={showTooltipAtGlyph}
				onBlur={hideTooltip}
			/>
		{/each}

		<!-- ground -->
		<path
			d={groundPath(layout.railX, layout.groundY)}
			fill="none"
			stroke="currentColor"
			stroke-width={STROKE_WIDTH}
		/>
	</svg>

	{#if tooltip}
		<PartTooltip x={tooltip.x} y={tooltip.y} lines={tooltip.lines} />
	{/if}
</div>
