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
		class="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)] p-1"
	>
		{#each tabs as tab}
			<button
				role="tab"
				aria-selected={value === tab.value}
				onclick={() => onValueChange?.(tab.value)}
				class={cn(
					'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-all',
					value === tab.value
						? 'bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-[var(--shadow-soft)]'
						: 'text-[var(--color-muted-foreground)]'
				)}
			>
				{tab.label}
			</button>
		{/each}
	</div>
</div>
