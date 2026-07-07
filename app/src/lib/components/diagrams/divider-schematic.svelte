<script lang="ts">
	// Voltage-divider result-card diagram on the engine renderer: live
	// Vsupply/Vout labels, per-part V/I/P tooltips at the card's slider
	// supply, and PNG export with the legacy filename/annotation format.
	import DiagramHost from '$lib/components/diagrams/diagram-host.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import { EXPORT_INK, NetworkSchematic, networkToNetNode } from '$lib/diagram/engine';
	import {
		dividerPdfFigures,
		dividerPdfFilename,
		dividerPngAnnotations,
		dividerPngFilename
	} from '$lib/diagram/divider-diagram-export';
	import type { DividerResult } from '$lib/domain/voltage-divider';
	import { exportSvgToPng } from '$lib/services/diagram-export';
	import { exportResultPdf } from '$lib/services/pdf-export';

	let {
		result,
		supplyVoltage,
		targetVoltage
	}: {
		result: DividerResult;
		supplyVoltage: number;
		targetVoltage: number;
	} = $props();

	const sections = $derived([networkToNetNode(result.top), networkToNetNode(result.bottom)]);
	// slider steps of 0.1 accumulate float noise — trim for the label
	const supplyLabel = $derived(`Vin ${Number(supplyVoltage.toFixed(2))}V`);

	let hostEl: HTMLElement | null = $state(null);

	function downloadPng() {
		const svg = hostEl?.querySelector('svg');
		if (!(svg instanceof SVGSVGElement)) return;
		exportSvgToPng(svg, dividerPngFilename(result, supplyVoltage, targetVoltage), {
			scale: 2,
			annotations: dividerPngAnnotations(result, supplyVoltage),
			inkColor: EXPORT_INK
		});
	}

	let pdfBusy = $state(false);
	async function downloadPdf() {
		const svg = hostEl?.querySelector('svg');
		if (!(svg instanceof SVGSVGElement) || pdfBusy) return;
		pdfBusy = true;
		try {
			await exportResultPdf(
				svg,
				dividerPdfFilename(result, supplyVoltage, targetVoltage),
				{
					title: 'Voltage Divider Result',
					subtitle: `Target ${Number(targetVoltage.toFixed(3))} V from ${Number(supplyVoltage.toFixed(2))} V supply`,
					figures: dividerPdfFigures(result, supplyVoltage),
					footer: {
						toolName: 'Resistor Divider — Voltage Divider',
						site: 'resistordivider.com',
						dateIso: new Date().toISOString().slice(0, 10)
					}
				},
				{ inkColor: EXPORT_INK }
			);
		} finally {
			pdfBusy = false;
		}
	}
</script>

<DiagramHost>
	<div bind:this={hostEl} class="diagram-surface inline-block w-full max-w-md">
		<NetworkSchematic {supplyVoltage} {sections} {supplyLabel} tapAfterIndex={0} />
	</div>
	<Button type="button" variant="outline" size="sm" class="text-xs" onclick={downloadPng}>
		Download diagram PNG
	</Button>
	<Button type="button" variant="outline" size="sm" class="text-xs" onclick={() => void downloadPdf()} disabled={pdfBusy}>
		{pdfBusy ? 'Building PDF…' : 'Download result PDF'}
	</Button>
</DiagramHost>
