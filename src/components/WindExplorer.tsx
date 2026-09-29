import { useCallback, useEffect, useId, useRef, useState, useMemo } from 'react';
import { useIsMobileMaxSm } from '../hooks/useIsMobileMaxSm';
import { useTutorialLiveOptional } from '../context/TutorialLiveContext';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { EPWDataRow, EPWMetadata, EPWVariable } from '../lib/epwParser';
import { sequentialHeatmapColorFn } from '../lib/heatmapColorAdjust';
import {
  createExplorerChartValueGradient,
  explorerChartValueGradientId,
  upsertSvgDefs,
} from '../lib/explorerBarGradient';
import { differenceDivergingColor, DIFFERENCE_DIVERGING_ID } from '../lib/differenceDivergingColor';
import { dataExplorerDiffValuesForAggregation } from '../lib/dataExplorerDiffAggregation';
import { symmetricDiffBound } from '../lib/symmetricDiffDomain';
import {
  isSolarNightEpwStation,
  solarNightOverlayRgba,
  solarNightParamsFromHeatmapDatum,
} from '../lib/solarNightHeatmap';
import { InteractiveLegend, GradientDef } from './InteractiveLegend';
import { AggregationToolbar } from './AggregationToolbar';
import type { ChartType, CompareWindSharedControls } from '../App';
import { X, Settings2 } from 'lucide-react';

import type { BarChartFillMode, GlobalFilterState, HeatmapCellStatistic } from '../lib/globalFilter';
import {
  aggregateCellStatistic,
  explorerBarSolidColor,
  explorerBarStatisticY,
  rowPassesGlobalFilters,
} from '../lib/globalFilter';
import { UnitSystem } from '../App';
import { ChartTypeMenu } from './ChartTypeMenu';
import { ExportHeaderCaption, exportCaptionLinesWithUnit } from './ExportHeaderCaption';
import { VariableChartSelect } from './VariableChartSelect';
import {
  CHART_TOOLBAR_CONTROLS_CLASS,
  CHART_TOOLBAR_EXPORT_ROW_CLASS,
  CHART_TOOLBAR_HEADER_PAD,
  CHART_TOOLBAR_ROW_CLASS,
} from '../lib/chartToolbarLayout';
import { CardModal } from './CardModal';
import { defaultGradientIdForVariable } from '../lib/defaultGradientForVariable';
import { formatEpwStationDate, formatEpwStationDateTime, formatEpwStationHour } from '../lib/formatEpwStationClock';
import { gradientsForVariable } from '../lib/availableGradientsForVariable';
import { useWindIemGlobalPrefs } from '../lib/iem/globalWindIemPrefsStore';
import { useResolvedIemWindRows } from '../hooks/useResolvedIemWindRows';
import {
  buildEpwDryBulbStationClockLookup,
  resolveWindRowDryBulbC,
} from '../lib/iem/mergeEpwWind';
import { IemWindChartLoadingOverlay } from './IemWindSetupModal';
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

