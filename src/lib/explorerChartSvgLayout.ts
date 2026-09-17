/**
 * Shared bar + 1224 heatmap SVG layout for Data / Wind / UTCI explorers so
 * adjacent cards keep the same viewBox, scale, and vertical alignment.
 */

export const EXPLORER_SVG_BASE_WIDTH = 350;
export const EXPLORER_SVG_LAYOUT_BASELINE_HEIGHT = 420;

export const EXPLORER_SVG_MARGIN = { top: 6, right: 4, bottom: 8, left: 34 } as const;

/** Vertical band for month abbreviations between the bar chart and the 12×24 grid (must fit label + no bleed into bars). */
export const EXPLORER_MONTH_AXIS_BAND_PX = 18;

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

/** Legend row directly under the card header — compact padding, room for a readable bar. */
export const EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS = 'w-full shrink-0 px-2 pt-1.5 pb-0.5';

/** Uniform gutter between adjacent heatmap cells (matches vertical and horizontal spacing). */
export const EXPLORER_HEATMAP_CELL_GAP_PX = 1;

/** @deprecated Use EXPLORER_MONTH_AXIS_BAND_PX */
export const EXPLORER_BAR_HEATMAP_GAP_PX = EXPLORER_MONTH_AXIS_BAND_PX;

/** Same as `d3.scaleLinear().domain([1, 366]).range([0, innerWidth])` — single source for pixel snapping. */
export function explorerHeatmapXOfDay(innerWidth: number, dayOfYearOrFraction: number): number {
  return ((dayOfYearOrFraction - 1) / 365) * innerWidth;
}

/** Integer left + width so adjacent cells share exact gutters (see explorerHeatmapXOfDay). */
export function explorerHeatmapCellXPx(
  innerWidth: number,
  cellGapPx: number,
  x0: number,
  x1: number
): { x: number; width: number } {
  const left = Math.round(explorerHeatmapXOfDay(innerWidth, x0));
  const right = Math.round(explorerHeatmapXOfDay(innerWidth, x1));
  return { x: left, width: Math.max(1, right - left - cellGapPx) };
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

/** 24 rows + 23 gutters as integer px (remainder spread across rows) so horizontal gaps stay visually even. */
export function explorerHeatmapRowLayout(heatmapBodyHeightPx: number) {
  const gap = EXPLORER_HEATMAP_CELL_GAP_PX;
  const body = Math.max(24 + 23 * gap, Math.round(heatmapBodyHeightPx));
  const innerTotal = body - 23 * gap;
  const baseRow = Math.floor(innerTotal / 24);
  const rem = innerTotal - 24 * baseRow;
  /** Put remainder height on the last rows so hour 23 stays aligned with hour 22 (not a short bottom row). */
  const rowHeights = Array.from({ length: 24 }, (_, i) => baseRow + (i >= 24 - rem ? 1 : 0));

  const tops: number[] = new Array(25);
  tops[0] = 0;
  for (let h = 0; h < 24; h++) {
    tops[h + 1] = tops[h]! + rowHeights[h]! + (h < 23 ? gap : 0);
  }

  const hourRowTop = (h: number) => {
    if (h <= 0) return 0;
    if (h >= 24) return body;
    return tops[h]!;
  };
  const rowInnerHeight = (h: number) => rowHeights[Math.min(23, Math.max(0, h))]!;
  const hourRowCenter = (h: number) => hourRowTop(h) + rowInnerHeight(h) / 2;
  const cellInnerHeightPx = innerTotal / 24;

  return {
    cellGapPx: gap,
    heatmapBodyPx: body,
    cellInnerHeightPx,
    rowInnerHeight,
    hourRowTop,
    hourRowCenter,
  };
}

export function explorerInnerWidth(): number {
  const m = EXPLORER_SVG_MARGIN;
  return EXPLORER_SVG_BASE_WIDTH - m.left - m.right;
}

export function explorerBarChartHeightPx(): number {
  return Math.max(75, EXPLORER_SVG_LAYOUT_BASELINE_HEIGHT * 0.25);
}

export function explorerHeatmapHeightPx(): number {
  const m = EXPLORER_SVG_MARGIN;
  const inner = explorerInnerWidth();
  const barH = explorerBarChartHeightPx();
  const budget =
    EXPLORER_SVG_LAYOUT_BASELINE_HEIGHT -
    m.top -
    m.bottom -
    barH -
    EXPLORER_MONTH_AXIS_BAND_PX;
  return Math.round(Math.min(budget, inner * (3 / 4)));
}

export function explorerSvgHeightPx(): number {
  const m = EXPLORER_SVG_MARGIN;
  return Math.round(
    m.top +
      m.bottom +
      explorerBarChartHeightPx() +
      EXPLORER_MONTH_AXIS_BAND_PX +
      explorerHeatmapHeightPx()
  );
}
