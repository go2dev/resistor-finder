<script lang="ts">
	// Generalized PoC renderer: any stack of series/parallel trees on a
	// vertical rail (divider = 2 sections, U-pad = 3), every resistor
	// individually hoverable/focusable with a live volts/amps/watts tooltip.
	import { formatResistorValue } from '$lib/domain/resistor';
	import {
		layoutCircuit,
		totalResistance,
		type NetNode,
		type ResistorGlyph
	} from './poc-network';

	let {
		supplyVoltage,
		sections,
		tapAfterIndex = 0,
		tapLabel = 'Vout'
	}: {
		supplyVoltage: number;
		sections: NetNode[];
		tapAfterIndex?: number;
		tapLabel?: string;
	} = $props();

	const layout = $derived(layoutCircuit(sections, supplyVoltage));

	const tapVoltage = $derived.by(() => {
		const grand = sections.reduce((s, n) => s + totalResistance(n), 0);
		if (grand <= 0) return 0;
		const below = sections.slice(tapAfterIndex + 1).reduce((s, n) => s + totalResistance(n), 0);
		return (below / grand) * supplyVoltage;
	});

	let tooltip = $state<{ x: number; y: number; lines: string[] } | null>(null);
	let hoveredId = $state<string | null>(null);
	let wrapEl: HTMLElement | null = $state(null);

	function fmtW(watts: number): string {
		if (watts >= 1) return `${watts.toFixed(2)}W`;
		if (watts >= 0.001) return `${(watts * 1000).toFixed(1)}mW`;
		return `${(watts * 1_000_000).toFixed(1)}µW`;
	}

	function fmtA(amps: number): string {
		if (amps >= 1) return `${amps.toFixed(2)}A`;
		if (amps >= 0.001) return `${(amps * 1000).toFixed(2)}mA`;
		return `${(amps * 1_000_000).toFixed(1)}µA`;
	}

	function glyphLines(g: ResistorGlyph): string[] {
		return [
			formatResistorValue(g.value),
			`V across: ${g.volts.toFixed(3)}V`,
			`I: ${fmtA(g.amps)}`,
			`P: ${fmtW(g.watts)}`
		];
	}

	function showTooltip(g: ResistorGlyph, event: PointerEvent) {
		hoveredId = g.id;
		const rect = wrapEl?.getBoundingClientRect();
		if (!rect) return;
		tooltip = {
			x: event.clientX - rect.left + 12,
			y: event.clientY - rect.top + 12,
			lines: glyphLines(g)
		};
	}

	function showTooltipAtGlyph(g: ResistorGlyph, svg: SVGSVGElement | null) {
		hoveredId = g.id;
		if (!svg || !wrapEl) return;
		const scale = svg.clientWidth / layout.width;
		tooltip = {
			x: (g.cx + 16) * scale,
			y: ((g.yTop + g.yBottom) / 2) * scale,
			lines: glyphLines(g)
		};
	}

	function hideTooltip() {
		hoveredId = null;
		tooltip = null;
	}

	let svgEl: SVGSVGElement | null = $state(null);

	/** KiCad-style zigzag between the glyph's lead ends. */
	function zigzagPath(g: ResistorGlyph, teeth = 5, amp = 6): string {
		const lead = 9;
		const top = g.yTop + lead;
		const bottom = g.yBottom - lead;
		const dy = (bottom - top) / teeth;
		let d = `M ${g.cx} ${g.yTop} L ${g.cx} ${top}`;
		for (let i = 0; i < teeth; i += 1) {
			d += ` L ${g.cx + (i % 2 === 0 ? amp : -amp)} ${top + dy * (i + 0.5)}`;
		}
		return `${d} L ${g.cx} ${bottom} L ${g.cx} ${g.yBottom}`;
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
		<circle cx={layout.railX} cy={layout.topY - 4} r="3.5" fill="none" stroke="currentColor" stroke-width="2" />
		<text x={layout.railX - 12} y={layout.topY} text-anchor="end" class="net-label">
			Vin {supplyVoltage}V
		</text>

		<!-- wires and junction dots -->
		{#each layout.wires as w}
			<line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="currentColor" stroke-width="2" />
		{/each}
		{#each layout.paths as d}
			<path {d} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" />
		{/each}
		{#each layout.dots as d}
			<circle cx={d.x} cy={d.y} r="3" fill="currentColor" />
		{/each}

		<!-- tap -->
		{#if layout.junctions[tapAfterIndex] != null}
			{@const jy = layout.junctions[tapAfterIndex]}
			<circle cx={layout.railX} cy={jy} r="3.5" fill="currentColor" />
			<line x1={layout.railX} y1={jy} x2={layout.width - 62} y2={jy} stroke="currentColor" stroke-width="2" />
			<circle cx={layout.width - 56} cy={jy} r="4" fill="none" stroke="currentColor" stroke-width="2" />
			<text x={layout.width - 48} y={jy - 4} class="net-label">{tapLabel}</text>
			<text x={layout.width - 48} y={jy + 12} class="net-label net-value">{tapVoltage.toFixed(3)}V</text>
		{/if}

		<!-- resistors -->
		{#each layout.resistors as g (g.id)}
			<g
				class="net-part"
				class:net-hovered={hoveredId === g.id}
				role="button"
				tabindex="0"
				aria-label="{formatResistorValue(g.value)}, {g.volts.toFixed(3)} volts across"
				onpointerenter={(e) => showTooltip(g, e)}
				onpointermove={(e) => showTooltip(g, e)}
				onpointerleave={hideTooltip}
				onfocus={() => showTooltipAtGlyph(g, svgEl)}
				onblur={hideTooltip}
			>
				<rect x={g.cx - 14} y={g.yTop} width="28" height={g.yBottom - g.yTop} fill="transparent" stroke="none" />
				<path d={zigzagPath(g)} fill="none" stroke-width="2" stroke-linejoin="round" />
				<text x={g.cx + 13} y={(g.yTop + g.yBottom) / 2 + 4} class="net-label net-value">
					{formatResistorValue(g.value)}
				</text>
			</g>
		{/each}

		<!-- ground -->
		<line x1={layout.railX - 14} y1={layout.groundY} x2={layout.railX + 14} y2={layout.groundY} stroke="currentColor" stroke-width="2" />
		<line x1={layout.railX - 9} y1={layout.groundY + 6} x2={layout.railX + 9} y2={layout.groundY + 6} stroke="currentColor" stroke-width="2" />
		<line x1={layout.railX - 4} y1={layout.groundY + 12} x2={layout.railX + 4} y2={layout.groundY + 12} stroke="currentColor" stroke-width="2" />
	</svg>

	{#if tooltip}
		<div
			class="pointer-events-none absolute z-20 rounded-md border border-wt-border bg-wt-surface px-2.5 py-1.5 text-[11px] leading-4 whitespace-pre text-wt-ink shadow"
			style="left: {tooltip.x}px; top: {tooltip.y}px;"
		>
			{tooltip.lines.join('\n')}
		</div>
	{/if}
</div>

<style>
	.net-label {
		font: 11px var(--font-mono, ui-monospace, monospace);
		fill: currentColor;
	}
	.net-value {
		font-weight: 600;
	}
	.net-part {
		cursor: pointer;
		outline: none;
		stroke: currentColor;
	}
	.net-part:hover,
	.net-hovered,
	.net-part:focus-visible {
		stroke: var(--wt-color-brand-design, #6d5ae6);
	}
	.net-part:hover .net-label,
	.net-hovered .net-label,
	.net-part:focus-visible .net-label {
		fill: var(--wt-color-brand-design, #6d5ae6);
	}
</style>
