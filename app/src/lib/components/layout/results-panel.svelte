<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title = 'Results',
		children
	}: {
		title?: string;
		children?: Snippet;
	} = $props();
</script>

<section class="space-y-3" aria-label={title}>
	{#if title}
		<h3 class="text-lg font-semibold tracking-tight text-wt-ink">{title}</h3>
	{/if}
	<div
		class="wt-corner-squircle overflow-x-auto rounded-lg border border-wt-border bg-wt-muted/40"
	>
		<div class="min-w-0 p-3 sm:p-4">
			{@render children?.()}
		</div>
	</div>
</section>
