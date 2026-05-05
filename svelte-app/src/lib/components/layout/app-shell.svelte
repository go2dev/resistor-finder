<script lang="ts">
	import { Home, SlidersHorizontal, Sigma, SquareChartGantt, Sun, Moon } from 'lucide-svelte';
	// import { Tabs } from 'bits-ui';
	import { appTheme, currentMode, setMode, type AppMode } from '$lib/stores/app-state';
	import { cn } from '$lib/utils';

	let { children } = $props();

	const modeLinks: { id: AppMode; href: string; label: string }[] = [
		{ id: 'voltage-divider', href: '/', label: 'Voltage Divider' },
		{ id: 'interactive-divider', href: '/interactive-divider', label: 'Interactive Divider' },
		{ id: 'balanced-attenuator', href: '/balanced-attenuator', label: 'Balanced Attenuator' },
		{ id: 'target-resistance', href: '/target-resistance', label: 'Target Resistance' }
	];

	const iconByMode: Record<AppMode, typeof Home> = {
		'voltage-divider': Home,
		'interactive-divider': SlidersHorizontal,
		'balanced-attenuator': SquareChartGantt,
		'target-resistance': Sigma
	};

	function toggleTheme() {
		$appTheme = $appTheme === 'dark' ? 'light' : 'dark';
	}
</script>

<div class="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
	<div class="mx-auto max-w-6xl px-4 py-8">
		<header class="mb-6 flex items-center justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight">Resistor Finder</h1>
				<p class="text-sm text-[var(--color-muted-foreground)]">
					SvelteKit foundation with Tailwind tokens and headless primitives
				</p>
			</div>
			<button
				type="button"
				class="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-soft)] hover:bg-[var(--color-muted)]"
				onclick={toggleTheme}
				aria-label="Toggle theme"
			>
				{#if $appTheme === 'dark'}
					<Sun class="h-4 w-4" />
				{:else}
					<Moon class="h-4 w-4" />
				{/if}
			</button>
		</header>

		<div role="tablist" class="mb-6">
			<div class="flex flex-wrap gap-2">
				{#each modeLinks as link}
					{@const Icon = iconByMode[link.id]}
					<button
						role="tab"
						aria-selected={$currentMode === link.id}
						onclick={() => setMode(link.id)}
						class={cn(
							'inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors',
							$currentMode === link.id
								? 'border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
								: 'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)]'
						)}
					>
						<a href={link.href} class="inline-flex items-center gap-2" onclick={(e) => e.stopPropagation()}>
							<Icon class="h-4 w-4" />
							{link.label}
						</a>
					</button>
				{/each}
			</div>
		</div>

		<main class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-[var(--shadow-soft)]">
			{@render children?.()}
		</main>
	</div>
</div>
