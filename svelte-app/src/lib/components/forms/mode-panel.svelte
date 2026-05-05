<script lang="ts">
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Switch from '$lib/components/ui/switch.svelte';
	import type { AppMode } from '$lib/stores/app-state';
	import { modeLabels } from '$lib/stores/app-state';

	type Option = { value: string; label: string };

	type Props = {
		mode: AppMode;
	};

	let { mode }: Props = $props();

	let enableOvershoot = $state(true);
	let sortBy = $state('error');

	const sortOptions: Option[] = [
		{ value: 'error', label: 'Lowest error' },
		{ value: 'components', label: 'Lowest component count' },
		{ value: 'totalResistanceAsc', label: 'Total resistance ascending' },
		{ value: 'totalResistanceDesc', label: 'Total resistance descending' }
	];

	const modeDescriptions: Record<AppMode, string> = {
		'voltage-divider': 'Core divider workflow scaffolded with tokenized controls and reusable primitives.',
		'interactive-divider':
			'Interactive topology editing shell with headless controls; diagram hit-target logic ports in next stage.',
		'balanced-attenuator': 'U/L mode shell ready for attenuator engine + diagram integration.',
		'target-resistance': 'Target-resistance flow shell for nearest-match and network composition ports.'
	};

	const modeButtonLabel: Record<AppMode, string> = {
		'voltage-divider': 'Calculate combinations',
		'interactive-divider': 'Update interactive network',
		'balanced-attenuator': 'Calculate attenuator combinations',
		'target-resistance': 'Find closest matches'
	};

	const showTargetInput = $derived(mode === 'voltage-divider' || mode === 'balanced-attenuator');
</script>

<section class="space-y-5">
	<header class="space-y-1">
		<h2 class="text-xl font-semibold text-[var(--color-card-foreground)]">{modeLabels[mode]}</h2>
		<p class="text-sm text-[var(--color-muted-foreground)]">{modeDescriptions[mode]}</p>
	</header>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="space-y-2">
			<label for="mode-primary-input" class="text-sm font-medium text-[var(--color-card-foreground)]">
				{mode === 'target-resistance' ? 'Target Resistance' : 'Supply Voltage'}
			</label>
			<Input
				id="mode-primary-input"
				type={mode === 'target-resistance' ? 'text' : 'number'}
				value={mode === 'target-resistance' ? '10k' : '5'}
				step="0.1"
			/>
		</div>
		{#if showTargetInput}
			<div class="space-y-2">
				<label for="mode-target-input" class="text-sm font-medium text-[var(--color-card-foreground)]">
					{mode === 'balanced-attenuator' ? 'Target attenuation (dB)' : 'Target Voltage'}
				</label>
				<Input id="mode-target-input" type="number" value={mode === 'balanced-attenuator' ? '3.6' : '3.3'} step="0.1" />
			</div>
		{/if}
	</div>

	<div class="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)] p-4 md:grid-cols-2">
		<div class="flex items-center justify-between gap-3">
			<div class="space-y-1">
				<p class="text-sm font-medium text-[var(--color-card-foreground)]">Allow overshoot</p>
				<p class="text-xs text-[var(--color-muted-foreground)]">
					Include results that can exceed target constraints when useful.
				</p>
			</div>
			<Switch checked={enableOvershoot} onToggle={(next) => (enableOvershoot = next)} />
		</div>
		<div class="space-y-2">
			<label for="mode-sort-input" class="text-sm font-medium text-[var(--color-card-foreground)]">Sort by</label>
			<select
				id="mode-sort-input"
				bind:value={sortBy}
				class="inline-flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-card-foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
			>
				{#each sortOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<div>
		<Button>{modeButtonLabel[mode]}</Button>
	</div>
</section>
