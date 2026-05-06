export type ParsedResistor = {
	input: string;
	value: number;
	formatted: string;
};

const UNIT_MULTIPLIERS: Record<string, number> = {
	r: 1,
	R: 1,
	k: 1_000,
	K: 1_000,
	m: 0.001,
	M: 1_000_000,
	g: 1_000_000_000,
	G: 1_000_000_000
};

function normalizeToken(token: string): string {
	return token.trim();
}

export function parseResistorValue(token: string): number {
	const value = normalizeToken(token);
	if (!value) {
		throw new Error('Empty resistor value');
	}

	const numeric = Number(value);
	if (Number.isFinite(numeric)) {
		if (numeric <= 0) throw new Error('Resistor value must be positive');
		return numeric;
	}

	const decimalNotation = value.match(/^(\d+\.?\d*)([rRkKmMgG])$/);
	if (decimalNotation) {
		const parsed = Number(decimalNotation[1]);
		const unit = decimalNotation[2];
		const multiplier = UNIT_MULTIPLIERS[unit];
		const resolved = parsed * multiplier;
		if (!Number.isFinite(resolved) || resolved <= 0) throw new Error(`Invalid value: ${value}`);
		return resolved;
	}

	const letterNotation = value.match(/^(\d+)([rRkKmMgG])(\d+)$/);
	if (letterNotation) {
		const whole = Number(letterNotation[1]);
		const unit = letterNotation[2];
		const fraction = Number(`0.${letterNotation[3]}`);
		const multiplier = UNIT_MULTIPLIERS[unit];
		const resolved = (whole + fraction) * multiplier;
		if (!Number.isFinite(resolved) || resolved <= 0) throw new Error(`Invalid value: ${value}`);
		return resolved;
	}

	const leadingNotation = value.match(/^([rRkKmMgG])(\d+)$/);
	if (leadingNotation) {
		const unit = leadingNotation[1];
		const fractionDigits = leadingNotation[2];
		const parsed = Number(`0.${fractionDigits}`);
		const multiplier = UNIT_MULTIPLIERS[unit];
		const resolved = parsed * multiplier;
		if (!Number.isFinite(resolved) || resolved <= 0) throw new Error(`Invalid value: ${value}`);
		return resolved;
	}

	throw new Error(`Unsupported resistor format: "${value}"`);
}

export function formatResistorValue(value: number): string {
	if (!Number.isFinite(value)) return '—';
	if (value >= 1_000_000_000) return `${trimTrailingZeros((value / 1_000_000_000).toFixed(2))}G`;
	if (value >= 1_000_000) return `${trimTrailingZeros((value / 1_000_000).toFixed(2))}M`;
	if (value >= 1_000) return `${trimTrailingZeros((value / 1_000).toFixed(2))}K`;
	if (value >= 1) return `${trimTrailingZeros(value.toFixed(2))}R`;
	return `${trimTrailingZeros((value * 1000).toFixed(2))}m`;
}

function trimTrailingZeros(raw: string): string {
	return raw.replace(/\.?0+$/, '');
}

export function parseResistorList(rawInput: string): { resistors: ParsedResistor[]; warnings: string[] } {
	const warnings: string[] = [];
	const seen = new Set<string>();
	const parsed: ParsedResistor[] = [];

	rawInput
		.split(',')
		.map((token) => token.trim())
		.filter(Boolean)
		.forEach((token) => {
			const normalized = token.toLowerCase();
			if (seen.has(normalized)) return;
			seen.add(normalized);
			try {
				const value = parseResistorValue(token);
				parsed.push({
					input: token,
					value,
					formatted: formatResistorValue(value)
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				warnings.push(`${token}: ${message}`);
			}
		});

	return { resistors: parsed, warnings };
}
