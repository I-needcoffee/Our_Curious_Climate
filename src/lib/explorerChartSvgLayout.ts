/**
 * Shared bar + 1224 heatmap SVG layout for Data / Wind / UTCI explorers so
 * adjacent cards keep the same viewBox, scale, and vertical alignment.
 */

import type { Selection } from 'd3';

export const EXPLORER_SVG_BASE_WIDTH = 350;
/** ViewBox height before the card has been measured (bars + month band + 12×24 heatmap). */
export const EXPLORER_SVG_DEFAULT_HEIGHT = 380;
/** Shortest chart: heatmap rows compress this far before the chart letterboxes instead. */
const EXPLORER_SVG_MIN_HEIGHT = 250;
/** Tallest chart: beyond this, extra card height becomes whitespace rather than taller rows. */
const EXPLORER_SVG_MAX_HEIGHT = 460;
/**
 * Share of the card's aspect used for the chart. The rest stays quiet space so monthly/hourly
 * rows are a little shorter than the slot instead of stretching to its edges.
 */
const EXPLORER_SVG_CARD_FILL = 0.94;

/** Bottom margin is a short gap under the 12×24 grid, just past the top margin. */
export const EXPLORER_SVG_MARGIN = { top: 8, right: 4, bottom: 10, left: 40 } as const;

/** Vertical band for month abbreviations between the bar chart and the 12×24 grid (must fit label + no bleed into bars). */
export const EXPLORER_MONTH_AXIS_BAND_PX = 20;

/** Start day-of-year for each month (same as d3 month ticks); Dec ends at 366. */
export const EXPLORER_MONTH_START_DAYS = [
  1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335,
] as const;

/** Short labels — order matches EXPLORER_MONTH_START_DAYS. */
export const EXPLORER_MONTH_LABELS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Midpoint day-of-year for centering each month label between grid lines. */
export function explorerMonthLabelCenterDays(): readonly number[] {
  const starts = EXPLORER_MONTH_START_DAYS;
  const centers: number[] = [];
  for (let i = 0; i < 12; i++) {
    const end = i < 11 ? starts[i + 1]! : 366;
    centers.push((starts[i]! + end) / 2);
  }
  return centers;
}

/** Legend row directly under the card header — aligned with the header's horizontal padding. */
export const EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS = 'w-full shrink-0 px-2 pb-0.5 @lg:px-2.5';

/** Uniform gutter between adjacent heatmap cells (matches vertical and horizontal spacing). */
export const EXPLORER_HEATMAP_CELL_GAP_PX = 1;

/** @deprecated Use EXPLORER_MONTH_AXIS_BAND_PX */
export const EXPLORER_BAR_HEATMAP_GAP_PX = EXPLORER_MONTH_AXIS_BAND_PX;

/** Same as `d3.scaleLinear().domain([1, 366]).range([0, innerWidth])` — single source for pixel snapping. */
export function explorerHeatmapXOfDay(innerWidth: number, dayOfYearOrFraction: number): number {
  return ((dayOfYearOrFraction - 1) / 365) * innerWidth;
}

/**
 * Pixel left + width so adjacent cells share a gutter of up to `cellGapPx`.
 * For single-day / hour cells the natural span is often &lt; 1px; never let the
 * gutter erase those cells (month/week stay gapped as usual).
 */
export function explorerHeatmapCellXPx(
  innerWidth: number,
  cellGapPx: number,
  x0: number,
  x1: number
): { x: number; width: number } {
  const left = explorerHeatmapXOfDay(innerWidth, x0);
  const right = explorerHeatmapXOfDay(innerWidth, x1);
  const span = right - left;
  if (!(span > 0)) return { x: left, width: 0 };
  const gap = Math.min(cellGapPx, Math.max(0, span - 0.5));
  return { x: left, width: Math.max(0, span - gap) };
}

/** Selection / brush rectangle spans full day range (no cell gap subtracted on outer edges). */
export function explorerHeatmapSpanXPx(innerWidth: number, x0: number, x1: number): { x: number; width: number } {
  const left = Math.round(explorerHeatmapXOfDay(innerWidth, x0));
  const right = Math.round(explorerHeatmapXOfDay(innerWidth, x1));
  return { x: left, width: Math.max(1, right - left) };
}

