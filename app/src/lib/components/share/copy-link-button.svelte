<script lang="ts">
	// Copies the current (deep-linkable) URL — see docs/url-schema.md.
	import Button from '$lib/components/ui/button.svelte';

	let { onError }: { onError?: (message: string) => void } = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1500);
		} catch {
			onError?.('Could not access the clipboard — copy the address bar URL instead.');
		}
	}
</script>

<Button type="button" variant="outline" size="sm" onclick={() => void copy()}>
	{copied ? 'Copied ✓' : 'Copy link'}
</Button>
