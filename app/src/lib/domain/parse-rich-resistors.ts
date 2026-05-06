import { browser } from '$app/environment';
import { ensureJlcBasicCatalogLoaded } from '$lib/adapters/jlc-basic-catalog-browser';
import { ensureResistorUtilsLoaded, getResistorUtils } from '$lib/adapters/resistor-utils-browser';
import type { ParsedResistor } from '$lib/domain/resistor';
import { parseResistorList } from '$lib/domain/resistor';

export type RichParsedResistor = ParsedResistor & {
	tolerance?: number | null;
	powerRating?: number | null;
	powerCode?: string | null;
	series?: string | null;
	source?: string;
	isJlcBasic?: boolean;
	jlcBasicMeta?: {
		packages: string[];
		tolerances: number[];
		detailSource?: string;
	} | null;
};

function uniqueTokens(rawInput: string): string[] {
	const rawTokens = rawInput.split(',').map((t) => t.trim()).filter(Boolean);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of rawTokens) {
		const key = t.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(t);
	}
	return out;
}

export async function parseRichResistorInputs(
	rawInput: string,
	options: { snapToSeries: boolean; snapSeries: string }
): Promise<{ resistors: RichParsedResistor[]; warnings: string[] }> {
	const warnings: string[] = [];

	if (!browser) {
		const { resistors, warnings: w } = parseResistorList(rawInput);
		warnings.push(...w);
		return { resistors: resistors.map((r) => ({ ...r })), warnings };
	}

	try {
		await ensureResistorUtilsLoaded();
		try {
			await ensureJlcBasicCatalogLoaded();
		} catch (catalogErr) {
			const cmsg = catalogErr instanceof Error ? catalogErr.message : String(catalogErr);
			warnings.push(
				`JLC Basic catalog unavailable (${cmsg}); JLC package/tolerance chips may show LUT-only metadata.`
			);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		warnings.push(`Could not load resistor utilities (${msg}); using basic parser (no snap/EIA/JLC metadata).`);
		const { resistors, warnings: w } = parseResistorList(rawInput);
		warnings.push(...w);
		return { resistors: resistors.map((r) => ({ ...r })), warnings };
	}

	const Ru = getResistorUtils();
	if (!Ru) {
		warnings.push('Resistor utilities missing after load; using basic parser.');
		const { resistors, warnings: w } = parseResistorList(rawInput);
		warnings.push(...w);
		return { resistors: resistors.map((r) => ({ ...r })), warnings };
	}

	const resistors: RichParsedResistor[] = [];
	const tokens = uniqueTokens(rawInput);

	for (let i = 0; i < tokens.length; i += 1) {
		const token = tokens[i];
		try {
			const parsed = Ru.parseResistorInput(token, {
				snapToSeries: options.snapToSeries,
				snapSeries: options.snapSeries || 'E24'
			});
			for (const w of parsed.warnings || []) {
				warnings.push(`Resistor ${i + 1} (${token}): ${w}`);
			}
			resistors.push({
				input: token,
				value: parsed.value,
				formatted: Ru.formatResistorValue(parsed.value),
				tolerance: parsed.tolerance ?? null,
				powerRating: parsed.powerRating ?? null,
				powerCode: parsed.powerCode ?? null,
				series: parsed.series ?? null,
				source: parsed.source,
				isJlcBasic: Ru.isJlcBasicResistance(parsed.value),
				jlcBasicMeta: Ru.getJlcBasicMeta(parsed.value)
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			warnings.push(`Resistor ${i + 1} (${token}) ignored: ${msg}`);
		}
	}

	return { resistors, warnings };
}
