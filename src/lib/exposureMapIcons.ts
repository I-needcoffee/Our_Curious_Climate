type Appendable = {
  append: (type: string) => any;
};

export const EXPOSURE_ICON_SUN = '#E8A317';
export const EXPOSURE_ICON_WIND = '#0EA5E9';
export const EXPOSURE_ICON_MOON = '#7C8DB5';
export const EXPOSURE_ICON_SHELTER = '#8B95A8';

type IconKind = 'sun' | 'moon' | 'wind' | 'shelter';

/** Disk + eight rays — still chunky enough for heatmap cells. */
function drawFilledSun(g: any, color: string): void {
  g.append('circle').attr('cx', 12).attr('cy', 12).attr('r', 4.6).attr('fill', color);
  const rays: [number, number, number, number][] = [
    [11.1, 1.4, 1.8, 3.4], // N
    [11.1, 19.2, 1.8, 3.4], // S
    [1.4, 11.1, 3.4, 1.8], // W
    [19.2, 11.1, 3.4, 1.8], // E
    [4.0, 4.0, 2.5, 2.5], // NW
    [17.5, 4.0, 2.5, 2.5], // NE
    [4.0, 17.5, 2.5, 2.5], // SW
    [17.5, 17.5, 2.5, 2.5], // SE
  ];
  for (const [x, y, w, h] of rays) {
    g.append('rect')
      .attr('x', x)
      .attr('y', y)
      .attr('width', w)
      .attr('height', h)
      .attr('rx', Math.min(w, h) / 2)
      .attr('fill', color);
  }
}

/** Fat crescent. */
function drawFilledMoon(g: any, color: string): void {
  g.append('path')
    .attr('d', 'M14.8 2.8A9.2 9.2 0 1 0 21.2 15.8 7 7 0 0 1 14.8 2.8Z')
    .attr('fill', color);
}

/** Three staggered wind bars (reads as motion, not a equals sign). */
function drawFilledWind(g: any, color: string): void {
  const bars: [number, number, number][] = [
    [4, 5.6, 13.5],
    [2.5, 10.7, 18],
    [4, 15.8, 15],
  ];
  for (const [x, y, w] of bars) {
    g.append('rect')
      .attr('x', x)
      .attr('y', y)
      .attr('width', w)
      .attr('height', 2.8)
      .attr('rx', 1.4)
      .attr('fill', color);
  }
}

/** One-piece house silhouette (roof + walls). */
function drawFilledShelter(g: any, color: string): void {
  g.append('path')
    .attr('d', 'M12 3.2 21.5 12.2H18V20.8H6V12.2H2.5Z')
    .attr('fill', color);
}

function appendOneIcon(
  parent: Appendable,
  kind: IconKind,
  cx: number,
  cy: number,
  sizePx: number,
  opacity: number
): void {
  const s = Math.max(8, sizePx);
  const g = parent
    .append('g')
    .attr('transform', `translate(${cx - s / 2},${cy - s / 2}) scale(${s / 24})`)
    .attr('pointer-events', 'none')
    .style('opacity', opacity);

  const fill =
    kind === 'wind'
      ? EXPOSURE_ICON_WIND
      : kind === 'moon'
        ? EXPOSURE_ICON_MOON
        : kind === 'shelter'
          ? EXPOSURE_ICON_SHELTER
          : EXPOSURE_ICON_SUN;

  if (kind === 'sun') drawFilledSun(g, fill);
  else if (kind === 'moon') drawFilledMoon(g, fill);
  else if (kind === 'wind') drawFilledWind(g, fill);
  else drawFilledShelter(g, fill);
}

/**
 * Icons for what to leave exposed — or a shelter mark when both are blocked.
 * Night swaps sun → moon when solar is part of the mix.
 */
export function appendExposedOnlyIcons(
  parent: Appendable,
  opts: {
    includeSun: boolean;
    includeWind: boolean;
    isNight: boolean;
    cx: number;
    cy: number;
    cellW: number;
    cellH: number;
    opacity?: number;
  }
): void {
  const kinds: IconKind[] = [];
  if (opts.includeSun) kinds.push(opts.isNight ? 'moon' : 'sun');
  if (opts.includeWind) kinds.push('wind');
  if (!kinds.length) kinds.push('shelter');

  const op = opts.opacity ?? 1;
  const n = kinds.length;
  const maxByH = opts.cellH * 0.8;
  const maxByW = n === 1 ? opts.cellW * 0.75 : opts.cellW * 0.42;
  const size = Math.max(9, Math.min(16, maxByH, maxByW));
  const gap = Math.max(1.5, size * 0.2);
  const total = n * size + (n - 1) * gap;
  let x = opts.cx - total / 2 + size / 2;

  for (const kind of kinds) {
    appendOneIcon(parent, kind, x, opts.cy, size, op);
    x += size + gap;
  }
}
