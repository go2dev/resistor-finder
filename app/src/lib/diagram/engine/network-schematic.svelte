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
		showTap = true,
		caption,
		tapVoltage,
		tapLoad,
		partTooltip,
		onPartClick,
		onInsertSeries,
		busTooltip
	}: {
		supplyVoltage: number;
		sections: NetNode[];
		/** Junction (0-based, between section i and i+1) the tap wire attaches to. */
		tapAfterIndex?: number;
		tapLabel?: string;
		/** Defaults to `Vin {supplyVoltage}V`. */
		supplyLabel?: string;
		showTap?: boolean;
		/** Muted note in the top-left corner (e.g. topology description). */
		caption?: string;
		/** Display value for the tap voltage; defaults to the unloaded tree value. */
		tapVoltage?: number;
		/** Load impedance drawn from the tap to ground (L-pad Z_load notation). */
		tapLoad?: { label: string; value?: string };
		/** Override the default V/I/P tooltip (lines + optional extra class). */
		partTooltip?: (glyph: AnyResistorGlyph) => { lines: string[]; class?: string };
		/** Click / Enter / Space on a resistor (glyph id encodes the tree path). */
		onPartClick?: (id: string) => void;
		/** When set, renders insert-series strips at each resistor's leads. */
		onInsertSeries?: (id: string, where: 'above' | 'below') => void;
		/** Hover tooltip for parallel bus bars (id is the parallel node's id). */
		busTooltip?: (id: string) => string[] | null;
	} = $props();

	const layout = $derived(layoutCircuit(sections, supplyVoltage));
	const supplyText = $derived(supplyLabel ?? `Vin ${supplyVoltage}V`);

	const computedTapVoltage = $derived.by(() => {
		const grand = sections.reduce((s, n) => s + totalResistance(n), 0);
		if (grand <= 0) return 0;
		const below = sections.slice(tapAfterIndex + 1).reduce((s, n) => s + totalResistance(n), 0);
		return (below / grand) * supplyVoltage;
	});
	const shownTapVoltage = $derived(tapVoltage ?? computedTapVoltage);

	let tooltip = $state<{ x: number; y: number; lines: string[]; class?: string } | null>(null);
	let hoveredId = $state<string | null>(null);
	let wrapEl: HTMLElement | null = $state(null);
	let svgEl: SVGSVGElement | null = $state(null);

	function glyphLabelLines(g: ResistorGlyph): string[] {
		const value = formatResistorValue(g.value);
		return g.ref ? [g.ref, value] : [value];
	}

	function glyphTooltip(g: AnyResistorGlyph): { lines: string[]; class?: string } {
		return partTooltip ? partTooltip(g) : { lines: partTooltipLines(g) };
	}

	function cursorPos(event: PointerEvent): { x: number; y: number } | null {
		const rect = wrapEl?.getBoundingClientRect();
		if (!rect) return null;
		return { x: event.clientX - rect.left + 12, y: event.clientY - rect.top + 12 };
	}

	function showTooltip(g: AnyResistorGlyph, event: PointerEvent) {
		hoveredId = g.id;
		const pos = cursorPos(event);
		if (!pos) return;
		tooltip = { ...pos, ...glyphTooltip(g) };
	}

	function showTooltipAtGlyph(g: AnyResistorGlyph) {
		hoveredId = g.id;
		if (!svgEl || !wrapEl || g.orientation !== 'vertical') return;
		const scale = svgEl.clientWidth / layout.width;
		tooltip = {
			x: (g.cx + 16) * scale,
			y: ((g.yTop + g.yBottom) / 2) * scale,
			...glyphTooltip(g)
		};
	}

	function showBusTooltip(id: string, event: PointerEvent) {
		const lines = busTooltip?.(id);
		const pos = cursorPos(event);
		if (!lines || !pos) return;
		tooltip = { ...pos, lines };
	}

	function hideTooltip() {
		hoveredId = null;
		tooltip = null;
	}

	const STRIP_HALF_H = 5;
	const STRIP_HALF_W = 22;
</script>

