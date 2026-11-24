import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useIsMobileMaxSm } from '../hooks/useIsMobileMaxSm';
import { useTutorialLiveOptional } from '../context/TutorialLiveContext';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { EPWDataRow, EPWMetadata, EPWVariable } from '../lib/epwParser';
import { InteractiveLegend, GradientDef } from './InteractiveLegend';
import type { ChartType, CompareWindRoseSharedControls } from '../App';
import { X, Settings2 } from 'lucide-react';
import type { GlobalFilterState } from '../lib/globalFilter';
import { hourInWrappedRange, monthInRange, rowPassesGlobalFilters } from '../lib/globalFilter';
import {
  convertUnit as convertDisplayUnit,
  convertValue as convertDisplayValue,
} from '../lib/unitConversion';
import { resolveEpwVariableDef } from '../lib/variableLegendDomain';
import { UnitSystem } from '../App';
import { ChartTypeMenu } from './ChartTypeMenu';
import {
  CHART_TOOLBAR_CONTROLS_CLASS,
  CHART_TOOLBAR_EXPORT_ROW_CLASS,
  CHART_TOOLBAR_HEADER_PAD,
  CHART_TOOLBAR_ROW_CLASS,
  chartToolbarTitleClass,
  chartToolbarRoundButtonClass,
  CHART_TOOLBAR_SETTINGS_GLYPH_CLASS,
  comparePaneLabelClass,
  chartToolbarRemoveButtonClass,
} from '../lib/chartToolbarLayout';
import { ExportHeaderCaption, exportCaptionLinesWithUnit } from './ExportHeaderCaption';
import { CardModal } from './CardModal';
import { WrappingRangeSlider } from './WrappingRangeSlider';
import {
  HOUR_WRAP_HINT,
  MONTH_WRAP_HINT,
  SEASON_MONTH_PRESETS,
  WIND_ROSE_HOUR_PRESETS,
  formatHourIsolationRange,
  formatMonthIsolationRange,
  isolationRangesEqual,
  type IsolationRange,
} from '../lib/timeIsolationUi';
import { defaultGradientIdForVariable } from '../lib/defaultGradientForVariable';
import { sequentialHeatmapColorFn } from '../lib/heatmapColorAdjust';
import { differenceDivergingColor, DIFFERENCE_DIVERGING_ID } from '../lib/differenceDivergingColor';
import { attachChartTooltip } from '../lib/chartTooltip';
import { symmetricDiffBound } from '../lib/symmetricDiffDomain';
import { gradientsForVariable } from '../lib/availableGradientsForVariable';
import { useWindIemGlobalPrefs } from '../lib/iem/globalWindIemPrefsStore';
import { useResolvedIemWindRows } from '../hooks/useResolvedIemWindRows';
import { useIemAsosWindSamples } from '../hooks/useIemAsosWindSamples';
import {
  buildEpwDryBulbStationClockLookup,
  resolveWindRowDryBulbC,
} from '../lib/iem/mergeEpwWind';
import { IemWindChartLoadingOverlay } from './IemWindSetupModal';
import { svgTextUnits } from '../lib/explorerChartSvgLayout';
import { chartAxisInk } from '../lib/chartInk';
import { epwEquivalentHourKey, indexEpwByEquivalentHour, isFiniteNumber } from '../lib/epwClockMatch';
import { ringLabelGapPx, ringLabelPlacement, ringLabelReserve } from '../lib/ringLabels';
import { EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS } from '../lib/explorerChartSvgLayout';
import { useSvgRenderScale } from '../hooks/useSvgRenderScale';

