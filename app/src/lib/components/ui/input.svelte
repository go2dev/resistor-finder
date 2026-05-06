<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		type = 'text',
		class: className,
		...rest
	}: {
		value?: string;
		type?: string;
		class?: string;
		[key: string]: unknown;
	} = $props();
</script>

<input
	bind:value
	{type}
	class={cn(
		'inline-flex h-10 w-full rounded-lg border border-wt-border bg-wt-surface px-3 text-sm text-wt-ink shadow-sm placeholder:text-wt-muted-fg focus-visible:ring-2 focus-visible:ring-wt-brand-design focus-visible:ring-offset-2 focus-visible:ring-offset-wt-canvas focus-visible:outline-none',
		className
	)}
	{...rest}
/>
