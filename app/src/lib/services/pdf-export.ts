/**
 * Per-result PDF export (owner decision 2026-07-06: single result per PDF,
 * footer = tool name + resistordivider.com + generated date).
 *
 * Decision record — print CSS vs dependency: print CSS cannot produce a
 * verifiable downloaded artifact (it goes through the browser's print dialog,
 * output varies per browser/OS and can't be asserted in CI), so a library it
 * is. pdf-lib chosen over jsPDF: MIT, zero runtime deps, modern typed API,
 * and it's dynamically imported below so the initial bundle is unchanged.
 * The schematic is the existing ink-on-white PNG-pipeline output
 * (docs/unified-diagram-roadmap.md export rules), embedded at 2x.
 */
import { downloadBlob, renderSvgToPngBlob, type DiagramExportOptions } from './diagram-export';

export type PdfFigureRow = { label: string; value: string };

export type ResultPdfContent = {
	title: string;
	subtitle?: string;
	figures: PdfFigureRow[];
	warnings?: string[];
	/** e.g. { toolName: 'Resistor Divider — Voltage Divider', site: 'resistordivider.com', dateIso: '2026-07-07' } */
	footer: { toolName: string; site: string; dateIso: string };
};

const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 48;

/** Standard Helvetica is WinAnsi-encoded — map the symbols our figures use, drop the rest. */
function toWinAnsi(text: string): string {
	return text
		.replace(/≥/g, '>=')
		.replace(/≤/g, '<=')
		.replace(/→/g, 'to')
		.replace(/[ΩΩ]/g, ' ohm')
		.replace(/µ|μ/g, 'u')
		.replace(/—|–/g, '-')
		.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

/** Pure document builder (no DOM) — unit-tested in node with a PNG fixture. */
export async function buildResultPdfBytes(
	content: ResultPdfContent,
	png: { bytes: Uint8Array | ArrayBuffer; width: number; height: number }
): Promise<Uint8Array> {
	const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
	const doc = await PDFDocument.create();
	const page = doc.addPage([PAGE_W, PAGE_H]);
	const helvetica = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);

	const ink = rgb(0.09, 0.09, 0.11);
	const muted = rgb(0.45, 0.45, 0.5);
	const amber = rgb(0.6, 0.35, 0.05);

	let y = PAGE_H - MARGIN;

	page.drawText(toWinAnsi(content.title), { x: MARGIN, y: y - 16, size: 16, font: bold, color: ink });
	y -= 24;
	if (content.subtitle) {
		page.drawText(toWinAnsi(content.subtitle), { x: MARGIN, y: y - 10, size: 10, font: helvetica, color: muted });
		y -= 18;
	}
	y -= 8;

	const labelX = MARGIN;
	const valueX = MARGIN + 190;
	for (const row of content.figures) {
		page.drawText(toWinAnsi(row.label), { x: labelX, y: y - 10, size: 10, font: bold, color: ink });
		page.drawText(toWinAnsi(row.value), { x: valueX, y: y - 10, size: 10, font: helvetica, color: ink });
		y -= 16;
	}

	for (const warning of content.warnings ?? []) {
		y -= 4;
		page.drawText(toWinAnsi(`! ${warning}`), { x: labelX, y: y - 10, size: 9, font: helvetica, color: amber });
		y -= 14;
	}
	y -= 16;

	const image = await doc.embedPng(png.bytes);
	const contentW = PAGE_W - MARGIN * 2;
	const footerReserve = MARGIN + 24;
	const maxH = Math.max(120, y - footerReserve);
	// PNG pipeline renders at 2x — draw at half so print size matches screen.
	const fit = Math.min(1, contentW / (png.width / 2), maxH / (png.height / 2));
	const drawW = (png.width / 2) * fit;
	const drawH = (png.height / 2) * fit;
	page.drawImage(image, {
		x: MARGIN + (contentW - drawW) / 2,
		y: y - drawH,
		width: drawW,
		height: drawH
	});

	const footerText = toWinAnsi(
		`${content.footer.toolName} · ${content.footer.site} · Generated ${content.footer.dateIso}`
	);
	page.drawLine({
		start: { x: MARGIN, y: MARGIN - 6 },
		end: { x: PAGE_W - MARGIN, y: MARGIN - 6 },
		thickness: 0.5,
		color: muted
	});
	page.drawText(footerText, { x: MARGIN, y: MARGIN - 20, size: 8, font: helvetica, color: muted });

	return doc.save();
}

/** Browser entry: schematic SVG → ink-on-white PNG → single-page PDF download. */
export async function exportResultPdf(
	svgElement: SVGSVGElement | null | undefined,
	filename: string,
	content: ResultPdfContent,
	pngOptions: DiagramExportOptions = {}
): Promise<void> {
	if (!svgElement || typeof document === 'undefined') return;
	const { blob, width, height } = await renderSvgToPngBlob(svgElement, {
		scale: 2,
		...pngOptions
	});
	const bytes = await buildResultPdfBytes(content, {
		bytes: await blob.arrayBuffer(),
		width,
		height
	});
	downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), filename);
}