/** Horizontal guides in the bar-chart panel (behind bars). */

export function explorerBarGridStroke(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? 'rgba(148, 163, 184, 0.34)' : 'rgba(71, 85, 105, 0.22)';
}

/** 24 equal rows and 23 equal gutters. No remainder is added to a row, so every gap matches. */
export function explorerHeatmapRowLayout(heatmapBodyHeightPx: number) {
  const gap = EXPLORER_HEATMAP_CELL_GAP_PX;
  const body = Math.max(24 + 23 * gap, heatmapBodyHeightPx);
  const rowH = (body - 23 * gap) / 24;

  const hourRowTop = (h: number) => {
    if (h <= 0) return 0;
    if (h >= 24) return body;
    return h * (rowH + gap);
  };
  const rowInnerHeight = (h: number) => (h >= 0 && h < 24 ? rowH : 0);
  const hourRowCenter = (h: number) => hourRowTop(h) + rowH / 2;

  return {
    cellGapPx: gap,
    heatmapBodyPx: body,
    cellInnerHeightPx: rowH,
    rowInnerHeight,
    hourRowTop,
    hourRowCenter,
  };
}

export function explorerInnerWidth(): number {
  const m = EXPLORER_SVG_MARGIN;
  return EXPLORER_SVG_BASE_WIDTH - m.left - m.right;
}

/** Margins + month band: the part of the chart height that does not flex with the card. */
const EXPLORER_SVG_FIXED_HEIGHT =
  EXPLORER_SVG_MARGIN.top + EXPLORER_SVG_MARGIN.bottom + EXPLORER_MONTH_AXIS_BAND_PX;

/**
 * Explorer viewBoxes keep a fixed width and pick their height from the card's aspect ratio, so
 * the chart always spans the card width. The fit is then eased down slightly so heatmap rows
 * stay a little shorter than a tall grid cell.
 */
export function explorerSvgHeightForBox(boxWidth: number, boxHeight: number): number {
  if (!(boxWidth > 0 && boxHeight > 0)) return EXPLORER_SVG_DEFAULT_HEIGHT;
  const fit = Math.floor((EXPLORER_SVG_BASE_WIDTH * boxHeight) / boxWidth / 10) * 10;
  const capped = Math.min(EXPLORER_SVG_MAX_HEIGHT, Math.max(EXPLORER_SVG_MIN_HEIGHT, fit));
  if (capped <= EXPLORER_SVG_MIN_HEIGHT) return EXPLORER_SVG_MIN_HEIGHT;
  const eased = Math.floor((capped * EXPLORER_SVG_CARD_FILL) / 10) * 10;
  return Math.max(EXPLORER_SVG_MIN_HEIGHT, eased);
}

export function explorerBarChartHeightPx(svgHeight = EXPLORER_SVG_DEFAULT_HEIGHT): number {
  return Math.min(110, Math.max(64, (svgHeight - EXPLORER_SVG_FIXED_HEIGHT) * 0.29));
}

export function explorerHeatmapHeightPx(svgHeight = EXPLORER_SVG_DEFAULT_HEIGHT): number {
  return Math.round(svgHeight - EXPLORER_SVG_FIXED_HEIGHT - explorerBarChartHeightPx(svgHeight));
}

const HOUR_LABEL_STRIDES = [1, 2, 3, 6] as const;

/**
 * Rendered px below which in-cell values are not drawn. Values stay on as long as they fit inside
 * the cell (see `CELL_LABEL_MAX_CELL_SHARE`); this floor only drops them once they would be
 * illegible specks that hide the cell color without saying anything.
 */
const CELL_LABEL_MIN_RENDER_PX = 6;
/** Width-fitted labels may shrink slightly further before they are dropped. */
const CELL_LABEL_FIT_MIN_RENDER_PX = 5.5;
/** Cap on label height as a share of the cell: taller than this and the number swallows the color. */
const CELL_LABEL_MAX_CELL_SHARE = 0.85;

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Converts a target rendered text size (CSS px) into viewBox units for an SVG drawn at
 * `renderScale` px per unit. Large renders grow text logarithmically; small renders shrink it
 * gently (to at most 80%) so labels track the chart instead of crowding it.
 */
