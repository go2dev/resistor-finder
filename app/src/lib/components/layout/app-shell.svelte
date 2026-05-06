<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { SlidersHorizontal, Sigma, SquareChartGantt, Sun, Moon, Zap } from 'lucide-svelte';
	import type { AppMode } from '$lib/stores/app-state';
	import { appTheme, modeLabels, modeRoutes } from '$lib/stores/app-state';
	import { wtThemeTokens } from '$lib/wt-theme-tokens';
	import { cn } from '$lib/utils';

	let { children } = $props();

	function normalizedPath(pathname: string): string {
		if (base && pathname.startsWith(base)) {
			return pathname.slice(base.length) || '/';
		}
		return pathname;
	}

	const activeMode = $derived.by(() => {
		const p = normalizedPath(page.url.pathname);
		if (p.startsWith('/interactive-divider')) return 'interactive-divider' as AppMode;
		if (p.startsWith('/balanced-attenuator')) return 'balanced-attenuator' as AppMode;
		if (p.startsWith('/target-resistance')) return 'target-resistance' as AppMode;
		return 'voltage-divider' as AppMode;
	});

	const modeSequence = [
		'voltage-divider',
		'interactive-divider',
		'balanced-attenuator',
		'target-resistance'
	] as const satisfies readonly AppMode[];

	const modeLinks = modeSequence.map((id) => ({
		id,
		path: `${base}${modeRoutes[id]}`,
		label: modeLabels[id]
	}));

	const iconByMode: Record<AppMode, typeof Zap> = {
		'voltage-divider': Zap,
		'interactive-divider': SlidersHorizontal,
		'balanced-attenuator': SquareChartGantt,
		'target-resistance': Sigma
	};

	function toggleTheme() {
		appTheme.update((t: 'light' | 'dark') => (t === 'dark' ? 'light' : 'dark'));
	}
</script>

<div class="min-h-screen bg-wt-canvas text-wt-body">
	<div class="mx-auto max-w-6xl px-4 py-8">
		<header class="@container mb-6 flex items-center justify-between gap-4">
			<div class="min-w-0 space-y-1">
				<h1 class="wt-revamp-hero-title font-semibold tracking-tight">Resistor Finder</h1>
				<p class="wt-revamp-hero-tagline text-wt-muted-fg">
					SvelteKit UI under <code class="text-xs">{base || '/'}</code> · legacy static pages unchanged at repo root ·
					wt-theme v{wtThemeTokens.meta.version}
				</p>
			</div>
			<button
				type="button"
				class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-wt-border bg-wt-surface shadow-sm hover:bg-wt-muted"
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

		<nav aria-label="Calculator mode" class="mb-6">
			<div class="flex flex-wrap gap-2">
				{#each modeLinks as link}
					{@const Icon = iconByMode[link.id]}
					<a
						href={link.path}
						data-sveltekit-preload-data="hover"
						aria-current={activeMode === link.id ? 'page' : undefined}
						class={cn(
							'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
							activeMode === link.id
								? 'border-transparent bg-wt-brand-design text-wt-white'
								: 'border-wt-border bg-wt-surface text-wt-ink hover:bg-wt-muted'
						)}
					>
						<Icon class="h-4 w-4" />
						{link.label}
					</a>
				{/each}
			</div>
		</nav>

		<main
			class="wt-corner-squircle rounded-xl border border-wt-border bg-wt-surface p-6 shadow-sm"
		>
			{@render children?.()}
		</main>
	</div>
</div>
