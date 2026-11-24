import React from 'react';
import { EPWVariable } from '../lib/epwParser';
import * as d3 from 'd3';
import { DIFFERENCE_DIVERGING_COLORS } from '../lib/differenceDivergingColor';
import {
  DIRECT_NORMAL_RADIATION_LEGEND_TICKS,
  directNormalRadiationParameter,
} from '../lib/heatmapColorAdjust';

/** Matches `DataExplorer` bar rects (`.style("opacity", 0.6)` on filled bars). */
const LEGEND_FILL_OPACITY = 0.6;

/**
 * Legend typography shared with the UTCI footer strips. The bar stays slim so the chart keeps the
 * card's space; labels step gently with the card's `@container` width and a notch larger in
 * slide exports.
 */
export const LEGEND_WRAP_CLASS = 'flex w-full select-none flex-col gap-0.5 px-0.5 py-0.5';
/** Legend bar: a thin scale strip under the title (14px → 18px with the card); slides get one step more. */
export const LEGEND_BAR_CLASS =
  'relative h-[14px] w-full overflow-hidden rounded-full glow-sm [--legend-label:9.5px] @md:h-4 @md:[--legend-label:10px] @2xl:h-[18px] @2xl:[--legend-label:11px] export:h-[18px] export:[--legend-label:11px] @lg:export:h-5 @lg:export:[--legend-label:12px]';
export const LEGEND_IN_BAR_LABEL_CLASS = 'font-semibold leading-none tabular-nums';
/** One-line footnote under the legend: quiet ink with WCAG AA legibility. */
export const LEGEND_FOOTNOTE_CLASS =
  'm-0 truncate text-[10px] leading-snug text-gray-500 export:text-[11px] dark:text-gray-400';

function legendSurface(theme: 'light' | 'dark') {
  return theme === 'dark' ? '#111827' : '#ffffff';
}

function blendOnto(surfaceHex: string, colorHex: string, opacity: number) {
  const a = Math.max(0, Math.min(1, opacity));
  const S = d3.rgb(surfaceHex);
  const C = d3.rgb(colorHex);
  return d3
    .rgb(
      Math.round(C.r * a + S.r * (1 - a)),
      Math.round(C.g * a + S.g * (1 - a)),
      Math.round(C.b * a + S.b * (1 - a))
    )
    .formatHex();
}

/** Picks near-black or white text for a legend fill using WCAG relative luminance. */
export function legendContrastInk(bg: string): string {
  const c = d3.color(bg);
  if (!c) return '#111827';
  const rgb = c.rgb();
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
  return L < 0.32 ? '#ffffff' : '#111827';
}

export function legendInkShadow(fg: string): string {
  return fg === '#ffffff' ? '0 1px 2px rgba(0,0,0,0.35)' : '0 0 3px rgba(255,255,255,0.55)';
}

export interface GradientDef {
  id: string;
  name: string;
  colors: string[];
}

interface InteractiveLegendProps {
  variable: EPWVariable;
  gradientId: string;
  setGradientId: (id: string) => void;
  gradients: GradientDef[];
  isDifference?: boolean;
  /** Optional DOM id for onboarding / scroll targets (tutorial layout). */
  domId?: string;
  /** Short caption under the gradient bar (heatmap color scale). */
  footnote?: string;
  /**
   * Discrete color classes (e.g. wind-rose speed buckets): the bar becomes equal bands in these
   * exact fills, labelled at the band boundaries, instead of a continuous gradient.
   */
  stepFills?: string[];
}

