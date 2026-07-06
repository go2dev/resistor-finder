<script lang="ts">
	// Svelte-native replacement for legacy zoomable-range-filter.js (parity
	// floor: three domains, wheel/pinch zoom, drag-pan, zoom/fit buttons,
	// keyboard + ARIA, filter-follows-view on zoom). x axis is log10(Ω).
	// The histogram substrate re-bins to the zoomed view; a slim full-domain
	// strip underneath keeps all three domains visible at once.
	import ResistanceHistogram from './resistance-histogram.svelte';
	import {
		clamp,
		computeLogBins,
		constrainViewDomain,
		countInRange,
		initialViewForFilter,
		logDomainOf,
		panViewByFraction,
		roundFilterValue,
		zoomViewAround
	} from '$lib/domain/range-filter-math';
	import { formatResistorValue } from '$lib/domain/resistor';

	let {
		sortedValues,
		filterMin,
		filterMax,
		onFilterChange,
		formatValue = formatResistorValue
	}: {
		/** All match values (Ω), ascending. */
		sortedValues: number[];
		/** Selected range (Ω) — owned by the parent, echoed back via onFilterChange. */
		filterMin: number;
		filterMax: number;
		onFilterChange: (range: { filterMin: number; filterMax: number }) => void;
		formatValue?: (v: number) => string;
	} = $props();

	const BAR_H = 64;
	const OVERVIEW_H = 14;
	const FILTER_EMIT_DEBOUNCE_MS = 80;

	let width = $state(0);
	let zoneEl: HTMLElement | null = $state(null);

	const domain = $derived(logDomainOf(sortedValues));
	const fullMinLog = $derived(domain?.minLog ?? 0);
	const fullMaxLog = $derived(domain?.maxLog ?? 1);
	const minViewSpanLog = $derived(Math.max(1e-4, (fullMaxLog - fullMinLog) / 1000));

	let viewMinLog = $state(0);
	let viewMaxLog = $state(1);

	// New result set → reset the view to the full data domain.
	const valuesSig = $derived(`${sortedValues.length}:${sortedValues[0]}:${sortedValues[sortedValues.length - 1]}:${fullMinLog}:${fullMaxLog}`);
	let lastValuesSig = '';
	$effect(() => {
		if (valuesSig !== lastValuesSig) {
			lastValuesSig = valuesSig;
			viewMinLog = fullMinLog;
			viewMaxLog = fullMaxLog;
		}
	});

	const viewLogSpan = $derived(viewMaxLog - viewMinLog);
	const viewMinOhm = $derived(Math.pow(10, viewMinLog));
	const viewMaxOhm = $derived(Math.pow(10, viewMaxLog));

	const selectedCount = $derived(countInRange(sortedValues, filterMin, filterMax));
	const selectionOffscreen = $derived(
		filterMax < viewMinOhm || filterMin > viewMaxOhm
	);

	function xOfLog(lg: number): number {
		return ((lg - viewMinLog) / viewLogSpan) * width;
	}
	function xOfValue(v: number): number {
		return v > 0 ? xOfLog(Math.log10(v)) : 0;
	}
	function valueAtX(px: number): number {
		return Math.pow(10, viewMinLog + (px / width) * viewLogSpan);
	}

	const handleMinX = $derived(clamp(xOfValue(filterMin), 0, width));
	const handleMaxX = $derived(clamp(xOfValue(filterMax), 0, width));

	// ── emitting ────────────────────────────────────────────────────────────
	let emitTimer: ReturnType<typeof setTimeout> | undefined;
	function emitFilter(min: number, max: number, immediate: boolean) {
		const run = () => onFilterChange({ filterMin: min, filterMax: max });
		clearTimeout(emitTimer);
		if (immediate) run();
		else emitTimer = setTimeout(run, FILTER_EMIT_DEBOUNCE_MS);
	}

	let liveTimer: ReturnType<typeof setTimeout> | undefined;
	let liveText = $state('');
	function announce() {
		clearTimeout(liveTimer);
		liveTimer = setTimeout(() => {
			liveText = `Showing ${selectedCount} of ${sortedValues.length} results. Selected range ${formatValue(filterMin)} to ${formatValue(filterMax)}. Visible range ${formatValue(viewMinOhm)} to ${formatValue(viewMaxOhm)}.`;
		}, 320);
	}
	$effect(() => () => {
		clearTimeout(emitTimer);
		clearTimeout(liveTimer);
	});

	// ── view changes (zoom/pan) — filter follows view, legacy parity ────────
	/** Filter bounds matching the view; exact data bounds at the domain edges so "Fit data" never rounds a result out. */
	function filterBoundsForView(): { lo: number; hi: number } {
		const lo =
			viewMinLog <= fullMinLog + 1e-12 && sortedValues.length
				? sortedValues[0]
				: roundFilterValue(Math.pow(10, viewMinLog));
		const hi =
			viewMaxLog >= fullMaxLog - 1e-12 && sortedValues.length
				? sortedValues[sortedValues.length - 1]
				: roundFilterValue(Math.pow(10, viewMaxLog));
		return { lo, hi };
	}

	function setView(next: { viewMin: number; viewMax: number }, opts: { syncFilter?: boolean; immediate?: boolean } = {}) {
		const { syncFilter = true, immediate = false } = opts;
		if (next.viewMin === viewMinLog && next.viewMax === viewMaxLog) return;
		viewMinLog = next.viewMin;
		viewMaxLog = next.viewMax;
		if (syncFilter) {
			const { lo, hi } = filterBoundsForView();
			emitFilter(lo, hi, immediate);
		}
		announce();
	}

	function zoomBy(factor: number, anchorLog?: number) {
		const anchor = anchorLog ?? (viewMinLog + viewMaxLog) / 2;
		setView(
			zoomViewAround(viewMinLog, viewMaxLog, anchor, factor, fullMinLog, fullMaxLog, minViewSpanLog),
			{ immediate: true }
		);
	}

	function fitData() {
		setView({ viewMin: fullMinLog, viewMax: fullMaxLog }, { immediate: true });
	}

	function fitSelection() {
		if (!(filterMin > 0) || !(filterMax > 0)) return;
		const next = initialViewForFilter(
			fullMinLog,
			fullMaxLog,
			Math.log10(filterMin),
			Math.log10(Math.max(filterMax, filterMin)),
			minViewSpanLog
		);
		// Framing the selection must not overwrite it (legacy showSelection).
		setView(next, { syncFilter: false });
	}

	// ── pointer interaction: pan / pinch / handle drag / band drag ──────────
	type DragMode = 'pan' | 'band' | 'handle-min' | 'handle-max';
	let dragMode: DragMode | null = null;
	let dragChanged = false;
	const pointers = new Map<number, number>(); // pointerId → clientX
	let pinchStartDist = 0;
	let pinchStartView = { min: 0, max: 0 };
	let dragStartX = 0;
	let dragStartView = { min: 0, max: 0 };
	let dragStartFilter = { min: 0, max: 0 };

	function zoneX(clientX: number): number {
		const rect = zoneEl?.getBoundingClientRect();
		return rect ? clientX - rect.left : 0;
	}

	function onPointerDown(e: PointerEvent) {
		if (!width) return;
		const target = e.target as HTMLElement;
		const handle = target.closest('[data-rrf-handle]') as HTMLElement | null;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, e.clientX);
		dragChanged = false;
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchStartDist = Math.abs(a - b);
			pinchStartView = { min: viewMinLog, max: viewMaxLog };
			dragMode = 'pan';
			return;
		}
		dragStartX = zoneX(e.clientX);
		dragStartView = { min: viewMinLog, max: viewMaxLog };
		dragStartFilter = { min: filterMin, max: filterMax };
		if (handle) {
			dragMode = handle.dataset.rrfHandle === 'min' ? 'handle-min' : 'handle-max';
			handle.focus();
		} else if (target.closest('[data-rrf-band]')) {
			dragMode = 'band';
		} else {
			dragMode = 'pan';
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragMode || !pointers.has(e.pointerId) || !width) return;
		pointers.set(e.pointerId, e.clientX);
		e.preventDefault();

		if (pointers.size === 2 && pinchStartDist > 0) {
			const [a, b] = [...pointers.values()];
			const dist = Math.abs(a - b);
			if (dist > 4) {
				const factor = dist / pinchStartDist;
				const midLog =
					pinchStartView.min +
					((zoneX((a + b) / 2) / width) * (pinchStartView.max - pinchStartView.min));
				const span = (pinchStartView.max - pinchStartView.min) / factor;
				const ratio = (midLog - pinchStartView.min) / (pinchStartView.max - pinchStartView.min);
				const nextMin = midLog - ratio * span;
				setView(
					constrainViewDomain(nextMin, nextMin + span, fullMinLog, fullMaxLog, minViewSpanLog)
				);
				dragChanged = true;
			}
			return;
		}

		const dxLog = ((zoneX(e.clientX) - dragStartX) / width) * (dragStartView.max - dragStartView.min);
		if (dragMode === 'pan') {
			setView(
				constrainViewDomain(
					dragStartView.min - dxLog,
					dragStartView.max - dxLog,
					fullMinLog,
					fullMaxLog,
					minViewSpanLog
				)
			);
			dragChanged = true;
		} else if (dragMode === 'band') {
			const loLog = Math.log10(Math.max(dragStartFilter.min, 1e-12)) + dxLog;
			const hiLog = Math.log10(Math.max(dragStartFilter.max, 1e-12)) + dxLog;
			const spanLog = hiLog - loLog;
			const lo = clamp(loLog, viewMinLog, viewMaxLog - spanLog);
			emitFilter(
				roundFilterValue(Math.pow(10, lo)),
				roundFilterValue(Math.pow(10, lo + spanLog)),
				true
			);
			dragChanged = true;
			announce();
		} else {
			const v = roundFilterValue(clamp(valueAtX(zoneX(e.clientX)), viewMinOhm, viewMaxOhm));
			if (dragMode === 'handle-min') {
				emitFilter(Math.min(v, filterMax), filterMax, true);
			} else {
				emitFilter(filterMin, Math.max(v, filterMin), true);
			}
			dragChanged = true;
			announce();
		}
	}

	function onPointerUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size === 0) {
			if (dragMode === 'pan' && dragChanged) {
				// Flush the debounced filter-follows-view emit.
				const { lo, hi } = filterBoundsForView();
				emitFilter(lo, hi, true);
			}
			dragMode = null;
			pinchStartDist = 0;
		}
	}

	function onWheel(e: WheelEvent) {
		if (!width) return;
		e.preventDefault();
		const factor = Math.pow(2, -e.deltaY * 0.002);
		zoomBy(factor, viewMinLog + (zoneX(e.clientX) / width) * viewLogSpan);
	}

	// ── keyboard: zone pans/zooms, handles adjust the selection ─────────────
	function onZoneKeydown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).dataset?.rrfHandle) return;
		let panFrac = 0.1;
		if (e.shiftKey) panFrac = 0.5;
		if (e.altKey) panFrac = 0.01;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			e.preventDefault();
			const dir = e.key === 'ArrowLeft' ? -panFrac : panFrac;
			setView(
				panViewByFraction(viewMinLog, viewMaxLog, dir, fullMinLog, fullMaxLog, minViewSpanLog),
				{ immediate: true }
			);
		} else if (e.key === '+' || e.key === '=') {
			e.preventDefault();
			zoomBy(2);
		} else if (e.key === '-' || e.key === '_') {
			e.preventDefault();
			zoomBy(0.5);
		} else if (e.key === '0') {
			e.preventDefault();
			fitData();
		}
	}

	function onHandleKeydown(which: 'min' | 'max', e: KeyboardEvent) {
		const stepLog = viewLogSpan / 100;
		let deltaLog = 0;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') deltaLog = -stepLog;
		else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') deltaLog = stepLog;
		else if (e.key === 'Home') deltaLog = Number.NEGATIVE_INFINITY;
		else if (e.key === 'End') deltaLog = Number.POSITIVE_INFINITY;
		else return;
		e.preventDefault();
		e.stopPropagation();
		if (e.shiftKey && Number.isFinite(deltaLog)) deltaLog *= 10;
		const current = which === 'min' ? filterMin : filterMax;
		const curLog = Math.log10(Math.max(current, 1e-12));
		const nextLog = Number.isFinite(deltaLog)
			? clamp(curLog + deltaLog, viewMinLog, viewMaxLog)
			: deltaLog < 0
				? viewMinLog
				: viewMaxLog;
		const v = roundFilterValue(Math.pow(10, nextLog));
		if (which === 'min') emitFilter(Math.min(v, filterMax), filterMax, true);
		else emitFilter(filterMin, Math.max(v, filterMin), true);
		announce();
	}

	// ── full-domain overview strip ───────────────────────────────────────────
	const overviewBins = $derived(
		width > 0 ? computeLogBins(sortedValues, fullMinLog, fullMaxLog, Math.max(16, Math.min(100, Math.round(width / 8)))) : []
	);
	const overviewMax = $derived(overviewBins.reduce((m, b) => Math.max(m, b.count), 0) || 1);
	function ovX(lg: number): number {
		return ((lg - fullMinLog) / (fullMaxLog - fullMinLog)) * width;
	}

	let overviewDragging = false;
	function overviewMoveTo(clientX: number) {
		const rect = (zoneEl?.parentElement ?? zoneEl)?.getBoundingClientRect();
		if (!rect || !width) return;
		const frac = clamp((clientX - rect.left) / width, 0, 1);
		const centerLog = fullMinLog + frac * (fullMaxLog - fullMinLog);
		const span = viewLogSpan;
		setView(
			constrainViewDomain(
				centerLog - span / 2,
				centerLog + span / 2,
				fullMinLog,
				fullMaxLog,
				minViewSpanLog
			)
		);
	}
	function onOverviewPointerDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		overviewDragging = true;
		overviewMoveTo(e.clientX);
	}
	function onOverviewPointerMove(e: PointerEvent) {
		if (overviewDragging) overviewMoveTo(e.clientX);
	}
	function onOverviewPointerUp() {
		overviewDragging = false;
		const { lo, hi } = filterBoundsForView();
		emitFilter(lo, hi, true);
	}
