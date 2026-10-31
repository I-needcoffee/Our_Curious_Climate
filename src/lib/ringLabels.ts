/**
 * Shared placement rule for labels around a circular chart's outer ring (sun path compass,
 * wind rose compass). Both dials use it so their rims read as one design.
 *
 * The rule: a label's *nearest edge* sits a fixed gap off the ring, whatever its angle. Side
 * labels hang off the ring by their left/right edge, top/bottom labels by their bottom/top edge,
 * so "N" and "W" look equally close to the circle instead of W drifting out by half its width.
 */

/** Rendered-px gap between the ring and the nearest edge of a rim label. Same rule on both dials. */
export function ringLabelGapPx(dialPx: number): number {
  return Math.min(7, Math.max(4, dialPx * 0.018));
}

export interface RingLabelPlacement {
  /** SVG `text-anchor` so the horizontal edge nearest the ring sits on the anchor point. */
  anchor: 'start' | 'middle' | 'end';
  /** SVG `dy` so the vertical edge nearest the ring sits on the anchor point. */
  dy: string;
}

/**
 * Anchor + baseline shift for a label at `angleRad` (0 = up, clockwise), positioned at
 * `ring + ringLabelGapPx` along that angle.
 */
export function ringLabelPlacement(angleRad: number): RingLabelPlacement {
  const sx = Math.sin(angleRad);
  const cy = Math.cos(angleRad);
  const anchor = sx > 0.35 ? 'start' : sx < -0.35 ? 'end' : 'middle';
  /**
   * Hang the near *ink* edge on the point (Inter's em-box is taller than the glyph).
   * Top: pull the baseline up so N/30° sit fully outside the ring.
   * Bottom: push it down so S sits fully below.
   * Sides: centre the x-height so E/W hang off the ring by their inner edge.
   */
  const dy = cy > 0.35 ? '-0.32em' : cy < -0.35 ? '1.05em' : '0.36em';
  return { anchor, dy };
}

/**
 * Space the rim labels need beyond the ring, used to size the dial so labels never clip.
 * Horizontal: gap + the widest side label; vertical: gap + the tallest label.
 */
export function ringLabelReserve(gapPx: number, widestSideLabelPx: number, tallestLabelPx: number) {
  return { x: gapPx + widestSideLabelPx + 1, y: gapPx + tallestLabelPx + 1 };
}