export function InteractiveLegend({
  variable,
  gradientId,
  gradients,
  theme = 'light',
  isDifference = false,
  domId,
  footnote,
  stepFills,
}: InteractiveLegendProps & { theme?: 'light' | 'dark' }) {
  const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];

  let colors = gradientDef.colors;
  let domain = [variable.min, variable.max];

  if (isDifference) {
    colors = [...DIFFERENCE_DIVERGING_COLORS];
    domain = [variable.min, 0, variable.max];
  }

  const stepped = !!stepFills && stepFills.length > 0;
  /** Keep all legend colors (heatmaps, SunPath, and Wind Rose bands) true to the chart colors at full opacity. */
  const fillOpacity = 1;

  const barBg = legendSurface(theme);
  /** Keep end labels inside the rounded bar ends. */
  const endInset = 8;

  const span = Math.abs(variable.max - variable.min);
  const decimals = span >= 30 ? 0 : 1;
  const formatValue = (v: number) => {
    const rounded = Number(v.toFixed(decimals));
    const text = Object.is(rounded, -0) || rounded === 0 ? '0' : rounded.toFixed(decimals);
    return isDifference && rounded > 0 ? `+${text}` : text;
  };

  const segColors = colors.length > 0 ? colors : ['#999'];
  const isDiffAxis = isDifference && domain.length === 3;
  const isDirectNormalLegend = variable.id === 'directNormalRadiation' && !isDifference;

  const legendTickValues = (() => {
    if (isDiffAxis) {
      return [domain[0]!, domain[1]!, domain[2]!];
    }
    if (stepped) {
      const bands = stepFills!.length;
      return Array.from({ length: bands + 1 }, (_, i) => variable.min + ((variable.max - variable.min) * i) / bands);
    }
    if (isDirectNormalLegend) {
      const min = variable.min;
      const max = variable.max;
      const range = max - min;
      return DIRECT_NORMAL_RADIATION_LEGEND_TICKS.map(tick => {
        if (range <= 0) return min;
        const t = tick / DIRECT_NORMAL_RADIATION_LEGEND_TICKS[DIRECT_NORMAL_RADIATION_LEGEND_TICKS.length - 1]!;
        return min + range * t;
      });
    }
    const n = segColors.length;
    if (n === 1) return [variable.min];
    const min = variable.min;
    const max = variable.max;
    return Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));
  })();

  const formatLegendTick = (v: number) => {
    if (stepped || (isDirectNormalLegend && Math.abs(v - Math.round(v)) < 0.05)) {
      const whole = Math.round(v);
      if (stepped && Math.abs(v - whole) >= 0.05) return v.toFixed(1);
      return String(whole);
    }
    return formatValue(v);
  };

  const segLabels = legendTickValues.map(formatLegendTick);
  const n = Math.max(1, segLabels.length);
  /**
   * Approximate card width (px) needed to print every label at the base legend size. The tightest
   * gap is between the last interior label (centered) and the inset, right-aligned end label.
   * Narrower cards drop every other interior label (container query) so numbers never collide.
   */
  const maxLabelPx = Math.max(...segLabels.map(l => l.length)) * 6.2;
  const labelsNeedPx = (n - 1) * (maxLabelPx * 1.5 + endInset + 4) + 16;
  const thinnedLabelClass =
    labelsNeedPx <= 175
      ? ''
      : labelsNeedPx <= 220
        ? 'hidden @min-[220px]:block'
        : labelsNeedPx <= 260
          ? 'hidden @min-[260px]:block'
          : labelsNeedPx <= 320
            ? 'hidden @xs:block'
            : labelsNeedPx <= 384
              ? 'hidden @sm:block'
              : 'hidden @md:block';

  return (
    <div
      id={domId}
      className={`${LEGEND_WRAP_CLASS} ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}
    >
      <div className={LEGEND_BAR_CLASS}>
        <div className="absolute inset-0" style={{ backgroundColor: barBg }} />
        {stepped ? (
          <div className="absolute inset-0 flex" style={{ opacity: fillOpacity }}>
            {stepFills!.map((fill, i) => (
              <div key={i} className="h-full flex-1" style={{ backgroundColor: fill }} />
            ))}
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to right, ${segColors.join(', ')})`,
              opacity: fillOpacity,
            }}
          />
        )}

        {segLabels.map((label, i) => {
          const tickValue = legendTickValues[i] ?? variable.min;
          const tSample = isDiffAxis ? (i === 0 ? 0 : i === 1 ? 0.5 : 1) : n === 1 ? 0.5 : i / (n - 1);
          const rawAtCenter = stepped
            ? /* boundary label straddles two bands; the end labels sit fully inside the end bands */
              i === 0
              ? stepFills![0]!
              : i === n - 1
                ? stepFills![stepFills!.length - 1]!
                : d3.interpolateRgb(stepFills![i - 1]!, stepFills![Math.min(i, stepFills!.length - 1)]!)(0.5)
            : isDirectNormalLegend
              ? d3.interpolateRgbBasis(segColors)(
                  directNormalRadiationParameter(tickValue, variable.min, variable.max)
                )
              : d3.interpolateRgbBasis(segColors)(tSample);
          const fg = legendContrastInk(
            blendOnto(barBg, d3.color(rawAtCenter)?.formatHex() ?? '#999999', fillOpacity)
          );
          const fitFactor = Math.min(1, 6 / Math.max(1, label.length));
          const isEnd = i === 0 || i === n - 1;
          /** Stepped bars label every color boundary; gradient bars may drop alternate ticks when narrow. */
          const hideWhenNarrow = !stepped && !!thinnedLabelClass && !isEnd && (i % 2 !== 0 || n - 1 - i < 2);

          let pos: {
            left?: string | number;
            right?: string | number;
            transform: string;
            maxWidth?: string;
          };
          if (n === 1) {
            pos = { left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '100%' };
          } else if (i === 0) {
            pos = { left: endInset, transform: 'translateY(-50%)', maxWidth: `${Math.max(22, 100 / n + 6)}%` };
          } else if (i === n - 1) {
            pos = {
              right: endInset,
              left: 'auto',
              transform: 'translateY(-50%)',
              maxWidth: `${Math.max(22, 100 / n + 6)}%`,
            };
          } else {
            const t = isDiffAxis ? 0.5 : i / (n - 1);
            pos = { left: `${t * 100}%`, transform: 'translate(-50%, -50%)', maxWidth: `${100 / n}%` };
          }
          return (
            <span
              key={i}
              className={`absolute top-1/2 ${LEGEND_IN_BAR_LABEL_CLASS} ${hideWhenNarrow ? thinnedLabelClass : ''}`}
              style={{
                left: pos.left,
                right: pos.right,
                transform: pos.transform,
                fontSize: `calc(var(--legend-label) * ${fitFactor.toFixed(3)})`,
                color: fg,
                textShadow: legendInkShadow(fg),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
                maxWidth: pos.maxWidth,
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
      {footnote ? (
        <p className={LEGEND_FOOTNOTE_CLASS} title={footnote}>
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