export function svgTextUnits(targetPx: number, renderScale: number): number {
  const s = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
  const growth = s >= 1 ? 1 + 0.3 * Math.log2(s) : Math.max(0.8, Math.pow(s, 0.4));
  return (targetPx * growth) / s;
}

/**
 * SVG text sizes (viewBox units) for the explorer charts.
 *
 * Targets are expressed in rendered CSS px and divided by `renderScale` (rendered px per viewBox
 * unit, see `useSvgRenderScale`), so labels stay readable in small grid cards. Large cards grow
 * text logarithmically rather than linearly so focus layouts do not get poster-sized axes.
 */
export function explorerSvgTypography(renderScale: number, cellInnerHeightPx: number) {
  const s = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
  const units = (px: number) => svgTextUnits(px, s);
  const rowPitch = cellInnerHeightPx + EXPLORER_HEATMAP_CELL_GAP_PX;
  const monthSlot = explorerInnerWidth() / 12;

  const axisPx = clampNum(units(10.5), 5, 13);
  const monthPx = Math.min(axisPx, monthSlot / 2.1, EXPLORER_MONTH_AXIS_BAND_PX * 0.72);
  const hourPx = clampNum(units(9.5), 4.5, 11);
  const hourStride = HOUR_LABEL_STRIDES.find(n => n * rowPitch >= hourPx * 2.2) ?? 6;
  const cellValuePx = Math.min(clampNum(units(10), 4, 11.5), cellInnerHeightPx * CELL_LABEL_MAX_CELL_SHARE);

  return {
    /** Bar-chart y ticks. */
    axisPx,
    /** Month names between bars and heatmap. */
    monthPx,
    /** Hour-of-day labels left of the heatmap. */
    hourPx,
    /** Label every Nth hour so rows never collide. */
    hourStride,
    /** Values printed inside aggregated heatmap cells. */
    cellValuePx,
    /** Hide in-cell values when they would render below this legibility floor. */
    showCellValues: cellValuePx * s >= CELL_LABEL_MIN_RENDER_PX,
  };
}

/**
 * Shrinks heatmap cell labels uniformly so the widest one fits inside its cell, or clears them when
 * that would render below the legibility floor. All labels are measured before any is restyled so
 * the browser lays out once.
 */
export function fitHeatmapCellLabels<D>(
  labels: Selection<SVGTextElement, D, any, any>,
  cellWidth: (d: D) => number,
  basePx: number,
  renderScale: number
): void {
  let fit = 1;
  labels.each(function (d) {
    const len = this.getComputedTextLength();
    if (len > 0) fit = Math.min(fit, (cellWidth(d) * 0.88) / len);
  });
  if (fit >= 1) return;
  const px = basePx * fit;
  if (px * renderScale < CELL_LABEL_FIT_MIN_RENDER_PX) labels.text('');
  else labels.style('font-size', `${px}px`);
}

/**
 * Bar outline. The end that sits on the axis baseline is square; a bar that floats above or
 * below that baseline keeps both ends rounded.
 */
export function explorerBarPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  squareBottom: boolean
): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (radius <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  if (!squareBottom) {
    return [
      `M${x + radius},${y}`,
      `H${x + w - radius}`,
      `A${radius},${radius} 0 0 1 ${x + w},${y + radius}`,
      `V${y + h - radius}`,
      `A${radius},${radius} 0 0 1 ${x + w - radius},${y + h}`,
      `H${x + radius}`,
      `A${radius},${radius} 0 0 1 ${x},${y + h - radius}`,
      `V${y + radius}`,
      `A${radius},${radius} 0 0 1 ${x + radius},${y}`,
      'Z',
    ].join('');
  }
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `A${radius},${radius} 0 0 1 ${x + radius},${y}`,
    `H${x + w - radius}`,
    `A${radius},${radius} 0 0 1 ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join('');
}

/** True when the bar's lower edge is the bottom of the y scale (the axis baseline, often 0). */
export function explorerBarSitsOnBaseline(bottomPx: number, baselinePx: number): boolean {
  return Math.abs(bottomPx - baselinePx) <= 0.75;
}

export function explorerSvgHeightPx(svgHeight = EXPLORER_SVG_DEFAULT_HEIGHT): number {
  return Math.round(EXPLORER_SVG_FIXED_HEIGHT + explorerBarChartHeightPx(svgHeight) + explorerHeatmapHeightPx(svgHeight));
}
