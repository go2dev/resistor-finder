<script lang="ts">
	// Diagram-engine proof of concept (workstream 2). Not linked from the nav —
	// open /app/diagram-poc directly. Left: the recommended engine (Svelte
	// components emitting SVG, hover/click/keyboard interactive, themed via
	// currentColor + wt CSS variables). Right: the current schematic.js render
	// of the same divider for comparison. schematic.js remains the production
	// engine until the build-out is signed off (docs/overhaul-plan.md §2).
	import SvelteSchematicDivider from '$lib/components/diagrams/poc/svelte-schematic-divider.svelte';
	import VoltageDividerDiagram from '$lib/components/diagrams/voltage-divider-diagram.svelte';
	import { formatResistorValue } from '$lib/domain/resistor';
	import type { DividerResult, Network } from '$lib/domain/voltage-divider';

	let supplyVoltage = $state(3.3);
	let rTop = $state(1000);
	let rBot = $state(5100);
	let selectedPart = $state<'top' | 'bottom' | null>(null);

	const outputVoltage = $derived(
		rTop + rBot > 0 ? (rBot / (rTop + rBot)) * supplyVoltage : 0
	);

	function single(value: number): Network {
		return {
			kind: 'single',
			parts: [value],
			total: value,
			label: formatResistorValue(value),
			componentCount: 1
		};
	}

	const legacyResult = $derived<DividerResult>({
		top: single(rTop),
		bottom: single(rBot),
		outputVoltage,
		error: 0,
		totalResistance: rTop + rBot,
		componentCount: 2
	});
</script>

<section class="space-y-6">
	<div class="space-y-1">
		<h2 class="text-xl wt-text-heading tracking-tight">Diagram engine PoC</h2>
		<p class="text-sm text-wt-muted-fg">
			Candidate engine (Svelte-native SVG) next to the current schematic.js render. Hover, click
			or keyboard-focus a resistor on the left — per-component DOM events, no renderer library.
		</p>
	</div>

	<div class="flex flex-wrap items-end gap-4">
		<label class="flex flex-col gap-1 text-sm wt-text-ui">
			Supply (V)
			<input type="number" step="0.1" bind:value={supplyVoltage} class="h-9 w-28 rounded-wt-box wt-shell-inner bg-wt-surface px-2 text-sm text-wt-ink" />
		</label>
		<label class="flex flex-col gap-1 text-sm wt-text-ui">
			R_TOP (Ω)
			<input type="number" step="1" bind:value={rTop} class="h-9 w-28 rounded-wt-box wt-shell-inner bg-wt-surface px-2 text-sm text-wt-ink" />
		</label>
		<label class="flex flex-col gap-1 text-sm wt-text-ui">
			R_BOT (Ω)
			<input type="number" step="1" bind:value={rBot} class="h-9 w-28 rounded-wt-box wt-shell-inner bg-wt-surface px-2 text-sm text-wt-ink" />
		</label>
		<p class="text-sm text-wt-muted-fg">
			Vout = <span class="font-semibold text-wt-ink">{outputVoltage.toFixed(3)}V</span>
			{#if selectedPart}
				· selected: <span class="font-semibold text-wt-ink">{selectedPart === 'top' ? 'R_TOP' : 'R_BOT'}</span>
			{/if}
		</p>
	</div>

	<div class="grid gap-6 md:grid-cols-2">
		<div class="space-y-2 rounded-wt-box wt-shell-inner bg-wt-surface p-4">
			<h3 class="text-sm wt-text-heading">Candidate: Svelte SVG components</h3>
			<p class="text-xs text-wt-muted-fg">
				Reactive labels, hover/selected states, focusable parts, theme via currentColor.
			</p>
			<SvelteSchematicDivider
				{supplyVoltage}
				{outputVoltage}
				rTopLabel={formatResistorValue(rTop)}
				rBotLabel={formatResistorValue(rBot)}
				onSelect={(part) => (selectedPart = part)}
			/>
		</div>
		<div class="space-y-2 rounded-wt-box wt-shell-inner bg-wt-surface p-4">
			<h3 class="text-sm wt-text-heading">Current: schematic.js</h3>
			<p class="text-xs text-wt-muted-fg">
				Legacy engine via the existing adapter (static output, PNG export).
			</p>
			<VoltageDividerDiagram result={legacyResult} {supplyVoltage} targetVoltage={outputVoltage} />
		</div>
	</div>
</section>
