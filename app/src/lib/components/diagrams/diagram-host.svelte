<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		class: className = '',
		children
	}: {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<!--
  Shared mount region for schematic output. Use data-diagram-host for tests or future
  unified diagram orchestration (resize, theme stroke injection, etc.).
-->
<div data-diagram-host class={cn('flex flex-col items-center gap-2 py-2', className)}>
	{@render children?.()}
</div>
