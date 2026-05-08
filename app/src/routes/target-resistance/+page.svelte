<script lang="ts">
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import ResultsPanel from '$lib/components/layout/results-panel.svelte';
	import { ensureResistorUtilsLoaded, getResistorUtils } from '$lib/adapters/resistor-utils-browser';
	import { parseRichResistorInputs } from '$lib/domain/parse-rich-resistors';
	import { sanitizeInputResistors } from '$lib/domain/voltage-divider';
	import { formatResistorValue } from '$lib/domain/resistor';

	type TargetResult = {
		label: string;
		total: number;
		errorAbs: number;
		errorPercent: number;
		components: number;
	};

	type SortBy = 'error' | 'components' | 'totalResistanceAsc' | 'totalResistanceDesc';
	type RawResult = {
		combo: number[];
		totalResistance: number;
		error: number;
		errorPercent: number;
		componentCount: number;
	};
	type WorkerPayload = {
		resistors: number[];
		targetValue: number;
		sortBy: SortBy;
		options: {
			maxParallel: number;
			maxSeriesBlocks: number;
			maxBlocks: number;
			maxCombos: number;
			chunkIndex?: number;
			chunkCount?: number;
		};
	};
	type ParsedValueChip = {
		id: string;
		value: number;
		formatted: string;
		active: boolean;
	};
	type CalcStats = {
		inputCount: number;
		activeCount: number;
		filteredCount: number;
		filteredByHeuristic: boolean;
		removedByHeuristic: number;
		workerUsed: boolean;
		workerCount: number;
		maxParallel: number;
		maxSeriesBlocks: number;
		maxBlocks: number;
		maxCombos: number;
		resultCount: number;
		errorFilterFallback: boolean;
	};

	const LIMITS = {
		maxParallel: 10,
		maxSeriesBlocks: 10,
		maxBlocks: 2048,
		maxCombos: 200000,
		maxInputResistors: 60
	} as const;

	let resistorValues = $state('1k, 2.2k, 3.3k, 4.7k, 10k, 22k');
	let targetResistance = $state('50k');
	let sortBy = $state<SortBy>('error');
	let results = $state<TargetResult[]>([]);
	let warnings = $state<string[]>([]);
	let errors = $state<string[]>([]);
	let calculating = $state(false);
	let parsedValues = $state<ParsedValueChip[]>([]);
	let calcStats = $state<CalcStats | null>(null);

	const sortOptions: { value: SortBy; label: string }[] = [
		{ value: 'error', label: 'Lowest error (ohms / %)' },
		{ value: 'components', label: 'Lowest component count' },
		{ value: 'totalResistanceAsc', label: 'Total resistance ascending' },
		{ value: 'totalResistanceDesc', label: 'Total resistance descending' }
	];

	function sortResults(items: TargetResult[], mode: SortBy): TargetResult[] {
		const copy = [...items];
		copy.sort((a, b) => {
			switch (mode) {
				case 'components':
					return a.components - b.components || a.errorAbs - b.errorAbs;
				case 'totalResistanceAsc':
					return a.total - b.total || a.errorAbs - b.errorAbs;
				case 'totalResistanceDesc':
					return b.total - a.total || a.errorAbs - b.errorAbs;
				case 'error':
				default:
					return a.errorAbs - b.errorAbs || a.components - b.components;
			}
		});
		return copy;
	}

	function estimateComboCount(valueCount: number, comboSize: number, cap = Number.MAX_SAFE_INTEGER): number {
		if (comboSize <= 1) return valueCount;
		let total = 1;
		for (let i = 1; i <= comboSize; i++) {
			total = (total * (valueCount + i - 1)) / i;
			if (total > cap) return cap + 1;
		}
		return total;
	}

	function getEffectiveLimits(valueCount: number): WorkerPayload['options'] {
		if (valueCount <= 20) return { ...LIMITS };
		if (valueCount <= 35) {
			return {
				maxParallel: Math.min(8, LIMITS.maxParallel),
				maxSeriesBlocks: Math.min(8, LIMITS.maxSeriesBlocks),
				maxBlocks: 1200,
				maxCombos: 120000
			};
		}
		return {
			maxParallel: Math.min(6, LIMITS.maxParallel),
			maxSeriesBlocks: Math.min(6, LIMITS.maxSeriesBlocks),
			maxBlocks: 800,
			maxCombos: 90000
		};
	}

	function getWorkerCount(resistorCount: number): number {
		if (typeof Worker === 'undefined' || resistorCount < 6) return 0;
		const cores = navigator.hardwareConcurrency || 2;
		if (cores < 2 || resistorCount < 8) return 1;
		return Math.min(cores, 4);
	}

	function sortRawResults(items: RawResult[], mode: SortBy): RawResult[] {
		const copy = [...items];
		copy.sort((a, b) => {
			if (mode === 'components') {
				if (a.componentCount !== b.componentCount) return a.componentCount - b.componentCount;
				return Math.abs(a.error) - Math.abs(b.error);
			}
			if (mode === 'totalResistanceAsc') return a.totalResistance - b.totalResistance;
			if (mode === 'totalResistanceDesc') return b.totalResistance - a.totalResistance;
			return Math.abs(a.error) - Math.abs(b.error);
		});
		return copy;
	}

	function dedupeRawResults(items: RawResult[]): RawResult[] {
		const seen = new Set<string>();
		const out: RawResult[] = [];
		for (const item of items) {
			const norm = [...item.combo].sort((a, b) => a - b).join('|');
			const key = `${norm}|${item.componentCount}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(item);
		}
		return out;
	}

	function applyErrorCutoff(items: RawResult[], maxPercent = 20): RawResult[] {
		const within = items.filter((r) => Number.isFinite(r.errorPercent) && Math.abs(r.errorPercent) <= maxPercent);
		return within.length ? within : items;
	}

	function mapRawToView(items: RawResult[]): TargetResult[] {
		return items.slice(0, 40).map((r) => ({
			label: r.combo.map((v) => formatResistorValue(v)).join(' + '),
			total: r.totalResistance,
			errorAbs: Math.abs(r.error),
			errorPercent: Math.abs(r.errorPercent),
			components: r.componentCount
		}));
	}

	function generateCombinationsSync(
		resistors: number[],
		targetValue: number,
		sort: SortBy,
		options: WorkerPayload['options']
	): RawResult[] {
		const blocks: number[] = [...resistors];
		for (let size = 2; size <= options.maxParallel; size++) {
			if (estimateComboCount(resistors.length, size, options.maxCombos * 3) > options.maxCombos * 3) break;
			let queue: number[][] = [[]];
			for (let d = 0; d < size; d++) {
				const next: number[][] = [];
				for (const prefix of queue) {
					const start = prefix.length ? prefix[prefix.length - 1] : 0;
					for (let i = start; i < resistors.length; i++) next.push([...prefix, i]);
				}
				queue = next;
			}
			for (const idxs of queue) {
				const combo = idxs.map((i) => resistors[i]);
				const reciprocal = combo.reduce((sum, v) => sum + 1 / v, 0);
				blocks.push(1 / reciprocal);
			}
		}

		const rankedBlocks = blocks
			.map((v) => ({ value: v, diff: Math.abs(v - targetValue) }))
			.sort((a, b) => a.diff - b.diff)
			.slice(0, options.maxBlocks)
			.map((e) => e.value);

		const out: RawResult[] = [];
		let generated = 0;
		for (let size = 1; size <= options.maxSeriesBlocks; size++) {
			if (generated >= options.maxCombos) break;
			let queue: number[][] = [[]];
			for (let d = 0; d < size; d++) {
				const next: number[][] = [];
				for (const prefix of queue) {
					const start = prefix.length ? prefix[prefix.length - 1] : 0;
					for (let i = start; i < rankedBlocks.length; i++) next.push([...prefix, i]);
				}
				queue = next;
			}
			for (const idxs of queue) {
				if (generated >= options.maxCombos) break;
				const combo = idxs.map((i) => rankedBlocks[i]);
				const totalResistance = combo.reduce((sum, v) => sum + v, 0);
				const error = totalResistance - targetValue;
				out.push({
					combo,
					totalResistance,
					error,
					errorPercent: (error / targetValue) * 100,
					componentCount: combo.length
				});
				generated += 1;
			}
		}
		return sortRawResults(dedupeRawResults(out), sort);
	}

	function buildWorkerScriptSource(): string {
		return `
		self.onmessage = (event) => {
			const { resistors, targetValue, sortBy, options } = event.data;
			const estimateComboCount = (valueCount, comboSize, cap = Number.MAX_SAFE_INTEGER) => {
				if (comboSize <= 1) return valueCount;
				let total = 1;
				for (let i = 1; i <= comboSize; i++) {
					total = (total * (valueCount + i - 1)) / i;
					if (total > cap) return cap + 1;
				}
				return total;
			};
			const sortResults = (arr) => arr.sort((a, b) => {
				if (sortBy === 'components') {
					if (a.componentCount !== b.componentCount) return a.componentCount - b.componentCount;
					return Math.abs(a.error) - Math.abs(b.error);
				}
				if (sortBy === 'totalResistanceAsc') return a.totalResistance - b.totalResistance;
				if (sortBy === 'totalResistanceDesc') return b.totalResistance - a.totalResistance;
				return Math.abs(a.error) - Math.abs(b.error);
			});
			const blocks = [...resistors];
			for (let size = 2; size <= options.maxParallel; size++) {
				if (estimateComboCount(resistors.length, size, options.maxCombos * 3) > options.maxCombos * 3) break;
				let queue = [[]];
				for (let d = 0; d < size; d++) {
					const next = [];
					for (const prefix of queue) {
						const start = prefix.length ? prefix[prefix.length - 1] : 0;
						for (let i = start; i < resistors.length; i++) next.push([...prefix, i]);
					}
					queue = next;
				}
				for (const idxs of queue) {
					const combo = idxs.map((i) => resistors[i]);
					const reciprocal = combo.reduce((sum, v) => sum + 1 / v, 0);
					blocks.push(1 / reciprocal);
				}
			}
			const ranked = blocks
				.map((v) => ({ value: v, diff: Math.abs(v - targetValue) }))
				.sort((a, b) => a.diff - b.diff)
				.slice(0, options.maxBlocks)
				.map((e) => e.value);
			const chunkIndex = options.chunkIndex || 0;
			const chunkCount = options.chunkCount || 1;
			const chunkSize = Math.ceil(ranked.length / chunkCount);
			const scoped = ranked.slice(chunkIndex * chunkSize, Math.min((chunkIndex + 1) * chunkSize, ranked.length));
			const out = [];
			let generated = 0;
			for (let size = 1; size <= options.maxSeriesBlocks; size++) {
				if (generated >= options.maxCombos) break;
				let queue = [[]];
				for (let d = 0; d < size; d++) {
					const next = [];
					for (const prefix of queue) {
						const start = prefix.length ? prefix[prefix.length - 1] : 0;
						for (let i = start; i < scoped.length; i++) next.push([...prefix, i]);
					}
					queue = next;
				}
				for (const idxs of queue) {
					if (generated >= options.maxCombos) break;
					const combo = idxs.map((i) => scoped[i]);
					const totalResistance = combo.reduce((sum, v) => sum + v, 0);
					const error = totalResistance - targetValue;
					out.push({ combo, totalResistance, error, errorPercent: (error / targetValue) * 100, componentCount: combo.length });
					generated += 1;
				}
			}
			self.postMessage({ type: 'result', results: sortResults(out), chunkIndex });
		};`;
	}

	function createWorker(): Worker {
		const blob = new Blob([buildWorkerScriptSource()], { type: 'text/javascript' });
		return new Worker(URL.createObjectURL(blob));
	}

	function runWorker(payload: WorkerPayload): Promise<RawResult[]> {
		return new Promise((resolve, reject) => {
			const worker = createWorker();
			worker.onmessage = (event) => {
				const data = event.data as { type: string; results?: RawResult[] };
				if (data.type === 'result') {
					resolve(data.results ?? []);
					worker.terminate();
				}
			};
			worker.onerror = (err) => {
				reject(err);
				worker.terminate();
			};
			worker.postMessage(payload);
		});
	}

	async function computeWithWorkers(
		resistors: number[],
		targetValue: number,
		sort: SortBy,
		options: WorkerPayload['options'],
		workerCount: number
	): Promise<RawResult[]> {
		if (workerCount <= 1) {
			return runWorker({ resistors, targetValue, sortBy: sort, options });
		}
		const jobs = Array.from({ length: workerCount }, (_, chunkIndex) =>
			runWorker({
				resistors,
				targetValue,
				sortBy: sort,
				options: { ...options, chunkIndex, chunkCount: workerCount }
			})
		);
		const merged = (await Promise.all(jobs)).flat();
		return sortRawResults(dedupeRawResults(merged), sort);
	}

	async function calculate() {
		calculating = true;
		const nextWarnings: string[] = [];
		const nextErrors: string[] = [];
		try {
			await ensureResistorUtilsLoaded();
			const Ru = getResistorUtils();
			if (!Ru) {
				nextErrors.push('Resistor parser is unavailable.');
				return;
			}

			const parsedTarget = Ru.parseResistorInput(targetResistance);
			const target = Number(parsedTarget?.value);
			if (!Number.isFinite(target) || target <= 0) {
				nextErrors.push('Target resistance must be a positive value (for example, 50k or 4k7(1%)).');
				return;
			}

			const richParse = await parseRichResistorInputs(resistorValues, {
				snapToSeries: false,
				snapSeries: 'E24'
			});
			nextWarnings.push(...richParse.warnings);
			const sanitized = sanitizeInputResistors(richParse.resistors);
			nextWarnings.push(...sanitized.warnings);

			if (sanitized.resistors.length === 0) {
				nextErrors.push('At least one valid resistor value is required.');
				return;
			}

			const nextParsedValues: ParsedValueChip[] = sanitized.resistors.map((r, idx) => {
				const existing = parsedValues.find((p) => p.id === `${r.input}-${idx}`);
				return {
					id: `${r.input}-${idx}`,
					value: r.value,
					formatted: r.formatted || formatResistorValue(r.value),
					active: existing?.active ?? true
				};
			});
			parsedValues = nextParsedValues;

			let values = nextParsedValues.filter((v) => v.active).map((v) => v.value);
			if (values.length === 0) {
				nextErrors.push('At least one parsed value must be active.');
				return;
			}
			const originalCount = values.length;
			if (values.length > LIMITS.maxInputResistors) {
				values = values
					.map((value) => ({ value, diff: Math.abs(value - target) }))
					.sort((a, b) => a.diff - b.diff)
					.slice(0, LIMITS.maxInputResistors)
					.map((entry) => entry.value);
				nextWarnings.push(
					`Input list trimmed to ${LIMITS.maxInputResistors} values for performance (legacy heuristic).`
				);
			}

			const effectiveLimits = getEffectiveLimits(values.length);
			const workerCount = getWorkerCount(values.length);
			let rawResults: RawResult[];
			try {
				rawResults =
					workerCount > 0
						? await computeWithWorkers(values, target, sortBy, effectiveLimits, workerCount)
						: generateCombinationsSync(values, target, sortBy, effectiveLimits);
			} catch (error) {
				nextWarnings.push(
					`Worker calculation failed; fallback search used (${error instanceof Error ? error.message : String(error)}).`
				);
				rawResults = generateCombinationsSync(values, target, sortBy, effectiveLimits);
			}

			const withinCutoff = rawResults.filter((r) => Number.isFinite(r.errorPercent) && Math.abs(r.errorPercent) <= 20);
			const cutoffFallback = withinCutoff.length === 0 && rawResults.length > 0;
			rawResults = withinCutoff.length ? withinCutoff : rawResults;
			results = mapRawToView(rawResults);
			if (!rawResults.length) {
				nextWarnings.push('No combinations found within current search limits.');
			}
			if (workerCount > 0) {
				nextWarnings.push(
					`Worker search used (${workerCount} worker${workerCount === 1 ? '' : 's'}) with expanded combo space.`
				);
			} else {
				nextWarnings.push('Single-thread search used for this input size.');
			}
			calcStats = {
				inputCount: sanitized.resistors.length,
				activeCount: originalCount,
				filteredCount: values.length,
				filteredByHeuristic: originalCount !== values.length,
				removedByHeuristic: Math.max(0, originalCount - values.length),
				workerUsed: workerCount > 0,
				workerCount,
				maxParallel: effectiveLimits.maxParallel,
				maxSeriesBlocks: effectiveLimits.maxSeriesBlocks,
				maxBlocks: effectiveLimits.maxBlocks,
				maxCombos: effectiveLimits.maxCombos,
				resultCount: results.length,
				errorFilterFallback: cutoffFallback
			};
		} finally {
			warnings = nextWarnings;
			errors = nextErrors;
			calculating = false;
		}
	}

	$effect(() => {
		if (!results.length) return;
		results = sortResults(results, sortBy);
	});

	function toggleParsedValue(id: string) {
		parsedValues = parsedValues.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
	}
</script>

<section class="space-y-5">
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

	<div>
		<Button onclick={() => void calculate()} disabled={calculating}>
			{calculating ? 'Calculating…' : 'Find closest matches'}
		</Button>
	</div>

	{#if parsedValues.length > 0}
		<div class="space-y-2">
			<p class="text-sm wt-text-ui">Parsed values (click to include/exclude)</p>
			<div class="flex flex-wrap gap-2">
				{#each parsedValues as parsed}
					<button
						type="button"
						class="wt-affordance-pill-ghost px-3 py-1 text-xs wt-text-ui {parsed.active ? 'bg-wt-surface text-wt-ink' : 'bg-wt-muted text-wt-muted-fg opacity-70'}"
						onclick={() => toggleParsedValue(parsed.id)}
					>
						{parsed.formatted}
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
				{#each results as result, index}
					<article class="wt-shell-inner wt-no-floating-shadow rounded-wt-box bg-wt-surface p-3">
						<p class="text-sm wt-text-body-strong">{result.label}</p>
						<p class="text-xs text-wt-muted-fg">
							{formatResistorValue(result.total)} · error {formatResistorValue(result.errorAbs)} ({result.errorPercent.toFixed(2)}%) · {result.components}
							component{result.components === 1 ? '' : 's'}
						</p>
						<div
							class="mt-3 wt-shell-inner wt-no-floating-shadow rounded-wt-box bg-wt-muted/30 p-3 text-xs text-wt-muted-fg"
							aria-label={`Diagram placeholder ${index + 1}`}
						>
							Diagram placeholder (unified diagram system integration pending).
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</ResultsPanel>

	{#if calcStats}
		<ResultsPanel title="Calculation stats">
			<div class="grid gap-1 text-sm">
				<p><span class="wt-text-ui">Inputs:</span> {calcStats.inputCount} total, {calcStats.activeCount} active</p>
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
				<p>
					<span class="wt-text-ui">Worker used:</span>
					{calcStats.workerUsed ? `yes (${calcStats.workerCount})` : 'no'}
				</p>
				<p><span class="wt-text-ui">Displayed results:</span> {calcStats.resultCount}</p>
				<p><span class="wt-text-ui">20% cutoff fallback:</span> {calcStats.errorFilterFallback ? 'yes' : 'no'}</p>
			</div>
		</ResultsPanel>
	{/if}
</section>