interface WindExplorerProps {
  data: EPWDataRow[];
  compareData?: EPWDataRow[];
  showDifference?: boolean;
  stackedComparison?: boolean;
  variables: EPWVariable[];
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
  /** Site location for solar diurnal shading on Solar-category 12×24 heatmaps. */
  metadata?: EPWMetadata;
  /** LOCATION for the comparison file when merging IEM winds in difference/stacked layouts. */
  compareMetadata?: EPWMetadata;
  comparePane?: 'primary' | 'secondary';
  paneCity?: string;
  pairSuppressHeader?: boolean;
  pairModalHost?: boolean;
  windShared?: CompareWindSharedControls;
  tutorialLegendDomId?: string;
  tutorialChromeAnchors?: boolean;
  pairSuppressFooterLegend?: boolean;
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function getCompassDirection(degrees: number): string {
  const val = Math.floor((degrees / 22.5) + 0.5);
  return COMPASS_POINTS[(val % 16)];
}

function averageWindVector(values: EPWDataRow[], compareData?: EPWDataRow[], data?: EPWDataRow[], showDifference?: boolean): { speed: number, direction: number } {
  let sumU = 0;
  let sumV = 0;
  let count = 0;

  values.forEach(d => {
    const speed = d.windSpeed as number;
    const dir = d.windDirection as number;
    if (speed !== undefined && dir !== undefined) {
      if (showDifference && compareData && data) {
        const idx = data.indexOf(d);
        const cD = compareData[idx];
        if (cD) {
          const cSpeed = cD.windSpeed as number;
          const cDir = cD.windDirection as number;
          if (cSpeed !== undefined && cDir !== undefined) {
            const rad = dir * Math.PI / 180;
            const cRad = cDir * Math.PI / 180;
            // Vector difference
            sumU += (-speed * Math.sin(rad)) - (-cSpeed * Math.sin(cRad));
            sumV += (-speed * Math.cos(rad)) - (-cSpeed * Math.cos(cRad));
            count++;
          }
        }
      } else {
        const rad = dir * Math.PI / 180;
        sumU += -speed * Math.sin(rad);
        sumV += -speed * Math.cos(rad);
        count++;
      }
    }
  });

  if (count === 0) return { speed: 0, direction: 0 };

  const avgU = sumU / count;
  const avgV = sumV / count;
  
  const avgSpeed = Math.sqrt(avgU * avgU + avgV * avgV);
  let avgDir = Math.atan2(-avgU, -avgV) * 180 / Math.PI;
  if (avgDir < 0) avgDir += 360;

  return { speed: avgSpeed, direction: avgDir };
}

export function WindExplorer({
  data: epwData,
  compareData: epwCompareRaw,
  showDifference,
  stackedComparison,
  variables,
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
  metadata,
  compareMetadata,
  comparePane,
  paneCity,
  pairSuppressHeader,
  pairModalHost,
  windShared,
  tutorialLegendDomId,
  tutorialChromeAnchors,
  pairSuppressFooterLegend,
}: WindExplorerProps) {
  const barGradientSvgId = explorerChartValueGradientId(useId());
  const svgRef = useRef<SVGSVGElement>(null);
  const compareSvgRef = useRef<SVGSVGElement>(null);

  const globalIemPrefs = useWindIemGlobalPrefs();
  const iemControls = windShared?.iem ?? globalIemPrefs;
  const skipCompareWindResolution = !(epwCompareRaw && epwCompareRaw.length > 0);
  const primWindResolved = useResolvedIemWindRows(epwData, metadata, iemControls, false);
  const cmpWindResolved = useResolvedIemWindRows(
    epwCompareRaw ?? [],
    compareMetadata ?? metadata,
    iemControls,
    skipCompareWindResolution
  );
  const vizData = primWindResolved.rows;
  const vizCompare = skipCompareWindResolution ? epwCompareRaw : cmpWindResolved.rows;
  /** EPW timelines with optional IEM substitution for hourly wind vectors. */
  const data = vizData;
  const compareData = vizCompare;
  const [iAgg, setIAgg] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const aggregation = windShared?.aggregation ?? iAgg;
  const setAggregation = windShared?.setAggregation ?? setIAgg;

  const [iColor, setIColor] = useState(variables.find(v => v.id === 'windSpeed')?.id || variables[0]?.id || '');
  const colorVar = windShared?.colorVar ?? iColor;
  const setColorVar = windShared?.setColorVar ?? setIColor;

  const [iGrad, setIGrad] = useState(gradients[0].id);
  const gradientId = windShared?.gradientId ?? iGrad;
  const setGradientId = windShared?.setGradientId ?? setIGrad;

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
  const showSettings = windShared?.showSettings ?? iShowSettings;
  const setShowSettings = windShared?.setShowSettings ?? setIShowSettings;

  const [iShowStats, setIShowStats] = useState(false);
  const showStats = windShared?.showStats ?? iShowStats;
  const setShowStats = windShared?.setShowStats ?? setIShowStats;

  const showStatsModal = showStats && (!pairSuppressHeader || pairModalHost);
  const showSettingsModal = showSettings && (!pairSuppressHeader || pairModalHost);

  const paletteGradients = useMemo(
    () => gradientsForVariable(colorVar, variables, gradients),
    [colorVar, variables, gradients]
  );
  const isMobile = useIsMobileMaxSm();
  const expandChromeStrip = !exportMode && (tutorialChromeAnchors || isMobile);
  const chartToolbarRevealClass = expandChromeStrip
    ? 'pointer-events-auto max-h-[52px] overflow-visible opacity-100 pt-1 transition-[max-height,opacity] duration-200 ease-out'
    : 'pointer-events-none max-h-0 overflow-hidden opacity-0 transition-[max-height,opacity] duration-200 ease-out group-hover:pointer-events-auto group-hover:max-h-[48px] group-hover:opacity-100 focus-within:pointer-events-auto focus-within:max-h-[48px] focus-within:opacity-100';
  const removeBtnRevealClass = isMobile
    ? 'pointer-events-auto opacity-100'
    : 'pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100';
  // chart type switching handled by ChartTypeMenu

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

  const [tempFilterEnabled, setTempFilterEnabled] = useState(false);
  const [tempThreshold, setTempThreshold] = useState(unitSystem === 'imperial' ? 70 : 21);
  const [tempFilterType, setTempFilterType] = useState<'above' | 'below'>('above');
  
  const [speedFilterEnabled, setSpeedFilterEnabled] = useState(false);
  const [speedThreshold, setSpeedThreshold] = useState(unitSystem === 'imperial' ? 10 : 4.5);
  const [speedFilterType, setSpeedFilterType] = useState<'above' | 'below'>('above');

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

  const convertValue = useCallback((val: number | null | undefined, unit: string, isDelta: boolean = false) => {
    if (val === null || val === undefined) return 0;
    if (unitSystem === 'imperial') {
      if (unit === '°C') return isDelta ? val * 9/5 : val * 9/5 + 32;
      if (unit === 'm/s') return val * 2.23694;
      if (unit === 'mm') return val / 25.4;
    }
    return val;
  }, [unitSystem]);

  const applyPreset = (type: 'summer' | 'winter' | 'pedestrian' | 'sitting') => {
    switch (type) {
      case 'summer':
        setTempFilterEnabled(true);
        setTempThreshold(unitSystem === 'imperial' ? 75 : 24);
        setTempFilterType('above');
        setSpeedFilterEnabled(true);
        setSpeedThreshold(unitSystem === 'imperial' ? 3.4 : 1.5);
        setSpeedFilterType('above');
        break;
      case 'winter':
        setTempFilterEnabled(true);
        setTempThreshold(unitSystem === 'imperial' ? 50 : 10);
        setTempFilterType('below');
        setSpeedFilterEnabled(true);
        setSpeedThreshold(unitSystem === 'imperial' ? 4.5 : 2.0);
        setSpeedFilterType('above');
        break;
      case 'pedestrian':
        setTempFilterEnabled(false);
        setSpeedFilterEnabled(true);
        setSpeedThreshold(unitSystem === 'imperial' ? 11.2 : 5.0);
        setSpeedFilterType('below');
        break;
      case 'sitting':
        setTempFilterEnabled(false);
        setSpeedFilterEnabled(true);
        setSpeedThreshold(unitSystem === 'imperial' ? 4.5 : 2.0);
        setSpeedFilterType('below');
        break;
    }
  };

  const convertUnit = (unit: string) => {
    if (unitSystem === 'imperial') {
      if (unit === '°C') return '°F';
      if (unit === 'm/s') return 'mph';
      if (unit === 'mm') return 'in';
    }
    return unit;
  };

  // Group variables by category
  const groupedVariables = variables.reduce((acc, variable) => {
    const category = variable.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(variable);
    return acc;
  }, {} as Record<string, EPWVariable[]>);

  const tutorialLive = useTutorialLiveOptional();
  const tutorialReport = tutorialLive?.report;
  const tutorialEnabled = tutorialLive?.enabled;
  useEffect(() => {
    if (!tutorialEnabled || !tutorialReport) return;
    const v = variables.find(x => x.id === colorVar);
    tutorialReport({
      aggregation,
      colorVarId: colorVar,
      colorVarName: v?.name,
    });
  }, [tutorialEnabled, tutorialReport, aggregation, colorVar, variables]);

  const epwDryBulbLookup = useMemo(
    () => (epwData.length ? buildEpwDryBulbStationClockLookup(epwData) : null),
    [epwData]
  );

  // Calculate local stats for filtered data
  const filteredData = useMemo((): EPWDataRow[] => {
    return data.filter(d => {
      if (!rowPassesGlobalFilters(d, filter)) return false;

      let isTempMatch = true;
      if (tempFilterEnabled) {
        const tempC = resolveWindRowDryBulbC(d, epwDryBulbLookup, metadata);
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
        const speed = convertValue(d.windSpeed, 'm/s');
        if (speedFilterType === 'above') {
          isSpeedMatch = speed > speedThreshold;
        } else {
          isSpeedMatch = speed < speedThreshold;
        }
      }

      return isTempMatch && isSpeedMatch;
    });
  }, [
    data,
    filter,
    tempFilterEnabled,
    tempThreshold,
    tempFilterType,
    speedFilterEnabled,
    speedThreshold,
    speedFilterType,
    unitSystem,
    epwDryBulbLookup,
    metadata,
    convertValue,
  ]);

  const { colorVarDef, cMin, cMax, cUnit } = useMemo(() => {
    const def = variables.find(v => v.id === colorVar) || variables.find(v => v.id === 'windSpeed') || variables[0];
    let min = def.fixedMin !== undefined ? convertValue(def.fixedMin, def.unit) : convertValue(def.min, def.unit);
    let max = def.fixedMax !== undefined ? convertValue(def.fixedMax, def.unit) : convertValue(def.max, def.unit);
    const unit = convertUnit(def.unit);

    if (showDifference && compareData) {
      const diffs = dataExplorerDiffValuesForAggregation(
        aggregation,
        data,
        compareData,
        colorVar,
        def.unit,
        convertValue,
        filteredData
      );
      const bound = symmetricDiffBound(diffs);
      const half = bound > 0 ? bound : 1;
      min = -half;
      max = half;
    }
    return { colorVarDef: def, cMin: min, cMax: max, cUnit: unit };
  }, [variables, colorVar, showDifference, compareData, data, unitSystem, aggregation, convertValue, filteredData]);

  const colorVarLabel = `${colorVarDef.name} (${cUnit})`;

  const windExplorerLegendFootnote = useMemo(() => {
    if (showDifference && compareData) {
      return 'Compare lines: baseline vs comparison averages; shading shows the gap.';
    }
    if (aggregation !== 'hour') {
      return 'Bars span hourly minimum to maximum.';
    }
    return '';
  }, [showDifference, compareData, aggregation]);

  const iemWindFallbackOnly =
    iemControls.source === 'iem' && primWindResolved.iemFallbackNote ? (
      <p className="mt-1 text-[10px] italic text-amber-800/90 dark:text-amber-200/80">{primWindResolved.iemFallbackNote}</p>
    ) : null;

  useEffect(() => {
    if (!svgRef.current || !filteredData.length || dimensions.width === 0) {
      d3.select(svgRef.current).selectAll("*").remove();
      return;
    }

    const rows: EPWDataRow[] = filteredData as EPWDataRow[];

    // --- Main Chart (1224 + Bar) ---
    const width = EXPLORER_SVG_BASE_WIDTH;
    const margin = EXPLORER_SVG_MARGIN;
    const innerWidth = explorerInnerWidth();
    const barChartHeight = explorerBarChartHeightPx();
    const monthAxisBand = EXPLORER_MONTH_AXIS_BAND_PX;
    const heatmapBodyHeight = explorerHeatmapHeightPx();
    const height = explorerSvgHeightPx();

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const svgDefs = upsertSvgDefs(svg);

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // --- Data Processing ---
    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];

    let colorScale: (v: number) => string;
    if (showDifference && compareData) {
      colorScale = v => differenceDivergingColor(v, cMin, cMax);
    } else {
      colorScale = sequentialHeatmapColorFn(gradientDef.colors, colorVarDef, cMin, cMax);
    }

    const solarNightOverlayEnabled =
      !!metadata &&
      Number.isFinite(metadata.lat) &&
      Number.isFinite(metadata.lng) &&
      Number.isFinite(metadata.timeZone) &&
      colorVarDef.category === 'Solar' &&
      !(showDifference && compareData);

    // X Scale for left charts (Day of Year 1-365)
    const xScale = d3.scaleLinear()
      .domain([1, 366])
      .range([0, innerWidth]);

    const barChartG = g.append("g");

    // --- Heatmap ---
    const heatmapG = g.append("g").attr("transform", `translate(0, ${barChartHeight})`);

    // Aggregate data for heatmap
    let heatmapData: any[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const aggVarSeries = (values: EPWDataRow[]) =>
      aggregateCellStatistic(
        values.map(r => r[colorVar] as number).filter(x => typeof x === 'number' && !Number.isNaN(x)),
        heatmapCellStatistic
      );

    if (aggregation === 'month') {
      const groups = d3.group(rows, d => d.month, d => d.hour);
      Array.from(groups).forEach(([month, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = values[0].dayOfYear;
          const endDay = values[values.length - 1].dayOfYear + 1;
          
          let val: number;
          let wind: { speed: number, direction: number };
          if (showDifference && compareData) {
            const p = aggVarSeries(values);
            const cmpVals = values
              .map(v => compareData[data.indexOf(v)]?.[colorVar] as number)
              .filter((x): x is number => x != null && typeof x === 'number' && !Number.isNaN(x));
            const c = aggregateCellStatistic(cmpVals, heatmapCellStatistic);
            val = convertValue(c - p, colorVarDef.unit, true);
            wind = averageWindVector(values, compareData, data, showDifference);
          } else {
            val = convertValue(aggVarSeries(values), colorVarDef.unit);
            wind = averageWindVector(values);
          }
          const { speed, direction } = wind;
          const midM = values[Math.floor(values.length / 2)];
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            value: val,
            direction: direction,
            label: `${monthNames[month - 1]}`,
            tooltip: `${monthNames[month - 1]} ${formatEpwStationHour(hour)} ${showDifference ? 'Diff' : 'Avg'}\n${colorVarDef.name}: ${val.toFixed(1)} ${cUnit}\nDir: ${getCompassDirection(direction)} (${Math.round(direction)}°)`,
            sunYear: values[0].year,
            sunMonth: month,
            sunDay: 15,
            sunHour: hour,
            solarStandardClock: midM.solarStandardClock,
          });
        });
      });
    } else if (aggregation === 'week') {
      const groups = d3.group(rows, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      Array.from(groups).forEach(([week, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = week * 7 + 1;
          const endDay = Math.min((week + 1) * 7 + 1, 366);
          let val: number;
          let wind: { speed: number, direction: number };
          if (showDifference && compareData) {
            const p = aggVarSeries(values);
            const cmpVals = values
              .map(v => compareData[data.indexOf(v)]?.[colorVar] as number)
              .filter((x): x is number => x != null && typeof x === 'number' && !Number.isNaN(x));
            const c = aggregateCellStatistic(cmpVals, heatmapCellStatistic);
            val = convertValue(c - p, colorVarDef.unit, true);
            wind = averageWindVector(values, compareData, data, showDifference);
          } else {
            val = convertValue(aggVarSeries(values), colorVarDef.unit);
            wind = averageWindVector(values);
          }
          const { speed, direction } = wind;
          const month = values[0].month;
          const mid = values[Math.floor(values.length / 2)];
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            value: val,
            direction: direction,
            label: `W${week + 1}`,
            tooltip: `Week ${week + 1} ${formatEpwStationHour(hour)} ${showDifference ? 'Diff' : 'Avg'}\n${colorVarDef.name}: ${val.toFixed(1)} ${cUnit}\nDir: ${getCompassDirection(direction)} (${Math.round(direction)}°)`,
            sunYear: mid.year,
            sunMonth: mid.month,
            sunDay: mid.day,
            sunHour: hour,
            solarStandardClock: mid.solarStandardClock,
          });
        });
      });
    } else {
      // day or hour
      heatmapData = rows.map(d => {
        const i = data.indexOf(d);
        const pv = aggregateCellStatistic([d[colorVar] as number], heatmapCellStatistic);
        const cmpRaw = compareData?.[i]?.[colorVar];
        const cv = aggregateCellStatistic(
          cmpRaw != null && typeof cmpRaw === 'number' ? [cmpRaw as number] : [],
          heatmapCellStatistic
        );
        const val =
          showDifference && compareData
            ? convertValue(cv - pv, colorVarDef.unit, true)
            : convertValue(pv, colorVarDef.unit);
        const comp =
          showDifference && compareData
            ? `Diff\n${colorVarDef.name}: ${val.toFixed(1)} ${cUnit}`
            : `${colorVarDef.name}: ${val.toFixed(1)} ${cUnit}`;
        return {
          x0: d.dayOfYear,
          x1: d.dayOfYear + 1,
          y: d.hour,
          month: d.month,
          value: val,
          direction: d.windDirection as number,
          label: formatEpwStationDate(d),
          tooltip: `${formatEpwStationDateTime(d)}\n${comp}\nDir: ${getCompassDirection(d.windDirection as number)} (${d.windDirection}°)`,
          sunYear: d.year,
          sunMonth: d.month,
          sunDay: d.day,
          sunHour: d.hour,
          solarStandardClock: d.solarStandardClock,
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
      })
      .style("opacity", d => {
        const isMonthMatch =
          filter.startMonth <= filter.endMonth
            ? d.month >= filter.startMonth && d.month <= filter.endMonth
            : d.month >= filter.startMonth || d.month <= filter.endMonth;
        const isHourMatch = d.y >= filter.startHour && d.y <= filter.endHour;
        return isMonthMatch && isHourMatch ? 1 : 0.2;
      });

    cells
      .append("rect")
      .attr("width", d =>
        explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width
      )
      .attr("height", d => rowInnerHeight(d.y))
      .attr("rx", 2) // Smaller corner radius
      .attr("ry", 2)
      .style("fill", d => colorScale(d.value))
      .style("stroke", (aggregation === 'month' || aggregation === 'week') ? "rgba(0,0,0,0.1)" : "none")
      .style("stroke-width", "1px")
      .append("title")
      .text(d => d.tooltip);

    if (solarNightOverlayEnabled) {
      cells
        .append("rect")
        .attr("width", d =>
          explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width
        )
        .attr("height", d => rowInnerHeight(d.y))
        .attr("rx", 2)
        .attr("ry", 2)
        .style("fill", solarNightOverlayRgba(theme))
        .style("stroke", "none")
        .style("pointer-events", "none")
        .style("opacity", d =>
          isSolarNightEpwStation(
            metadata!.lat,
            metadata!.lng,
            solarNightParamsFromHeatmapDatum(d, metadata!.timeZone)
          )
            ? 1
            : 0
        );
    }

    // Overlay text for wind direction
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
        .style("opacity", 1)
        .text(d =>
          explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width > overlayMinWidth
            ? getCompassDirection(d.direction)
            : ""
        );
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
        .attr("stroke", heatmapTextColor)
        .attr("stroke-width", 3)
        .attr("rx", 2)
        .attr("ry", 2)
        .style("pointer-events", "none");
      }
    }

    const formatHourRow = (h: number) => formatEpwStationHour(h);
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

    // Aggregate data for bar chart
    let aggregatedData: { x0: number, x1: number, valueSelected: number, minSelected?: number, maxSelected?: number, month: number }[] = [];
    
    if (aggregation === 'hour') {
      aggregatedData = rows.map(d => {
        const val = convertValue((d[colorVar] as number) || 0, colorVarDef.unit);
        return {
          x0: d.dayOfYear + d.hour / 24,
          x1: d.dayOfYear + (d.hour + 1) / 24,
          valueSelected: val,
          minSelected: val,
          maxSelected: val,
          month: d.month
        };
      });
    } else if (aggregation === 'day') {
      const days = d3.group(rows, d => d.dayOfYear);
      aggregatedData = Array.from(days, ([day, values]) => {
        return {
          x0: day,
          x1: day + 1,
          valueSelected: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          minSelected: convertValue(d3.min(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          maxSelected: convertValue(d3.max(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          month: values[0].month
        };
      });
    } else if (aggregation === 'week') {
      const weeks = d3.group(rows, d => Math.floor((d.dayOfYear - 1) / 7));
      aggregatedData = Array.from(weeks, ([week, values]) => {
        return {
          x0: week * 7 + 1,
          x1: Math.min((week + 1) * 7 + 1, 366),
          valueSelected: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          minSelected: convertValue(d3.min(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          maxSelected: convertValue(d3.max(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          month: values[0].month
        };
      });
    } else { // month
      const months = d3.group(rows, d => d.month);
      aggregatedData = Array.from(months, ([month, values]) => {
        const startDay = values[0].dayOfYear;
        const endDay = values[values.length - 1].dayOfYear + 1;
        return {
          x0: startDay,
          x1: endDay,
          valueSelected: convertValue(d3.mean(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          minSelected: convertValue(d3.min(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          maxSelected: convertValue(d3.max(values, d => d[colorVar] as number) || 0, colorVarDef.unit),
          month: month
        };
      });
    }

    const yMin = d3.min(aggregatedData, d => d.minSelected ?? d.valueSelected) || 0;
    const yMax = d3.max(aggregatedData, d => d.maxSelected ?? d.valueSelected) || cMax;

    const yScaleBar = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([barChartHeight, 0])
      .nice();

    const chartBarFill =
      barChartFillMode === 'gradient' && !(showDifference && compareData)
        ? createExplorerChartValueGradient(svgDefs, colorScale, cMin, cMax, v => yScaleBar(v), {
            id: barGradientSvgId,
          })
        : null;

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

    // Draw background bars (All Data)
    // We don't have "All Data" in WindExplorer the same way as DataExplorer because it's always filtered by comfort
    // But we can show the background of the range if we want. For now let's just do the foreground.

    // Draw foreground elements (Filtered Data)
    const fgGroups = barChartG.selectAll(".fg-group")
      .data(aggregatedData)
      .join("g")
      .attr("class", "fg-group");

    fgGroups.each(function(d) {
      const group = d3.select(this);
      const barW = Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4));
      const xPos = xScale(d.x0);

      // Min-Max Range Bar
      const minVal = d.minSelected ?? d.valueSelected;
      const maxVal = d.maxSelected ?? d.valueSelected;
      
      const yMaxPx = yScaleBar(maxVal);
      const yMinPx = yScaleBar(minVal);
      const topY = Math.min(yMaxPx, yMinPx);
      const barH = Math.max(1, Math.abs(yMinPx - yMaxPx));
      const pillR = Math.min(barW / 2, barH / 2);

      group.append("rect")
        .attr("x", xPos)
        .attr("y", topY)
        .attr("width", barW)
        .attr("height", barH)
        .style(
          "fill",
          chartBarFill ??
            explorerBarSolidColor(colorScale, heatmapCellStatistic, {
              valueSelected: d.valueSelected,
              minSelected: minVal,
              maxSelected: maxVal,
            })
        )
        .style("opacity", 0.6)
        .attr("rx", pillR)
        .attr("ry", pillR);

      const pv = d.valueSelected;
      const minPv = minVal;
      const maxPv = maxVal;
      const dotVal = explorerBarStatisticY(heatmapCellStatistic, {
        valueSelected: pv,
        minSelected: minPv,
        maxSelected: maxPv,
      });

      if (aggregation !== 'hour') {
        group.append("circle")
          .attr("cx", xPos + barW / 2)
          .attr("cy", yScaleBar(dotVal))
          .attr("r", Math.min(barW / 2, 4))
          .style("fill", colorScale(dotVal))
          .style("stroke", "#000000")
          .style("stroke-width", "1px");
      }
    });

    fgGroups.append("title").text(d => {
      const dv = explorerBarStatisticY(heatmapCellStatistic, {
        valueSelected: d.valueSelected,
        minSelected: d.minSelected,
        maxSelected: d.maxSelected,
      });
      return `${heatmapCellStatistic}: ${dv.toFixed(1)} ${cUnit}\nRange: ${d.minSelected?.toFixed(1) ?? 'N/A'} to ${d.maxSelected?.toFixed(1) ?? 'N/A'} ${cUnit}`;
    });

    // Y Axis for Bar Chart
    const yAxisBar = d3.axisLeft(yScaleBar).ticks(5);
    barChartG.append("g")
      .call(yAxisBar)
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll(".tick text").style("fill", heatmapTextColor).style("font-weight", "500").style("font-size", `${heatmapMonthAxisPx}px`));

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

    // --- Wind Rose ---
    // Removed from WindExplorer

  }, [data, compareData, showDifference, filteredData, variables, colorVar, gradientId, aggregation, gradients, filter, dimensions.width, unitSystem, heatmapTextColor, theme, metadata, heatmapCellStatistic, barGradientSvgId, barChartFillMode]);

  const stats = (() => {
    if (showDifference && compareData) {
      const diffs = filteredData.map(d => {
        const idx = data.indexOf(d);
        const primaryVal = d[colorVar] as number;
        const compareVal = compareData[idx]?.[colorVar] as number;
        if (primaryVal === null || compareVal === null) return null;
        return compareVal - primaryVal;
      }).filter(v => v !== null) as number[];

      return {
        avg: convertValue(d3.mean(diffs) || 0, colorVarDef.unit, true),
        min: convertValue(d3.min(diffs) || 0, colorVarDef.unit, true),
        max: convertValue(d3.max(diffs) || 0, colorVarDef.unit, true),
        total: convertValue(d3.sum(diffs) || 0, colorVarDef.unit, true),
        count: diffs.length
      };
    }

    return {
      avg: convertValue(d3.mean(filteredData, d => d[colorVar] as number) || 0, colorVarDef.unit),
      min: convertValue(d3.min(filteredData, d => d[colorVar] as number) || 0, colorVarDef.unit),
      max: convertValue(d3.max(filteredData, d => d[colorVar] as number) || 0, colorVarDef.unit),
      total: convertValue(d3.sum(filteredData, d => d[colorVar] as number) || 0, colorVarDef.unit),
      count: filteredData.length
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
        <div className="flex flex-col min-w-0">
          {exportMode ? (
            <>
              <div className={`${CHART_TOOLBAR_EXPORT_ROW_CLASS} min-w-0`}>
                <ChartTypeMenu
                  value="wind"
                  label="Wind Explorer"
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
                                ? 'bg-gray-700/90 text-gray-200'
                                : 'bg-gray-100 text-gray-800'
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
                                ? 'bg-gray-700/90 text-gray-200'
                                : 'bg-gray-100 text-gray-800'
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
              <div className={`${CHART_TOOLBAR_ROW_CLASS} w-full`}>
                <div className={CHART_TOOLBAR_CONTROLS_CLASS}>
                  <ChartTypeMenu
                    value="wind"
                    label="Wind Explorer"
                    onChange={t => onChangeType?.(t)}
                    theme={theme}
                    disabled={!onChangeType}
                    display="icon"
                    tutorialAnchorId={tutorialChromeAnchors ? 'tutorial-card-chart-type' : undefined}
                    discoverPulse={!!tutorialChromeAnchors}
                  />
                  <VariableChartSelect
                    value={colorVar}
                    onChange={setColorVar}
                    selectedLabel={colorVarLabel}
                    theme={theme}
                    fillRow={false}
                    toolbarTitle
                    domId={tutorialChromeAnchors ? 'tutorial-card-data-control' : undefined}
                  >
                    {Object.entries(groupedVariables).map(([category, vars]) => (
                      <optgroup key={category} label={category}>
                        {vars.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({convertUnit(v.unit)})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </VariableChartSelect>
                </div>
                {onRemove && (
                  <div className={removeBtnRevealClass}>
                    <button
                      type="button"
                      onClick={onRemove}
                      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-hard-sm transition-all active:scale-95 ${
                        showDifference
                          ? theme === 'dark'
                            ? 'border border-red-800/50 bg-red-900/20 text-red-400 hover:bg-red-900/40'
                            : 'border border-red-100 bg-red-50 text-red-600 hover:bg-red-100'
                          : theme === 'dark'
                            ? 'text-gray-400 hover:bg-red-900/20 hover:text-red-400'
                            : 'text-gray-400 hover:bg-red-50 hover:text-red-500'
                      }`}
                    >
                      {showDifference ? (
                        <>
                          <X className="w-3 h-3" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
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
                                ? 'bg-gray-700/90 text-gray-200'
                                : 'bg-gray-100 text-gray-800'
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
                                ? 'bg-gray-700/90 text-gray-200'
                                : 'bg-gray-100 text-gray-800'
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
              {iemWindFallbackOnly}
            </>
          )}
        </div>
      </div>
      )}

      <CardModal
        open={showStatsModal}
        onClose={() => setShowStats(false)}
        title="Statistics"
        theme={theme}
        anchorRef={outerRef as any}
      >
        <div className="grid grid-cols-2 gap-2">
          <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Average</div>
            <div className={`text-base font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.avg.toFixed(1)} {cUnit}</div>
          </div>
          <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Min / Max</div>
            <div className={`text-base font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.min.toFixed(1)} / {stats.max.toFixed(1)} {cUnit}</div>
          </div>
          <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Total</div>
            <div className={`text-base font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.total.toFixed(0)} {cUnit}</div>
          </div>
          <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Samples</div>
            <div className={`text-base font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.count}</div>
          </div>
        </div>
      </CardModal>
      <CardModal
        open={showSettingsModal}
        onClose={() => setShowSettings(false)}
        title="Chart settings"
        theme={theme}
        anchorRef={outerRef as any}
        maxWidthPx={460}
      >
        <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Color Palette</label>
                  <button 
                    onClick={() => setShowGradientModal(true)}
                    className="text-[10px] font-bold text-gray-600 hover:text-gray-800 uppercase tracking-tight"
                  >
                    + Create
                  </button>
                </div>
                <div className={`flex overflow-x-auto rounded-full border p-1.5 ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                  {paletteGradients.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setGradientId(g.id)}
                      className={`mx-1 h-8 w-8 flex-shrink-0 rounded-full border-2 transition-all shadow-hard-sm ${
                        gradientId === g.id ? 'border-gray-700 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ background: `linear-gradient(to right, ${g.colors.join(', ')})` }}
                      title={g.name}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Comfort Filtering</label>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => applyPreset('summer')}
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${theme === 'dark' ? 'bg-orange-900/30 text-orange-400 border-orange-800 hover:bg-orange-900/50' : 'bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100'}`}
                    >
                      Summer Cooling
                    </button>
                    <button
                      onClick={() => applyPreset('winter')}
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${theme === 'dark' ? 'bg-gray-800/80 text-gray-200 border-gray-600 hover:bg-gray-800' : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'}`}
                    >
                      Winter Chill
                    </button>
                    <button
                      onClick={() => applyPreset('pedestrian')}
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${theme === 'dark' ? 'bg-green-900/30 text-green-400 border-green-800 hover:bg-green-900/50' : 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'}`}
                    >
                      Pedestrian
                    </button>
                    <button
                      onClick={() => applyPreset('sitting')}
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${theme === 'dark' ? 'bg-teal-900/30 text-teal-400 border-teal-800 hover:bg-teal-900/50' : 'bg-teal-50 text-teal-700 border-teal-100 hover:bg-teal-100'}`}
                    >
                      Sitting
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempFilterEnabled}
                    onChange={(e) => setTempFilterEnabled(e.target.checked)}
                    className={`rounded text-gray-700 focus:ring-gray-500 ${theme === 'dark' ? 'border-gray-600 bg-gray-800' : 'border-gray-300'}`}
                  />
                  <span className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Filter by Temperature</span>
                </label>
                {tempFilterEnabled && (
                  <div className="flex gap-2">
                    <select
                      value={tempFilterType}
                      onChange={(e) => setTempFilterType(e.target.value as 'above' | 'below')}
                      className={`block rounded-full border p-1.5 text-xs transition-all ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-gray-500 focus:border-gray-700 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-gray-500 focus:border-gray-700 hover:bg-white'}`}
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={tempThreshold}
                        onChange={(e) => setTempThreshold(Number(e.target.value))}
                        className={`block w-full rounded-full border p-1.5 pr-6 text-xs transition-all ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-gray-500 focus:border-gray-700 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-gray-500 focus:border-gray-700 hover:bg-white'}`}
                      />
                      <span className={`absolute right-2 top-1.5 text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{unitSystem === 'imperial' ? '°F' : '°C'}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={speedFilterEnabled}
                    onChange={(e) => setSpeedFilterEnabled(e.target.checked)}
                    className={`rounded text-gray-700 focus:ring-gray-500 ${theme === 'dark' ? 'border-gray-600 bg-gray-800' : 'border-gray-300'}`}
                  />
                  <span className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Filter by Wind Speed</span>
                </label>
                {speedFilterEnabled && (
                  <div className="flex gap-2">
                    <select
                      value={speedFilterType}
                      onChange={(e) => setSpeedFilterType(e.target.value as 'above' | 'below')}
                      className={`block rounded-full border p-1.5 text-xs transition-all ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-gray-500 focus:border-gray-700 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-gray-500 focus:border-gray-700 hover:bg-white'}`}
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={speedThreshold}
                        onChange={(e) => setSpeedThreshold(Number(e.target.value))}
                        className={`block w-full rounded-full border p-1.5 pr-10 text-xs transition-all ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-gray-500 focus:border-gray-700 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-gray-500 focus:border-gray-700 hover:bg-white'}`}
                      />
                      <span className={`absolute right-2 top-1.5 text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{unitSystem === 'imperial' ? 'mph' : 'm/s'}</span>
                    </div>
                  </div>
                )}
              </div>
        </div>
      </CardModal>

      {!pairSuppressFooterLegend && (
        <div className={`${EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS} min-w-0`}>
          <InteractiveLegend
            domId={tutorialLegendDomId}
            variable={{ ...colorVarDef, min: cMin, max: cMax, unit: cUnit }}
            gradientId={gradientId}
            setGradientId={setGradientId}
            gradients={gradients}
            theme={theme}
            isDifference={showDifference}
            footnote={windExplorerLegendFootnote}
          />
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden px-1 py-0.5">
        <div
          className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
          ref={containerRef}
        >
          {primWindResolved.loadingIem && iemControls.source === 'iem' ? (
            <IemWindChartLoadingOverlay
              theme={theme}
              label="Compiling IEM mesonet wind for your year range…"
            />
          ) : null}
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
