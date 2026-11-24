/** `heatmapTextColor` value meaning "pick readable ink per theme". */
export const CHART_TEXT_AUTO = 'auto';

const INK_DARK = '#111827';

/** Axis and label ink for chart SVG text drawn on the card surface. */
export function chartAxisInk(textColor: string, theme: 'light' | 'dark'): string {
  if (textColor !== CHART_TEXT_AUTO) return textColor;
  return theme === 'dark' ? '#d1d5db' : '#374151';
}

/**
 * Ink for values printed inside heatmap cells: always one uniform near-black tone across every
 * cell in a chart so the grid reads as a calm, cohesive surface. Explicit custom text colors
 * pass straight through.
 */
export function heatmapCellInk(textColor: string, _bgColor?: string): string {
  return textColor === CHART_TEXT_AUTO ? INK_DARK : textColor;
}

/** Kept for call-site compatibility when blending cell overlays. */
export function blendCellWithOverlay(baseColor: string, _overlayColor: string): string {
  return baseColor;
}

/** Inter Semibold: cell numbers stay readable without the light weight washing out. */
export const HEATMAP_CELL_FONT_WEIGHT = '600';
