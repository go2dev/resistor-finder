<script lang="ts">
	import '$lib/styles/interactive-divider.css';

	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import ModePanel from '$lib/components/forms/mode-panel.svelte';
	import { mountInteractiveDividerLegacy } from '$lib/adapters/interactive-divider-browser';

	let bootError = $state<string | null>(null);

	onMount(() => {
		if (!browser) return;

		void (async () => {
			try {
				await mountInteractiveDividerLegacy();
				bootError = null;
			} catch (e) {
				bootError = e instanceof Error ? e.message : String(e);
			}
		})();
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			delete document.body.dataset.page;
		}
	});
</script>

<section class="space-y-4">
	<div>
		<h2 class="text-xl wt-text-heading tracking-tight">Interactive Divider</h2>
		<p class="text-sm text-wt-muted-fg">
			Legacy schematic editing (tap resistors, series strips, parallel buses) via repo-root
			<code class="text-xs">interactive-divider.js</code>
			and <code class="text-xs">schematic.js</code>. Supply is swept here; V<sub>out</sub> follows your divider.
		</p>
	</div>

	<ModePanel mode="interactive-divider" />

	{#if bootError}
		<div class="rounded-lg border border-red-400/50 bg-red-100/80 p-4 text-sm text-red-800">
			Could not start interactive engine: {bootError}
		</div>
	{/if}

	<div class="main-content interactive-divider-main">
		<div class="input-section interactive-divider-inputs">
			<div class="voltage-inputs flex flex-wrap gap-4">
				<div class="input-group flex flex-col gap-1">
					<label for="interactiveSupplyVoltage" class="text-sm wt-text-ui"
						>Supply voltage (V<sub>supply</sub>)</label
					>
					<input
						id="interactiveSupplyVoltage"
						type="number"
						value="5"
						step="0.1"
						min="0.001"
						class="wt-shell-inner wt-no-floating-shadow h-9 w-44 rounded-wt-box bg-wt-canvas px-3 text-sm wt-text-body"
					/>
				</div>
			</div>
			<div class="option-group interactive-parse-options">
				<label class="flex cursor-pointer items-center gap-2 text-sm" for="interactiveSnapToSeries">
					<input type="checkbox" id="interactiveSnapToSeries" class="h-4 w-4 accent-wt-brand-design" />
					<span>Snap input to E-series</span>
				</label>
				<label class="text-sm text-wt-muted-fg" for="interactiveSnapSeries">Series</label>
				<select
					id="interactiveSnapSeries"
					class="wt-shell-inner wt-no-floating-shadow h-9 rounded-wt-box bg-wt-surface px-2 text-sm wt-text-body"
				>
					<option value="E24" selected>E24</option>
					<option value="E48">E48</option>
					<option value="E96">E96</option>
					<option value="E192">E192</option>
				</select>
			</div>
		</div>
	</div>

	<div class="interactive-divider-layout">
		<div
			class="interactive-diagram-wrap"
			id="interactiveDividerDiagram"
			aria-label="Voltage divider schematic"
		></div>
		<div class="interactive-divider-side">
			<h3 class="mb-2 text-lg wt-text-heading">Calculated output</h3>
			<div id="interactiveDividerResults" class="results-container interactive-results"></div>
		</div>
	</div>

	<div
		id="interactiveResistorDialog"
		class="interactive-dialog"
		hidden
		role="dialog"
		aria-modal="true"
		aria-labelledby="interactiveDialogTitle"
	>
		<div class="interactive-dialog-inner">
			<h3 id="interactiveDialogTitle">Resistor</h3>
			<label for="interactiveResistorInput">Value (same notation as main calculator)</label>
			<input
				type="text"
				id="interactiveResistorInput"
				class="interactive-dialog-input"
				placeholder="e.g. 10k, 4k7(1%)"
			/>
			<div class="interactive-dialog-actions">
				<button type="button" id="interactiveDialogApply">Apply</button>
				<button type="button" id="interactiveDialogParallel">Add parallel</button>
				<button type="button" id="interactiveDialogRemove">Remove</button>
				<button type="button" id="interactiveDialogClose">Close</button>
			</div>
		</div>
	</div>
</section>
