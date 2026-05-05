<script lang="ts">
	import ModePanel from '$lib/components/forms/mode-panel.svelte';
</script>

<section class="space-y-4">
	<div>
		<h2 class="text-xl font-semibold tracking-tight">Interactive Divider</h2>
		<p class="text-sm text-[var(--color-muted-foreground)]">
			Headless + tokenized foundation route. Interactive node editing and SVG hit-target behavior will be ported next.
		</p>
	</div>

	<ModePanel mode="interactive-divider" />
</section>
