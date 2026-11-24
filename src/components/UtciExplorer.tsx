import React, { useEffect, useId, useRef, useState, useMemo } from 'react';
import { useIsMobileMaxSm } from '../hooks/useIsMobileMaxSm';
import { useTutorialLiveOptional } from '../context/TutorialLiveContext';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { EPWDataRow, type EPWMetadata } from '../lib/epwParser';
import { appendExposedOnlyIcons } from '../lib/exposureMapIcons';
import {
  GROUND_METHOD_SUMMARY,
  GROUND_PRESETS,
  nearestReflectancePreset,
  reflectanceLikeness,
  buildSurfaceTemperatureLookup,
  surfaceTemperatureForRow,
  realizeGround,
  type GroundSurface,
} from '../lib/groundComfort';
import {
  isSolarNightEpwStation,
  solarNightOverlayRgba,
  solarNightParamsFromHeatmapDatum,
} from '../lib/solarNightHeatmap';
// @ts-ignore
import tc from 'jsthermalcomfort';
import { Sun, Moon, Wind, Home, X, Settings2, Sparkles } from 'lucide-react';
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
  compareExplorerLineColors,
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
import { attachChartTooltip } from '../lib/chartTooltip';
import { epwEquivalentHourKey, indexEpwByEquivalentHour } from '../lib/epwClockMatch';
import { useExplorerSvgFrame } from '../hooks/useSvgRenderScale';
import {
  formatUtciCategoryLabel,
  formatUtciCategoryRange,
  getUtciCategoryForValue,
  getUtciComfortPeriodById,
  heatmapCellFocusDaySpans,
  computeUtciForEpwRow,
  dominantOptimizedScenarioId,
  pickOptimizedUtciExposure,
  rowMatchesUtciComfortPeriod,
  summarizeUtciCellScenarios,
  utciScenarioById,
  type UtciEnvironment,
  UTCI_COLORS,
  UTCI_EXPOSURE_SCENARIOS,
  utciPeriodHeatmapBounds,
  type UtciOptimizeView,
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
  /** Station lat/lng/timezone for solar night shading on the exposure map. */
  metadata?: EPWMetadata | null;
  /** Comparison city metadata so compareData uses its own coordinates, timezone, and surface temp. */
  compareMetadata?: EPWMetadata | null;
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
  winningScenarioId?: string | null;
  env?: UtciEnvironment;
}) {
  const { rows, title, aggregation, statistic, setInspect, winningScenarioId, env } = args;
  if (!rows.length) return;
  const scenarios = summarizeUtciCellScenarios(rows, statistic, env);
  const hourCount = scenarios.reduce((max, s) => Math.max(max, s.hourCount), 0);
  const aggWord =
    aggregation === 'month'
      ? 'Monthly'
      : aggregation === 'week'
        ? 'Weekly'
        : aggregation === 'day'
          ? 'Daily'
          : 'Hourly';
  const winner = utciScenarioById(winningScenarioId);
  const subtitleBase =
    aggregation === 'hour' || hourCount <= 1
      ? `${aggWord} cell · ${heatmapStatisticLabel(statistic)} feels-like for this hour`
      : `${aggWord} cell · ${heatmapStatisticLabel(statistic)} feels-like across ${hourCount} hours in this box`;
  const subtitle = winner
    ? `${subtitleBase} · Optimize usually picks ${winner.shortLabel}`
    : subtitleBase;
  setInspect({ title, subtitle, scenarios, winningScenarioId: winningScenarioId ?? null });
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
  /** Winning exposure id when Optimize is on. */
  bestScenarioId: string | null;
}

