<script lang="ts">
	// Diagram-engine proof of concept (workstream 2). Not linked from the nav —
	// open /app/diagram-poc directly. Left: the recommended engine (Svelte
	// components emitting SVG, hover/click/keyboard interactive, themed via
	// currentColor + wt CSS variables). Right: the current schematic.js render
	// of the same divider for comparison. schematic.js remains the production
	// engine until the build-out is signed off (docs/overhaul-plan.md §2).
	import NetworkSchematic from '$lib/components/diagrams/poc/network-schematic.svelte';
	import UpadBalancedSchematic from '$lib/components/diagrams/poc/upad-balanced-schematic.svelte';
	import SvelteSchematicDivider from '$lib/components/diagrams/poc/svelte-schematic-divider.svelte';
	import VoltageDividerDiagram from '$lib/components/diagrams/voltage-divider-diagram.svelte';
	import { parallel, r, series, type NetNode } from '$lib/components/diagrams/poc/poc-network';
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

	// Arbitrary-network demos: nested series/parallel trees the legacy
	// renderCustom (flat "a,b,type" strings) cannot express.
	const networkPresets: { id: string; label: string; sections: NetNode[] }[] = [
		{ id: 'simple', label: 'Simple pair — 1k / 5.1k', sections: [r(1000), r(5100)] },
		{
			id: 'mixed',
			label: 'Series + parallel per side',
			sections: [
				series(r(1000), parallel(r(2200), r(4700))),
				parallel(r(5100), r(10000))
			]
		},
		{
			id: 'fan',
			label: 'Wide parallel fan / long series chain',
			sections: [
				parallel(r(10000), r(10000), r(10000), r(10000)),
				series(r(470), r(1000), r(2200))
			]
		},
		{
			id: 'nested',
			label: 'Nested — parallel of series branches',
			sections: [
				parallel(series(r(1000), r(2200)), r(4700), series(r(3300), parallel(r(10000), r(10000)))),
				r(5100)
			]
		}
	];
	let networkPresetId = $state('nested');
	const networkPreset = $derived(
		networkPresets.find((p) => p.id === networkPresetId) ?? networkPresets[0]
	);

	// Symmetric U-pad, drawn balanced (legs on both rails, mid shunt between)
	let upadLeg = $state(2000);
	let upadMid = $state(1000);
	let upadSupply = $state(10);
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
			<VoltageDividerDiagram
				result={legacyResult}
				{supplyVoltage}
				targetVoltage={Number(outputVoltage.toFixed(3))}
			/>
		</div>
	</div>

	<div class="space-y-2">
		<h3 class="text-sm wt-text-heading">Arbitrary networks</h3>
		<p class="text-xs text-wt-muted-fg">
			Any nested series/parallel tree from one recursive layout — including shapes the legacy
			renderCustom string format can't express. Hover (or Tab to) any resistor: the tooltip shows
			live voltage, current and power for that specific part, derived from the same tree.
		</p>
		<select
			bind:value={networkPresetId}
			class="tool-control inline-flex rounded-wt-box wt-shell-inner wt-no-floating-shadow bg-wt-surface px-2 text-sm text-wt-ink"
		>
			{#each networkPresets as p}
				<option value={p.id}>{p.label}</option>
			{/each}
		</select>
		<div class="rounded-wt-box wt-shell-inner bg-wt-surface p-4">
			<NetworkSchematic supplyVoltage={3.3} sections={networkPreset.sections} tapAfterIndex={0} />
		</div>
	</div>

	<div class="space-y-2">
		<h3 class="text-sm wt-text-heading">Balanced U-pad attenuator</h3>
		<p class="text-xs text-wt-muted-fg">
			Drawn in its true balanced shape: horizontal series legs on the signal and return rails,
			vertical mid shunt between them. Vout here is the differential across the shunt
			(the search engine's tap ratio measures tap-to-ground — same loop, different reference).
			Edit the values — labels, output voltage and per-part tooltips all track.
		</p>
		<div class="flex flex-wrap items-end gap-4">
			<label class="flex flex-col gap-1 text-sm wt-text-ui">
				Vin (V)
				<input type="number" step="0.5" bind:value={upadSupply} class="tool-control w-24 rounded-wt-box wt-shell-inner bg-wt-surface px-2 text-wt-ink" />
			</label>
			<label class="flex flex-col gap-1 text-sm wt-text-ui">
				R_LEG (Ω)
				<input type="number" step="1" bind:value={upadLeg} class="tool-control w-28 rounded-wt-box wt-shell-inner bg-wt-surface px-2 text-wt-ink" />
			</label>
			<label class="flex flex-col gap-1 text-sm wt-text-ui">
				R_MID (Ω)
				<input type="number" step="1" bind:value={upadMid} class="tool-control w-28 rounded-wt-box wt-shell-inner bg-wt-surface px-2 text-wt-ink" />
			</label>
		</div>
		<div class="rounded-wt-box wt-shell-inner bg-wt-surface p-4">
			<UpadBalancedSchematic vin={upadSupply} rLeg={upadLeg} rMid={upadMid} />
		</div>
	</div>
</section>
