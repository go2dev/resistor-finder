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
		<h3 class="wt-text-heading text-lg tracking-tight text-wt-ink">{title}</h3>
	{/if}
	<div
		class="wt-corner-squircle wt-shell-inner wt-no-floating-shadow overflow-x-auto rounded-wt-box bg-wt-muted/40"
	>
		<div class="min-w-0 p-3 sm:p-4">
			{@render children?.()}
		</div>
	</div>
</section>
