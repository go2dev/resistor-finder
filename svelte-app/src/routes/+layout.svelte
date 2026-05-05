<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import AppShell from '$lib/components/layout/app-shell.svelte';
	import { setMode, type AppMode } from '$lib/stores/app-state';

	let { children, data } = $props();

	$effect(() => {
		if (data?.mode) {
			setMode(data.mode as AppMode);
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<AppShell>
	{@render children()}
</AppShell>
