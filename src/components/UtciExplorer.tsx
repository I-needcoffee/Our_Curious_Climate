import { useEffect, useId, useRef, useState, useMemo } from 'react';
import { useIsMobileMaxSm } from '../hooks/useIsMobileMaxSm';
import { useTutorialLiveOptional } from '../context/TutorialLiveContext';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { EPWDataRow } from '../lib/epwParser';
// @ts-ignore
import tc from 'jsthermalcomfort';
import { Sun, Wind, X, Settings2 } from 'lucide-react';
import { InteractiveLegend, GradientDef, getLegendBarHeightPx, getLegendLabelBasePx, DEFAULT_LEGEND_FONT_SCALE } from './InteractiveLegend';
import { AggregationToolbar } from './AggregationToolbar';
import type { ChartType, CompareUtciSharedControls } from '../App';
import { UnitSystem } from '../App';
import { UNIT_C, UNIT_F, utciGradientExtentC } from '../lib/unitConversion';

import type { BarChartFillMode, GlobalFilterState, HeatmapCellStatistic } from '../lib/globalFilter';
import {
  aggregateCellStatistic,
  explorerBarStatisticY,
  rowPassesGlobalFilters,
} from '../lib/globalFilter';
import { ChartTypeMenu } from './ChartTypeMenu';
import {
  CHART_TOOLBAR_CONTROLS_CLASS,
  CHART_TOOLBAR_EXPORT_ROW_CLASS,
  CHART_TOOLBAR_HEADER_PAD,
  CHART_TOOLBAR_ROW_CLASS,
  chartToolbarTitleClass,
} from '../lib/chartToolbarLayout';
import { ExportHeaderCaption } from './ExportHeaderCaption';
import { CardModal } from './CardModal';
import { OUTDOOR_COMFORT_GREEN_HEX } from '../lib/constants';
import { gradientsForUtci } from '../lib/availableGradientsForVariable';
import { differenceDivergingColor, DIFFERENCE_DIVERGING_ID } from '../lib/differenceDivergingColor';
import { symmetricDiffBound } from '../lib/symmetricDiffDomain';
import {
  createExplorerChartValueGradient,
  explorerChartValueGradientId,
  upsertSvgDefs,
} from '../lib/explorerBarGradient';
import {
  EXPLORER_SVG_BASE_WIDTH,
  EXPLORER_SVG_MARGIN,
  EXPLORER_MONTH_AXIS_BAND_PX,
  EXPLORER_MONTH_LABELS_SHORT,
  explorerBarGridStroke,
  explorerHeatmapRowLayout,
  explorerInnerWidth,
  explorerBarChartHeightPx,
  explorerHeatmapCellXPx,
  explorerHeatmapHeightPx,
  explorerHeatmapSpanXPx,
  explorerHeatmapXOfDay,
  explorerMonthLabelCenterDays,
  explorerSvgHeightPx,
  EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS,
} from '../lib/explorerChartSvgLayout';
import {
  getUtciCategoryForValue,
  getUtciComfortPeriodById,
  heatmapSlotInUtciComfortPeriod,
  rowMatchesUtciComfortPeriod,
  UTCI_COLORS,
  utciPeriodHeatmapBounds,
} from '../lib/utciModel';

interface UtciExplorerProps {
  data: EPWDataRow[];
  compareData?: EPWDataRow[];
  showDifference?: boolean;
  stackedComparison?: boolean;
  onRemove?: () => void;
  onChangeType?: (type: ChartType) => void;
  gradients: GradientDef[];
  filter: GlobalFilterState;
  heatmapCellStatistic?: HeatmapCellStatistic;
  barChartFillMode?: BarChartFillMode;
  unitSystem: UnitSystem;
  heatmapTextColor: string;
  theme: 'light' | 'dark';
  setShowGradientModal: (show: boolean) => void;
  exportMode?: boolean;
  comparePane?: 'primary' | 'secondary';
  paneCity?: string;
  pairSuppressHeader?: boolean;
  pairModalHost?: boolean;
  utciShared?: CompareUtciSharedControls;
  tutorialLegendDomId?: string;
  tutorialChromeAnchors?: boolean;
  pairSuppressFooterLegend?: boolean;
}

// Create a continuous color scale for UTCI categories
const UTCI_THRESHOLDS = [-40, -27, -13, 0, 9, 26, 32, 38, 46, 50];
const UTCI_COLOR_VALUES = Object.values(UTCI_COLORS);

const utciCategoryScale = d3.scaleLinear<string>()
  .domain(UTCI_THRESHOLDS)
  .range(UTCI_COLOR_VALUES)
  .interpolate(d3.interpolateRgb);

/** Matches `InteractiveLegend` default `fontScale` so UTCI footer legends share the same footprint */
export const UTCI_LEGEND_FONT_SCALE = DEFAULT_LEGEND_FONT_SCALE;

/** Same as `DataExplorer` bar fill opacity on colored rects. */
const LEGEND_FILL_OPACITY = 0.6;

const LEGEND_STRIP_SCALE = UTCI_LEGEND_FONT_SCALE;

export function UtciCategoryLegendStrip({ theme }: { theme: 'light' | 'dark' }) {
  const pad = 3.25 * LEGEND_STRIP_SCALE;
  const gap = 2 * LEGEND_STRIP_SCALE;
  const titlePx = Math.round(9.5 * LEGEND_STRIP_SCALE);
  const tickPx = Math.max(8, 8.5 * LEGEND_STRIP_SCALE);
  const barH = getLegendBarHeightPx(LEGEND_STRIP_SCALE);
  const cats = Object.keys(UTCI_COLORS);
  const catColors = cats.map(k => UTCI_COLORS[k]);
  const comfortIdx = cats.indexOf('no thermal stress');
  const comfortCenterPct = ((comfortIdx + 0.5) / cats.length) * 100;

  return (
    <div
      className={`flex flex-col w-full select-none ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}
      style={{ padding: `${pad}px`, gap: `${gap}px` }}
    >
      {/* Title removed: shown in chart header */}
      <div
        className={`relative w-full overflow-hidden rounded-full border ${
          theme === 'dark' ? 'border-gray-700 bg-[#111827]' : 'border-gray-200 bg-white'
        }`}
        style={{ height: `${barH}px` }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, ${catColors.join(', ')})`,
            opacity: LEGEND_FILL_OPACITY,
          }}
        />
      </div>
      <div className="relative w-full" style={{ minHeight: `${Math.max(tickPx, 10)}px`, fontSize: `${tickPx}px` }}>
        <span
          className={`absolute left-0 top-0 max-w-[34%] truncate font-medium uppercase tracking-tight leading-none ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          Extreme cold
        </span>
        <span
          className="absolute top-0 -translate-x-1/2 font-semibold uppercase tracking-tight leading-none whitespace-nowrap"
          style={{ left: `${comfortCenterPct}%`, color: OUTDOOR_COMFORT_GREEN_HEX }}
        >
          Comfort
        </span>
        <span
          className={`absolute right-0 top-0 max-w-[34%] truncate text-right font-medium uppercase tracking-tight leading-none ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          Extreme heat
        </span>
      </div>
    </div>
  );
}

