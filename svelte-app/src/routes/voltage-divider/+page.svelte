<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Switch from '$lib/components/ui/switch.svelte';
	import { parseResistorList, formatResistorValue } from '$lib/domain/resistor';
	import { computeDividerResults, sanitizeInputResistors, type DividerResult, type SortBy } from '$lib/domain/voltage-divider';

	let resistorValues = $state('1k, 2.2k, 3.3k, 4.7k, 10k, 22k');
	let supplyVoltage = $state('5');
	let targetVoltage = $state('3.3');
	let allowOvershoot = $state(true);
	let sortBy = $state<SortBy>('error');

	let errors = $state<string[]>([]);
	let warnings = $state<string[]>([]);
	let results = $state<DividerResult[]>([]);
	let stats = $state({ networkCount: 0, networksTested: 0 });

	const sortOptions: { value: SortBy; label: string }[] = [
		{ value: 'error', label: 'Lowest error' },
		{ value: 'components', label: 'Lowest component count' },
		{ value: 'totalResistanceAsc', label: 'Total resistance ascending' },
		{ value: 'totalResistanceDesc', label: 'Total resistance descending' }
	];

	function calculate() {
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

		const parsed = parseResistorList(resistorValues);
		nextWarnings.push(...parsed.warnings);
		const sanitized = sanitizeInputResistors(parsed.resistors);
		nextWarnings.push(...sanitized.warnings);

		if (sanitized.resistors.length === 0) {
			nextErrors.push('At least one valid resistor value is required.');
		}

		if (nextErrors.length > 0) {
			errors = nextErrors;
			warnings = nextWarnings;
			results = [];
			stats = { networkCount: 0, networksTested: 0 };
			return;
		}

		const computed = computeDividerResults({
			resistors: sanitized.resistors,
			supplyVoltage: supply,
			targetVoltage: target,
			allowOvershoot,
			sortBy,
			maxResults: 10
		});

		errors = [];
		warnings = nextWarnings;
		results = computed.results;
		stats = {
			networkCount: computed.networkCount,
			networksTested: computed.networksTested
		};
	}

	onMount(calculate);
</script>

<section class="space-y-6">
	<div class="space-y-1">
		<h2 class="text-xl font-semibold tracking-tight">Voltage Divider</h2>
		<p class="text-sm text-[var(--color-muted-foreground)]">
			First functional Svelte migration slice: parsed input, divider search, sorting, and result rendering.
		</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="space-y-2 md:col-span-2">
			<label for="resistor-values" class="text-sm font-medium">Available resistor values</label>
			<Input id="resistor-values" bind:value={resistorValues} />
		</div>
		<div class="space-y-2">
			<label for="supply-voltage" class="text-sm font-medium">Supply voltage (V)</label>
			<Input id="supply-voltage" type="number" step="0.1" bind:value={supplyVoltage} />
		</div>
		<div class="space-y-2">
			<label for="target-voltage" class="text-sm font-medium">Target voltage (V)</label>
			<Input id="target-voltage" type="number" step="0.1" bind:value={targetVoltage} />
		</div>
	</div>

	<div class="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)] p-4 md:grid-cols-2">
		<div class="flex items-center justify-between gap-3">
			<div class="space-y-1">
				<p class="text-sm font-medium">Allow overshoot</p>
				<p class="text-xs text-[var(--color-muted-foreground)]">Keep solutions above target voltage.</p>
			</div>
			<Switch checked={allowOvershoot} onToggle={(next) => (allowOvershoot = next)} />
		</div>
		<div class="space-y-2">
			<label for="sort-by" class="text-sm font-medium">Sort by</label>
			<select
				id="sort-by"
				bind:value={sortBy}
				class="inline-flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-card-foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
			>
				{#each sortOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="flex items-center gap-3">
		<Button onclick={calculate}>Calculate combinations</Button>
		<p class="text-xs text-[var(--color-muted-foreground)]">
			Networks: {stats.networkCount.toLocaleString()} · Pairs tested: {stats.networksTested.toLocaleString()}
		</p>
	</div>

	{#if errors.length > 0}
		<div class="rounded-[var(--radius-md)] border border-red-400/50 bg-red-100/80 p-4 text-sm text-red-700">
			<ul class="list-disc space-y-1 pl-4">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if warnings.length > 0}
		<div class="rounded-[var(--radius-md)] border border-amber-400/50 bg-amber-100/80 p-4 text-sm text-amber-700">
			<ul class="list-disc space-y-1 pl-4">
				{#each warnings as warning}
					<li>{warning}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="space-y-3">
		<h3 class="text-lg font-semibold">Top results</h3>
		{#if results.length === 0}
			<p class="text-sm text-[var(--color-muted-foreground)]">No results yet. Run a calculation to see combinations.</p>
		{:else}
			{#each results as result}
				<article class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
					<div class="grid gap-1 text-sm md:grid-cols-2">
						<p><span class="font-medium">R_TOP:</span> {result.top.label} = {formatResistorValue(result.top.total)}</p>
						<p><span class="font-medium">R_BOT:</span> {result.bottom.label} = {formatResistorValue(result.bottom.total)}</p>
						<p><span class="font-medium">Output:</span> {result.outputVoltage.toFixed(3)} V</p>
						<p><span class="font-medium">Error:</span> {result.error > 0 ? '+' : ''}{result.error.toFixed(3)} V</p>
						<p><span class="font-medium">Total resistance:</span> {formatResistorValue(result.totalResistance)}</p>
						<p><span class="font-medium">Components:</span> {result.componentCount}</p>
					</div>
				</article>
			{/each}
		{/if}
	</div>
</section>
