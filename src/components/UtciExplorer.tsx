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
import {
  InteractiveLegend,
  GradientDef,
  LEGEND_BAR_CLASS,
  LEGEND_FOOTNOTE_CLASS,
  LEGEND_IN_BAR_LABEL_CLASS,
  LEGEND_WRAP_CLASS,
  legendContrastInk,
  legendInkShadow,
} from './InteractiveLegend';
import { AggregationToolbar } from './AggregationToolbar';
import type { ChartType, CompareUtciSharedControls } from '../App';
import { UnitSystem } from '../App';
import { UNIT_C, UNIT_F, utciGradientExtentC } from '../lib/unitConversion';
import { formatEpwStationDate, formatEpwStationDateTime, formatEpwStationHour } from '../lib/formatEpwStationClock';

import type { BarChartFillMode, GlobalFilterState, HeatmapCellStatistic } from '../lib/globalFilter';
import {
  aggregateCellStatistic,
  explorerBarStatisticY,
  globalFilterDaySegments,
  hourFilterIsPartial,
  hourInWrappedRange,
  hourRangeOutlineSegments,
  monthFilterIsPartial,
  monthInRange,
  rowPassesGlobalFilters,
} from '../lib/globalFilter';
import { ChartTypeMenu } from './ChartTypeMenu';
import {
  CHART_TOOLBAR_CONTROLS_CLASS,
  CHART_TOOLBAR_EXPORT_ROW_CLASS,
  CHART_TOOLBAR_HEADER_PAD,
  CHART_TOOLBAR_ROW_CLASS,
  chartToolbarTitleClass,
  chartToolbarChipButtonClass,
  chartToolbarRoundButtonClass,
  CHART_TOOLBAR_SETTINGS_GLYPH_CLASS,
  comparePaneLabelClass,
  chartToolbarRevealClassFor,
  chartToolbarRemoveButtonClass,
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
  explorerBarPath,
  explorerBarSitsOnBaseline,
  explorerHeatmapCellXPx,
  explorerHeatmapHeightPx,
  explorerHeatmapSpanXPx,
  explorerHeatmapXOfDay,
  explorerMonthLabelCenterDays,
  explorerSvgHeightPx,
  EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS,
  explorerSvgTypography,
  fitHeatmapCellLabels,
} from '../lib/explorerChartSvgLayout';
import { HEATMAP_CELL_FONT_WEIGHT, chartAxisInk, heatmapCellInk } from '../lib/chartInk';
import { epwEquivalentHourKey, indexEpwByEquivalentHour } from '../lib/epwClockMatch';
import { useExplorerSvgFrame } from '../hooks/useSvgRenderScale';
import {
  getUtciCategoryForValue,
  getUtciComfortPeriodById,
  heatmapCellFocusDaySpans,
  computeUtciForEpwRow,
  rowMatchesUtciComfortPeriod,
  summarizeUtciCellScenarios,
  UTCI_COLORS,
  utciPeriodHeatmapBounds,
} from '../lib/utciModel';
import {
  UtciCellScenarioModal,
  type UtciCellInspectPayload,
} from './UtciCellScenarioModal';

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
  /** EPW site latitude — flips astronomical seasons for the Southern Hemisphere. */
  siteLatitude?: number | null;
}

// Create a continuous color scale for UTCI categories
const UTCI_THRESHOLDS = [-40, -27, -13, 0, 9, 26, 32, 38, 46, 50];
const UTCI_COLOR_VALUES = Object.values(UTCI_COLORS);

function heatmapStatisticLabel(stat: HeatmapCellStatistic): string {
  if (stat === 'low') return 'Low';
  if (stat === 'high') return 'High';
  return 'Ave';
}

