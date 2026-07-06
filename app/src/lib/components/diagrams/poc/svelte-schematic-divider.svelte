<script lang="ts">
	// Proof of concept for the recommended diagram engine: plain Svelte
	// components emitting SVG. No renderer library, no layout engine — the
	// divider topology is fixed, so geometry is a handful of constants.
	// Interactivity (hover, click-select, keyboard focus) and theming
	// (currentColor + CSS classes) come from Svelte/DOM for free.

	let {
		supplyVoltage,
		outputVoltage,
		rTopLabel,
		rBotLabel,
		onSelect
	}: {
		supplyVoltage: number;
		outputVoltage: number;
		rTopLabel: string;
		rBotLabel: string;
		onSelect?: (part: 'top' | 'bottom' | null) => void;
	} = $props();

	let hovered = $state<'top' | 'bottom' | null>(null);
	let selected = $state<'top' | 'bottom' | null>(null);

	function select(part: 'top' | 'bottom') {
		selected = selected === part ? null : part;
		onSelect?.(selected);
	}

	function onKey(event: KeyboardEvent, part: 'top' | 'bottom') {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			select(part);
		}
	}

	const RAIL_X = 80;

	/** KiCad-style zigzag resistor body between y0 and y1 on the rail. */
	function zigzag(y0: number, y1: number, teeth = 6, amp = 6): string {
		const lead = 10;
		const top = y0 + lead;
		const bottom = y1 - lead;
		const dy = (bottom - top) / teeth;
		let d = `M ${RAIL_X} ${y0} L ${RAIL_X} ${top}`;
		for (let i = 0; i < teeth; i += 1) {
			const x = RAIL_X + (i % 2 === 0 ? amp : -amp);
			d += ` L ${x} ${top + dy * (i + 0.5)}`;
		}
		d += ` L ${RAIL_X} ${bottom} L ${RAIL_X} ${y1}`;
		return d;
	}

	function partClass(part: 'top' | 'bottom'): string {
		if (selected === part) return 'poc-part poc-selected';
		if (hovered === part) return 'poc-part poc-hovered';
		return 'poc-part';
	}
</script>

<svg
	viewBox="0 0 240 330"
	class="h-auto w-full max-w-60 text-wt-ink"
	role="img"
	aria-label="Voltage divider schematic: {rTopLabel} over {rBotLabel}, {supplyVoltage} volts in, {outputVoltage.toFixed(3)} volts out"
>
	<!-- supply node -->
	<circle cx={RAIL_X} cy="18" r="3.5" fill="none" stroke="currentColor" stroke-width="2" />
	<text x={RAIL_X - 14} y="22" text-anchor="end" class="poc-label">Vin {supplyVoltage}V</text>
	<line x1={RAIL_X} y1="21.5" x2={RAIL_X} y2="45" stroke="currentColor" stroke-width="2" />

	<!-- top resistor -->
	<g
		class={partClass('top')}
		role="button"
		tabindex="0"
		aria-pressed={selected === 'top'}
		onpointerenter={() => (hovered = 'top')}
		onpointerleave={() => (hovered = null)}
		onclick={() => select('top')}
		onkeydown={(e) => onKey(e, 'top')}
	>
		<rect x={RAIL_X - 18} y="50" width="110" height="80" fill="transparent" stroke="none" />
		<path d={zigzag(45, 135)} fill="none" stroke-width="2" stroke-linejoin="round" />
		<text x={RAIL_X + 20} y="94" class="poc-label poc-value">{rTopLabel}</text>
		<title>R_TOP = {rTopLabel}</title>
	</g>

	<!-- output tap -->
	<line x1={RAIL_X} y1="135" x2={RAIL_X} y2="165" stroke="currentColor" stroke-width="2" />
	<circle cx={RAIL_X} cy="165" r="3.5" fill="currentColor" />
	<line x1={RAIL_X} y1="165" x2="170" y2="165" stroke="currentColor" stroke-width="2" />
	<circle cx="176" cy="165" r="4" fill="none" stroke="currentColor" stroke-width="2" />
	<text x="186" y="158" class="poc-label">Vout</text>
	<text x="186" y="174" class="poc-label poc-value">{outputVoltage.toFixed(3)}V</text>
	<line x1={RAIL_X} y1="165" x2={RAIL_X} y2="185" stroke="currentColor" stroke-width="2" />

	<!-- bottom resistor -->
	<g
		class={partClass('bottom')}
		role="button"
		tabindex="0"
		aria-pressed={selected === 'bottom'}
		onpointerenter={() => (hovered = 'bottom')}
		onpointerleave={() => (hovered = null)}
		onclick={() => select('bottom')}
		onkeydown={(e) => onKey(e, 'bottom')}
	>
		<rect x={RAIL_X - 18} y="190" width="110" height="80" fill="transparent" stroke="none" />
		<path d={zigzag(185, 275)} fill="none" stroke-width="2" stroke-linejoin="round" />
		<text x={RAIL_X + 20} y="234" class="poc-label poc-value">{rBotLabel}</text>
		<title>R_BOT = {rBotLabel}</title>
	</g>

	<!-- ground -->
	<line x1={RAIL_X} y1="275" x2={RAIL_X} y2="298" stroke="currentColor" stroke-width="2" />
	<line x1={RAIL_X - 16} y1="298" x2={RAIL_X + 16} y2="298" stroke="currentColor" stroke-width="2" />
	<line x1={RAIL_X - 10} y1="305" x2={RAIL_X + 10} y2="305" stroke="currentColor" stroke-width="2" />
	<line x1={RAIL_X - 4} y1="312" x2={RAIL_X + 4} y2="312" stroke="currentColor" stroke-width="2" />
</svg>

<style>
	.poc-label {
		font: 12px var(--font-mono, ui-monospace, monospace);
		fill: currentColor;
	}
	.poc-value {
		font-weight: 600;
	}
	.poc-part {
		cursor: pointer;
		outline: none;
		stroke: currentColor;
	}
	.poc-part :global(path) {
		transition: stroke 120ms ease;
	}
	.poc-hovered,
	.poc-part:hover,
	.poc-part:focus-visible {
		stroke: var(--wt-color-brand-design, #6d5ae6);
	}
	.poc-hovered .poc-label,
	.poc-part:hover .poc-label,
	.poc-part:focus-visible .poc-label {
		fill: var(--wt-color-brand-design, #6d5ae6);
	}
	.poc-selected {
		stroke: var(--wt-color-brand-ambitious, #e0562c);
	}
	.poc-selected .poc-label {
		fill: var(--wt-color-brand-ambitious, #e0562c);
	}
</style>
