/**
 * Browser-only PNG export from SVG (aligned with root diagram-export.js).
 * Use this from Svelte routes instead of duplicating export logic inline.
 */

export type DiagramExportOptions = {
	scale?: number;
	annotations?: string[];
	extraLines?: string[];
	/**
	 * Resolves currentColor in the serialized SVG: engine diagrams draw
	 * everything with currentColor, which a standalone SVG can't inherit from
	 * the app theme. The PNG canvas is always white, so pass a dark ink
	 * (e.g. engine EXPORT_INK) to get a readable export in both themes.
	 */
	inkColor?: string;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function cloneWithScaledDimensions(svgElement: SVGSVGElement, scale = 2) {
	const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
	const originalWidth =
		svgElement.viewBox?.baseVal?.width || parseFloat(svgElement.getAttribute('width') || '') || 300;
	const originalHeight =
		svgElement.viewBox?.baseVal?.height || parseFloat(svgElement.getAttribute('height') || '') || 220;
	const scaledWidth = originalWidth * scale;
	const scaledHeight = originalHeight * scale;
	svgClone.setAttribute('width', String(scaledWidth));
	svgClone.setAttribute('height', String(scaledHeight));
	return { svgClone, originalWidth, originalHeight, scaledWidth, scaledHeight };
}

function appendSvgTextLines(
	svgClone: SVGSVGElement,
	startY: number,
	lines: string[],
	lineHeight = 16,
	paddingX = 16,
	fontSize = 12
) {
	lines.forEach((line, index) => {
		const text = document.createElementNS(SVG_NS, 'text');
		text.setAttribute('x', String(paddingX));
		text.setAttribute('y', String(startY + lineHeight * (index + 1)));
		text.setAttribute('font-size', String(fontSize));
		text.textContent = line;
		svgClone.appendChild(text);
	});
}

function drawCanvasAnnotationLines(ctx: CanvasRenderingContext2D, lines: string[], startY: number, scale = 2) {
	if (!lines.length) return;
	ctx.fillStyle = '#000000';
	ctx.font = `${12 * scale}px Arial`;
	let y = startY;
	for (const line of lines) {
		ctx.fillText(line, 12 * scale, y);
		y += 18 * scale;
	}
}

function downloadBlob(blob: Blob, filename: string) {
	const downloadUrl = URL.createObjectURL(blob);
	const downloadLink = document.createElement('a');
	downloadLink.href = downloadUrl;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	URL.revokeObjectURL(downloadUrl);
}

export function exportSvgToPng(svgElement: SVGSVGElement | null | undefined, filename: string, options: DiagramExportOptions = {}) {
	if (!svgElement || typeof document === 'undefined') return;

	const scale = Number.isFinite(options.scale) && options.scale! > 0 ? options.scale! : 2;
	const annotations = Array.isArray(options.annotations) ? options.annotations : [];
	const extraLines = Array.isArray(options.extraLines) ? options.extraLines : [];

	const { svgClone, originalWidth, originalHeight, scaledWidth, scaledHeight } = cloneWithScaledDimensions(svgElement, scale);
	if (options.inkColor) svgClone.style.color = options.inkColor;

	let drawHeight = scaledHeight;
	let canvasHeight = scaledHeight;

	if (extraLines.length) {
		const lineHeight = 16;
		const padding = 16;
		const extraBottomPadding = 8;
		const extraHeight = padding + lineHeight * extraLines.length + extraBottomPadding;
		const updatedHeight = originalHeight + extraHeight;
		svgClone.setAttribute('viewBox', `0 0 ${originalWidth} ${updatedHeight}`);
		svgClone.setAttribute('height', String(updatedHeight * scale));
		appendSvgTextLines(svgClone, originalHeight + padding, extraLines, lineHeight, padding, 12);
		drawHeight = updatedHeight * scale;
		canvasHeight = drawHeight;
	}

	if (annotations.length) {
		const annotationHeight = (annotations.length * 22 + 12) * scale;
		canvasHeight = drawHeight + annotationHeight;
	}

	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	// annotation lines can be wider than the schematic — measure before sizing
	// the canvas so they don't get clipped (resizing resets ctx state)
	ctx.font = `${12 * scale}px Arial`;
	const maxAnnotationWidth = annotations.length
		? Math.max(...annotations.map((line) => ctx.measureText(line).width)) + 24 * scale
		: 0;
	const canvasWidth = Math.max(scaledWidth, Math.ceil(maxAnnotationWidth));
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;

	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, canvasWidth, canvasHeight);

	const svgData = new XMLSerializer().serializeToString(svgClone);
	const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
	const svgUrl = URL.createObjectURL(svgBlob);

	const img = new Image();
	img.onload = function () {
		ctx.drawImage(img, 0, 0, scaledWidth, drawHeight);
		if (annotations.length) {
			drawCanvasAnnotationLines(ctx, annotations, drawHeight + 18 * scale, scale);
		}
		canvas.toBlob(function (blob) {
			if (blob) {
				downloadBlob(blob, filename);
			}
			URL.revokeObjectURL(svgUrl);
		}, 'image/png');
	};
	img.onerror = function () {
		URL.revokeObjectURL(svgUrl);
		console.error('Failed to load SVG for conversion');
	};
	img.src = svgUrl;
}