function ExposureLegendGlyph({ kind }: { kind: 'sun' | 'moon' | 'wind' | 'shelter' }) {
  const tone =
    kind === 'wind'
      ? 'text-sky-500'
      : kind === 'moon'
        ? 'text-indigo-400'
        : kind === 'shelter'
          ? 'text-slate-400'
          : 'text-amber-500';
  const Icon = kind === 'wind' ? Wind : kind === 'moon' ? Moon : kind === 'shelter' ? Home : Sun;
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center ${tone}`}>
      <Icon className="h-4 w-4 fill-current" strokeWidth={1.25} aria-hidden />
    </span>
  );
}

function UtciOptimizeScenarioLegend({ theme }: { theme: 'light' | 'dark' }) {
  const muted = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';
  const ink = theme === 'dark' ? 'text-gray-200' : 'text-gray-700';
  return (
    <div className={`flex flex-col gap-1 ${muted}`} aria-label="Optimized exposure legend">
      <p className={`m-0 text-[10px] font-medium leading-snug ${ink}`}>
        Icons mark what to leave exposed.
        {' '}
        <ExposureLegendGlyph kind="shelter" /> = sheltered.
        {' '}
        <ExposureLegendGlyph kind="moon" /> replaces sun at night.
      </p>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-medium leading-none">
        {UTCI_EXPOSURE_SCENARIOS.map(s => (
          <span key={s.id} className={`inline-flex items-center gap-0.5 ${ink}`}>
            {s.includeSun ? <ExposureLegendGlyph kind="sun" /> : null}
            {s.includeWind ? <ExposureLegendGlyph kind="wind" /> : null}
            {!s.includeSun && !s.includeWind ? <ExposureLegendGlyph kind="shelter" /> : null}
            <span className={muted}>{s.shortLabel}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export const UtciExplorer = React.memo(function UtciExplorer({
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
  metadata = null,
  compareMetadata = null,
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

  const [iOptimize, setIOptimize] = useState(false);
  const optimizeMode = utciShared?.optimizeMode ?? iOptimize;
  const setOptimizeMode = utciShared?.setOptimizeMode ?? setIOptimize;

  const [iOptimizeView, setIOptimizeView] = useState<UtciOptimizeView>('comfort');
  const optimizeView = utciShared?.optimizeView ?? iOptimizeView;
  const setOptimizeView = utciShared?.setOptimizeView ?? setIOptimizeView;
  const showExposureMap = optimizeMode && optimizeView === 'exposure' && !showDifference;

  const [iGround, setIGround] = useState<GroundSurface | null>(() =>
    realizeGround(GROUND_PRESETS.find(p => p.id === 'grass-dry') ?? GROUND_PRESETS[0])
  );
  const ground = utciShared?.ground ?? iGround;
  const setGround = utciShared?.setGround ?? setIGround;
  const [iRadiantMode, setIRadiantMode] = useState<'station' | 'reflectance'>('station');
  const radiantMode = utciShared?.radiantMode ?? iRadiantMode;
  const setRadiantMode = utciShared?.setRadiantMode ?? setIRadiantMode;
  const [iSurfaceHeat, setISurfaceHeat] = useState(false);
  const surfaceHeat = utciShared?.surfaceHeat ?? iSurfaceHeat;
  const setSurfaceHeat = utciShared?.setSurfaceHeat ?? setISurfaceHeat;
  const [showGroundNotes, setShowGroundNotes] = useState(false);

  const activeGround = useMemo(() => {
    const grass = GROUND_PRESETS.find(p => p.id === 'grass-dry') ?? GROUND_PRESETS[0];
    const selected = ground && ground.id !== 'ladybug' ? ground : grass;
    if (radiantMode !== 'reflectance' || !surfaceHeat) return selected;
    return realizeGround(
      selected.volumetricHeat
        ? selected
        : { ...grass, id: selected.id, label: selected.label, solarReflectance: selected.solarReflectance }
    );
  }, [radiantMode, ground, surfaceHeat]);

  const surfaceTempLookup = useMemo(() => {
    if (!surfaceHeat || radiantMode !== 'reflectance') return null;
    return {
      sun: buildSurfaceTemperatureLookup(data, activeGround, 'full'),
      shade: buildSurfaceTemperatureLookup(data, activeGround, 'diffuse'),
    };
  }, [surfaceHeat, radiantMode, data, activeGround]);

  const surfaceTempForRow = useMemo(() => {
    if (!surfaceTempLookup) return null;
    return (row: EPWDataRow, sunlitGround: boolean) =>
      surfaceTemperatureForRow(sunlitGround ? surfaceTempLookup.sun : surfaceTempLookup.shade, row);
  }, [surfaceTempLookup]);

  const compareSurfaceTempLookup = useMemo(() => {
    if (!surfaceHeat || radiantMode !== 'reflectance' || !compareData?.length) return null;
    return {
      sun: buildSurfaceTemperatureLookup(compareData, activeGround, 'full'),
      shade: buildSurfaceTemperatureLookup(compareData, activeGround, 'diffuse'),
    };
  }, [surfaceHeat, radiantMode, compareData, activeGround]);

  const compareSurfaceTempForRow = useMemo(() => {
    if (!compareSurfaceTempLookup) return null;
    return (row: EPWDataRow, sunlitGround: boolean) =>
      surfaceTemperatureForRow(
        sunlitGround ? compareSurfaceTempLookup.sun : compareSurfaceTempLookup.shade,
        row
      );
  }, [compareSurfaceTempLookup]);

  const utciSite = useMemo(() => {
    if (
      !metadata ||
      !Number.isFinite(metadata.lat) ||
      !Number.isFinite(metadata.lng) ||
      !Number.isFinite(metadata.timeZone)
    ) {
      return null;
    }
    return { lat: metadata.lat, lng: metadata.lng, timeZone: metadata.timeZone };
  }, [metadata]);

  const compareUtciSite = useMemo(() => {
    const m = compareMetadata ?? metadata;
    if (
      !m ||
      !Number.isFinite(m.lat) ||
      !Number.isFinite(m.lng) ||
      !Number.isFinite(m.timeZone)
    ) {
      return null;
    }
    return { lat: m.lat, lng: m.lng, timeZone: m.timeZone };
  }, [compareMetadata, metadata]);

  const utciEnv = useMemo<UtciEnvironment>(
    () => ({
      radiantMode,
      ground: activeGround,
      site: utciSite,
      surfaceTempForRow: radiantMode === 'reflectance' ? surfaceTempForRow : null,
    }),
    [radiantMode, activeGround, utciSite, surfaceTempForRow]
  );

  const compareUtciEnv = useMemo<UtciEnvironment>(
    () => ({
      radiantMode,
      ground: activeGround,
      site: compareUtciSite,
      surfaceTempForRow: radiantMode === 'reflectance' ? compareSurfaceTempForRow : null,
    }),
    [radiantMode, activeGround, compareUtciSite, compareSurfaceTempForRow]
  );

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
    const groundLine =
      radiantMode === 'station'
        ? 'Station procedure · weather-file sunlight and cloud cover.'
        : `ASHRAE-55 · ${(activeGround.solarReflectance * 100).toFixed(0)}% reflectance · ground at air temperature.`;
    const methodLine =
      surfaceHeat && radiantMode === 'reflectance'
        ? `ASHRAE-55 · ${activeGround.label} · ${(activeGround.solarReflectance * 100).toFixed(0)}% reflectance. Surface-temperature estimate · ${Math.round((activeGround.thicknessM ?? 0.05) * 100)} cm · irrigation ${Math.round((activeGround.irrigation ?? 0) * 100)}%.`
        : groundLine;
    if (showExposureMap) {
      return `Icons show what to leave exposed. ${methodLine}`;
    }
    if (optimizeMode) {
      return `Optimize uses the most comfortable sun/wind mix every hour. ${methodLine}`;
    }
    if (colorMode === 'comfortTime') {
      return methodLine;
    }
    if (colorMode === 'categories') {
      return `Strip: stress categories. ${methodLine}`;
    }
    if (aggregation !== 'hour') {
      return `Bars span hourly UTCI minimum to maximum. ${methodLine}`;
    }
    return methodLine;
  }, [aggregation, colorMode, showDifference, compareData, optimizeMode, showExposureMap, radiantMode, activeGround, surfaceHeat]);

  const isMobile = useIsMobileMaxSm();
  const expandChromeStrip = !exportMode && (tutorialChromeAnchors || isMobile);
  const chartToolbarRevealClass = chartToolbarRevealClassFor(expandChromeStrip, theme);
  const removeBtnRevealClass = isMobile
    ? 'pointer-events-auto opacity-100'
    : 'pointer-events-none opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100';
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
      optimizeMode,
      utciGroundLabel: radiantMode === 'reflectance' && surfaceHeat ? activeGround.label : null,
      utciGroundReflectance: activeGround.solarReflectance,
      utciGroundEmissivity: activeGround.emissivity,
      utciGroundEvaporates: surfaceHeat && (activeGround.irrigation ?? 0) > 0.02,
      utciGroundIrrigation: activeGround.irrigation ?? 0,
      utciGroundThicknessM: activeGround.thicknessM,
      utciGroundVolumetricHeat: activeGround.volumetricHeat,
      utciGroundConductivity: activeGround.conductivity,
      utciRadiantMode: radiantMode === 'reflectance' && surfaceHeat ? 'surface' : radiantMode,
    });
  }, [tutorialEnabled, tutorialReport, aggregation, colorMode, includeSun, includeWind, optimizeMode, activeGround, radiantMode, surfaceHeat]);

  const tutorialExposureSun = tutorialLive?.snapshot.includeSun;
  const tutorialExposureWind = tutorialLive?.snapshot.includeWind;
  const tutorialOptimizeMode = tutorialLive?.snapshot.optimizeMode;
  const tutorialFocusPeriodId = tutorialLive?.snapshot.utciFocusPeriodId;
  // Keep chart UTCI (12×24 + bars) in sync with guided matrix exposure picks — not only when the
  // period row changes (same period + different sun/wind was previously ignored).
  useEffect(() => {
    if (!tutorialEnabled || utciShared) return;
    if (
      tutorialExposureSun === undefined &&
      tutorialExposureWind === undefined &&
      tutorialOptimizeMode === undefined
    ) {
      return;
    }
    if (tutorialOptimizeMode !== undefined) setOptimizeMode(tutorialOptimizeMode);
    if (tutorialExposureSun !== undefined) setIncludeSun(tutorialExposureSun);
    if (tutorialExposureWind !== undefined) setIncludeWind(tutorialExposureWind);
  }, [
    tutorialEnabled,
    utciShared,
    tutorialExposureSun,
    tutorialExposureWind,
    tutorialOptimizeMode,
    setIncludeSun,
    setIncludeWind,
    setOptimizeMode,
  ]);

  const exposureTheme = exportMode ? 'light' : theme;

  const setOptimizeModeSafe = (next: boolean) => {
    setOptimizeMode(next);
    if (!next) setOptimizeView('comfort');
  };

  const exposureBadge = (kind: 'sun' | 'wind', active: boolean) => {
    const Icon = kind === 'sun' ? Sun : Wind;
    const locked = optimizeMode;
    const title = locked
      ? 'Optimize is on — turn it off to set sun/wind manually'
      : kind === 'sun'
        ? active
          ? radiantMode === 'station'
            ? 'Sun on, using the station procedure \u2014 click for shade'
            : 'Sun on the person and the ground \u2014 click for shade'
          : radiantMode === 'station'
            ? 'Shade: shaded-site sunlight, ground at the air temperature \u2014 click for sun'
            : 'Shade: direct sun and ground reflection off, diffuse sky remains \u2014 click for sun'
        : active
          ? 'Wind speed included \u2014 click to turn off'
          : 'Wind excluded (0.5 m/s) \u2014 click to turn on';
    const toggle = () => {
      if (locked) {
        setOptimizeModeSafe(false);
        return;
      }
      if (kind === 'sun') setIncludeSun(v => !v);
      else setIncludeWind(v => !v);
    };

    return (
      <button
        type="button"
        title={title}
        aria-pressed={active && !locked}
        aria-label={title}
        onClick={toggle}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          locked
            ? exposureTheme === 'dark'
              ? 'bg-gray-800/30 opacity-45'
              : 'bg-gray-100 opacity-45'
            : active
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
            locked
              ? exposureTheme === 'dark'
                ? 'text-gray-500'
                : 'text-gray-400'
              : active
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

  const optimizeToggle = (
    <button
      type="button"
      title={
        optimizeMode
          ? 'Optimize on — each hour uses its most comfortable sun/wind mix'
          : 'Optimize — pick the most comfortable exposure every hour'
      }
      aria-pressed={optimizeMode}
      aria-label="Optimize outdoor comfort exposure"
      onClick={() => setOptimizeModeSafe(!optimizeMode)}
      className={`inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
        optimizeMode
          ? exposureTheme === 'dark'
            ? 'bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/70'
            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
          : exposureTheme === 'dark'
            ? 'bg-gray-800/40 text-gray-400 hover:bg-gray-700/50'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      <span className="text-[10px] font-semibold leading-none tracking-tight">Opt</span>
    </button>
  );

  const optimizeViewToggle = optimizeMode ? (
    <div
      className={`inline-flex h-5 items-center rounded-full p-0.5 ${
        exposureTheme === 'dark' ? 'bg-gray-800/70' : 'bg-gray-100'
      }`}
      role="group"
      aria-label="Optimize chart view"
    >
      {(
        [
          { id: 'comfort' as const, label: 'Comfort', title: 'Show optimized comfort values' },
          { id: 'exposure' as const, label: 'Exposure', title: 'Show which exposure wins each cell' },
        ] as const
      ).map(opt => {
        const active = optimizeView === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            title={opt.title}
            aria-pressed={active}
            onClick={() => setOptimizeView(opt.id)}
            className={`rounded-full px-1.5 text-[10px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? exposureTheme === 'dark'
                  ? 'bg-gray-700 text-gray-100'
                  : 'bg-white text-gray-900 shadow-sm'
                : exposureTheme === 'dark'
                  ? 'text-gray-400 hover:text-gray-200'
                  : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  ) : null;

  const exposureIndicators = (
    <div className="flex shrink-0 items-center gap-1" aria-label="UTCI exposure inputs">
      {exposureBadge('sun', includeSun)}
      {exposureBadge('wind', includeWind)}
      <span
        className={`mx-0.5 h-3 w-px ${exposureTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}
        aria-hidden
      />
      {optimizeToggle}
      {optimizeViewToggle}
    </div>
  );

  const outerRef = useRef<HTMLDivElement>(null);
  const { renderScale, svgHeight } = useExplorerSvgFrame(svgRef);

  // Pre-calculate UTCI for all data points to avoid recalculating on every render/aggregation change
  const utciData: UtciDataRow[] = useMemo(() => {
    return data.map(d => {
      if (optimizeMode) {
        const pick = pickOptimizedUtciExposure(d, utciEnv);
        return {
          ...d,
          utci: pick?.utci ?? NaN,
          utciCategory: pick?.category ?? '',
          isComfortable: pick ? (pick.isComfortable ? 1 : 0) : NaN,
          bestScenarioId: pick?.scenario.id ?? null,
        };
      }
      const computed = computeUtciForEpwRow(d, { ...utciEnv, includeSun, includeWind });
      return {
        ...d,
        utci: computed?.utci ?? NaN,
        utciCategory: computed?.category ?? '',
        isComfortable: computed ? (computed.isComfortable ? 1 : 0) : NaN,
        bestScenarioId: null,
      };
    });
  }, [data, includeSun, includeWind, optimizeMode, utciEnv]);

  const compareUtciData: UtciDataRow[] = useMemo(() => {
    return (compareData || []).map(d => {
      if (optimizeMode) {
        const pick = pickOptimizedUtciExposure(d, compareUtciEnv);
        return {
          ...d,
          utci: pick?.utci ?? NaN,
          utciCategory: pick?.category ?? '',
          isComfortable: pick ? (pick.isComfortable ? 1 : 0) : NaN,
          bestScenarioId: pick?.scenario.id ?? null,
        };
      }
      const computed = computeUtciForEpwRow(d, { ...compareUtciEnv, includeSun, includeWind });
      return {
        ...d,
        utci: computed?.utci ?? NaN,
        utciCategory: computed?.category ?? '',
        isComfortable: computed ? (computed.isComfortable ? 1 : 0) : NaN,
        bestScenarioId: null,
      };
    });
  }, [compareData, includeSun, includeWind, optimizeMode, compareUtciEnv]);

  const isDiffMode = Boolean(showDifference && compareData);
  const convertUtciAbs = (val: number) =>
    unitSystem === 'imperial' ? (val * 9) / 5 + 32 : val;
  const convertUtciDelta = (val: number) =>
    unitSystem === 'imperial' ? (val * 9) / 5 : val;
  const convertUtci = (val: number) =>
    isDiffMode ? convertUtciDelta(val) : convertUtciAbs(val);
  const utciUnit = unitSystem === 'imperial' ? UNIT_F : UNIT_C;
  const utciLegendTitle =
    isDiffMode
      ? colorMode === 'comfortTime'
        ? '\u0394 Comfort time (%)'
        : `\u0394 UTCI (${utciUnit})`
      : showExposureMap
        ? 'Best exposure map'
        : optimizeMode
          ? colorMode === 'comfortTime'
            ? 'Optimized comfort time'
            : `Optimized UTCI (${utciUnit})`
          : colorMode === 'gradient'
            ? `UTCI (${utciUnit})`
            : colorMode === 'categories'
              ? 'Stress categories'
              : 'Time in comfort zone';

  const { utciMin, utciMax } = useMemo(() => {
    if (isDiffMode) {
      let maxDiff = 10;
      try {
        const cmpByHour = indexEpwByEquivalentHour(compareUtciData);
        const diffs: number[] = [];
        for (const row of utciData) {
          if (!Number.isFinite(row.utci)) continue;
          const cmpRow = cmpByHour.get(epwEquivalentHourKey(row));
          if (!cmpRow || !Number.isFinite(cmpRow.utci)) continue;
          diffs.push(cmpRow.utci - row.utci);
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
  }, [isDiffMode, utciData, compareUtciData]);

  useEffect(() => {
    if (!svgRef.current) return;
    const compareUtciByHour = isDiffMode ? indexEpwByEquivalentHour(compareUtciData) : null;

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
    if (isDiffMode) {
      colorScale =
        colorMode === 'comfortTime'
          ? (v: number) => differenceDivergingColor(v, -1, 1)
          : (v: number) => differenceDivergingColor(v, utciMin, utciMax);
    } else if (colorMode === 'categories') {
      colorScale = (v: number) => UTCI_COLORS[getUtciCategoryForValue(v)] || emptyUtciFill;
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

    const statLabel = heatmapStatisticLabel(heatmapCellStatistic);
    const meanFinite = (nums: number[]) => {
      const valid = nums.filter(x => Number.isFinite(x));
      return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
    };
    const signedStr = (n: number, digits = 1) =>
      `${n > 0 ? '+' : n < 0 ? '\u2212' : ''}${Math.abs(n).toFixed(digits)}`;

    const aggregateUtciCellRows = (selectedRows: UtciDataRow[]) => {
      let avgUtciVal: number;
      let comfortRatio: number;
      if (selectedRows.length === 0) {
        avgUtciVal = NaN;
        comfortRatio = NaN;
      } else if (isDiffMode) {
        const primUtci: number[] = [];
        const cmpUtci: number[] = [];
        const primComfort: number[] = [];
        const cmpComfort: number[] = [];
        for (const r of selectedRows) {
          if (!Number.isFinite(r.utci)) continue;
          const cD = compareUtciByHour?.get(epwEquivalentHourKey(r));
          if (!cD || !Number.isFinite(cD.utci)) continue;
          primUtci.push(r.utci);
          cmpUtci.push(cD.utci);
          primComfort.push(r.isComfortable);
          cmpComfort.push(cD.isComfortable);
        }
        const primaryStat = aggregateCellStatistic(primUtci, heatmapCellStatistic);
        const compareStat = aggregateCellStatistic(cmpUtci, heatmapCellStatistic);
        avgUtciVal =
          Number.isFinite(primaryStat) && Number.isFinite(compareStat)
            ? compareStat - primaryStat
            : NaN;
        const pComfort = meanFinite(primComfort);
        const cComfort = meanFinite(cmpComfort);
        comfortRatio =
          Number.isFinite(pComfort) && Number.isFinite(cComfort) ? cComfort - pComfort : NaN;
      } else {
        avgUtciVal = aggregateCellStatistic(
          selectedRows.map(d => d.utci),
          heatmapCellStatistic
        );
        // Comfort time is always the fraction of valid hours in comfort (never binary min/max 0%/100%).
        comfortRatio = meanFinite(selectedRows.map(d => d.isComfortable));
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
      const dominantId = optimizeMode
        ? dominantOptimizedScenarioId(opts.selectedRows.map(r => r.bestScenarioId))
        : null;
      const dominant = utciScenarioById(dominantId);
      const optimizeLine =
        optimizeMode && dominant
          ? `\nBest exposure: ${dominant.shortLabel} (${dominant.label})`
          : optimizeMode
            ? '\nBest exposure: —'
            : '';
      const mid =
        opts.selectedRows[Math.floor(opts.selectedRows.length / 2)] ?? opts.selectedRows[0];
      heatmapData.push({
        x0: opts.x0,
        x1: opts.x1,
        y: opts.hour,
        month: opts.month,
        utci: avgUtciVal,
        utciCategory: !isDiffMode && Number.isFinite(avgUtciVal)
          ? getUtciCategoryForValue(avgUtciVal)
          : '',
        isComfortable: comfortRatio,
        dominantScenarioId: dominantId,
        label: opts.label,
        cellRows: opts.selectedRows,
        cellTitle: opts.cellTitle,
        sunYear: mid?.year ?? 2000,
        sunMonth: aggregation === 'month' ? opts.month : (mid?.month ?? opts.month),
        sunDay: aggregation === 'month' ? 15 : (mid?.day ?? 15),
        sunHour: opts.hour,
        solarStandardClock: mid?.solarStandardClock,
        tooltip: !Number.isFinite(avgUtciVal)
          ? `${opts.tooltipPrefix}\n${
              opts.selectedRows.length === 0 && filter.temperatureMode !== 'off'
                ? 'No hours in dry-bulb band'
                : 'UTCI could not be calculated (outside the model range)'
            }`
          : isDiffMode
            ? colorMode === 'comfortTime'
              ? `${opts.tooltipPrefix} Diff\n\u0394 Comfort Time: ${signedStr(comfortRatio * 100, 1)} pts\n\u0394 UTCI (${statLabel}): ${signedStr(convertUtciDelta(avgUtciVal), 1)}${utciUnit}`
              : `${opts.tooltipPrefix} Diff (${statLabel})\n\u0394 UTCI: ${signedStr(convertUtciDelta(avgUtciVal), 1)}${utciUnit}`
            : colorMode === 'comfortTime'
              ? `${opts.tooltipPrefix} ${statLabel}\nComfort Time: ${(comfortRatio * 100).toFixed(1)}%\nUTCI: ${convertUtciAbs(avgUtciVal).toFixed(1)}${utciUnit}${optimizeLine}`
              : `${opts.tooltipPrefix} ${statLabel}\nUTCI: ${convertUtciAbs(avgUtciVal).toFixed(1)}${utciUnit}\n${getUtciCategoryForValue(avgUtciVal)}${optimizeLine}`,
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
        const cmpRow = isDiffMode ? compareUtciByHour?.get(epwEquivalentHourKey(d)) : undefined;
        const utciVal = !pass
          ? NaN
          : isDiffMode
            ? Number.isFinite(d.utci) && cmpRow && Number.isFinite(cmpRow.utci)
              ? cmpRow.utci - d.utci
              : NaN
            : d.utci;
        const comfortVal = !pass
          ? NaN
          : isDiffMode
            ? Number.isFinite(d.isComfortable) && cmpRow && Number.isFinite(cmpRow.isComfortable)
              ? cmpRow.isComfortable - d.isComfortable
              : NaN
            : d.isComfortable;
        const dominantId = pass && optimizeMode && !isDiffMode ? d.bestScenarioId : null;
        const dominant = utciScenarioById(dominantId);
        const optimizeLine =
          optimizeMode && !isDiffMode && dominant
            ? `\nBest exposure: ${dominant.shortLabel} (${dominant.label})`
            : optimizeMode && !isDiffMode
              ? '\nBest exposure: —'
              : '';
        return {
          x0: d.dayOfYear,
          x1: d.dayOfYear + 1,
          y: d.hour,
          month: d.month,
          utci: utciVal,
          utciCategory: pass && !isDiffMode ? d.utciCategory : '',
          isComfortable: comfortVal,
          dominantScenarioId: dominantId,
          label: formatEpwStationDate(d),
          cellRows: pass ? [d] : [],
          cellTitle: formatEpwStationDateTime(d),
          sunYear: d.year,
          sunMonth: d.month,
          sunDay: d.day,
          sunHour: d.hour,
          solarStandardClock: d.solarStandardClock,
          tooltip: !pass
            ? `${formatEpwStationDateTime(d)}\n${filter.temperatureMode !== 'off' ? 'Outside dry-bulb band' : 'Filtered out'}`
            : !Number.isFinite(utciVal)
              ? `${formatEpwStationDateTime(d)}\nUTCI could not be calculated (outside the model range)`
              : isDiffMode
                ? colorMode === 'comfortTime'
                  ? `${formatEpwStationDateTime(d)} Diff\n\u0394 Comfort: ${signedStr(comfortVal * 100, 0)} pts\n\u0394 UTCI: ${signedStr(convertUtciDelta(utciVal), 1)}${utciUnit}`
                  : `${formatEpwStationDateTime(d)} Diff\n\u0394 UTCI: ${signedStr(convertUtciDelta(utciVal), 1)}${utciUnit}`
                : colorMode === 'comfortTime'
                  ? `${formatEpwStationDateTime(d)}\nComfortable: ${d.isComfortable ? 'Yes' : 'No'}\nUTCI: ${convertUtciAbs(d.utci).toFixed(1)}${utciUnit}${optimizeLine}`
                  : `${formatEpwStationDateTime(d)}\nUTCI: ${convertUtciAbs(d.utci).toFixed(1)}${utciUnit}\n${d.utciCategory}${optimizeLine}`,
        };
      });
    }

    const { cellGapPx, cellInnerHeightPx, rowInnerHeight, hourRowTop, hourRowCenter } =
      explorerHeatmapRowLayout(heatmapBodyHeight);
    const minDayCellWidth = innerWidth / 366;
    const overlayMinWidth = Math.max(12, minDayCellWidth * 1.1, cellInnerHeightPx * 0.75);
    const type = explorerSvgTypography(renderScale, cellInnerHeightPx);
    const axisInk = chartAxisInk(heatmapTextColor, theme);
    const exposureCellFill = theme === 'dark' ? 'rgba(55,65,81,0.35)' : 'rgba(243,244,246,0.95)';
    const utciCellFill = (d: any): string => {
      if (showExposureMap) {
        return d.dominantScenarioId ? exposureCellFill : emptyUtciFill;
      }
      if (!Number.isFinite(d.utci)) return emptyUtciFill;
      if (isDiffMode) {
        return colorScale(colorMode === 'comfortTime' ? d.isComfortable : d.utci);
      }
      if (colorMode === 'categories') return UTCI_COLORS[d.utciCategory] || emptyUtciFill;
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

    const cellRects = cells.append("rect")
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
          winningScenarioId: optimizeMode ? d.dominantScenarioId ?? null : null,
          env: utciEnv,
        });
      });

    attachChartTooltip(
      cellRects,
      (d: any) => {
        const lines = String(d.tooltip ?? '').split('\n').filter(Boolean);
        const clickable = !showDifference && Array.isArray(d.cellRows) && d.cellRows.length > 0;
        return {
          title: lines[0] ?? 'Outdoor Comfort',
          swatch: utciCellFill(d),
          rows: lines.slice(1).map(line => {
            const idx = line.indexOf(':');
            if (idx > 0) {
              return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
            }
            return { label: 'Info', value: line };
          }),
          hint: clickable ? 'Click cell to compare sun/wind scenarios' : undefined,
        };
      },
      { hoverStroke: axisInk, hoverStrokeWidth: 1.5 }
    );

    const solarNightOverlayEnabled =
      showExposureMap &&
      !!metadata &&
      Number.isFinite(metadata.lat) &&
      Number.isFinite(metadata.lng) &&
      Number.isFinite(metadata.timeZone);

    const cellIsSolarNight = (d: any): boolean => {
      if (!solarNightOverlayEnabled) return false;
      return isSolarNightEpwStation(
        metadata!.lat,
        metadata!.lng,
        solarNightParamsFromHeatmapDatum(d, metadata!.timeZone)
      );
    };

    if (solarNightOverlayEnabled) {
      cells
        .append('rect')
        .attr('width', d => explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width)
        .attr('height', d => rowInnerHeight(d.y))
        .attr('rx', 2)
        .attr('ry', 2)
        .style('fill', solarNightOverlayRgba(theme))
        .style('stroke', 'none')
        .style('pointer-events', 'none')
        .style('opacity', d =>
          cellIsSolarNight(d) ? heatmapCellOpacity(d.month, d.y, d.x0, d.x1) : 0
        );
    }

    if (showExposureMap) {
      const markCells = cells.filter(
        d =>
          !!d.dominantScenarioId &&
          explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width > overlayMinWidth * 0.45
      );
      markCells.each(function (d) {
        const scenario = utciScenarioById(d.dominantScenarioId);
        if (!scenario) return;
        const gMark = d3.select(this);
        const w = explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width;
        const h = rowInnerHeight(d.y);
        appendExposedOnlyIcons(gMark as any, {
          includeSun: scenario.includeSun,
          includeWind: scenario.includeWind,
          isNight: cellIsSolarNight(d),
          cx: w / 2,
          cy: h / 2,
          cellW: w,
          cellH: h,
          opacity: heatmapCellOpacity(d.month, d.y, d.x0, d.x1),
        });
      });
    }

    // Overlay text for month and week aggregations if cells are large enough
    if (
      !showExposureMap &&
      (aggregation === 'month' || aggregation === 'week') &&
      type.showCellValues
    ) {
      const cellLabels = cells.append("text")
        .attr("x", d => explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width / 2)
        .attr("y", d => rowInnerHeight(d.y) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .style("fill", d => heatmapCellInk(heatmapTextColor, utciCellFill(d)))
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
          if (isDiffMode) {
            if (colorMode === 'comfortTime') {
              const pts = Math.round(d.isComfortable * 100);
              return `${pts > 0 ? '+' : pts < 0 ? '\u2212' : ''}${Math.abs(pts)}%`;
            }
            const dv = Math.round(convertUtciDelta(d.utci));
            return `${dv > 0 ? '+' : dv < 0 ? '\u2212' : ''}${Math.abs(dv)}`;
          }
          return colorMode === 'comfortTime'
            ? `${Math.round(d.isComfortable * 100)}%`
            : `${Math.round(convertUtciAbs(d.utci))}`;
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
            .attr('stroke', axisInk)
            .attr('stroke-width', 2.5)
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
              .attr('stroke', axisInk)
              .attr('stroke-opacity', 0.8)
              .attr('stroke-width', 1.5)
              .attr('rx', 6)
              .attr('ry', 6)
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

    // Aggregate data (always in absolute display units for the upper chart: bars in single mode, baseline vs comparison lines in diff mode)
    const convertFiniteAbs = (v: number | undefined): number =>
      typeof v === 'number' && Number.isFinite(v) ? convertUtciAbs(v) : NaN;
    const summarizeBarBin = (values: UtciDataRow[], selectedValues: UtciDataRow[]) => {
      const validAll = values.map(d => d.utci).filter(Number.isFinite);
      const validSel = selectedValues.map(d => d.utci).filter(Number.isFinite);
      const validComfAll = values.map(d => d.isComfortable).filter(Number.isFinite);
      const validComfSel = selectedValues.map(d => d.isComfortable).filter(Number.isFinite);

      let cmpValSel: number | null = null;
      let cmpMinSel: number | undefined;
      let cmpMaxSel: number | undefined;
      let cmpComfSel: number | null = null;
      if (isDiffMode && selectedValues.length > 0) {
        const cmpRows = selectedValues
          .map(v => compareUtciByHour?.get(epwEquivalentHourKey(v)))
          .filter((r): r is UtciDataRow => r != null);
        const cmpUtcis = cmpRows.map(r => r.utci).filter(Number.isFinite);
        const cmpComfs = cmpRows.map(r => r.isComfortable).filter(Number.isFinite);
        cmpValSel = cmpUtcis.length ? convertFiniteAbs(d3.mean(cmpUtcis)) : null;
        cmpMinSel = cmpUtcis.length ? convertFiniteAbs(d3.min(cmpUtcis)) : undefined;
        cmpMaxSel = cmpUtcis.length ? convertFiniteAbs(d3.max(cmpUtcis)) : undefined;
        cmpComfSel = cmpComfs.length ? (d3.mean(cmpComfs) ?? null) : null;
      }

      return {
        valueAll: validAll.length ? convertFiniteAbs(d3.mean(validAll)) : NaN,
        valueSelected: validSel.length ? convertFiniteAbs(d3.mean(validSel)) : null,
        comfortRatioAll: validComfAll.length ? (d3.mean(validComfAll) ?? NaN) : NaN,
        comfortRatioSelected: validComfSel.length ? (d3.mean(validComfSel) ?? null) : null,
        minSelected: validSel.length ? convertFiniteAbs(d3.min(validSel)) : undefined,
        maxSelected: validSel.length ? convertFiniteAbs(d3.max(validSel)) : undefined,
        compareValueSelected: cmpValSel,
        compareMinSelected: cmpMinSel,
        compareMaxSelected: cmpMaxSel,
        compareComfortRatioSelected: cmpComfSel,
      };
    };

    let aggregatedData: {
      x0: number;
      x1: number;
      valueAll: number;
      valueSelected: number | null;
      comfortRatioAll: number;
      comfortRatioSelected: number | null;
      minSelected?: number;
      maxSelected?: number;
      compareValueSelected?: number | null;
      compareMinSelected?: number;
      compareMaxSelected?: number;
      compareComfortRatioSelected?: number | null;
      month: number;
    }[] = [];

    if (aggregation === 'hour') {
      aggregatedData = currentData.map(d => {
        const selected = isSelected(d);
        const val = convertFiniteAbs(d.utci);
        const cmpRow = isDiffMode ? compareUtciByHour?.get(epwEquivalentHourKey(d)) : undefined;
        const cmpVal = cmpRow ? convertFiniteAbs(cmpRow.utci) : NaN;
        return {
          x0: d.dayOfYear + d.hour / 24,
          x1: d.dayOfYear + (d.hour + 1) / 24,
          valueAll: val,
          valueSelected: selected && Number.isFinite(val) ? val : null,
          comfortRatioAll: d.isComfortable,
          comfortRatioSelected: selected && Number.isFinite(d.isComfortable) ? d.isComfortable : null,
          minSelected: selected && Number.isFinite(val) ? val : undefined,
          maxSelected: selected && Number.isFinite(val) ? val : undefined,
          compareValueSelected: selected && Number.isFinite(cmpVal) ? cmpVal : null,
          compareMinSelected: selected && Number.isFinite(cmpVal) ? cmpVal : undefined,
          compareMaxSelected: selected && Number.isFinite(cmpVal) ? cmpVal : undefined,
          compareComfortRatioSelected:
            selected && cmpRow && Number.isFinite(cmpRow.isComfortable) ? cmpRow.isComfortable : null,
          month: d.month,
        };
      });
    } else if (aggregation === 'day') {
      const days = d3.group(currentData, d => d.dayOfYear);
      aggregatedData = Array.from(days, ([day, values]) => {
        const selectedValues = values.filter(isSelected);
        return {
          x0: day,
          x1: day + 1,
          ...summarizeBarBin(values, selectedValues),
          month: values[0].month,
        };
      });
    } else if (aggregation === 'week') {
      const weeks = d3.group(currentData, d => Math.floor((d.dayOfYear - 1) / 7));
      aggregatedData = Array.from(weeks, ([week, values]) => {
        const selectedValues = values.filter(isSelected);
        return {
          x0: week * 7 + 1,
          x1: Math.min((week + 1) * 7 + 1, 366),
          ...summarizeBarBin(values, selectedValues),
          month: values[0].month,
        };
      });
    } else {
      const months = d3.group(currentData, d => d.month);
      aggregatedData = Array.from(months, ([month, values]) => {
        const startDay = values[0].dayOfYear;
        const endDay = values[values.length - 1].dayOfYear + 1;
        const selectedValues = values.filter(isSelected);
        return {
          x0: startDay,
          x1: endDay,
          ...summarizeBarBin(values, selectedValues),
          month,
        };
      });
    }

    // Y Scale for Bar Chart (always absolute °C/°F or 0–1 comfort ratio)
    let yMin = 0;
    let yMax = 1;
    if (colorMode !== 'comfortTime') {
      let lo = Infinity;
      let hi = -Infinity;
      for (const d of aggregatedData) {
        const cands = [
          d.valueAll,
          d.valueSelected,
          d.minSelected,
          d.maxSelected,
          d.compareValueSelected,
          d.compareMinSelected,
          d.compareMaxSelected,
        ];
        for (const v of cands) {
          if (typeof v !== 'number' || !Number.isFinite(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      yMin = Number.isFinite(lo) ? lo : convertUtciAbs(-10);
      yMax = Number.isFinite(hi) ? hi : convertUtciAbs(40);
      if (yMin === yMax) yMax = yMin + 1;
    }

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

    const getFillColor = (valDisplay: number, comfortRatio: number) => {
      const metricValue = unitSystem === 'imperial' ? ((valDisplay - 32) * 5) / 9 : valDisplay;
      if (colorMode === 'categories') {
        return UTCI_COLORS[getUtciCategoryForValue(metricValue)] || emptyUtciFill;
      }
      return colorScale(colorMode === 'comfortTime' ? comfortRatio : metricValue);
    };

    if (isDiffMode) {
      const pairData = aggregatedData.filter(d =>
        colorMode === 'comfortTime'
          ? typeof d.comfortRatioSelected === 'number' &&
            Number.isFinite(d.comfortRatioSelected) &&
            typeof d.compareComfortRatioSelected === 'number' &&
            Number.isFinite(d.compareComfortRatioSelected)
          : typeof d.valueSelected === 'number' &&
            Number.isFinite(d.valueSelected) &&
            typeof d.compareValueSelected === 'number' &&
            Number.isFinite(d.compareValueSelected)
      );
      const yPrim = (d: (typeof pairData)[0]) =>
        colorMode === 'comfortTime'
          ? d.comfortRatioSelected!
          : explorerBarStatisticY(heatmapCellStatistic, {
              valueSelected: d.valueSelected!,
              minSelected: d.minSelected,
              maxSelected: d.maxSelected,
            });
      const yCmp = (d: (typeof pairData)[0]) =>
        colorMode === 'comfortTime'
          ? d.compareComfortRatioSelected!
          : explorerBarStatisticY(heatmapCellStatistic, {
              valueSelected: d.compareValueSelected!,
              minSelected: d.compareMinSelected,
              maxSelected: d.compareMaxSelected,
            });

      const linePrimary = d3
        .line<(typeof pairData)[0]>()
        .defined(d => Number.isFinite(yPrim(d)) && Number.isFinite(yCmp(d)))
        .x(d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .y(d => yScaleBar(yPrim(d)))
        .curve(d3.curveMonotoneX);

      const lineCompare = d3
        .line<(typeof pairData)[0]>()
        .defined(d => Number.isFinite(yPrim(d)) && Number.isFinite(yCmp(d)))
        .x(d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .y(d => yScaleBar(yCmp(d)))
        .curve(d3.curveMonotoneX);

      const areaDiff = d3
        .area<(typeof pairData)[0]>()
        .defined(d => Number.isFinite(yPrim(d)) && Number.isFinite(yCmp(d)))
        .x(d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .y0(d => yScaleBar(yCmp(d)))
        .y1(d => yScaleBar(yPrim(d)))
        .curve(d3.curveMonotoneX);

      barChartG.append("path")
        .datum(pairData)
        .attr("fill", theme === 'dark' ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)")
        .attr("d", areaDiff);

      const { baseline: lineBaseline, comparison: lineComparison } = compareExplorerLineColors(theme);

      barChartG.append("path")
        .datum(pairData)
        .attr("fill", "none")
        .attr("stroke", lineBaseline)
        .attr("stroke-width", 2.25)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("d", linePrimary);

      barChartG.append("path")
        .datum(pairData)
        .attr("fill", "none")
        .attr("stroke", lineComparison)
        .attr("stroke-width", 2.25)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("d", lineCompare);

      barChartG.selectAll(".dot-primary")
        .data(pairData)
        .join("circle")
        .attr("class", "dot-primary")
        .attr("cx", d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .attr("cy", d => yScaleBar(yPrim(d)))
        .attr("r", 3)
        .attr("fill", lineBaseline)
        .append("title")
        .text(d =>
          colorMode === 'comfortTime'
            ? `Baseline comfort time: ${(yPrim(d) * 100).toFixed(1)}%`
            : `Baseline (${statLabel}): ${yPrim(d).toFixed(1)}${utciUnit}`
        );

      barChartG.selectAll(".dot-compare")
        .data(pairData)
        .join("circle")
        .attr("class", "dot-compare")
        .attr("cx", d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .attr("cy", d => yScaleBar(yCmp(d)))
        .attr("r", 3)
        .attr("fill", lineComparison)
        .append("title")
        .text(d =>
          colorMode === 'comfortTime'
            ? `Comparison comfort time: ${(yCmp(d) * 100).toFixed(1)}%`
            : `Comparison (${statLabel}): ${yCmp(d).toFixed(1)}${utciUnit}`
        );
    } else {
      const chartBarFill =
        barChartFillMode === 'gradient'
          ? colorMode === 'comfortTime'
            ? createExplorerChartValueGradient(svgDefs, r => getFillColor(0, r), 0, 1, v => yScaleBar(v), {
                id: barGradientSvgId,
              })
            : createExplorerChartValueGradient(
                svgDefs,
                v => getFillColor(v, 0),
                convertUtciAbs(utciMin),
                convertUtciAbs(utciMax),
                v => yScaleBar(v),
                { id: barGradientSvgId }
              )
          : null;

      // Draw foreground elements (Selected Data)
      const fgGroups = barChartG.selectAll(".fg-group")
        .data(
          aggregatedData.filter(d =>
            colorMode === 'comfortTime'
              ? typeof d.comfortRatioSelected === 'number' && Number.isFinite(d.comfortRatioSelected)
              : typeof d.valueSelected === 'number' && Number.isFinite(d.valueSelected)
          )
        )
        .join("g")
        .attr("class", "fg-group");

      fgGroups.each(function(d) {
        const group = d3.select(this);
        const barW = Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4));
        const xPos = xScale(d.x0);

        if (colorMode === 'comfortTime') {
          const ratio = d.comfortRatioSelected ?? 0;
          const yHi = yScaleBar(ratio);
          const yLo = yScaleBar(0);
          const topY = Math.min(yHi, yLo);
          const barH = Math.max(1, Math.abs(yLo - yHi));
          const pillR = Math.min(barW / 2, barH / 2);
          const comfortFill = chartBarFill ?? getFillColor(0, ratio);
          const baselinePx = yScaleBar.range()[0];
          group.append("path")
            .attr("d", explorerBarPath(xPos, topY, barW, barH, pillR, explorerBarSitsOnBaseline(topY + barH, baselinePx)))
            .style("fill", comfortFill);
        } else {
          // Bar from min to max
          const val = d.valueSelected!;
          const minVal = typeof d.minSelected === 'number' && Number.isFinite(d.minSelected) ? d.minSelected : val;
          const maxVal = typeof d.maxSelected === 'number' && Number.isFinite(d.maxSelected) ? d.maxSelected : val;
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
            .style("fill", chartBarFill ?? getFillColor(barFillVal, d.comfortRatioSelected ?? 0))
            .style("opacity", 0.6);

          // Indicator circle tracks active Low/Ave/High statistic
          if (aggregation !== 'hour') {
            group.append("circle")
              .attr("cx", xPos + barW / 2)
              .attr("cy", yScaleBar(barFillVal))
              .attr("r", Math.min(barW / 2, 4))
              .style("fill", getFillColor(barFillVal, d.comfortRatioSelected ?? 0))
              .style("stroke", "#000000")
              .style("stroke-width", "1px");
          }
        }
      });

      const barPeriodLabel = (d: any) => {
        if (aggregation === 'month') {
          const m = Math.max(0, Math.min(11, (d.month ?? 1) - 1));
          return monthNames[m] ?? 'Period';
        }
        if (aggregation === 'week') return `Week ${Math.max(1, Math.round(d.x0 / 7) + 1)}`;
        return `Day ${Math.round(d.x0)}`;
      };

      attachChartTooltip(fgGroups, (d: any) => {
        if (colorMode === 'comfortTime') {
          return {
            title: `${barPeriodLabel(d)} · Outdoor Comfort`,
            swatch: OUTDOOR_COMFORT_GREEN_HEX,
            rows: [
              { label: 'Comfort time', value: `${((d.comfortRatioSelected ?? 0) * 100).toFixed(1)}%` },
            ],
          };
        }
        const shown = explorerBarStatisticY(heatmapCellStatistic, {
          valueSelected: d.valueSelected!,
          minSelected: d.minSelected,
          maxSelected: d.maxSelected,
        });
        const metricValue = unitSystem === 'imperial' ? ((shown - 32) * 5) / 9 : shown;
        const rows = [
          { label: `${statLabel} UTCI`, value: `${shown.toFixed(1)} ${utciUnit}` },
          { label: 'Stress category', value: formatUtciCategoryLabel(getUtciCategoryForValue(metricValue)) },
        ];
        if (typeof d.minSelected === 'number' && Number.isFinite(d.minSelected)) {
          rows.push({ label: 'Bar low', value: `${d.minSelected.toFixed(1)} ${utciUnit}` });
        }
        if (typeof d.maxSelected === 'number' && Number.isFinite(d.maxSelected)) {
          rows.push({ label: 'Bar high', value: `${d.maxSelected.toFixed(1)} ${utciUnit}` });
        }
        return {
          title: `${barPeriodLabel(d)} · UTCI`,
          swatch: getFillColor(shown, d.comfortRatioSelected ?? 0),
          rows,
        };
      });
    }

    // Y Axis for Bar Chart
    const yAxisBar = d3.axisLeft(yScaleBar).ticks(5)
      .tickFormat(d => colorMode === 'comfortTime' ? `${Math.round((d as number) * 100)}%` : `${d}${utciUnit}`);
      
    barChartG.append("g")
      .call(yAxisBar)
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll(".tick text").style("fill", axisInk).style("font-weight", "500").style("font-size", `${type.axisPx}px`));

    // Freezing reference line (0 °C / 32 °F), drawn only when inside the visible Y-axis domain
    if (colorMode !== 'comfortTime') {
      const freezingVal = unitSystem === 'imperial' ? 32 : 0;
      const [domMin, domMax] = yScaleBar.domain();
      if (freezingVal >= domMin && freezingVal <= domMax) {
        barChartG.append("line")
          .attr("x1", 0)
          .attr("x2", innerWidth)
          .attr("y1", yScaleBar(freezingVal))
          .attr("y2", yScaleBar(freezingVal))
          .attr("stroke", theme === 'dark' ? '#6b7280' : '#4b5563')
          .attr("stroke-width", '1.5px')
          .attr("stroke-opacity", 0.45);
      }
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
    optimizeMode,
    optimizeView,
    showExposureMap,
    utciEnv,
    tutorialEnabled,
    tutorialFocusPeriodId,
    barGradientSvgId,
    barChartFillMode,
    siteLatitude,
    metadata,
  ]);

  // Calculate local stats lazily only when the Stats modal is open
  const stats = useMemo(() => {
    if (!showStatsModal) {
      return {
        avg: NaN,
        min: NaN,
        max: NaN,
        count: 0,
        comfortRatio: NaN,
        categoryPercentages: [] as { category: string; percentage: number; color: string }[],
      };
    }
    const focusPeriod =
      tutorialEnabled && tutorialFocusPeriodId
        ? getUtciComfortPeriodById(tutorialFocusPeriodId)
        : undefined;
    const filteredData = utciData.filter(d =>
      focusPeriod
        ? rowMatchesUtciComfortPeriod(d, focusPeriod, filter, siteLatitude)
        : rowPassesGlobalFilters(d, filter)
    );

    if (isDiffMode) {
      const cmpByHour = indexEpwByEquivalentHour(compareUtciData);
      const diffs: number[] = [];
      for (const d of filteredData) {
        if (!Number.isFinite(d.utci)) continue;
        const cD = cmpByHour.get(epwEquivalentHourKey(d));
        if (!cD || !Number.isFinite(cD.utci)) continue;
        diffs.push(cD.utci - d.utci);
      }

      return {
        avg: diffs.length ? convertUtciDelta(d3.mean(diffs)!) : NaN,
        min: diffs.length ? convertUtciDelta(d3.min(diffs)!) : NaN,
        max: diffs.length ? convertUtciDelta(d3.max(diffs)!) : NaN,
        count: diffs.length,
        comfortRatio: 0, // Not applicable for diff
        categoryPercentages: [] // Not applicable for diff
      };
    }

    const validFiltered = filteredData.filter(d => Number.isFinite(d.utci) && d.utciCategory !== '');
    const categoryCounts = d3.rollup(validFiltered, v => v.length, d => d.utciCategory);
    const categoryPercentages = validFiltered.length
      ? Array.from(categoryCounts)
          .map(([category, count]) => ({
            category,
            percentage: (count / validFiltered.length) * 100,
            color: UTCI_COLORS[category] || '#cccccc'
          }))
          .sort((a, b) => {
            const order = Object.keys(UTCI_COLORS);
            return order.indexOf(a.category) - order.indexOf(b.category);
          })
      : [];

    return {
      avg: validFiltered.length ? convertUtciAbs(d3.mean(validFiltered, d => d.utci)!) : NaN,
      min: validFiltered.length ? convertUtciAbs(d3.min(validFiltered, d => d.utci)!) : NaN,
      max: validFiltered.length ? convertUtciAbs(d3.max(validFiltered, d => d.utci)!) : NaN,
      count: validFiltered.length,
      comfortRatio: validFiltered.length ? (d3.mean(validFiltered, d => d.isComfortable) ?? 0) : NaN,
      categoryPercentages
    };
  }, [
    showStatsModal,
    tutorialEnabled,
    tutorialFocusPeriodId,
    utciData,
    compareUtciData,
    isDiffMode,
    filter,
    siteLatitude,
    unitSystem,
  ]);

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
                className={comparePaneLabelClass(theme, 'comparison')}
              >
                Comparison · {paneCity ?? '\u2014'}
              </div>
              <div className={chartToolbarRevealClass}>
                <div className={expandChromeStrip ? 'pt-1' : ''}>
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
                <div className={expandChromeStrip ? 'pt-1' : ''}>
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
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {Number.isFinite(stats.avg) ? `${stats.avg.toFixed(1)} ${utciUnit}` : '—'}
            </div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Comfort ratio</div>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
              {Number.isFinite(stats.comfortRatio) ? `${(stats.comfortRatio * 100).toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Min / Max</div>
            <div className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {Number.isFinite(stats.min) && Number.isFinite(stats.max)
                ? `${stats.min.toFixed(1)} / ${stats.max.toFixed(1)} ${utciUnit}`
                : '—'}
            </div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Samples</div>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.count}</div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Stress category breakdown</h4>
          <div className="space-y-1.5">
            {stats.categoryPercentages.map(cat => {
              const rangeLabel = formatUtciCategoryRange(cat.category, unitSystem);
              return (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0">
                      <span className={`capitalize ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{cat.category}</span>
                      {rangeLabel ? (
                        <span className={`ml-1.5 tabular-nums ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          ({rangeLabel})
                        </span>
                      ) : null}
                    </span>
                    <span className={`shrink-0 font-medium tabular-nums ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>{cat.percentage.toFixed(1)}%</span>
                  </div>
                  <div className={`h-1.5 w-full rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <div
                      className="h-full rounded-full"
                      style={{ backgroundColor: UTCI_COLORS[cat.category], width: `${cat.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
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
            Sun and wind are toggled on the chart header. Opt picks the most comfortable exposure every
            hour; Comfort / Exposure switches between the usual gradient and the winning-condition map.
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                Comfort calculation
              </label>
              <button
                type="button"
                onClick={() => setShowGroundNotes(true)}
                className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
              >
                What changes
              </button>
            </div>
            <div className={`flex flex-wrap gap-1 rounded-full p-1 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`} role="group" aria-label="Verified radiant temperature">
              {(['station', 'reflectance'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={radiantMode === mode}
                  onClick={() => setRadiantMode(mode)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    radiantMode === mode
                      ? theme === 'dark'
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-900 shadow-sm'
                      : theme === 'dark'
                        ? 'text-gray-300'
                        : 'text-gray-600'
                  }`}
                >
                  {mode === 'station' ? 'Station' : '+ Reflectance'}
                </button>
              ))}
            </div>
            <p className={`m-0 text-[11px] leading-snug ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              {radiantMode === 'station'
                ? 'Station follows the UTCI authors’ procedure for a weather file. Reflected sunlight is already inside that procedure, so material and reflectance stay hidden.'
                : 'Reflectance uses ASHRAE-55. The slider is sunlight bouncing off the ground onto a person. A darker ground bounces less. The ground stays at the air temperature until the estimate below is on.'}
            </p>
            {radiantMode === 'reflectance' ? (() => {
              const shown = activeGround;
              const surfaceOn = surfaceHeat;
              const row = (
                label: string,
                valueText: string,
                hint: string,
                enabled: boolean,
                input: { min: number; max: number; step: number; value: number; onChange: (n: number) => void }
              ) => (
                <label
                  key={label}
                  className={`block text-[11px] font-semibold ${
                    enabled
                      ? theme === 'dark'
                        ? 'text-gray-200'
                        : 'text-gray-800'
                      : theme === 'dark'
                        ? 'text-gray-500'
                        : 'text-gray-400'
                  }`}
                >
                  {label} {valueText}
                  {hint ? <span className="mt-0.5 block font-normal">{hint}</span> : null}
                  <input
                    type="range"
                    min={input.min}
                    max={input.max}
                    step={input.step}
                    value={input.value}
                    disabled={!enabled}
                    onChange={e => input.onChange(Number(e.target.value))}
                    className={`mt-1 w-full ${enabled ? '' : 'cursor-not-allowed opacity-40'}`}
                  />
                </label>
              );
              return (
                <>
                  {row(
                    'Solar reflectance',
                    `${(shown.solarReflectance * 100).toFixed(0)}%`,
                    surfaceOn
                      ? 'Included in the radiant temperature.'
                      : reflectanceLikeness(shown.solarReflectance),
                    true,
                    {
                      min: 0,
                      max: 0.8,
                      step: 0.01,
                      value: shown.solarReflectance,
                      onChange: n =>
                        setGround(
                          surfaceOn
                            ? realizeGround({ ...activeGround, id: 'custom', label: 'Custom', solarReflectance: n })
                            : {
                                id: 'custom',
                                label: 'Custom',
                                solarReflectance: n,
                                emissivity: shown.emissivity,
                                irrigation: 0,
                              }
                        ),
                    }
                  )}
                  <div className={`space-y-2 rounded-2xl p-3 ${theme === 'dark' ? 'bg-amber-950/40' : 'bg-amber-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`m-0 text-[11px] font-semibold ${theme === 'dark' ? 'text-amber-100' : 'text-amber-950'}`}>
                        Surface temperature estimate
                      </p>
                      <button
                        type="button"
                        aria-pressed={surfaceOn}
                        onClick={() => {
                          const next = !surfaceHeat;
                          if (next && !GROUND_PRESETS.some(p => p.id === activeGround.id)) {
                            setGround(realizeGround({ ...nearestReflectancePreset(activeGround.solarReflectance) }));
                          }
                          setSurfaceHeat(next);
                        }}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          surfaceOn
                            ? theme === 'dark'
                              ? 'bg-amber-200 text-amber-950'
                              : 'bg-amber-900 text-amber-50'
                            : theme === 'dark'
                              ? 'bg-gray-800 text-gray-300'
                              : 'bg-white text-gray-600'
                        }`}
                      >
                        {surfaceOn ? 'On' : 'Off'}
                      </button>
                    </div>
                    <p className={`m-0 text-[11px] leading-snug ${theme === 'dark' ? 'text-amber-100/80' : 'text-amber-950'}`}>
                      Separate from the station procedure and from ASHRAE-55. Off, the ground stays at the air temperature.
                    </p>
                    {surfaceOn ? (
                      <>
                        <select
                          value={GROUND_PRESETS.some(p => p.id === shown.id) ? shown.id : 'custom'}
                          onChange={e => {
                            const preset = GROUND_PRESETS.find(p => p.id === e.target.value);
                            if (preset) setGround(realizeGround({ ...preset }));
                          }}
                          className={`w-full rounded-full border-0 px-3.5 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 ${
                            theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
                          }`}
                        >
                          {GROUND_PRESETS.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                          {!GROUND_PRESETS.some(p => p.id === shown.id) ? <option value="custom">Custom</option> : null}
                        </select>
                        {row('Thermal emissivity', shown.emissivity.toFixed(2), '', true, {
                          min: 0.8,
                          max: 0.99,
                          step: 0.01,
                          value: shown.emissivity,
                          onChange: n => setGround({ ...activeGround, id: 'custom', label: 'Custom', emissivity: n }),
                        })}
                        {row(
                          'Irrigation',
                          `${Math.round((shown.irrigation ?? 0) * 100)}%`,
                          '0% is dry. 100% is well-watered evaporation. Steps between are a straight mix, not a measured watering rate.',
                          true,
                          {
                            min: 0,
                            max: 1,
                            step: 0.05,
                            value: shown.irrigation ?? 0,
                            onChange: n =>
                              setGround(realizeGround({ ...activeGround, id: 'custom', label: 'Custom', irrigation: n })),
                          }
                        )}
                        {row(
                          'Layer thickness',
                          `${Math.round((shown.thicknessM ?? 0.05) * 100)} cm`,
                          'Changes stored heat, not emissivity.',
                          true,
                          {
                            min: 1,
                            max: 30,
                            step: 1,
                            value: Math.round((shown.thicknessM ?? 0.05) * 100),
                            onChange: n =>
                              setGround(
                                realizeGround({ ...activeGround, id: 'custom', label: 'Custom', thicknessM: n / 100 })
                              ),
                          }
                        )}
                      </>
                    ) : null}
                  </div>
                </>
              );
            })() : null}
          </div>
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

      <CardModal
        open={showGroundNotes}
        onClose={() => setShowGroundNotes(false)}
        title="Ground and outdoor comfort"
        theme={theme}
        anchorRef={outerRef as any}
        maxWidthPx={520}
      >
        <div className="space-y-3">
          {GROUND_METHOD_SUMMARY.map(paragraph => (
            <p key={paragraph.slice(0, 24)} className={`m-0 text-xs leading-relaxed ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {paragraph}
            </p>
          ))}
          <p className={`m-0 text-[11px] leading-snug ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            Reflectance examples, not material models: new asphalt 6% and aged asphalt 15% (Synnefa et al. 2006); dark concrete 20% (Synnefa et al. 2006); short grass 25% (Oke 1987); light gray concrete 35% (PCA SN2982). Ground temperature is the air temperature unless the surface-temperature estimate is on.
          </p>
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
        optimizeMode={optimizeMode}
        onSelectScenario={(sun, wind) => {
          setOptimizeMode(false);
          setIncludeSun(sun);
          setIncludeWind(wind);
          setCellInspect(null);
        }}
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
          ) : showExposureMap ? (
            <>
              <UtciOptimizeScenarioLegend theme={theme} />
              <p className={LEGEND_FOOTNOTE_CLASS} title={utciLegendFootnote}>
                {utciLegendFootnote}
              </p>
            </>
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
});
