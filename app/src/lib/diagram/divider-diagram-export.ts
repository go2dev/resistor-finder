import type { DividerResult } from '$lib/domain/voltage-divider';
import {
	calculateDividerVoltageRangeForSupply,
	getDividerPowerPresentation
} from '$lib/domain/divider-power';
import { formatResistorValue } from '$lib/domain/resistor';
import type { PdfFigureRow } from '$lib/services/pdf-export';

function dividerExportBasename(result: DividerResult, supplyVoltage: number, targetVoltage: number): string {
	const rTop = formatResistorValue(result.top.total).replace(/[^\w]/g, '');
	const rBot = formatResistorValue(result.bottom.total).replace(/[^\w]/g, '');
	return `voltagedivider-${supplyVoltage}V-${targetVoltage}V-${rTop}-${rBot}`;
}

/** PNG filename aligned with legacy `downloadDiagram` conventions (divider-only). */
export function dividerPngFilename(result: DividerResult, supplyVoltage: number, targetVoltage: number): string {
	return `${dividerExportBasename(result, supplyVoltage, targetVoltage)}.png`;
}

export function dividerPdfFilename(result: DividerResult, supplyVoltage: number, targetVoltage: number): string {
	return `${dividerExportBasename(result, supplyVoltage, targetVoltage)}.pdf`;
}

/** The result card's key figures as PDF label/value rows (same fields the card shows). */
export function dividerPdfFigures(result: DividerResult, supplyVoltage: number): PdfFigureRow[] {
	const power = getDividerPowerPresentation(result, supplyVoltage);
	const range = calculateDividerVoltageRangeForSupply(result, supplyVoltage);
	const liveOut =
		(result.bottom.total / (result.top.total + result.bottom.total)) * supplyVoltage;
	return [
		{ label: 'R_TOP', value: `${result.top.label} = ${formatResistorValue(result.top.total)}` },
		{ label: 'R_BOT', value: `${result.bottom.label} = ${formatResistorValue(result.bottom.total)}` },
		{ label: 'R_TOP : R_BOT ratio', value: power.ratioText },
		{ label: 'Supply voltage', value: `${Number(supplyVoltage.toFixed(2))} V` },
		{ label: 'Nominal output', value: `${liveOut.toFixed(3)} V` },
		{ label: 'Error vs target', value: `${result.error > 0 ? '+' : ''}${result.error.toFixed(3)} V` },
		{ label: 'Total resistance', value: formatResistorValue(result.totalResistance) },
		{ label: 'Components', value: String(result.componentCount) },
		{ label: 'Real-world Vout range', value: `${range.min.toFixed(2)} V to ${range.max.toFixed(2)} V` },
		{
			label: 'Power dissipation',
			value: `R_TOP ${power.powerTopLabel}, R_BOT ${power.powerBotLabel}, total ${power.totalPowerLabel}`
		},
		{ label: 'Min package recommendation', value: power.packageLine }
	];
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
