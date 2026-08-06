<script lang="ts">
	import '$lib/styles/zoom-range-filter.css';

	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import nouisliderCssUrl from '$legacy/nuis/nouislider.css?url';
	import Button from '$lib/components/ui/button.svelte';
	import VoltageDividerDiagram from '$lib/components/diagrams/voltage-divider-diagram.svelte';
	import ResultsPanel from '$lib/components/layout/results-panel.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Switch from '$lib/components/ui/switch.svelte';
	import { ensureResistorUtilsLoaded, getResistorUtils } from '$lib/adapters/resistor-utils-browser';
	import { buildLegacyDividerCombinations } from '$lib/domain/legacy-divider-combos';
	import {
		calculateDividerVoltageRangeForSupply,
		getDividerPowerPresentation
	} from '$lib/domain/divider-power';
	import { parseRichResistorInputs } from '$lib/domain/parse-rich-resistors';
	import { formatResistorValue } from '$lib/domain/resistor';
	import type { ParsedResistor } from '$lib/domain/resistor';
	import {
		computeDividerResults,
		filterSortLimitDividerResults,
		sanitizeInputResistors,
		type DividerResult,
		type SortBy
	} from '$lib/domain/voltage-divider';
	import { computeVoltageDividerViaLegacyWorkers } from '$lib/workers/voltage-divider-worker-client';
	import {
		createZoomableHistogramFilter,
		ensureZoomableHistogramDepsLoaded,
		type ZoomableHistogramApi
	} from '$lib/adapters/zoomable-range-filter-browser';

	let resistorValues = $state(
		'1k, 2.2k, 3.3k, 4.7k, 10k, 22k, 5K11, 96C, EB1041, 100R(0.1%), 220R(5%), 4k7, 49R9, 73k2(10%), 0R, 8M2'
	);
	let supplyVoltage = $state('5');
	let targetVoltage = $state('3.3');
	let allowOvershoot = $state(true);
	let sortBy = $state<SortBy>('error');

	let snapToSeries = $state(false);
	let snapSeriesPick = $state('E24');
	let autofillDecade = $state('100');

	let errors = $state<string[]>([]);
	let warnings = $state<string[]>([]);
	let allResults = $state<DividerResult[]>([]);
	let calculating = $state(false);
	let usedWorkers = $state(false);
	let workerStats = $state<{ durationMs: number; workerCount: number; comboCount: number } | null>(null);
	let fallbackStats = $state({ networkCount: 0, networksTested: 0 });
	let diagramSupply = $state(5);
	let diagramTarget = $state(3.3);

	let parseSummary = $state({ total: 0, jlc: 0 });
	type ParsedValueChip = {
		id: string;
		label: string;
		active: boolean;
		resistor: ParsedResistor;
		series?: string | null;
		tolerance?: number | null;
		isJlcBasic?: boolean;
		source?: string;
	};
	let parsedValueChips = $state<ParsedValueChip[]>([]);

	let filterMinStr = $state('0');
	let filterMaxStr = $state('0');

	let histogramMountEl: HTMLElement | null = $state(null);
	let histogramBootGeneration = 0;
	let zoomHistogramApi: ZoomableHistogramApi | null = null;

	const histogramDomainSig = $derived(allResults.map((r) => r.totalResistance).join(','));

	const sortOptions: { value: SortBy; label: string }[] = [
		{ value: 'error', label: 'Lowest error' },
		{ value: 'components', label: 'Lowest component count' },
		{ value: 'totalResistanceAsc', label: 'Total resistance ascending' },
		{ value: 'totalResistanceDesc', label: 'Total resistance descending' }
	];

	const seriesOptions = ['E24', 'E48', 'E96', 'E192'] as const;

	const decadeOptions = [
		{ value: '1', label: 'Ω' },
		{ value: '10', label: '10Ω' },
		{ value: '100', label: '100Ω' },
		{ value: '1000', label: 'KΩ' },
		{ value: '10000', label: '10KΩ' },
		{ value: '100000', label: '100KΩ' },
		{ value: '1000000', label: 'MΩ' },
		{ value: '10000000', label: '10MΩ' },
		{ value: '100000000', label: '100MΩ' }
	];
	const E24_FALLBACK = [
		1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.4, 2.7, 3, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1,
		5.6, 6.2, 6.8, 7.5, 8.2, 9.1
	];

	function seriesToneClass(series: string | null | undefined): string {
		if (series === 'E192') return 'bg-fuchsia-500';
		if (series === 'E96') return 'bg-sky-500';
		if (series === 'E48') return 'bg-emerald-500';
		return 'bg-amber-500';
	}

	function seriesTooltipToneClass(series: string | null | undefined): string {
		if (series === 'E192') return 'bg-fuchsia-100';
		if (series === 'E96') return 'bg-sky-100';
		if (series === 'E48') return 'bg-emerald-100';
		return 'bg-amber-100';
	}

	function chipTooltipText(chip: ParsedValueChip): string {
		const parsedLine =
			chip.source && chip.source !== 'value'
				? `Parsed: ${chip.label} from ${chip.source} (${chip.resistor.input})`
				: `Parsed: ${chip.label}`;
		const parts = [
			parsedLine,
			`Series: ${chip.series ?? 'unknown'}`,
			`Tolerance: ${chip.tolerance != null ? `±${chip.tolerance}%` : 'unknown'}`
		];
		if (chip.isJlcBasic) parts.splice(3, 0, 'JLC Basic');
		return parts.join('\n');
	}

	function pushUiWarning(message: string) {
		if (!warnings.includes(message)) {
			warnings = [...warnings, message];
		}
	}

	async function loadJlcFallbackList(): Promise<string[]> {
		const resp = await fetch(`${base}/data/jlc_basic_resistors_embedded.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
		const payload = (await resp.json()) as { rows?: Array<{ resistance?: number }> };
		const values = new Set<number>();
		for (const row of payload.rows ?? []) {
			const ohms = Number(row.resistance);
			if (Number.isFinite(ohms) && ohms >= 0) values.add(ohms);
		}
		return [...values]
			.sort((a, b) => a - b)
			.map((v) => formatResistorValue(v).replace(/Ω/g, 'R'));
	}

	function parseTotalResistanceRange(): { minR: number; maxR: number } | null {
		const minR = parseFloat(filterMinStr);
		const maxR = parseFloat(filterMaxStr);
		if (!Number.isFinite(minR) || !Number.isFinite(maxR) || minR > maxR) return null;
		return { minR, maxR };
	}

	const displayResults = $derived.by(() => {
		const rng = parseTotalResistanceRange();
		if (!allResults.length || !rng) return [];
		return filterSortLimitDividerResults(allResults, { ...rng, sortBy, limit: 5 });
	});

	const displayResultsSignature = $derived(
		displayResults.map((r) => `${r.top.label}|${r.bottom.label}|${r.totalResistance}`).join('\u0001')
	);

	/** Per-card supply slider values (legacy `solution-slider`); keyed by divider fingerprint. */
	let cardSupplyByKey = $state<Record<string, number>>({});

	$effect(() => {
		void displayResultsSignature;
		cardSupplyByKey = {};
	});

	function dividerCardKey(r: DividerResult): string {
		return `${r.top.label}|${r.bottom.label}|${r.totalResistance}`;
	}

	$effect(() => {
		if (!browser) return;

		const sig = histogramDomainSig;
		const mountEl = histogramMountEl;

		if (!sig || !mountEl || allResults.length === 0) {
			histogramBootGeneration += 1;
			zoomHistogramApi?.destroy();
			zoomHistogramApi = null;
			return;
		}

		const generation = ++histogramBootGeneration;
		const numericResults = allResults.map((r, i) => ({
			id: `r-${i}-${r.totalResistance}`,
			value: r.totalResistance
		}));

		void (async () => {
			try {
				await ensureResistorUtilsLoaded();
				await ensureZoomableHistogramDepsLoaded();
				if (generation !== histogramBootGeneration) return;

				zoomHistogramApi?.destroy();
				zoomHistogramApi = null;

				const imin = parseFloat(filterMinStr);
				const imax = parseFloat(filterMaxStr);
				const rangeOk = Number.isFinite(imin) && Number.isFinite(imax) && imin <= imax;

				zoomHistogramApi = createZoomableHistogramFilter(mountEl, {
					results: numericResults,
					...(rangeOk ? { initialFilterMin: imin, initialFilterMax: imax } : {}),
					formatValue: (v: number) => formatResistorValue(v),
					showHistogram: true,
					onFilterChange(range: { filterMin: number; filterMax: number }) {
						filterMinStr = String(range.filterMin);
						filterMaxStr = String(range.filterMax);
					}
				});
			} catch (e) {
				console.warn('[voltage-divider] histogram filter failed', e);
			}
		})();

		return () => {
			histogramBootGeneration += 1;
			zoomHistogramApi?.destroy();
			zoomHistogramApi = null;
		};
	});

	function boundsFromTotals(results: DividerResult[]) {
		if (!results.length) return { min: 0, max: 0 };
		let min = Infinity;
		let max = -Infinity;
		for (const r of results) {
			if (r.totalResistance < min) min = r.totalResistance;
			if (r.totalResistance > max) max = r.totalResistance;
		}
		return { min, max };
	}

	async function autofillCommonSeries() {
		try {
			await ensureResistorUtilsLoaded();
			const Ru = getResistorUtils();
			if (!Ru) throw new Error('ResistorUtils unavailable');
			const mult = Number(autofillDecade);
			const seriesArr = Ru.series[snapSeriesPick] ?? Ru.series.E24;
			const formatted = seriesArr.map((v: number) => Ru.formatResistorValue(v * mult).replace(/Ω/g, 'R'));
			resistorValues = formatted.join(', ');
		} catch {
			const mult = Number(autofillDecade);
			const formatted = E24_FALLBACK.map((v) =>
				formatResistorValue(v * mult).replace(/Ω/g, 'R')
			);
			resistorValues = formatted.join(', ');
			pushUiWarning('Autofill used local E24 fallback values (legacy parser not ready yet).');
		}
	}

	async function autofillJlcBasics() {
		try {
			await ensureResistorUtilsLoaded();
			const Ru = getResistorUtils();
			if (!Ru?.luts?.JLC_BASIC?.length) throw new Error('JLC LUT unavailable');
			resistorValues = Ru.luts.JLC_BASIC.join(', ');
		} catch {
			try {
				const fallback = await loadJlcFallbackList();
				if (fallback.length === 0) throw new Error('Fallback JLC list empty');
				resistorValues = fallback.join(', ');
				pushUiWarning('Autofill JLC used embedded JSON fallback list.');
			} catch {
				pushUiWarning('Autofill JLC failed: no JLC source currently available.');
			}
		}
	}

	async function calculate() {
		const nextErrors: string[] = [];
		const nextWarnings: string[] = [];

		const supply = Number(supplyVoltage);
		const target = Number(targetVoltage);
		if (!Number.isFinite(supply) || supply <= 0) {
			nextErrors.push('Supply voltage must be a positive number.');
		}
		if (!Number.isFinite(target) || target <= 0) {
			nextErrors.push('Target voltage must be a positive number.');
		}
		if (Number.isFinite(supply) && Number.isFinite(target) && target > supply) {
			nextErrors.push('Target voltage cannot exceed supply voltage.');
		}

		const richParse = await parseRichResistorInputs(resistorValues, {
			snapToSeries,
			snapSeries: snapSeriesPick
		});
		nextWarnings.push(...richParse.warnings);
		const chips = richParse.resistors.map((r, idx) => {
			const Ru = getResistorUtils();
			let resolvedSeries = r.series ?? null;
			if (!resolvedSeries && r.tolerance != null) {
				resolvedSeries = Ru?.getSeriesForTolerance?.(r.tolerance) ?? null;
			}
			if (!resolvedSeries) {
				resolvedSeries = Ru?.findResistorSeries?.(r.value) ?? null;
			}
			const resolvedTolerance =
				r.tolerance ??
				(resolvedSeries && Ru?.resistorTolerances?.[resolvedSeries] != null
					? Ru.resistorTolerances[resolvedSeries]
					: null);
			const id = `${r.input}-${idx}`;
			const existing = parsedValueChips.find((chip) => chip.id === id);
			return {
				id,
				label: r.formatted,
				active: existing?.active ?? true,
				resistor: r,
				series: resolvedSeries,
				tolerance: resolvedTolerance,
				isJlcBasic: r.isJlcBasic ?? false,
				source: r.source
			};
		});
		parsedValueChips = chips;
		const activeResistors = chips.filter((chip) => chip.active).map((chip) => chip.resistor);
		const sanitized = sanitizeInputResistors(activeResistors);
		nextWarnings.push(...sanitized.warnings);

		if (sanitized.resistors.length === 0) {
			nextErrors.push('At least one active parsed resistor value is required.');
		}

		if (nextErrors.length > 0) {
			errors = nextErrors;
			warnings = nextWarnings;
			allResults = [];
			parseSummary = { total: 0, jlc: 0 };
			parsedValueChips = chips;
			calculating = false;
			usedWorkers = false;
			workerStats = null;
			fallbackStats = { networkCount: 0, networksTested: 0 };
			return;
		}

		parseSummary = {
			total: activeResistors.length,
			jlc: activeResistors.filter((r) => r.isJlcBasic).length
		};

		errors = [];
		warnings = nextWarnings;
		diagramSupply = supply;
		diagramTarget = target;
		calculating = true;
		workerStats = null;

		try {
			const combos = buildLegacyDividerCombinations(sanitized.resistors);
			let nextResults: DividerResult[];

			if (browser && typeof Worker !== 'undefined') {
				try {
					const { results: workerResults, meta } = await computeVoltageDividerViaLegacyWorkers({
						combinations: combos,
						supplyVoltage: supply,
						targetVoltage: target,
						allowOvershoot
					});
					nextResults = workerResults;
					usedWorkers = true;
					workerStats = {
						durationMs: meta.durationMs,
						workerCount: meta.workerCount,
						comboCount: meta.combinationCount
					};
					const nets = sanitized.resistors.length;
					fallbackStats = {
						networkCount: nets,
						networksTested: combos.length * combos.length
					};
				} catch (workerErr) {
					console.warn('[divider] worker failed, using sync search', workerErr);
					nextWarnings.push(
						`Parallel worker unavailable (${workerErr instanceof Error ? workerErr.message : String(workerErr)}); running single-thread search without tolerance Vout bands.`
					);
					const computed = computeDividerResults({
						resistors: sanitized.resistors,
						supplyVoltage: supply,
						targetVoltage: target,
						allowOvershoot,
						sortBy
					});
					nextResults = computed.results;
					usedWorkers = false;
					fallbackStats = {
						networkCount: computed.networkCount,
						networksTested: computed.networksTested
					};
				}
			} else {
				const computed = computeDividerResults({
					resistors: sanitized.resistors,
					supplyVoltage: supply,
					targetVoltage: target,
					allowOvershoot,
					sortBy
				});
				nextResults = computed.results;
				usedWorkers = false;
				fallbackStats = {
					networkCount: computed.networkCount,
					networksTested: computed.networksTested
				};
				nextWarnings.push('Workers not available in this environment; tolerance voltage bands omitted.');
			}

			allResults = nextResults;
			warnings = nextWarnings;

			const { min, max } = boundsFromTotals(nextResults);
			filterMinStr = String(min);
			filterMaxStr = String(max);
		} finally {
			calculating = false;
		}
	}

	async function toggleParsedValue(id: string) {
		parsedValueChips = parsedValueChips.map((chip) =>
			chip.id === id ? { ...chip, active: !chip.active } : chip
		);
		if (!calculating) {
			await calculate();
		}
	}

	onMount(() => void calculate());
</script>

<svelte:head>
	<link rel="stylesheet" href={nouisliderCssUrl} />
</svelte:head>

<section class="space-y-6">
	<div class="space-y-1">
		<h2 class="text-xl wt-text-heading tracking-tight">Voltage Divider</h2>
		<p class="text-sm text-wt-muted-fg">
			Legacy parsing via <code class="text-xs">resistor-utils.js</code> + <code class="text-xs">jlc-basic-catalog.js</code>,
			parallel <code class="text-xs">resistor-worker.js</code> search, per-result supply sliders, power/package sizing, and zoomable resistance histogram filtering.
		</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="space-y-2 md:col-span-2">
			<label for="resistor-values" class="text-sm wt-text-ui">Available resistor values</label>
			<Input id="resistor-values" bind:value={resistorValues} />
			{#if parseSummary.total > 0}
				<p class="text-xs text-wt-muted-fg">
					Active pool: {parseSummary.total} value{parseSummary.total === 1 ? '' : 's'}
					{#if parseSummary.jlc > 0}
						· {parseSummary.jlc} on JLC PCB Basics list (embedded LUT)
					{/if}
				</p>
			{/if}
			<div class="flex flex-col gap-3 wt-shell-inner wt-no-floating-shadow rounded-wt-box bg-wt-muted/50 p-3">
				<div class="flex flex-wrap items-center gap-3">
					<div class="flex flex-wrap items-center gap-2">
						<Switch checked={snapToSeries} onToggle={(next: boolean) => (snapToSeries = next)} />
						<span class="text-sm wt-text-ui">Snap to E-series</span>
					</div>
					<label class="sr-only" for="snap-series">Series for snap</label>
					<select
						id="snap-series"
						bind:value={snapSeriesPick}
						class="inline-flex h-9 rounded-wt-box wt-shell-inner wt-no-floating-shadow bg-wt-surface px-2 text-sm text-wt-ink outline-none focus-visible:ring-2 focus-visible:ring-wt-brand-design focus-visible:ring-offset-2 focus-visible:ring-offset-wt-canvas"
					>
						{#each seriesOptions as s}
							<option value={s}>{s}</option>
						{/each}
					</select>
					<span class="text-xs text-wt-muted-fg">
						Uses tolerance-aware snapping when brackets specify tolerance (legacy behaviour).
					</span>
				</div>
				<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
					<Button type="button" variant="outline" size="sm" onclick={() => void autofillCommonSeries()}>
						Autofill decade values
					</Button>
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-xs wt-text-ui text-wt-muted-fg">Decade</span>
						<select
							bind:value={autofillDecade}
							class="inline-flex h-9 rounded-wt-box wt-shell-inner wt-no-floating-shadow bg-wt-surface px-2 text-sm text-wt-ink outline-none focus-visible:ring-2 focus-visible:ring-wt-brand-design focus-visible:ring-offset-2 focus-visible:ring-offset-wt-canvas"
						>
							{#each decadeOptions as d}
								<option value={d.value}>{d.label}</option>
							{/each}
						</select>
						<span class="text-xs wt-text-ui text-wt-muted-fg">Series</span>
						<select
							bind:value={snapSeriesPick}
							class="inline-flex h-9 rounded-wt-box wt-shell-inner wt-no-floating-shadow bg-wt-surface px-2 text-sm text-wt-ink outline-none focus-visible:ring-2 focus-visible:ring-wt-brand-design focus-visible:ring-offset-2 focus-visible:ring-offset-wt-canvas"
						>
							{#each seriesOptions as s}
								<option value={s}>{s}</option>
							{/each}
						</select>
					</div>
					<Button type="button" variant="outline" size="sm" onclick={() => void autofillJlcBasics()}>
						Autofill JLC PCB Basics
					</Button>
				</div>
			</div>
		</div>
		<div class="space-y-2">
			<label for="supply-voltage" class="text-sm wt-text-ui">Supply voltage (V)</label>
			<Input id="supply-voltage" type="number" step="0.1" bind:value={supplyVoltage} />
		</div>
		<div class="space-y-2">
			<label for="target-voltage" class="text-sm wt-text-ui">Target voltage (V)</label>
			<Input id="target-voltage" type="number" step="0.1" bind:value={targetVoltage} />
		</div>
	</div>

	<div class="wt-shell-inner wt-no-floating-shadow grid gap-3 rounded-wt-box bg-wt-muted p-4 md:grid-cols-2">
		<div class="flex items-center justify-between gap-3">
			<div class="space-y-1">
				<p class="text-sm wt-text-ui">Allow overshoot</p>
				<p class="text-xs text-wt-muted-fg">Keep solutions above target voltage.</p>
			</div>
			<Switch checked={allowOvershoot} onToggle={(next: boolean) => (allowOvershoot = next)} />
		</div>
		<div class="space-y-2">
			<label for="sort-by" class="text-sm wt-text-ui">Sort by</label>
			<select
				id="sort-by"
				bind:value={sortBy}
				class="inline-flex h-10 w-full rounded-wt-box wt-shell-inner wt-no-floating-shadow bg-wt-surface px-3 text-sm text-wt-ink outline-none focus-visible:ring-2 focus-visible:ring-wt-brand-design focus-visible:ring-offset-2 focus-visible:ring-offset-wt-canvas"
			>
				{#each sortOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if allResults.length > 0}
		{@const resistanceBand = parseTotalResistanceRange()}
		<div class="wt-shell-inner wt-no-floating-shadow space-y-3 rounded-wt-box bg-wt-muted/60 p-4">
			<div class="space-y-1">
				<p class="text-sm wt-text-ui">Total resistance filter</p>
				<p class="text-xs text-wt-muted-fg">
					Scroll or pinch on the histogram to zoom; drag to pan. Use the slider handles to set the band — same widget as the static voltage divider page.
				</p>
			</div>
			<div bind:this={histogramMountEl} class="zoom-range-filter min-h-[180px] w-full"></div>
			<div class="grid gap-2 md:grid-cols-2">
				<div class="space-y-1">
					<label for="vd-filter-min" class="text-xs wt-text-ui text-wt-muted-fg">Min total resistance</label>
					<Input id="vd-filter-min" type="number" step="any" bind:value={filterMinStr} />
				</div>
				<div class="space-y-1">
					<label for="vd-filter-max" class="text-xs wt-text-ui text-wt-muted-fg">Max total resistance</label>
					<Input id="vd-filter-max" type="number" step="any" bind:value={filterMaxStr} />
				</div>
			</div>
			<div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={() => {
						const { min, max } = boundsFromTotals(allResults);
						filterMinStr = String(min);
						filterMaxStr = String(max);
					}}
				>
					Reset resistance band
				</Button>
			</div>
			{#if resistanceBand}
				<p class="text-xs tabular-nums text-wt-muted-fg">
					Active band:
					{formatResistorValue(resistanceBand.minR)} → {formatResistorValue(resistanceBand.maxR)}
				</p>
			{/if}
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-3">
		<Button onclick={() => void calculate()} disabled={calculating}>
			{calculating ? 'Calculating…' : 'Calculate combinations'}
		</Button>
		{#if usedWorkers && workerStats}
			<p class="text-xs text-wt-muted-fg">
				Legacy worker · {workerStats.comboCount.toLocaleString()} combo definitions · {workerStats.workerCount} worker{workerStats.workerCount === 1 ? '' : 's'} · {workerStats.durationMs}
				ms
			</p>
		{:else}
			<p class="text-xs text-wt-muted-fg">
				Sync search · networks {fallbackStats.networkCount.toLocaleString()} · pairs {fallbackStats.networksTested.toLocaleString()}
			</p>
		{/if}
	</div>

	{#if parsedValueChips.length > 0}
		<div class="space-y-2">
			<p class="text-xs wt-text-ui text-wt-muted-fg">
				Parsed values (click to include/exclude instantly)
			</p>
			<div class="flex flex-wrap gap-2">
				{#each parsedValueChips as chip (chip.id)}
					<button
						type="button"
						class="group relative wt-affordance-pill-ghost inline-flex items-center gap-2 border-2 px-3 py-1 text-xs wt-text-ui transition-all {chip.active ? 'border-wt-border bg-wt-surface text-wt-ink' : 'border-wt-border/60 bg-wt-muted text-wt-muted-fg line-through'}"
						style={chip.isJlcBasic ? 'border-radius: 0.6rem;' : undefined}
						onclick={() => toggleParsedValue(chip.id)}
					>
						<span class="h-2.5 w-2.5 rounded-full {seriesToneClass(chip.series)}"></span>
						{chip.label}
						<span class="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-40 -translate-x-1/2 whitespace-pre-line rounded-wt-box border-2 border-wt-border p-3 text-[11px] text-wt-ink {seriesTooltipToneClass(chip.series)} group-hover:block group-focus-visible:block">
							{chipTooltipText(chip)}
						</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if errors.length > 0}
		<div class="rounded-lg border border-red-400/50 bg-red-100/80 p-4 text-sm text-red-700">
			<ul class="list-disc space-y-1 pl-4">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if warnings.length > 0}
		<div class="rounded-lg border border-amber-400/50 bg-amber-100/80 p-4 text-sm text-amber-700">
			<ul class="list-disc space-y-1 pl-4">
				{#each warnings as warning}
					<li>{warning}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<ResultsPanel title="Top results">
		{#if allResults.length === 0}
			<p class="text-sm text-wt-muted-fg">No results yet. Run a calculation to see combinations.</p>
		{:else}
			<p class="mb-3 text-xs text-wt-muted-fg">
				{allResults.length.toLocaleString()} raw matches · showing top {Math.min(5, displayResults.length)} in resistance band ({sortBy} sort)
			</p>
			{#if displayResults.length === 0}
				<p class="text-sm text-wt-muted-fg">
					No results in this resistance band — widen min/max or recalculate.
				</p>
			{:else}
				<div class="flex flex-col gap-4">
					{#each displayResults as result, cardIndex}
						{@const cardKey = dividerCardKey(result)}
						{@const cardSupplyRangeId = `vd-card-supply-${cardIndex}`}
						{@const baseSupply = diagramSupply}
						{@const maxSupply = Math.max(0.1, baseSupply * 2)}
						{@const sliderSupply = cardSupplyByKey[cardKey] ?? baseSupply}
						{@const power = getDividerPowerPresentation(result, sliderSupply)}
						{@const liveOut =
							(result.bottom.total / (result.top.total + result.bottom.total)) * sliderSupply}
						{@const liveRange = calculateDividerVoltageRangeForSupply(result, sliderSupply)}
						<article class="wt-shell-inner wt-no-floating-shadow rounded-wt-box bg-wt-surface p-4">
							<div class="space-y-3">
								<div class="wt-shell-inner wt-no-floating-shadow space-y-2 rounded-wt-box bg-wt-muted/40 px-3 py-2">
									<label
										for={cardSupplyRangeId}
										class="flex flex-wrap items-center gap-2 text-sm wt-text-ui text-wt-ink"
									>
										Supply voltage (this result)
										<span class="tabular-nums">{sliderSupply.toFixed(1)}</span>
										<span class="font-normal text-wt-muted-fg">V</span>
									</label>
									<input
										id={cardSupplyRangeId}
										type="range"
										class="w-full accent-wt-brand-design"
										min={0}
										max={maxSupply}
										step={0.1}
										value={sliderSupply}
										oninput={(e) => {
											const v = Number(e.currentTarget.value);
											cardSupplyByKey = { ...cardSupplyByKey, [cardKey]: v };
										}}
									/>
									<p class="text-xs text-wt-muted-fg">
										Range 0–{maxSupply.toFixed(1)} V (legacy slider span). Error vs target still uses the supply from Calculate ({baseSupply.toFixed(1)} V).
									</p>
								</div>
								<div class="grid gap-1 text-sm md:grid-cols-2">
								<p><span class="wt-text-ui">R_TOP:</span> {result.top.label} = {formatResistorValue(result.top.total)}</p>
								<p><span class="wt-text-ui">R_BOT:</span> {result.bottom.label} = {formatResistorValue(result.bottom.total)}</p>
								<p><span class="wt-text-ui">R_TOP:R_BOT ratio</span> {power.ratioText}</p>
								<p><span class="wt-text-ui">Nominal output:</span> {liveOut.toFixed(3)} V</p>
								<p><span class="wt-text-ui">Error (vs target @ calculate supply):</span> {result.error > 0 ? '+' : ''}{result.error.toFixed(3)} V</p>
								<p><span class="wt-text-ui">Total resistance:</span> {formatResistorValue(result.totalResistance)}</p>
								<p><span class="wt-text-ui">Components:</span> {result.componentCount}</p>
									<p class="md:col-span-2">
										<span class="wt-text-ui">Real-world Vout range:</span>
										{liveRange.min.toFixed(2)} V → {liveRange.max.toFixed(2)} V
									</p>
								<p class="md:col-span-2">
									<span class="wt-text-ui">Power dissipation:</span>
									R_TOP {power.powerTopLabel}, R_BOT {power.powerBotLabel}, total {power.totalPowerLabel}
								</p>
								<p class="md:col-span-2">
									<span class="wt-text-ui">Min package recommendation:</span>
									{power.packageLine}
								</p>
								</div>
							</div>
							{#if power.warnings.length > 0}
								<div class="mt-2 rounded-md border border-amber-400/40 bg-amber-50/90 px-3 py-2 text-xs text-amber-900">
									Power warning: {power.warnings.join(', ')}
								</div>
							{/if}
							<VoltageDividerDiagram {result} supplyVoltage={sliderSupply} targetVoltage={diagramTarget} />
						</article>
					{/each}
				</div>
			{/if}
		{/if}
	</ResultsPanel>
</section>
