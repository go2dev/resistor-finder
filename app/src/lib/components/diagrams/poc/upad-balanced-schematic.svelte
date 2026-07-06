<script lang="ts">
	// Balanced U-pad drawn in its true shape: horizontal series legs on the
	// signal and return rails, vertical mid shunt between them. Same
	// interactivity model as the network renderer (per-part hover tooltips
	// with live V/I/P from the loop current).
	import { formatResistorValue } from '$lib/domain/resistor';

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

	let hoveredId = $state<string | null>(null);
	let tooltip = $state<{ x: number; y: number; lines: string[] } | null>(null);
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

	function partLines(value: number): string[] {
		const volts = loopCurrent * value;
		return [
			formatResistorValue(value),
			`V across: ${volts.toFixed(3)}V`,
			`I: ${fmtA(loopCurrent)}`,
			`P: ${fmtW(volts * loopCurrent)}`
		];
	}

	function show(id: string, value: number, event: PointerEvent) {
		hoveredId = id;
		const rect = wrapEl?.getBoundingClientRect();
		if (!rect) return;
		tooltip = {
			x: event.clientX - rect.left + 12,
			y: event.clientY - rect.top + 12,
			lines: partLines(value)
		};
	}

	function hide() {
		hoveredId = null;
		tooltip = null;
	}

	// geometry
	const TOP_Y = 44;
	const BOT_Y = 176;
	const MID_X = 236;
	const IN_X = 22;
	const OUT_X = 338;

	/** Horizontal KiCad-style zigzag between x0 and x1 at height y. */
	function hZigzag(x0: number, x1: number, y: number, teeth = 5, amp = 6): string {
		const lead = 9;
		const left = x0 + lead;
		const right = x1 - lead;
		const dx = (right - left) / teeth;
		let d = `M ${x0} ${y} L ${left} ${y}`;
		for (let i = 0; i < teeth; i += 1) {
			d += ` L ${left + dx * (i + 0.5)} ${y + (i % 2 === 0 ? -amp : amp)}`;
		}
		return `${d} L ${right} ${y} L ${x1} ${y}`;
	}

	/**
	 * Vertical resistor spanning y0..y1 at x: a normal-sized zigzag body
	 * centred in the span, with plain lead wires filling the rest — the body
	 * must not stretch with the rail distance.
	 */
	function vZigzag(x: number, y0: number, y1: number, teeth = 5, amp = 6, bodyH = 46): string {
		const mid = (y0 + y1) / 2;
		const top = mid - bodyH / 2;
		const bottom = mid + bodyH / 2;
		const dy = bodyH / teeth;
		let d = `M ${x} ${y0} L ${x} ${top}`;
		for (let i = 0; i < teeth; i += 1) {
			d += ` L ${x + (i % 2 === 0 ? amp : -amp)} ${top + dy * (i + 0.5)}`;
		}
		return `${d} L ${x} ${bottom} L ${x} ${y1}`;
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
		<circle cx={IN_X} cy={TOP_Y} r="4" fill="none" stroke="currentColor" stroke-width="2" />
		<circle cx={IN_X} cy={BOT_Y} r="4" fill="none" stroke="currentColor" stroke-width="2" />
		<text x={IN_X - 4} y={TOP_Y - 12} class="upad-label">Vin+</text>
		<text x={IN_X - 4} y={BOT_Y + 22} class="upad-label">Vin−</text>
		<text x={IN_X + 12} y={(TOP_Y + BOT_Y) / 2 + 4} class="upad-label upad-value">{vin}V</text>

		<!-- top rail: Vin+ → Rleg → node A → out+ -->
		<line x1={IN_X + 4} y1={TOP_Y} x2="80" y2={TOP_Y} stroke="currentColor" stroke-width="2" />
		<g
			class="upad-part"
			class:upad-hovered={hoveredId === 'legTop'}
			role="button"
			tabindex="0"
			aria-label="Top leg {formatResistorValue(rLeg)}"
			onpointerenter={(e) => show('legTop', rLeg, e)}
			onpointermove={(e) => show('legTop', rLeg, e)}
			onpointerleave={hide}
			onfocus={() => (hoveredId = 'legTop')}
			onblur={hide}
		>
			<rect x="80" y={TOP_Y - 14} width="80" height="28" fill="transparent" stroke="none" />
			<path d={hZigzag(80, 160, TOP_Y)} fill="none" stroke-width="2" stroke-linejoin="round" />
			<text x="120" y={TOP_Y - 14} text-anchor="middle" class="upad-label upad-value">
				{formatResistorValue(rLeg)}
			</text>
		</g>
		<line x1="160" y1={TOP_Y} x2={OUT_X - 4} y2={TOP_Y} stroke="currentColor" stroke-width="2" />
		<circle cx={MID_X} cy={TOP_Y} r="3" fill="currentColor" />

		<!-- bottom rail: Vin− → Rleg → node B → out− -->
		<line x1={IN_X + 4} y1={BOT_Y} x2="80" y2={BOT_Y} stroke="currentColor" stroke-width="2" />
		<g
			class="upad-part"
			class:upad-hovered={hoveredId === 'legBot'}
			role="button"
			tabindex="0"
			aria-label="Bottom leg {formatResistorValue(rLeg)}"
			onpointerenter={(e) => show('legBot', rLeg, e)}
			onpointermove={(e) => show('legBot', rLeg, e)}
			onpointerleave={hide}
			onfocus={() => (hoveredId = 'legBot')}
			onblur={hide}
		>
			<rect x="80" y={BOT_Y - 14} width="80" height="28" fill="transparent" stroke="none" />
			<path d={hZigzag(80, 160, BOT_Y)} fill="none" stroke-width="2" stroke-linejoin="round" />
			<text x="120" y={BOT_Y + 24} text-anchor="middle" class="upad-label upad-value">
				{formatResistorValue(rLeg)}
			</text>
		</g>
		<line x1="160" y1={BOT_Y} x2={OUT_X - 4} y2={BOT_Y} stroke="currentColor" stroke-width="2" />
		<circle cx={MID_X} cy={BOT_Y} r="3" fill="currentColor" />

		<!-- mid shunt between the rails -->
		<g
			class="upad-part"
			class:upad-hovered={hoveredId === 'mid'}
			role="button"
			tabindex="0"
			aria-label="Mid shunt {formatResistorValue(rMid)}"
			onpointerenter={(e) => show('mid', rMid, e)}
			onpointermove={(e) => show('mid', rMid, e)}
			onpointerleave={hide}
			onfocus={() => (hoveredId = 'mid')}
			onblur={hide}
		>
			<rect x={MID_X - 14} y={TOP_Y} width="28" height={BOT_Y - TOP_Y} fill="transparent" stroke="none" />
			<path d={vZigzag(MID_X, TOP_Y, BOT_Y)} fill="none" stroke-width="2" stroke-linejoin="round" />
			<text x={MID_X + 14} y={(TOP_Y + BOT_Y) / 2 + 4} class="upad-label upad-value">
				{formatResistorValue(rMid)}
			</text>
		</g>

		<!-- output terminals -->
		<circle cx={OUT_X} cy={TOP_Y} r="4" fill="none" stroke="currentColor" stroke-width="2" />
		<circle cx={OUT_X} cy={BOT_Y} r="4" fill="none" stroke="currentColor" stroke-width="2" />
		<text x={OUT_X - 12} y={TOP_Y - 12} class="upad-label">out+</text>
		<text x={OUT_X - 12} y={BOT_Y + 22} class="upad-label">out−</text>
		<text x={OUT_X + 10} y={(TOP_Y + BOT_Y) / 2 - 6} class="upad-label">Vout</text>
		<text x={OUT_X + 10} y={(TOP_Y + BOT_Y) / 2 + 10} class="upad-label upad-value">
			{voutDiff.toFixed(3)}V
		</text>
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
	.upad-label {
		font: 11px var(--font-mono, ui-monospace, monospace);
		fill: currentColor;
	}
	.upad-value {
		font-weight: 600;
	}
	.upad-part {
		cursor: pointer;
		outline: none;
		stroke: currentColor;
	}
	.upad-part:hover,
	.upad-hovered,
	.upad-part:focus-visible {
		stroke: var(--wt-color-brand-design, #6d5ae6);
	}
	.upad-part:hover .upad-label,
	.upad-hovered .upad-label,
	.upad-part:focus-visible .upad-label {
		fill: var(--wt-color-brand-design, #6d5ae6);
	}
</style>
