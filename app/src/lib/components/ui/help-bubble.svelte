<script lang="ts">
	// "?" help affordance (legacy help-tooltip parity) — hover or focus to open.
	let {
		label = 'Help',
		children
	}: {
		label?: string;
		children: import('svelte').Snippet;
	} = $props();
</script>

<span class="group relative inline-flex align-middle">
	<button
		type="button"
		aria-label={label}
		data-help-bubble
		class="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-wt-border bg-wt-muted text-[10px] font-semibold text-wt-muted-fg outline-none focus-visible:ring-2 focus-visible:ring-wt-brand-design"
	>
		?
	</button>
	<span
		class="pointer-events-auto absolute left-1/2 top-full z-30 mt-2 hidden w-64 -translate-x-1/2 rounded-wt-box border-2 border-wt-border bg-wt-surface p-3 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-wt-ink shadow-lg group-hover:block group-focus-within:block"
	>
		{@render children()}
	</span>
</span>
