/** `heatmapTextColor` value meaning "pick readable ink per theme". */
export const CHART_TEXT_AUTO = 'auto';

const INK_DARK = '#111827';

/** Axis and label ink for chart SVG text drawn on the card surface. */
export function chartAxisInk(textColor: string, theme: 'light' | 'dark'): string {
  if (textColor !== CHART_TEXT_AUTO) return textColor;
  return theme === 'dark' ? '#d1d5db' : '#374151';
}

/**
 * Ink for values printed inside heatmap cells: always the same near-black, in every chart, on
 * every fill. One ink keeps the grid reading as a single surface; semibold
 * (`HEATMAP_CELL_FONT_WEIGHT`) keeps the numbers readable on the cell color.
 * Explicit text colors pass straight through.
 */
export function heatmapCellInk(textColor: string): string {
  return textColor === CHART_TEXT_AUTO ? INK_DARK : textColor;
}

/** Inter Semibold: cell numbers stay readable without the light weight washing out. */
export const HEATMAP_CELL_FONT_WEIGHT = '600';
