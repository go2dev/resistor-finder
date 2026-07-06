// Replaces the legacy `renderResultDiagram` global (script.js) with an
// engine-based renderer: legacy result cards keep their markup, compute and
// PNG-download wiring, but the schematic itself is a mounted engine
// component (live labels + per-part V/I/P tooltips). script.js declares
// renderResultDiagram at top level, so its internal calls resolve through
// the overwritten window binding. Only the app uses this — the root site
// keeps stock script.js behaviour.

import { mount, unmount } from 'svelte';

import NetworkSchematic from '$lib/diagram/engine/network-schematic.svelte';
import { networkToNetNode, type NetNode } from '$lib/diagram/engine/model';
import { legacySectionToNetwork } from '$lib/domain/legacy-section-network';

type LegacyDiagramOptions = {
	caption?: string;
	zLoadLabel?: string;
	zLoadValueStr?: string;
};

type LegacyResult = {
	r1: unknown;
	r2: unknown;
	r3?: unknown;
	r1Value?: number;
	r2Value?: number;
	outputVoltage?: number;
	attenuatorKind?: string;
};

type DownloadDiagram = (
	index: number,
	r1Value: number,
	r2Value: number,
	outputVoltage: number,
	isAttenuator?: boolean,
	attenuatorKind?: string | null
) => void;

type RenderResultDiagram = (
	container: HTMLElement,
	result: LegacyResult,
	supplyVoltage: number,
	targetVoltage: number,
	options?: LegacyDiagramOptions
) => void;

const mountedInstances: { container: Element; instance: object }[] = [];

function pruneDisconnected() {
	for (let i = mountedInstances.length - 1; i >= 0; i -= 1) {
		if (!mountedInstances[i].container.isConnected) {
			void unmount(mountedInstances[i].instance);
			mountedInstances.splice(i, 1);
		}
	}
}

function sectionToNetNode(section: unknown): NetNode {
	return networkToNetNode(legacySectionToNetwork(section));
}

export function installEngineResultDiagrams(): void {
	if (typeof window === 'undefined') return;
	const w = window as Window & { renderResultDiagram?: RenderResultDiagram };

	w.renderResultDiagram = (container, result, supplyVoltage, targetVoltage, options = {}) => {
		pruneDisconnected();

		const sections = [result.r1, result.r2, result.r3]
			.filter((s) => s != null)
			.map(sectionToNetNode);
		const kind = result.attenuatorKind || (result.r3 != null ? 'u' : null);

		// The container also holds the card's PNG-download button — only
		// replace our own wrapper, never the whole container.
		container.querySelector('[data-engine-diagram]')?.remove();
		const wrapper = document.createElement('div');
		wrapper.dataset.engineDiagram = '';
		container.appendChild(wrapper);
		const instance = mount(NetworkSchematic, {
			target: wrapper,
			props: {
				supplyVoltage,
				sections,
				tapAfterIndex: 0,
				tapVoltage: targetVoltage,
				caption: options.caption,
				tapLoad:
					kind === 'l' && options.zLoadLabel
						? { label: options.zLoadLabel, value: options.zLoadValueStr || undefined }
						: undefined
			}
		});
		mountedInstances.push({ container: wrapper, instance });

		// script.js emits the card's download button with a broken inline
		// onclick when attenuatorKind is set (JSON.stringify quotes terminate
		// the HTML attribute). Rewire it here — app-side only; the root site
		// keeps stock behaviour.
		const btn = container.querySelector<HTMLButtonElement>('.diagram-download-btn');
		const download = (window as Window & { downloadDiagram?: DownloadDiagram }).downloadDiagram;
		if (btn && download) {
			const index = Number(container.id.replace('diagram-', ''));
			btn.removeAttribute('onclick');
			btn.onclick = () =>
				download(
					index,
					result.r1Value ?? 0,
					result.r2Value ?? 0,
					result.outputVoltage ?? 0,
					kind != null,
					kind
				);
		}
	};
}
