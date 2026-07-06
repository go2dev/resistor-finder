<script lang="ts">
	// Interactive divider on the diagram engine: build the divider directly on
	// the schematic — tap a resistor to edit it, thin strips insert series
	// parts, the dialog adds parallel branches, bus bars show group equivalents.
	// Replicates the legacy interactive-divider.js editing UX; the legacy
	// ResistorUtils parser is kept for input notation parity (10k, 4k7(1%), …).
	import '$lib/styles/interactive-divider.css';

	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { NetworkSchematic, partTooltipLines, type AnyResistorGlyph } from '$lib/diagram/engine';
	import { ensureResistorUtilsLoaded, getResistorUtils } from '$lib/adapters/resistor-utils-browser';
	import {
		addParallel,
		canRemove,
		insertSeries,
		nodeAt,
		outputVoltageRange,
		parseGlyphId,
		powerWarnings,
		removeAt,
		resistanceBounds,
		sectionPowerStats,
		sectionRoot,
		toNetNode,
		totalResistance,
		updateEntry,
		type InteractiveEntry,
		type InteractiveNode
	} from '$lib/domain/interactive-divider';
	import { formatWatts, getPackageRecommendation } from '$lib/domain/divider-power';
	import { formatResistorValue } from '$lib/domain/resistor';

	const DEFAULT_ENTRY: InteractiveEntry = { value: 10000, input: '10k', series: 'E24' };

	let topRoot = $state<InteractiveNode>(sectionRoot(DEFAULT_ENTRY));
	let bottomRoot = $state<InteractiveNode>(sectionRoot(DEFAULT_ENTRY));

	let supplyRaw = $state('5');
	let snapToSeries = $state(false);
	let snapSeries = $state('E24');
	let bootError = $state<string | null>(null);

	onMount(() => {
		if (!browser) return;
		ensureResistorUtilsLoaded().catch((e) => {
			bootError = e instanceof Error ? e.message : String(e);
		});
	});

	const supply = $derived.by(() => {
		const v = Number(supplyRaw);
		return Number.isFinite(v) && v > 0 ? v : 5;
	});

	const rTop = $derived(totalResistance(topRoot));
	const rBot = $derived(totalResistance(bottomRoot));
	const totalR = $derived(rTop + rBot);
	const vOut = $derived(totalR > 0 ? (rBot / totalR) * supply : 0);
	const current = $derived(totalR > 0 ? supply / totalR : 0);
	const boundsTop = $derived(resistanceBounds(topRoot));
	const boundsBot = $derived(resistanceBounds(bottomRoot));
	const vRange = $derived(outputVoltageRange(topRoot, bottomRoot, supply));
	const powerTop = $derived(sectionPowerStats(topRoot, totalR > 0 ? (rTop / totalR) * supply : 0));
	const powerBot = $derived(sectionPowerStats(bottomRoot, totalR > 0 ? (rBot / totalR) * supply : 0));
	const packageRec = $derived(
		getPackageRecommendation(Math.max(powerTop.maxComponentPower, powerBot.maxComponentPower))
	);
	const warnings = $derived(
		powerWarnings([...powerTop.parts, ...powerBot.parts], formatResistorValue, formatWatts)
	);

	const sections = $derived([toNetNode(topRoot), toNetNode(bottomRoot)]);

	const formatBounds = (b: { lower: number; upper: number }) =>
		`${formatResistorValue(b.lower)} – ${formatResistorValue(b.upper)}`;

	// --- editing -----------------------------------------------------------

	function rootFor(section: number): InteractiveNode {
		return section === 0 ? topRoot : bottomRoot;
	}

	function setRoot(section: number, root: InteractiveNode) {
		if (section === 0) topRoot = root;
		else bottomRoot = root;
	}

	function parseOptions() {
		return { snapToSeries, snapSeries };
	}

	function defaultEntry(input = '10k'): InteractiveEntry {
		const utils = getResistorUtils();
		if (!utils) return { ...DEFAULT_ENTRY };
		const parsed = utils.parseResistorInput(input, parseOptions());
		return {
			value: parsed.value,
			input,
			tolerance: parsed.tolerance,
			series: parsed.series ?? utils.findResistorSeries?.(parsed.value) ?? null,
			powerRating: parsed.powerRating,
			powerCode: parsed.powerCode
		};
	}

	// --- dialog --------------------------------------------------------------

	let dialogOpen = $state(false);
	let dialogInput = $state('');
	let selected = $state<{ section: number; indices: number[] } | null>(null);
	let dialogInputEl: HTMLInputElement | null = $state(null);

	const selectedRemovable = $derived(
		selected ? canRemove(rootFor(selected.section), selected.indices) : false
	);

	function openDialog(id: string) {
		const path = parseGlyphId(id);
		const node = nodeAt(rootFor(path.section), path.indices);
		if (!node || node.kind !== 'r') return;
		selected = path;
		dialogInput = node.entry.input || formatResistorValue(node.entry.value);
		dialogOpen = true;
		setTimeout(() => dialogInputEl?.select(), 0);
	}

	function closeDialog() {
		dialogOpen = false;
		selected = null;
	}

	function applyDialog() {
		if (!selected) return;
		const utils = getResistorUtils();
		if (!utils) return;
		let parsed: ReturnType<typeof utils.parseResistorInput>;
		try {
			parsed = utils.parseResistorInput(dialogInput.trim(), parseOptions());
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
			return;
		}
		if (!(parsed.value > 0)) {
			alert('Value must be positive');
			return;
		}
		const entry: InteractiveEntry = {
			value: parsed.value,
			input: dialogInput.trim(),
			tolerance: parsed.tolerance,
			series: parsed.series ?? utils.findResistorSeries?.(parsed.value) ?? null,
			powerRating: parsed.powerRating,
			powerCode: parsed.powerCode
		};
		setRoot(selected.section, updateEntry(rootFor(selected.section), selected.indices, entry));
		closeDialog();
	}

	function dialogAddParallel() {
		if (!selected) return;
		setRoot(
			selected.section,
			addParallel(rootFor(selected.section), selected.indices, defaultEntry())
		);
		closeDialog();
	}

	function dialogRemove() {
		if (!selected || !selectedRemovable) return;
		setRoot(selected.section, removeAt(rootFor(selected.section), selected.indices));
		closeDialog();
	}

	function handleInsertSeries(id: string, where: 'above' | 'below') {
		const { section, indices } = parseGlyphId(id);
		setRoot(section, insertSeries(rootFor(section), indices, where, defaultEntry()));
	}

	// --- tooltips ------------------------------------------------------------

	function partTooltip(g: AnyResistorGlyph): { lines: string[]; class?: string } {
		const { section, indices } = parseGlyphId(g.id);
		const node = nodeAt(rootFor(section), indices);
		if (!node || node.kind !== 'r') return { lines: partTooltipLines(g) };
		const entry = node.entry;
		const utils = getResistorUtils();
		const tol =
			entry.tolerance != null
				? `${entry.tolerance}%`
				: entry.series
					? `${utils?.resistorTolerances?.[entry.series] ?? '—'}% (series)`
					: '—';
		return {
			lines: [
				`${entry.value} Ω`,
				`Series: ${entry.series || '—'}`,
				`Tolerance: ${tol}`,
				`Precision/input: ${entry.input || '—'}`,
				...partTooltipLines(g).slice(1)
			],
			class: entry.series ? `series-${entry.series.toLowerCase()}` : undefined
		};
	}

	function busTooltip(id: string): string[] | null {
		const { section, indices } = parseGlyphId(id);
		const node = nodeAt(rootFor(section), indices);
		if (!node || node.kind !== 'parallel') return null;
		return [
			`Parallel group: ${formatResistorValue(totalResistance(node))}`,
			`Range: ${formatBounds(resistanceBounds(node))}`
		];
	}
