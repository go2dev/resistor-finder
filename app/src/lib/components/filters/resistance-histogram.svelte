<script lang="ts">
	// Log-x histogram of the raw match distribution over total resistance.
	// Purely presentational: the parent owns the view window and selection and
	// layers any zoom/pan/handle interaction on top. Counting is
	// O(bins·log n) over a pre-sorted array, so re-render per zoom frame is cheap.
	import {
		binCountForWidth,
		computeLogBins,
		logTickValues
	} from '$lib/domain/range-filter-math';
	import { formatResistorValue } from '$lib/domain/resistor';

	let {
		sortedValues,
		viewMinLog,
		viewMaxLog,
		filterMin = null,
		filterMax = null,
		height = 64,
		formatValue = formatResistorValue
	}: {
		/** All match values (Ω), ascending. */
		sortedValues: number[];
		/** Visible window, log10(Ω). */
		viewMinLog: number;
		viewMaxLog: number;
		/** Selected filter range (Ω); bars inside it render in the brand tone. */
		filterMin?: number | null;
		filterMax?: number | null;
		/** Bar area height in px (axis labels add ~16px below). */
		height?: number;
		formatValue?: (v: number) => string;
	} = $props();

	const AXIS_H = 16;

	let width = $state(0);

	const bins = $derived(
		width > 0 ? computeLogBins(sortedValues, viewMinLog, viewMaxLog, binCountForWidth(width)) : []
	);
	const maxCount = $derived(bins.reduce((m, b) => Math.max(m, b.count), 0) || 1);
	const ticks = $derived(
		width > 0 ? logTickValues(viewMinLog, viewMaxLog, Math.max(2, Math.floor(width / 90))) : []
	);

	const logSpan = $derived(viewMaxLog - viewMinLog);
	function xOf(v: number): number {
		return ((Math.log10(v) - viewMinLog) / logSpan) * width;
	}

	function barSelected(b: { x0: number; x1: number }): boolean {
		if (filterMin == null || filterMax == null) return true;
		// A bar counts as selected when its centre (log-space) is in range.
		const mid = Math.sqrt(b.x0 * b.x1);
		return mid >= filterMin && mid <= filterMax;
	}
</script>

<div class="w-full" bind:clientWidth={width}>
	{#if width > 0 && logSpan > 0}
		<svg
			class="block w-full"
			width={width}
			height={height + AXIS_H}
			viewBox={`0 0 ${width} ${height + AXIS_H}`}
			role="img"
			aria-label="Distribution of matches across the total-resistance range"
		>
			<line class="rh-baseline" x1="0" y1={height + 0.5} x2={width} y2={height + 0.5} />
			{#each bins as b (b.x0)}
				{@const x0 = xOf(b.x0)}
				{@const x1 = xOf(b.x1)}
				{@const h = b.count > 0 ? Math.max(2, (b.count / maxCount) * (height - 4)) : 0}
				{#if b.count > 0}
					<rect
						class="rh-bar"
						class:rh-bar-selected={barSelected(b)}
						x={x0}
						y={height - h}
						width={Math.max(1, x1 - x0 - 0.5)}
						height={h}
						shape-rendering="crispEdges"
					>
						<title>{formatValue(b.x0)} – {formatValue(b.x1)}: {b.count} match{b.count === 1 ? '' : 'es'}</title>
					</rect>
				{/if}
			{/each}
			{#each ticks as t (t)}
				{@const tx = xOf(t)}
				<line class="rh-tick" x1={tx} y1={height} x2={tx} y2={height + 4} />
				<text class="rh-tick-label" x={tx} y={height + AXIS_H - 3} text-anchor="middle">
					{formatValue(t)}
				</text>
			{/each}
		</svg>
	{/if}
</div>

<style>
	.rh-bar {
		fill: var(--wt-color-muted-fg, #8b8b96);
		opacity: 0.45;
	}
	.rh-bar-selected {
		fill: var(--wt-color-brand-design, #6d5ae6);
		opacity: 0.85;
	}
	.rh-baseline,
	.rh-tick {
		stroke: var(--wt-color-border, #d4d4dc);
		stroke-width: 1;
	}
	.rh-tick-label {
		fill: var(--wt-color-muted-fg, #8b8b96);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
	}
</style>
