import { describe, expect, it } from 'vitest';

import { buildResultPdfBytes } from './pdf-export';

// 1x1 PNG fixture — the builder only needs valid PNG bytes to embed.
const PNG_1PX = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
	(c) => c.charCodeAt(0)
);

const CONTENT = {
	title: 'Voltage Divider Result',
	subtitle: 'Target 3.3 V from 5 V supply',
	figures: [
		{ label: 'R_TOP', value: '1K = 1K' },
		{ label: 'R_BOT', value: '2K = 2K' },
		{ label: 'Nominal output', value: '3.333 V' }
	],
	warnings: ['Power warning: R_BOT exceeds rated power'],
	footer: { toolName: 'Resistor Divider — Voltage Divider', site: 'resistordivider.com', dateIso: '2026-07-07' }
};

describe('buildResultPdfBytes', () => {
	it('produces a parseable single-page A4 PDF embedding the schematic PNG', async () => {
		const bytes = await buildResultPdfBytes(CONTENT, { bytes: PNG_1PX, width: 600, height: 400 });
		expect(bytes.length).toBeGreaterThan(1000);
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

		// Round-trip through pdf-lib to prove the document is structurally valid.
		const { PDFDocument } = await import('pdf-lib');
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBe(1);
		const page = doc.getPage(0);
		expect(page.getWidth()).toBeCloseTo(595.28, 1);
		expect(page.getHeight()).toBeCloseTo(841.89, 1);
	});

	it('renders text content into the PDF stream (title + footer present)', async () => {
		const bytes = await buildResultPdfBytes(CONTENT, { bytes: PNG_1PX, width: 600, height: 400 });
		// pdf-lib flate-compresses content streams — inflate them before searching.
		const { inflateSync } = await import('node:zlib');
		const buf = Buffer.from(bytes);
		let text = '';
		let cursor = 0;
		while (true) {
			const start = buf.indexOf('stream', cursor);
			if (start === -1) break;
			const dataStart = buf.indexOf('\n', start) + 1;
			const end = buf.indexOf('endstream', dataStart);
			if (end === -1) break;
			try {
				text += inflateSync(buf.subarray(dataStart, end)).toString('latin1');
			} catch {
				// not a flate stream (e.g. the embedded PNG) — skip
			}
			cursor = end + 9;
		}
		// Show-text operands are hex-encoded (<...> Tj) — decode them.
		text = text.replace(/<([0-9A-Fa-f]+)>/g, (_, h) => Buffer.from(h, 'hex').toString('latin1'));
		expect(text).toContain('Voltage Divider Result');
		expect(text).toContain('resistordivider.com');
		expect(text).toContain('Generated 2026-07-07');
	});

	it('survives symbols outside WinAnsi (≥ in package line, Ω, →) — regression', async () => {
		const bytes = await buildResultPdfBytes(
			{
				...CONTENT,
				figures: [
					{ label: 'Min package recommendation', value: '≥ 0603 (both legs)' },
					{ label: 'Total resistance', value: '6.1kΩ' },
					{ label: 'Real-world Vout range', value: '2.71 V → 2.81 V' }
				]
			},
			{ bytes: PNG_1PX, width: 600, height: 400 }
		);
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
	});

	it('never overflows the page with many figure rows (image stays above the footer)', async () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ label: `Row ${i}`, value: 'v' }));
		const bytes = await buildResultPdfBytes(
			{ ...CONTENT, figures: many, warnings: [] },
			{ bytes: PNG_1PX, width: 4000, height: 4000 }
		);
		const { PDFDocument } = await import('pdf-lib');
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBe(1);
	});
});
