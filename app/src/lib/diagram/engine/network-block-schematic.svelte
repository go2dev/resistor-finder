<script lang="ts">
	// Standalone two-terminal network (no supply/ground): the target-resistance
	// result shape. Mirrors legacy renderNetwork composition — network centred,
	// accent-coloured measurement bracket with the total label on the right.
	import { formatResistorValue } from '$lib/domain/resistor';
	import { layoutNetwork, type AnyResistorGlyph, type ResistorGlyph } from './layout';
	import type { NetNode } from './model';
	import PartTooltip from './part-tooltip.svelte';
	import ResistorPart from './resistor-part.svelte';
	import { LABEL_STYLE, STROKE_WIDTH } from './symbols';

	let {
		network,
		measurementLabel = '',
		partTooltip
	}: {
		network: NetNode;
		/** Total-resistance label on the measurement bracket ('' hides it). */
		measurementLabel?: string;
		/** Override tooltip content (glyph ids are `n.<child indices>`). */
		partTooltip?: (glyph: AnyResistorGlyph) => { lines: string[]; class?: string };
	} = $props();

	const PAD = 18;
	const MEASURE_GAP = 18;
	const TICK = 12;
	const LABEL_PAD = 6;
	const CHAR_W = 6.6;

	const block = $derived(layoutNetwork(network));
	const measureSpace = $derived(
		measurementLabel ? MEASURE_GAP + TICK + LABEL_PAD + measurementLabel.length * CHAR_W : 0
	);
	const width = $derived(Math.max(280, block.width + PAD * 2 + measureSpace));
	const height = $derived(Math.max(180, block.height + PAD * 2));
	const offsetX = $derived((width - measureSpace) / 2 - block.width / 2);
	const offsetY = $derived((height - block.height) / 2);
	const bracketX = $derived(offsetX + block.width + MEASURE_GAP);

	let tooltip = $state<{ x: number; y: number; lines: string[]; class?: string } | null>(null);
	let hoveredId = $state<string | null>(null);
	let wrapEl: HTMLElement | null = $state(null);
	let svgEl: SVGSVGElement | null = $state(null);

	function glyphTooltip(g: AnyResistorGlyph): { lines: string[]; class?: string } {
		return partTooltip ? partTooltip(g) : { lines: [formatResistorValue(g.value)] };
	}

	function showTooltip(g: AnyResistorGlyph, event: PointerEvent) {
		hoveredId = g.id;
		const rect = wrapEl?.getBoundingClientRect();
		if (!rect) return;
		tooltip = {
			x: event.clientX - rect.left + 12,
			y: event.clientY - rect.top + 12,
			...glyphTooltip(g)
		};
	}

	function showTooltipAtGlyph(g: AnyResistorGlyph) {
		hoveredId = g.id;
		if (!svgEl || !wrapEl || g.orientation !== 'vertical') return;
		const scale = svgEl.clientWidth / width;
		tooltip = {
			x: (offsetX + g.cx + 16) * scale,
			y: (offsetY + (g.yTop + g.yBottom) / 2) * scale,
			...glyphTooltip(g)
		};
	}

	function hideTooltip() {
		hoveredId = null;
		tooltip = null;
	}

	function glyphLabelLines(g: ResistorGlyph): string[] {
		const value = formatResistorValue(g.value);
		return g.ref ? [g.ref, value] : [value];
	}
</script>

<div bind:this={wrapEl} class="relative inline-block w-full max-w-md">
	<svg
		bind:this={svgEl}
		viewBox="0 0 {width} {height}"
		class="h-auto w-full text-wt-ink"
		role="img"
		aria-label="Resistor network{measurementLabel ? `, total ${measurementLabel}` : ''}"
	>
		<g transform="translate({offsetX} {offsetY})">
			{#each block.wires as w}
				<line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="currentColor" stroke-width={STROKE_WIDTH} />
			{/each}
			{#each block.paths as d}
				<path {d} fill="none" stroke="currentColor" stroke-width={STROKE_WIDTH} stroke-linejoin="miter" />
			{/each}
			{#each block.dots as d}
				<circle cx={d.x} cy={d.y} r="3" fill="currentColor" />
			{/each}
			{#each block.resistors as g (g.id)}
				<ResistorPart
					glyph={g}
					labelLines={glyphLabelLines(g)}
					ariaLabel={formatResistorValue(g.value)}
					hovered={hoveredId === g.id}
					onPointer={showTooltip}
					onLeave={hideTooltip}
					onFocus={showTooltipAtGlyph}
					onBlur={hideTooltip}
				/>
			{/each}
		</g>

		{#if measurementLabel}
			<!-- inline accent styles (not classes) so the bracket survives SVG
			     serialization for PNG export; var() falls back outside the app -->
			{@const accentStroke = `stroke: var(--wt-color-brand-design, #6d5ae6);`}
			<g>
				<line x1={bracketX} y1={offsetY} x2={bracketX} y2={offsetY + block.height} stroke-width={STROKE_WIDTH} style={accentStroke} />
				<line x1={bracketX} y1={offsetY} x2={bracketX - TICK} y2={offsetY} stroke-width={STROKE_WIDTH} style={accentStroke} />
				<line
					x1={bracketX}
					y1={offsetY + block.height}
					x2={bracketX - TICK}
					y2={offsetY + block.height}
					stroke-width={STROKE_WIDTH}
					style={accentStroke}
				/>
				<text
					x={bracketX + LABEL_PAD}
					y={offsetY + block.height / 2 + 4}
					style="{LABEL_STYLE}fill: var(--wt-color-brand-design, #6d5ae6);"
				>
					{measurementLabel}
				</text>
			</g>
		{/if}
	</svg>

	{#if tooltip}
		<PartTooltip x={tooltip.x} y={tooltip.y} lines={tooltip.lines} class={tooltip.class ?? ''} />
	{/if}
</div>

