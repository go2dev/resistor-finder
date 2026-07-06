<script lang="ts">
	// Target-resistance result diagram on the engine: standalone network with
	// the total-resistance measurement bracket, per-part hover tooltips
	// (value + series/tolerance — the page has no supply, so no V/I/P), and
	// PNG export with the legacy filename convention.
	import Button from '$lib/components/ui/button.svelte';
	import DiagramHost from '$lib/components/diagrams/diagram-host.svelte';
	import {
		EXPORT_INK,
		NetworkBlockSchematic,
		parallel,
		r,
		series,
		type AnyResistorGlyph,
		type NetNode
	} from '$lib/diagram/engine';
	import { exportSvgToPng } from '$lib/services/diagram-export';
	import { formatResistorValue } from '$lib/domain/resistor';
	import { orderCombination, type ComboNode, type ComboResistor } from '$lib/domain/target-resistance';

	let {
		combo,
		totalResistance,
		comboLabel,
		targetInput
	}: {
		combo: ComboNode;
		totalResistance: number;
		comboLabel: string;
		targetInput: string;
	} = $props();

	const ordered = $derived(orderCombination(combo));

	function comboToNetNode(node: ComboNode): NetNode {
		if (!Array.isArray(node)) return r(node.value);
		const children = node.map(comboToNetNode);
		return node.type === 'parallel' ? parallel(...children) : series(...children);
	}

	const network = $derived(comboToNetNode(ordered));

	function comboResistorAt(indices: number[]): ComboResistor | null {
		let cur: ComboNode = ordered;
		for (const i of indices) {
			if (!Array.isArray(cur)) return null;
			cur = cur[i];
			if (cur == null) return null;
		}
		return Array.isArray(cur) ? null : cur;
	}

	function partTooltip(g: AnyResistorGlyph): { lines: string[]; class?: string } {
		// glyph ids are `n.<child indices>` into the ordered combo tree
		const indices = g.id.split('.').slice(1).map(Number);
		const part = comboResistorAt(indices);
		const lines = [formatResistorValue(g.value)];
		if (part?.series) lines.push(`Series: ${part.series}`);
		if (part?.tolerance != null) lines.push(`Tolerance: ${part.tolerance}%`);
		return {
			lines,
			class: part?.series ? `series-${part.series.toLowerCase()}` : undefined
		};
	}

	let hostEl: HTMLElement | null = $state(null);

	function downloadPng() {
		const svg = hostEl?.querySelector('svg');
		if (!(svg instanceof SVGSVGElement)) return;

		// Legacy downloadTargetDiagram filename convention:
		// target-<target input>-<formatted total>-<sanitized combo>.png
		const formattedTotal = formatResistorValue(totalResistance).replace(/[^\w]/g, '');
		const sanitizedCombo = comboLabel.replace(/[^\w]+/g, '-').slice(0, 40);
		exportSvgToPng(svg, `target-${targetInput}-${formattedTotal}-${sanitizedCombo}.png`, {
			scale: 2,
			inkColor: EXPORT_INK
		});
	}
</script>

<DiagramHost>
	<div bind:this={hostEl} class="diagram-surface inline-block w-full max-w-md">
		<NetworkBlockSchematic {network} measurementLabel={formatResistorValue(totalResistance)} {partTooltip} />
	</div>
	<Button type="button" variant="outline" size="sm" class="text-xs" onclick={downloadPng}>
		Download diagram PNG
	</Button>
</DiagramHost>
