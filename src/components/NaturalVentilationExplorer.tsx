import { useEffect, useId, useRef, useState, useMemo } from 'react';
import { useIsMobileMaxSm } from '../hooks/useIsMobileMaxSm';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { EPWDataRow } from '../lib/epwParser';
import { X, Settings2 } from 'lucide-react';
import { GradientDef } from './InteractiveLegend';
import { AggregationToolbar } from './AggregationToolbar';
import type { ChartType } from '../App';
import { UnitSystem } from '../App';
import { UNIT_C, UNIT_F } from '../lib/unitConversion';
import type { BarChartFillMode, GlobalFilterState, HeatmapCellStatistic } from '../lib/globalFilter';
import {
  aggregateCellStatistic,
  explorerBarStatisticY,
  rowPassesGlobalFilters,
} from '../lib/globalFilter';
import { ChartTypeMenu } from './ChartTypeMenu';
import { useTutorialLiveOptional } from '../context/TutorialLiveContext';
import {
  CHART_TOOLBAR_CONTROLS_CLASS,
  CHART_TOOLBAR_EXPORT_ROW_CLASS,
  CHART_TOOLBAR_HEADER_PAD,
  CHART_TOOLBAR_ROW_CLASS,
  chartToolbarTitleClass,
} from '../lib/chartToolbarLayout';
import { ExportHeaderCaption } from './ExportHeaderCaption';
import { CardModal } from './CardModal';
import { NATURAL_VENTILATION_SUITABLE_BLUE_HEX, TEMPERATURE_COMFORT_GRADIENT_COLORS } from '../lib/constants';
import { EPW_COLUMNS } from '../lib/epwParser';
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
  DEFAULT_NV_CRITERIA,
  NaturalVentilationCriteria,
  NV_CRITERIA_PRESETS,
  rowSuitableForNaturalVentilation,
  computeNvHourStats,
  formatNvCriteriaSummary,
} from '../lib/naturalVentilationModel';
import { UtciComfortTimeLegendStrip } from './UtciExplorer';

