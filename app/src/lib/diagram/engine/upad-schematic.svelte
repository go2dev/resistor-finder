<script lang="ts">
	// Balanced U-pad drawn in its true shape: horizontal series legs on the
	// signal and return rails, vertical mid shunt between them. Same
	// interactivity model as the network renderer (per-part hover tooltips
	// with live V/I/P from the loop current).
	import { formatResistorValue } from '$lib/domain/resistor';
	import { partTooltipLines } from './format';
	import type { AnyResistorGlyph, HResistorGlyph, ResistorGlyph } from './layout';
	import PartTooltip from './part-tooltip.svelte';
	import ResistorPart from './resistor-part.svelte';
	import { LABEL_STYLE, STROKE_WIDTH, TERMINAL_RADIUS, VALUE_STYLE } from './symbols';

	let {
		vin,
		rLeg,
		rMid
	}: {
		vin: number;
		rLeg: number;
		rMid: number;
	} = $props();

	const loopCurrent = $derived(2 * rLeg + rMid > 0 ? vin / (2 * rLeg + rMid) : 0);
	const voutDiff = $derived(loopCurrent * rMid);

	// geometry
	const TOP_Y = 44;
	const BOT_Y = 176;
	const MID_X = 236;
	const IN_X = 22;
	const OUT_X = 338;
	const LEG_X0 = 80;
	const LEG_X1 = 160;

	function legGlyph(id: string, cy: number): HResistorGlyph {
		const volts = loopCurrent * rLeg;
		return {
			id,
			orientation: 'horizontal',
			cy,
			xLeft: LEG_X0,
			xRight: LEG_X1,
			value: rLeg,
			volts,
			amps: loopCurrent,
			watts: volts * loopCurrent
		};
	}

	const glyphs = $derived.by(() => {
		const midVolts = loopCurrent * rMid;
		const mid: ResistorGlyph = {
			id: 'mid',
			orientation: 'vertical',
			cx: MID_X,
			yTop: TOP_Y,
			yBottom: BOT_Y,
			value: rMid,
			volts: midVolts,
			amps: loopCurrent,
			watts: midVolts * loopCurrent
		};
		return [
			{ glyph: legGlyph('legTop', TOP_Y), side: 'above' as const, aria: `Top leg ${formatResistorValue(rLeg)}` },
			{ glyph: legGlyph('legBot', BOT_Y), side: 'below' as const, aria: `Bottom leg ${formatResistorValue(rLeg)}` },
			{ glyph: mid, side: 'right' as const, aria: `Mid shunt ${formatResistorValue(rMid)}` }
		];
	});

	let hoveredId = $state<string | null>(null);
	let tooltip = $state<{ x: number; y: number; lines: string[] } | null>(null);
	let wrapEl: HTMLElement | null = $state(null);

	function show(g: AnyResistorGlyph, event: PointerEvent) {
		hoveredId = g.id;
		const rect = wrapEl?.getBoundingClientRect();
		if (!rect) return;
		tooltip = {
			x: event.clientX - rect.left + 12,
			y: event.clientY - rect.top + 12,
			lines: partTooltipLines(g)
		};
	}

	function hide() {
		hoveredId = null;
		tooltip = null;
	}
</script>

<div bind:this={wrapEl} class="relative inline-block w-full max-w-lg">
	<svg
		viewBox="0 0 420 220"
		class="h-auto w-full text-wt-ink"
		role="img"
		aria-label="Balanced U-pad attenuator: {formatResistorValue(rLeg)} legs, {formatResistorValue(rMid)} shunt, {vin} volts in, {voutDiff.toFixed(3)} volts differential out"
	>
		<!-- input terminals -->
		<circle cx={IN_X} cy={TOP_Y} r={TERMINAL_RADIUS} fill="none" stroke="currentColor" stroke-width={STROKE_WIDTH} />
		<circle cx={IN_X} cy={BOT_Y} r={TERMINAL_RADIUS} fill="none" stroke="currentColor" stroke-width={STROKE_WIDTH} />
		<text x={IN_X - 4} y={TOP_Y - 12} fill="currentColor" style={LABEL_STYLE}>Vin+</text>
		<text x={IN_X - 4} y={BOT_Y + 22} fill="currentColor" style={LABEL_STYLE}>Vin−</text>
		<text x={IN_X + 12} y={(TOP_Y + BOT_Y) / 2 + 4} fill="currentColor" style={VALUE_STYLE}>{vin}V</text>

		<!-- rails: Vin± → leg → node → out± -->
		<line x1={IN_X + 4} y1={TOP_Y} x2={LEG_X0} y2={TOP_Y} stroke="currentColor" stroke-width={STROKE_WIDTH} />
		<line x1={LEG_X1} y1={TOP_Y} x2={OUT_X - 4} y2={TOP_Y} stroke="currentColor" stroke-width={STROKE_WIDTH} />
		<line x1={IN_X + 4} y1={BOT_Y} x2={LEG_X0} y2={BOT_Y} stroke="currentColor" stroke-width={STROKE_WIDTH} />
		<line x1={LEG_X1} y1={BOT_Y} x2={OUT_X - 4} y2={BOT_Y} stroke="currentColor" stroke-width={STROKE_WIDTH} />
		<circle cx={MID_X} cy={TOP_Y} r="3" fill="currentColor" />
		<circle cx={MID_X} cy={BOT_Y} r="3" fill="currentColor" />

		{#each glyphs as { glyph, side, aria } (glyph.id)}
			<ResistorPart
				{glyph}
				labelLines={[formatResistorValue(glyph.value)]}
				ariaLabel={aria}
				labelSide={side}
				hovered={hoveredId === glyph.id}
				onPointer={show}
				onLeave={hide}
				onFocus={(g) => (hoveredId = g.id)}
				onBlur={hide}
			/>
		{/each}

		<!-- output terminals -->
		<circle cx={OUT_X} cy={TOP_Y} r={TERMINAL_RADIUS} fill="none" stroke="currentColor" stroke-width={STROKE_WIDTH} />
		<circle cx={OUT_X} cy={BOT_Y} r={TERMINAL_RADIUS} fill="none" stroke="currentColor" stroke-width={STROKE_WIDTH} />
		<text x={OUT_X - 12} y={TOP_Y - 12} fill="currentColor" style={LABEL_STYLE}>out+</text>
		<text x={OUT_X - 12} y={BOT_Y + 22} fill="currentColor" style={LABEL_STYLE}>out−</text>
		<text x={OUT_X + 10} y={(TOP_Y + BOT_Y) / 2 - 6} fill="currentColor" style={LABEL_STYLE}>Vout</text>
		<text x={OUT_X + 10} y={(TOP_Y + BOT_Y) / 2 + 10} fill="currentColor" style={VALUE_STYLE}>
			{voutDiff.toFixed(3)}V
		</text>
	</svg>

	{#if tooltip}
		<PartTooltip x={tooltip.x} y={tooltip.y} lines={tooltip.lines} />
	{/if}
</div>
