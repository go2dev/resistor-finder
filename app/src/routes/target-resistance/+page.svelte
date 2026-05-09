<script lang="ts">
	import { base } from '$app/paths';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import ResultsPanel from '$lib/components/layout/results-panel.svelte';
	import { ensureResistorUtilsLoaded, getResistorUtils } from '$lib/adapters/resistor-utils-browser';
	import { parseRichResistorInputs } from '$lib/domain/parse-rich-resistors';
	import { formatResistorValue } from '$lib/domain/resistor';

	type SortBy = 'error' | 'components' | 'totalResistanceAsc' | 'totalResistanceDesc';
	type ParsedValueChip = {
		id: string;
		input: string;
		value: number;
		formatted: string;
		tolerancePct: number;
		series?: string | null;
		powerCode?: string | null;
		isJlcBasic?: boolean;
		source?: string;
		active: boolean;
	};
	type Block = {
		id: string;
		label: string;
		total: number;
		componentCount: number;
		lower: number;
		upper: number;
		keys: string[];
	};
	type RawResult = {
		signature: string;
		label: string;
		totalResistance: number;
		error: number;
		errorPercent: number;
		componentCount: number;
		rangeLower: number;
		rangeUpper: number;
		keys: string[];
	};
	type TargetResult = {
		label: string;
		total: number;
		errorAbs: number;
		errorPercent: number;
		components: number;
		rangeText: string;
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
		comboCount: number;
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

	let resistorValues = $state(
		'1k, 2.2k, 3.3k, 4.7k, 10k, 22k, 5K11, 96C, EB1041, 100R(0.1%), 220R(5%), 4k7, 49R9, 73k2(10%), 0R, 8M2'
	);
	let targetResistance = $state('50k');
	let sortBy = $state<SortBy>('error');
	let snapToSeries = $state(false);
	let snapSeriesPick = $state('E24');
	let autofillDecade = $state('100');
	let parsedValues = $state<ParsedValueChip[]>([]);
	let allRawResults = $state<RawResult[]>([]);
	let results = $state<TargetResult[]>([]);
	let warnings = $state<string[]>([]);
	let errors = $state<string[]>([]);
	let calculating = $state(false);
	let calcStats = $state<CalcStats | null>(null);

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

	function estimateComboCount(valueCount: number, comboSize: number, cap = Number.MAX_SAFE_INTEGER): number {
		if (comboSize <= 1) return valueCount;
		let total = 1;
		for (let i = 1; i <= comboSize; i++) {
			total = (total * (valueCount + i - 1)) / i;
			if (total > cap) return cap + 1;
		}
		return total;
	}

	function getEffectiveLimits(valueCount: number) {
		if (valueCount <= 20) return { ...LIMITS };
		if (valueCount <= 35) {
			return { maxParallel: 8, maxSeriesBlocks: 8, maxBlocks: 1200, maxCombos: 120000 };
		}
		return { maxParallel: 6, maxSeriesBlocks: 6, maxBlocks: 800, maxCombos: 90000 };
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
			if (seen.has(item.signature)) continue;
			seen.add(item.signature);
			out.push(item);
		}
		return out;
	}

	function mapRawToView(items: RawResult[]): TargetResult[] {
		return items.slice(0, 40).map((r) => ({
			label: r.label,
			total: r.totalResistance,
			errorAbs: Math.abs(r.error),
			errorPercent: Math.abs(r.errorPercent),
			components: r.componentCount,
			rangeText: `${formatResistorValue(r.rangeLower)} → ${formatResistorValue(r.rangeUpper)}`
		}));
	}

	function filterRawByActiveKeys(items: RawResult[], activeKeys: Set<string>): RawResult[] {
		if (!activeKeys.size) return [];
		return items.filter((item) => item.keys.every((key) => activeKeys.has(key)));
	}

	function refreshVisibleResults() {
		const activeKeys = new Set(parsedValues.filter((p) => p.active).map((p) => p.id));
		const visible = filterRawByActiveKeys(sortRawResults(allRawResults, sortBy), activeKeys);
		results = mapRawToView(visible);
		if (calcStats) {
			calcStats = { ...calcStats, activeCount: activeKeys.size, resultCount: results.length };
		}
	}

	function buildBlocks(entries: ParsedValueChip[], target: number, maxParallel: number, maxBlocks: number): Block[] {
		const blocks: Block[] = entries.map((e, i) => ({
			id: `s-${i}`,
			label: e.formatted,
			total: e.value,
			componentCount: 1,
			lower: e.value * (1 - e.tolerancePct / 100),
			upper: e.value * (1 + e.tolerancePct / 100),
			keys: [e.id]
		}));
		for (let size = 2; size <= maxParallel; size++) {
			if (estimateComboCount(entries.length, size, maxBlocks * 4) > maxBlocks * 4) break;
			let queue: number[][] = [[]];
			for (let d = 0; d < size; d++) {
				const next: number[][] = [];
				for (const prefix of queue) {
					const start = prefix.length ? prefix[prefix.length - 1] : 0;
					for (let i = start; i < entries.length; i++) next.push([...prefix, i]);
				}
				queue = next;
			}
			for (const idxs of queue) {
				const members = idxs.map((i) => entries[i]);
				const reciprocal = members.reduce((sum, m) => sum + 1 / m.value, 0);
				const total = 1 / reciprocal;
				const lower = 1 / members.reduce((sum, m) => sum + 1 / (m.value * (1 - m.tolerancePct / 100)), 0);
				const upper = 1 / members.reduce((sum, m) => sum + 1 / (m.value * (1 + m.tolerancePct / 100)), 0);
				blocks.push({
					id: `p-${idxs.join('-')}`,
					label: `(${members.map((m) => m.formatted).join(' || ')})`,
					total,
					componentCount: members.length,
					lower,
					upper,
					keys: members.map((m) => m.id)
				});
			}
		}

		const ranked = blocks
			.map((b) => ({ block: b, diff: Math.abs(b.total - target) }))
			.sort((a, b) => a.diff - b.diff);
		const primary = ranked.slice(0, maxBlocks);
		const extremes = ranked.slice(0, Math.min(5, ranked.length)).concat(ranked.slice(-5));
		const unique = new Map<string, Block>();
		for (const item of [...primary, ...extremes]) unique.set(item.block.id, item.block);
		return [...unique.values()];
	}

	function generateSeriesCombosFromBlocks(
		blocks: Block[],
		targetValue: number,
		sortByMode: SortBy,
		opts: { maxSeriesBlocks: number; maxCombos: number; chunkIndex?: number; chunkCount?: number }
	): RawResult[] {
		const chunkIndex = opts.chunkIndex ?? 0;
		const chunkCount = opts.chunkCount ?? 1;
		const chunkSize = Math.ceil(blocks.length / chunkCount);
		const firstStart = chunkIndex * chunkSize;
		const firstEnd = Math.min(firstStart + chunkSize, blocks.length);
		const out: RawResult[] = [];
		let generated = 0;

		const pushCombo = (indices: number[]) => {
			if (generated >= opts.maxCombos) return;
			const chosen = indices.map((i) => blocks[i]);
			const total = chosen.reduce((sum, b) => sum + b.total, 0);
			const lower = chosen.reduce((sum, b) => sum + b.lower, 0);
			const upper = chosen.reduce((sum, b) => sum + b.upper, 0);
			const error = total - targetValue;
			const label = chosen.map((b) => b.label).join(' + ');
			const keys = Array.from(new Set(chosen.flatMap((b) => b.keys))).sort();
			out.push({
				signature: `${indices.join('|')}::${keys.join(',')}`,
				label,
				totalResistance: total,
				error,
				errorPercent: (error / targetValue) * 100,
				componentCount: chosen.reduce((sum, b) => sum + b.componentCount, 0),
				rangeLower: lower,
				rangeUpper: upper,
				keys
			});
			generated += 1;
		};

		for (let size = 1; size <= opts.maxSeriesBlocks; size++) {
			if (generated >= opts.maxCombos) break;
			for (let first = firstStart; first < firstEnd; first++) {
				if (generated >= opts.maxCombos) break;
				if (size === 1) {
					pushCombo([first]);
					continue;
				}
				let queue: number[][] = [[first]];
				for (let depth = 1; depth < size; depth++) {
					const next: number[][] = [];
					for (const prefix of queue) {
						const start = prefix[prefix.length - 1];
						for (let i = start; i < blocks.length; i++) next.push([...prefix, i]);
					}
					queue = next;
				}
				for (const combo of queue) {
					if (generated >= opts.maxCombos) break;
					pushCombo(combo);
				}
			}
		}

		return sortRawResults(dedupeRawResults(out), sortByMode);
	}

	function buildWorkerScriptSource(): string {
		return `
		self.onmessage = (event) => {
			const { blocks, targetValue, sortBy, options } = event.data;
			const sortRawResults = (items, mode) => {
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
			};
			const chunkIndex = options.chunkIndex || 0;
			const chunkCount = options.chunkCount || 1;
			const chunkSize = Math.ceil(blocks.length / chunkCount);
			const firstStart = chunkIndex * chunkSize;
			const firstEnd = Math.min(firstStart + chunkSize, blocks.length);
			const out = [];
			let generated = 0;
			const pushCombo = (indices) => {
				if (generated >= options.maxCombos) return;
				const chosen = indices.map((i) => blocks[i]);
				const total = chosen.reduce((sum, b) => sum + b.total, 0);
				const lower = chosen.reduce((sum, b) => sum + b.lower, 0);
				const upper = chosen.reduce((sum, b) => sum + b.upper, 0);
				const error = total - targetValue;
				const keys = Array.from(new Set(chosen.flatMap((b) => b.keys))).sort();
				out.push({
					signature: indices.join('|') + '::' + keys.join(','),
					label: chosen.map((b) => b.label).join(' + '),
					totalResistance: total,
					error,
					errorPercent: (error / targetValue) * 100,
					componentCount: chosen.reduce((sum, b) => sum + b.componentCount, 0),
					rangeLower: lower,
					rangeUpper: upper,
					keys
				});
				generated += 1;
			};
			for (let size = 1; size <= options.maxSeriesBlocks; size++) {
				if (generated >= options.maxCombos) break;
				for (let first = firstStart; first < firstEnd; first++) {
					if (generated >= options.maxCombos) break;
					if (size === 1) {
						pushCombo([first]);
						continue;
					}
					let queue = [[first]];
					for (let depth = 1; depth < size; depth++) {
						const next = [];
						for (const prefix of queue) {
							const start = prefix[prefix.length - 1];
							for (let i = start; i < blocks.length; i++) next.push([...prefix, i]);
						}
						queue = next;
					}
					for (const combo of queue) {
						if (generated >= options.maxCombos) break;
						pushCombo(combo);
					}
				}
			}
			self.postMessage({ type: 'result', results: sortRawResults(out, sortBy) });
		};`;
	}

	function createWorker(): Worker {
		const blob = new Blob([buildWorkerScriptSource()], { type: 'text/javascript' });
		return new Worker(URL.createObjectURL(blob));
	}

	function runWorker(payload: {
		blocks: Block[];
		targetValue: number;
		sortBy: SortBy;
		options: { maxSeriesBlocks: number; maxCombos: number; chunkIndex?: number; chunkCount?: number };
	}): Promise<RawResult[]> {
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
		blocks: Block[],
		targetValue: number,
		sortByMode: SortBy,
		maxSeriesBlocks: number,
		maxCombos: number,
		workerCount: number
	): Promise<RawResult[]> {
		if (workerCount <= 1) {
			return runWorker({ blocks, targetValue, sortBy: sortByMode, options: { maxSeriesBlocks, maxCombos } });
		}
		const maxCombosPerWorker = Math.ceil(maxCombos / workerCount);
		const jobs = Array.from({ length: workerCount }, (_, chunkIndex) =>
			runWorker({
				blocks,
				targetValue,
				sortBy: sortByMode,
				options: {
					maxSeriesBlocks,
					maxCombos: maxCombosPerWorker,
					chunkIndex,
					chunkCount: workerCount
				}
			})
		);
		const merged = (await Promise.all(jobs)).flat();
		return sortRawResults(dedupeRawResults(merged), sortByMode);
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
		allRawResults = [];
		results = [];
		const nextWarnings: string[] = [];
		const nextErrors: string[] = [];
		try {
			await ensureResistorUtilsLoaded();
			const Ru = getResistorUtils();
			if (!Ru) {
				nextErrors.push('Resistor parser is unavailable.');
				return;
			}

			const parsedTarget = Ru.parseResistorInput(targetResistance, {
				snapToSeries,
				snapSeries: snapSeriesPick
			});
			const target = Number(parsedTarget?.value);
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
					powerCode: r.powerCode ?? null,
					isJlcBasic: r.isJlcBasic ?? false,
					source: r.source,
					active: existing?.active ?? true
				};
			});
			parsedValues = nextParsed;

			const activeEntries = nextParsed.filter((p) => p.active);
			if (nextParsed.length === 0) {
				nextErrors.push('At least one parsed value is required.');
				return;
			}

			const fullCountBeforeTrim = nextParsed.length;
			let computeEntries = nextParsed;
			if (computeEntries.length > LIMITS.maxInputResistors) {
				computeEntries = computeEntries
					.map((entry) => ({ entry, diff: Math.abs(entry.value - target) }))
					.sort((a, b) => a.diff - b.diff)
					.slice(0, LIMITS.maxInputResistors)
					.map((x) => x.entry);
				nextWarnings.push(
					`Input list trimmed to ${LIMITS.maxInputResistors} parsed values for performance (legacy heuristic).`
				);
			}

			const effective = getEffectiveLimits(computeEntries.length);
			const blocks = buildBlocks(computeEntries, target, effective.maxParallel, effective.maxBlocks);
			const workerCount = getWorkerCount(computeEntries.length);
			let raw: RawResult[] = [];
			try {
				raw =
					workerCount > 0
						? await computeWithWorkers(
								blocks,
								target,
								sortBy,
								effective.maxSeriesBlocks,
								effective.maxCombos,
								workerCount
							)
						: generateSeriesCombosFromBlocks(blocks, target, sortBy, {
								maxSeriesBlocks: effective.maxSeriesBlocks,
								maxCombos: effective.maxCombos
							});
			} catch (e) {
				nextWarnings.push(
					`Worker calculation failed; fallback search used (${e instanceof Error ? e.message : String(e)}).`
				);
				raw = generateSeriesCombosFromBlocks(blocks, target, sortBy, {
					maxSeriesBlocks: effective.maxSeriesBlocks,
					maxCombos: effective.maxCombos
				});
			}

			const within = raw.filter((r) => Number.isFinite(r.errorPercent) && Math.abs(r.errorPercent) <= 20);
			const cutoffFallback = within.length === 0 && raw.length > 0;
			const filtered = within.length ? within : raw;
			allRawResults = filtered;
			refreshVisibleResults();

			if (!filtered.length) {
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
				inputCount: nextParsed.length,
				activeCount: activeEntries.length,
				filteredCount: computeEntries.length,
				filteredByHeuristic: fullCountBeforeTrim !== computeEntries.length,
				removedByHeuristic: Math.max(0, fullCountBeforeTrim - computeEntries.length),
				workerUsed: workerCount > 0,
				workerCount,
				maxParallel: effective.maxParallel,
				maxSeriesBlocks: effective.maxSeriesBlocks,
				maxBlocks: effective.maxBlocks,
				maxCombos: effective.maxCombos,
				comboCount: filtered.length,
				resultCount: mapRawToView(filterRawByActiveKeys(filtered, new Set(activeEntries.map((p) => p.id)))).length,
				errorFilterFallback: cutoffFallback
			};
		} finally {
			warnings = nextWarnings;
			errors = nextErrors;
			calculating = false;
		}
	}

	$effect(() => {
		void sortBy;
		if (!allRawResults.length) return;
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
				{#each results as result, index}
					<article class="wt-shell-inner wt-no-floating-shadow rounded-wt-box bg-wt-surface p-3">
						<p class="text-sm wt-text-body-strong">{result.label}</p>
						<p class="text-xs text-wt-muted-fg">
							{formatResistorValue(result.total)} · error {formatResistorValue(result.errorAbs)} ({result.errorPercent.toFixed(2)}%) · {result.components}
							component{result.components === 1 ? '' : 's'}
						</p>
						<p class="text-xs text-wt-muted-fg">Tolerance range: {result.rangeText}</p>
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
				<p><span class="wt-text-ui">Worker used:</span> {calcStats.workerUsed ? `yes (${calcStats.workerCount})` : 'no'}</p>
				<p><span class="wt-text-ui">Generated combos:</span> {calcStats.comboCount.toLocaleString()}</p>
				<p><span class="wt-text-ui">Displayed results:</span> {calcStats.resultCount}</p>
				<p><span class="wt-text-ui">20% cutoff fallback:</span> {calcStats.errorFilterFallback ? 'yes' : 'no'}</p>
			</div>
		</ResultsPanel>
	{/if}
</section>
