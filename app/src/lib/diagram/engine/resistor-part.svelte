<script lang="ts">
	// One interactive resistor: zigzag body, invisible hit area, value/ref
	// label, hover/focus styling. Both orientations render from the shared
	// symbol definitions — this is the only place a resistor is drawn.
	import type { AnyResistorGlyph } from './layout';
	import {
		HIT_HALF_WIDTH,
		resistorPathH,
		resistorPathV,
		STROKE_WIDTH,
		VALUE_STYLE
	} from './symbols';

	type LabelSide = 'right' | 'above' | 'below';

	let {
		glyph,
		labelLines,
		ariaLabel,
		hovered = false,
		labelSide,
		onPointer,
		onLeave,
		onFocus,
		onBlur,
		onActivate
	}: {
		glyph: AnyResistorGlyph;
		labelLines: string[];
		ariaLabel: string;
		hovered?: boolean;
		labelSide?: LabelSide;
		onPointer: (glyph: AnyResistorGlyph, event: PointerEvent) => void;
		onLeave: () => void;
		onFocus: (glyph: AnyResistorGlyph) => void;
		onBlur: () => void;
		/** Click / Enter / Space on the part (interactive editors). */
		onActivate?: (glyph: AnyResistorGlyph) => void;
	} = $props();

	const LINE_H = 13;

	const side = $derived<LabelSide>(
		labelSide ?? (glyph.orientation === 'vertical' ? 'right' : 'above')
	);

	const geo = $derived.by(() => {
		if (glyph.orientation === 'vertical') {
			const mid = (glyph.yTop + glyph.yBottom) / 2;
			return {
				path: resistorPathV(glyph.cx, glyph.yTop, glyph.yBottom),
				hit: {
					x: glyph.cx - HIT_HALF_WIDTH,
					y: glyph.yTop,
					width: 2 * HIT_HALF_WIDTH,
					height: glyph.yBottom - glyph.yTop
				},
				midAlong: mid,
				cross: glyph.cx
			};
		}
		const mid = (glyph.xLeft + glyph.xRight) / 2;
		return {
			path: resistorPathH(glyph.cy, glyph.xLeft, glyph.xRight),
			hit: {
				x: glyph.xLeft,
				y: glyph.cy - HIT_HALF_WIDTH,
				width: glyph.xRight - glyph.xLeft,
				height: 2 * HIT_HALF_WIDTH
			},
			midAlong: mid,
			cross: glyph.cy
		};
	});

	function labelPos(index: number): { x: number; y: number; anchor: 'start' | 'middle' } {
		const n = labelLines.length;
		if (side === 'right') {
			return {
				x: geo.cross + 13,
				y: geo.midAlong + 4 + (index - (n - 1) / 2) * LINE_H,
				anchor: 'start'
			};
		}
		if (side === 'above') {
			return { x: geo.midAlong, y: geo.cross - 14 - (n - 1 - index) * LINE_H, anchor: 'middle' };
		}
		return { x: geo.midAlong, y: geo.cross + 24 + index * LINE_H, anchor: 'middle' };
	}
</script>

<g
	class="engine-part"
	class:engine-hovered={hovered}
	role="button"
	tabindex="0"
	aria-label={ariaLabel}
	onpointerenter={(e) => onPointer(glyph, e)}
	onpointermove={(e) => onPointer(glyph, e)}
	onpointerleave={onLeave}
	onfocus={() => onFocus(glyph)}
	onblur={onBlur}
	onclick={() => onActivate?.(glyph)}
	onkeydown={(e) => {
		if (onActivate && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onActivate(glyph);
		}
	}}
>
	<rect {...geo.hit} fill="transparent" stroke="none" />
	<path
		d={geo.path}
		fill="none"
		stroke="currentColor"
		stroke-width={STROKE_WIDTH}
		stroke-linejoin="round"
	/>
	{#each labelLines as line, i}
		{@const pos = labelPos(i)}
		<text x={pos.x} y={pos.y} text-anchor={pos.anchor} fill="currentColor" style={VALUE_STYLE}>
			{line}
		</text>
	{/each}
</g>

<style>
	.engine-part {
		cursor: pointer;
		outline: none;
	}
	.engine-part:hover path,
	.engine-hovered path,
	.engine-part:focus-visible path {
		stroke: var(--wt-color-brand-design, #6d5ae6);
	}
	.engine-part:hover text,
	.engine-hovered text,
	.engine-part:focus-visible text {
		fill: var(--wt-color-brand-design, #6d5ae6);
	}
</style>
