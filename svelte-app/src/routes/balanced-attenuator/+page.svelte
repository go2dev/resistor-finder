<script lang="ts">
	import ModePanel from '$lib/components/forms/mode-panel.svelte';
</script>

<section class="space-y-6">
	<div class="space-y-2">
		<h2 class="text-xl font-semibold">Balanced Attenuator (Foundation)</h2>
		<p class="text-sm text-[var(--color-muted-foreground)]">
			Builds the routed shell for U/L pad workflows and future Pi/H/T modes.
		</p>
	</div>

	<ModePanel mode="balanced-attenuator" />

	<div class="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-4">
		<p class="text-sm text-[var(--color-muted-foreground)]">
			Next: move attenuator engine and topology-specific result cards into this route.
		</p>
	</div>
</section>
