<script lang="ts">
	// Diagram engine gallery (grew out of the approved PoC). Not linked from
	// the nav — open /app/diagram-poc directly. Left: the production engine
	// (Svelte components emitting SVG, hover/keyboard interactive, themed via
	// currentColor + wt CSS variables). Right: the schematic.js render of the
	// same divider for comparison while pages migrate (docs/overhaul-plan.md §2).
	import VoltageDividerDiagram from '$lib/components/diagrams/voltage-divider-diagram.svelte';
	import {
		NetworkSchematic,
		UpadSchematic,
		parallel,
		r,
		series,
		type NetNode
	} from '$lib/diagram/engine';
	import { formatResistorValue } from '$lib/domain/resistor';
	import type { DividerResult, Network } from '$lib/domain/voltage-divider';

	let supplyVoltage = $state(3.3);
	let rTop = $state(1000);
	let rBot = $state(5100);

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
		<h2 class="text-xl wt-text-heading tracking-tight">Diagram engine gallery</h2>
		<p class="text-sm text-wt-muted-fg">
			Production engine (Svelte-native SVG) next to the legacy schematic.js render. Hover, click
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
		</p>
	</div>

	<div class="grid gap-6 md:grid-cols-2">
		<div class="space-y-2 rounded-wt-box wt-shell-inner bg-wt-surface p-4">
			<h3 class="text-sm wt-text-heading">Engine: Svelte SVG components</h3>
			<p class="text-xs text-wt-muted-fg">
				Reactive labels + refs, per-part V/I/P tooltips, focusable parts, theme via currentColor.
			</p>
			<NetworkSchematic
				{supplyVoltage}
				sections={[r(rTop, 'R_TOP'), r(rBot, 'R_BOT')]}
				tapAfterIndex={0}
			/>
		</div>
		<div class="space-y-2 rounded-wt-box wt-shell-inner bg-wt-surface p-4">
			<h3 class="text-sm wt-text-heading">Legacy: schematic.js</h3>
			<p class="text-xs text-wt-muted-fg">
				Old engine via the existing adapter (static output, PNG export).
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
			<UpadSchematic vin={upadSupply} rLeg={upadLeg} rMid={upadMid} />
		</div>
	</div>
</section>
