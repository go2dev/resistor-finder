<script lang="ts">
	// In-app documentation: renders the repo README (same source the legacy
	// root readme.html renders via CDN marked) — parity item P2 from the audit.
	import { marked } from 'marked';
	import readmeRaw from '$legacy/README.md?raw';

	// Our own README — trusted content, no sanitizer needed.
	const html = marked.parse(readmeRaw, { async: false }) as string;
</script>

<svelte:head>
	<title>Docs — Resistor Divider</title>
</svelte:head>

<section class="space-y-4">
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<h2 class="text-base font-semibold tracking-tight text-wt-ink">Documentation</h2>
		<p class="text-xs text-wt-muted-fg">
			Project README — also on
			<a class="underline hover:text-wt-ink" href="https://github.com/go2dev/resistor-finder" target="_blank" rel="noreferrer">GitHub</a>.
		</p>
	</div>

	<article class="readme-content wt-shell-inner wt-no-floating-shadow rounded-wt-box bg-wt-surface p-6 text-sm leading-relaxed text-wt-body">
		<!-- eslint-disable-next-line svelte/no-at-html-tags — build-time README, trusted -->
		{@html html}
	</article>
</section>

<style>
	.readme-content :global(h1),
	.readme-content :global(h2),
	.readme-content :global(h3) {
		color: var(--wt-color-ink, #17171c);
		font-weight: 600;
		letter-spacing: -0.01em;
		margin: 1.5em 0 0.5em;
	}
	.readme-content :global(h1) {
		font-size: 1.25rem;
		margin-top: 0;
		border-bottom: 1px solid var(--wt-color-border, #d4d4dc);
		padding-bottom: 0.4rem;
	}
	.readme-content :global(h2) {
		font-size: 1.05rem;
	}
	.readme-content :global(h3) {
		font-size: 0.95rem;
	}
	.readme-content :global(p),
	.readme-content :global(ul),
	.readme-content :global(ol) {
		margin: 0.6em 0;
	}
	.readme-content :global(ul),
	.readme-content :global(ol) {
		padding-left: 1.4em;
		list-style: revert;
	}
	.readme-content :global(a) {
		color: var(--wt-color-brand-design, #6d5ae6);
		text-decoration: underline;
	}
	.readme-content :global(code) {
		background: var(--wt-color-muted, #ececf1);
		border-radius: 4px;
		padding: 0.1em 0.35em;
		font-size: 0.85em;
	}
	.readme-content :global(pre) {
		background: var(--wt-color-muted, #ececf1);
		border-radius: 6px;
		padding: 0.75rem 1rem;
		overflow-x: auto;
		margin: 0.75em 0;
	}
	.readme-content :global(pre code) {
		background: none;
		padding: 0;
	}
	.readme-content :global(table) {
		border-collapse: collapse;
		margin: 0.75em 0;
		width: 100%;
	}
	.readme-content :global(th),
	.readme-content :global(td) {
		border: 1px solid var(--wt-color-border, #d4d4dc);
		padding: 0.4rem 0.6rem;
		text-align: left;
	}
	.readme-content :global(th) {
		background: var(--wt-color-muted, #ececf1);
	}
	.readme-content :global(blockquote) {
		border-left: 3px solid var(--wt-color-border, #d4d4dc);
		margin: 0.75em 0;
		padding-left: 1rem;
		color: var(--wt-color-muted-fg, #8b8b96);
	}
	.readme-content :global(img) {
		max-width: 100%;
	}
</style>