function openUtciCellInspect(args: {
  rows: EPWDataRow[];
  title: string;
  aggregation: 'hour' | 'day' | 'week' | 'month';
  statistic: HeatmapCellStatistic;
  setInspect: (p: UtciCellInspectPayload | null) => void;
}) {
  const { rows, title, aggregation, statistic, setInspect } = args;
  if (!rows.length) return;
  const scenarios = summarizeUtciCellScenarios(rows, statistic);
  const hourCount = scenarios[0]?.hourCount ?? rows.length;
  const aggWord =
    aggregation === 'month'
      ? 'Monthly'
      : aggregation === 'week'
        ? 'Weekly'
        : aggregation === 'day'
          ? 'Daily'
          : 'Hourly';
  const subtitle =
    aggregation === 'hour' || hourCount <= 1
      ? `${aggWord} cell · ${heatmapStatisticLabel(statistic)} feels-like for this hour`
      : `${aggWord} cell · ${heatmapStatisticLabel(statistic)} feels-like across ${hourCount} hours in this box`;
  setInspect({ title, subtitle, scenarios });
}

const utciCategoryScale = d3.scaleLinear<string>()
  .domain(UTCI_THRESHOLDS)
  .range(UTCI_COLOR_VALUES)
  .interpolate(d3.interpolateRgb);

/** Same as `DataExplorer` bar fill opacity on colored rects. */
const LEGEND_FILL_OPACITY = 0.6;

/** Comfort green deepened enough to read as text on white (the fill hex is too light for labels). */
const COMFORT_LABEL_INK_LIGHT = '#2d8f16';

const LEGEND_STRIP_CAPTION_CLASS =
  'relative h-3 w-full text-[10px] font-semibold uppercase leading-none tracking-wide @lg:h-3.5 @lg:text-[11px]';

