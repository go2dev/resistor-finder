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
		'inline-flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-card-foreground)] shadow-sm placeholder:text-[var(--color-muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:outline-none',
		className
	)}
	{...rest}
/>
