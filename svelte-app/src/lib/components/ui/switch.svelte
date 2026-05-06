<script lang="ts">
	// import { Switch } from 'bits-ui';
	import { cn } from '$lib/utils';

	type Props = {
		checked?: boolean;
		label?: string;
		disabled?: boolean;
		class?: string;
		onToggle?: (next: boolean) => void;
	};

	let { checked = false, label = '', disabled = false, class: className = '', onToggle }: Props = $props();
</script>

<button
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	onclick={() => {
		if (!disabled && onToggle) {
			onToggle(!checked);
		}
	}}
	class={cn(
		'relative inline-flex h-6 w-11 items-center rounded-full border border-[var(--color-border)] px-0.5 transition-colors',
		checked ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'bg-[var(--color-border)]',
		disabled && 'cursor-not-allowed opacity-50',
		className
	)}
>
	<span
		class={cn(
			'block h-5 w-5 rounded-full bg-white transition-transform',
			checked ? 'translate-x-5' : 'translate-x-0'
		)}
	></span>
</button>
