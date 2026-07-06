<script lang="ts">
	// Floating tooltip for a hovered/focused diagram part. Positioned by the
	// parent (coordinates relative to the diagram wrapper). `class` lets
	// callers add contextual styling (e.g. E-series colour coding).
	let {
		x,
		y,
		lines,
		class: className = ''
	}: { x: number; y: number; lines: string[]; class?: string } = $props();
</script>

<div
	class="pointer-events-none absolute z-20 rounded-md border border-wt-border bg-wt-surface px-2.5 py-1.5 text-[11px] leading-4 whitespace-pre text-wt-ink shadow {className}"
	style="left: {x}px; top: {y}px;"
>
	{lines.join('\n')}
</div>
