import { useEffect, useRef, useState, useMemo } from 'react';
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
import { UnitSystem } from '../App';
import { ChartTypeMenu } from './ChartTypeMenu';
import {
  CHART_TOOLBAR_CONTROLS_CLASS,
  CHART_TOOLBAR_EXPORT_ROW_CLASS,
  CHART_TOOLBAR_HEADER_PAD,
  CHART_TOOLBAR_ROW_CLASS,
  chartToolbarTitleClass,
} from '../lib/chartToolbarLayout';
import { ExportHeaderCaption, exportCaptionLinesWithUnit } from './ExportHeaderCaption';
import { CardModal } from './CardModal';
import { defaultGradientIdForVariable } from '../lib/defaultGradientForVariable';
import { sequentialHeatmapColorFn } from '../lib/heatmapColorAdjust';
import { differenceDivergingColor, DIFFERENCE_DIVERGING_ID } from '../lib/differenceDivergingColor';
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
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Quiet gaps between compass labels: SE–SSE and NW–NNW. */
const RING_LABEL_BEARINGS_DEG = [146.25, 326.25];

type WindRoseSeason = 'annual' | 'spring' | 'summer' | 'fall' | 'winter';
type WindRoseHours = 'all' | 'day' | 'night';
type HourMonthRange = [number, number];

const WIND_ROSE_SEASONS: { id: WindRoseSeason; label: string; months: HourMonthRange }[] = [
  { id: 'annual', label: 'Annual', months: [1, 12] },
  { id: 'spring', label: 'Spring', months: [3, 5] },
  { id: 'summer', label: 'Summer', months: [6, 8] },
  { id: 'fall', label: 'Fall', months: [9, 11] },
  { id: 'winter', label: 'Winter', months: [12, 2] },
];

const WIND_ROSE_HOURS: { id: WindRoseHours; label: string; hint: string; hours: HourMonthRange }[] = [
  { id: 'all', label: 'All hours', hint: '12am–11pm', hours: [0, 23] },
  { id: 'day', label: 'Day', hint: '7am–7pm', hours: [7, 19] },
  { id: 'night', label: 'Night', hint: '8pm–7am', hours: [20, 6] },
];

function rangesEqual(a: HourMonthRange, b: HourMonthRange): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function formatHourClock(hour: number): string {
  const suffix = hour >= 12 && hour < 24 ? 'pm' : 'am';
  const hr = hour % 12 === 0 ? 12 : hour % 12;
  return `${hr}${suffix}`;
}

function formatHourRange(range: HourMonthRange): string {
  const label = `${formatHourClock(range[0])}–${formatHourClock(range[1])}`;
  return range[0] <= range[1] ? label : `${label} wrap`;
}

function formatMonthRange(range: HourMonthRange): string {
  const label = `${MONTH_SHORT[range[0] - 1]}–${MONTH_SHORT[range[1] - 1]}`;
  return range[0] <= range[1] ? label : `${label} wrap`;
}

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

