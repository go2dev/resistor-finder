import type { DividerResult } from '$lib/domain/voltage-divider';
import { getDividerPowerPresentation } from '$lib/domain/divider-power';
import { formatResistorValue } from '$lib/domain/resistor';

/** PNG filename aligned with legacy `downloadDiagram` conventions (divider-only). */
export function dividerPngFilename(result: DividerResult, supplyVoltage: number, targetVoltage: number): string {
	const rTop = formatResistorValue(result.top.total).replace(/[^\w]/g, '');
	const rBot = formatResistorValue(result.bottom.total).replace(/[^\w]/g, '');
	return `voltagedivider-${supplyVoltage}V-${targetVoltage}V-${rTop}-${rBot}.png`;
}

/** Annotation lines under the schematic in exported PNGs — derived from domain data only. */
export function dividerPngAnnotations(result: DividerResult, supplyVoltage: number): string[] {
	const lines = [
		`Total resistance: ${formatResistorValue(result.totalResistance)}`,
		`Error: ${result.error > 0 ? '+' : ''}${result.error.toFixed(3)} V`
	];
	if (result.voltageRange) {
		const { min, max } = result.voltageRange;
		lines.push(`Real world Vout range: ${min.toFixed(2)}V to ${max.toFixed(2)}V`);
	}
	lines.push(...getDividerPowerPresentation(result, supplyVoltage).pngExtras);
	return lines;
}
