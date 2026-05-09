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
		'wt-shell-inner wt-no-floating-shadow inline-flex h-10 w-full rounded-wt-box bg-wt-surface px-3 text-sm wt-text-body text-wt-ink placeholder:text-wt-muted-fg focus-visible:ring-2 focus-visible:ring-wt-brand-design focus-visible:ring-offset-2 focus-visible:ring-offset-wt-canvas focus-visible:outline-none',
		className
	)}
	{...rest}
/>
