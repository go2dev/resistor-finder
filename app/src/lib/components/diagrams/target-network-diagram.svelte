<script lang="ts">
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/button.svelte';
	import DiagramHost from '$lib/components/diagrams/diagram-host.svelte';
	import { ensureSchematicLoaded, getDiagramConstructor } from '$lib/adapters/schematic-browser';
	import { ensureResistorUtilsLoaded, getResistorUtils } from '$lib/adapters/resistor-utils-browser';
	import { exportSvgToPng } from '$lib/services/diagram-export';
	import { formatResistorValue } from '$lib/domain/resistor';
	import { orderCombination, wrapText, type ComboNode } from '$lib/domain/target-resistance';

	// Legacy schematic.js Diagram members we use beyond the shared adapter type.
	type NetworkDiagram = {
		svg?: SVGSVGElement;
		renderNetwork?: (section: ComboNode, options?: Record<string, unknown>) => void;
		renderTextDiagram: (lines: string[], title?: string) => void;
	};
	type NetworkDiagramCtor = new (containerId: string, width?: number, height?: number) => NetworkDiagram;

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

	const diagramId =
		typeof crypto !== 'undefined' && crypto.randomUUID
			? `tr-diagram-${crypto.randomUUID()}`
			: `tr-diagram-${Math.random().toString(36).slice(2)}`;

	// Legacy target-resistance.js initializeTargetDiagrams dimensions.
	const DIAGRAM_WIDTH = 360;
	const DIAGRAM_HEIGHT = 240;

	function fmtValue(value: number): string {
		const Ru = getResistorUtils();
		return Ru ? Ru.formatResistorValue(value) : formatResistorValue(value);
	}

	function renderDiagram(currentCombo: ComboNode, total: number, label: string) {
		const el = document.getElementById(diagramId);
		if (!el) return;
		const DiagramCtor = getDiagramConstructor() as unknown as NetworkDiagramCtor | undefined;
		if (!DiagramCtor) return;

		el.innerHTML = '';
		const totalLabel = fmtValue(total);
		const diagram = new DiagramCtor(diagramId, DIAGRAM_WIDTH, DIAGRAM_HEIGHT);
		let renderedNetwork = false;
		if (currentCombo && typeof diagram.renderNetwork === 'function') {
			try {
				diagram.renderNetwork(orderCombination(currentCombo), {
					minWidth: DIAGRAM_WIDTH,
					minHeight: DIAGRAM_HEIGHT,
					measurementLabel: totalLabel
				});
				renderedNetwork = (diagram.svg?.childNodes?.length ?? 0) > 0;
			} catch {
				renderedNetwork = false;
			}
		}
		if (!renderedNetwork) {
			// Same text fallback as legacy: wrapped combination plus a total line.
			diagram.renderTextDiagram(wrapText(label).concat([`Total: ${totalLabel}`]), '');
		}
	}

	function downloadPng() {
		const wrap = document.getElementById(diagramId);
		const svg = wrap?.querySelector('svg');
		if (!(svg instanceof SVGSVGElement)) return;

		// Legacy downloadTargetDiagram filename convention:
		// target-<target input>-<formatted total>-<sanitized combo>.png
		const formattedTotal = fmtValue(totalResistance).replace(/[^\w]/g, '');
		const sanitizedCombo = comboLabel.replace(/[^\w]+/g, '-').slice(0, 40);
		exportSvgToPng(svg, `target-${targetInput}-${formattedTotal}-${sanitizedCombo}.png`, {
			scale: 2,
			extraLines: []
		});
	}

	$effect(() => {
		if (!browser) return;

		const currentCombo = combo;
		const total = totalResistance;
		const label = comboLabel;

		void (async () => {
			try {
				// renderNetwork labels resistors via the legacy ResistorUtils global.
				await Promise.all([ensureSchematicLoaded(), ensureResistorUtilsLoaded()]);
				renderDiagram(currentCombo, total, label);
			} catch (e) {
				console.error(e);
			}
		})();
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
