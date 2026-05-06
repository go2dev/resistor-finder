import { formatResistorValue } from '$lib/domain/resistor';
import type { Network } from '$lib/domain/voltage-divider';

/** Maps worker/local combo sections to UI `Network` rows */
export function legacySectionToNetwork(section: unknown): Network {
	if (!Array.isArray(section)) {
		const v = (section as { value: number }).value;
		return {
			kind: 'single',
			parts: [v],
			total: v,
			label: formatResistorValue(v),
			componentCount: 1
		};
	}

	const arr = section as { value: number }[];
	const type = (section as { type?: string }).type || 'series';
	const a = arr[0].value;
	const b = arr[1].value;

	if (type === 'parallel') {
		const total = (a * b) / (a + b);
		return {
			kind: 'parallel',
			parts: [a, b],
			total,
			label: `${formatResistorValue(a)} || ${formatResistorValue(b)}`,
			componentCount: 2
		};
	}

	const total = a + b;
	return {
		kind: 'series',
		parts: [a, b],
		total,
		label: `${formatResistorValue(a)} + ${formatResistorValue(b)}`,
		componentCount: 2
	};
}
