// Single source of truth for diagram symbol geometry and typography.
// Every renderer (network schematic, U-pad, future shapes) draws resistor
// bodies, leads, dots, terminals, ground and text from these definitions —
// change them here and every diagram follows. This is also the surface the
// typography pass plugs into.

// --- stroke & layout geometry -------------------------------------------

export const STROKE_WIDTH = 2;

/** One resistor cell on a rail: leads + zigzag body. */
export const RES_CELL = 64;
/** Horizontal room per parallel branch (zigzag + value label). */
export const COL_W = 64;
/** Vertical room for parallel bus bars. */
export const BUS_PAD = 10;

/** Zigzag body length (does not stretch with the lead span). */
export const RES_BODY_LEN = 46;
export const RES_TEETH = 5;
export const RES_AMPLITUDE = 6;

/** Half-width of the invisible pointer hit area around a resistor. */
export const HIT_HALF_WIDTH = 14;

/** Junction dot radius (3-way joins only). */
export const DOT_RADIUS = 3;
/** Open terminal circle radius (Vin+/out± pads). */
export const TERMINAL_RADIUS = 4;
/** Supply symbol circle radius. */
export const SUPPLY_RADIUS = 3.5;

/**
 * Corner paths overlap this far into a branch's own lead: a zero-length drop
 * segment renders no mitre join (two butt caps instead of a corner).
 */
export const LEAD_OVERLAP = 6;

// --- typography ----------------------------------------------------------

export const DIAGRAM_FONT_FAMILY =
	"var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";
export const LABEL_FONT_SIZE = 11;
export const VALUE_FONT_WEIGHT = 600;

/**
 * Inline styles (not classes) so labels survive SVG serialization for PNG
 * export; the var() falls back to the system mono stack outside the app.
 */
export const LABEL_STYLE = `font-family:${DIAGRAM_FONT_FAMILY};font-size:${LABEL_FONT_SIZE}px;`;
export const VALUE_STYLE = `${LABEL_STYLE}font-weight:${VALUE_FONT_WEIGHT};`;

/** Ink colour for exported PNGs (bg is white regardless of app theme). */
export const EXPORT_INK = '#111827';

// --- symbol path builders ------------------------------------------------

/**
 * Vertical resistor between (cx, yTop) and (cx, yBottom): a fixed-length
 * zigzag body centred in the span, plain leads filling the rest.
 */
export function resistorPathV(
	cx: number,
	yTop: number,
	yBottom: number,
	bodyLen = RES_BODY_LEN,
	teeth = RES_TEETH,
	amp = RES_AMPLITUDE
): string {
	const mid = (yTop + yBottom) / 2;
	const top = mid - bodyLen / 2;
	const bottom = mid + bodyLen / 2;
	const dy = bodyLen / teeth;
	let d = `M ${cx} ${yTop} L ${cx} ${top}`;
	for (let i = 0; i < teeth; i += 1) {
		d += ` L ${cx + (i % 2 === 0 ? amp : -amp)} ${top + dy * (i + 0.5)}`;
	}
	return `${d} L ${cx} ${bottom} L ${cx} ${yBottom}`;
}

/**
 * Horizontal resistor between (xLeft, cy) and (xRight, cy): fixed-length
 * zigzag body centred in the span, plain leads filling the rest.
 */
export function resistorPathH(
	cy: number,
	xLeft: number,
	xRight: number,
	bodyLen = RES_BODY_LEN,
	teeth = RES_TEETH,
	amp = RES_AMPLITUDE
): string {
	const mid = (xLeft + xRight) / 2;
	const left = mid - bodyLen / 2;
	const right = mid + bodyLen / 2;
	const dx = bodyLen / teeth;
	let d = `M ${xLeft} ${cy} L ${left} ${cy}`;
	for (let i = 0; i < teeth; i += 1) {
		d += ` L ${left + dx * (i + 0.5)} ${cy + (i % 2 === 0 ? -amp : amp)}`;
	}
	return `${d} L ${right} ${cy} L ${xRight} ${cy}`;
}

/** Ground glyph: three shortening horizontal bars below (x, y). */
export function groundPath(x: number, y: number): string {
	return [
		`M ${x - 14} ${y} L ${x + 14} ${y}`,
		`M ${x - 9} ${y + 6} L ${x + 9} ${y + 6}`,
		`M ${x - 4} ${y + 12} L ${x + 4} ${y + 12}`
	].join(' ');
}