export function WindRose({
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
  const skipCompareWindResolution = !(epwCompareRaw && epwCompareRaw.length > 0);

  // For wind roses, preserve multi-year distributions by binning raw ASOS hourly samples across years.
  const iemSamples = useIemAsosWindSamples(metadata, iemControls, false, epwData);
  const iemSamplesCompare = useIemAsosWindSamples(
    compareMetadata ?? metadata,
    iemControls,
    skipCompareWindResolution,
    epwCompareRaw ?? []
  );

  const primWindResolved = useResolvedIemWindRows(epwData, metadata, iemControls, false);
  const cmpWindResolved = useResolvedIemWindRows(epwCompareRaw ?? [], compareMetadata ?? metadata, iemControls, skipCompareWindResolution);

  const data = iemControls.source === 'iem' ? iemSamples.samples : primWindResolved.rows;
  const compareData =
    iemControls.source === 'iem'
      ? (skipCompareWindResolution ? epwCompareRaw : iemSamplesCompare.samples)
      : (skipCompareWindResolution ? epwCompareRaw : cmpWindResolved.rows);

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
  const [tempFilterEnabled, setTempFilterEnabled] = useState(false);
  const [tempThreshold, setTempThreshold] = useState(unitSystem === 'imperial' ? 70 : 21);
  const [tempFilterType, setTempFilterType] = useState<'above' | 'below'>('above');
  
  const [speedFilterEnabled, setSpeedFilterEnabled] = useState(false);
  const [speedThreshold, setSpeedThreshold] = useState(unitSystem === 'imperial' ? 10 : 4.5);
  const [speedFilterType, setSpeedFilterType] = useState<'above' | 'below'>('above');
  const [monthRange, setMonthRange] = useState<HourMonthRange>([1, 12]);
  const [hourRange, setHourRange] = useState<HourMonthRange>([0, 23]);
  const [scaleMaxOverride, setScaleMaxOverride] = useState<number | null>(null);

  const prevUnitSystem = useRef(unitSystem);
  useEffect(() => {
    if (prevUnitSystem.current !== unitSystem) {
      if (unitSystem === 'imperial') {
        setTempThreshold(t => Math.round(t * 9/5 + 32));
        setSpeedThreshold(s => Math.round(s * 2.23694));
      } else {
        setTempThreshold(t => Math.round((t - 32) * 5/9));
        setSpeedThreshold(s => Math.round(s / 2.23694));
      }
      prevUnitSystem.current = unitSystem;
    }
  }, [unitSystem]);

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

  const convertValue = (val: number | null | undefined, unit: string, isDelta: boolean = false) => {
    if (val === null || val === undefined) return 0;
    if (unitSystem === 'imperial') {
      if (unit === '°C') return isDelta ? val * 9/5 : val * 9/5 + 32;
      if (unit === 'm/s') return val * 2.23694;
      if (unit === 'mm') return val / 25.4;
    }
    return val;
  };

  const convertUnit = (unit: string) => {
    if (unitSystem === 'imperial') {
      if (unit === '°C') return '°F';
      if (unit === 'm/s') return 'mph';
      if (unit === 'mm') return 'in';
    }
    return unit;
  };

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
        const temp = convertValue(tempC, '°C');
        if (tempFilterType === 'above') {
          isTempMatch = temp > tempThreshold;
        } else {
          isTempMatch = temp < tempThreshold;
        }
      }

      let isSpeedMatch = true;
      if (speedFilterEnabled) {
        const speed = convertValue(d.windSpeed as number, 'm/s');
        if (speedFilterType === 'above') {
          isSpeedMatch = speed > speedThreshold;
        } else {
          isSpeedMatch = speed < speedThreshold;
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
      tempThreshold,
      tempFilterType,
      speedFilterEnabled,
      speedThreshold,
      speedFilterType,
      unitSystem,
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
      tempThreshold,
      tempFilterType,
      speedFilterEnabled,
      speedThreshold,
      speedFilterType,
      unitSystem,
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
    const maxPrimary = d3.max(directionHourTotals(annualPrimary, numBins)) || 0;
    const maxCompare = annualCompare.length
      ? d3.max(directionHourTotals(annualCompare, numBins)) || 0
      : 0;
    return Math.max(maxPrimary, maxCompare, 1);
  }, [
    data,
    compareData,
    filter,
    tempFilterEnabled,
    tempThreshold,
    tempFilterType,
    speedFilterEnabled,
    speedThreshold,
    speedFilterType,
    unitSystem,
    epwDryBulbLookup,
    compareEpwDryBulbLookup,
    metadata,
    compareMetadata,
    numBins,
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
    const def = variables.find(v => v.id === colorVar) || variables.find(v => v.id === 'windSpeed') || variables[0];
    let min = def.fixedMin !== undefined ? convertValue(def.fixedMin, def.unit) : convertValue(def.min, def.unit);
    let max = def.fixedMax !== undefined ? convertValue(def.fixedMax, def.unit) : convertValue(def.max, def.unit);
    const unit = convertUnit(def.unit);

    if (showDifference && compareData) {
      const diffs = data.map((d, i) => {
        const primaryVal = d[colorVar] as number;
        const compareVal = compareData[i]?.[colorVar] as number;
        if (primaryVal === null || compareVal === null) return 0;
        return compareVal - primaryVal;
      });
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
      <p className="mt-1 text-[10px] italic text-amber-800/90 dark:text-amber-200/80">{iemSamples.fallbackNote}</p>
    ) : null;

  useEffect(() => {
    if (!roseRef.current || !filteredData.length || dimensions.width === 0) return;

    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
    
    let colorScale: (v: number) => string;
    if (showDifference && compareData) {
      colorScale = v => differenceDivergingColor(v, cMin, cMax);
    } else {
      colorScale = sequentialHeatmapColorFn(gradientDef.colors, colorVarDef, cMin, cMax);
    }

    // --- Wind Rose ---
    const roseWidth = 350;
    const roseHeight = 420;
    const roseBottomReserve = 74;
    const compassLabelPad = 12;
    const overflowPad = 24;
    const plotHalf = Math.min(roseWidth, roseHeight - roseBottomReserve) / 2;
    const roseRadius = plotHalf - compassLabelPad - overflowPad;
    const overflowRadiusMax = roseRadius + overflowPad;

    const roseSvg = d3.select(roseRef.current);
    roseSvg.selectAll("*").remove();

    const roseG = roseSvg
      .attr("viewBox", `0 0 ${roseWidth} ${roseHeight}`)
      .append("g")
      .attr(
        "transform",
        `translate(${roseWidth / 2}, ${(roseHeight - roseBottomReserve) / 2})`
      );

    // Group wind by direction
    const binSize = 360 / numBins;
    
    // Create 6 buckets based on the color variable's domain
    const numBuckets = 6;
    const bucketScale = d3.scaleQuantize<number>()
      .domain([cMin, cMax])
      .range(d3.range(numBuckets));
    
    const bins = d3.range(numBins).map(i => ({
      angle: i * binSize,
      buckets: new Array(numBuckets).fill(0),
      totalCount: 0
    }));

    filteredData.forEach(d => {
      const dir = d.windDirection as number;
      const speed = d.windSpeed as number;
      
      let val: number;
      if (showDifference && compareData) {
        const idx = data.indexOf(d);
        const primaryVal = d[colorVar] as number;
        const compareVal = compareData[idx]?.[colorVar] as number;
        if (primaryVal === null || compareVal === null) return;
        val = convertValue(compareVal - primaryVal, colorVarDef.unit, true);
      } else {
        val = convertValue(d[colorVar] as number, colorVarDef.unit);
      }

      if (dir !== null && dir !== undefined && val !== null && val !== undefined && speed > 0) {
        let binIndex = Math.round(dir / binSize) % numBins;
        if (binIndex < 0) binIndex += numBins;
        
        let bucketIndex = bucketScale(val);
        if (bucketIndex === undefined) bucketIndex = 0;
        if (bucketIndex >= numBuckets) bucketIndex = numBuckets - 1;
        
        bins[binIndex].buckets[bucketIndex]++;
        bins[binIndex].totalCount++;
      }
    });

    const scaleMax = Math.max(1, scaleMaxHours);
    const rScaleRose = d3.scaleLinear()
      .domain([0, scaleMax])
      .range([0, roseRadius]);
    // Extend linearly past the outer circle. If a direction would leave the
    // plot, compress that whole stacked bar to overflowRadiusMax and mark it.
    const radiusOf = (hours: number, totalCount: number) => {
      const totalR = rScaleRose(Math.max(totalCount, hours));
      if (totalR <= overflowRadiusMax) return Math.max(0, rScaleRose(hours));
      if (totalCount <= 0) return 0;
      return (Math.max(0, hours) / totalCount) * overflowRadiusMax;
    };
    const binHitsDrawCap = (totalCount: number) => rScaleRose(totalCount) > overflowRadiusMax + 0.5;
    const anyOverflow = bins.some(b => b.totalCount > scaleMax + 0.5);
    const hoursScaleNote =
      scaleMaxOverride == null
        ? `Hours · outer circle ${Math.round(annualMaxHours)} (annual max, any direction)`
        : anyOverflow
          ? `Hours · outer circle ${Math.round(scaleMaxHours)} · bars past the circle exceed this scale`
          : `Hours · outer circle ${Math.round(scaleMaxHours)} (annual max ${Math.round(annualMaxHours)})`;

    // Draw grid circles (always include the outer scale max)
    const ticks = roseScaleTicks(scaleMax);
    roseG.selectAll(".rose-grid")
      .data(ticks)
      .join("circle")
      .attr("class", "rose-grid")
      .attr("r", d => rScaleRose(d))
      .style("fill", "none")
      .style("stroke", roseRingColor(theme))
      .style("stroke-width", d => d === scaleMax ? '2px' : '1.5px')
      .style("stroke-dasharray", "none");

    const ringLabelItems = ticks.flatMap(tick =>
      RING_LABEL_BEARINGS_DEG.map(bearing => ({ tick, bearing }))
    );
    const ringFill = roseRingColor(theme);
    const ringHalo = roseCardFill(theme);
    roseG
      .selectAll(".rose-grid-label")
      .data(ringLabelItems)
      .join("text")
      .attr("class", "rose-grid-label")
      .attr("transform", d => {
        const r = rScaleRose(d.tick);
        const rad = (d.bearing * Math.PI) / 180;
        const x = r * Math.sin(rad);
        const y = -r * Math.cos(rad);
        let rot = d.bearing;
        if (rot > 90 && rot < 270) rot += 180;
        return `translate(${x},${y}) rotate(${rot})`;
      })
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .style("fill", ringFill)
      .style("font-size", "7.5px")
      .style("font-weight", d => (d.tick === scaleMax ? "600" : "500"))
      .style("letter-spacing", "0.02em")
      .style("paint-order", "stroke")
      .style("stroke", ringHalo)
      .style("stroke-width", "2.5px")
      .style("stroke-linejoin", "round")
      .text(d => `${Math.round(d.tick)}`);

    // Draw axis lines (16 compass points)
    roseG.selectAll(".rose-axis")
      .data(d3.range(16))
      .join("line")
      .attr("class", "rose-axis")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", d => roseRadius * Math.sin(d * (360/16) * Math.PI / 180))
      .attr("y2", d => -roseRadius * Math.cos(d * (360/16) * Math.PI / 180))
      .style("stroke", roseRingColor(theme))
      .style("stroke-width", '1px')
      .style("stroke-opacity", 0.5);

    // Stack the buckets
    const stack = d3.stack<any>()
      .keys(d3.range(numBuckets).map(String))
      .value((d, key) => d.buckets[Number(key)]);
    
    const series = stack(bins);
    
    const wedges: any[] = [];
    series.forEach((s) => {
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
            extent: extent
          });
        }
      });
    });

    const visibleWedges = wedges.filter(d => {
      const inner = radiusOf(d.inner, d.totalCount);
      const outer = radiusOf(d.outer, d.totalCount);
      return outer - inner > 0.25;
    });

    const arc = d3.arc<any>()
      .innerRadius(d => radiusOf(d.inner, d.totalCount))
      .outerRadius(d => Math.max(radiusOf(d.inner, d.totalCount), radiusOf(d.outer, d.totalCount)))
      .startAngle(d => (d.angle - binSize / 2) * Math.PI / 180)
      .endAngle(d => (d.angle + binSize / 2) * Math.PI / 180);

    roseG.selectAll(".rose-wedge")
      .data(visibleWedges)
      .join("path")
      .attr("class", "rose-wedge")
      .attr("d", arc)
      .style("fill", d => {
        const midVal = (d.extent[0] + d.extent[1]) / 2;
        return colorScale(midVal);
      })
      .style("stroke", "#ffffff")
      .style("stroke-width", "0.5px")
      .append("title")
      .text(d => {
        const over = d.totalCount > scaleMax;
        return `Direction: ${Math.round(d.angle)}°\nRange: ${d.extent[0].toFixed(1)} - ${d.extent[1].toFixed(1)} ${cUnit}\nCount: ${d.count} hours${
          over ? `\nDirection total ${Math.round(d.totalCount)} hrs exceeds outer circle (${Math.round(scaleMax)} hrs)` : ''
        }`;
      });

    const overflowChevrons = bins.filter(b => binHitsDrawCap(b.totalCount));
    roseG
      .selectAll(".rose-overflow")
      .data(overflowChevrons)
      .join("path")
      .attr("class", "rose-overflow")
      .attr("d", d => {
        const ang = (d.angle * Math.PI) / 180;
        const r = overflowRadiusMax;
        const tipR = r + 8;
        const half = 4.6;
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
      .style("fill", heatmapTextColor)
      .style("stroke", roseCardFill(theme))
      .style("stroke-width", "1.2px")
      .style("opacity", 0.9)
      .append("title")
      .text(d => `${Math.round(d.totalCount)} hrs exceeds outer circle (${Math.round(scaleMax)} hrs)`);

    roseG.selectAll(".rose-label")
      .data(d3.range(16))
      .join("text")
      .attr("class", "rose-label")
      .attr("x", d => (overflowRadiusMax + 10) * Math.sin(d * (360/16) * Math.PI / 180))
      .attr("y", d => -(overflowRadiusMax + 10) * Math.cos(d * (360/16) * Math.PI / 180))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("fill", heatmapTextColor)
      .style("font-size", d => d % 2 === 0 ? `10px` : `8px`)
      .style("font-weight", d => d % 4 === 0 ? "bold" : "normal")
      .text(d => COMPASS_POINTS[d]);

    // --- Wind Rose Legend ---
    const legendItemWidth = 50;
    const totalLegendWidth = numBuckets * legendItemWidth;
    const legendG = roseSvg.append("g")
      .attr("transform", `translate(${(roseWidth - totalLegendWidth) / 2}, ${roseHeight - 48})`);

    const legendItems = d3.range(numBuckets);
    const itemHeight = 14;

    legendG.append("text")
      .attr("x", totalLegendWidth / 2)
      .attr("y", 0)
      .attr("text-anchor", "middle")
      .style("font-size", `9px`)
      .style("font-weight", "bold")
      .style("fill", heatmapTextColor)
      .text(`Wind Speed (${cUnit})`);

    legendG.selectAll(".rose-legend-item")
      .data(legendItems)
      .join("g")
      .attr("transform", (d, i) => `translate(${i * legendItemWidth}, 8)`)
      .each(function(d) {
        const itemG = d3.select(this);
        const extent = bucketScale.invertExtent(d);
        if (!extent[0] && extent[0] !== 0) return;
        
        const midVal = (extent[0] + extent[1]) / 2;

        itemG.append("rect")
          .attr("width", 12)
          .attr("height", itemHeight)
          .attr("rx", 2)
          .style("fill", colorScale(midVal));

        itemG.append("text")
          .attr("x", 16)
          .attr("y", itemHeight / 2)
          .attr("dy", "0.35em")
          .style("font-size", `7px`)
          .style("fill", heatmapTextColor)
          .text(`${extent[0].toFixed(1)}-${extent[1].toFixed(1)}`);
      });

    legendG.append("text")
      .attr("x", totalLegendWidth / 2)
      .attr("y", 36)
      .attr("text-anchor", "middle")
      .style("font-size", "7.5px")
      .style("fill", heatmapTextColor)
      .style("opacity", 0.8)
      .text(hoursScaleNote);

  }, [filteredData, data, compareData, showDifference, variables, colorVar, gradientId, gradients, filter, dimensions.width, numBins, unitSystem, heatmapTextColor, theme, scaleMaxHours, scaleMaxOverride, annualMaxHours]);

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
            <div
              className={`mb-1.5 rounded-lg border px-1.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide ${
                theme === 'dark'
                  ? 'border-orange-800/60 bg-orange-950/45 text-orange-100'
                  : 'border-orange-200 bg-orange-50 text-orange-900'
              }`}
            >
              Comparison · {paneCity ?? '—'}
            </div>
            <div className="flex min-h-[24px] items-center justify-end gap-1">
              <button
                type="button"
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
            </div>
              {iemWindFallbackOnly}
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
                Baseline · {paneCity}
              </div>
            )}
            <div className={`relative ${CHART_TOOLBAR_ROW_CLASS} w-full`}>
              <div
                className={`${CHART_TOOLBAR_CONTROLS_CLASS} transition-[padding] duration-200 ease-out ${
                  showSettings
                    ? onRemove
                      ? 'pr-[4.75rem]'
                      : 'pr-9'
                    : onRemove
                      ? 'pr-0 group-hover:pr-[4.75rem] focus-within:pr-[4.75rem]'
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
                  title="Wind Direction"
                >
                  Wind Direction
                </span>
              </div>
              <div
                className={`absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 items-center gap-1 transition-opacity duration-200 ease-out ${
                  showSettings
                    ? 'opacity-100'
                    : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
                }`}
              >
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
                {onRemove && (
                  <button
                    type="button"
                    onClick={onRemove}
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${theme === 'dark' ? 'text-gray-400 hover:bg-red-900/20 hover:text-red-400' : 'text-gray-400 hover:bg-red-50 hover:text-red-500'}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
              {iemWindFallbackOnly}
          </>
        )}
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
                    className={`w-full text-sm rounded-lg block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                  >
                    <option value={8}>8 Directions (Basic)</option>
                    <option value={16}>16 Directions (Standard)</option>
                    <option value={36}>36 Directions (Detailed)</option>
                    <option value={72}>72 Directions (High Res)</option>
                  </select>
                </div>

                <div className="space-y-3 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Temperature Filter</label>
                    <input 
                      type="checkbox" 
                      checked={tempFilterEnabled} 
                      onChange={e => setTempFilterEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  {tempFilterEnabled && (
                    <div className="space-y-3 pt-1">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setTempFilterType('above')}
                          className={`flex-1 rounded-full border px-2 py-1 text-[10px] font-bold transition-all ${tempFilterType === 'above' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-gray-300 text-gray-500'}`}
                        >
                          ABOVE
                        </button>
                        <button 
                          onClick={() => setTempFilterType('below')}
                          className={`flex-1 rounded-full border px-2 py-1 text-[10px] font-bold transition-all ${tempFilterType === 'below' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-gray-300 text-gray-500'}`}
                        >
                          BELOW
                        </button>
                      </div>
                      <div className="px-2">
                        <Slider 
                          min={unitSystem === 'imperial' ? 0 : -20} 
                          max={unitSystem === 'imperial' ? 120 : 50} 
                          value={tempThreshold} 
                          onChange={(v) => setTempThreshold(v as number)}
                          trackStyle={{ backgroundColor: '#3b82f6' }}
                          handleStyle={{ borderColor: '#3b82f6', backgroundColor: '#fff' }}
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-gray-400">{unitSystem === 'imperial' ? '0°F' : '-20°C'}</span>
                          <span className="text-xs font-bold text-blue-500">{tempThreshold}{unitSystem === 'imperial' ? '°F' : '°C'}</span>
                          <span className="text-[10px] text-gray-400">{unitSystem === 'imperial' ? '120°F' : '50°C'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Wind Speed Filter</label>
                    <input 
                      type="checkbox" 
                      checked={speedFilterEnabled} 
                      onChange={e => setSpeedFilterEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  {speedFilterEnabled && (
                    <div className="space-y-3 pt-1">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSpeedFilterType('above')}
                          className={`flex-1 rounded-full border px-2 py-1 text-[10px] font-bold transition-all ${speedFilterType === 'above' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-gray-300 text-gray-500'}`}
                        >
                          ABOVE
                        </button>
                        <button 
                          onClick={() => setSpeedFilterType('below')}
                          className={`flex-1 rounded-full border px-2 py-1 text-[10px] font-bold transition-all ${speedFilterType === 'below' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-gray-300 text-gray-500'}`}
                        >
                          BELOW
                        </button>
                      </div>
                      <div className="px-2">
                        <Slider 
                          min={0} 
                          max={unitSystem === 'imperial' ? 45 : 20} 
                          value={speedThreshold} 
                          onChange={(v) => setSpeedThreshold(v as number)}
                          trackStyle={{ backgroundColor: '#3b82f6' }}
                          handleStyle={{ borderColor: '#3b82f6', backgroundColor: '#fff' }}
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-gray-400">0</span>
                          <span className="text-xs font-bold text-blue-500">{speedThreshold}{unitSystem === 'imperial' ? 'mph' : 'm/s'}</span>
                          <span className="text-[10px] text-gray-400">{unitSystem === 'imperial' ? '45' : '20'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                  <div className="flex items-center justify-between gap-2">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Time of day
                    </label>
                    <span className={`text-[10px] font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {formatHourRange(hourRange)}
                    </span>
                  </div>
                  <p className={`text-[10px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    Isolates this rose only. Night wraps 8pm–7am for night ventilation.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {WIND_ROSE_HOURS.map(preset => {
                      const selected = rangesEqual(hourRange, preset.hours);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.hint}
                          onClick={() => setHourRange(preset.hours)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all ${
                            selected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-300 bg-transparent text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-2">
                    <Slider
                      range
                      allowCross
                      min={0}
                      max={23}
                      value={hourRange}
                      onChange={v => {
                        if (Array.isArray(v)) setHourRange([v[0], v[1]]);
                      }}
                      trackStyle={{ backgroundColor: '#3b82f6' }}
                      handleStyle={[
                        { borderColor: '#3b82f6', backgroundColor: '#fff' },
                        { borderColor: '#3b82f6', backgroundColor: '#fff' },
                      ]}
                    />
                    <div className="mt-1 flex justify-between">
                      <span className="text-[10px] text-gray-400">12am</span>
                      <span className="text-[10px] text-gray-400">12pm</span>
                      <span className="text-[10px] text-gray-400">11pm</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Months
                    </label>
                    <span className={`text-[10px] font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {formatMonthRange(monthRange)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {WIND_ROSE_SEASONS.map(preset => {
                      const selected = rangesEqual(monthRange, preset.months);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setMonthRange(preset.months)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all ${
                            selected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-300 bg-transparent text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-2">
                    <Slider
                      range
                      allowCross
                      min={1}
                      max={12}
                      value={monthRange}
                      onChange={v => {
                        if (Array.isArray(v)) setMonthRange([v[0], v[1]]);
                      }}
                      trackStyle={{ backgroundColor: '#3b82f6' }}
                      handleStyle={[
                        { borderColor: '#3b82f6', backgroundColor: '#fff' },
                        { borderColor: '#3b82f6', backgroundColor: '#fff' },
                      ]}
                    />
                    <div className="mt-1 flex justify-between">
                      <span className="text-[10px] text-gray-400">Jan</span>
                      <span className="text-[10px] text-gray-400">Jun</span>
                      <span className="text-[10px] text-gray-400">Dec</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                  <div className="flex items-center justify-between gap-2">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Outer circle (hours)
                    </label>
                    {scaleMaxOverride != null ? (
                      <button
                        type="button"
                        onClick={() => setScaleMaxOverride(null)}
                        className="text-[10px] font-bold uppercase tracking-tight text-blue-500 hover:text-blue-600"
                      >
                        Reset auto
                      </button>
                    ) : (
                      <span className={`text-[10px] font-semibold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        Auto
                      </span>
                    )}
                  </div>
                  <p className={`text-[10px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
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
                      trackStyle={{ backgroundColor: '#3b82f6' }}
                      handleStyle={{ borderColor: '#3b82f6', backgroundColor: '#fff' }}
                    />
                    <div className="mt-1 flex justify-between">
                      <span className="text-[10px] text-gray-400">1</span>
                      <span className="text-xs font-bold text-blue-500">{Math.round(scaleMaxHours)} hrs</span>
                      <span className="text-[10px] text-gray-400">
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
                      className="text-[10px] font-bold text-blue-500 hover:text-blue-600 uppercase tracking-tight"
                    >
                      + Create
                    </button>
                  </div>
                  <div className={`flex p-1.5 rounded-lg overflow-x-auto border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    {paletteGradients.map(g => (
                      <button
                        key={g.id}
                        onClick={() => setGradientId(g.id)}
                        className={`mx-1 h-8 w-8 flex-shrink-0 rounded-full border-2 transition-all shadow-hard-sm ${
                          gradientId === g.id ? 'border-blue-500 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
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
          {primWindResolved.loadingIem && iemControls.source === 'iem' ? (
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
}
