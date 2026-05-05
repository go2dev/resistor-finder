<script lang="ts">
	import ModePanel from '$lib/components/forms/mode-panel.svelte';
</script>

<section class="space-y-4">
	<h2 class="text-xl font-semibold">Target Resistance</h2>
	<p class="text-sm text-[var(--color-muted-foreground)]">
		Greenfield page shell for target-resistance mode. This route is ready for porting existing
		calculation and diagram components.
	</p>
</section>

<ModePanel mode="target-resistance" />
