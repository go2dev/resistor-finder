<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { SlidersHorizontal, Sigma, SquareChartGantt, Sun, Moon, Zap } from 'lucide-svelte';
	import type { AppMode } from '$lib/stores/app-state';
	import { appTheme, modeLabels, modeRoutes, toggleTheme } from '$lib/stores/app-state';
	import { wtThemeTokens } from '$lib/wt-theme-tokens';
	import { cn } from '$lib/utils';

	let { children } = $props();

	let appVersion = $state('dev');
	const currentYear = new Date().getFullYear();

	onMount(async () => {
		try {
			const response = await fetch(`${base}/version.json?cb=${Date.now()}`);
			if (response.ok) {
				const data = await response.json();
				if (typeof data?.version === 'string') appVersion = data.version;
			}
		} catch {
			// keep the "dev" fallback
		}
	});

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

</script>

<div class="min-h-screen bg-wt-canvas text-wt-body">
	<div class="mx-auto max-w-6xl px-4 py-4">
		<header class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
			<h1 class="text-base font-semibold tracking-tight text-wt-ink">
				<Zap class="mb-0.5 inline h-4 w-4 text-wt-brand-design" aria-hidden="true" />
				Resistor Divider
			</h1>

			<nav aria-label="Calculator mode" class="flex flex-wrap items-center gap-1.5">
				{#each modeLinks as link}
					{@const Icon = iconByMode[link.id]}
					<a
						href={link.path}
						data-sveltekit-preload-data="hover"
						aria-current={activeMode === link.id ? 'page' : undefined}
						class={cn(
							'wt-affordance-pill-ghost wt-no-floating-shadow tool-control-sm inline-flex items-center gap-1.5 px-2.5 wt-text-ui transition-colors',
							activeMode === link.id
								? 'bg-wt-brand-design text-wt-white'
								: 'bg-wt-surface text-wt-ink hover:bg-wt-muted'
						)}
					>
						<Icon class="h-3.5 w-3.5" />
						{link.label}
					</a>
				{/each}
			</nav>

			<div class="ms-auto flex items-center gap-2">
				<span class="tool-stat hidden sm:inline">{appVersion} · wt {wtThemeTokens.meta.version}</span>
				<button
					type="button"
					class="wt-affordance-pill-ghost wt-no-floating-shadow inline-flex h-7 w-7 shrink-0 items-center justify-center bg-wt-surface hover:bg-wt-muted"
					onclick={toggleTheme}
					aria-label="Toggle theme"
				>
					{#if $appTheme === 'dark'}
						<Sun class="h-3.5 w-3.5" />
					{:else}
						<Moon class="h-3.5 w-3.5" />
					{/if}
				</button>
			</div>
		</header>

		<main class="wt-corner-squircle wt-shell-root rounded-wt-box p-4 sm:p-5">
			{@render children?.()}
		</main>

		<footer class="mt-4 text-center text-[11px] leading-relaxed text-wt-muted-fg">
			<p>
				Results are provided without warranty or verification — use at your own risk.
				Made by <a class="underline hover:text-wt-ink" href="https://mynameis.dev" target="_blank" rel="noreferrer">Dev</a>
				© <a class="underline hover:text-wt-ink" href="https://whatevertogether.net/" target="_blank" rel="noreferrer">Whatever Together</a>
				{currentYear}
				· Source on <a class="underline hover:text-wt-ink" href="https://github.com/go2dev/resistor-finder" target="_blank" rel="noreferrer">GitHub</a>
				· Version: {appVersion}
			</p>
		</footer>
	</div>
</div>
