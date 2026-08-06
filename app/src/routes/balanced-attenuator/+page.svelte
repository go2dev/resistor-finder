<script lang="ts">
	import '$lib/styles/balanced-attenuator.css';

	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { mountBalancedAttenuatorLegacy } from '$lib/adapters/balanced-attenuator-browser';

	let bootError = $state<string | null>(null);

	onMount(() => {
		if (!browser) return;

		void (async () => {
			try {
				await mountBalancedAttenuatorLegacy();
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

<section class="ba-legacy space-y-4">
	<div class="space-y-2">
		<h2 class="text-xl wt-text-heading tracking-tight text-wt-ink">
			Balanced Attenuator
		</h2>
		<p class="text-sm text-wt-muted-fg">
			U-pad / L-pad search via legacy <code class="text-xs">script.js</code>,
			<code class="text-xs">attenuator-engine.js</code>, and <code class="text-xs">schematic.js</code> — identical DOM ids to
			<code class="text-xs">balanced-attenuator.html</code>.
		</p>
	</div>

	{#if bootError}
		<div class="rounded-lg border border-red-400/50 bg-red-100/80 p-4 text-sm text-red-800">
			Could not boot attenuator engine: {bootError}
		</div>
	{/if}

	<div class="main-content">
		<div class="input-section">
			<div id="resistorInputSection"></div>

			<div class="input-group">
				<label for="attenuatorType">Attenuator type</label>
				<select id="attenuatorType" class="sort-select max-w-md">
					<option value="u" selected>U-pad (symmetric)</option>
					<option value="l">L-pad</option>
					<option value="pi" disabled>Pi-pad (coming soon)</option>
					<option value="h" disabled>H-pad (coming soon)</option>
					<option value="t" disabled>T-pad (coming soon)</option>
				</select>
				<span class="field-hint" id="attenuatorTypeHint">Symmetric U: R<sub>TOP</sub> = R<sub>BOT</sub>, R<sub>MID</sub> to the lower node.</span>
			</div>

			<div class="voltage-inputs upad-inputs">
				<div class="input-group">
					<label for="supplyVoltage">Source voltage V<sub>in</sub> (for dissipation &amp; table figures)</label>
					<input type="number" id="supplyVoltage" value="5" step="0.1" />
					<span class="field-hint">
						Attenuation is set by dB and Z<sub>load</sub>; V<sub>in</sub> scales currents and power in the results (no per-card slider).
					</span>
				</div>
				<div class="input-group">
					<label for="upadAttenuationDb">Target attenuation (insertion loss, dB)</label>
					<input type="number" id="upadAttenuationDb" value="3.604" step="0.01" min="0" max="120" />
					<span class="field-hint">
						Positive dB = loss. V<sub>out</sub>/V<sub>in</sub> = 10<sup>−dB/20</sup> at the tap with Z<sub>load</sub> applied.
					</span>
				</div>
				<div class="input-group">
					<label for="upadZLoad">Load Z<sub>load</sub> (Ω, to ground from tap)</label>
					<input type="number" id="upadZLoad" value="50000" step="1" min="0.001" />
					<span class="field-hint">Finite load changes tap voltage, currents, and loaded Z<sub>in</sub>.</span>
				</div>
				<div class="input-group">
					<label for="upadZInTarget">Target Z<sub>in</sub> loaded (Ω, optional)</label>
					<input type="number" id="upadZInTarget" value="" step="1" min="0" placeholder="e.g. 50" />
				</div>
				<div class="input-group">
					<label for="upadZOutTarget">Target Z<sub>out</sub> at tap, V<sub>in</sub>=0 (Ω, optional)</label>
					<input type="number" id="upadZOutTarget" value="" step="1" min="0" placeholder="e.g. 50" />
					<span class="field-hint">Topology-specific Thévenin impedance at the tap (see results).</span>
				</div>
				<div class="input-group">
					<label for="upadMinPowerW">Minimum power for package sizing (W, optional)</label>
					<input type="number" id="upadMinPowerW" value="" step="0.01" min="0" placeholder="e.g. 0.125" />
					<span class="field-hint">Package recommendation uses the greater of this floor and dissipated power in each resistor.</span>
				</div>
				<input type="hidden" id="targetVoltage" value="" />
			</div>

			<button
				type="button"
				id="calculateBtn"
				class="wt-affordance-pill inline-flex max-w-md items-center justify-center bg-wt-brand-design px-4 py-3 text-sm wt-text-ui text-wt-white hover:opacity-95"
			>
				Calculate combinations
			</button>
		</div>

		<div class="options-section">
			<p class="mb-2 text-sm wt-text-ui text-wt-body">Options</p>
			<div class="options-box">
				<div class="option-group">
					<div class="theme-switch-wrapper">
						<label class="theme-switch" for="overshoot">
							<input type="checkbox" id="overshoot" checked />
							<div class="slider round"></div>
						</label>
						<span class="theme-label">Allow overshoot (tap voltage above target)</span>
					</div>
				</div>
				<div class="option-group">
					<div class="sort-options space-y-2">
						<span class="theme-label">Sort results by</span>
						<select name="sortBy" id="sortBy" class="sort-select">
							<option value="error" selected>Lowest attenuation error</option>
							<option value="attenImpedanceMatch">Best Z<sub>in</sub>/Z<sub>out</sub> match (when targets set)</option>
							<option value="components">Lowest component count</option>
							<option value="totalResistanceAsc">Total resistance ↑</option>
							<option value="totalResistanceDesc">Total resistance ↓</option>
						</select>
						<div class="resistance-filter-section" style="display: none;">
							<span class="theme-label">
								Filter total resistance [Min: <span id="resistance-min">0</span> – Max:
								<span id="resistance-max">0</span>]
							</span>
							<div class="resistance-filter-container">
								<div id="resistance-slider"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div id="results" class="results-container"></div>

	<div id="loadingSpinner" class="loading-spinner" style="display: none;">
		<div class="spinner"></div>
		<p>Calculating combinations...</p>
		<p class="progress-text"></p>
	</div>
</section>