export function UtciComfortTimeLegendStrip({
  theme,
  highColor = OUTDOOR_COMFORT_GREEN_HEX,
  leftColor,
}: {
  theme: 'light' | 'dark';
  highColor?: string;
  leftColor?: string;
}) {
  const pad = 3.25 * LEGEND_STRIP_SCALE;
  const gap = 2 * LEGEND_STRIP_SCALE;
  const titlePx = Math.round(9.5 * LEGEND_STRIP_SCALE);
  const barH = getLegendBarHeightPx(LEGEND_STRIP_SCALE);
  const labelBasePx = getLegendLabelBasePx(barH, LEGEND_STRIP_SCALE);

  const contrastText = (hex: string) => {
    const c = d3.color(hex);
    if (!c) return theme === 'dark' ? '#fff' : '#000';
    const rgb = c.rgb();
    const toLin = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
    return L < 0.5 ? '#fff' : '#111827';
  };
  const leftBg = leftColor ?? (theme === 'dark' ? '#1f2937' : '#ffffff');
  const rightBg = highColor;

  return (
    <div
      className={`flex flex-col w-full select-none ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}
      style={{ padding: `${pad}px`, gap: `${gap}px` }}
    >
      {/* Title removed: shown in chart header */}
      <div
        className={`relative w-full overflow-hidden rounded-full border ${
          theme === 'dark' ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-white'
        }`}
        style={{
          height: `${barH}px`,
          background: `linear-gradient(to right, ${leftBg}, ${rightBg})`,
        }}
      >
        {(['0%', '100%'] as const).map((label) => {
          const len = Math.max(1, label.length);
          const fitFactor = Math.min(1, 6 / len);
          const labelPx = Math.max(8, Math.floor(labelBasePx * fitFactor));
          const isLeft = label === '0%';
          const fg = contrastText(isLeft ? leftBg : rightBg);
          const shadow =
            fg === '#fff'
              ? '0 1px 2px rgba(0,0,0,0.35)'
              : '0 1px 2px rgba(255,255,255,0.35)';
          return (
            <span
              key={label}
              className="absolute top-1/2 -translate-y-1/2 tabular-nums font-normal leading-none"
              style={{
                left: isLeft ? 8 : undefined,
                right: !isLeft ? 8 : undefined,
                fontSize: `${labelPx}px`,
                color: fg,
                textShadow: shadow,
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface UtciDataRow extends EPWDataRow {
  utci: number;
  utciCategory: string;
  isComfortable: number;
}

export function UtciExplorer({
  data,
  compareData,
  showDifference,
  stackedComparison,
  onRemove,
  onChangeType,
  gradients,
  filter,
  heatmapCellStatistic = 'mean',
  barChartFillMode = 'solid',
  unitSystem,
  heatmapTextColor,
  theme,
  setShowGradientModal,
  exportMode,
  comparePane,
  paneCity,
  pairSuppressHeader,
  pairModalHost,
  utciShared,
  tutorialLegendDomId,
  tutorialChromeAnchors,
  pairSuppressFooterLegend,
}: UtciExplorerProps) {
  const barGradientSvgId = explorerChartValueGradientId(useId());
  const svgRef = useRef<SVGSVGElement>(null);
  const compareSvgRef = useRef<SVGSVGElement>(null);
  const [iAgg, setIAgg] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const aggregation = utciShared?.aggregation ?? iAgg;
  const setAggregation = utciShared?.setAggregation ?? setIAgg;

  const [iSun, setISun] = useState(true);
  const includeSun = utciShared?.includeSun ?? iSun;
  const setIncludeSun = utciShared?.setIncludeSun ?? setISun;

  const [iWind, setIWind] = useState(true);
  const includeWind = utciShared?.includeWind ?? iWind;
  const setIncludeWind = utciShared?.setIncludeWind ?? setIWind;

  const [iColorMode, setIColorMode] = useState<'categories' | 'comfortTime' | 'gradient'>('comfortTime');
  const colorMode = utciShared?.colorMode ?? iColorMode;
  const setColorMode = utciShared?.setColorMode ?? setIColorMode;

  const [iGrad, setIGrad] = useState(gradients[0].id);
  const gradientId = utciShared?.gradientId ?? iGrad;
  const setGradientId = utciShared?.setGradientId ?? setIGrad;

  useEffect(() => {
    if (showDifference && compareData) {
      if (gradients.some(g => g.id === DIFFERENCE_DIVERGING_ID)) {
        setGradientId(DIFFERENCE_DIVERGING_ID);
      }
    }
  }, [showDifference, compareData, gradients, setGradientId]);

  const [iShowSettings, setIShowSettings] = useState(false);
  const showSettings = utciShared?.showSettings ?? iShowSettings;
  const setShowSettings = utciShared?.setShowSettings ?? setIShowSettings;

  const [iShowStats, setIShowStats] = useState(false);
  const showStats = utciShared?.showStats ?? iShowStats;
  const setShowStats = utciShared?.setShowStats ?? setIShowStats;

  const showStatsModal = showStats && (!pairSuppressHeader || pairModalHost);
  const showSettingsModal = showSettings && (!pairSuppressHeader || pairModalHost);
  const paletteGradients = useMemo(() => gradientsForUtci(gradients), [gradients]);

  const utciLegendFootnote = useMemo(() => {
    if (showDifference && compareData) {
      return 'Compare lines: baseline vs comparison; shading shows the gap.';
    }
    if (colorMode === 'comfortTime') {
      return 'Bar shows comfort-time share in each period (filtered).';
    }
    if (colorMode === 'categories') {
      return 'Strip: stress categories.';
    }
    if (aggregation !== 'hour') {
      return 'Bars span hourly UTCI minimum to maximum.';
    }
    return '';
  }, [aggregation, colorMode, showDifference, compareData]);

  const isMobile = useIsMobileMaxSm();
  const expandChromeStrip = !exportMode && (tutorialChromeAnchors || isMobile);
  const chartToolbarRevealClass = expandChromeStrip
    ? 'pointer-events-auto max-h-[52px] overflow-visible opacity-100 pt-1 transition-[max-height,opacity] duration-200 ease-out'
    : 'pointer-events-none max-h-0 overflow-hidden opacity-0 transition-[max-height,opacity] duration-200 ease-out group-hover:pointer-events-auto group-hover:max-h-[48px] group-hover:opacity-100 focus-within:pointer-events-auto focus-within:max-h-[48px] focus-within:opacity-100';
  const removeBtnRevealClass = isMobile
    ? 'pointer-events-auto absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 opacity-100'
    : 'pointer-events-none absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100';
  // chart type switching handled by ChartTypeMenu

  const tutorialLive = useTutorialLiveOptional();
  const tutorialReport = tutorialLive?.report;
  const tutorialEnabled = tutorialLive?.enabled;
  useEffect(() => {
    if (!tutorialEnabled || !tutorialReport) return;
    tutorialReport({
      aggregation,
      utciColorMode: colorMode,
      includeSun,
      includeWind,
    });
  }, [tutorialEnabled, tutorialReport, aggregation, colorMode, includeSun, includeWind]);

  const tutorialExposureSun = tutorialLive?.snapshot.includeSun;
  const tutorialExposureWind = tutorialLive?.snapshot.includeWind;
  const tutorialFocusPeriodId = tutorialLive?.snapshot.utciFocusPeriodId;
  const lastSyncedFocusRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!tutorialEnabled || utciShared) return;
    const focusId = tutorialFocusPeriodId ?? null;
    if (lastSyncedFocusRef.current === focusId) return;
    lastSyncedFocusRef.current = focusId;
    if (!focusId) return;
    setIncludeSun(tutorialExposureSun ?? true);
    setIncludeWind(tutorialExposureWind ?? true);
  }, [
    tutorialEnabled,
    utciShared,
    tutorialFocusPeriodId,
    tutorialExposureSun,
    tutorialExposureWind,
    setIncludeSun,
    setIncludeWind,
  ]);

  const exposureTheme = exportMode ? 'light' : theme;

  const exposureBadge = (kind: 'sun' | 'wind', active: boolean) => {
    const Icon = kind === 'sun' ? Sun : Wind;
    const title =
      kind === 'sun'
        ? active
          ? 'Solar radiation included \u2014 click to turn off'
          : 'Solar radiation excluded \u2014 click to turn on'
        : active
          ? 'Wind speed included \u2014 click to turn off'
          : 'Wind excluded (0.5 m/s) \u2014 click to turn on';
    const toggle = () => {
      if (kind === 'sun') setIncludeSun(v => !v);
      else setIncludeWind(v => !v);
    };

    return (
      <button
        type="button"
        title={title}
        aria-pressed={active}
        aria-label={title}
        onClick={toggle}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          active
            ? kind === 'sun'
              ? exposureTheme === 'dark'
                ? 'border-amber-600/70 bg-amber-950/50 hover:bg-amber-900/60'
                : 'border-amber-400 bg-amber-50 hover:bg-amber-100'
              : exposureTheme === 'dark'
                ? 'border-sky-600/70 bg-sky-950/50 hover:bg-sky-900/60'
                : 'border-sky-400 bg-sky-50 hover:bg-sky-100'
            : exposureTheme === 'dark'
              ? 'border-gray-600/50 bg-gray-800/40 hover:bg-gray-700/50'
              : 'border-gray-200/80 bg-gray-50/80 hover:bg-gray-100'
        }`}
      >
        <Icon
          className={`h-2.5 w-2.5 ${
            active
              ? kind === 'sun'
                ? exposureTheme === 'dark'
                  ? 'text-amber-400'
                  : 'text-amber-600'
                : exposureTheme === 'dark'
                  ? 'text-sky-400'
                  : 'text-sky-600'
              : exposureTheme === 'dark'
                ? 'text-gray-500 opacity-[0.18]'
                : 'text-gray-400 opacity-[0.18]'
          }`}
          aria-hidden
        />
      </button>
    );
  };

  const exposureIndicators = (
    <div className="flex shrink-0 items-center gap-1" aria-label="UTCI exposure inputs">
      {exposureBadge('sun', includeSun)}
      {exposureBadge('wind', includeWind)}
    </div>
  );

  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400 });

  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!outerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      
      resizeTimeoutRef.current = setTimeout(() => {
        for (let entry of entries) {
          const newWidth = Math.round(entry.contentRect.width);
          
          setDimensions(prev => {
            if (prev.width === newWidth) return prev;
            return { width: newWidth };
          });
        }
      }, 100);
    });
    observer.observe(outerRef.current);
    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

  // Pre-calculate UTCI for all data points to avoid recalculating on every render/aggregation change
  const utciData: UtciDataRow[] = useMemo(() => {
    return data.map(d => {
      const tdb = (d.dryBulbTemperature as number) || 0;
      const rh = (d.relativeHumidity as number) || 50;
      const windSpeed = (d.windSpeed as number) || 0;
      const ghr = (d.globalHorizontalRadiation as number) || 0;

      const v = includeWind ? Math.max(0.5, windSpeed) : 0.5;
      const tr = includeSun ? tdb + (0.02 * ghr) : tdb;

      // Calculate UTCI
      let utciVal = tdb;
      let category = getUtciCategoryForValue(tdb);
      try {
        const result = tc.models.utci(tdb, tr, v, rh, 'SI', true, false);
        utciVal = isNaN(result.utci) ? tdb : result.utci;
        category = result.stress_category || getUtciCategoryForValue(utciVal);
      } catch (e) {
        // Fallback
      }

      return {
        ...d,
        utci: utciVal as number,
        utciCategory: category as string,
        isComfortable: (category === 'no thermal stress' ? 1 : 0) as number
      };
    });
  }, [data, includeSun, includeWind]);

  const compareUtciData: UtciDataRow[] = useMemo(() => {
    return (compareData || []).map(d => {
      const tdb = (d.dryBulbTemperature as number) || 0;
      const rh = (d.relativeHumidity as number) || 50;
      const windSpeed = (d.windSpeed as number) || 0;
      const ghr = (d.globalHorizontalRadiation as number) || 0;

      const v = includeWind ? Math.max(0.5, windSpeed) : 0.5;
      const tr = includeSun ? tdb + (0.02 * ghr) : tdb;

      // Calculate UTCI
      let utciVal = tdb;
      let category = getUtciCategoryForValue(tdb);
      try {
        const result = tc.models.utci(tdb, tr, v, rh, 'SI', true, false);
        utciVal = isNaN(result.utci) ? tdb : result.utci;
        category = result.stress_category || getUtciCategoryForValue(utciVal);
      } catch (e) {
        // Fallback
      }

      return {
        ...d,
        utci: utciVal as number,
        utciCategory: category as string,
        isComfortable: (category === 'no thermal stress' ? 1 : 0) as number
      };
    });
  }, [compareData, includeSun, includeWind]);

  const convertUtci = (val: number) => {
    if (unitSystem === 'imperial') {
      if (showDifference) return val * 9/5; // Difference in C to difference in F
      return val * 9/5 + 32;
    }
    return val;
  };
  const utciUnit = unitSystem === 'imperial' ? UNIT_F : UNIT_C;
  const utciLegendTitle =
    showDifference && compareData
      ? `\u0394 UTCI (${utciUnit})`
      : colorMode === 'gradient'
        ? `UTCI (${utciUnit})`
        : colorMode === 'categories'
          ? 'Stress categories'
          : 'Time in comfort zone';

  const { utciMin, utciMax } = useMemo(() => {
    if (showDifference && compareData) {
      // Calculate max absolute difference for UTCI
      let maxDiff = 10; // Default
      try {
        const diffs = data.map((d, i) => {
          const cD = compareData[i];
          if (!cD) return 0;
          
          const getUtci = (row: EPWDataRow) => {
            const tdb = (row.dryBulbTemperature as number) || 0;
            const rh = (row.relativeHumidity as number) || 50;
            const windSpeed = (row.windSpeed as number) || 0;
            const ghr = (row.globalHorizontalRadiation as number) || 0;
            const v = includeWind ? Math.max(0.5, windSpeed) : 0.5;
            const tr = includeSun ? tdb + (0.02 * ghr) : tdb;
            try {
              const result = tc.models.utci(tdb, tr, v, rh, 'SI', true, false);
              return isNaN(result.utci) ? tdb : result.utci;
            } catch (e) { return tdb; }
          };

          return getUtci(cD) - getUtci(d);
        });
        const bound = symmetricDiffBound(diffs);
        maxDiff = bound > 0 ? bound : 1;
      } catch (e) {}

      return {
        utciMin: -maxDiff,
        utciMax: maxDiff
      };
    }
    const extent = utciGradientExtentC(utciData.map(d => d.utci));
    return { utciMin: extent.minC, utciMax: extent.maxC };
  }, [data, compareData, showDifference, includeSun, includeWind, utciData]);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const renderUtci = (svgEl: any, currentData: any[], title: string | null, isCompare: boolean) => {
    if (!currentData || !currentData.length) return;

    const focusPeriod =
      !isCompare && tutorialEnabled && tutorialFocusPeriodId
        ? getUtciComfortPeriodById(tutorialFocusPeriodId)
        : undefined;

    const heatmapCellInGlobal = (month: number, hour: number) => {
      const isMonthMatch =
        filter.startMonth <= filter.endMonth
          ? month >= filter.startMonth && month <= filter.endMonth
          : month >= filter.startMonth || month <= filter.endMonth;
      return isMonthMatch && hour >= filter.startHour && hour <= filter.endHour;
    };

    const heatmapCellOpacity = (month: number, hour: number) => {
      if (!heatmapCellInGlobal(month, hour)) return 0.2;
      if (!focusPeriod) return 1;
      return heatmapSlotInUtciComfortPeriod(month, hour, focusPeriod, filter) ? 1 : 0.28;
    };

    const width = EXPLORER_SVG_BASE_WIDTH;
    const margin = EXPLORER_SVG_MARGIN;
    const innerWidth = explorerInnerWidth();
    const barChartHeight = explorerBarChartHeightPx();
    const monthAxisBand = EXPLORER_MONTH_AXIS_BAND_PX;
    const heatmapBodyHeight = explorerHeatmapHeightPx();
    const height = explorerSvgHeightPx();

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const svgDefs = upsertSvgDefs(svg);

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // --- Data Processing ---
    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
    
    let colorScale: any;
    if (showDifference && compareData) {
      colorScale = (v: number) => differenceDivergingColor(v, utciMin, utciMax);
    } else if (colorMode === 'categories') {
      colorScale = utciCategoryScale;
    } else if (colorMode === 'comfortTime') {
      const comfortLow = theme === 'dark' ? '#1f2937' : '#ffffff';
      const comfortHigh = OUTDOOR_COMFORT_GREEN_HEX;
      colorScale = d3.scaleSequential<string>()
        .domain([0, 1])
        .interpolator(d3.interpolateRgb(comfortLow, comfortHigh));
    } else {
      colorScale = d3.scaleSequential()
        .domain([utciMin, utciMax])
        .interpolator(d3.interpolateRgbBasis(gradientDef.colors));
    }

    // X Scale
    const xScale = d3.scaleLinear()
      .domain([1, 366])
      .range([0, innerWidth]);

    const barChartG = g.append("g");

    // --- Heatmap ---
    const heatmapG = g.append("g").attr("transform", `translate(0, ${barChartHeight})`);

    // Aggregate data for heatmap
    let heatmapData: any[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const emptyUtciFill = theme === 'dark' ? 'rgba(55,65,81,0.4)' : 'rgba(203,213,225,0.7)';

    if (aggregation === 'month') {
      const groups = d3.group(currentData, d => d.month, d => d.hour);
      Array.from(groups).forEach(([month, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = values[0].dayOfYear;
          const endDay = values[values.length - 1].dayOfYear + 1;
          const selectedRows = values.filter(d => rowPassesGlobalFilters(d, filter));
          
          let avgUtciVal: number;
          let comfortRatio: number;
          if (selectedRows.length === 0) {
            avgUtciVal = NaN;
            comfortRatio = 0;
          } else if (showDifference && compareData) {
            const primaryStat = aggregateCellStatistic(selectedRows.map(d => d.utci), heatmapCellStatistic);
            const compareValues = selectedRows.map(v => {
              const idx = data.indexOf(v);
              const cD = compareData[idx];
              if (!cD) return null;
              
              const getUtci = (row: EPWDataRow) => {
                const tdb = (row.dryBulbTemperature as number) || 0;
                const rh = (row.relativeHumidity as number) || 50;
                const windSpeed = (row.windSpeed as number) || 0;
                const ghr = (row.globalHorizontalRadiation as number) || 0;
                const v_wind = includeWind ? Math.max(0.5, windSpeed) : 0.5;
                const tr = includeSun ? tdb + (0.02 * ghr) : tdb;
                try {
                  const result = tc.models.utci(tdb, tr, v_wind, rh, 'SI', true, false);
                  return isNaN(result.utci) ? tdb : result.utci;
                } catch (e) { return tdb; }
              };
              return getUtci(cD);
            }).filter(v => v !== null) as number[];
            const compareStat = aggregateCellStatistic(compareValues, heatmapCellStatistic);
            avgUtciVal = compareStat - primaryStat;
            comfortRatio = 0;
          } else {
            avgUtciVal = aggregateCellStatistic(selectedRows.map(d => d.utci), heatmapCellStatistic);
            comfortRatio = aggregateCellStatistic(selectedRows.map(d => d.isComfortable), heatmapCellStatistic);
          }
          
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            utci: avgUtciVal,
            utciCategory: Number.isFinite(avgUtciVal) ? getUtciCategoryForValue(avgUtciVal) : 'no thermal stress',
            isComfortable: comfortRatio,
            label: `${monthNames[month - 1]}`,
            tooltip:
              !Number.isFinite(avgUtciVal)
                ? `${monthNames[month - 1]}\nNo hours in dry-bulb band`
                : colorMode === 'comfortTime'
                  ? `${monthNames[month - 1]} Avg\nComfort Time: ${(comfortRatio * 100).toFixed(1)}%\nUTCI: ${convertUtci(avgUtciVal).toFixed(1)}${utciUnit}`
                  : `${monthNames[month - 1]} Avg\nUTCI: ${convertUtci(avgUtciVal).toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(avgUtciVal)}`
          });
        });
      });
    } else if (aggregation === 'week') {
      const groups = d3.group(currentData, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      Array.from(groups).forEach(([week, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = week * 7 + 1;
          const endDay = Math.min((week + 1) * 7 + 1, 366);
          const selectedRows = values.filter(d => rowPassesGlobalFilters(d, filter));
          const avgUtci =
            selectedRows.length === 0
              ? NaN
              : aggregateCellStatistic(selectedRows.map(d => d.utci), heatmapCellStatistic);
          const comfortRatio =
            selectedRows.length === 0
              ? 0
              : aggregateCellStatistic(selectedRows.map(d => d.isComfortable), heatmapCellStatistic);
          const month = values[0].month;
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            utci: avgUtci,
            utciCategory: Number.isFinite(avgUtci) ? getUtciCategoryForValue(avgUtci) : 'no thermal stress',
            isComfortable: comfortRatio,
            label: `W${week + 1}`,
            tooltip: !Number.isFinite(avgUtci)
              ? `Week ${week + 1}\nNo hours in dry-bulb band`
              : colorMode === 'comfortTime'
                ? `Week ${week + 1} Avg\nComfort Time: ${(comfortRatio * 100).toFixed(1)}%\nUTCI: ${convertUtci(avgUtci).toFixed(1)}${utciUnit}`
                : `Week ${week + 1} Avg\nUTCI: ${convertUtci(avgUtci).toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(avgUtci)}`
          });
        });
      });
    } else {
      // day or hour
      heatmapData = currentData.map(d => {
        const pass = rowPassesGlobalFilters(d, filter);
        const utciVal = pass ? d.utci : NaN;
        return {
          x0: d.dayOfYear,
          x1: d.dayOfYear + 1,
          y: d.hour,
          month: d.month,
          utci: utciVal,
          utciCategory: pass ? d.utciCategory : 'no thermal stress',
          isComfortable: pass ? d.isComfortable : 0,
          label: d.date.toLocaleDateString(),
          tooltip: !pass
            ? `${d.date.toLocaleString()}\nOutside dry-bulb band`
            : colorMode === 'comfortTime'
              ? `${d.date.toLocaleString()}\nComfortable: ${d.isComfortable ? 'Yes' : 'No'}\nUTCI: ${convertUtci(d.utci).toFixed(1)}${utciUnit}`
              : `${d.date.toLocaleString()}\nUTCI: ${convertUtci(d.utci).toFixed(1)}${utciUnit}\n${d.utciCategory}`
        };
      });
    }

    const { cellGapPx, cellInnerHeightPx, rowInnerHeight, hourRowTop, hourRowCenter } =
      explorerHeatmapRowLayout(heatmapBodyHeight);
    const minDayCellWidth = innerWidth / 366;
    const overlayMinWidth = Math.max(12, minDayCellWidth * 1.1, cellInnerHeightPx * 0.75);
    const heatmapHourAxisPx = Math.max(5, Math.min(9, cellInnerHeightPx * 0.33));
    const heatmapMonthAxisPx = Math.max(7, Math.min(11, Math.min(innerWidth / 26, cellInnerHeightPx * 0.45)));
    const overlayFontMonthPx = Math.max(6, Math.min(12, Math.min(cellInnerHeightPx * 0.4, innerWidth / 22)));
    const overlayFontWeekPx = Math.max(5, Math.min(10, overlayFontMonthPx * 0.82));

    const heatmapCellsG = heatmapG.append("g").attr("transform", `translate(0, ${monthAxisBand})`);

    const cells = heatmapCellsG.selectAll(".heatmap-cell-group")
      .data(heatmapData)
      .join("g")
      .attr("class", "heatmap-cell-group")
      .attr("transform", d => {
        const xp = explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1);
        return `translate(${xp.x}, ${hourRowTop(d.y)})`;
      });

    cells.append("rect")
      .attr("width", d =>
        explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width
      )
      .attr("height", d => rowInnerHeight(d.y))
      .attr("rx", 2) // Smaller corner radius
      .attr("ry", 2)
      .style("fill", d => {
        if (!Number.isFinite(d.utci)) return emptyUtciFill;
        if (colorMode === 'categories') {
          return UTCI_COLORS[d.utciCategory] || '#cccccc';
        } else {
          return colorScale(colorMode === 'comfortTime' ? d.isComfortable : d.utci);
        }
      })
      .style("stroke", aggregation === 'month' || aggregation === 'week' ? 'rgba(0,0,0,0.1)' : 'none')
      .style("stroke-width", "1px")
      .style("opacity", d => heatmapCellOpacity(d.month, d.y))
      .append("title")
      .text(d => d.tooltip);

    // Overlay text for month and week aggregations if cells are large enough
    if (aggregation === 'month' || aggregation === 'week') {
      cells.append("text")
        .attr("x", d => explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width / 2 - 0.5)
        .attr("y", d => rowInnerHeight(d.y) / 2 - 0.5)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .style("fill", heatmapTextColor)
        .style("font-size", `${aggregation === 'month' ? overlayFontMonthPx : overlayFontWeekPx}px`)
        .style("font-weight", "500")
        .style("pointer-events", "none")
        .style("opacity", d => heatmapCellOpacity(d.month, d.y))
        // Only show text if the cell is wide enough
        .text(d => {
          if (
            explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width <=
            overlayMinWidth
          )
            return "";
          if (!Number.isFinite(d.utci)) return "";
          return colorMode === 'comfortTime'
            ? `${Math.round(d.isComfortable * 100)}%`
            : `${Math.round(convertUtci(d.utci))}`;
        });
    }

    // Add bounding box for the selected region
    if (filter.startMonth > 1 || filter.endMonth < 12 || filter.startHour > 0 || filter.endHour < 23) {
      const startDay = data.find(d => d.month === filter.startMonth)?.dayOfYear || 1;
      const endDayData = [...data].reverse().find(d => d.month === filter.endMonth);
      const endDay = endDayData ? endDayData.dayOfYear + 1 : 366;

      {
        const span = explorerHeatmapSpanXPx(innerWidth, startDay, endDay);
        heatmapCellsG.append("rect")
        .attr("x", span.x)
        .attr("y", hourRowTop(filter.startHour))
        .attr("width", span.width)
        .attr("height", hourRowTop(filter.endHour + 1) - hourRowTop(filter.startHour))
        .attr("fill", "none")
        .attr("stroke", "#1f2937") // Dark grey
        .attr("stroke-width", 3)
        .attr("rx", 2)
        .attr("ry", 2)
        .style("pointer-events", "none");
      }
    }

    if (focusPeriod) {
      const focusBounds = utciPeriodHeatmapBounds(data, focusPeriod, filter);
      if (focusBounds) {
        const span = explorerHeatmapSpanXPx(innerWidth, focusBounds.startDay, focusBounds.endDay);
        heatmapCellsG
          .append("rect")
          .attr("x", span.x)
          .attr("y", hourRowTop(focusBounds.startHour))
          .attr("width", span.width)
          .attr("height", hourRowTop(focusBounds.endHour + 1) - hourRowTop(focusBounds.startHour))
          .attr("fill", "none")
          .attr("stroke", "#1f2937")
          .attr("stroke-width", 3)
          .attr("rx", 2)
          .attr("ry", 2)
          .style("pointer-events", "none");
      }
    }

    const formatHourRow = (h: number) => {
      if (h === 0) return "12 AM";
      if (h === 12) return "12 PM";
      if (h < 12) return `${h} AM`;
      return `${h - 12} PM`;
    };
    heatmapCellsG.append("g")
      .attr("class", "heatmap-hour-labels")
      .attr("pointer-events", "none")
      .selectAll("text")
      .data(d3.range(0, 24))
      .join("text")
      .attr("x", -4)
      .attr("y", h => hourRowCenter(h))
      .attr("dominant-baseline", "middle")
      .attr("text-anchor", "end")
      .style("fill", heatmapTextColor)
      .style("font-weight", "500")
      .style("font-size", `${heatmapHourAxisPx}px`)
      .text(h => formatHourRow(h));

    const isSelected = (d: UtciDataRow) => {
      if (!rowPassesGlobalFilters(d, filter)) return false;
      if (!focusPeriod) return true;
      return rowMatchesUtciComfortPeriod(d, focusPeriod, filter);
    };

    // Aggregate data
    let aggregatedData: { x0: number, x1: number, valueAll: number, valueSelected: number | null, comfortRatioAll: number, comfortRatioSelected: number | null, minSelected?: number, maxSelected?: number, month: number }[] = [];
    
    if (aggregation === 'hour') {
      aggregatedData = currentData.map(d => {
        const selected = isSelected(d);
        const val = convertUtci(d.utci);
        return {
          x0: d.dayOfYear + d.hour / 24,
          x1: d.dayOfYear + (d.hour + 1) / 24,
          valueAll: val,
          valueSelected: selected ? val : null,
          comfortRatioAll: d.isComfortable,
          comfortRatioSelected: selected ? d.isComfortable : null,
          minSelected: selected ? val : undefined,
          maxSelected: selected ? val : undefined,
          month: d.month
        };
      });
    } else if (aggregation === 'day') {
      const days = d3.group(currentData, d => d.dayOfYear);
      aggregatedData = Array.from(days, ([day, values]) => {
        const selectedValues = values.filter(isSelected);
        return {
          x0: day,
          x1: day + 1,
          valueAll: convertUtci(d3.mean(values, d => d.utci) || 0),
          valueSelected: selectedValues.length > 0 ? convertUtci(d3.mean(selectedValues, d => d.utci) || 0) : null,
          comfortRatioAll: d3.mean(values, d => d.isComfortable) || 0,
          comfortRatioSelected: selectedValues.length > 0 ? (d3.mean(selectedValues, d => d.isComfortable) || 0) : null,
          minSelected: selectedValues.length > 0 ? convertUtci(d3.min(selectedValues, d => d.utci) || 0) : undefined,
          maxSelected: selectedValues.length > 0 ? convertUtci(d3.max(selectedValues, d => d.utci) || 0) : undefined,
          month: values[0].month
        };
      });
    } else if (aggregation === 'week') {
      const weeks = d3.group(currentData, d => Math.floor((d.dayOfYear - 1) / 7));
      aggregatedData = Array.from(weeks, ([week, values]) => {
        const selectedValues = values.filter(isSelected);
        return {
          x0: week * 7 + 1,
          x1: Math.min((week + 1) * 7 + 1, 366),
          valueAll: convertUtci(d3.mean(values, d => d.utci) || 0),
          valueSelected: selectedValues.length > 0 ? convertUtci(d3.mean(selectedValues, d => d.utci) || 0) : null,
          comfortRatioAll: d3.mean(values, d => d.isComfortable) || 0,
          comfortRatioSelected: selectedValues.length > 0 ? (d3.mean(selectedValues, d => d.isComfortable) || 0) : null,
          minSelected: selectedValues.length > 0 ? convertUtci(d3.min(selectedValues, d => d.utci) || 0) : undefined,
          maxSelected: selectedValues.length > 0 ? convertUtci(d3.max(selectedValues, d => d.utci) || 0) : undefined,
          month: values[0].month
        };
      });
    } else { // month
      const months = d3.group(currentData, d => d.month);
      aggregatedData = Array.from(months, ([month, values]) => {
        const startDay = values[0].dayOfYear;
        const endDay = values[values.length - 1].dayOfYear + 1;
        const selectedValues = values.filter(isSelected);
        return {
          x0: startDay,
          x1: endDay,
          valueAll: convertUtci(d3.mean(values, d => d.utci) || 0),
          valueSelected: selectedValues.length > 0 ? convertUtci(d3.mean(selectedValues, d => d.utci) || 0) : null,
          comfortRatioAll: d3.mean(values, d => d.isComfortable) || 0,
          comfortRatioSelected: selectedValues.length > 0 ? (d3.mean(selectedValues, d => d.isComfortable) || 0) : null,
          minSelected: selectedValues.length > 0 ? convertUtci(d3.min(selectedValues, d => d.utci) || 0) : null,
          maxSelected: selectedValues.length > 0 ? convertUtci(d3.max(selectedValues, d => d.utci) || 0) : null,
          month: month
        };
      });
    }

    // Y Scale for Bar Chart
    const yMin = colorMode === 'comfortTime' ? 0 : (d3.min(aggregatedData, d => Math.min(d.valueAll, d.minSelected ?? d.valueAll)) || 0);
    const yMax = colorMode === 'comfortTime' ? 1 : (d3.max(aggregatedData, d => Math.max(d.valueAll, d.maxSelected ?? d.valueAll)) || convertUtci(40));

    const yScaleBar = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([barChartHeight, 0])
      .nice();

    barChartG.append("g")
      .attr("class", "explorer-bar-grid")
      .attr("pointer-events", "none")
      .selectAll("line")
      .data(yScaleBar.ticks(5))
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", d => yScaleBar(d))
      .attr("y2", d => yScaleBar(d))
      .attr("stroke", explorerBarGridStroke(theme))
      .attr("stroke-width", 1);

    const getFillColor = (val: number, comfortRatio: number) => {
      const metricValue = unitSystem === 'imperial' ? (val - 32) * 5/9 : val;
      if (colorMode === 'categories') {
        return utciCategoryScale(metricValue);
      } else {
        return colorScale(colorMode === 'comfortTime' ? comfortRatio : metricValue);
      }
    };

    const chartBarFill =
      barChartFillMode === 'gradient' && !(showDifference && compareData)
        ? colorMode === 'comfortTime'
          ? createExplorerChartValueGradient(svgDefs, r => getFillColor(0, r), 0, 1, v => yScaleBar(v), {
              id: barGradientSvgId,
            })
          : createExplorerChartValueGradient(
              svgDefs,
              v => getFillColor(v, 0),
              convertUtci(utciMin),
              convertUtci(utciMax),
              v => yScaleBar(v),
              { id: barGradientSvgId }
            )
        : null;

    // Draw foreground elements (Selected Data)
    const fgGroups = barChartG.selectAll(".fg-group")
      .data(aggregatedData.filter(d => d.valueSelected !== null))
      .join("g")
      .attr("class", "fg-group");

    fgGroups.each(function(d) {
      const group = d3.select(this);
      const barW = Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4));
      const xPos = xScale(d.x0);

      if (colorMode === 'comfortTime') {
        const yHi = yScaleBar(d.comfortRatioSelected!);
        const yLo = yScaleBar(0);
        const topY = Math.min(yHi, yLo);
        const barH = Math.max(1, Math.abs(yLo - yHi));
        const pillR = Math.min(barW / 2, barH / 2);
        const ratio = d.comfortRatioSelected ?? 0;
        const comfortFill =
          chartBarFill ??
          getFillColor(
            0,
            explorerBarStatisticY(heatmapCellStatistic, {
              valueSelected: ratio,
              minSelected: 0,
              maxSelected: ratio,
            })
          );
        group.append("rect")
          .attr("x", xPos)
          .attr("y", topY)
          .attr("width", barW)
          .attr("height", barH)
          .style("fill", comfortFill)
          .attr("rx", pillR)
          .attr("ry", pillR);
      } else {
        // Bar from min to max
        const val = d.valueSelected!;
        const minVal = d.minSelected !== undefined && d.minSelected !== null ? d.minSelected : val;
        const maxVal = d.maxSelected !== undefined && d.maxSelected !== null ? d.maxSelected : val;
        const yMinPx = yScaleBar(minVal);
        const yMaxPx = yScaleBar(maxVal);
        const topY = Math.min(yMinPx, yMaxPx);
        const barH = Math.max(1, Math.abs(yMinPx - yMaxPx));
        const pillR = Math.min(barW / 2, barH / 2);

        const barFillVal = explorerBarStatisticY(heatmapCellStatistic, {
          valueSelected: val,
          minSelected: minVal,
          maxSelected: maxVal,
        });
        group.append("rect")
          .attr("x", xPos)
          .attr("y", topY)
          .attr("width", barW)
          .attr("height", barH)
          .style("fill", chartBarFill ?? getFillColor(barFillVal, d.comfortRatioSelected!))
          .style("opacity", 0.6)
          .attr("rx", pillR)
          .attr("ry", pillR);

        // Average Indicator Circle
        group.append("circle")
          .attr("cx", xPos + barW / 2)
          .attr("cy", yScaleBar(val))
          .attr("r", Math.min(barW / 2, 4))
          .style("fill", getFillColor(val, d.comfortRatioSelected!))
          .style("stroke", "#000000")
          .style("stroke-width", "1px");
      }
    });

    fgGroups.append("title")
      .text(d => {
        const metricValue = unitSystem === 'imperial' ? (d.valueSelected! - 32) * 5/9 : d.valueSelected!;
        if (colorMode === 'comfortTime') {
          return `Selected Hours Comfort Time: ${(d.comfortRatioSelected! * 100).toFixed(1)}%`;
        } else {
          return `Selected Hours Avg UTCI: ${d.valueSelected!.toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(metricValue)}`;
        }
      });

    // Y Axis for Bar Chart
    const yAxisBar = d3.axisLeft(yScaleBar).ticks(5)
      .tickFormat(d => colorMode === 'comfortTime' ? `${(d as number) * 100}%` : `${d}${utciUnit}`);
      
    barChartG.append("g")
      .call(yAxisBar)
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll(".tick text").style("fill", heatmapTextColor).style("font-weight", "500").style("font-size", `${heatmapMonthAxisPx}px`));

    // Zero line for UTCI values
    if (colorMode !== 'comfortTime') {
      barChartG.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", yScaleBar(0))
        .attr("y2", yScaleBar(0))
        .attr("stroke", theme === 'dark' ? '#6b7280' : '#4b5563')
        .attr("stroke-width", '2px')
        .attr("stroke-opacity", 0.5);
    }

    const monthCenters = explorerMonthLabelCenterDays();
    heatmapG.append("g")
      .attr("class", "explorer-month-labels")
      .attr("pointer-events", "none")
      .selectAll("text")
      .data(
        EXPLORER_MONTH_LABELS_SHORT.map((label, i) => ({
          label,
          cx: monthCenters[i]!,
        }))
      )
      .join("text")
      .attr("x", d => explorerHeatmapXOfDay(innerWidth, d.cx))
      .attr("y", monthAxisBand / 2)
      .attr("dominant-baseline", "middle")
      .attr("text-anchor", "middle")
      .style("fill", heatmapTextColor)
      .style("font-weight", "500")
      .style("font-size", `${heatmapMonthAxisPx}px`)
      .text(d => d.label);

    
    if (title) {
         g.append("text")
          .attr("x", -margin.left + 4)
          .attr("y", -margin.top + 16)
          .style("font-size", "12px")
          .style("font-weight", "bold")
          .style("fill", heatmapTextColor)
          .text(title);
    }
  };

  if (stackedComparison && compareData && compareSvgRef.current) {
      renderUtci(svgRef.current, utciData, "Baseline Local Dataset", false);
      renderUtci(compareSvgRef.current, compareUtciData, "Comparative Dataset", true);
  } else {
      renderUtci(svgRef.current, utciData, null, false);
  }
  }, [
    utciData,
    compareUtciData,
    compareData,
    data,
    showDifference,
    aggregation,
    colorMode,
    gradientId,
    gradients,
    filter,
    dimensions.width,
    unitSystem,
    heatmapTextColor,
    theme,
    utciMin,
    utciMax,
    heatmapCellStatistic,
    includeSun,
    includeWind,
    tutorialEnabled,
    tutorialFocusPeriodId,
    barGradientSvgId,
    barChartFillMode,
  ]);

  // Calculate local stats for filtered data
  const stats = (() => {
    const focusPeriod =
      tutorialEnabled && tutorialFocusPeriodId
        ? getUtciComfortPeriodById(tutorialFocusPeriodId)
        : undefined;
    const filteredData = utciData.filter(d =>
      focusPeriod
        ? rowMatchesUtciComfortPeriod(d, focusPeriod, filter)
        : rowPassesGlobalFilters(d, filter)
    );

    if (showDifference && compareData) {
      const diffs = filteredData.map(d => {
        const idx = data.indexOf(d);
        const cD = compareData[idx];
        if (!cD) return null;
        
        const getUtci = (row: EPWDataRow) => {
          const tdb = (row.dryBulbTemperature as number) || 0;
          const rh = (row.relativeHumidity as number) || 50;
          const windSpeed = (row.windSpeed as number) || 0;
          const ghr = (row.globalHorizontalRadiation as number) || 0;
          const v_wind = includeWind ? Math.max(0.5, windSpeed) : 0.5;
          const tr = includeSun ? tdb + (0.02 * ghr) : tdb;
          try {
            const result = tc.models.utci(tdb, tr, v_wind, rh, 'SI', true, false);
            return isNaN(result.utci) ? tdb : result.utci;
          } catch (e) { return tdb; }
        };

        return getUtci(cD) - getUtci(d);
      }).filter(v => v !== null) as number[];

      return {
        avg: convertUtci(d3.mean(diffs) || 0),
        min: convertUtci(d3.min(diffs) || 0),
        max: convertUtci(d3.max(diffs) || 0),
        count: diffs.length,
        comfortRatio: 0, // Not applicable for diff
        categoryPercentages: [] // Not applicable for diff
      };
    }

    const categoryCounts = d3.rollup(filteredData, v => v.length, d => d.utciCategory);
    const categoryPercentages = Array.from(categoryCounts).map(([category, count]) => ({
      category,
      percentage: (count / filteredData.length) * 100,
      color: UTCI_COLORS[category] || '#cccccc'
    })).sort((a, b) => {
      // Sort by stress level (cold to hot)
      const order = Object.keys(UTCI_COLORS);
      return order.indexOf(a.category) - order.indexOf(b.category);
    });

    return {
      avg: convertUtci(d3.mean(filteredData, d => d.utci) || 0),
      min: convertUtci(d3.min(filteredData, d => d.utci) || 0),
      max: convertUtci(d3.max(filteredData, d => d.utci) || 0),
      total: convertUtci(d3.sum(filteredData, d => d.utci) || 0),
      count: filteredData.length,
      comfortRatio: d3.mean(filteredData, d => d.isComfortable) || 0,
      categoryPercentages
    };
  })();

  return (
    <div 
      ref={outerRef}
      className={`group w-full h-full min-h-0 flex flex-col relative transition-colors duration-300 ${
        exportMode ? 'bg-white' : (theme === 'dark' ? 'bg-gray-800' : 'bg-white')
      }`}
      
    >
      {(exportMode || !pairSuppressHeader) && (
      <div className={`flex flex-col ${exportMode ? '' : 'border-b'} ${
        exportMode ? 'bg-white' : (theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white')
      } ${CHART_TOOLBAR_HEADER_PAD}`}>
        <div className="flex min-w-0 flex-col overflow-visible">
          {exportMode ? (
            <div className={`${CHART_TOOLBAR_EXPORT_ROW_CLASS} min-w-0`}>
              <ChartTypeMenu
                value="utci"
                label="UTCI Comfort"
                onChange={() => {}}
                theme="light"
                display="icon"
                staticIcon
              />
              <ExportHeaderCaption
                lines={[
                  {
                    short: `Outdoor Comfort (${utciUnit})`,
                    long: `Outdoor Comfort \u00B7 UTCI (${utciUnit})`,
                  },
                ]}
              />
              {exposureIndicators}
            </div>
          ) : comparePane === 'secondary' ? (
            <>
              <div
                className={`mb-1.5 rounded-lg border px-1.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide ${
                  theme === 'dark'
                    ? 'border-orange-800/60 bg-orange-950/45 text-orange-100'
                    : 'border-orange-200 bg-orange-50 text-orange-900'
                }`}
              >
                Comparison \u00B7 {paneCity ?? '\u2014'}
              </div>
              <div className={chartToolbarRevealClass}>
                <div className="pt-1">
                  <AggregationToolbar
                    value={aggregation}
                    onChange={setAggregation}
                    theme={theme}
                    tutorialPeriodIdPrefix={tutorialChromeAnchors ? 'tutorial-card-aggregation' : undefined}
                    trailing={
                      <>
                        <button
                          type="button"
                          id={tutorialChromeAnchors ? 'tutorial-card-stats' : undefined}
                          onClick={() => setShowStats(!showStats)}
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
                            showStats
                              ? theme === 'dark'
                                ? 'bg-blue-900/40 text-blue-400'
                                : 'bg-blue-50 text-blue-600'
                              : theme === 'dark'
                                ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                                : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                          }`}
                          title="Statistics"
                        >
                          Stats
                        </button>
                        <button
                          type="button"
                          id={tutorialChromeAnchors ? 'tutorial-card-settings' : undefined}
                          onClick={() => setShowSettings(!showSettings)}
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${
                            showSettings
                              ? theme === 'dark'
                                ? 'bg-blue-900/40 text-blue-400'
                                : 'bg-blue-50 text-blue-600'
                              : theme === 'dark'
                                ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                                : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                          }`}
                          title="Chart settings"
                        >
                          <Settings2 className="h-3 w-3" />
                        </button>
                      </>
                    }
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {comparePane === 'primary' && paneCity && (
                <div
                  className={`mb-1.5 rounded-lg border px-1.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide ${
                    theme === 'dark'
                      ? 'border-blue-800/60 bg-blue-950/45 text-blue-100'
                      : 'border-blue-200 bg-blue-50 text-blue-900'
                  }`}
                >
                  Baseline \u00B7 {paneCity}
                </div>
              )}
              <div className={`${CHART_TOOLBAR_ROW_CLASS} w-full`}>
                <div className={CHART_TOOLBAR_CONTROLS_CLASS}>
                  <ChartTypeMenu
                    value="utci"
                    label="UTCI Comfort"
                    onChange={t => onChangeType?.(t)}
                    theme={theme}
                    disabled={!onChangeType}
                    display="icon"
                    tutorialAnchorId={tutorialChromeAnchors ? 'tutorial-card-chart-type' : undefined}
                    discoverPulse={!!tutorialChromeAnchors}
                  />
                  <span
                    id={tutorialChromeAnchors ? 'tutorial-card-data-control' : undefined}
                    className={chartToolbarTitleClass(theme)}
                    title={`Outdoor Comfort \u00B7 ${utciLegendTitle}`}
                  >
                    Outdoor Comfort \u00B7 {utciLegendTitle}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {exposureIndicators}
                {onRemove && (
                  <div className={removeBtnRevealClass}>
                    <button
                      type="button"
                      onClick={onRemove}
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-0 shadow-hard-sm transition-colors ${theme === 'dark' ? 'text-gray-400 hover:bg-red-900/30 hover:text-red-400' : 'text-gray-400 hover:bg-red-50 hover:text-red-500'}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                </div>
              </div>
              <div className={chartToolbarRevealClass}>
                <div className="pt-1">
                  <AggregationToolbar
                    value={aggregation}
                    onChange={setAggregation}
                    theme={theme}
                    tutorialPeriodIdPrefix={tutorialChromeAnchors ? 'tutorial-card-aggregation' : undefined}
                    trailing={
                      <>
                        <button
                          type="button"
                          id={tutorialChromeAnchors ? 'tutorial-card-stats' : undefined}
                          onClick={() => setShowStats(!showStats)}
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
                            showStats
                              ? theme === 'dark'
                                ? 'bg-blue-900/40 text-blue-400'
                                : 'bg-blue-50 text-blue-600'
                              : theme === 'dark'
                                ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                                : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                          }`}
                          title="Statistics"
                        >
                          Stats
                        </button>
                        <button
                          type="button"
                          id={tutorialChromeAnchors ? 'tutorial-card-settings' : undefined}
                          onClick={() => setShowSettings(!showSettings)}
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${
                            showSettings
                              ? theme === 'dark'
                                ? 'bg-blue-900/40 text-blue-400'
                                : 'bg-blue-50 text-blue-600'
                              : theme === 'dark'
                                ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                                : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                          }`}
                          title="Chart settings"
                        >
                          <Settings2 className="h-3 w-3" />
                        </button>
                      </>
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      )}

      <CardModal
        open={showStatsModal}
        onClose={() => setShowStats(false)}
        title="Comfort statistics"
        theme={theme}
        anchorRef={outerRef as any}
        maxWidthPx={520}
      >
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Average UTCI</div>
            <div className={`text-base font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.avg.toFixed(1)} {utciUnit}</div>
          </div>
          <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Comfort ratio</div>
            <div className="text-base font-medium" style={{ color: OUTDOOR_COMFORT_GREEN_HEX }}>{(stats.comfortRatio * 100).toFixed(1)}%</div>
          </div>
          <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Min / Max</div>
            <div className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.min.toFixed(1)} / {stats.max.toFixed(1)} {utciUnit}</div>
          </div>
          <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Samples</div>
            <div className={`text-base font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.count}</div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Stress category breakdown</h4>
          <div className="space-y-1.5">
            {stats.categoryPercentages.map(cat => (
              <div key={cat.category} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className={`capitalize ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{cat.category}</span>
                  <span className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>{cat.percentage.toFixed(1)}%</span>
                </div>
                <div className={`h-1.5 w-full rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div
                    className="h-full rounded-full"
                    style={{ backgroundColor: UTCI_COLORS[cat.category], width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardModal>

      <CardModal
        open={showSettingsModal}
        onClose={() => setShowSettings(false)}
        title="UTCI chart settings"
        theme={theme}
        anchorRef={outerRef as any}
        maxWidthPx={520}
      >
        <div className="grid grid-cols-1 gap-3">
          <p className={`text-xs leading-snug ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            Sun and wind are toggled with the icons on the chart header.
          </p>
          <div className="space-y-2">
            <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Visualization Mode</label>
            <select
              value={colorMode}
              onChange={e => setColorMode(e.target.value as any)}
              className={`w-full rounded-full border p-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
              }`}
            >
              <option value="comfortTime">Time in comfort zone</option>
              <option value="categories">Stress categories</option>
              <option value="gradient">Temperature gradient</option>
            </select>
          </div>
          {colorMode === 'gradient' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Color Palette</label>
                <button
                  type="button"
                  onClick={() => setShowGradientModal(true)}
                  className="text-[10px] font-bold uppercase tracking-tight text-blue-500 hover:text-blue-600"
                >
                  + Create
                </button>
              </div>
              <div className={`flex overflow-x-auto rounded-lg border p-1.5 ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'}`}>
                {paletteGradients.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGradientId(g.id)}
                    className={`mx-1 h-8 w-8 flex-shrink-0 rounded-full border-2 transition-all ${
                      gradientId === g.id ? 'scale-110 border-blue-500 shadow-sm' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: `linear-gradient(to right, ${g.colors.join(', ')})` }}
                    title={g.name}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

      </CardModal>

      {!pairSuppressFooterLegend && (
        <div
          id={tutorialLegendDomId}
          className={`${EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS} min-w-0`}
        >
          {showDifference && compareData ? (
            <InteractiveLegend
              variable={{
                id: 'utci',
                name: 'UTCI',
                unit: utciUnit,
                min: convertUtci(utciMin),
                max: convertUtci(utciMax),
                category: 'Comfort',
              }}
              gradientId={gradientId}
              setGradientId={setGradientId}
              gradients={gradients}
              theme={theme}
              fontScale={LEGEND_STRIP_SCALE}
              isDifference={true}
              footnote={utciLegendFootnote}
            />
          ) : colorMode === 'categories' ? (
            <>
              <UtciCategoryLegendStrip theme={theme} />
              <p
                className="m-0 mt-0.5 text-[9px] leading-snug font-normal text-gray-400 dark:text-gray-500"
              >
                {utciLegendFootnote}
              </p>
            </>
          ) : colorMode === 'gradient' ? (
            <InteractiveLegend
              variable={{
                id: 'utci',
                name: 'UTCI',
                unit: utciUnit,
                min: convertUtci(utciMin),
                max: convertUtci(utciMax),
                category: 'Comfort',
              }}
              gradientId={gradientId}
              setGradientId={setGradientId}
              gradients={gradients}
              theme={theme}
              fontScale={LEGEND_STRIP_SCALE}
              footnote={utciLegendFootnote}
            />
          ) : (
            <>
              <UtciComfortTimeLegendStrip theme={theme} />
              <p
                className="m-0 mt-0.5 text-[9px] leading-snug font-normal text-gray-400 dark:text-gray-500"
              >
                {utciLegendFootnote}
              </p>
            </>
          )}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden px-1 py-0.5">
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          <svg
            ref={svgRef}
            className="block h-full w-full max-h-full max-w-full"
            preserveAspectRatio={pairSuppressFooterLegend ? 'xMidYMax meet' : 'xMidYMid meet'}
          />
        </div>

      </div>
    </div>
  );
}