const NV_CHART_TYPE: ChartType = 'naturalVentilation';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface NaturalVentilationExplorerProps {
  data: EPWDataRow[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  theme: 'light' | 'dark';
  heatmapTextColor: string;
  exportMode?: boolean;
  onRemove?: () => void;
  onChangeType?: (type: ChartType) => void;
  gradients?: GradientDef[];
  setShowGradientModal?: (show: boolean) => void;
  heatmapCellStatistic?: HeatmapCellStatistic;
  barChartFillMode?: BarChartFillMode;
  tutorialChromeAnchors?: boolean;
}

interface NvDataRow extends EPWDataRow {
  suitable: number;
  tempC: number;
}

export function NaturalVentilationExplorer({
  data,
  filter,
  unitSystem,
  theme,
  heatmapTextColor,
  exportMode,
  onRemove,
  onChangeType,
  gradients: _gradients,
  setShowGradientModal: _setShowGradientModal,
  heatmapCellStatistic = 'mean',
  barChartFillMode = 'solid',
  tutorialChromeAnchors,
}: NaturalVentilationExplorerProps) {
  const barGradientSvgId = explorerChartValueGradientId(useId());
  const svgRef = useRef<SVGSVGElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400 });

  const [aggregation, setAggregation] = useState<'hour' | 'day' | 'week' | 'month'>('month');
  const [criteria, setCriteria] = useState<NaturalVentilationCriteria>(DEFAULT_NV_CRITERIA);
  const [presetId, setPresetId] = useState('cse-broad');
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [colorMode, setColorMode] = useState<'suitableHours' | 'temperature'>('suitableHours');

  const tempUnit = unitSystem === 'imperial' ? UNIT_F : UNIT_C;
  const legendTitle =
    colorMode === 'suitableHours' ? 'Suitable hours' : `Dry bulb (${tempUnit})`;
  const legendFootnote =
    colorMode === 'suitableHours'
      ? 'Bar shows share of hours meeting ventilation criteria (filtered).'
      : aggregation !== 'hour'
        ? 'Bars span hourly dry-bulb minimum to maximum.'
        : '';

  const cToDisplay = (c: number) => (unitSystem === 'imperial' ? (c * 9) / 5 + 32 : c);
  const displayToC = (v: number) => (unitSystem === 'imperial' ? ((v - 32) * 5) / 9 : v);

  const isMobile = useIsMobileMaxSm();
  const expandChromeStrip = !exportMode && (tutorialChromeAnchors || isMobile);
  const chartToolbarRevealClass = expandChromeStrip
    ? 'pointer-events-auto max-h-[52px] overflow-visible opacity-100 pt-1 transition-[max-height,opacity] duration-200 ease-out'
    : 'pointer-events-none max-h-0 overflow-hidden opacity-0 transition-[max-height,opacity] duration-200 ease-out group-hover:pointer-events-auto group-hover:max-h-[48px] group-hover:opacity-100 focus-within:pointer-events-auto focus-within:max-h-[48px] focus-within:opacity-100';
  const removeBtnRevealClass = isMobile
    ? 'pointer-events-auto absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 opacity-100'
    : 'pointer-events-none absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100';

  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!outerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        for (const entry of entries) {
          const newWidth = Math.round(entry.contentRect.width);
          setDimensions(prev => (prev.width === newWidth ? prev : { width: newWidth }));
        }
      }, 100);
    });
    observer.observe(outerRef.current);
    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

  const nvData: NvDataRow[] = useMemo(() => {
    return data.map(d => {
      const ok = rowSuitableForNaturalVentilation(d, criteria);
      const tdb = (d.dryBulbTemperature as number) || 0;
      return {
        ...d,
        tempC: tdb,
        suitable: ok === true ? 1 : ok === false ? 0 : NaN,
      };
    });
  }, [data, criteria]);

  const dryBulbColumn = EPW_COLUMNS.find(c => c.id === 'dryBulbTemperature')!;
  const tempGradientMinC = dryBulbColumn.fixedMin ?? 5;
  const tempGradientMaxC = dryBulbColumn.fixedMax ?? 35;

  const { tempMinC, tempMaxC } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of nvData) {
      const t = row.tempC;
      if (typeof t !== 'number' || Number.isNaN(t)) continue;
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    if (!(lo <= hi) || !Number.isFinite(lo)) {
      return { tempMinC: tempGradientMinC, tempMaxC: tempGradientMaxC };
    }
    return { tempMinC: lo, tempMaxC: hi };
  }, [nvData, tempGradientMinC, tempGradientMaxC]);

  const convertTemp = (c: number) => cToDisplay(c);

  const hourStats = useMemo(
    () => computeNvHourStats(data, filter, criteria),
    [data, filter, criteria]
  );

  const tutorialLive = useTutorialLiveOptional();
  const tutorialReport = tutorialLive?.report;
  const tutorialEnabled = tutorialLive?.enabled;
  useEffect(() => {
    if (!tutorialEnabled || !tutorialReport) return;
    tutorialReport({ aggregation, nvCriteria: criteria });
  }, [tutorialEnabled, tutorialReport, aggregation, criteria]);

  const tempSliderMin = unitSystem === 'imperial' ? 0 : -10;
  const tempSliderMax = unitSystem === 'imperial' ? 100 : 40;

  const applyPreset = (id: string) => {
    const preset = NV_CRITERIA_PRESETS.find(p => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setCriteria({ ...preset.criteria });
  };

  const updateCriteriaTempMin = (displayVal: number) => {
    setPresetId('custom');
    setCriteria(prev => ({ ...prev, tempMinC: displayToC(displayVal) }));
  };

  const updateCriteriaTempMax = (displayVal: number) => {
    setPresetId('custom');
    setCriteria(prev => ({ ...prev, tempMaxC: displayToC(displayVal) }));
  };

  const updateCriteriaRh = (rh: number) => {
    setPresetId('custom');
    setCriteria(prev => ({ ...prev, maxRhPct: rh }));
  };

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const currentData = nvData;
    if (!currentData.length) return;

    const heatmapCellInGlobal = (month: number, hour: number) => {
      const isMonthMatch =
        filter.startMonth <= filter.endMonth
          ? month >= filter.startMonth && month <= filter.endMonth
          : month >= filter.startMonth || month <= filter.endMonth;
      return isMonthMatch && hour >= filter.startHour && hour <= filter.endHour;
    };

    const heatmapCellOpacity = (month: number, hour: number) =>
      heatmapCellInGlobal(month, hour) ? 1 : 0.2;

    const width = EXPLORER_SVG_BASE_WIDTH;
    const margin = EXPLORER_SVG_MARGIN;
    const innerWidth = explorerInnerWidth();
    const barChartHeight = explorerBarChartHeightPx();
    const monthAxisBand = EXPLORER_MONTH_AXIS_BAND_PX;
    const heatmapBodyHeight = explorerHeatmapHeightPx();
    const height = explorerSvgHeightPx();

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const svgDefs = upsertSvgDefs(svg);

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    let colorScale: d3.ScaleSequential<string, never>;
    if (colorMode === 'suitableHours') {
      const comfortLow = theme === 'dark' ? '#1f2937' : '#ffffff';
      const comfortHigh = NATURAL_VENTILATION_SUITABLE_BLUE_HEX;
      colorScale = d3
        .scaleSequential<string>()
        .domain([0, 1])
        .interpolator(d3.interpolateRgb(comfortLow, comfortHigh));
    } else {
      colorScale = d3
        .scaleSequential<string>()
        .domain([convertTemp(tempGradientMinC), convertTemp(tempGradientMaxC)])
        .interpolator(d3.interpolateRgbBasis([...TEMPERATURE_COMFORT_GRADIENT_COLORS]));
    }

    const xScale = d3.scaleLinear().domain([1, 366]).range([0, innerWidth]);
    const barChartG = g.append('g');
    const heatmapG = g.append('g').attr('transform', `translate(0, ${barChartHeight})`);

    const monthNames = EXPLORER_MONTH_LABELS_SHORT;
    const emptyFill = theme === 'dark' ? 'rgba(55,65,81,0.4)' : 'rgba(203,213,225,0.7)';

    type HeatmapDatum = {
      x0: number;
      x1: number;
      y: number;
      month: number;
      tempC: number;
      suitable: number;
      label: string;
      tooltip: string;
    };

    let heatmapData: HeatmapDatum[] = [];

    if (aggregation === 'month') {
      const groups = d3.group(currentData, d => d.month, d => d.hour);
      Array.from(groups).forEach(([month, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const startDay = values[0].dayOfYear;
          const endDay = values[values.length - 1].dayOfYear + 1;
          const selectedRows = values.filter(d => rowPassesGlobalFilters(d, filter));
          const finiteSuitable = selectedRows
            .map(d => d.suitable)
            .filter(v => Number.isFinite(v));
          const finiteTemp = selectedRows
            .map(d => d.tempC)
            .filter(v => Number.isFinite(v));

          const suitableRatio =
            finiteSuitable.length === 0
              ? NaN
              : aggregateCellStatistic(finiteSuitable, heatmapCellStatistic);
          const avgTemp =
            finiteTemp.length === 0
              ? NaN
              : aggregateCellStatistic(finiteTemp, heatmapCellStatistic);

          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month,
            tempC: avgTemp,
            suitable: suitableRatio,
            label: monthNames[month - 1]!,
            tooltip: !Number.isFinite(suitableRatio) && !Number.isFinite(avgTemp)
              ? `${monthNames[month - 1]}\nNo hours in filter`
              : colorMode === 'suitableHours'
                ? `${monthNames[month - 1]} Avg\nSuitable: ${Number.isFinite(suitableRatio) ? (suitableRatio * 100).toFixed(1) : '—'}%`
                : `${monthNames[month - 1]} Avg\nTemp: ${Number.isFinite(avgTemp) ? convertTemp(avgTemp).toFixed(1) : '—'}${tempUnit}`,
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
          const finiteSuitable = selectedRows
            .map(d => d.suitable)
            .filter(v => Number.isFinite(v));
          const finiteTemp = selectedRows
            .map(d => d.tempC)
            .filter(v => Number.isFinite(v));
          const suitableRatio =
            finiteSuitable.length === 0
              ? NaN
              : aggregateCellStatistic(finiteSuitable, heatmapCellStatistic);
          const avgTemp =
            finiteTemp.length === 0
              ? NaN
              : aggregateCellStatistic(finiteTemp, heatmapCellStatistic);

          heatmapData.push({
            x0: startDay,
            x1: endDay,
            y: hour,
            month: values[0].month,
            tempC: avgTemp,
            suitable: suitableRatio,
            label: `W${week + 1}`,
            tooltip: !Number.isFinite(suitableRatio) && !Number.isFinite(avgTemp)
              ? `Week ${week + 1}\nNo hours in filter`
              : colorMode === 'suitableHours'
                ? `Week ${week + 1} Avg\nSuitable: ${Number.isFinite(suitableRatio) ? (suitableRatio * 100).toFixed(1) : '—'}%`
                : `Week ${week + 1} Avg\nTemp: ${Number.isFinite(avgTemp) ? convertTemp(avgTemp).toFixed(1) : '—'}${tempUnit}`,
          });
        });
      });
    } else {
      heatmapData = currentData.map(d => {
        const pass = rowPassesGlobalFilters(d, filter);
        return {
          x0: d.dayOfYear,
          x1: d.dayOfYear + 1,
          y: d.hour,
          month: d.month,
          tempC: pass ? d.tempC : NaN,
          suitable: pass ? d.suitable : NaN,
          label: d.date.toLocaleDateString(),
          tooltip: !pass
            ? `${d.date.toLocaleString()}\nOutside filter`
            : colorMode === 'suitableHours'
              ? `${d.date.toLocaleString()}\nSuitable: ${d.suitable ? 'Yes' : 'No'}`
              : `${d.date.toLocaleString()}\nTemp: ${convertTemp(d.tempC).toFixed(1)}${tempUnit}`,
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

    const heatmapCellsG = heatmapG.append('g').attr('transform', `translate(0, ${monthAxisBand})`);

    const cells = heatmapCellsG
      .selectAll('.heatmap-cell-group')
      .data(heatmapData)
      .join('g')
      .attr('class', 'heatmap-cell-group')
      .attr('transform', d => {
        const xp = explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1);
        return `translate(${xp.x}, ${hourRowTop(d.y)})`;
      });

    cells
      .append('rect')
      .attr('width', d => explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width)
      .attr('height', d => rowInnerHeight(d.y))
      .attr('rx', 2)
      .attr('ry', 2)
      .style('fill', d => {
        const metric = colorMode === 'suitableHours' ? d.suitable : d.tempC;
        if (!Number.isFinite(metric)) return emptyFill;
        return colorScale(colorMode === 'suitableHours' ? metric : convertTemp(metric));
      })
      .style('stroke', aggregation === 'month' || aggregation === 'week' ? 'rgba(0,0,0,0.1)' : 'none')
      .style('stroke-width', '1px')
      .style('opacity', d => heatmapCellOpacity(d.month, d.y))
      .append('title')
      .text(d => d.tooltip);

    if (aggregation === 'month' || aggregation === 'week') {
      cells
        .append('text')
        .attr('x', d => explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width / 2 - 0.5)
        .attr('y', d => rowInnerHeight(d.y) / 2 - 0.5)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .style('fill', heatmapTextColor)
        .style('font-size', `${aggregation === 'month' ? overlayFontMonthPx : overlayFontWeekPx}px`)
        .style('font-weight', '500')
        .style('pointer-events', 'none')
        .style('opacity', d => heatmapCellOpacity(d.month, d.y))
        .text(d => {
          if (explorerHeatmapCellXPx(innerWidth, cellGapPx, d.x0, d.x1).width <= overlayMinWidth) {
            return '';
          }
          if (colorMode === 'suitableHours') {
            if (!Number.isFinite(d.suitable)) return '';
            return `${Math.round(d.suitable * 100)}%`;
          }
          if (!Number.isFinite(d.tempC)) return '';
          return `${Math.round(convertTemp(d.tempC))}`;
        });
    }

    if (
      filter.startMonth > 1 ||
      filter.endMonth < 12 ||
      filter.startHour > 0 ||
      filter.endHour < 23
    ) {
      const startDay = data.find(d => d.month === filter.startMonth)?.dayOfYear || 1;
      const endDayData = [...data].reverse().find(d => d.month === filter.endMonth);
      const endDay = endDayData ? endDayData.dayOfYear + 1 : 366;
      const span = explorerHeatmapSpanXPx(innerWidth, startDay, endDay);
      heatmapCellsG
        .append('rect')
        .attr('x', span.x)
        .attr('y', hourRowTop(filter.startHour))
        .attr('width', span.width)
        .attr('height', hourRowTop(filter.endHour + 1) - hourRowTop(filter.startHour))
        .attr('fill', 'none')
        .attr('stroke', '#1f2937')
        .attr('stroke-width', 3)
        .attr('rx', 2)
        .attr('ry', 2)
        .style('pointer-events', 'none');
    }

    const formatHourRow = (h: number) => {
      if (h === 0) return '12 AM';
      if (h === 12) return '12 PM';
      if (h < 12) return `${h} AM`;
      return `${h - 12} PM`;
    };

    heatmapCellsG
      .append('g')
      .attr('class', 'heatmap-hour-labels')
      .attr('pointer-events', 'none')
      .selectAll('text')
      .data(d3.range(0, 24))
      .join('text')
      .attr('x', -4)
      .attr('y', h => hourRowCenter(h))
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'end')
      .style('fill', heatmapTextColor)
      .style('font-weight', '500')
      .style('font-size', `${heatmapHourAxisPx}px`)
      .text(h => formatHourRow(h));

    const isSelected = (d: NvDataRow) => rowPassesGlobalFilters(d, filter);

    type AggDatum = {
      x0: number;
      x1: number;
      valueSelected: number | null;
      suitableRatioSelected: number | null;
      minSelected?: number | null;
      maxSelected?: number | null;
      month: number;
    };

    let aggregatedData: AggDatum[] = [];

    if (aggregation === 'hour') {
      aggregatedData = currentData.map(d => {
        const selected = isSelected(d);
        const val = convertTemp(d.tempC);
        return {
          x0: d.dayOfYear + d.hour / 24,
          x1: d.dayOfYear + (d.hour + 1) / 24,
          valueSelected: selected ? val : null,
          suitableRatioSelected: selected && Number.isFinite(d.suitable) ? d.suitable : null,
          minSelected: selected ? val : undefined,
          maxSelected: selected ? val : undefined,
          month: d.month,
        };
      });
    } else if (aggregation === 'day') {
      const days = d3.group(currentData, d => d.dayOfYear);
      aggregatedData = Array.from(days, ([day, values]) => {
        const selectedValues = values.filter(isSelected);
        const temps = selectedValues.map(d => d.tempC).filter(Number.isFinite);
        const suitable = selectedValues.map(d => d.suitable).filter(Number.isFinite);
        return {
          x0: day,
          x1: day + 1,
          valueSelected:
            selectedValues.length > 0 && temps.length > 0
              ? convertTemp(d3.mean(temps) || 0)
              : null,
          suitableRatioSelected:
            selectedValues.length > 0 && suitable.length > 0
              ? d3.mean(suitable) || 0
              : null,
          minSelected: temps.length > 0 ? convertTemp(d3.min(temps) || 0) : undefined,
          maxSelected: temps.length > 0 ? convertTemp(d3.max(temps) || 0) : undefined,
          month: values[0].month,
        };
      });
    } else if (aggregation === 'week') {
      const weeks = d3.group(currentData, d => Math.floor((d.dayOfYear - 1) / 7));
      aggregatedData = Array.from(weeks, ([week, values]) => {
        const selectedValues = values.filter(isSelected);
        const temps = selectedValues.map(d => d.tempC).filter(Number.isFinite);
        const suitable = selectedValues.map(d => d.suitable).filter(Number.isFinite);
        return {
          x0: week * 7 + 1,
          x1: Math.min((week + 1) * 7 + 1, 366),
          valueSelected:
            selectedValues.length > 0 && temps.length > 0
              ? convertTemp(d3.mean(temps) || 0)
              : null,
          suitableRatioSelected:
            selectedValues.length > 0 && suitable.length > 0
              ? d3.mean(suitable) || 0
              : null,
          minSelected: temps.length > 0 ? convertTemp(d3.min(temps) || 0) : undefined,
          maxSelected: temps.length > 0 ? convertTemp(d3.max(temps) || 0) : undefined,
          month: values[0].month,
        };
      });
    } else {
      const months = d3.group(currentData, d => d.month);
      aggregatedData = Array.from(months, ([month, values]) => {
        const startDay = values[0].dayOfYear;
        const endDay = values[values.length - 1].dayOfYear + 1;
        const selectedValues = values.filter(isSelected);
        const temps = selectedValues.map(d => d.tempC).filter(Number.isFinite);
        const suitable = selectedValues.map(d => d.suitable).filter(Number.isFinite);
        return {
          x0: startDay,
          x1: endDay,
          valueSelected:
            selectedValues.length > 0 && temps.length > 0
              ? convertTemp(d3.mean(temps) || 0)
              : null,
          suitableRatioSelected:
            selectedValues.length > 0 && suitable.length > 0
              ? d3.mean(suitable) || 0
              : null,
          minSelected: temps.length > 0 ? convertTemp(d3.min(temps) || 0) : null,
          maxSelected: temps.length > 0 ? convertTemp(d3.max(temps) || 0) : null,
          month,
        };
      });
    }

    const yMin =
      colorMode === 'suitableHours'
        ? 0
        : d3.min(aggregatedData, d => Math.min(d.valueSelected ?? Infinity, d.minSelected ?? Infinity)) ??
          convertTemp(tempMinC);
    const yMax =
      colorMode === 'suitableHours'
        ? 1
        : d3.max(aggregatedData, d => Math.max(d.valueSelected ?? -Infinity, d.maxSelected ?? -Infinity)) ??
          convertTemp(tempMaxC);

    const yScaleBar = d3.scaleLinear().domain([yMin, yMax]).range([barChartHeight, 0]).nice();

    barChartG
      .append('g')
      .attr('class', 'explorer-bar-grid')
      .attr('pointer-events', 'none')
      .selectAll('line')
      .data(yScaleBar.ticks(5))
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScaleBar(d))
      .attr('y2', d => yScaleBar(d))
      .attr('stroke', explorerBarGridStroke(theme))
      .attr('stroke-width', 1);

    const getFillColor = (val: number, suitableRatio: number) =>
      colorScale(colorMode === 'suitableHours' ? suitableRatio : val);

    const chartBarFill =
      barChartFillMode === 'gradient'
        ? colorMode === 'suitableHours'
          ? createExplorerChartValueGradient(svgDefs, r => getFillColor(0, r), 0, 1, v => yScaleBar(v), {
              id: barGradientSvgId,
            })
          : createExplorerChartValueGradient(
              svgDefs,
              v => getFillColor(v, 0),
              convertTemp(tempGradientMinC),
              convertTemp(tempGradientMaxC),
              v => yScaleBar(v),
              { id: barGradientSvgId }
            )
        : null;

    const fgGroups = barChartG
      .selectAll('.fg-group')
      .data(aggregatedData.filter(d => d.suitableRatioSelected !== null || d.valueSelected !== null))
      .join('g')
      .attr('class', 'fg-group');

    fgGroups.each(function (d) {
      const group = d3.select(this);
      const barW = Math.max(1, xScale(d.x1) - xScale(d.x0) - (aggregation === 'hour' ? 0 : 4));
      const xPos = xScale(d.x0);

      if (colorMode === 'suitableHours') {
        const ratio = d.suitableRatioSelected ?? 0;
        const yHi = yScaleBar(ratio);
        const yLo = yScaleBar(0);
        const topY = Math.min(yHi, yLo);
        const barH = Math.max(1, Math.abs(yLo - yHi));
        const pillR = Math.min(barW / 2, barH / 2);
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
        group
          .append('rect')
          .attr('x', xPos)
          .attr('y', topY)
          .attr('width', barW)
          .attr('height', barH)
          .style('fill', comfortFill)
          .attr('rx', pillR)
          .attr('ry', pillR);
      } else {
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
        group
          .append('rect')
          .attr('x', xPos)
          .attr('y', topY)
          .attr('width', barW)
          .attr('height', barH)
          .style('fill', chartBarFill ?? getFillColor(barFillVal, d.suitableRatioSelected ?? 0))
          .style('opacity', 0.6)
          .attr('rx', pillR)
          .attr('ry', pillR);

        group
          .append('circle')
          .attr('cx', xPos + barW / 2)
          .attr('cy', yScaleBar(val))
          .attr('r', Math.min(barW / 2, 4))
          .style('fill', getFillColor(val, d.suitableRatioSelected ?? 0))
          .style('stroke', '#000000')
          .style('stroke-width', '1px');
      }
    });

    fgGroups.append('title').text(d => {
      if (colorMode === 'suitableHours') {
        return `Selected hours suitable: ${((d.suitableRatioSelected ?? 0) * 100).toFixed(1)}%`;
      }
      return `Selected hours avg temp: ${(d.valueSelected ?? 0).toFixed(1)}${tempUnit}`;
    });

    const yAxisBar = d3
      .axisLeft(yScaleBar)
      .ticks(5)
      .tickFormat(d =>
        colorMode === 'suitableHours' ? `${(d as number) * 100}%` : `${d}${tempUnit}`
      );

    barChartG
      .append('g')
      .call(yAxisBar)
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove())
      .call(g =>
        g
          .selectAll('.tick text')
          .style('fill', heatmapTextColor)
          .style('font-weight', '500')
          .style('font-size', `${heatmapMonthAxisPx}px`)
      );

    const monthCenters = explorerMonthLabelCenterDays();
    heatmapG
      .append('g')
      .attr('class', 'explorer-month-labels')
      .attr('pointer-events', 'none')
      .selectAll('text')
      .data(
        EXPLORER_MONTH_LABELS_SHORT.map((label, i) => ({
          label,
          cx: monthCenters[i]!,
        }))
      )
      .join('text')
      .attr('x', d => explorerHeatmapXOfDay(innerWidth, d.cx))
      .attr('y', monthAxisBand / 2)
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'middle')
      .style('fill', heatmapTextColor)
      .style('font-weight', '500')
      .style('font-size', `${heatmapMonthAxisPx}px`)
      .text(d => d.label);
  }, [
    nvData,
    data,
    aggregation,
    colorMode,
    filter,
    dimensions.width,
    unitSystem,
    heatmapTextColor,
    theme,
    tempMinC,
    tempMaxC,
    heatmapCellStatistic,
    barGradientSvgId,
    barChartFillMode,
    criteria,
    tempUnit,
  ]);

  const criteriaSummary = formatNvCriteriaSummary(criteria, unitSystem);

  return (
    <div
      ref={outerRef}
      className={`group relative flex h-full min-h-0 w-full flex-col transition-colors duration-300 ${
        exportMode ? 'bg-white' : theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}
    >
      <div
        className={`flex flex-col ${exportMode ? '' : 'border-b'} ${
          exportMode
            ? 'bg-white'
            : theme === 'dark'
              ? 'border-gray-700 bg-gray-800'
              : 'border-gray-100 bg-white'
        } ${CHART_TOOLBAR_HEADER_PAD}`}
      >
        <div className="flex min-w-0 flex-col overflow-visible">
          {exportMode ? (
            <div className={`${CHART_TOOLBAR_EXPORT_ROW_CLASS} min-w-0`}>
              <ChartTypeMenu
                value={NV_CHART_TYPE}
                label="Natural Ventilation"
                onChange={() => {}}
                theme="light"
                display="icon"
                staticIcon
              />
              <ExportHeaderCaption
                lines={[
                  {
                    short: 'Natural Ventilation · Suitable hours',
                    long: 'Natural Ventilation · Suitable hours',
                  },
                ]}
              />
            </div>
          ) : (
            <>
              <div className={`${CHART_TOOLBAR_ROW_CLASS} w-full`}>
                <div className={CHART_TOOLBAR_CONTROLS_CLASS}>
                  <ChartTypeMenu
                    value={NV_CHART_TYPE}
                    label="Natural Ventilation"
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
                    title={`Natural Ventilation · ${legendTitle}`}
                  >
                    Natural Ventilation · {legendTitle}
                  </span>
                </div>
                {onRemove && (
                  <div className={removeBtnRevealClass}>
                    <button
                      type="button"
                      onClick={onRemove}
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-0 shadow-hard-sm transition-colors ${
                        theme === 'dark'
                          ? 'text-gray-400 hover:bg-red-900/30 hover:text-red-400'
                          : 'text-gray-400 hover:bg-red-50 hover:text-red-500'
                      }`}
                    >
                      <X className="h-3.5 w-3.5" />
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
                    tutorialPeriodIdPrefix={
                      tutorialChromeAnchors ? 'tutorial-card-aggregation' : undefined
                    }
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

      <CardModal
        open={showStats}
        onClose={() => setShowStats(false)}
        title="Natural ventilation statistics"
        theme={theme}
        anchorRef={outerRef as any}
        maxWidthPx={520}
      >
        <div className="mb-3 space-y-2">
          <div
            className={`rounded-md p-3 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`}
          >
            <div
              className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Suitable hours (filtered)
            </div>
            <div
              className={`text-base font-medium tabular-nums ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}
            >
              {hourStats.suitableHours.toLocaleString()} of {hourStats.totalHours.toLocaleString()}{' '}
              ({Number.isFinite(hourStats.suitablePct) ? hourStats.suitablePct.toFixed(1) : '—'}%)
            </div>
          </div>
          <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            Criteria: {criteriaSummary}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
                <th className="pb-2 pr-3 font-semibold uppercase tracking-wider">Month</th>
                <th className="pb-2 pr-3 font-semibold uppercase tracking-wider">Suitable</th>
                <th className="pb-2 pr-3 font-semibold uppercase tracking-wider">Total</th>
                <th className="pb-2 font-semibold uppercase tracking-wider">%</th>
              </tr>
            </thead>
            <tbody>
              {hourStats.byMonth.map(row => (
                <tr
                  key={row.month}
                  className={theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}
                >
                  <td className="py-1 pr-3">{MONTH_NAMES[row.month - 1]}</td>
                  <td className="py-1 pr-3 tabular-nums">{row.suitable}</td>
                  <td className="py-1 pr-3 tabular-nums">{row.total}</td>
                  <td className="py-1 tabular-nums">
                    {Number.isFinite(row.pct) ? row.pct.toFixed(1) : '—'}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardModal>

      <CardModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Natural ventilation settings"
        theme={theme}
        anchorRef={outerRef as any}
        maxWidthPx={520}
      >
        <div className="grid grid-cols-1 gap-3">
          <p className={`text-xs leading-snug ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            Defaults follow CSE natural-conditioning guidance (about 60–80 °F, RH ≤ 70%) and WELL v2
            discouragement above ~60% RH. Tighten limits here to match your project criteria.
          </p>

          <div className="space-y-2">
            <label
              className={`block text-xs font-semibold uppercase tracking-wider ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Criteria preset
            </label>
            <select
              value={presetId}
              onChange={e => {
                const id = e.target.value;
                if (id === 'custom') {
                  setPresetId('custom');
                  return;
                }
                applyPreset(id);
              }}
              className={`w-full rounded-full border p-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 ${
                theme === 'dark'
                  ? 'border-gray-600 bg-gray-700 text-white'
                  : 'border-gray-300 bg-white text-gray-900'
              }`}
            >
              {NV_CRITERIA_PRESETS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="space-y-3">
            <div>
              <label
                className={`mb-1 block text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
                Min dry-bulb ({tempUnit})
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  min={tempSliderMin}
                  max={tempSliderMax}
                  step={unitSystem === 'imperial' ? 1 : 0.5}
                  value={cToDisplay(criteria.tempMinC)}
                  onChange={v => updateCriteriaTempMin(Array.isArray(v) ? v[0]! : v)}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={Math.round(cToDisplay(criteria.tempMinC) * 10) / 10}
                  onChange={e => updateCriteriaTempMin(parseFloat(e.target.value) || 0)}
                  className={`w-16 rounded-md border px-2 py-1 text-sm ${
                    theme === 'dark'
                      ? 'border-gray-600 bg-gray-700 text-white'
                      : 'border-gray-300 bg-white text-gray-900'
                  }`}
                />
              </div>
            </div>

            <div>
              <label
                className={`mb-1 block text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
                Max dry-bulb ({tempUnit})
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  min={tempSliderMin}
                  max={tempSliderMax}
                  step={unitSystem === 'imperial' ? 1 : 0.5}
                  value={cToDisplay(criteria.tempMaxC)}
                  onChange={v => updateCriteriaTempMax(Array.isArray(v) ? v[0]! : v)}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={Math.round(cToDisplay(criteria.tempMaxC) * 10) / 10}
                  onChange={e => updateCriteriaTempMax(parseFloat(e.target.value) || 0)}
                  className={`w-16 rounded-md border px-2 py-1 text-sm ${
                    theme === 'dark'
                      ? 'border-gray-600 bg-gray-700 text-white'
                      : 'border-gray-300 bg-white text-gray-900'
                  }`}
                />
              </div>
            </div>

            <div>
              <label
                className={`mb-1 block text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
                Max relative humidity (%)
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  min={30}
                  max={100}
                  step={1}
                  value={criteria.maxRhPct}
                  onChange={v => updateCriteriaRh(Array.isArray(v) ? v[0]! : v)}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={criteria.maxRhPct}
                  onChange={e => updateCriteriaRh(parseFloat(e.target.value) || 0)}
                  className={`w-16 rounded-md border px-2 py-1 text-sm ${
                    theme === 'dark'
                      ? 'border-gray-600 bg-gray-700 text-white'
                      : 'border-gray-300 bg-white text-gray-900'
                  }`}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label
              className={`block text-xs font-semibold uppercase tracking-wider ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Visualization mode
            </label>
            <select
              value={colorMode}
              onChange={e => setColorMode(e.target.value as 'suitableHours' | 'temperature')}
              className={`w-full rounded-full border p-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 ${
                theme === 'dark'
                  ? 'border-gray-600 bg-gray-700 text-white'
                  : 'border-gray-300 bg-white text-gray-900'
              }`}
            >
              <option value="suitableHours">Suitable hours (%)</option>
              <option value="temperature">Dry-bulb temperature</option>
            </select>
          </div>
        </div>
      </CardModal>

      {colorMode === 'suitableHours' && (
        <div className={`${EXPLORER_LEGEND_ABOVE_CHART_WRAP_CLASS} min-w-0`}>
          <UtciComfortTimeLegendStrip
            theme={theme}
            highColor={NATURAL_VENTILATION_SUITABLE_BLUE_HEX}
          />
          {legendFootnote ? (
            <p className="m-0 mt-0.5 text-[9px] font-normal leading-snug text-gray-400 dark:text-gray-500">
              {legendFootnote}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden px-1 py-0.5">
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          <svg
            ref={svgRef}
            className="block h-full w-full max-h-full max-w-full"
            preserveAspectRatio="xMidYMid meet"
          />
        </div>
      </div>
    </div>
  );
}