export function UtciCategoryLegendStrip({ theme }: { theme: 'light' | 'dark' }) {
  const cats = Object.keys(UTCI_COLORS);
  const catColors = cats.map(k => UTCI_COLORS[k]);
  const comfortIdx = cats.indexOf('no thermal stress');
  const comfortCenterPct = ((comfortIdx + 0.5) / cats.length) * 100;
  const endInk = theme === 'dark' ? 'text-gray-300' : 'text-gray-600';

  return (
    <div className={`${LEGEND_WRAP_CLASS} ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
      <div className={LEGEND_BAR_CLASS}>
        <div className="absolute inset-0" style={{ backgroundColor: theme === 'dark' ? '#111827' : '#ffffff' }} />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, ${catColors.join(', ')})`,
            opacity: LEGEND_FILL_OPACITY,
          }}
        />
      </div>
      <div className={LEGEND_STRIP_CAPTION_CLASS}>
        <span className={`absolute left-1 top-0 max-w-[34%] truncate ${endInk}`}>Extreme cold</span>
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-bold"
          style={{
            left: `${comfortCenterPct}%`,
            color: theme === 'dark' ? OUTDOOR_COMFORT_GREEN_HEX : COMFORT_LABEL_INK_LIGHT,
          }}
        >
          Comfort
        </span>
        <span className={`absolute right-1 top-0 max-w-[34%] truncate text-right ${endInk}`}>Extreme heat</span>
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
  const leftBg = leftColor ?? (theme === 'dark' ? '#1f2937' : '#ffffff');
  const rightBg = highColor;

  return (
    <div className={`${LEGEND_WRAP_CLASS} ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
      <div
        className={LEGEND_BAR_CLASS}
        style={{ background: `linear-gradient(to right, ${leftBg}, ${rightBg})` }}
      >
        {(['0%', '100%'] as const).map((label) => {
          const isLeft = label === '0%';
          const fg = legendContrastInk(isLeft ? leftBg : rightBg);
          return (
            <span
              key={label}
              className={`absolute top-1/2 -translate-y-1/2 ${LEGEND_IN_BAR_LABEL_CLASS}`}
              style={{
                left: isLeft ? 8 : undefined,
                right: !isLeft ? 8 : undefined,
                fontSize: 'var(--legend-label)',
                color: fg,
                textShadow: legendInkShadow(fg),
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
  siteLatitude = null,
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

  const [cellInspect, setCellInspect] = useState<UtciCellInspectPayload | null>(null);
  const setCellInspectRef = useRef(setCellInspect);
  setCellInspectRef.current = setCellInspect;

  const showStatsModal = showStats && (!pairSuppressHeader || pairModalHost);
  const showSettingsModal = showSettings && (!pairSuppressHeader || pairModalHost);
  const paletteGradients = useMemo(() => gradientsForUtci(gradients), [gradients]);

  const utciLegendFootnote = useMemo(() => {
    if (showDifference && compareData) {
      return 'Compare lines: baseline vs comparison; shading shows the gap.';
    }
    if (colorMode === 'comfortTime') {
      return 'Bars: comfort-time share per period (filtered).';
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
  const chartToolbarRevealClass = chartToolbarRevealClassFor(expandChromeStrip);
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
  // Keep chart UTCI (12×24 + bars) in sync with guided matrix exposure picks — not only when the
  // period row changes (same period + different sun/wind was previously ignored).
  useEffect(() => {
    if (!tutorialEnabled || utciShared) return;
    if (tutorialExposureSun === undefined && tutorialExposureWind === undefined) return;
    if (tutorialExposureSun !== undefined) setIncludeSun(tutorialExposureSun);
    if (tutorialExposureWind !== undefined) setIncludeWind(tutorialExposureWind);
  }, [
    tutorialEnabled,
    utciShared,
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
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          active
            ? kind === 'sun'
              ? exposureTheme === 'dark'
                ? 'bg-amber-950/50 hover:bg-amber-900/60'
                : 'bg-amber-100 hover:bg-amber-200'
              : exposureTheme === 'dark'
                ? 'bg-sky-950/50 hover:bg-sky-900/60'
                : 'bg-sky-100 hover:bg-sky-200'
            : exposureTheme === 'dark'
              ? 'bg-gray-800/40 hover:bg-gray-700/50'
              : 'bg-gray-100 hover:bg-gray-200'
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
  const { renderScale, svgHeight } = useExplorerSvgFrame(svgRef);

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
      const computed = computeUtciForEpwRow(d, { includeSun, includeWind });
      return {
        ...d,
        utci: computed?.utci ?? NaN,
        utciCategory: computed?.category ?? '',
        isComfortable: computed ? (computed.isComfortable ? 1 : 0) : NaN,
      };
    });
  }, [data, includeSun, includeWind]);

  const compareUtciData: UtciDataRow[] = useMemo(() => {
    return (compareData || []).map(d => {
      const computed = computeUtciForEpwRow(d, { includeSun, includeWind });
      return {
        ...d,
        utci: computed?.utci ?? NaN,
        utciCategory: computed?.category ?? '',
        isComfortable: computed ? (computed.isComfortable ? 1 : 0) : NaN,
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
        const compareByHour = indexEpwByEquivalentHour(compareData);
        const utciOf = (row: EPWDataRow) =>
          computeUtciForEpwRow(row, { includeSun, includeWind })?.utci;
        const diffs: number[] = [];
        for (const row of data) {
          const compareRow = compareByHour.get(epwEquivalentHourKey(row));
          const primary = utciOf(row);
          const compare = compareRow ? utciOf(compareRow) : undefined;
          if (primary == null || compare == null) continue;
          diffs.push(compare - primary);
        }
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
    const compareByHour = compareData ? indexEpwByEquivalentHour(compareData) : null;

    const renderUtci = (svgEl: any, currentData: any[], title: string | null, isCompare: boolean) => {
    if (!currentData || !currentData.length) return;

    const focusPeriod =
      !isCompare && tutorialEnabled && tutorialFocusPeriodId
        ? getUtciComfortPeriodById(tutorialFocusPeriodId)
        : undefined;

    const heatmapCellInGlobal = (month: number, hour: number) => {
      return (
        monthInRange(month, filter.startMonth, filter.endMonth) &&
        hourInWrappedRange(hour, filter.startHour, filter.endHour)
      );
    };

    /** Opacity for a cell day-span `[x0,x1)` — bright only where it hits the focused season. */
    const heatmapCellOpacity = (month: number, hour: number, x0: number, x1: number) => {
      if (!heatmapCellInGlobal(month, hour)) return 0.2;
      if (!focusPeriod) return 1;
      return heatmapCellFocusDaySpans(x0, x1, hour, focusPeriod, filter, siteLatitude).length > 0
        ? 1
        : 0.28;
    };

    const width = EXPLORER_SVG_BASE_WIDTH;
    const margin = EXPLORER_SVG_MARGIN;
    const innerWidth = explorerInnerWidth();
    const barChartHeight = explorerBarChartHeightPx(svgHeight);
    const monthAxisBand = EXPLORER_MONTH_AXIS_BAND_PX;
    const heatmapBodyHeight = explorerHeatmapHeightPx(svgHeight);
    const height = explorerSvgHeightPx(svgHeight);

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

    const rowInFocusPeriod = (row: UtciDataRow) =>
      focusPeriod
        ? rowMatchesUtciComfortPeriod(row, focusPeriod, filter, siteLatitude)
        : rowPassesGlobalFilters(row, filter);

    const aggregateUtciCellRows = (selectedRows: UtciDataRow[]) => {
      let avgUtciVal: number;
      let comfortRatio: number;
      if (selectedRows.length === 0) {
        avgUtciVal = NaN;
        comfortRatio = 0;
      } else if (showDifference && compareData) {
        const primaryStat = aggregateCellStatistic(
          selectedRows.map(d => d.utci),
          heatmapCellStatistic
        );
        const compareValues = selectedRows
          .map(v => {
            const cD = compareByHour?.get(epwEquivalentHourKey(v));
            if (!cD) return null;
            return computeUtciForEpwRow(cD, { includeSun, includeWind })?.utci ?? null;
          })
          .filter((v): v is number => v != null);
        const compareStat = aggregateCellStatistic(compareValues, heatmapCellStatistic);
        avgUtciVal = compareStat - primaryStat;
        comfortRatio = 0;
      } else {
        avgUtciVal = aggregateCellStatistic(
          selectedRows.map(d => d.utci),
          heatmapCellStatistic
        );
        comfortRatio = aggregateCellStatistic(
          selectedRows.map(d => d.isComfortable),
          heatmapCellStatistic
        );
      }
      return { avgUtciVal, comfortRatio };
    };

    /** Contiguous day-of-year runs (end exclusive) for splitting month/week cells on season edges. */
    const contiguousDayRuns = (rows: UtciDataRow[]): { x0: number; x1: number; rows: UtciDataRow[] }[] => {
      if (!rows.length) return [];
      const byDay = d3.group(rows, d => d.dayOfYear as number);
      const days = Array.from(byDay.keys()).sort((a, b) => a - b);
      const runs: { x0: number; x1: number; rows: UtciDataRow[] }[] = [];
      let x0 = days[0];
      let x1 = days[0] + 1;
      let runRows: UtciDataRow[] = [...(byDay.get(days[0]) ?? [])];
      for (let i = 1; i < days.length; i++) {
        if (days[i] === x1) {
          x1 = days[i] + 1;
          runRows.push(...(byDay.get(days[i]) ?? []));
        } else {
          runs.push({ x0, x1, rows: runRows });
          x0 = days[i];
          x1 = days[i] + 1;
          runRows = [...(byDay.get(days[i]) ?? [])];
        }
      }
      runs.push({ x0, x1, rows: runRows });
      return runs;
    };

    const pushHeatmapCell = (opts: {
      x0: number;
      x1: number;
      hour: number;
      month: number;
      label: string;
      cellTitle: string;
      selectedRows: UtciDataRow[];
      tooltipPrefix: string;
    }) => {
      const { avgUtciVal, comfortRatio } = aggregateUtciCellRows(opts.selectedRows);
      heatmapData.push({
        x0: opts.x0,
        x1: opts.x1,
        y: opts.hour,
        month: opts.month,
        utci: avgUtciVal,
        utciCategory: Number.isFinite(avgUtciVal)
          ? getUtciCategoryForValue(avgUtciVal)
          : 'no thermal stress',
        isComfortable: comfortRatio,
        label: opts.label,
        cellRows: opts.selectedRows,
        cellTitle: opts.cellTitle,
        tooltip: !Number.isFinite(avgUtciVal)
          ? `${opts.tooltipPrefix}\nNo hours in dry-bulb band`
          : colorMode === 'comfortTime'
            ? `${opts.tooltipPrefix} Avg\nComfort Time: ${(comfortRatio * 100).toFixed(1)}%\nUTCI: ${convertUtci(avgUtciVal).toFixed(1)}${utciUnit}`
            : `${opts.tooltipPrefix} Avg\nUTCI: ${convertUtci(avgUtciVal).toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(avgUtciVal)}`,
      });
    };

    /**
     * When a seasonal focus is active, split month/week cells at astronomical
     * boundaries so visual isolation matches Dec 21–Mar 20 (etc.), not whole months.
     */
    const pushSplitOrWholeCell = (opts: {
      values: UtciDataRow[];
      hour: number;
      month: number;
      label: string;
      cellTitle: string;
      tooltipPrefix: string;
      wholeX0: number;
      wholeX1: number;
    }) => {
      const inGlobal = opts.values.filter(d => rowPassesGlobalFilters(d, filter));
      if (!focusPeriod || focusPeriod.season === 'all') {
        pushHeatmapCell({
          x0: opts.wholeX0,
          x1: opts.wholeX1,
          hour: opts.hour,
          month: opts.month,
          label: opts.label,
          cellTitle: opts.cellTitle,
          selectedRows: inGlobal,
          tooltipPrefix: opts.tooltipPrefix,
        });
        return;
      }

      const inFocus = inGlobal.filter(rowInFocusPeriod);
      const outFocus = inGlobal.filter(d => !rowInFocusPeriod(d));
      for (const run of contiguousDayRuns(outFocus)) {
        pushHeatmapCell({
          x0: run.x0,
          x1: run.x1,
          hour: opts.hour,
          month: opts.month,
          label: opts.label,
          cellTitle: opts.cellTitle,
          selectedRows: run.rows,
          tooltipPrefix: opts.tooltipPrefix,
        });
      }
      for (const run of contiguousDayRuns(inFocus)) {
        pushHeatmapCell({
          x0: run.x0,
          x1: run.x1,
          hour: opts.hour,
          month: opts.month,
          label: opts.label,
          cellTitle: opts.cellTitle,
          selectedRows: run.rows,
          tooltipPrefix: opts.tooltipPrefix,
        });
      }
      // Month/hour with no rows after filters — keep a dim placeholder span
      if (!inGlobal.length) {
        pushHeatmapCell({
          x0: opts.wholeX0,
          x1: opts.wholeX1,
          hour: opts.hour,
          month: opts.month,
          label: opts.label,
          cellTitle: opts.cellTitle,
          selectedRows: [],
          tooltipPrefix: opts.tooltipPrefix,
        });
      }
    };

    if (aggregation === 'month') {
      const groups = d3.group(currentData, d => d.month, d => d.hour);
      Array.from(groups).forEach(([month, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = values[0].dayOfYear;
          const endDay = values[values.length - 1].dayOfYear + 1;
          pushSplitOrWholeCell({
            values,
            hour,
            month,
            label: `${monthNames[month - 1]}`,
            cellTitle: `${monthNames[month - 1]} · ${formatEpwStationHour(hour)}`,
            tooltipPrefix: `${monthNames[month - 1]} ${formatEpwStationHour(hour)}`,
            wholeX0: startDay,
            wholeX1: endDay,
          });
        });
      });
    } else if (aggregation === 'week') {
      const groups = d3.group(currentData, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      Array.from(groups).forEach(([week, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = week * 7 + 1;
          const endDay = Math.min((week + 1) * 7 + 1, 366);
          const month = values[0].month;
          pushSplitOrWholeCell({
            values,
            hour,
            month,
            label: `W${week + 1}`,
            cellTitle: `Week ${week + 1} · ${formatEpwStationHour(hour)}`,
            tooltipPrefix: `Week ${week + 1} ${formatEpwStationHour(hour)}`,
            wholeX0: startDay,
            wholeX1: endDay,
          });
        });
      });
    } else {
      // day or hour — keep all globally filtered hours; dim those outside the focus season
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
          label: formatEpwStationDate(d),
          cellRows: pass ? [d] : [],
          cellTitle: formatEpwStationDateTime(d),
          tooltip: !pass
            ? `${formatEpwStationDateTime(d)}\nOutside dry-bulb band`
            : !Number.isFinite(d.utci)
              ? `${formatEpwStationDateTime(d)}\nUTCI could not be calculated (outside the model range)`
            : colorMode === 'comfortTime'
              ? `${formatEpwStationDateTime(d)}\nComfortable: ${d.isComfortable ? 'Yes' : 'No'}\nUTCI: ${convertUtci(d.utci).toFixed(1)}${utciUnit}`
              : `${formatEpwStationDateTime(d)}\nUTCI: ${convertUtci(d.utci).toFixed(1)}${utciUnit}\n${d.utciCategory}`,
        };
      });
    }

    const { cellGapPx, cellInnerHeightPx, rowInnerHeight, hourRowTop, hourRowCenter } =
      explorerHeatmapRowLayout(heatmapBodyHeight);
    const minDayCellWidth = innerWidth / 366;
    const overlayMinWidth = Math.max(12, minDayCellWidth * 1.1, cellInnerHeightPx * 0.75);
    const type = explorerSvgTypography(renderScale, cellInnerHeightPx);
    const axisInk = chartAxisInk(heatmapTextColor, theme);
    const utciCellFill = (d: any): string => {
      if (!Number.isFinite(d.utci)) return emptyUtciFill;
      if (colorMode === 'categories') return UTCI_COLORS[d.utciCategory] || '#cccccc';
      return colorScale(colorMode === 'comfortTime' ? d.isComfortable : d.utci);
    };

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
      .attr("rx", 2)
      .attr("ry", 2)
      .style("fill", utciCellFill)
      .style("opacity", d => heatmapCellOpacity(d.month, d.y, d.x0, d.x1))
      .style("cursor", d =>
        !showDifference && Array.isArray(d.cellRows) && d.cellRows.length > 0 ? 'pointer' : 'default'
      )
      .on("click", (_event, d) => {
        if (showDifference && compareData) return;
        const rows = d.cellRows as EPWDataRow[] | undefined;
        if (!rows?.length) return;
        openUtciCellInspect({
          rows,
          title: d.cellTitle || d.label || 'Selected cell',
          aggregation,
          statistic: heatmapCellStatistic,
          setInspect: setCellInspectRef.current,
        });
      })
      .append("title")
      .text(d =>
        !showDifference && Array.isArray(d.cellRows) && d.cellRows.length > 0
          ? `${d.tooltip}\nClick to compare protection scenarios`
          : d.tooltip
      );

    // Overlay text for month and week aggregations if cells are large enough
    if ((aggregation === 'month' || aggregation === 'week') && type.showCellValues) {
      const cellLabels = cells.append("text")
        .attr("x", d => explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width / 2)
        .attr("y", d => rowInnerHeight(d.y) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .style("fill", heatmapCellInk(heatmapTextColor))
        .style("font-size", `${type.cellValuePx}px`)
        .style("font-weight", HEATMAP_CELL_FONT_WEIGHT)
        .style("pointer-events", "none")
        .style("opacity", d => heatmapCellOpacity(d.month, d.y, d.x0, d.x1))
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
      fitHeatmapCellLabels(
        cellLabels,
        d => explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width,
        type.cellValuePx,
        renderScale
      );
    }

    // Bounding box(es) for the selected region (supports month/hour wrap)
    if (monthFilterIsPartial(filter) || hourFilterIsPartial(filter)) {
      const hourSegments = hourRangeOutlineSegments(filter.startHour, filter.endHour);
      for (const daySeg of globalFilterDaySegments(data, filter)) {
        const span = explorerHeatmapSpanXPx(innerWidth, daySeg.startDay, daySeg.endDay);
        for (const hourSeg of hourSegments) {
          heatmapCellsG
            .append('rect')
            .attr('x', span.x)
            .attr('y', hourRowTop(hourSeg.startHour))
            .attr('width', span.width)
            .attr('height', hourRowTop(hourSeg.endHourExclusive) - hourRowTop(hourSeg.startHour))
            .attr('fill', 'none')
            .attr('stroke', '#1f2937')
            .attr('stroke-width', 3)
            .attr('rx', 2)
            .attr('ry', 2)
            .style('pointer-events', 'none');
        }
      }
    }

    if (focusPeriod) {
      const focusBounds = utciPeriodHeatmapBounds(data, focusPeriod, filter, siteLatitude);
      if (focusBounds) {
        for (const seg of focusBounds.segments) {
          const span = explorerHeatmapSpanXPx(innerWidth, seg.startDay, seg.endDay);
          for (const hourSeg of focusBounds.hourSegments) {
            heatmapCellsG
              .append('rect')
              .attr('x', span.x)
              .attr('y', hourRowTop(hourSeg.startHour))
              .attr('width', span.width)
              .attr('height', hourRowTop(hourSeg.endHourExclusive) - hourRowTop(hourSeg.startHour))
              .attr('fill', 'none')
              .attr('stroke', '#1f2937')
              .attr('stroke-width', 3)
              .attr('rx', 2)
              .attr('ry', 2)
              .style('pointer-events', 'none');
          }
        }
      }
    }

    const formatHourRow = (h: number) => formatEpwStationHour(h);
    heatmapCellsG.append("g")
      .attr("class", "heatmap-hour-labels")
      .attr("pointer-events", "none")
      .selectAll("text")
      .data(d3.range(0, 24, type.hourStride))
      .join("text")
      .attr("x", -5)
      .attr("y", h => hourRowCenter(h))
      .attr("dominant-baseline", "middle")
      .attr("text-anchor", "end")
      .style("fill", axisInk)
      .style("font-weight", "500")
      .style("font-size", `${type.hourPx}px`)
      .text(h => formatHourRow(h));

    const isSelected = (d: UtciDataRow) => {
      if (!rowPassesGlobalFilters(d, filter)) return false;
      if (!focusPeriod) return true;
      return rowMatchesUtciComfortPeriod(d, focusPeriod, filter, siteLatitude);
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
        const baselinePx = yScaleBar.range()[0];
        group.append("path")
          .attr("d", explorerBarPath(xPos, topY, barW, barH, pillR, explorerBarSitsOnBaseline(topY + barH, baselinePx)))
          .style("fill", comfortFill);
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
        const baselinePx = yScaleBar.range()[0];
        group.append("path")
          .attr("d", explorerBarPath(xPos, topY, barW, barH, pillR, explorerBarSitsOnBaseline(topY + barH, baselinePx)))
          .style("fill", chartBarFill ?? getFillColor(barFillVal, d.comfortRatioSelected!))
          .style("opacity", 0.6);

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
      .call(g => g.selectAll(".tick text").style("fill", axisInk).style("font-weight", "500").style("font-size", `${type.axisPx}px`));

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
      .style("fill", axisInk)
      .style("font-weight", "600")
      .style("font-size", `${type.monthPx}px`)
      .text(d => d.label);

    
    if (title) {
         g.append("text")
          .attr("x", -margin.left + 4)
          .attr("y", -margin.top + 16)
          .style("font-size", `${type.axisPx}px`)
          .style("font-weight", "bold")
          .style("fill", axisInk)
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
    renderScale,
    svgHeight,
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
    siteLatitude,
  ]);

  // Calculate local stats for filtered data
  const stats = (() => {
    const focusPeriod =
      tutorialEnabled && tutorialFocusPeriodId
        ? getUtciComfortPeriodById(tutorialFocusPeriodId)
        : undefined;
    const filteredData = utciData.filter(d =>
      focusPeriod
        ? rowMatchesUtciComfortPeriod(d, focusPeriod, filter, siteLatitude)
        : rowPassesGlobalFilters(d, filter)
    );

    if (showDifference && compareData) {
      const compareByHour = indexEpwByEquivalentHour(compareData);
      const utciOf = (row: EPWDataRow) => computeUtciForEpwRow(row, { includeSun, includeWind })?.utci;
      const diffs = filteredData.map(d => {
        const cD = compareByHour.get(epwEquivalentHourKey(d));
        if (!cD) return null;
        const primary = utciOf(d);
        const compare = utciOf(cD);
        if (primary == null || compare == null) return null;
        return compare - primary;
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
      <div className={`flex flex-col ${
        exportMode ? 'bg-white' : (theme === 'dark' ? 'bg-gray-800' : 'bg-white')
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
                className={comparePaneLabelClass(theme, 'baseline')}
              >
                Comparison · {paneCity ?? '\u2014'}
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
                          className={chartToolbarChipButtonClass(theme, showStats, 'blue')}
                          title="Statistics"
                        >
                          Stats
                        </button>
                        <button
                          type="button"
                          id={tutorialChromeAnchors ? 'tutorial-card-settings' : undefined}
                          onClick={() => setShowSettings(!showSettings)}
                          className={chartToolbarRoundButtonClass(theme, showSettings, 'blue')}
                          title="Chart settings"
                        >
                          <Settings2 className={CHART_TOOLBAR_SETTINGS_GLYPH_CLASS} />
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
                  className={comparePaneLabelClass(theme, 'baseline')}
                >
                  Baseline · {paneCity}
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
                    <span className="min-w-0 truncate">
                      Outdoor Comfort<span className="hidden @sm:inline"> · {utciLegendTitle}</span>
                    </span>
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {exposureIndicators}
                {onRemove && (
                  <div className={removeBtnRevealClass}>
                    <button
                      type="button"
                      onClick={onRemove}
                      className={chartToolbarRemoveButtonClass(theme)}
                      title="Remove chart"
                    >
                      <X className="h-4 w-4" />
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
                          className={chartToolbarChipButtonClass(theme, showStats, 'blue')}
                          title="Statistics"
                        >
                          Stats
                        </button>
                        <button
                          type="button"
                          id={tutorialChromeAnchors ? 'tutorial-card-settings' : undefined}
                          onClick={() => setShowSettings(!showSettings)}
                          className={chartToolbarRoundButtonClass(theme, showSettings, 'blue')}
                          title="Chart settings"
                        >
                          <Settings2 className={CHART_TOOLBAR_SETTINGS_GLYPH_CLASS} />
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
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Average UTCI</div>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.avg.toFixed(1)} {utciUnit}</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Comfort ratio</div>
            <div className="text-base font-medium" style={{ color: OUTDOOR_COMFORT_GREEN_HEX }}>{(stats.comfortRatio * 100).toFixed(1)}%</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Min / Max</div>
            <div className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.min.toFixed(1)} / {stats.max.toFixed(1)} {utciUnit}</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Samples</div>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.count}</div>
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
              className={`w-full rounded-full border-0 px-3.5 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 ${
                theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'
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
                  className={`text-[11px] font-bold uppercase tracking-tight ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}
                >
                  + Create
                </button>
              </div>
              <div className={`flex overflow-x-auto rounded-full p-1.5 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                {paletteGradients.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGradientId(g.id)}
                    className={`mx-1 h-8 w-8 flex-shrink-0 rounded-full transition-all ${
                      gradientId === g.id ? 'scale-110 shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_0_14px_rgba(59,130,246,0.6)]' : 'opacity-85 hover:scale-105 hover:opacity-100'
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

      <UtciCellScenarioModal
        open={!!cellInspect}
        onClose={() => setCellInspect(null)}
        theme={theme}
        unitSystem={unitSystem}
        payload={cellInspect}
        activeIncludeSun={includeSun}
        activeIncludeWind={includeWind}
        anchorRef={outerRef}
      />

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

              isDifference={true}
              footnote={utciLegendFootnote}
            />
          ) : colorMode === 'categories' ? (
            <>
              <UtciCategoryLegendStrip theme={theme} />
              <p className={LEGEND_FOOTNOTE_CLASS} title={utciLegendFootnote}>
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

              footnote={utciLegendFootnote}
            />
          ) : (
            <>
              <UtciComfortTimeLegendStrip theme={theme} />
              <p className={LEGEND_FOOTNOTE_CLASS} title={utciLegendFootnote}>
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
