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

/** Shared scale for `InteractiveLegend` and UTCI footer strips (tweak both together). */
export const DEFAULT_LEGEND_FONT_SCALE = 0.78;

/**
 * Shared pill height for `InteractiveLegend` and UTCI footer strips.
 * Tall enough for in-bar numbers without stealing much chart space.
 */
export function getLegendBarHeightPx(scale: number) {
  return Math.max(11, Math.round(16 * scale));
}

/** Max label size (px) that still fits inside the rounded bar; uses most of the bar height. */
export function getLegendLabelBasePx(barH: number, fontScale: number) {
  const cap = Math.max(1, barH - 2);
  return Math.max(8, 8 * fontScale, Math.min(Math.floor(barH * 0.82), cap));
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
  fontScale?: number;
  isDifference?: boolean;
  /** Optional DOM id for onboarding / scroll targets (tutorial layout). */
  domId?: string;
  /** Tiny caption under the gradient bar (heatmap color scale). */
  footnote?: string;
}

export function InteractiveLegend({ 
  variable, 
  gradientId, 
  setGradientId, 
  gradients, 
  theme = 'light',
  fontScale = DEFAULT_LEGEND_FONT_SCALE,
  isDifference = false,
  domId,
  footnote,
}: InteractiveLegendProps & { theme?: 'light' | 'dark' }) {
  const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
  
  // Colors used for segment rendering and contrast calc.
  let colors = gradientDef.colors;
  let domain = [variable.min, variable.max];

  if (isDifference) {
    colors = [...DIFFERENCE_DIVERGING_COLORS];
    domain = [variable.min, 0, variable.max];
  }

  const pad = 3.25 * fontScale;
  const gap = 2 * fontScale;
  const barH = getLegendBarHeightPx(fontScale);
  const barBg = legendSurface(theme);
  /** Keep end labels inside the rounded bar (avoids -50% translate on 0% / 100% clipping). */
  const endInset = Math.max(1.5, 3.2 * fontScale);

  const contrastText = (bg: string) => {
    const c = d3.color(bg);
    if (!c) return theme === 'dark' ? '#fff' : '#000';
    const rgb = c.rgb();
    const toLin = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
    return L < 0.5 ? '#fff' : '#111827';
  };

  const formatValue = (v: number) => {
    if (isDifference && v > 0) return `+${v.toFixed(v === 0 ? 0 : 1)}`;
    return v.toFixed(v === 0 ? 0 : 1);
  };

  // Build one label per segment and center it in that segment.
  const segColors = colors.length > 0 ? colors : ['#999'];
  const isDiffAxis = isDifference && domain.length === 3;
  const isDirectNormalLegend = variable.id === 'directNormalRadiation' && !isDifference;

  const legendTickValues = (() => {
    if (isDiffAxis) {
      return [domain[0]!, domain[1]!, domain[2]!];
    }
    if (isDirectNormalLegend) {
      const min = variable.min;
      const max = variable.max;
      const span = max - min;
      return DIRECT_NORMAL_RADIATION_LEGEND_TICKS.map(tick => {
        if (span <= 0) return min;
        const t = tick / DIRECT_NORMAL_RADIATION_LEGEND_TICKS[DIRECT_NORMAL_RADIATION_LEGEND_TICKS.length - 1]!;
        return min + span * t;
      });
    }
    const n = segColors.length;
    if (n === 1) return [variable.min];
    const min = variable.min;
    const max = variable.max;
    return Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));
  })();

  const formatLegendTick = (v: number) => {
    if (isDirectNormalLegend && Math.abs(v - Math.round(v)) < 0.05) {
      return String(Math.round(v));
    }
    return formatValue(v);
  };

  const segLabels = legendTickValues.map(formatLegendTick);

  const labelBasePx = getLegendLabelBasePx(barH, fontScale);

  return (
    <div
      id={domId}
      className={`flex w-full select-none flex-col ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}
      style={{ padding: `${pad}px`, gap: `${gap}px` }}
    >
      <div
        className={`relative w-full overflow-hidden rounded-full border ${
          theme === 'dark' ? 'border-gray-700 bg-[#111827]' : 'border-gray-200 bg-white'
        }`}
        style={{ height: `${barH}px` }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: barBg }} />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, ${segColors.join(', ')})`,
            opacity: LEGEND_FILL_OPACITY,
          }}
        />

        {segLabels.map((label, i) => {
          const n = Math.max(1, segLabels.length);
          const tickValue = legendTickValues[i] ?? variable.min;
          const tSample = isDiffAxis
            ? i === 0
              ? 0
              : i === 1
                ? 0.5
                : 1
            : n === 1
              ? 0.5
              : (n - 1) > 0
                ? i / (n - 1)
                : 0.5;
          const rawAtCenter = isDirectNormalLegend
            ? d3.interpolateRgbBasis(segColors)(
                directNormalRadiationParameter(tickValue, variable.min, variable.max)
              )
            : d3.interpolateRgbBasis(segColors)(tSample);
          const blended = blendOnto(barBg, rawAtCenter, LEGEND_FILL_OPACITY);
          const fg = contrastText(blended);
          const shadow =
            fg === '#fff'
              ? '0 1px 2px rgba(0,0,0,0.35)'
              : '0 1px 2px rgba(255,255,255,0.35)';
          const len = Math.max(1, label.length);
          const fitFactor = Math.min(1, 6 / len);
          const labelPx = Math.max(8, Math.floor(labelBasePx * fitFactor));

          let pos: {
            left?: string | number;
            right?: string | number;
            transform: string;
            textAlign: 'left' | 'center' | 'right';
            maxWidth?: string;
          };
          if (isDiffAxis) {
            if (i === 0) {
              pos = {
                left: endInset,
                transform: 'translateY(-50%)',
                textAlign: 'left',
                maxWidth: '33%',
              };
            } else if (i === 1) {
              pos = {
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                maxWidth: '34%',
              };
            } else {
              pos = {
                right: endInset,
                left: 'auto',
                transform: 'translateY(-50%)',
                textAlign: 'right',
                maxWidth: '33%',
              };
            }
          } else if (n === 1) {
            pos = {
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              maxWidth: '100%',
            };
          } else if (n === 2) {
            pos =
              i === 0
                ? {
                    left: endInset,
                    transform: 'translateY(-50%)',
                    textAlign: 'left',
                    maxWidth: '45%',
                  }
                : {
                    right: endInset,
                    left: 'auto',
                    transform: 'translateY(-50%)',
                    textAlign: 'right',
                    maxWidth: '45%',
                  };
          } else {
            const t = n > 1 ? i / (n - 1) : 0.5;
            if (i === 0) {
              pos = {
                left: endInset,
                transform: 'translateY(-50%)',
                textAlign: 'left',
                maxWidth: `${Math.min(40, 100 / n + 5)}%`,
              };
            } else if (i === n - 1) {
              pos = {
                right: endInset,
                left: 'auto',
                transform: 'translateY(-50%)',
                textAlign: 'right',
                maxWidth: `${Math.min(40, 100 / n + 5)}%`,
              };
            } else {
              pos = {
                left: `${t * 100}%`,
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                maxWidth: `${100 / n}%`,
              };
            }
          }
          return (
            <span
              key={i}
              className="absolute top-1/2 tabular-nums font-normal leading-none"
              style={{
                left: pos.left,
                right: pos.right,
                transform: pos.transform,
                fontSize: `${labelPx}px`,
                color: fg,
                textShadow: shadow,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
                maxWidth: pos.maxWidth,
                textAlign: pos.textAlign,
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
      {footnote ? (
        <p className="m-0 mt-0.5 text-[9px] leading-snug font-normal text-gray-400 dark:text-gray-500">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
