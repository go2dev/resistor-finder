<script lang="ts">
	import { cva, type VariantProps } from 'class-variance-authority';
	import { cn } from '$lib/utils';

	const buttonVariants = cva(
		'wt-affordance-pill inline-flex items-center justify-center text-sm wt-text-ui transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wt-brand-design focus-visible:ring-offset-2 focus-visible:ring-offset-wt-canvas',
		{
			variants: {
				variant: {
					default: 'bg-wt-brand-design text-wt-white hover:opacity-90',
					outline:
						'wt-affordance-pill-ghost bg-wt-surface text-wt-ink hover:bg-wt-muted'
				},
				size: {
					default: 'h-10 px-4 py-2',
					sm: 'h-9 px-3',
					lg: 'h-11 px-8'
				}
			},
			defaultVariants: {
				variant: 'default',
				size: 'default'
			}
		}
	);

	type ButtonProps = VariantProps<typeof buttonVariants> & {
		type?: 'button' | 'submit' | 'reset';
		class?: string;
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		children?: import('svelte').Snippet;
	};

	let {
		variant = 'default',
		size = 'default',
		type = 'button',
		class: className = '',
		disabled = false,
		onclick,
		children
	}: ButtonProps = $props();
</script>

<button
	{type}
	class={cn(buttonVariants({ variant, size }), className)}
	{disabled}
	onclick={onclick}
>
	{@render children?.()}
</button>
