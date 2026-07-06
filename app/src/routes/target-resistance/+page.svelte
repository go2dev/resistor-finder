<script lang="ts">
	import { base } from '$app/paths';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import ResultsPanel from '$lib/components/layout/results-panel.svelte';
	import TargetNetworkDiagram from '$lib/components/diagrams/target-network-diagram.svelte';
	import { ensureResistorUtilsLoaded, getResistorUtils } from '$lib/adapters/resistor-utils-browser';
	import { parseRichResistorInputs } from '$lib/domain/parse-rich-resistors';
	import { formatResistorValue } from '$lib/domain/resistor';
	import {
		LIMITS,
		applyErrorFilter,
		applyResistorHeuristic,
		buildResults,
		createTargetResistanceEngine,
		dedupeResults,
		filterResultsByExcludedKeys,
		formatCombination,
		generateCombinations,
		getEffectiveLimits,
		getSafeResistanceRange,
		sortResults,
		type ComboNode,
		type ComboResistor,
		type EvaluatedCombo,
		type GenerateCombinationsStats,
		type TargetLimits,
		type TargetSortBy
	} from '$lib/domain/target-resistance';

	type SortBy = TargetSortBy;
	type ParsedValueChip = {
		id: string;
		input: string;
		value: number;
		formatted: string;
		tolerancePct: number;
		series?: string | null;
		powerRating?: number | null;
		powerCode?: string | null;
		isJlcBasic?: boolean;
		source?: string;
		active: boolean;
	};
	type TargetResult = {
		label: string;
		combo: ComboNode;
		total: number;
		errorAbs: number;
		errorPercent: number;
		components: number;
		rangeText: string;
	};
	type CalcStats = {
		inputCount: number;
		filteredCount: number;
		filteredByHeuristic: boolean;
		removedByHeuristic: number;
		workerUsed: boolean;
		workerCount: number;
		maxParallel: number;
		maxSeriesBlocks: number;
		maxBlocks: number;
		maxCombos: number;
		blockCount: number | null;
		comboCount: number | null;
		prunedBlocks: number;
		prunedCombos: number;
		errorFilterFallback: boolean;
		calculationTimeMs: number | null;
	};
	type AggregatedGenStats = {
		blockCount: number | null;
		comboCount: number | null;
		prunedBlocks: number;
		prunedCombos: number;
	};

	let resistorValues = $state(
		'1k, 2.2k, 3.3k, 4.7k, 10k, 22k, 5K11, 96C, EB1041, 100R(0.1%), 220R(5%), 4k7, 49R9, 73k2(10%), 0R, 8M2'
	);
	let targetResistance = $state('50k');
	let sortBy = $state<SortBy>('error');
	let snapToSeries = $state(false);
	let snapSeriesPick = $state('E24');
	let autofillDecade = $state('100');
	let parsedValues = $state<ParsedValueChip[]>([]);
	// Raw state: result sets can be large (up to maxCombos entries) and are only
	// ever replaced wholesale, so skip deep proxying.
	let allResults = $state.raw<EvaluatedCombo[]>([]);
	let results = $state<TargetResult[]>([]);
	let warnings = $state<string[]>([]);
	let errors = $state<string[]>([]);
	let calculating = $state(false);
	let calcStats = $state<CalcStats | null>(null);
	let progress = $state<{ processed: number; total: number } | null>(null);

	const activeCount = $derived(parsedValues.filter((p) => p.active).length);
	const progressText = $derived(
		progress && progress.total > 0
			? `${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()} (${((progress.processed / progress.total) * 100).toFixed(1)}%)`
			: null
	);

	const sortOptions: { value: SortBy; label: string }[] = [
		{ value: 'error', label: 'Lowest error (ohms / %)' },
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
				? `Parsed: ${chip.formatted} from ${chip.source} (${chip.input})`
				: `Parsed: ${chip.formatted}`;
		const parts = [
			`Input: ${chip.input}`,
			parsedLine,
			`Series: ${chip.series ?? 'unknown'}`,
			`Tolerance: ±${chip.tolerancePct}%`
		];
		if (chip.isJlcBasic) parts.push('JLC Basic');
		if (chip.powerCode) parts.push(`Power code: ${chip.powerCode}`);
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

	function fmtValue(value: number): string {
		const Ru = getResistorUtils();
		return Ru ? Ru.formatResistorValue(value) : formatResistorValue(value);
	}

	function getWorkerCount(resistorCount: number): number {
		if (typeof Worker === 'undefined' || resistorCount < 6) return 0;
		const cores = navigator.hardwareConcurrency || 2;
		if (cores < 2 || resistorCount < 8) return 1;
		return Math.min(cores, 4);
	}

	function rangeTextFor(combo: ComboNode): string {
		const range = getSafeResistanceRange(combo);
		if (!range) return '—';
		return `${fmtValue(range.lower)} → ${fmtValue(range.upper)}`;
	}

	function refreshVisibleResults() {
		const excludedKeys = parsedValues.filter((p) => !p.active).map((p) => p.id);
		const sorted = sortResults([...allResults], sortBy);
		const visible = filterResultsByExcludedKeys(sorted, excludedKeys);
		results = visible.slice(0, 40).map((r) => ({
			label: formatCombination(r.combo, fmtValue),
			combo: r.combo,
			total: r.totalResistance,
			errorAbs: Math.abs(r.error),
			errorPercent: Math.abs(r.errorPercent),
			components: r.componentCount,
			rangeText: rangeTextFor(r.combo)
		}));
	}

	// The Blob worker cannot import modules, so the whole engine factory is
	// embedded as source. It must stay self-contained (see target-resistance.ts).
	function buildWorkerScriptSource(): string {
		return `
		const engine = (${createTargetResistanceEngine.toString()})();
		self.onmessage = (event) => {
			const data = event.data || {};
			const { resistors, targetValue, sortBy, options } = data;
			const chunkIndex = data.chunkIndex ?? 0;
			const chunkCount = data.chunkCount ?? 1;
			try {
				const generated = engine.generateCombinations(resistors, {
					maxParallel: options.maxParallel,
					maxSeriesBlocks: options.maxSeriesBlocks,
					maxBlocks: options.maxBlocks,
					maxCombos: options.maxCombos,
					maxParallelCombos: options.maxParallelCombos,
					targetValue,
					chunkIndex,
					chunkCount,
					onProgress: (processed, total) => {
						self.postMessage({ type: 'progress', processed, total, chunkIndex });
					}
				});
				const results = engine.sortResults(engine.buildResults(generated.combinations, targetValue), sortBy);
				self.postMessage({ type: 'result', results, stats: generated.stats, chunkIndex });
			} catch (error) {
				self.postMessage({
					type: 'error',
					error: error instanceof Error ? error.message : String(error),
					chunkIndex
				});
			}
		};`;
	}

	function createWorker(): Worker {
		const blob = new Blob([buildWorkerScriptSource()], { type: 'text/javascript' });
		return new Worker(URL.createObjectURL(blob));
	}

	const progressByWorker = new Map<number, { processed: number; total: number }>();

	function updateAggregatedProgress() {
		let processedSum = 0;
		let totalSum = 0;
		progressByWorker.forEach((entry) => {
			processedSum += entry.processed || 0;
			totalSum += entry.total || 0;
		});
		if (totalSum > 0) {
			progress = { processed: processedSum, total: totalSum };
		}
	}

	function runWorkerChunk(payload: {
		resistors: ComboResistor[];
		targetValue: number;
		sortBy: SortBy;
		options: TargetLimits;
		chunkIndex: number;
		chunkCount: number;
	}): Promise<{ results: EvaluatedCombo[]; stats: GenerateCombinationsStats | null }> {
		return new Promise((resolve, reject) => {
			const worker = createWorker();
			const cleanup = () => worker.terminate();
			worker.onmessage = (event) => {
				const data = event.data as {
					type: string;
					results?: EvaluatedCombo[];
					stats?: GenerateCombinationsStats;
					error?: string;
					processed?: number;
					total?: number;
					chunkIndex?: number;
				};
				if (data.type === 'progress') {
					if (Number.isFinite(data.processed) && Number.isFinite(data.total) && (data.total ?? 0) > 0) {
						progressByWorker.set(data.chunkIndex ?? payload.chunkIndex, {
							processed: data.processed ?? 0,
							total: data.total ?? 0
						});
						updateAggregatedProgress();
					}
					return;
				}
				if (data.type === 'result') {
					const progressKey = data.chunkIndex ?? payload.chunkIndex;
					const entry = progressByWorker.get(progressKey);
					if (entry && entry.total) {
						progressByWorker.set(progressKey, { processed: entry.total, total: entry.total });
						updateAggregatedProgress();
					}
					cleanup();
					resolve({ results: data.results ?? [], stats: data.stats ?? null });
				} else if (data.type === 'error') {
					cleanup();
					reject(new Error(data.error || 'Worker failed'));
				}
			};
			worker.onerror = (err) => {
				cleanup();
				reject(err instanceof ErrorEvent && err.message ? new Error(err.message) : new Error('Worker failed'));
			};
			worker.postMessage(payload);
		});
	}

	async function computeWithWorkers(
		resistors: ComboResistor[],
		targetValue: number,
		sortByMode: SortBy,
		limits: TargetLimits,
		workerCount: number
	): Promise<{ results: EvaluatedCombo[]; stats: AggregatedGenStats }> {
		progressByWorker.clear();
		if (workerCount <= 1) {
			const single = await runWorkerChunk({
				resistors,
				targetValue,
				sortBy: sortByMode,
				options: limits,
				chunkIndex: 0,
				chunkCount: 1
			});
			return {
				results: single.results,
				stats: {
					blockCount: single.stats?.blockCount ?? null,
					comboCount: single.stats?.comboCount ?? null,
					prunedBlocks: single.stats?.prunedBlocks ?? 0,
					prunedCombos: single.stats?.prunedCombos ?? 0
				}
			};
		}

		// Legacy runWorkerCalculationParallel: split the combo budget evenly and
		// take blockCount/prunedBlocks from the first worker that reports stats.
		const perWorkerMaxCombos = Math.ceil(limits.maxCombos / workerCount);
		const jobs = Array.from({ length: workerCount }, (_, chunkIndex) =>
			runWorkerChunk({
				resistors,
				targetValue,
				sortBy: sortByMode,
				options: { ...limits, maxCombos: perWorkerMaxCombos },
				chunkIndex,
				chunkCount: workerCount
			})
		);
		const settled = await Promise.all(jobs);
		const aggregated: AggregatedGenStats = {
			blockCount: null,
			comboCount: 0,
			prunedBlocks: 0,
			prunedCombos: 0
		};
		const merged: EvaluatedCombo[] = [];
		for (const chunk of settled) {
			merged.push(...chunk.results);
			if (chunk.stats) {
				aggregated.prunedCombos += chunk.stats.prunedCombos ?? 0;
				if (aggregated.blockCount == null && chunk.stats.blockCount != null) {
					aggregated.blockCount = chunk.stats.blockCount;
					aggregated.prunedBlocks = chunk.stats.prunedBlocks ?? 0;
				}
			}
		}
		aggregated.comboCount = merged.length;
		return { results: merged, stats: aggregated };
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

	function toggleParsedValue(id: string) {
		parsedValues = parsedValues.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
		refreshVisibleResults();
	}

	async function calculate() {
		calculating = true;
		progress = null;
		progressByWorker.clear();
		// Legacy resets the sort mode on every fresh Calculate click.
		sortBy = 'error';
		allResults = [];
		results = [];
		const nextWarnings: string[] = [];
		const nextErrors: string[] = [];
		const calculationStart = performance.now();
		try {
			await ensureResistorUtilsLoaded();
			const Ru = getResistorUtils();
			if (!Ru) {
				nextErrors.push('Resistor parser is unavailable.');
				return;
			}

			let target: number;
			try {
				const parsedTarget = Ru.parseResistorInput(targetResistance, {
					snapToSeries,
					snapSeries: snapSeriesPick
				});
				target = Number(parsedTarget?.value);
			} catch (e) {
				nextErrors.push(`Target resistance: ${e instanceof Error ? e.message : String(e)}`);
				return;
			}
			if (!Number.isFinite(target) || target <= 0) {
				nextErrors.push('Target resistance must be a positive value (for example, 50k or 4k7(1%)).');
				return;
			}

			const richParse = await parseRichResistorInputs(resistorValues, {
				snapToSeries,
				snapSeries: snapSeriesPick
			});
			nextWarnings.push(...richParse.warnings);

			if (richParse.resistors.length === 0) {
				nextErrors.push('At least one valid resistor value is required.');
				return;
			}

			const nextParsed = richParse.resistors.map((r, idx) => {
				let resolvedSeries = r.series ?? null;
				if (!resolvedSeries && r.tolerance != null) {
					resolvedSeries = Ru.getSeriesForTolerance?.(r.tolerance) ?? null;
				}
				if (!resolvedSeries) {
					resolvedSeries = Ru.findResistorSeries?.(r.value) ?? null;
				}
				const fallbackSeries =
					resolvedSeries && Ru.resistorTolerances[resolvedSeries] != null
						? Ru.resistorTolerances[resolvedSeries]
						: 0;
				const tolerancePct = r.tolerance ?? fallbackSeries;
				const id = `${r.input}-${idx}`;
				const existing = parsedValues.find((p) => p.id === id);
				return {
					id,
					input: r.input,
					value: r.value,
					formatted: r.formatted,
					tolerancePct,
					series: resolvedSeries,
					powerRating: r.powerRating ?? null,
					powerCode: r.powerCode ?? null,
					isJlcBasic: r.isJlcBasic ?? false,
					source: r.source,
					active: existing?.active ?? true
				};
			});
			parsedValues = nextParsed;

			if (nextParsed.length === 0) {
				nextErrors.push('At least one parsed value is required.');
				return;
			}

			// Legacy searches on all parsed inputs and filters excluded values
			// out of the displayed results afterwards.
			const engineResistors: ComboResistor[] = nextParsed.map((chip, idx) => ({
				id: idx,
				key: chip.id,
				value: chip.value,
				tolerance: chip.tolerancePct,
				series: chip.series ?? null,
				powerRating: chip.powerRating ?? null,
				powerCode: chip.powerCode ?? null
			}));

			const heuristic = applyResistorHeuristic(engineResistors, target, LIMITS.maxInputResistors);
			const filteredResistors = heuristic.resistors;
			if (heuristic.trimmed) {
				nextWarnings.push(
					`Input list trimmed to ${filteredResistors.length} parsed values for performance (legacy heuristic, cap ${LIMITS.maxInputResistors}).`
				);
			}

			const effective = getEffectiveLimits(filteredResistors.length);
			const workerCount = getWorkerCount(filteredResistors.length);
			let raw: EvaluatedCombo[] = [];
			let genStats: AggregatedGenStats = {
				blockCount: null,
				comboCount: null,
				prunedBlocks: 0,
				prunedCombos: 0
			};

			if (workerCount > 0) {
				try {
					const workerResult = await computeWithWorkers(filteredResistors, target, sortBy, effective, workerCount);
					raw = workerResult.results;
					genStats = workerResult.stats;
				} catch (e) {
					nextWarnings.push(
						`Worker failed: ${e instanceof Error ? e.message : String(e)}. Falling back to local calculation.`
					);
				}
			}
			if (raw.length === 0) {
				const generated = generateCombinations(filteredResistors, {
					maxParallel: effective.maxParallel,
					maxSeriesBlocks: effective.maxSeriesBlocks,
					maxBlocks: effective.maxBlocks,
					maxCombos: effective.maxCombos,
					maxParallelCombos: effective.maxParallelCombos,
					targetValue: target
				});
				genStats = {
					blockCount: generated.stats.blockCount,
					comboCount: generated.stats.comboCount,
					prunedBlocks: generated.stats.prunedBlocks,
					prunedCombos: generated.stats.prunedCombos
				};
				raw = buildResults(generated.combinations, target);
			}

			const deduped = dedupeResults(raw);
			sortResults(deduped, sortBy);
			const filtered = applyErrorFilter(deduped, 20);
			allResults = filtered.results;
			refreshVisibleResults();

			if (!filtered.results.length) {
				nextWarnings.push('No combinations found within current search limits.');
			}

			calcStats = {
				inputCount: nextParsed.length,
				filteredCount: filteredResistors.length,
				filteredByHeuristic: heuristic.trimmed,
				removedByHeuristic: heuristic.removedCount,
				workerUsed: workerCount > 0,
				workerCount,
				maxParallel: effective.maxParallel,
				maxSeriesBlocks: effective.maxSeriesBlocks,
				maxBlocks: effective.maxBlocks,
				maxCombos: effective.maxCombos,
				blockCount: genStats.blockCount,
				comboCount: genStats.comboCount,
				prunedBlocks: genStats.prunedBlocks,
				prunedCombos: genStats.prunedCombos,
				errorFilterFallback: filtered.fallbackUsed,
				calculationTimeMs: Math.round(performance.now() - calculationStart)
			};
		} catch (e) {
			nextErrors.push(`Calculation failed: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			warnings = nextWarnings;
			errors = nextErrors;
			calculating = false;
			progress = null;
		}
	}

	$effect(() => {
		void sortBy;
		if (!allResults.length) return;
		refreshVisibleResults();
	});
</script>

<section class="w-full space-y-6">
	<div class="space-y-1">
		<h2 class="text-xl wt-text-heading">Target Resistance</h2>
		<p class="text-sm wt-text-body text-wt-muted-fg">
			Find the closest single, series, and parallel matches from your available resistor list.
		</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="space-y-2 md:col-span-2">
			<label for="tr-values" class="text-sm wt-text-ui">Available resistor values</label>
			<Input id="tr-values" bind:value={resistorValues} />
			<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
				<Button type="button" variant="outline" size="sm" onclick={() => void autofillCommonSeries()}>
					Autofill decade values
				</Button>
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs wt-text-ui text-wt-muted-fg">Decade</span>
					<select
						bind:value={autofillDecade}
						class="inline-flex h-9 rounded-wt-box wt-shell-inner wt-no-floating-shadow bg-wt-surface px-2 text-sm text-wt-ink"
					>
						{#each decadeOptions as d}
							<option value={d.value}>{d.label}</option>
						{/each}
					</select>
					<span class="text-xs wt-text-ui text-wt-muted-fg">Series</span>
					<select
						bind:value={snapSeriesPick}
						class="inline-flex h-9 rounded-wt-box wt-shell-inner wt-no-floating-shadow bg-wt-surface px-2 text-sm text-wt-ink"
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

		<div class="space-y-2">
			<label for="tr-target" class="text-sm wt-text-ui">Target resistance</label>
			<Input id="tr-target" bind:value={targetResistance} />
		</div>
		<div class="space-y-2">
			<label for="tr-sort" class="text-sm wt-text-ui">Sort by</label>
			<select
				id="tr-sort"
				bind:value={sortBy}
				class="wt-shell-inner wt-no-floating-shadow inline-flex h-10 w-full rounded-wt-box bg-wt-surface px-3 text-sm wt-text-ui text-wt-ink outline-none focus-visible:ring-2 focus-visible:ring-wt-brand-design focus-visible:ring-offset-2 focus-visible:ring-offset-wt-canvas"
			>
				{#each sortOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<div class="flex items-center gap-2">
			<input id="tr-snap" type="checkbox" checked={snapToSeries} onchange={(e) => (snapToSeries = (e.currentTarget as HTMLInputElement).checked)} class="h-4 w-4 accent-wt-brand-design" />
			<label for="tr-snap" class="text-sm wt-text-ui">Snap parsed inputs to E-series</label>
		</div>
		<Button onclick={() => void calculate()} disabled={calculating}>
			{calculating ? 'Calculating…' : 'Find closest matches'}
		</Button>
		{#if calculating}
			<span class="text-xs wt-text-ui text-wt-muted-fg" aria-live="polite">
				{progressText ?? 'Preparing…'}
			</span>
		{/if}
	</div>

	{#if parsedValues.length > 0}
		<div class="space-y-2">
			<p class="text-sm wt-text-ui">Parsed values (click to include/exclude instantly)</p>
			<div class="flex flex-wrap gap-2">
				{#each parsedValues as parsed (parsed.id)}
					<button
						type="button"
						class="group relative wt-affordance-pill-ghost inline-flex items-center gap-2 border-2 px-3 py-1 text-xs wt-text-ui transition-all {parsed.active ? 'border-wt-border bg-wt-surface text-wt-ink' : 'border-wt-border/60 bg-wt-muted text-wt-muted-fg line-through'}"
						style={parsed.isJlcBasic ? 'border-radius: 0.6rem;' : undefined}
						onclick={() => toggleParsedValue(parsed.id)}
					>
						<span class="h-2.5 w-2.5 rounded-full {seriesToneClass(parsed.series)}"></span>
						{parsed.formatted}
						<span class="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-40 -translate-x-1/2 whitespace-pre-line rounded-wt-box border-2 border-wt-border p-3 text-[11px] text-wt-ink {seriesTooltipToneClass(parsed.series)} group-hover:block group-focus-visible:block">
							{chipTooltipText(parsed)}
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

	<ResultsPanel title="Top matches">
		{#if results.length === 0}
			<p class="text-sm wt-text-body text-wt-muted-fg">
				No results yet. Run a calculation to see closest combinations.
			</p>
		{:else}
			<div class="grid gap-3">
				{#each results as result}
					<article class="wt-shell-inner wt-no-floating-shadow rounded-wt-box bg-wt-surface p-3">
						<p class="text-sm wt-text-body-strong">{result.label}</p>
						<p class="text-xs text-wt-muted-fg">
							{fmtValue(result.total)} · error {fmtValue(result.errorAbs)} ({result.errorPercent.toFixed(2)}%) · {result.components}
							component{result.components === 1 ? '' : 's'}
						</p>
						<p class="text-xs text-wt-muted-fg">Tolerance range: {result.rangeText}</p>
						<TargetNetworkDiagram
							combo={result.combo}
							totalResistance={result.total}
							comboLabel={result.label}
							targetInput={targetResistance}
						/>
					</article>
				{/each}
			</div>
		{/if}
	</ResultsPanel>

	{#if calcStats}
		<ResultsPanel title="Calculation stats">
			<div class="grid gap-1 text-sm">
				<p><span class="wt-text-ui">Inputs:</span> {calcStats.inputCount} total, {activeCount} active</p>
				<p>
					<span class="wt-text-ui">Filtered inputs used:</span> {calcStats.filteredCount}
					{#if calcStats.filteredByHeuristic}
						(reduced by {calcStats.removedByHeuristic}, cap {LIMITS.maxInputResistors})
					{/if}
				</p>
				<p>
					<span class="wt-text-ui">Limits:</span>
					parallel {calcStats.maxParallel}, series blocks {calcStats.maxSeriesBlocks}, block cap {calcStats.maxBlocks}, combo cap {calcStats.maxCombos.toLocaleString()}
				</p>
				<p><span class="wt-text-ui">Worker used:</span> {calcStats.workerUsed ? `yes (${calcStats.workerCount})` : 'no'}</p>
				<p><span class="wt-text-ui">Block count:</span> {calcStats.blockCount != null ? calcStats.blockCount.toLocaleString() : 'n/a'}</p>
				<p><span class="wt-text-ui">Generated combos:</span> {calcStats.comboCount != null ? calcStats.comboCount.toLocaleString() : 'n/a'}</p>
				<p>
					<span class="wt-text-ui">Pruned blocks:</span> {calcStats.prunedBlocks.toLocaleString()},
					<span class="wt-text-ui">pruned combos:</span> {calcStats.prunedCombos.toLocaleString()}
				</p>
				<p><span class="wt-text-ui">Displayed results:</span> {results.length}</p>
				<p><span class="wt-text-ui">20% cutoff fallback:</span> {calcStats.errorFilterFallback ? 'yes' : 'no'}</p>
				<p><span class="wt-text-ui">Calculation time:</span> {calcStats.calculationTimeMs != null ? `${calcStats.calculationTimeMs}ms` : 'n/a'}</p>
			</div>
		</ResultsPanel>
	{/if}
</section>