</script>

<div class="space-y-2" role="group" aria-label="Total resistance filter">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-xs tabular-nums text-wt-muted-fg">
			Showing {selectedCount.toLocaleString()} of {sortedValues.length.toLocaleString()} results
			· view {formatValue(viewMinOhm)} – {formatValue(viewMaxOhm)}
		</p>
		<div class="flex items-center gap-1">
			<button type="button" class="rrf-btn" aria-label="Zoom out" onclick={() => zoomBy(0.5)}>−</button>
			<button type="button" class="rrf-btn" aria-label="Zoom in" onclick={() => zoomBy(2)}>+</button>
			<button type="button" class="rrf-btn rrf-btn-text" onclick={fitData}>Fit data</button>
			<button type="button" class="rrf-btn rrf-btn-text" onclick={fitSelection}>Fit selection</button>
		</div>
	</div>

	{#if selectionOffscreen}
		<div class="flex items-center gap-2 text-xs text-wt-muted-fg">
			<span>Selected range is outside this view.</span>
			<button type="button" class="rrf-btn rrf-btn-text" onclick={fitSelection}>Show selection</button>
		</div>
	{/if}

	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role=application zone: pan/zoom via its own pointer+keyboard handlers) -->
	<div
		bind:this={zoneEl}
		bind:clientWidth={width}
		class="rrf-zone relative select-none"
		tabindex="0"
		role="application"
		aria-label="Histogram of matches. Scroll or pinch to zoom, drag to pan, arrow keys to pan, plus and minus to zoom, 0 to fit."
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onwheel={onWheel}
		onkeydown={onZoneKeydown}
	>
		<ResistanceHistogram
			{sortedValues}
			{viewMinLog}
			{viewMaxLog}
			{filterMin}
			{filterMax}
			height={BAR_H}
			{formatValue}
		/>
		{#if width > 0}
			{@const bandLeft = clamp(Math.min(handleMinX, handleMaxX), 0, width)}
			{@const bandRight = clamp(Math.max(handleMinX, handleMaxX), 0, width)}
			<div
				data-rrf-band
				class="rrf-band"
				style={`left:${bandLeft}px;width:${Math.max(2, bandRight - bandLeft)}px;height:${BAR_H}px;`}
			></div>
			<div
				data-rrf-handle="min"
				class="rrf-handle"
				style={`left:${handleMinX}px;height:${BAR_H}px;`}
				role="slider"
				tabindex="0"
				aria-label="Minimum total resistance"
				aria-valuemin={viewMinOhm}
				aria-valuemax={viewMaxOhm}
				aria-valuenow={filterMin}
				aria-valuetext={formatValue(filterMin)}
				aria-orientation="horizontal"
				onkeydown={(e) => onHandleKeydown('min', e)}
			></div>
			<div
				data-rrf-handle="max"
				class="rrf-handle"
				style={`left:${handleMaxX}px;height:${BAR_H}px;`}
				role="slider"
				tabindex="0"
				aria-label="Maximum total resistance"
				aria-valuemin={viewMinOhm}
				aria-valuemax={viewMaxOhm}
				aria-valuenow={filterMax}
				aria-valuetext={formatValue(filterMax)}
				aria-orientation="horizontal"
				onkeydown={(e) => onHandleKeydown('max', e)}
			></div>
		{/if}
	</div>

	{#if width > 0}
		<svg
			class="rrf-overview block w-full"
			width={width}
			height={OVERVIEW_H}
			viewBox={`0 0 ${width} ${OVERVIEW_H}`}
			aria-hidden="true"
			onpointerdown={onOverviewPointerDown}
			onpointermove={onOverviewPointerMove}
			onpointerup={onOverviewPointerUp}
			onpointercancel={onOverviewPointerUp}
		>
			{#each overviewBins as b (b.x0)}
				{#if b.count > 0}
					{@const x0 = ovX(Math.log10(b.x0))}
					{@const x1 = ovX(Math.log10(b.x1))}
					{@const h = Math.max(1, (b.count / overviewMax) * (OVERVIEW_H - 2))}
					<rect
						class="rrf-ov-bin"
						x={x0}
						y={OVERVIEW_H - h}
						width={Math.max(1, x1 - x0 - 0.5)}
						height={h}
						shape-rendering="crispEdges"
					/>
				{/if}
			{/each}
			<rect
				class="rrf-ov-window"
				x={ovX(viewMinLog)}
				y="0.5"
				width={Math.max(2, ovX(viewMaxLog) - ovX(viewMinLog))}
				height={OVERVIEW_H - 1}
			/>
		</svg>
	{/if}

	<p class="text-[11px] text-wt-muted-fg">
		Scroll or pinch on the histogram to zoom; drag to pan (zooming sets the band to the view).
		Drag the handles or the shaded band to narrow the selection; handles support arrow keys.
	</p>
	<div class="sr-only" aria-live="polite">{liveText}</div>
</div>

<style>
	.rrf-zone {
		touch-action: none;
		cursor: grab;
		outline: none;
		border-radius: 6px;
	}
	.rrf-zone:active {
		cursor: grabbing;
	}
	.rrf-zone:focus-visible {
		box-shadow: 0 0 0 2px var(--wt-color-brand-design, #6d5ae6);
	}
	.rrf-band {
		position: absolute;
		top: 0;
		background: color-mix(in srgb, var(--wt-color-brand-design, #6d5ae6) 12%, transparent);
		border-left: 1px solid color-mix(in srgb, var(--wt-color-brand-design, #6d5ae6) 45%, transparent);
		border-right: 1px solid color-mix(in srgb, var(--wt-color-brand-design, #6d5ae6) 45%, transparent);
		cursor: ew-resize;
	}
	.rrf-handle {
		position: absolute;
		top: 0;
		width: 14px;
		margin-left: -7px;
		cursor: col-resize;
		outline: none;
	}
	.rrf-handle::after {
		content: '';
		position: absolute;
		left: 5px;
		top: 0;
		bottom: 0;
		width: 4px;
		border-radius: 2px;
		background: var(--wt-color-brand-design, #6d5ae6);
	}
	.rrf-handle:focus-visible::after {
		box-shadow: 0 0 0 2px var(--wt-color-canvas, #fff), 0 0 0 4px var(--wt-color-brand-design, #6d5ae6);
	}
	.rrf-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 26px;
		height: 26px;
		padding: 0 0.45rem;
		border-radius: 6px;
		border: 1px solid var(--wt-color-border, #d4d4dc);
		background: var(--wt-color-surface, #fff);
		color: var(--wt-color-ink, #17171c);
		font-size: 0.8rem;
		line-height: 1;
		cursor: pointer;
	}
	.rrf-btn:hover {
		border-color: var(--wt-color-brand-design, #6d5ae6);
	}
	.rrf-btn-text {
		font-size: 0.72rem;
	}
	.rrf-overview {
		cursor: grab;
		touch-action: none;
	}
	.rrf-ov-bin {
		fill: var(--wt-color-muted-fg, #8b8b96);
		opacity: 0.4;
	}
	.rrf-ov-window {
		fill: color-mix(in srgb, var(--wt-color-brand-design, #6d5ae6) 15%, transparent);
		stroke: var(--wt-color-brand-design, #6d5ae6);
		stroke-width: 1;
	}
</style>
