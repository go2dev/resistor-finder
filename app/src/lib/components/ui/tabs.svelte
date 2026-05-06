<script lang="ts">
	// import { Tabs as BitsTabs } from 'bits-ui';
	import { cn } from '$lib/utils';

	type Tab = {
		value: string;
		label: string;
	};

	type Props = {
		value: string;
		tabs: Tab[];
		onValueChange?: (value: string) => void;
		class?: string;
	};

	let { value, tabs, onValueChange, class: className = '' }: Props = $props();
</script>

<div class={cn('w-full', className)}>
	<div
		role="tablist"
		class="inline-flex h-10 items-center rounded-lg border border-wt-border bg-wt-muted p-1"
	>
		{#each tabs as tab}
			<button
				role="tab"
				aria-selected={value === tab.value}
				onclick={() => onValueChange?.(tab.value)}
				class={cn(
					'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all',
					value === tab.value
						? 'bg-wt-surface text-wt-ink shadow-sm'
						: 'text-wt-muted-fg'
				)}
			>
				{tab.label}
			</button>
		{/each}
	</div>
</div>