</script>

<section class="space-y-4">
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<h2 class="text-base font-semibold tracking-tight text-wt-ink">Interactive Divider</h2>
		<p class="text-xs text-wt-muted-fg">
			Build a divider on the schematic: tap a resistor to edit it, use the strips to add series
			or parallel parts. V<sub>out</sub> follows live.
		</p>
	</div>

	{#if bootError}
		<div class="rounded-lg border border-red-400/50 bg-red-100/80 p-4 text-sm text-red-800">
			Could not load the resistor parser: {bootError}
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
						bind:value={supplyRaw}
						step="0.1"
						min="0.001"
						class="wt-shell-inner wt-no-floating-shadow h-9 w-44 rounded-wt-box bg-wt-canvas px-3 text-sm wt-text-body"
					/>
				</div>
			</div>
			<div class="option-group interactive-parse-options">
				<label class="flex cursor-pointer items-center gap-2 text-sm" for="interactiveSnapToSeries">
					<input
						type="checkbox"
						id="interactiveSnapToSeries"
						bind:checked={snapToSeries}
						class="h-4 w-4 accent-wt-brand-design"
					/>
					<span>Snap input to E-series</span>
				</label>
				<label class="text-sm text-wt-muted-fg" for="interactiveSnapSeries">Series</label>
				<select
					id="interactiveSnapSeries"
					bind:value={snapSeries}
					class="wt-shell-inner wt-no-floating-shadow h-9 rounded-wt-box bg-wt-surface px-2 text-sm wt-text-body"
				>
					<option value="E24">E24</option>
					<option value="E48">E48</option>
					<option value="E96">E96</option>
					<option value="E192">E192</option>
				</select>
			</div>
		</div>
	</div>

	<div class="interactive-divider-layout">
		<div class="interactive-diagram-wrap" id="interactiveDividerDiagram" aria-label="Voltage divider schematic">
			<NetworkSchematic
				supplyVoltage={supply}
				{sections}
				tapAfterIndex={0}
				onPartClick={openDialog}
				onInsertSeries={handleInsertSeries}
				{partTooltip}
				{busTooltip}
			/>
		</div>
		<div class="interactive-divider-side">
			<h3 class="mb-2 text-lg wt-text-heading">Calculated output</h3>
			<div id="interactiveDividerResults" class="results-container interactive-results">
				<table class="result-table interactive-results-table">
					<tbody>
						<tr><td><strong>R<sub>TOP</sub> (nominal)</strong></td><td>{formatResistorValue(rTop)}</td></tr>
						<tr><td><strong>R<sub>TOP</sub> (range)</strong></td><td>{formatBounds(boundsTop)}</td></tr>
						<tr><td><strong>R<sub>BOT</sub> (nominal)</strong></td><td>{formatResistorValue(rBot)}</td></tr>
						<tr><td><strong>R<sub>BOT</sub> (range)</strong></td><td>{formatBounds(boundsBot)}</td></tr>
						<tr><td><strong>Total resistance</strong></td><td>{formatResistorValue(totalR)}</td></tr>
						<tr>
							<td><strong>Total current at V<sub>supply</sub></strong></td>
							<td>{current.toExponential(4)} A ({(current * 1000).toFixed(3)} mA)</td>
						</tr>
						<tr>
							<td><strong>Power dissipation</strong></td>
							<td class="power-values"
								>R<sub>TOP</sub>: {formatWatts(powerTop.total)}, R<sub>BOT</sub>: {formatWatts(powerBot.total)}, Total: {formatWatts(
									powerTop.total + powerBot.total
								)}</td
							>
						</tr>
						<tr>
							<td><strong>Min package size recommendation</strong></td>
							<td class="package-recommendation"
								>{packageRec.imperial}/{packageRec.metric} (min {formatWatts(packageRec.rating)})</td
							>
						</tr>
						<tr><td><strong>Nominal V<sub>out</sub></strong></td><td>{vOut.toFixed(3)} V</td></tr>
						<tr>
							<td><strong>Real world range for V<sub>out</sub></strong></td>
							<td><span class="voltage-range">{vRange.min.toFixed(2)} V to {vRange.max.toFixed(2)} V</span></td>
						</tr>
					</tbody>
				</table>
				{#if warnings.length > 0}
					<div class="result-warning">Power warning: {warnings.join(', ')}</div>
				{/if}
				<p class="interactive-touch-hint">
					Touch: tap a resistor for value / add parallel / remove; tap thin strips above or below a
					resistor to insert another in series; tap a horizontal parallel bus for that group’s
					equivalent resistance.
				</p>
			</div>
		</div>
	</div>

	<div
		id="interactiveResistorDialog"
		class="interactive-dialog"
		hidden={!dialogOpen}
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
				bind:value={dialogInput}
				bind:this={dialogInputEl}
				onkeydown={(e) => {
					if (e.key === 'Enter') applyDialog();
					if (e.key === 'Escape') closeDialog();
				}}
			/>
			<div class="interactive-dialog-actions">
				<button type="button" id="interactiveDialogApply" onclick={applyDialog}>Apply</button>
				<button type="button" id="interactiveDialogParallel" onclick={dialogAddParallel}
					>Add parallel</button
				>
				<button type="button" id="interactiveDialogRemove" disabled={!selectedRemovable} onclick={dialogRemove}
					>Remove</button
				>
				<button type="button" id="interactiveDialogClose" onclick={closeDialog}>Close</button>
			</div>
		</div>
	</div>
</section>
