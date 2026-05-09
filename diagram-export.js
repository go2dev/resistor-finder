(() => {
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function cloneWithScaledDimensions(svgElement, scale = 2) {
        const svgClone = svgElement.cloneNode(true);
        const originalWidth = svgElement.viewBox?.baseVal?.width || parseFloat(svgElement.getAttribute('width')) || 300;
        const originalHeight = svgElement.viewBox?.baseVal?.height || parseFloat(svgElement.getAttribute('height')) || 220;
        const scaledWidth = originalWidth * scale;
        const scaledHeight = originalHeight * scale;
        svgClone.setAttribute('width', scaledWidth);
        svgClone.setAttribute('height', scaledHeight);
        return { svgClone, originalWidth, originalHeight, scaledWidth, scaledHeight };
    }

    function appendSvgTextLines(svgClone, startY, lines, lineHeight = 16, paddingX = 16, fontSize = 12) {
        lines.forEach((line, index) => {
            const text = document.createElementNS(SVG_NS, 'text');
            text.setAttribute('x', paddingX);
            text.setAttribute('y', startY + lineHeight * (index + 1));
            text.setAttribute('font-size', String(fontSize));
            text.textContent = line;
            svgClone.appendChild(text);
        });
    }

    function drawCanvasAnnotationLines(ctx, lines, startY, scale = 2) {
        if (!lines.length) return;
        ctx.fillStyle = '#000000';
        ctx.font = `${12 * scale}px Arial`;
        let y = startY;
        lines.forEach(line => {
            ctx.fillText(line, 12 * scale, y);
            y += 18 * scale;
        });
    }

    function downloadBlob(blob, filename) {
        const downloadUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadUrl);
    }

    function exportSvgToPng(svgElement, filename, options = {}) {
        if (!svgElement) return;
        const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 2;
        const annotations = Array.isArray(options.annotations) ? options.annotations : [];
        const extraLines = Array.isArray(options.extraLines) ? options.extraLines : [];

        const { svgClone, originalWidth, originalHeight, scaledWidth, scaledHeight } = cloneWithScaledDimensions(svgElement, scale);

        let drawHeight = scaledHeight;
        let canvasHeight = scaledHeight;

        if (extraLines.length) {
            const lineHeight = 16;
            const padding = 16;
            const extraBottomPadding = 8;
            const extraHeight = padding + lineHeight * extraLines.length + extraBottomPadding;
            const updatedHeight = originalHeight + extraHeight;
            svgClone.setAttribute('viewBox', `0 0 ${originalWidth} ${updatedHeight}`);
            svgClone.setAttribute('height', updatedHeight * scale);
            appendSvgTextLines(svgClone, originalHeight + padding, extraLines, lineHeight, padding, 12);
            drawHeight = updatedHeight * scale;
            canvasHeight = drawHeight;
        }

        if (annotations.length) {
            const annotationHeight = (annotations.length * 22 + 12) * scale;
            canvasHeight = drawHeight + annotationHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = scaledWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, scaledWidth, canvasHeight);

        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = function() {
            ctx.drawImage(img, 0, 0, scaledWidth, drawHeight);
            if (annotations.length) {
                drawCanvasAnnotationLines(ctx, annotations, drawHeight + (18 * scale), scale);
            }
            canvas.toBlob(function(blob) {
                if (blob) {
                    downloadBlob(blob, filename);
                }
                URL.revokeObjectURL(svgUrl);
            }, 'image/png');
        };
        img.onerror = function() {
            URL.revokeObjectURL(svgUrl);
            console.error('Failed to load SVG for conversion');
        };
        img.src = svgUrl;
    }

    window.DiagramExport = {
        exportSvgToPng
    };
})();
