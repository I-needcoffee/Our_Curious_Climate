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
import { epwEquivalentHourKey, indexEpwByEquivalentHour } from '../lib/epwClockMatch';
import { symmetricDiffBound } from '../lib/symmetricDiffDomain';
import {
  isSolarNightEpwStation,
  solarNightOverlayRgba,
  solarNightParamsFromHeatmapDatum,
} from '../lib/solarNightHeatmap';
import { InteractiveLegend, GradientDef } from './InteractiveLegend';
import { gradientsForVariable } from '../lib/availableGradientsForVariable';
import { AggregationToolbar } from './AggregationToolbar';
import type { ChartType, CompareExplorerSharedControls } from '../App';
import { X, Settings2 } from 'lucide-react';

import type { BarChartFillMode, GlobalFilterState, HeatmapCellStatistic } from '../lib/globalFilter';
import {
  aggregateCellStatistic,
  explorerBarSolidColor,
  explorerBarStatisticY,
  globalFilterDaySegments,
  hourFilterIsPartial,
  hourInWrappedRange,
  hourRangeOutlineSegments,
  monthFilterIsPartial,
  monthInRange,
  rowPassesGlobalFilters,
} from '../lib/globalFilter';

import { UnitSystem } from '../App';
import {
  convertUnit as convertDisplayUnit,
  convertValue as convertDisplayValue,
  effectiveVariableLegendBounds,
  UNIT_C,
} from '../lib/unitConversion';
import { ChartTypeMenu } from './ChartTypeMenu';
import { ExportHeaderCaption, exportCaptionLinesWithUnit } from './ExportHeaderCaption';
import { VariableChartSelect } from './VariableChartSelect';
import {
  CHART_TOOLBAR_CONTROLS_CLASS,
  CHART_TOOLBAR_EXPORT_ROW_CLASS,
  CHART_TOOLBAR_HEADER_PAD,
  CHART_TOOLBAR_ROW_CLASS,
  chartToolbarChipButtonClass,
  chartToolbarRoundButtonClass,
  CHART_TOOLBAR_SETTINGS_GLYPH_CLASS,
  comparePaneLabelClass,
  chartToolbarRemoveButtonClass,
  chartToolbarRevealClassFor,
} from '../lib/chartToolbarLayout';
import { CardModal } from './CardModal';
import { defaultGradientIdForVariable } from '../lib/defaultGradientForVariable';
import { explorerUsesDailyAvgBarExtents, meanDailyLowHighForRows } from '../lib/explorerBarExtents';
import { formatEpwStationDate, formatEpwStationDateTime, formatEpwStationHour } from '../lib/formatEpwStationClock';
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
  explorerSvgTypography,
  EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS,
  fitHeatmapCellLabels,
} from '../lib/explorerChartSvgLayout';
import { HEATMAP_CELL_FONT_WEIGHT, chartAxisInk, heatmapCellInk } from '../lib/chartInk';
import { useExplorerSvgFrame } from '../hooks/useSvgRenderScale';

const EMPTY_VARIABLES_FALLBACK: EPWVariable = {
  id: 'dryBulbTemperature',
  name: 'Dry bulb temperature',
  unit: UNIT_C,
  min: 0,
  max: 35,
  category: 'Temperature',
  fixedMin: 5,
  fixedMax: 35,
};

/** Dual-series line chart in difference mode: baseline vs comparison (not Δ heatmap colors). */
function compareExplorerLineColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { baseline: '#d1d5db', comparison: '#ffffff' }
    : { baseline: '#e5e7eb', comparison: '#000000' };
}

interface DataExplorerProps {
  data: EPWDataRow[];
  compareData?: EPWDataRow[];
  showDifference?: boolean;
  stackedComparison?: boolean;
  variables: EPWVariable[];
  /** Initial EPW column id when this chart instance mounts (from dashboard slot). */
  defaultVariableId?: string;
  onRemove?: () => void;
  onChangeType?: (type: ChartType) => void;
  gradients: GradientDef[];
  filter: GlobalFilterState;
  /** Heatmaps: statistic within each cell (footer Low / Ave / High). Default mean. */
  heatmapCellStatistic?: HeatmapCellStatistic;
  /** Bar fill: solid footer statistic vs legend gradient (global Settings). */
  barChartFillMode?: BarChartFillMode;
  unitSystem: UnitSystem;
  heatmapTextColor: string;
  theme: 'light' | 'dark';
  setShowGradientModal: (show: boolean) => void;
  exportMode?: boolean;
  /** Site location for solar diurnal shading on Solar-category 12×24 heatmaps. */
  metadata?: EPWMetadata;
  comparePane?: 'primary' | 'secondary';
  paneCity?: string;
  pairSuppressHeader?: boolean;
  pairModalHost?: boolean;
  explorerShared?: CompareExplorerSharedControls;
  /** Difference column: reduce outer padding so the card fills height cleanly */
  diffFillColumn?: boolean;
  /** Highlight + anchor the legend row for the guided layout. */
  tutorialLegendDomId?: string;
  /** Show chart-header anchors and keep the aggregation strip visible for guided callouts. */
  tutorialChromeAnchors?: boolean;
  /** Compare pair row: parent renders a single shared legend below both panes. */
  pairSuppressFooterLegend?: boolean;
}