<div bind:this={wrapEl} class="relative inline-block w-full max-w-md">
	<svg
		bind:this={svgEl}
		viewBox="0 0 {layout.width} {layout.height}"
		class="h-auto w-full text-wt-ink"
		role="img"
		aria-label="Schematic: {sections.length} sections, {supplyVoltage}V supply, {tapLabel} = {shownTapVoltage.toFixed(3)}V"
	>
		{#if caption}
			<text x="8" y="14" fill="currentColor" opacity="0.7" style={LABEL_STYLE}>{caption}</text>
		{/if}
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
			{#if tapLoad}
				{@const loadX = layout.width - 90}
				{@const boxTop = jy + 10}
				{@const boxH = 35}
				<line x1={layout.railX} y1={jy} x2={loadX} y2={jy} stroke="currentColor" stroke-width={STROKE_WIDTH} />
				<text x={loadX - 8} y={jy - 6} text-anchor="end" fill="currentColor" style={VALUE_STYLE}>
					{tapLabel} {shownTapVoltage.toFixed(3)}V
				</text>
				<line x1={loadX} y1={jy} x2={loadX} y2={boxTop} stroke="currentColor" stroke-width={STROKE_WIDTH} />
				<rect
					x={loadX - 14}
					y={boxTop}
					width="28"
					height={boxH}
					fill="none"
					stroke="currentColor"
					stroke-width={STROKE_WIDTH}
				/>
				<text x={loadX} y={boxTop + 14} text-anchor="middle" fill="currentColor" style={LABEL_STYLE}>
					{tapLoad.label}
				</text>
				{#if tapLoad.value}
					<text
						x={loadX}
						y={boxTop + boxH - 5}
						text-anchor="middle"
						fill="currentColor"
						style="{LABEL_STYLE}font-size:9px;"
					>
						{tapLoad.value}
					</text>
				{/if}
				<line x1={loadX} y1={boxTop + boxH} x2={loadX} y2={layout.groundY} stroke="currentColor" stroke-width={STROKE_WIDTH} />
				<line x1={loadX} y1={layout.groundY} x2={layout.railX} y2={layout.groundY} stroke="currentColor" stroke-width={STROKE_WIDTH} />
			{:else}
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
					{shownTapVoltage.toFixed(3)}V
				</text>
			{/if}
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
				onActivate={onPartClick ? (glyph) => onPartClick(glyph.id) : undefined}
			/>
		{/each}

		<!-- insert-series strips (interactive editors only) -->
		{#if onInsertSeries}
			{#each layout.resistors as g (`strip-${g.id}`)}
				{#each [{ where: 'above' as const, y: g.yTop }, { where: 'below' as const, y: g.yBottom }] as strip (strip.where)}
					<rect
						class="engine-strip"
						role="button"
						tabindex="0"
						aria-label="Insert resistor in series {strip.where} {formatResistorValue(g.value)}"
						x={g.cx - STRIP_HALF_W}
						y={strip.y - STRIP_HALF_H}
						width={2 * STRIP_HALF_W}
						height={2 * STRIP_HALF_H}
						onclick={() => onInsertSeries(g.id, strip.where)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onInsertSeries(g.id, strip.where);
							}
						}}
					/>
				{/each}
			{/each}
		{/if}

		<!-- parallel bus hover targets -->
		{#if busTooltip}
			{#each layout.buses as bus, i (`${bus.id}-${i}`)}
				<rect
					class="engine-bus-hit"
					role="img"
					aria-label="Parallel group bus"
					x={Math.min(bus.x1, bus.x2) - 2}
					y={Math.min(bus.y1, bus.y2) - 5}
					width={Math.abs(bus.x2 - bus.x1) + 4}
					height={Math.abs(bus.y2 - bus.y1) + 10}
					onpointerenter={(e) => showBusTooltip(bus.id, e)}
					onpointermove={(e) => showBusTooltip(bus.id, e)}
					onpointerleave={hideTooltip}
				/>
			{/each}
		{/if}

		<!-- ground -->
		<path
			d={groundPath(layout.railX, layout.groundY)}
			fill="none"
			stroke="currentColor"
			stroke-width={STROKE_WIDTH}
		/>
	</svg>

	{#if tooltip}
		<PartTooltip x={tooltip.x} y={tooltip.y} lines={tooltip.lines} class={tooltip.class ?? ''} />
	{/if}
</div>

<style>
	.engine-strip {
		fill: transparent;
		stroke: none;
		cursor: row-resize;
		outline: none;
	}
	.engine-strip:hover,
	.engine-strip:focus-visible {
		fill: var(--wt-color-brand-design, #6d5ae6);
		opacity: 0.18;
	}
	.engine-bus-hit {
		fill: transparent;
		stroke: none;
		cursor: help;
	}
</style>
