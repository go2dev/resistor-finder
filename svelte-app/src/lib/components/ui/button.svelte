<script lang="ts">
	import { cva, type VariantProps } from 'class-variance-authority';
	import { cn } from '$lib/utils';

	const buttonVariants = cva(
		'inline-flex items-center justify-center rounded-[var(--radius-md)] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2',
		{
			variants: {
				variant: {
					default: 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90',
					outline:
						'border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)] hover:bg-[var(--color-muted)]'
				},
				size: {
					default: 'h-10 px-4 py-2',
					sm: 'h-9 rounded-[var(--radius-sm)] px-3',
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