export function DataExplorer({ 
  data, compareData, showDifference, stackedComparison, variables, defaultVariableId, onRemove, onChangeType, gradients, filter,
  heatmapCellStatistic = 'mean',
  barChartFillMode = 'solid',
  unitSystem, heatmapTextColor, theme, 
  setShowGradientModal,
  exportMode,
  metadata,
  comparePane,
  paneCity,
  pairSuppressHeader,
  pairModalHost,
  explorerShared,
  diffFillColumn,
  tutorialLegendDomId,
  tutorialChromeAnchors,
  pairSuppressFooterLegend,
}: DataExplorerProps) {
  const barGradientSvgId = explorerChartValueGradientId(useId());
  const svgRef = useRef<SVGSVGElement>(null);
  const compareSvgRef = useRef<SVGSVGElement>(null);
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
  const [internalAggregation, setInternalAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const aggregation = explorerShared?.aggregation ?? internalAggregation;
  const setAggregation = explorerShared?.setAggregation ?? setInternalAggregation;

  const [internalShowStats, setInternalShowStats] = useState(false);
  const showStats = explorerShared?.showStats ?? internalShowStats;
  const setShowStats = explorerShared?.setShowStats ?? setInternalShowStats;

  const [internalColorVar, setInternalColorVar] = useState(() => {
    if (defaultVariableId && variables.some((v) => v.id === defaultVariableId)) return defaultVariableId;
    return variables.find((v) => v.category === 'Temperature')?.id || variables[0]?.id || 'dryBulbTemperature';
  });
  const colorVar = explorerShared?.colorVar ?? internalColorVar;
  const setColorVar = explorerShared?.setColorVar ?? setInternalColorVar;

  const [internalGradientId, setInternalGradientId] = useState(gradients[0].id);
  const gradientId = explorerShared?.gradientId ?? internalGradientId;
  const setGradientId = explorerShared?.setGradientId ?? setInternalGradientId;

  useEffect(() => {
    if (showDifference && compareData) {
      if (gradients.some(g => g.id === DIFFERENCE_DIVERGING_ID)) {
        setGradientId(DIFFERENCE_DIVERGING_ID);
        return;
      }
    }
    const id = defaultGradientIdForVariable(colorVar, variables, gradients);
    setGradientId(id);
  }, [colorVar, variables, gradients, setGradientId, showDifference, compareData]);

  const [internalShowSettings, setInternalShowSettings] = useState(false);
  const showSettings = explorerShared?.showSettings ?? internalShowSettings;
  const setShowSettings = explorerShared?.setShowSettings ?? setInternalShowSettings;

  const showStatsModal = showStats && (!pairSuppressHeader || pairModalHost);
  const showSettingsModal = showSettings && (!pairSuppressHeader || pairModalHost);

  const paletteGradients = useMemo(
    () => gradientsForVariable(colorVar, variables, gradients),
    [colorVar, variables, gradients]
  );

  const isMobile = useIsMobileMaxSm();
  const expandChromeStrip = !exportMode && (tutorialChromeAnchors || isMobile);
  const chartToolbarRevealClass = chartToolbarRevealClassFor(expandChromeStrip);
  const removeBtnRevealClass = isMobile
    ? 'pointer-events-auto opacity-100'
    : 'pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100';

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

  const convertValue = useCallback((val: number | null | undefined, unit: string, isDelta: boolean = false) => {
    return convertDisplayValue(val, unit, unitSystem, isDelta);
  }, [unitSystem]);

  const convertUnit = (unit: string) => convertDisplayUnit(unit, unitSystem);

  // Group variables by category
  const groupedVariables = variables.reduce((acc, v) => {
    const cat = v.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(v);
    return acc;
  }, {} as Record<string, EPWVariable[]>);

  const { colorVarDef, cMin, cMax, cUnit } = useMemo(() => {
    const def = variables.find(v => v.id === colorVar) ?? variables[0] ?? EMPTY_VARIABLES_FALLBACK;
    const bounds = effectiveVariableLegendBounds(def);
    let min = convertValue(bounds.lo, def.unit);
    let max = convertValue(bounds.hi, def.unit);
    const unit = convertUnit(def.unit);

    if (showDifference && compareData) {
      const diffs = dataExplorerDiffValuesForAggregation(
        aggregation,
        data,
        compareData,
        colorVar,
        def.unit,
        convertValue
      );
      const bound = symmetricDiffBound(diffs);
      const half = bound > 0 ? bound : 1;
      min = -half;
      max = half;
    }
    return { colorVarDef: def, cMin: min, cMax: max, cUnit: unit };
  }, [variables, colorVar, showDifference, compareData, data, unitSystem, aggregation, convertValue]);

  const colorVarLabel = `${colorVarDef.name} (${cUnit})`;

  const explorerLegendFootnote = useMemo(() => {
    const usesDaily = explorerUsesDailyAvgBarExtents(colorVar, colorVarDef.category);
    if (showDifference && compareData) {
      return 'Compare lines: baseline vs comparison averages; shading shows the gap.';
    }
    if (aggregation !== 'hour' && usesDaily) {
      return 'Bars span mean daily low to daily high.';
    }
    if (aggregation !== 'hour') {
      return 'Bars span hourly minimum to maximum.';
    }
    return '';
  }, [aggregation, colorVar, colorVarDef.category, showDifference, compareData]);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const compareByHour = compareData ? indexEpwByEquivalentHour(compareData) : null;
    const compareRowFor = (row: EPWDataRow) =>
      compareByHour?.get(epwEquivalentHourKey(row));

    const width = EXPLORER_SVG_BASE_WIDTH;
    const margin = EXPLORER_SVG_MARGIN;
    const innerWidth = explorerInnerWidth();
    const barChartHeight = explorerBarChartHeightPx(svgHeight);
    const monthAxisBand = EXPLORER_MONTH_AXIS_BAND_PX;
    const heatmapBodyHeight = explorerHeatmapHeightPx(svgHeight);
    const height = explorerSvgHeightPx(svgHeight);

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

    // X Scale for both charts (Day of Year 1-365)
    const xScale = d3.scaleLinear()
      .domain([1, 366])
      .range([0, innerWidth]);

    const barChartG = g.append("g");

    // --- Heatmap ---
    const heatmapG = g.append("g").attr("transform", `translate(0, ${barChartHeight})`);

    // Aggregate data for heatmap
    let heatmapData: any[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const aggVarSeries = (rows: EPWDataRow[]) =>
      aggregateCellStatistic(
        rows.map(r => r[colorVar] as number).filter(x => typeof x === 'number' && !Number.isNaN(x)),
        heatmapCellStatistic
      );

    const heatmapFill = (v: number) =>
      Number.isFinite(v) ? colorScale(v) : theme === 'dark' ? 'rgba(55,65,81,0.4)' : 'rgba(203,213,225,0.7)';

    if (aggregation === 'month') {
      const groups = d3.group(data, d => d.month, d => d.hour);
      Array.from(groups).forEach(([month, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = values[0].dayOfYear;
          const endDay = values[values.length - 1].dayOfYear + 1;
          const selectedRows = values.filter(d => rowPassesGlobalFilters(d, filter));
          
          let val: number;
          if (selectedRows.length === 0) {
            val = NaN;
          } else if (showDifference && compareData) {
            const p = aggVarSeries(selectedRows);
            const cmpVals = selectedRows
              .map(v => compareRowFor(v)?.[colorVar] as number)
              .filter((x): x is number => x != null && typeof x === 'number' && !Number.isNaN(x));
            const c = aggregateCellStatistic(cmpVals, heatmapCellStatistic);
            val = convertValue(c - p, colorVarDef.unit, true);
          } else {
            val = convertValue(aggVarSeries(selectedRows), colorVarDef.unit);
          }

          const midM = (selectedRows[Math.floor(selectedRows.length / 2)] ?? values[0])!;
          const valLine = Number.isFinite(val) ? val.toFixed(1) : '—';
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            value: val,
            label: `${monthNames[month - 1]}`,
            tooltip: Number.isFinite(val)
              ? `${monthNames[month - 1]} ${formatEpwStationHour(hour)} ${showDifference ? 'Diff' : 'Avg'}\n${colorVarDef.name}: ${valLine} ${cUnit}`
              : `${monthNames[month - 1]} ${formatEpwStationHour(hour)}\nNo hours in dry-bulb band for this month/hour`,

            sunYear: values[0].year,
            sunMonth: month,
            sunDay: 15,
            sunHour: hour,
            solarStandardClock: midM.solarStandardClock,
          });
        });
      });
    } else if (aggregation === 'week') {
      const groups = d3.group(data, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      Array.from(groups).forEach(([week, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = week * 7 + 1;
          const endDay = Math.min((week + 1) * 7 + 1, 366);
          // Approximate month for week
          const month = values[0].month;
          const selectedRows = values.filter(d => rowPassesGlobalFilters(d, filter));

          let val: number;
          if (selectedRows.length === 0) {
            val = NaN;
          } else if (showDifference && compareData) {
            const p = aggVarSeries(selectedRows);
            const cmpVals = selectedRows
              .map(v => compareRowFor(v)?.[colorVar] as number)
              .filter((x): x is number => x != null && typeof x === 'number' && !Number.isNaN(x));
            const c = aggregateCellStatistic(cmpVals, heatmapCellStatistic);
            val = convertValue(c - p, colorVarDef.unit, true);
          } else {
            val = convertValue(aggVarSeries(selectedRows), colorVarDef.unit);
          }

          const mid = (selectedRows[Math.floor(selectedRows.length / 2)] ?? values[0])!;
          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: month,
            value: val,
            label: `W${week + 1}`,
            tooltip: Number.isFinite(val)
              ? `Week ${week + 1} ${formatEpwStationHour(hour)} ${showDifference ? 'Diff' : 'Avg'}\n${colorVarDef.name}: ${val.toFixed(1)} ${cUnit}`
              : `Week ${week + 1} ${formatEpwStationHour(hour)}\nNo hours in dry-bulb band for this week/hour`,
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
      heatmapData = data.map((d, i) => {
        const pass = rowPassesGlobalFilters(d, filter);
        let val: number;
        if (!pass) {
          val = NaN;
        } else if (showDifference && compareData) {
          const pv = aggregateCellStatistic([d[colorVar] as number], heatmapCellStatistic);
          const cmp = compareRowFor(d)?.[colorVar];
          const cv = aggregateCellStatistic(
            cmp != null && typeof cmp === 'number' ? [cmp] : [],
            heatmapCellStatistic
          );
          val = convertValue(cv - pv, colorVarDef.unit, true);
        } else {
          val = convertValue(
            aggregateCellStatistic([d[colorVar] as number], heatmapCellStatistic),
            colorVarDef.unit
          );
        }
        const valLine = Number.isFinite(val) ? val.toFixed(1) : '—';
        return {
          x0: d.dayOfYear,
          x1: d.dayOfYear + 1,
          y: d.hour,
          month: d.month,
          value: val,
          label: formatEpwStationDate(d),
          tooltip: Number.isFinite(val)
            ? `${formatEpwStationDateTime(d)}\n${colorVarDef.name} ${showDifference ? 'Diff' : ''}: ${valLine} ${cUnit}`
            : `${formatEpwStationDateTime(d)}\nOutside dry-bulb band`,
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
    const type = explorerSvgTypography(renderScale, cellInnerHeightPx);
    const axisInk = chartAxisInk(heatmapTextColor, theme);

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
        const isMonthMatch = monthInRange(d.month, filter.startMonth, filter.endMonth);
        const isHourMatch = hourInWrappedRange(d.y, filter.startHour, filter.endHour);
        return isMonthMatch && isHourMatch ? 1 : 0.2;
      });

    cells
      .append("rect")
      .attr("width", d =>
        explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width
      )
      .attr("height", d => rowInnerHeight(d.y))
      .attr("rx", 2)
      .attr("ry", 2)
      .style("fill", d => heatmapFill(d.value))
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
        .style("opacity", d => {
          const isMonthMatch = monthInRange(d.month, filter.startMonth, filter.endMonth);
          const isHourMatch = hourInWrappedRange(d.y, filter.startHour, filter.endHour);
          return isMonthMatch && isHourMatch ? 1 : 0.2;
        })
        .text(d =>
          Number.isFinite(d.value) && explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width > overlayMinWidth
            ? Math.round(d.value)
            : ""
        );
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

    const isSelected = (d: EPWDataRow) => rowPassesGlobalFilters(d, filter);

    let aggregatedData: {
      x0: number;
      x1: number;
      valueAll: number;
      valueSelected: number | null;
      minSelected?: number;
      maxSelected?: number;
      compareValueAll?: number;
      compareValueSelected?: number | null;
      compareMinSelected?: number;
      compareMaxSelected?: number;
      month: number;
    }[] = [];

    const convertFinite = (value: number | null | undefined, isDelta = false) =>
      typeof value === 'number' && Number.isFinite(value)
        ? convertValue(value, colorVarDef.unit, isDelta)
        : NaN;

    const calculateValues = (values: EPWDataRow[], selectedValues: EPWDataRow[]) => {
      let valAll: number,
        valSelected: number | null = null;
      let minSelected: number | undefined, maxSelected: number | undefined;
      let compareValAll: number | undefined,
        compareValSelected: number | null = null;
      let compareMinSelected: number | undefined, compareMaxSelected: number | undefined;

      const useDailyExtents =
        explorerUsesDailyAvgBarExtents(colorVar, colorVarDef.category) && aggregation !== 'hour';

      if (showDifference && compareData) {
        valAll = convertFinite(d3.mean(values, d => d[colorVar] as number) );
        const compareValuesAll = values.map(v => compareRowFor(v)?.[colorVar] as number).filter(v => v !== null);
        compareValAll = convertFinite(d3.mean(compareValuesAll) );

        if (selectedValues.length > 0) {
          valSelected = convertFinite(d3.mean(selectedValues, d => d[colorVar] as number) );
          if (useDailyExtents) {
            const ext = meanDailyLowHighForRows(selectedValues, colorVar);
            if (ext) {
              minSelected = convertFinite(ext.low);
              maxSelected = convertFinite(ext.high);
            } else {
              minSelected = convertFinite(d3.min(selectedValues, d => d[colorVar] as number) );
              maxSelected = convertFinite(d3.max(selectedValues, d => d[colorVar] as number) );
            }
          } else {
            minSelected = convertFinite(d3.min(selectedValues, d => d[colorVar] as number) );
            maxSelected = convertFinite(d3.max(selectedValues, d => d[colorVar] as number) );
          }

          const compareValuesSel = selectedValues.map(v => compareRowFor(v)?.[colorVar] as number).filter(v => v !== null);
          compareValSelected = convertFinite(d3.mean(compareValuesSel) );

          const compareRowsAtSel = selectedValues
            .map(v => compareRowFor(v))
            .filter((r): r is EPWDataRow => r != null);
          if (compareRowsAtSel.length > 0) {
            if (useDailyExtents) {
              const ecmp = meanDailyLowHighForRows(compareRowsAtSel, colorVar);
              if (ecmp) {
                compareMinSelected = convertFinite(ecmp.low);
                compareMaxSelected = convertFinite(ecmp.high);
              } else {
                compareMinSelected = convertFinite(
                  d3.min(compareRowsAtSel.map(r => r[colorVar] as number).filter(v => typeof v === 'number')) ,
                  colorVarDef.unit
                );
                compareMaxSelected = convertFinite(
                  d3.max(compareRowsAtSel.map(r => r[colorVar] as number).filter(v => typeof v === 'number')) ,
                  colorVarDef.unit
                );
              }
            } else {
              compareMinSelected = convertFinite(
                d3.min(compareRowsAtSel.map(r => r[colorVar] as number).filter(v => typeof v === 'number')) ,
                colorVarDef.unit
              );
              compareMaxSelected = convertFinite(
                d3.max(compareRowsAtSel.map(r => r[colorVar] as number).filter(v => typeof v === 'number')) ,
                colorVarDef.unit
              );
            }
          }
        }
      } else {
        valAll = convertFinite(d3.mean(values, d => d[colorVar] as number) );
        if (selectedValues.length > 0) {
          valSelected = convertFinite(d3.mean(selectedValues, d => d[colorVar] as number) );
          if (useDailyExtents) {
            const ext = meanDailyLowHighForRows(selectedValues, colorVar);
            if (ext) {
              minSelected = convertFinite(ext.low);
              maxSelected = convertFinite(ext.high);
            } else {
              minSelected = convertFinite(d3.min(selectedValues, d => d[colorVar] as number) );
              maxSelected = convertFinite(d3.max(selectedValues, d => d[colorVar] as number) );
            }
          } else {
            minSelected = convertFinite(d3.min(selectedValues, d => d[colorVar] as number) );
            maxSelected = convertFinite(d3.max(selectedValues, d => d[colorVar] as number) );
          }
        }
      }
      return {
        valAll,
        valSelected,
        minSelected,
        maxSelected,
        compareValAll,
        compareValSelected,
        compareMinSelected,
        compareMaxSelected,
      };
    };

    if (aggregation === 'hour') {
      aggregatedData = data.map((d, i) => {
        const selected = isSelected(d);
        const raw = d[colorVar] as number;
        const val = typeof raw === 'number' && Number.isFinite(raw) ? convertValue(raw, colorVarDef.unit) : NaN;
        const compareRaw = compareRowFor(d)?.[colorVar] as number | undefined;
        const compareVal =
          showDifference && compareData
            ? typeof compareRaw === 'number' && Number.isFinite(compareRaw)
              ? convertValue(compareRaw, colorVarDef.unit)
              : NaN
            : undefined;
        return {
          x0: d.dayOfYear + d.hour / 24,
          x1: d.dayOfYear + (d.hour + 1) / 24,
          valueAll: val,
          valueSelected: selected ? val : null,
          minSelected: selected ? val : undefined,
          maxSelected: selected ? val : undefined,
          compareValueAll: compareVal,
          compareValueSelected: selected ? compareVal : null,
          compareMinSelected: selected && compareVal !== undefined ? compareVal : undefined,
          compareMaxSelected: selected && compareVal !== undefined ? compareVal : undefined,
          month: d.month,
        };
      });
    } else if (aggregation === 'day') {
      aggregatedData = Array.from(d3.group(data, d => d.dayOfYear), ([day, values]) => {
        const res = calculateValues(values, values.filter(isSelected));
        return {
          x0: day,
          x1: day + 1,
          valueAll: res.valAll,
          valueSelected: res.valSelected,
          minSelected: res.minSelected,
          maxSelected: res.maxSelected,
          compareValueAll: res.compareValAll,
          compareValueSelected: res.compareValSelected,
          compareMinSelected: res.compareMinSelected,
          compareMaxSelected: res.compareMaxSelected,
          month: values[0].month,
        };
      });
    } else if (aggregation === 'week') {
      aggregatedData = Array.from(d3.group(data, d => Math.floor((d.dayOfYear - 1) / 7)), ([week, values]) => {
        const res = calculateValues(values, values.filter(isSelected));
        return {
          x0: week * 7 + 1,
          x1: Math.min((week + 1) * 7 + 1, 366),
          valueAll: res.valAll,
          valueSelected: res.valSelected,
          minSelected: res.minSelected,
          maxSelected: res.maxSelected,
          compareValueAll: res.compareValAll,
          compareValueSelected: res.compareValSelected,
          compareMinSelected: res.compareMinSelected,
          compareMaxSelected: res.compareMaxSelected,
          month: values[0].month,
        };
      });
    } else {
      aggregatedData = Array.from(d3.group(data, d => d.month), ([month, values]) => {
        const res = calculateValues(values, values.filter(isSelected));
        return {
          x0: values[0].dayOfYear,
          x1: values[values.length - 1].dayOfYear + 1,
          valueAll: res.valAll,
          valueSelected: res.valSelected,
          minSelected: res.minSelected,
          maxSelected: res.maxSelected,
          compareValueAll: res.compareValAll,
          compareValueSelected: res.compareValSelected,
          compareMinSelected: res.compareMinSelected,
          compareMaxSelected: res.compareMaxSelected,
          month: month,
        };
      });
    }

    let yMin =
      d3.min(aggregatedData, d => {
        const minP = d.minSelected ?? d.valueAll;
        const minC = (d.compareMinSelected ?? d.compareValueSelected ?? d.compareValueAll) ?? minP;
        return Math.min(minP, minC);
      }) || 0;

    let yMax =
      d3.max(aggregatedData, d => {
        const maxP = d.maxSelected ?? d.valueAll;
        const maxC = (d.compareMaxSelected ?? d.compareValueSelected ?? d.compareValueAll) ?? maxP;
        return Math.max(maxP, maxC);
      }) || cMax;

    // Optional: Give it a bit of bottom margin if min is above 0, or zero-bound if we prefer
    if (yMin > 0 && colorVarDef.category !== "Temperature") yMin = 0;

    if (pairSuppressHeader && comparePane && explorerShared?.onBarYExtent) {
      explorerShared.onBarYExtent({ min: yMin, max: yMax, pane: comparePane });
    }

    const usePairBarDomain =
      pairSuppressHeader && !showDifference && explorerShared?.barYDomain != null;
    const y0 = usePairBarDomain ? explorerShared!.barYDomain!.min : yMin;
    const y1 = usePairBarDomain ? explorerShared!.barYDomain!.max : yMax;

    const yScaleBar = usePairBarDomain
      ? d3.scaleLinear().domain([y0, y1]).range([barChartHeight, 0])
      : d3.scaleLinear().domain([y0, y1]).range([barChartHeight, 0]).nice();

    const chartBarFill =
      barChartFillMode === 'gradient' && !(showDifference && compareData)
        ? createExplorerChartValueGradient(svgDefs, colorScale, cMin, cMax, v => yScaleBar(v), {
            id: barGradientSvgId,
          })
        : null;

    const validData = aggregatedData.filter(d => d.valueSelected !== null);
    const pairLineData = aggregatedData.filter(
      d => d.valueSelected !== null && d.compareValueSelected !== null
    );

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

    if (showDifference && compareData) {
      // Draw Line Chart connecting dots
      const linePrimary = d3
        .line<(typeof pairLineData)[0]>()
        .defined(d => d.valueSelected != null && d.compareValueSelected != null)
        .x(d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .y(d => yScaleBar(d.valueSelected!))
        .curve(d3.curveMonotoneX);

      const lineCompare = d3
        .line<(typeof pairLineData)[0]>()
        .defined(d => d.valueSelected != null && d.compareValueSelected != null)
        .x(d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .y(d => yScaleBar(d.compareValueSelected!))
        .curve(d3.curveMonotoneX);

      const areaDiff = d3
        .area<(typeof pairLineData)[0]>()
        .defined(d => d.valueSelected != null && d.compareValueSelected != null)
        .x(d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .y0(d => yScaleBar(d.compareValueSelected!))
        .y1(d => yScaleBar(d.valueSelected!))
        .curve(d3.curveMonotoneX);

      // Add difference shading
      barChartG.append("path")
        .datum(pairLineData)
        .attr("fill", theme === 'dark' ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)")
        .attr("d", areaDiff);

      const { baseline: lineBaseline, comparison: lineComparison } = compareExplorerLineColors(theme);

      // Add lines
      barChartG.append("path")
        .datum(pairLineData)
        .attr("fill", "none")
        .attr("stroke", lineBaseline)
        .attr("stroke-width", 2.25)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("d", linePrimary);

      barChartG.append("path")
        .datum(pairLineData)
        .attr("fill", "none")
        .attr("stroke", lineComparison)
        .attr("stroke-width", 2.25)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("d", lineCompare);

      // Add dots
      barChartG.selectAll(".dot-primary")
        .data(pairLineData)
        .join("circle")
        .attr("class", "dot-primary")
        .attr("cx", d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .attr("cy", d =>
          yScaleBar(
            explorerBarStatisticY(heatmapCellStatistic, {
              valueSelected: d.valueSelected!,
              minSelected: d.minSelected,
              maxSelected: d.maxSelected,
            })
          )
        )
        .attr("r", 3)
        .attr("fill", d =>
          colorScale(
            explorerBarStatisticY(heatmapCellStatistic, {
              valueSelected: d.valueSelected!,
              minSelected: d.minSelected,
              maxSelected: d.maxSelected,
            })
          )
        )
        .append("title")
        .text(d =>
          `Primary (${heatmapCellStatistic}): ${explorerBarStatisticY(heatmapCellStatistic, {
            valueSelected: d.valueSelected!,
            minSelected: d.minSelected,
            maxSelected: d.maxSelected,
          }).toFixed(1)} ${cUnit}`
        );

      barChartG.selectAll(".dot-compare")
        .data(pairLineData)
        .join("circle")
        .attr("class", "dot-compare")
        .attr("cx", d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
        .attr("cy", d =>
          yScaleBar(
            explorerBarStatisticY(heatmapCellStatistic, {
              valueSelected: d.compareValueSelected!,
              minSelected: d.compareMinSelected,
              maxSelected: d.compareMaxSelected,
            })
          )
        )
        .attr("r", 3)
        .attr("fill", d =>
          colorScale(
            explorerBarStatisticY(heatmapCellStatistic, {
              valueSelected: d.compareValueSelected!,
              minSelected: d.compareMinSelected,
              maxSelected: d.compareMaxSelected,
            })
          )
        )
        .append("title")
        .text(d =>
          `Comparison (${heatmapCellStatistic}): ${explorerBarStatisticY(heatmapCellStatistic, {
            valueSelected: d.compareValueSelected!,
            minSelected: d.compareMinSelected,
            maxSelected: d.compareMaxSelected,
          }).toFixed(1)} ${cUnit}`
        );

    } else {
      // Draw standard Bar Chart
      const fgGroups = barChartG.selectAll(".fg-group")
        .data(validData)
        .join("g")
        .attr("class", "fg-group");

      fgGroups.each(function(d) {
        const group = d3.select(this);
        const barW = Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4));
        const xPos = xScale(d.x0);

        const val = d.valueSelected!;
        const minVal = d.minSelected !== undefined && d.minSelected !== null ? d.minSelected : val;
        const maxVal = d.maxSelected !== undefined && d.maxSelected !== null ? d.maxSelected : val;
        const yMinPx = yScaleBar(minVal);
        const yMaxPx = yScaleBar(maxVal);
        const topY = Math.min(yMinPx, yMaxPx);
        const barH = Math.max(1, Math.abs(yMinPx - yMaxPx));
        const pillR = Math.min(barW / 2, barH / 2);
        const bottomY = topY + barH;
        const baselinePx = yScaleBar.range()[0];

        group.append("path")
          .attr("d", explorerBarPath(xPos, topY, barW, barH, pillR, explorerBarSitsOnBaseline(bottomY, baselinePx)))
          .style(
            "fill",
            chartBarFill ??
              explorerBarSolidColor(colorScale, heatmapCellStatistic, {
                valueSelected: val,
                minSelected: minVal,
                maxSelected: maxVal,
              })
          )
          .style("opacity", 0.6);

        // Indicator dot: matches footer Low/Ave/High (bars still span mean daily min–max when applicable).
        if (aggregation !== 'hour') {
          const markY = explorerBarStatisticY(heatmapCellStatistic, {
            valueSelected: val,
            minSelected: minVal,
            maxSelected: maxVal,
          });
          group.append("circle")
            .attr("cx", xPos + barW / 2)
            .attr("cy", yScaleBar(markY))
            .attr("r", Math.min(barW / 2, 4))
            .style("fill", colorScale(markY))
            .style("stroke", "#000000")
            .style("stroke-width", "1px");
        }
      });

      fgGroups.append("title").text(d => {
        const yv = explorerBarStatisticY(heatmapCellStatistic, {
          valueSelected: d.valueSelected!,
          minSelected: d.minSelected,
          maxSelected: d.maxSelected,
        });
        return `Selected (${heatmapCellStatistic}): ${yv.toFixed(1)} ${cUnit}; bar span min–max`;
      });
    }

    const yAxisBar = d3.axisLeft(yScaleBar).ticks(5);
    barChartG.append("g")
      .call(yAxisBar)
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll(".tick text").style("fill", axisInk).style("font-weight", "500").style("font-size", `${type.axisPx}px`));

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

  }, [
    renderScale,
    svgHeight,
    data,
    compareData,
    showDifference,
    variables,
    colorVar,
    gradientId,
    aggregation,
    gradients,
    filter,
    unitSystem,
    heatmapTextColor,
    theme,
    dimensions.width,
    metadata,
    pairSuppressHeader,
    comparePane,
    explorerShared?.barYDomain,
    heatmapCellStatistic,
    barGradientSvgId,
    barChartFillMode,
  ]);

  // Calculate local stats for filtered data
  const stats = (() => {
    const filteredData = data.filter(d => rowPassesGlobalFilters(d, filter));

    if (showDifference && compareData) {
      const compareByHour = indexEpwByEquivalentHour(compareData);
      const diffs = filteredData.map(d => {
        const primaryVal = d[colorVar] as number;
        const compareVal = compareByHour.get(epwEquivalentHourKey(d))?.[colorVar] as number;
        if (typeof primaryVal !== 'number' || typeof compareVal !== 'number') return null;
        if (!Number.isFinite(primaryVal) || !Number.isFinite(compareVal)) return null;
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
      className={`group relative flex h-full min-h-0 w-full flex-col transition-colors duration-300 ${
        exportMode ? 'bg-white' : (theme === 'dark' ? 'bg-gray-800' : 'bg-white')
      }`}
      
    >
      {(exportMode || !pairSuppressHeader) && (
      <div
        className={`flex flex-col ${
          exportMode ? 'bg-white' : (theme === 'dark' ? 'bg-gray-800' : 'bg-white')
        } ${diffFillColumn && !exportMode ? 'shrink-0 py-0.5' : CHART_TOOLBAR_HEADER_PAD}`}
      >
        <div className="flex flex-col min-w-0">
          {exportMode ? (
            <div className={`${CHART_TOOLBAR_EXPORT_ROW_CLASS} min-w-0`}>
              <ChartTypeMenu
                value="explorer"
                label={showDifference ? 'Data Difference' : 'Data Explorer'}
                onChange={() => {}}
                theme="light"
                display="icon"
                staticIcon
              />
              <ExportHeaderCaption
                lines={[exportCaptionLinesWithUnit(colorVarDef.category, colorVarDef.name, cUnit)]}
              />
            </div>
          ) : comparePane === 'secondary' ? (
            <>
              <div
                className={comparePaneLabelClass(theme, 'comparison')}
              >
                Comparison · {paneCity ?? '—'}
              </div>
              <div className={`${CHART_TOOLBAR_ROW_CLASS} w-full`}>
                <div className={CHART_TOOLBAR_CONTROLS_CLASS}>
                  <ChartTypeMenu
                    value="explorer"
                    label={showDifference ? 'Data Difference' : 'Data Explorer'}
                    onChange={() => {}}
                    theme={theme}
                    display="icon"
                    staticIcon
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
                          className={chartToolbarChipButtonClass(theme, showStats)}
                          title="Statistics"
                        >
                          Stats
                        </button>
                        <button
                          type="button"
                          id={tutorialChromeAnchors ? 'tutorial-card-settings' : undefined}
                          onClick={() => setShowSettings(!showSettings)}
                          className={chartToolbarRoundButtonClass(theme, showSettings)}
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
                    value="explorer"
                    label={showDifference ? 'Data Difference' : 'Data Explorer'}
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
                      className={
                        showDifference
                          ? `inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors active:scale-95 ${
                              theme === 'dark'
                                ? 'bg-red-900/30 text-red-300 hover:bg-red-900/50'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`
                          : chartToolbarRemoveButtonClass(theme)
                      }
                      title={showDifference ? 'Hide difference' : 'Remove chart'}
                    >
                      {showDifference ? (
                        <>
                          <X className="h-3.5 w-3.5" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <X className="h-4 w-4" />
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
                          className={chartToolbarChipButtonClass(theme, showStats)}
                          title="Statistics"
                        >
                          Stats
                        </button>
                        <button
                          type="button"
                          id={tutorialChromeAnchors ? 'tutorial-card-settings' : undefined}
                          onClick={() => setShowSettings(!showSettings)}
                          className={chartToolbarRoundButtonClass(theme, showSettings)}
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
            footnote={explorerLegendFootnote}
          />
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
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Average</div>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.avg.toFixed(1)} {cUnit}</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Min / Max</div>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.min.toFixed(1)} / {stats.max.toFixed(1)} {cUnit}</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Total</div>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.total.toFixed(0)} {cUnit}</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Samples</div>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.count}</div>
          </div>
        </div>
      </CardModal>

      {/* Settings Modal */}
      <CardModal
        open={showSettingsModal}
        onClose={() => setShowSettings(false)}
        title="Chart settings"
        theme={theme}
        anchorRef={outerRef as any}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Color Palette</label>
              <button 
                type="button"
                onClick={() => setShowGradientModal(true)}
                className="text-[11px] font-bold text-gray-600 hover:text-gray-800 uppercase tracking-tight"
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
          <div className="space-y-2">
            <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Variable</label>
            <select 
              value={colorVar} 
              onChange={e => setColorVar(e.target.value)}
              className={`w-full rounded-full border-0 px-3.5 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-gray-500 ${
                theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'
              }`}
            >
              {Object.entries(
                variables.reduce((acc, variable) => {
                  const category = variable.category || 'Other';
                  if (!acc[category]) acc[category] = [];
                  acc[category].push(variable);
                  return acc;
                }, {} as Record<string, typeof variables>)
              ).map(([category, vars]) => (
                <optgroup key={category} label={category}>
                  {vars.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({convertUnit(v.unit)})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </CardModal>

      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden px-1 ${
          diffFillColumn ? 'py-0' : 'py-0.5'
        }`}
      >
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          <svg
            ref={svgRef}
            className="block h-full w-full max-h-full max-w-full"
            preserveAspectRatio={pairSuppressFooterLegend ? 'xMidYMax meet' : 'xMidYMid meet'}
          />
        </div>
        {stackedComparison && compareData && (
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          <svg
            ref={compareSvgRef}
            className="block h-full w-full max-h-full max-w-full"
            preserveAspectRatio={pairSuppressFooterLegend ? 'xMidYMax meet' : 'xMidYMid meet'}
          />
        </div>
        )}
      </div>
    </div>
  );
}
