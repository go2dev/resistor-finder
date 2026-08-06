<script lang="ts">
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/button.svelte';
	import DiagramHost from '$lib/components/diagrams/diagram-host.svelte';
	import { ensureSchematicLoaded } from '$lib/adapters/schematic-browser';
	import { renderVoltageDividerDiagram } from '$lib/adapters/voltage-divider-diagram';
	import type { DividerResult } from '$lib/domain/voltage-divider';
	import { dividerPngAnnotations, dividerPngFilename } from '$lib/diagram/divider-diagram-export';
	import { exportSvgToPng } from '$lib/services/diagram-export';

	let {
		result,
		supplyVoltage,
		targetVoltage
	}: {
		result: DividerResult;
		supplyVoltage: number;
		targetVoltage: number;
	} = $props();

	const diagramId =
		typeof crypto !== 'undefined' && crypto.randomUUID
			? `vd-diagram-${crypto.randomUUID()}`
			: `vd-diagram-${Math.random().toString(36).slice(2)}`;

	function downloadPng() {
		const wrap = document.getElementById(diagramId);
		const svg = wrap?.querySelector('svg');
		if (!(svg instanceof SVGSVGElement)) return;

		exportSvgToPng(svg, dividerPngFilename(result, supplyVoltage, targetVoltage), {
			scale: 2,
			annotations: dividerPngAnnotations(result, supplyVoltage)
		});
	}

	$effect(() => {
		if (!browser) return;

		void (async () => {
			try {
				await ensureSchematicLoaded();
				renderVoltageDividerDiagram(diagramId, result.top, result.bottom, supplyVoltage, targetVoltage);
			} catch (e) {
				console.error(e);
			}
		})();

		result;
		supplyVoltage;
		targetVoltage;
	});
</script>

{#if browser}
	<DiagramHost>
		<div id={diagramId} class="diagram-surface inline-block max-w-full [&_svg]:max-w-full"></div>
		<Button type="button" variant="outline" size="sm" class="text-xs" onclick={downloadPng}>
			Download diagram PNG
		</Button>
	</DiagramHost>
{/if}
