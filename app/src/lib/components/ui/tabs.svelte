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
		class="wt-shell-inner wt-no-floating-shadow inline-flex h-10 items-center rounded-wt-box bg-wt-muted p-1"
	>
		{#each tabs as tab}
			<button
				role="tab"
				aria-selected={value === tab.value}
				onclick={() => onValueChange?.(tab.value)}
				class={cn(
					'wt-affordance-pill-ghost inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm wt-text-ui transition-all',
					value === tab.value
						? 'bg-wt-surface text-wt-ink'
						: 'text-wt-muted-fg'
				)}
			>
				{tab.label}
			</button>
		{/each}
	</div>
</div>