interface WindRoseProps {
  data: EPWDataRow[];
  compareData?: EPWDataRow[];
  showDifference?: boolean;
  stackedComparison?: boolean;
  variables: EPWVariable[];
  onRemove?: () => void;
  onChangeType?: (type: ChartType) => void;
  gradients: GradientDef[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  heatmapTextColor: string;
  theme: 'light' | 'dark';
  setShowGradientModal: (show: boolean) => void;
  exportMode?: boolean;
  metadata?: EPWMetadata;
  compareMetadata?: EPWMetadata;
  comparePane?: 'primary' | 'secondary';
  paneCity?: string;
  pairSuppressHeader?: boolean;
  pairModalHost?: boolean;
  windRoseShared?: CompareWindRoseSharedControls;
  tutorialLegendDomId?: string;
  tutorialChromeAnchors?: boolean;
  pairSuppressFooterLegend?: boolean;
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** Quiet gaps between compass labels: SE–SSE and NW–NNW. Used for hour-scale ticks on the rings. */
const RING_LABEL_BEARINGS_DEG = [146.25, 326.25];

/** Square: the SVG is just the rose and its rim labels; the legend sits in the card header. */
const WIND_ROSE_VIEWBOX_W = 350;
const WIND_ROSE_VIEWBOX_H = 350;

type HourMonthRange = IsolationRange;

function rowMatchesWindRoseWindow(
  row: EPWDataRow,
  months: HourMonthRange,
  hours: HourMonthRange
): boolean {
  if (!monthInRange(row.month as number, months[0], months[1])) return false;
  if (!hourInWrappedRange(row.hour as number, hours[0], hours[1])) return false;
  return true;
}

function roseRingColor(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? '#4b5563' : '#d1d5db';
}

function roseCardFill(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? '#1f2937' : '#ffffff';
}

/** Hours of wind (speed > 0) in each direction bin. */
function directionHourTotals(rows: EPWDataRow[], numBins: number): number[] {
  const binSize = 360 / numBins;
  const totals = new Array(numBins).fill(0);
  for (const d of rows) {
    const dir = d.windDirection as number;
    const speed = d.windSpeed as number;
    if (dir === null || dir === undefined || Number.isNaN(dir) || !(speed > 0)) continue;
    let binIndex = Math.round(dir / binSize) % numBins;
    if (binIndex < 0) binIndex += numBins;
    totals[binIndex]++;
  }
  return totals;
}

function roseScaleTicks(maxHours: number): number[] {
  if (!(maxHours > 0)) return [1];
  const inner = d3.ticks(0, maxHours, 4).filter(t => t > 0 && t < maxHours * 0.97);
  return [...inner, maxHours];
}

const EMPTY_EPW_ROWS: EPWDataRow[] = [];

export const WindRose = React.memo(function WindRose({
  data: epwData,
  compareData: epwCompareRaw,
  showDifference,
  stackedComparison,
  variables,
  onRemove,
  onChangeType,
  gradients,
  filter,
  unitSystem,
  heatmapTextColor,
  theme,
  setShowGradientModal,
  exportMode,
  metadata,
  compareMetadata,
  comparePane,
  paneCity,
  pairSuppressHeader,
  pairModalHost,
  windRoseShared,
  tutorialLegendDomId,
  tutorialChromeAnchors,
  pairSuppressFooterLegend,
}: WindRoseProps) {
  const roseRef = useRef<SVGSVGElement>(null);
  const compareRoseRef = useRef<SVGSVGElement>(null);

  const globalIemPrefs = useWindIemGlobalPrefs();
  const iemControls = windRoseShared?.iem ?? globalIemPrefs;
  const sameCompareSite =
    !compareMetadata ||
    !metadata ||
    (Math.abs(compareMetadata.lat - metadata.lat) < 0.05 &&
      Math.abs(compareMetadata.lng - metadata.lng) < 0.05);
  const compareIemControls = useMemo(
    () => (sameCompareSite ? iemControls : { ...iemControls, iemStation: null }),
    [sameCompareSite, iemControls]
  );
  const skipCompareWindResolution = !(epwCompareRaw && epwCompareRaw.length > 0);
  const useIemSamples = iemControls.source === 'iem';

  // For wind roses, preserve multi-year distributions (1 hourly sample per UTC hour, annualized).
  const iemSamples = useIemAsosWindSamples(metadata, iemControls, !useIemSamples, epwData);
  const iemSamplesCompare = useIemAsosWindSamples(
    compareMetadata ?? metadata,
    compareIemControls,
    !useIemSamples || skipCompareWindResolution,
    epwCompareRaw ?? EMPTY_EPW_ROWS
  );

  // Avoid duplicate IEM network fetches: only run `useResolvedIemWindRows` when using EPW mode.
  const primWindResolved = useResolvedIemWindRows(epwData, metadata, iemControls, useIemSamples);
  const cmpWindResolved = useResolvedIemWindRows(
    epwCompareRaw ?? EMPTY_EPW_ROWS,
    compareMetadata ?? metadata,
    compareIemControls,
    useIemSamples || skipCompareWindResolution
  );

  const iemPrimaryReady = useIemSamples && iemSamples.samples.length > 0;
  const iemCompareReady = useIemSamples && iemSamplesCompare.samples.length > 0;
  const primaryHourWeight = iemPrimaryReady ? 1 / Math.max(1, iemSamples.yearCount) : 1;
  const compareHourWeight = iemCompareReady ? 1 / Math.max(1, iemSamplesCompare.yearCount) : 1;

  // Fall back cleanly to EPW data if IEM fails or returns no rows.
  const data = iemPrimaryReady ? iemSamples.samples : primWindResolved.rows;
  const compareData = skipCompareWindResolution
    ? epwCompareRaw
    : iemCompareReady
      ? iemSamplesCompare.samples
      : cmpWindResolved.rows;

  const [iCv, setICv] = useState(variables.find(v => v.id === 'windSpeed')?.id || variables[0]?.id || '');
  const colorVar = windRoseShared?.colorVar ?? iCv;
  const setColorVar = windRoseShared?.setColorVar ?? setICv;

  const [iGrad, setIGrad] = useState(gradients[0].id);
  const gradientId = windRoseShared?.gradientId ?? iGrad;
  const setGradientId = windRoseShared?.setGradientId ?? setIGrad;

  useEffect(() => {
    if (showDifference && epwCompareRaw) {
      if (gradients.some(g => g.id === DIFFERENCE_DIVERGING_ID)) {
        setGradientId(DIFFERENCE_DIVERGING_ID);
        return;
      }
    }
    const id = defaultGradientIdForVariable(colorVar, variables, gradients);
    setGradientId(id);
  }, [colorVar, variables, gradients, setGradientId, showDifference, epwCompareRaw]);

  const [iShowSettings, setIShowSettings] = useState(false);
  const showSettings = windRoseShared?.showSettings ?? iShowSettings;
  const setShowSettings = windRoseShared?.setShowSettings ?? setIShowSettings;

  const [iBins, setIBins] = useState(16);
  const numBins = windRoseShared?.numBins ?? iBins;
  const setNumBins = windRoseShared?.setNumBins ?? setIBins;

  const showSettingsModal = showSettings && (!pairSuppressHeader || pairModalHost);

  const paletteGradients = useMemo(
    () => gradientsForVariable(colorVar, variables, gradients),
    [colorVar, variables, gradients]
  );
  const isMobile = useIsMobileMaxSm();
  // Store thresholds in canonical SI (°C, m/s) to avoid double rebuilds and rounding drift on unit toggles
  const [tempFilterEnabled, setTempFilterEnabled] = useState(false);
  const [tempThresholdC, setTempThresholdC] = useState(21);
  const [tempFilterType, setTempFilterType] = useState<'above' | 'below'>('above');

  const [speedFilterEnabled, setSpeedFilterEnabled] = useState(false);
  const [speedThresholdMs, setSpeedThresholdMs] = useState(4.5);
  const [speedFilterType, setSpeedFilterType] = useState<'above' | 'below'>('above');
  const [monthRange, setMonthRange] = useState<HourMonthRange>([1, 12]);
  const [hourRange, setHourRange] = useState<HourMonthRange>([0, 23]);
  const [scaleMaxOverride, setScaleMaxOverride] = useState<number | null>(null);

  const displayTempThreshold =
    unitSystem === 'imperial' ? Math.round((tempThresholdC * 9) / 5 + 32) : Math.round(tempThresholdC);
  const displaySpeedThreshold =
    unitSystem === 'imperial' ? Math.round(speedThresholdMs * 2.23693629 * 10) / 10 : Math.round(speedThresholdMs * 10) / 10;

  const hasLocalWindRoseFilter =
    tempFilterEnabled ||
    speedFilterEnabled ||
    monthRange[0] !== 1 ||
    monthRange[1] !== 12 ||
    hourRange[0] !== 0 ||
    hourRange[1] !== 23;

  const resetLocalWindRoseFilters = () => {
    setTempFilterEnabled(false);
    setSpeedFilterEnabled(false);
    setMonthRange([1, 12]);
    setHourRange([0, 23]);
  };

  const outerRef = useRef<HTMLDivElement>(null);
  const renderScale = useSvgRenderScale(roseRef, WIND_ROSE_VIEWBOX_W, WIND_ROSE_VIEWBOX_H);
  /** Header legend inputs derived during the SVG render (bucket fills + outer-ring note). */
  const [legendState, setLegendState] = useState<{ note: string; bandFills: string[] }>({
    note: '',
    bandFills: [],
  });

  const convertValue = (val: number | null | undefined, unit: string, isDelta: boolean = false) =>
    convertDisplayValue(val, unit, unitSystem, isDelta);

  const convertUnit = (unit: string) => convertDisplayUnit(unit, unitSystem);

  const epwDryBulbLookup = useMemo(
    () => (epwData.length ? buildEpwDryBulbStationClockLookup(epwData) : null),
    [epwData]
  );
  const compareEpwDryBulbLookup = useMemo(
    () => (epwCompareRaw?.length ? buildEpwDryBulbStationClockLookup(epwCompareRaw) : null),
    [epwCompareRaw]
  );

  // Filter data based on global filter, local season/hours, and comfort filters
  const getFilteredData = (
    targetData: EPWDataRow[],
    dryBulbLookup: Map<number, number> | null,
    rowMetadata?: EPWMetadata,
    roseWindow: { months: HourMonthRange; hours: HourMonthRange } = { months: monthRange, hours: hourRange }
  ) => {
    return targetData.filter(d => {
      if (!rowPassesGlobalFilters(d, filter)) return false;
      if (!rowMatchesWindRoseWindow(d, roseWindow.months, roseWindow.hours)) return false;

      let isTempMatch = true;
      if (tempFilterEnabled) {
        const tempC = resolveWindRowDryBulbC(d, dryBulbLookup, rowMetadata);
        if (tempC === null) return false;
        isTempMatch = tempFilterType === 'above' ? tempC > tempThresholdC : tempC < tempThresholdC;
      }

      let isSpeedMatch = true;
      if (speedFilterEnabled) {
        const speedMs = d.windSpeed as number;
        if (!Number.isFinite(speedMs)) {
          isSpeedMatch = false;
        } else {
          isSpeedMatch = speedFilterType === 'above' ? speedMs > speedThresholdMs : speedMs < speedThresholdMs;
        }
      }

      return isTempMatch && isSpeedMatch;
    });
  };

  const filteredData = useMemo(
    () => getFilteredData(data, epwDryBulbLookup, metadata),
    [
      data,
      filter,
      monthRange,
      hourRange,
      tempFilterEnabled,
      tempThresholdC,
      tempFilterType,
      speedFilterEnabled,
      speedThresholdMs,
      speedFilterType,
      epwDryBulbLookup,
      metadata,
    ]
  );
  const filteredCompareData = useMemo(
    () =>
      compareData
        ? getFilteredData(compareData, compareEpwDryBulbLookup, compareMetadata ?? metadata)
        : [],
    [
      compareData,
      filter,
      monthRange,
      hourRange,
      tempFilterEnabled,
      tempThresholdC,
      tempFilterType,
      speedFilterEnabled,
      speedThresholdMs,
      speedFilterType,
      compareEpwDryBulbLookup,
      compareMetadata,
      metadata,
    ]
  );

  const annualMaxHours = useMemo(() => {
    const annualPrimary = getFilteredData(data, epwDryBulbLookup, metadata, {
      months: [1, 12],
      hours: [0, 23],
    });
    const annualCompare =
      compareData && compareData.length
        ? getFilteredData(compareData, compareEpwDryBulbLookup, compareMetadata ?? metadata, {
            months: [1, 12],
            hours: [0, 23],
          })
        : [];
    const maxPrimary = (d3.max(directionHourTotals(annualPrimary, numBins)) || 0) * primaryHourWeight;
    const maxCompare = annualCompare.length
      ? (d3.max(directionHourTotals(annualCompare, numBins)) || 0) * compareHourWeight
      : 0;
    return Math.max(maxPrimary, maxCompare, 1);
  }, [
    data,
    compareData,
    filter,
    tempFilterEnabled,
    tempThresholdC,
    tempFilterType,
    speedFilterEnabled,
    speedThresholdMs,
    speedFilterType,
    epwDryBulbLookup,
    compareEpwDryBulbLookup,
    metadata,
    compareMetadata,
    numBins,
    primaryHourWeight,
    compareHourWeight,
  ]);

  const scaleMaxHours = scaleMaxOverride ?? annualMaxHours;

  const tutorialLive = useTutorialLiveOptional();
  const tutorialReport = tutorialLive?.report;
  const tutorialEnabled = tutorialLive?.enabled;
  useEffect(() => {
    if (!tutorialEnabled || !tutorialReport) return;
    const v = variables.find(x => x.id === colorVar);
    tutorialReport({
      colorVarId: colorVar,
      colorVarName: v?.name,
      windRoseBins: numBins,
    });
  }, [tutorialEnabled, tutorialReport, colorVar, variables, numBins]);

  const { colorVarDef, cMin, cMax, cUnit } = useMemo(() => {
    const def = resolveEpwVariableDef(variables, colorVar || 'windSpeed');
    let min = def.fixedMin !== undefined ? convertValue(def.fixedMin, def.unit) : convertValue(def.min, def.unit);
    let max = def.fixedMax !== undefined ? convertValue(def.fixedMax, def.unit) : convertValue(def.max, def.unit);
    const unit = convertUnit(def.unit);

    if (showDifference && compareData) {
      const compareByHour = indexEpwByEquivalentHour(compareData);
      const diffs: number[] = [];
      for (const row of data) {
        const primaryVal = row[colorVar] as unknown;
        const compareVal = compareByHour.get(epwEquivalentHourKey(row))?.[colorVar] as unknown;
        if (!isFiniteNumber(primaryVal) || !isFiniteNumber(compareVal)) continue;
        diffs.push(compareVal - primaryVal);
      }
      const bound = symmetricDiffBound(diffs);
      const half = bound > 0 ? bound : 1;
      min = convertValue(-half, def.unit, true);
      max = convertValue(half, def.unit, true);
    }
    return { colorVarDef: def, cMin: min, cMax: max, cUnit: unit };
  }, [variables, colorVar, showDifference, compareData, data, unitSystem]);

  const colorVarLabel = `${colorVarDef.name} (${cUnit})`;

  const iemWindFallbackOnly =
    iemControls.source === 'iem' && iemSamples.kind === 'iem' && iemSamples.fallbackNote ? (
      <p className="mt-1 text-[11px] italic text-amber-800/90 dark:text-amber-200/80">{iemSamples.fallbackNote}</p>
    ) : null;

  useEffect(() => {
    if (!roseRef.current) return;

    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
    
    let colorScale: (v: number) => string;
    if (showDifference && compareData) {
      colorScale = v => differenceDivergingColor(v, cMin, cMax);
    } else {
      colorScale = sequentialHeatmapColorFn(gradientDef.colors, colorVarDef, cMin, cMax);
    }

    // --- Wind Rose ---
    const roseWidth = WIND_ROSE_VIEWBOX_W;
    const roseHeight = WIND_ROSE_VIEWBOX_H;
    const units = (px: number) => svgTextUnits(px, renderScale);
    const axisInk = chartAxisInk(heatmapTextColor, theme);
    /** Compass ring: cardinal points lead, the sixteen-wind names step down in size and ink. */
    const cardinalPx = units(11);
    const intercardinalPx = units(9.5);
    const secondaryPx = units(8.5);
    const ringLabelPx = units(8);
    const gridInk = theme === 'dark' ? '#9ca3af' : '#6b7280';
    /** Rim labels share one placement rule with the sun path (see `ringLabels.ts`); gap is in viewBox units. */
    const dialPx = Math.min(roseWidth, roseHeight) * renderScale;
    const ringGap = ringLabelGapPx(dialPx) / Math.max(renderScale, 0.01);
    const rim = ringLabelReserve(ringGap, secondaryPx * 2.3, cardinalPx);
    const roseRadius = Math.min(roseWidth / 2 - rim.x, roseHeight / 2 - rim.y);
    /** Over-scale bins are compressed to the ring and flagged with a chevron drawn inside the wedge tip. */
    const overflowRadiusMax = roseRadius;
    const binSize = 360 / numBins;
    const numBuckets = 6;
    const bucketScale = d3.scaleQuantize<number>()
      .domain([cMin, cMax])
      .range(d3.range(numBuckets));
    const scaleMax = Math.max(1, scaleMaxHours);
    const rScaleRose = d3.scaleLinear()
      .domain([0, scaleMax])
      .range([0, roseRadius]);
    const radiusOf = (hours: number, totalCount: number) => {
      const totalR = rScaleRose(Math.max(totalCount, hours));
      if (totalR <= overflowRadiusMax) return Math.max(0, rScaleRose(hours));
      if (totalCount <= 0) return 0;
      return (Math.max(0, hours) / totalCount) * overflowRadiusMax;
    };
    const binHitsDrawCap = (totalCount: number) => rScaleRose(totalCount) > overflowRadiusMax + 0.5;
    const compareByHour = showDifference && compareData ? indexEpwByEquivalentHour(compareData) : null;

    const renderRoseInto = (
      svgEl: SVGSVGElement,
      rowsToPlot: EPWDataRow[],
      hourWeight: number,
      allowDiff: boolean
    ): boolean => {
      const roseSvg = d3.select(svgEl);
      roseSvg.selectAll('*').remove();

      const roseG = roseSvg
        .attr('viewBox', `0 0 ${roseWidth} ${roseHeight}`)
        .append('g')
        .attr('transform', `translate(${roseWidth / 2}, ${roseHeight / 2})`);

      const bins = d3.range(numBins).map(i => ({
        angle: i * binSize,
        buckets: new Array(numBuckets).fill(0),
        totalCount: 0,
      }));

      rowsToPlot.forEach(d => {
        const dir = d.windDirection as number;
        const speed = d.windSpeed as number;

        let val: number;
        if (allowDiff && compareByHour) {
          const compareRow = compareByHour.get(epwEquivalentHourKey(d));
          const primaryVal = d[colorVar] as unknown;
          const compareVal = compareRow?.[colorVar] as unknown;
          if (!isFiniteNumber(primaryVal) || !isFiniteNumber(compareVal)) return;
          val = convertValue(compareVal - primaryVal, colorVarDef.unit, true);
        } else {
          val = convertValue(d[colorVar] as number, colorVarDef.unit);
        }

        if (
          typeof dir === 'number' &&
          Number.isFinite(dir) &&
          typeof val === 'number' &&
          Number.isFinite(val) &&
          typeof speed === 'number' &&
          Number.isFinite(speed) &&
          speed > 0
        ) {
          let binIndex = Math.round(dir / binSize) % numBins;
          if (binIndex < 0) binIndex += numBins;

          let bucketIndex = bucketScale(val);
          if (bucketIndex === undefined) bucketIndex = 0;
          if (bucketIndex >= numBuckets) bucketIndex = numBuckets - 1;

          bins[binIndex].buckets[bucketIndex] += hourWeight;
          bins[binIndex].totalCount += hourWeight;
        }
      });

      const ticks = roseScaleTicks(scaleMax);
      roseG
        .selectAll('.rose-grid')
        .data(ticks)
        .join('circle')
        .attr('class', 'rose-grid')
        .attr('r', d => rScaleRose(d))
        .style('fill', 'none')
        .style('stroke', roseRingColor(theme))
        .style('stroke-width', d => (d === scaleMax ? '2px' : '1.5px'))
        .style('stroke-dasharray', 'none');

      const ringLabelItems = ticks.flatMap(tick =>
        RING_LABEL_BEARINGS_DEG.map(bearing => ({ tick, bearing }))
      );
      const ringFill = theme === 'dark' ? '#9ca3af' : '#6b7280';
      const ringHalo = roseCardFill(theme);
      roseG
        .selectAll('.rose-grid-label')
        .data(ringLabelItems)
        .join('text')
        .attr('class', 'rose-grid-label')
        .attr('transform', d => {
          const r = rScaleRose(d.tick);
          const rad = (d.bearing * Math.PI) / 180;
          const x = r * Math.sin(rad);
          const y = -r * Math.cos(rad);
          let rot = d.bearing;
          if (rot > 90 && rot < 270) rot += 180;
          return `translate(${x},${y}) rotate(${rot})`;
        })
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('fill', ringFill)
        .style('font-size', `${ringLabelPx}px`)
        .style('font-weight', d => (d.tick === scaleMax ? '700' : '600'))
        .style('paint-order', 'stroke')
        .style('stroke', ringHalo)
        .style('stroke-width', `${Math.max(2, ringLabelPx * 0.3)}px`)
        .style('stroke-linejoin', 'round')
        .text(d => `${Math.round(d.tick)}`);

      // Draw axis lines (16 compass points)
      roseG
        .selectAll('.rose-axis')
        .data(d3.range(16))
        .join('line')
        .attr('class', 'rose-axis')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', d => roseRadius * Math.sin((d * (360 / 16) * Math.PI) / 180))
        .attr('y2', d => -roseRadius * Math.cos((d * (360 / 16) * Math.PI) / 180))
        .style('stroke', roseRingColor(theme))
        .style('stroke-width', '1px')
        .style('stroke-opacity', 0.5);

      const stack = d3
        .stack<any>()
        .keys(d3.range(numBuckets).map(String))
        .value((d, key) => d.buckets[Number(key)]);

      const series = stack(bins);

      const wedges: any[] = [];
      series.forEach(s => {
        const extent = bucketScale.invertExtent(Number(s.key));
        s.forEach(d => {
          if (d[1] > d[0]) {
            wedges.push({
              angle: d.data.angle,
              inner: d[0],
              outer: d[1],
              count: d[1] - d[0],
              totalCount: d.data.totalCount,
              bucketIndex: Number(s.key),
              extent: extent,
            });
          }
        });
      });

      const visibleWedges = wedges.filter(d => {
        const inner = radiusOf(d.inner, d.totalCount);
        const outer = radiusOf(d.outer, d.totalCount);
        return outer - inner > 0.25;
      });

      const arc = d3
        .arc<any>()
        .innerRadius(d => radiusOf(d.inner, d.totalCount))
        .outerRadius(d => Math.max(radiusOf(d.inner, d.totalCount), radiusOf(d.outer, d.totalCount)))
        .startAngle(d => ((d.angle - binSize / 2) * Math.PI) / 180)
        .endAngle(d => ((d.angle + binSize / 2) * Math.PI) / 180);

      const unitWord = hourWeight < 1 ? 'hrs/yr' : 'hours';
      const wedgesSel = roseG
        .selectAll('.rose-wedge')
        .data(visibleWedges)
        .join('path')
        .attr('class', 'rose-wedge')
        .attr('d', arc)
        .style('fill', d => {
          const midVal = (d.extent[0] + d.extent[1]) / 2;
          return colorScale(midVal);
        })
        .style('opacity', 1)
        .style('stroke', '#ffffff')
        .style('stroke-width', '0.5px');

      attachChartTooltip(
        wedgesSel,
        (d: any) => {
          const over = d.totalCount > scaleMax;
          const midVal = (d.extent[0] + d.extent[1]) / 2;
          const rangeText =
            d.bucketIndex === 0
              ? `≤ ${d.extent[1].toFixed(1)} ${cUnit}`
              : d.bucketIndex === numBuckets - 1
                ? `≥ ${d.extent[0].toFixed(1)} ${cUnit}`
                : `${d.extent[0].toFixed(1)} – ${d.extent[1].toFixed(1)} ${cUnit}`;
          const countDisplay = hourWeight < 1 ? d.count.toFixed(1) : Math.round(d.count);
          const rows = [
            { label: colorVarDef.name, value: rangeText },
            { label: 'Frequency', value: `${countDisplay} ${unitWord}` },
            { label: 'Direction total', value: `${Math.round(d.totalCount)} ${unitWord}` },
          ];
          return {
            title: `Wind from ${Math.round(d.angle)}°`,
            swatch: colorScale(midVal),
            rows,
            hint: over ? `Exceeds outer ring (${Math.round(scaleMax)} h)` : undefined,
          };
        },
        { hoverStroke: axisInk, hoverStrokeWidth: 1.5 }
      );

      const overflowChevrons = bins.filter(b => binHitsDrawCap(b.totalCount));
      const overflowSel = roseG
        .selectAll('.rose-overflow')
        .data(overflowChevrons)
        .join('path')
        .attr('class', 'rose-overflow')
        .attr('d', d => {
          const ang = (d.angle * Math.PI) / 180;
          const tipR = overflowRadiusMax - 1.5;
          const r = tipR - 7;
          const half = 4.2;
          const tipX = tipR * Math.sin(ang);
          const tipY = -tipR * Math.cos(ang);
          const bx = r * Math.sin(ang);
          const by = -r * Math.cos(ang);
          const p1x = bx + half * Math.cos(ang);
          const p1y = by + half * Math.sin(ang);
          const p2x = bx - half * Math.cos(ang);
          const p2y = by - half * Math.sin(ang);
          return `M${p1x},${p1y}L${tipX},${tipY}L${p2x},${p2y}Z`;
        })
        .style('fill', axisInk)
        .style('stroke', roseCardFill(theme))
        .style('stroke-width', '1.2px')
        .style('opacity', 0.9);

      attachChartTooltip(overflowSel, (d: any) => ({
        title: `Wind from ${Math.round(d.angle)}°`,
        rows: [
          { label: 'Direction total', value: `${Math.round(d.totalCount)} ${unitWord}` },
          { label: 'Outer ring scale', value: `${Math.round(scaleMax)} h` },
        ],
      }));

      roseG
        .selectAll('.rose-label')
        .data(d3.range(16))
        .join('text')
        .attr('class', 'rose-label')
        .attr('x', d => (roseRadius + ringGap) * Math.sin((d * (360 / 16) * Math.PI) / 180))
        .attr('y', d => -(roseRadius + ringGap) * Math.cos((d * (360 / 16) * Math.PI) / 180))
        .attr('dy', d => ringLabelPlacement((d * (360 / 16) * Math.PI) / 180).dy)
        .attr('text-anchor', d => ringLabelPlacement((d * (360 / 16) * Math.PI) / 180).anchor)
        .style('fill', d => (d % 2 === 0 ? axisInk : gridInk))
        .style('font-size', d => `${d % 4 === 0 ? cardinalPx : d % 2 === 0 ? intercardinalPx : secondaryPx}px`)
        .style('font-weight', d => (d % 4 === 0 ? '700' : d % 2 === 0 ? '600' : '500'))
        .text(d => COMPASS_POINTS[d]);

      roseG.selectAll('.rose-grid-label').raise();

      return bins.some(b => b.totalCount > scaleMax + 0.5);
    };

    const anyOverflow = renderRoseInto(
      roseRef.current,
      filteredData,
      primaryHourWeight,
      Boolean(showDifference && compareData)
    );
    if (stackedComparison && compareData && compareRoseRef.current) {
      renderRoseInto(compareRoseRef.current, filteredCompareData, compareHourWeight, false);
    }

    const ringUnit = primaryHourWeight < 1 ? 'h/yr' : 'h';
    const hoursScaleNote =
      scaleMaxOverride == null
        ? `Rings = hours with wind · outer ring ${Math.round(annualMaxHours)} ${ringUnit} (annual peak) · calm excluded`
        : anyOverflow
          ? `Outer ring ${Math.round(scaleMaxHours)} ${ringUnit} · arrows exceed scale · calm excluded`
          : `Outer ring ${Math.round(scaleMaxHours)} ${ringUnit} (annual peak ${Math.round(annualMaxHours)} ${ringUnit}) · calm excluded`;

    const nextBandFills = d3.range(numBuckets).map(i => {
      const extent = bucketScale.invertExtent(i);
      return colorScale((extent[0] + extent[1]) / 2);
    });
    setLegendState(prev => {
      if (
        prev.note === hoursScaleNote &&
        prev.bandFills.length === nextBandFills.length &&
        prev.bandFills.every((c, idx) => c === nextBandFills[idx])
      ) {
        return prev;
      }
      return { note: hoursScaleNote, bandFills: nextBandFills };
    });
  }, [filteredData, filteredCompareData, stackedComparison, data, compareData, showDifference, variables, colorVar, colorVarDef, gradientId, gradients, filter, renderScale, numBins, unitSystem, heatmapTextColor, theme, scaleMaxHours, scaleMaxOverride, annualMaxHours, primaryHourWeight, compareHourWeight]);

  const selectedPill = theme === 'dark' ? 'bg-gray-100 text-gray-900' : 'bg-gray-900 text-white';
  const idlePill = 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600';
  const valueInk = theme === 'dark' ? 'text-gray-100' : 'text-gray-800';
  const linkInk = theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900';
  const sliderTrack = theme === 'dark' ? '#e5e7eb' : '#111827';
  const sliderRail = theme === 'dark' ? '#4b5563' : '#e5e7eb';
  const sliderHandle = {
    borderColor: sliderTrack,
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    opacity: 1,
    width: 18,
    height: 18,
  };

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
        {exportMode ? (
          <>
            <div className={`${CHART_TOOLBAR_EXPORT_ROW_CLASS} min-w-0`}>
              <ChartTypeMenu
                value="windrose"
                label="Wind Rose"
                onChange={() => {}}
                theme="light"
                display="icon"
                staticIcon
              />
              <ExportHeaderCaption
                lines={[exportCaptionLinesWithUnit(colorVarDef.category, colorVarDef.name, cUnit)]}
              />
            </div>
          </>
        ) : comparePane === 'secondary' ? (
          <>
            <div className={comparePaneLabelClass(theme, 'comparison')}>
              Comparison · {paneCity ?? '—'}
            </div>
            <div className="flex min-h-7 items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={chartToolbarRoundButtonClass(theme, showSettings, 'blue')}
                title="Chart settings"
              >
                <Settings2 className={CHART_TOOLBAR_SETTINGS_GLYPH_CLASS} />
              </button>
            </div>
              {iemWindFallbackOnly}
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
            <div className={`relative ${CHART_TOOLBAR_ROW_CLASS} w-full`}>
              <div
                className={`${CHART_TOOLBAR_CONTROLS_CLASS} transition-[padding] duration-200 ease-out ${
                  showSettings
                    ? onRemove
                      ? 'pr-[4.25rem]'
                      : 'pr-9'
                    : onRemove
                      ? 'pr-0 group-hover:pr-[4.25rem] focus-within:pr-[4.25rem]'
                      : 'pr-0 group-hover:pr-9 focus-within:pr-9'
                }`}
              >
                <ChartTypeMenu
                  value="windrose"
                  label="Wind Rose"
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
                  title={`Wind Direction (${cUnit})`}
                >
                  Wind Direction ({cUnit})
                </span>
                {hasLocalWindRoseFilter && (
                  <button
                    type="button"
                    onClick={resetLocalWindRoseFilters}
                    title="Local wind rose filter active — click to reset"
                    className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
                      theme === 'dark'
                        ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
                        : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                    }`}
                  >
                    <span>Filtered</span>
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
              <div
                className={`absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 items-center gap-1 transition-opacity duration-200 ease-out ${
                  showSettings || isMobile
                    ? 'pointer-events-auto opacity-100'
                    : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
                }`}
              >
                <button
                  type="button"
                  id={tutorialChromeAnchors ? 'tutorial-card-settings' : undefined}
                  onClick={() => setShowSettings(!showSettings)}
                  className={chartToolbarRoundButtonClass(theme, showSettings, 'blue')}
                  title="Chart settings"
                >
                  <Settings2 className={CHART_TOOLBAR_SETTINGS_GLYPH_CLASS} />
                </button>
                {onRemove && (
                  <button
                    type="button"
                    onClick={onRemove}
                    className={chartToolbarRemoveButtonClass(theme)}
                    title="Remove chart"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
              {iemWindFallbackOnly}
          </>
        )}
      </div>
      )}

      {!pairSuppressFooterLegend && legendState.bandFills.length > 0 && (
        <div className={`${EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS} min-w-0`}>
          <InteractiveLegend
            domId={tutorialLegendDomId}
            variable={{ ...colorVarDef, min: cMin, max: cMax, unit: cUnit }}
            gradientId={gradientId}
            setGradientId={setGradientId}
            gradients={gradients}
            theme={theme}
            isDifference={showDifference}
            stepFills={legendState.bandFills}
            footnote={legendState.note}
          />
        </div>
      )}

      <CardModal
        open={showSettingsModal}
        onClose={() => setShowSettings(false)}
        title="Chart settings"
        theme={theme}
        anchorRef={outerRef as any}
        maxWidthPx={520}
      >
        <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <div className="space-y-2">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Wind Rose Granularity</label>
                  <select
                    value={numBins}
                    onChange={(e) => setNumBins(parseInt(e.target.value))}
                    className={`w-full text-sm rounded-full block px-3.5 py-2.5 transition-all outline-none border-0 ${theme === 'dark' ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                  >
                    <option value={8}>8 Directions (Basic)</option>
                    <option value={16}>16 Directions (Standard)</option>
                    <option value={36}>36 Directions (Detailed)</option>
                    <option value={72}>72 Directions (High Res)</option>
                  </select>
                </div>

                <div className="space-y-3 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/40">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Temperature Filter</label>
                    <input 
                      type="checkbox" 
                      checked={tempFilterEnabled} 
                      onChange={e => setTempFilterEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                    />
                  </div>
                  {tempFilterEnabled && (
                    <div className="space-y-3 pt-1">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setTempFilterType('above')}
                          className={`flex-1 rounded-full px-3 py-1 text-xs font-bold transition-all ${tempFilterType === 'above' ? selectedPill : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                        >
                          ABOVE
                        </button>
                        <button 
                          onClick={() => setTempFilterType('below')}
                          className={`flex-1 rounded-full px-3 py-1 text-xs font-bold transition-all ${tempFilterType === 'below' ? selectedPill : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                        >
                          BELOW
                        </button>
                      </div>
                      <div className="px-2">
                        <Slider
                          min={unitSystem === 'imperial' ? 0 : -20}
                          max={unitSystem === 'imperial' ? 120 : 50}
                          value={displayTempThreshold}
                          onChange={(v) => {
                            const n = v as number;
                            setTempThresholdC(unitSystem === 'imperial' ? ((n - 32) * 5) / 9 : n);
                          }}
                          trackStyle={{ backgroundColor: sliderTrack }}
                          railStyle={{ backgroundColor: sliderRail }}
                          handleStyle={{ ...sliderHandle }}
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">{unitSystem === 'imperial' ? '0°F' : '-20°C'}</span>
                          <span className={`text-xs font-bold ${valueInk}`}>{displayTempThreshold}{unitSystem === 'imperial' ? '°F' : '°C'}</span>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">{unitSystem === 'imperial' ? '120°F' : '50°C'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/40">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Wind Speed Filter</label>
                    <input 
                      type="checkbox" 
                      checked={speedFilterEnabled} 
                      onChange={e => setSpeedFilterEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                    />
                  </div>
                  {speedFilterEnabled && (
                    <div className="space-y-3 pt-1">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSpeedFilterType('above')}
                          className={`flex-1 rounded-full px-3 py-1 text-xs font-bold transition-all ${speedFilterType === 'above' ? selectedPill : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                        >
                          ABOVE
                        </button>
                        <button 
                          onClick={() => setSpeedFilterType('below')}
                          className={`flex-1 rounded-full px-3 py-1 text-xs font-bold transition-all ${speedFilterType === 'below' ? selectedPill : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                        >
                          BELOW
                        </button>
                      </div>
                      <div className="px-2">
                        <Slider
                          min={0}
                          max={unitSystem === 'imperial' ? 45 : 20}
                          step={0.5}
                          value={displaySpeedThreshold}
                          onChange={(v) => {
                            const n = v as number;
                            setSpeedThresholdMs(unitSystem === 'imperial' ? n / 2.23693629 : n);
                          }}
                          trackStyle={{ backgroundColor: sliderTrack }}
                          railStyle={{ backgroundColor: sliderRail }}
                          handleStyle={{ ...sliderHandle }}
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">0</span>
                          <span className={`text-xs font-bold ${valueInk}`}>{displaySpeedThreshold} {unitSystem === 'imperial' ? 'mph' : 'm/s'}</span>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">{unitSystem === 'imperial' ? '45' : '20'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/40">
                  <div className="flex items-center justify-between gap-2">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Time of day
                    </label>
                    <span className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {formatHourIsolationRange(hourRange)}
                    </span>
                  </div>
                  <p className={`text-[11px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    Isolates this rose only. {HOUR_WRAP_HINT}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {WIND_ROSE_HOUR_PRESETS.map(preset => {
                      const selected = isolationRangesEqual(hourRange, preset.range);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.hint}
                          onClick={() => setHourRange(preset.range)}
                          className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                            selected
                              ? selectedPill
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-2">
                    <WrappingRangeSlider
                      min={0}
                      max={23}
                      value={hourRange}
                      onChange={setHourRange}
                      theme={theme}
                      startAriaLabel="Start hour"
                      endAriaLabel="End hour"
                    />
                    <div className="mt-1 flex justify-between">
                      <span className="text-[11px] text-gray-400">12am</span>
                      <span className="text-[11px] text-gray-400">12pm</span>
                      <span className="text-[11px] text-gray-400">11pm</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Months
                    </label>
                    <span className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {formatMonthIsolationRange(monthRange)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SEASON_MONTH_PRESETS.map(preset => {
                      const selected = isolationRangesEqual(monthRange, preset.range);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setMonthRange(preset.range)}
                          className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                            selected
                              ? selectedPill
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className={`text-[11px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    {MONTH_WRAP_HINT}
                  </p>
                  <div className="px-2">
                    <WrappingRangeSlider
                      min={1}
                      max={12}
                      value={monthRange}
                      onChange={setMonthRange}
                      theme={theme}
                      startAriaLabel="Start month"
                      endAriaLabel="End month"
                    />
                    <div className="mt-1 flex justify-between">
                      <span className="text-[11px] text-gray-400">Jan</span>
                      <span className="text-[11px] text-gray-400">Jun</span>
                      <span className="text-[11px] text-gray-400">Dec</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/40">
                  <div className="flex items-center justify-between gap-2">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Outer circle (hours)
                    </label>
                    {scaleMaxOverride != null ? (
                      <button
                        type="button"
                        onClick={() => setScaleMaxOverride(null)}
                        className={`text-[11px] font-bold uppercase tracking-tight ${linkInk}`}
                      >
                        Reset auto
                      </button>
                    ) : (
                      <span className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        Auto
                      </span>
                    )}
                  </div>
                  <p className={`text-[11px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    Auto uses the busiest direction over the full year ({Math.round(annualMaxHours)} hrs), so day/night and
                    season views stay comparable. If you set a lower max, bars continue past the circle; a mark shows
                    directions that still exceed it.
                  </p>
                  <div className="px-2">
                    <Slider
                      min={1}
                      max={Math.max(Math.round(annualMaxHours * 2), 50)}
                      value={Math.round(scaleMaxHours)}
                      onChange={v => setScaleMaxOverride(v as number)}
                      trackStyle={{ backgroundColor: sliderTrack }}
                          railStyle={{ backgroundColor: sliderRail }}
                      handleStyle={{ ...sliderHandle }}
                    />
                    <div className="mt-1 flex justify-between">
                      <span className="text-[11px] text-gray-400">1</span>
                      <span className={`text-xs font-bold ${valueInk}`}>{Math.round(scaleMaxHours)} hrs</span>
                      <span className="text-[11px] text-gray-400">
                        {Math.max(Math.round(annualMaxHours * 2), 50)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Color Palette</label>
                    <button 
                      onClick={() => setShowGradientModal(true)}
                      className={`text-[11px] font-bold uppercase tracking-tight ${linkInk}`}
                    >
                      + Create
                    </button>
                  </div>
                  <div className={`flex p-1.5 rounded-full overflow-x-auto ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    {paletteGradients.map(g => (
                      <button
                        key={g.id}
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
              </div>
        </div>
      </CardModal>

      <div className="px-1 py-0.5 flex-1 min-h-0 flex flex-col gap-0 overflow-hidden min-w-0">
        <div className="relative flex min-h-0 min-w-0 w-full flex-1 items-center justify-center overflow-hidden">
          {iemSamples.loading && iemControls.source === 'iem' ? (
            <IemWindChartLoadingOverlay
              theme={theme}
              label="Compiling IEM mesonet wind for your year range…"
            />
          ) : null}
          <svg ref={roseRef} className="h-full w-full max-h-full max-w-full" preserveAspectRatio="xMidYMid meet" />
        </div>
        {stackedComparison && compareData && (
        <div className="relative flex min-h-0 min-w-0 w-full flex-1 items-center justify-center overflow-hidden">
          <svg ref={compareRoseRef} className="h-full w-full max-h-full max-w-full" preserveAspectRatio="xMidYMid meet" />
        </div>
        )}
      </div>
    </div>
  );
});
