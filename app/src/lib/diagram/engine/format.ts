// Shared electrical-quantity formatting for tooltips and labels.

import { formatResistorValue } from '$lib/domain/resistor';

export function formatWatts(watts: number): string {
	if (watts >= 1) return `${watts.toFixed(2)}W`;
	if (watts >= 0.001) return `${(watts * 1000).toFixed(1)}mW`;
	return `${(watts * 1_000_000).toFixed(1)}µW`;
}

export function formatAmps(amps: number): string {
	if (amps >= 1) return `${amps.toFixed(2)}A`;
	if (amps >= 0.001) return `${(amps * 1000).toFixed(2)}mA`;
	return `${(amps * 1_000_000).toFixed(1)}µA`;
}

export type PartElectrical = {
	ref?: string;
	value: number;
	volts: number;
	amps: number;
	watts: number;
};

/** Tooltip body for one part: value (+ref), V across, I, P. */
export function partTooltipLines(part: PartElectrical): string[] {
	const title = part.ref
		? `${part.ref}: ${formatResistorValue(part.value)}`
		: formatResistorValue(part.value);
	return [
		title,
		`V across: ${part.volts.toFixed(3)}V`,
		`I: ${formatAmps(part.amps)}`,
		`P: ${formatWatts(part.watts)}`
	];
}
