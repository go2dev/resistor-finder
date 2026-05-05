<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import ModePanel from '$lib/components/forms/mode-panel.svelte';
	import { setMode } from '$lib/stores/app-state';

	onMount(() => {
		setMode('voltage-divider');
	});

	function goLegacy() {
		goto('/');
	}
</script>

<section class="space-y-4">
	<div>
		<h2 class="text-xl font-semibold tracking-tight">Voltage Divider (Svelte route)</h2>
		<p class="text-sm text-[var(--color-muted-foreground)]">
			Primary mode shell with tokenized controls and headless UI primitives.
		</p>
	</div>

	<ModePanel mode="voltage-divider" />

	<button
		type="button"
		class="text-sm text-[var(--color-primary)] underline-offset-4 hover:underline"
		onclick={goLegacy}
	>
		Compare with legacy homepage
	</button>
</section>
