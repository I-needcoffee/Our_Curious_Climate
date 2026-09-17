import { useEffect, useRef, useState, useMemo } from 'react';
import { useIsMobileMaxSm } from '../hooks/useIsMobileMaxSm';
import { useTutorialLiveOptional } from '../context/TutorialLiveContext';
import * as d3 from 'd3';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import SunCalc from 'suncalc';
import { EPWDataRow, EPWMetadata, EPWVariable } from '../lib/epwParser';
import { InteractiveLegend, GradientDef } from './InteractiveLegend';
import { AggregationToolbar } from './AggregationToolbar';
import type { ChartType, CompareSunpathSharedControls } from '../App';
import { X, Settings2 } from 'lucide-react';

import type { GlobalFilterState } from '../lib/globalFilter';
import { dryBulbCPassesGlobalTemperature, rowPassesGlobalFilters } from '../lib/globalFilter';
import { UnitSystem } from '../App';
import { ChartTypeMenu } from './ChartTypeMenu';
import { ChartToolbarLabeledMenu } from './ChartToolbarLabeledMenu';
import {
  CHART_TOOLBAR_CONTROLS_CLASS,
  CHART_TOOLBAR_EXPORT_STACKED_ROW_CLASS,
  CHART_TOOLBAR_HEADER_PAD,
  CHART_TOOLBAR_ROW_CLASS,
} from '../lib/chartToolbarLayout';
import { ExportHeaderCaption, exportCaptionLinesWithUnit, exportCaptionShort } from './ExportHeaderCaption';
import { CardModal } from './CardModal';
import { VariableChartSelect } from './VariableChartSelect';
import { defaultGradientIdForVariable } from '../lib/defaultGradientForVariable';
import { sequentialHeatmapColorFn } from '../lib/heatmapColorAdjust';
import { differenceDivergingColor, DIFFERENCE_DIVERGING_ID } from '../lib/differenceDivergingColor';
import { symmetricDiffBound } from '../lib/symmetricDiffDomain';
import { gradientsForVariable } from '../lib/availableGradientsForVariable';

const EMPTY_VARIABLES_FALLBACK: EPWVariable = {
  id: 'dryBulbTemperature',
  name: 'Dry bulb temperature',
  unit: '°C',
  min: 0,
  max: 35,
  category: 'Temperature',
  fixedMin: -20,
  fixedMax: 45,
};

/** Mean of a numeric EPW column, ignoring null/NaN (missing values are not averaged in). */
function meanEpwColumn(rows: EPWDataRow[], col: string): number {
  const vals: number[] = [];
  for (const r of rows) {
    const v = r[col] as unknown;
    if (typeof v === 'number' && !Number.isNaN(v)) vals.push(v);
  }
  return vals.length ? (d3.mean(vals) ?? 0) : 0;
}

interface SunPathProps {
  metadata: EPWMetadata;
  /** When drawing the comparison panel, sun positions use this location. */
  compareMetadata?: EPWMetadata;
  data: EPWDataRow[];
  compareData?: EPWDataRow[];
  showDifference?: boolean;
  stackedComparison?: boolean;
  /** Baseline left, comparison right when stacked with compare data. */
  pairComparisonHorizontal?: boolean;
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
  pairSuppressHeader?: boolean;
  pairModalHost?: boolean;
  sunpathShared?: CompareSunpathSharedControls;
  tutorialLegendDomId?: string;
  tutorialChromeAnchors?: boolean;
}

export function SunPath({
  metadata,
  compareMetadata,
  data,
  compareData,
  showDifference,
  stackedComparison,
  pairComparisonHorizontal,
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
  pairSuppressHeader,
  pairModalHost,
  sunpathShared,
  tutorialLegendDomId,
  tutorialChromeAnchors,
}: SunPathProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const compareSvgRef = useRef<SVGSVGElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const primaryChartSlotRef = useRef<HTMLDivElement>(null);
  const compareChartSlotRef = useRef<HTMLDivElement>(null);
  const [slotSize, setSlotSize] = useState({
    primary: { w: 400, h: 380 },
    compare: { w: 400, h: 380 },
  });
  /** Match legend strip width to the chart slot (SVG) width. */
  const [legendTrackPx, setLegendTrackPx] = useState<number | null>(null);

  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const elP = primaryChartSlotRef.current;
    if (!elP) return;

    const readSizes = () => {
      const pr = elP.getBoundingClientRect();
      const pw = Math.max(120, Math.round(pr.width));
      const ph = Math.max(120, Math.round(pr.height));
      const elC = compareChartSlotRef.current;
      let cw = pw;
      let ch = ph;
      if (elC) {
        const cr = elC.getBoundingClientRect();
        cw = Math.max(120, Math.round(cr.width));
        ch = Math.max(120, Math.round(cr.height));
      }
      setSlotSize(prev => {
        if (
          prev.primary.w === pw &&
          prev.primary.h === ph &&
          prev.compare.w === cw &&
          prev.compare.h === ch
        ) {
          return prev;
        }
        return { primary: { w: pw, h: ph }, compare: { w: cw, h: ch } };
      });
    };

    const observer = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(readSizes, 50);
    });
    observer.observe(elP);
    const elC = compareChartSlotRef.current;
    if (elC) observer.observe(elC);
    readSizes();

    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [stackedComparison, compareData, pairComparisonHorizontal]);

  useEffect(() => {
    const el = primaryChartSlotRef.current;
    if (!el) return;
    const read = () => setLegendTrackPx(Math.max(0, Math.round(el.getBoundingClientRect().width)));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stackedComparison, compareData, pairComparisonHorizontal, slotSize.primary.w, slotSize.primary.h]);

  const [iAgg, setIAgg] = useState<'hour' | 'day' | 'week' | 'month'>('week');
  const aggregation = sunpathShared?.aggregation ?? iAgg;
  const setAggregation = sunpathShared?.setAggregation ?? setIAgg;

  const [iColor, setIColor] = useState(variables[0]?.id || '');
  const colorVar = sunpathShared?.colorVar ?? iColor;
  const setColorVar = sunpathShared?.setColorVar ?? setIColor;

  const [iRadius, setIRadius] = useState(
    variables.find(v => v.id === 'globalHorizontalRadiation')?.id || variables[0]?.id || ''
  );
  const radiusVar = sunpathShared?.radiusVar ?? iRadius;
  const setRadiusVar = sunpathShared?.setRadiusVar ?? setIRadius;

  const [iGrad, setIGrad] = useState(gradients[0].id);
  const gradientId = sunpathShared?.gradientId ?? iGrad;
  const setGradientId = sunpathShared?.setGradientId ?? setIGrad;

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

  const [iRadMin, setIRadMin] = useState<number | string>(1);
  const radiusMin = sunpathShared?.radiusMin ?? iRadMin;
  const setRadiusMin = sunpathShared?.setRadiusMin ?? setIRadMin;

  const [iRadMax, setIRadMax] = useState<number | string>(12);
  const radiusMax = sunpathShared?.radiusMax ?? iRadMax;
  const setRadiusMax = sunpathShared?.setRadiusMax ?? setIRadMax;

  const [iShowSettings, setIShowSettings] = useState(false);
  const showSettings = sunpathShared?.showSettings ?? iShowSettings;
  const setShowSettings = sunpathShared?.setShowSettings ?? setIShowSettings;

  const [iShowStats, setIShowStats] = useState(false);
  const showStats = sunpathShared?.showStats ?? iShowStats;
  const setShowStats = sunpathShared?.setShowStats ?? setIShowStats;

  const showStatsModal = showStats && (!pairSuppressHeader || pairModalHost);
  const showSettingsModal = showSettings && (!pairSuppressHeader || pairModalHost);

  const paletteGradients = useMemo(
    () => gradientsForVariable(colorVar, variables, gradients),
    [colorVar, variables, gradients]
  );
  const isMobile = useIsMobileMaxSm();
  /** Mobile cannot hover; tutorial mode also pins the strip. */
  const expandChromeStrip = !exportMode && (tutorialChromeAnchors || isMobile);
  const chartToolbarRevealClass = expandChromeStrip
    ? 'overflow-hidden transition-[max-height,opacity] duration-200 ease-out max-h-[52px] opacity-100 pointer-events-auto'
    : 'overflow-hidden transition-[max-height,opacity] duration-200 ease-out max-h-0 opacity-0 pointer-events-none group-hover:max-h-[48px] group-hover:opacity-100 group-hover:pointer-events-auto focus-within:max-h-[48px] focus-within:opacity-100 focus-within:pointer-events-auto';
  const removeBtnRevealClass = isMobile
    ? 'absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 opacity-100 pointer-events-auto'
    : 'absolute right-0 top-1/2 flex shrink-0 -translate-y-1/2 opacity-0 pointer-events-none transition-opacity duration-200 ease-out group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto';
  // chart type switching handled by ChartTypeMenu
  const [tempFilterEnabled, setTempFilterEnabled] = useState(false);
  const [tempFilterType, setTempFilterType] = useState<'helpful' | 'harmful'>('helpful');
  const [helpfulThreshold, setHelpfulThreshold] = useState(unitSystem === 'imperial' ? 68 : 20);
  const [harmfulThreshold, setHarmfulThreshold] = useState(unitSystem === 'imperial' ? 77 : 25);

  const prevUnitSystem = useRef(unitSystem);
  useEffect(() => {
    if (prevUnitSystem.current !== unitSystem) {
      if (unitSystem === 'imperial') {
        setHelpfulThreshold(t => Math.round(t * 9/5 + 32));
        setHarmfulThreshold(t => Math.round(t * 9/5 + 32));
      } else {
        setHelpfulThreshold(t => Math.round((t - 32) * 5/9));
        setHarmfulThreshold(t => Math.round((t - 32) * 5/9));
      }
      prevUnitSystem.current = unitSystem;
    }
  }, [unitSystem]);

  // Group variables by category
  const groupedVariables = variables.reduce((acc, variable) => {
    const category = variable.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(variable);
    return acc;
  }, {} as Record<string, EPWVariable[]>);

  const radiusVarDef = variables.find(v => v.id === radiusVar) || variables[0] || EMPTY_VARIABLES_FALLBACK;

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

  const radiusUnit = convertUnit(radiusVarDef.unit);

  // Calculate local stats for filtered data
  const filteredData = data.filter(d => {
    if (!rowPassesGlobalFilters(d, filter)) return false;

    let isTempMatch = true;
    if (tempFilterEnabled) {
      const temp = convertValue(d.dryBulbTemperature as number, '°C');
      if (tempFilterType === 'helpful') {
        isTempMatch = temp < helpfulThreshold;
      } else {
        isTempMatch = temp > harmfulThreshold;
      }
    }

    return isTempMatch;
  });

const filteredCompareData = (compareData || []).filter(d => {
    if (!rowPassesGlobalFilters(d, filter)) return false;

    let isTempMatch = true;
    if (tempFilterEnabled) {
      const temp = convertValue(d.dryBulbTemperature as number, '°C');
      if (tempFilterType === 'helpful') {
        isTempMatch = temp < helpfulThreshold;
      } else {
        isTempMatch = temp > harmfulThreshold;
      }
    }

    return isTempMatch;
  });

  /** Radius scale domain: min/max of the radius column over the filtered global selection; in compare, union of both files. */
  const radiusValueExtent = useMemo(() => {
    const key = radiusVar;
    const collect = (rows: EPWDataRow[]) =>
      rows
        .map(d => d[key] as number)
        .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v) && v !== null);

    const primary = collect(filteredData);
    const compare = compareData && filteredCompareData.length > 0 ? collect(filteredCompareData) : [];
    const all = compare.length > 0 ? [...primary, ...compare] : primary;
    if (all.length === 0) {
      return { min: radiusVarDef.min, max: radiusVarDef.max };
    }
    const lo = d3.min(all) ?? 0;
    const hi = d3.max(all) ?? 0;
    if (hi > lo) return { min: lo, max: hi };
    return { min: lo, max: lo + 1e-6 };
  }, [filteredData, filteredCompareData, compareData, radiusVar, radiusVarDef]);

  const { colorVarDef, cMin, cMax, cUnit } = useMemo(() => {
    const def = variables.find(v => v.id === colorVar) || variables[0] || EMPTY_VARIABLES_FALLBACK;
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
  const radiusVarLabel = `${radiusVarDef.name} (${radiusUnit})`;

  const tutorialLive = useTutorialLiveOptional();
  const tutorialReport = tutorialLive?.report;
  const tutorialEnabled = tutorialLive?.enabled;
  useEffect(() => {
    if (!tutorialEnabled || !tutorialReport) return;
    const cDef = variables.find(v => v.id === colorVar) || variables[0];
    tutorialReport({
      aggregation,
      colorVarId: colorVar,
      colorVarName: cDef?.name,
      radiusVarId: radiusVar,
      radiusVarName: radiusVarDef?.name,
    });
  }, [tutorialEnabled, tutorialReport, aggregation, colorVar, variables, radiusVar, radiusVarDef?.name]);

  const stats = (() => {
    if (showDifference && compareData) {
      const diffs = filteredData.map(d => {
        const idx = data.findIndex(r => r.date.getTime() === d.date.getTime());
        const primaryVal = d[colorVar] as number;
        const compareVal = idx >= 0 ? (compareData[idx]?.[colorVar] as number) : undefined;
        if (primaryVal === null || primaryVal === undefined || compareVal === null || compareVal === undefined) {
          return null;
        }
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

  useEffect(() => {
    if (!svgRef.current) return;
    const { w: pw, h: ph } = slotSize.primary;
    if (pw === 0 || ph === 0) return;

    const renderChart = (
      svgEl: SVGSVGElement,
      currentData: any[],
      title: string | null,
      isCompare: boolean,
      width: number,
      height: number
    ) => {
    if (!currentData || !currentData.length) return;

    const locMeta = isCompare && compareMetadata ? compareMetadata : metadata;

    /** Baseline min(width,height) where radius slider values (px) were tuned — scales with resize. */
    const refChartDim = 220;
    const sizeScale = Math.max(0.4, Math.min(2.4, Math.min(width, height) / refChartDim));

    const rMinUser = typeof radiusMin === 'number' ? radiusMin : parseFloat(String(radiusMin)) || 1;
    const rMaxUser = typeof radiusMax === 'number' ? radiusMax : parseFloat(String(radiusMax)) || 12;
    /** Tighter on-chart point radii than legacy (½ scale) while min/max user inputs stay in steps of 1. */
    const rPxTweak = 0.5;
    const rMinPx = Math.max(0.2, rPxTweak * rMinUser * sizeScale);
    const rMaxPxPoints = Math.max(rMinPx + 0.2, rPxTweak * rMaxUser * sizeScale);

    const rMaxPxLayout = Math.min(28 * sizeScale, Math.max(4 * sizeScale, rPxTweak * rMaxUser * sizeScale));
    const labelRim = 15 * sizeScale;
    const titleReserve = title ? 22 * sizeScale : 0;
    const sideReserve = 8 * sizeScale;
    const rawRadius = Math.min(
      width / 2 - sideReserve - labelRim - rMaxPxLayout * 0.35,
      height / 2 - labelRim - rMaxPxLayout * 0.35 - titleReserve / 2
    );
    const maxRadius = Math.min(width, height) / 2 - 4 * sizeScale;
    const radius = Math.max(24 * sizeScale, Math.min(rawRadius, maxRadius));

    /** Rim labels scale with the plotted disk (`radius`), not only slot min-edge / refChartDim — avoids oversized type on compact cards. */
    const azimuthLabelCompassPx = Math.max(6.5, Math.min(13, radius * 0.072));
    const azimuthLabelDegPx = Math.max(6, Math.min(10.5, radius * 0.056));
    const altitudeLabelPx = Math.max(6, Math.min(10, radius * 0.048));
    const pathKeyLabelPx = Math.max(6, Math.min(9.5, radius * 0.045));
    const chartTitlePx = Math.max(9, Math.min(12.5, Math.min(width, height) * 0.032));

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // Scales
    const rScale = d3.scaleLinear().domain([90, 0]).range([0, radius]); // Altitude 90 at center, 0 at edge
    const aScale = d3.scaleLinear().domain([0, 360]).range([0, 2 * Math.PI]); // Azimuth

    // Calculate sun positions and aggregate
    let points: any[] = [];
    
    if (aggregation === 'hour') {
      points = currentData.map((d, i) => {
        const pos = SunCalc.getPosition(d.date, locMeta.lat, locMeta.lng);
        const altitude = pos.altitude * 180 / Math.PI;
        const azimuth = (pos.azimuth * 180 / Math.PI + 180) % 360; // Convert to 0=N, 90=E
        const t = d.date.getTime();
        const primaryRow = (data.find(r => r.date.getTime() === t) as EPWDataRow | undefined) ?? (data[i] as EPWDataRow | undefined);
        const compareRow =
          compareData &&
          ((compareData.find(c => c.date.getTime() === t) as EPWDataRow | undefined) ?? (compareData[i] as EPWDataRow | undefined));
        
        let val: number;
        let rVal: number;
        if (showDifference && compareData && primaryRow && compareRow) {
          const primaryVal = primaryRow[colorVar] as number;
          const compareVal = compareRow[colorVar] as number;
          val = convertValue(compareVal - primaryVal, colorVarDef.unit, true);
        } else {
          val = convertValue(d[colorVar] as number, colorVarDef.unit);
        }
        {
          // Difference mode: radii follow the **primary** file; otherwise the row on this chart.
          const radiusFrom = showDifference && primaryRow ? primaryRow : d;
          const raw = radiusFrom[radiusVar] as unknown;
          rVal = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0;
        }
        
        return { ...d, altitude, azimuth, _val: val, _rVal: rVal };
      }).filter(d => d.altitude > 0);
    } else {
      // “Average” sun path: group by the same row fields the table uses (day/week/month + hour of row).
      // In **difference** mode, bins are always from the **primary** `data` so both charts share the same samples for primary vs compare.
      // Sort each bin by `date` so the representative `midDate` and means stay aligned with the EPW order.
      const groupData: EPWDataRow[] = showDifference && compareData ? data : currentData;
      let groups;
      if (aggregation === 'day') {
        groups = d3.group(groupData, d => d.dayOfYear, d => d.hour);
      } else if (aggregation === 'week') {
        groups = d3.group(groupData, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
      } else {
        groups = d3.group(groupData, d => d.month, d => d.hour);
      }

      Array.from(groups).forEach(([period, hourGroups]) => {
        Array.from(hourGroups).forEach(([hour, values]) => {
          const sorted = [...values].sort((a, b) => a.date.getTime() - b.date.getTime());
          const byDate = sorted as EPWDataRow[];
          const midDate = byDate[Math.floor(byDate.length / 2)]!.date;
          const pos = SunCalc.getPosition(midDate, locMeta.lat, locMeta.lng);
          const altitude = (pos.altitude * 180) / Math.PI;

          if (altitude > 0) {
            const azimuth = ((pos.azimuth * 180) / Math.PI + 180) % 360;

            let val: number;
            let rVal: number;
            if (showDifference && compareData) {
              const primaryAvg = meanEpwColumn(byDate, colorVar);
              const compareValues = byDate
                .map(v => {
                  const idx = data.findIndex(r => r.date.getTime() === v.date.getTime());
                  return idx >= 0 ? (compareData[idx]?.[colorVar] as number) : null;
                })
                .filter((x): x is number => x !== null && !Number.isNaN(x));
              const compareAvg = d3.mean(compareValues) || 0;
              val = convertValue(compareAvg - primaryAvg, colorVarDef.unit, true);
              rVal = meanEpwColumn(byDate, radiusVar);
            } else {
              val = convertValue(meanEpwColumn(byDate, colorVar), colorVarDef.unit);
              rVal = meanEpwColumn(byDate, radiusVar);
            }

            const rep = byDate[0]!;
            points.push({
              date: midDate,
              altitude,
              azimuth,
              _val: val,
              _rVal: rVal,
              [radiusVar]: rVal,
              dryBulbTemperature: meanEpwColumn(byDate, 'dryBulbTemperature'),
              _count: byDate.length,
              _period: period,
              _hour: hour,
              month: rep.month
            });
          }
        });
      });
    }

    // Color scale
    const gradientDef = gradients.find(g => g.id === gradientId) || gradients[0];
    
    let colorScale: any;
    if (showDifference && compareData) {
      colorScale = (v: number) => differenceDivergingColor(v, cMin, cMax);
    } else {
      colorScale = sequentialHeatmapColorFn(gradientDef.colors, colorVarDef, cMin, cMax);
    }

    // Radius value → px: data domain is min/max of the selected radius field over the filtered range (compare = union of both).
    const pointRadiusScale = d3
      .scaleLinear()
      .domain([radiusValueExtent.min, radiusValueExtent.max])
      .range([rMinPx, rMaxPxPoints])
      .clamp(true);
    const haloExtra = Math.max(0.5, sizeScale);

    // Draw lower color values first; higher _val (further on the color scale) paints on top.
    const colorKey = (d: { _val?: number }) => {
      const v = d._val as number;
      return Number.isFinite(v) ? v : 0;
    };
    points.sort((a, b) => colorKey(a) - colorKey(b));

    // Split points into selected and unselected
    const isSelected = (d: any) => {
      const m = d.month || (d.date ? d.date.getMonth() + 1 : 1);
      const h = d._hour !== undefined ? d._hour : (d.hour !== undefined ? d.hour : (d.date ? d.date.getHours() : 0));
      const isMonthMatch = filter.startMonth <= filter.endMonth
        ? (m >= filter.startMonth && m <= filter.endMonth)
        : (m >= filter.startMonth || m <= filter.endMonth);

      /** Workspace dry-bulb isolation vs EPW °C — aggregated points carry mean °C like other charts. */
      const isIsolationTemp =
        filter.temperatureMode === 'off' ||
        dryBulbCPassesGlobalTemperature(d.dryBulbTemperature as number | null | undefined, filter);
      
      let isTempMatch = true;
      if (tempFilterEnabled) {
        const temp = convertValue(d.dryBulbTemperature as number, '°C');
        if (isNaN(temp)) {
          isTempMatch = true;
        } else if (tempFilterType === 'helpful') {
          isTempMatch = temp < helpfulThreshold;
        } else {
          isTempMatch = temp > harmfulThreshold;
        }
      }

      return (
        isMonthMatch &&
        h >= filter.startHour &&
        h <= filter.endHour &&
        isIsolationTemp &&
        isTempMatch
      );
    };

    const selectedPoints = points.filter(isSelected);
    const unselectedPoints = points.filter(d => !isSelected(d));

    // 1. Draw unselected points (bottom layer)
    g.selectAll(".data-point-unselected")
      .data(unselectedPoints)
      .join("circle")
      .attr("class", "data-point-unselected")
      .attr("cx", d => rScale(d.altitude) * Math.sin(aScale(d.azimuth)))
      .attr("cy", d => -rScale(d.altitude) * Math.cos(aScale(d.azimuth)))
      .attr("r", d => pointRadiusScale(d._rVal as number) || 0)
      .style("fill", d => colorScale(d._val))
      .style("stroke", "none")
      .style("opacity", 0.15)
      .style("pointer-events", "none");

    // 2. Draw grid
    const altitudes = [0, 15, 30, 45, 60, 75];
    const azimuths = d3.range(0, 360, 30);

    // Altitude circles
    g.selectAll(".altitude-circle")
      .data(altitudes)
      .join("circle")
      .attr("class", "altitude-circle")
      .attr("r", d => rScale(d))
      .style("fill", "none")
      .style("stroke", d => d === 0 ? (theme === 'dark' ? '#4b5563' : '#1f2937') : (theme === 'dark' ? '#374151' : '#e5e7eb'))
      .style("stroke-width", d => d === 0 ? '2px' : '1px');

    // Altitude labels
    g.selectAll(".altitude-label")
      .data(altitudes.filter(d => d > 0))
      .join("text")
      .attr("class", "altitude-label")
      .attr("y", d => -rScale(d))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("fill", heatmapTextColor)
      .style("font-size", `${altitudeLabelPx}px`)
      .style("font-weight", "500")
      .text(d => `${d}°`);

    // Azimuth lines
    g.selectAll(".azimuth-line")
      .data(azimuths)
      .join("line")
      .attr("class", "azimuth-line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", d => rScale(0) * Math.sin(aScale(d)))
      .attr("y2", d => -rScale(0) * Math.cos(aScale(d)))
      .style("stroke", theme === 'dark' ? '#374151' : '#e5e7eb')
      .style("stroke-width", '1px');

    // Azimuth labels
    const compass = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    const azimuthLabelOutset = Math.max(4, Math.min(13, radius * 0.058));
    g.selectAll(".azimuth-label")
      .data(azimuths)
      .join("text")
      .attr("class", "azimuth-label")
      .attr("x", d => (rScale(0) + azimuthLabelOutset) * Math.sin(aScale(d)))
      .attr("y", d => -(rScale(0) + azimuthLabelOutset) * Math.cos(aScale(d)))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("fill", heatmapTextColor)
      .style("font-weight", d => (compass[d as keyof typeof compass] ? "600" : "500"))
      .style("font-size", d =>
        compass[d as keyof typeof compass] ? `${azimuthLabelCompassPx}px` : `${azimuthLabelDegPx}px`
      )
      .text(d => compass[d as keyof typeof compass] || `${d}°`);

    // 3. Draw Sun Path Lines (Solstices and Equinoxes)
    const year = currentData[0]?.date.getFullYear() || new Date().getFullYear();
    const keyDates = [
      { name: 'Summer Solstice', date: new Date(year, 5, 21) }, // June 21
      { name: 'Equinox', date: new Date(year, 2, 21) }, // March 21
      { name: 'Winter Solstice', date: new Date(year, 11, 21) } // Dec 21
    ];

    /**
     * One continuous `d3.line` on all "sun up" samples draws a spurious chord if the sun is
     * above the horizon in two or more local-time windows the same day (e.g. high latitudes) or
     * if a numerical blip at the horizon leaves two disjoint segments. Also `curveBasis` can
     * overshoot between sunrise/sunset points and look like a straight tie across the dial.
     */
    const lineGenerator = d3
      .line<{ altitude: number; azimuth: number }>()
      .x(d => rScale(d.altitude) * Math.sin(aScale(d.azimuth)))
      .y(d => -rScale(d.altitude) * Math.cos(aScale(d.azimuth)))
      .curve(d3.curveLinear);

    keyDates.forEach(kd => {
      const segments: { altitude: number; azimuth: number }[][] = [];
      let current: { altitude: number; azimuth: number }[] = [];
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 10) {
          const d = new Date(kd.date);
          d.setHours(h, m, 0, 0);
          const pos = SunCalc.getPosition(d, locMeta.lat, locMeta.lng);
          const altitude = (pos.altitude * 180) / Math.PI;
          if (altitude >= 0) {
            const azDeg = (pos.azimuth * 180) / Math.PI + 180;
            const azimuth = ((azDeg % 360) + 360) % 360;
            current.push({ altitude, azimuth });
          } else {
            if (current.length > 0) {
              segments.push(current);
              current = [];
            }
          }
        }
      }
      if (current.length > 0) {
        segments.push(current);
      }

      for (const pathPoints of segments) {
        if (pathPoints.length < 2) continue;
        g.append("path")
          .datum(pathPoints)
          .attr("d", lineGenerator)
          .style("fill", "none")
          .style("stroke", theme === 'dark' ? '#6b7280' : '#4b5563')
          .style("stroke-width", '3px')
          .style("opacity", 0.8)
          .style("pointer-events", "none");
      }

      const allPoints = segments.flat();
      if (allPoints.length > 0) {
        const highestPoint = allPoints.reduce((prev, cur) => (prev.altitude > cur.altitude ? prev : cur));
        if (highestPoint.altitude > 0) {
          g.append("text")
            .attr("x", rScale(highestPoint.altitude) * Math.sin(aScale(highestPoint.azimuth)))
            .attr(
              "y",
              -rScale(highestPoint.altitude) * Math.cos(aScale(highestPoint.azimuth)) -
                Math.max(5, radius * 0.052)
            )
            .attr("text-anchor", "middle")
            .style("fill", heatmapTextColor)
            .style("font-size", `${pathKeyLabelPx}px`)
            .style("font-weight", "bold")
            .style("pointer-events", "none")
            .text(kd.name);
        }
      }
    });

    // 4. Draw black background circles for selected points
    g.selectAll(".data-point-bg")
      .data(selectedPoints)
      .join("circle")
      .attr("class", "data-point-bg")
      .attr("cx", d => rScale(d.altitude) * Math.sin(aScale(d.azimuth)))
      .attr("cy", d => -rScale(d.altitude) * Math.cos(aScale(d.azimuth)))
      .attr("r", d => (pointRadiusScale(d._rVal as number) || 0) + haloExtra)
      .style("fill", theme === 'dark' ? '#111827' : '#1f2937')
      .style("opacity", 0.8)
      .style("pointer-events", "none");

    // 5. Draw selected points (top layer)
    g.selectAll(".data-point-selected")
      .data(selectedPoints)
      .join("circle")
      .attr("class", "data-point-selected")
      .attr("cx", d => rScale(d.altitude) * Math.sin(aScale(d.azimuth)))
      .attr("cy", d => -rScale(d.altitude) * Math.cos(aScale(d.azimuth)))
      .attr("r", d => pointRadiusScale(d._rVal as number) || 0)
      .style("fill", d => colorScale(d._val))
      .style("stroke", "none")
      .style("opacity", 1)
      .style("mix-blend-mode", "normal")
      .append("title")
      .text(d => {
        const prefix = aggregation === 'hour' ? '' : `Avg (${d._count} samples)\n`;
        const val = d._val;
        return `${prefix}${d.date.toLocaleString()}\nAlt: ${d.altitude.toFixed(1)}°\nAz: ${d.azimuth.toFixed(1)}°\n${colorVarDef.name}${showDifference ? ' Diff' : ''}: ${val.toFixed(1)} ${cUnit}`;
      });


    
    if (title) {
         const titleMargin = 12 * sizeScale;
         g.append("text")
          .attr("x", -titleMargin + 4)
          .attr("y", -height / 2 + 14 * sizeScale)
          .style("font-size", `${chartTitlePx}px`)
          .style("font-weight", "bold")
          .style("fill", heatmapTextColor)
          .text(title);
    }
  };

  if (stackedComparison && compareData) {
      const { w: cw, h: ch } = slotSize.compare;
      renderChart(svgRef.current, data, null, false, pw, ph);
      if (compareSvgRef.current && cw > 0 && ch > 0) {
        renderChart(compareSvgRef.current, compareData, null, true, cw, ch);
      }
  } else {
      renderChart(svgRef.current, data, null, false, pw, ph);
  }
  }, [metadata, compareMetadata, data, compareData, showDifference, stackedComparison, pairComparisonHorizontal, variables, colorVar, radiusVar, gradientId, radiusMin, radiusMax, aggregation, gradients, filter, slotSize.primary.w, slotSize.primary.h, slotSize.compare.w, slotSize.compare.h, unitSystem, theme, heatmapTextColor, tempFilterEnabled, tempFilterType, helpfulThreshold, harmfulThreshold, colorVarDef, radiusValueExtent]);

  /** Compare page: two-pane sun path — legend under both charts, centered (matches other compare cards). */
  const sunComparePairLegendInFooter = Boolean(
    stackedComparison && compareData && pairSuppressHeader && !exportMode
  );

  const interactiveLegendNode = (
    <InteractiveLegend
      domId={tutorialLegendDomId}
      variable={{ ...colorVarDef, min: cMin, max: cMax, unit: cUnit }}
      gradientId={gradientId}
      setGradientId={setGradientId}
      gradients={gradients}
      theme={theme}
      isDifference={showDifference}
    />
  );

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
            <div className={`${CHART_TOOLBAR_EXPORT_STACKED_ROW_CLASS} min-w-0`}>
              <ChartTypeMenu
                value="sunpath"
                label="Sun Path"
                onChange={() => {}}
                theme="light"
                display="icon"
                staticIcon
              />
              <ExportHeaderCaption
                lines={[
                  (() => {
                    const c = exportCaptionLinesWithUnit(colorVarDef.category, colorVarDef.name, cUnit);
                    return { short: `Color · ${c.short}`, long: `Color · ${c.long}` };
                  })(),
                  (() => {
                    const r = exportCaptionLinesWithUnit(radiusVarDef.category, radiusVarDef.name, radiusUnit);
                    return { short: `Radius · ${r.short}`, long: `Radius · ${r.long}` };
                  })(),
                ]}
              />
            </div>
          ) : (
            <>
              <div
                className={`relative ${CHART_TOOLBAR_ROW_CLASS} w-full ${
                  isMobile ? 'pr-9' : 'group-hover:pr-9 focus-within:pr-9'
                }`}
              >
                <div className={CHART_TOOLBAR_CONTROLS_CLASS}>
                  <ChartTypeMenu
                    value="sunpath"
                    label="Sun Path"
                    onChange={(t) => onChangeType?.(t)}
                    theme={theme}
                    disabled={!onChangeType}
                    display="icon"
                    tutorialAnchorId={tutorialChromeAnchors ? 'tutorial-card-chart-type' : undefined}
                    discoverPulse={!!tutorialChromeAnchors}
                  />
                  <ChartToolbarLabeledMenu
                    label="Color"
                    value={colorVar}
                    onChange={setColorVar}
                    groupedVariables={groupedVariables}
                    convertUnit={convertUnit}
                    selectedName={colorVarDef.name}
                    theme={theme}
                    domId={tutorialChromeAnchors ? 'tutorial-card-data-control' : undefined}
                  />
                  <ChartToolbarLabeledMenu
                    label="Radius"
                    value={radiusVar}
                    onChange={setRadiusVar}
                    groupedVariables={groupedVariables}
                    convertUnit={convertUnit}
                    selectedName={radiusVarDef.name}
                    theme={theme}
                    domId={tutorialChromeAnchors ? 'tutorial-card-sunpath-radius' : undefined}
                  />
                </div>
                {onRemove && (
                  <div className={removeBtnRevealClass}>
                    <button
                      type="button"
                      onClick={onRemove}
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full shadow-hard-sm transition-colors ${theme === 'dark' ? 'text-gray-400 hover:bg-red-900/30 hover:text-red-400' : 'text-gray-400 hover:bg-red-50 hover:text-red-500'}`}
                    >
                      <X className="h-3 w-3" />
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
                            ? (theme === 'dark' ? 'bg-gray-700/90 text-gray-200' : 'bg-gray-100 text-gray-800')
                            : (theme === 'dark' ? 'bg-gray-800 text-gray-400 hover:text-gray-200' : 'bg-gray-50 text-gray-500 hover:text-gray-800')
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
                            ? (theme === 'dark' ? 'bg-gray-700/90 text-gray-200' : 'bg-gray-100 text-gray-800')
                            : (theme === 'dark' ? 'bg-gray-800 text-gray-400 hover:text-gray-200' : 'bg-gray-50 text-gray-500 hover:text-gray-800')
                        }`}
                        title="Chart settings"
                      >
                        <Settings2 className="w-3 h-3" />
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

      {!sunComparePairLegendInFooter && (
        <div
          className="w-full min-w-0 flex-shrink-0 px-2 pt-1.5 pb-0.5"
          style={legendTrackPx != null ? { width: legendTrackPx } : undefined}
        >
          {interactiveLegendNode}
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
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Color Variable</label>
                <select
                  value={colorVar}
                  onChange={(e) => setColorVar(e.target.value)}
                  className={`w-full text-sm rounded-lg focus:ring-gray-500 focus:border-gray-500 block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
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
                </select>
              </div>
              <div className="space-y-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Radius Variable</label>
                <select
                  value={radiusVar}
                  onChange={(e) => setRadiusVar(e.target.value)}
                  className={`w-full text-sm rounded-lg focus:ring-gray-500 focus:border-gray-500 block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
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
                </select>
              </div>
              <div className="space-y-2">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Radius Min/Max</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={radiusMin}
                    onChange={(e) => setRadiusMin(e.target.value)}
                    min={1}
                    step={1}
                    className={`block w-1/2 rounded-full border p-2.5 text-sm outline-none transition-all focus:border-gray-500 focus:ring-gray-500 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                    placeholder="1"
                    title="Minimum point radius (logical units, step 1)"
                  />
                  <input
                    type="number"
                    value={radiusMax}
                    onChange={(e) => setRadiusMax(e.target.value)}
                    min={1}
                    step={1}
                    className={`block w-1/2 rounded-full border p-2.5 text-sm outline-none transition-all focus:border-gray-500 focus:ring-gray-500 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                    placeholder="12"
                    title="Maximum point radius (logical units, step 1)"
                  />
                </div>
              </div>
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

              <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    Temperature Filter
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={tempFilterEnabled}
                      onChange={e => setTempFilterEnabled(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-gray-700"></div>
                  </label>
                </div>
                
                {tempFilterEnabled && (
                  <div className="flex gap-2 items-center">
                    <select
                      value={tempFilterType}
                      onChange={e => setTempFilterType(e.target.value as any)}
                      className={`block flex-1 rounded-full border p-2.5 text-sm outline-none transition-all focus:border-gray-500 focus:ring-gray-500 ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                    >
                      <option value="helpful">Helpful (Below)</option>
                      <option value="harmful">Harmful (Above)</option>
                    </select>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={tempFilterType === 'helpful' ? helpfulThreshold : harmfulThreshold}
                        onChange={e => {
                          if (tempFilterType === 'helpful') {
                            setHelpfulThreshold(Number(e.target.value));
                          } else {
                            setHarmfulThreshold(Number(e.target.value));
                          }
                        }}
                        className={`w-full text-sm rounded-lg focus:ring-gray-500 focus:border-gray-500 block p-2.5 transition-all outline-none border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-white'}`}
                      />
                      <span className={`absolute right-3 top-2.5 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        {unitSystem === 'imperial' ? '°F' : '°C'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
        </div>
      </CardModal>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1 py-0.5">
        <div
          className={`flex min-h-0 flex-1 ${
            stackedComparison && compareData && pairComparisonHorizontal
              ? 'min-h-[160px] flex-row divide-x divide-gray-200 dark:divide-gray-700'
              : stackedComparison && compareData
                ? 'min-h-[160px] flex-col gap-0.5'
                : 'flex-col'
          }`}
        >
          <div
            ref={primaryChartSlotRef}
            className={`relative flex min-w-0 flex-1 items-center justify-center min-h-[120px] max-sm:aspect-square max-sm:min-h-0 max-sm:w-full max-sm:shrink-0 ${
              stackedComparison && compareData && !pairComparisonHorizontal ? 'min-h-[140px] max-sm:min-h-0' : ''
            }`}
          >
            <svg ref={svgRef} className="block h-full max-h-full w-full max-w-full" preserveAspectRatio="xMidYMid meet" />
          </div>
          {stackedComparison && compareData && (
            <div
              ref={compareChartSlotRef}
              className={`relative flex min-w-0 flex-1 items-center justify-center min-h-[120px] max-sm:aspect-square max-sm:min-h-0 max-sm:w-full max-sm:shrink-0 ${
                !pairComparisonHorizontal ? 'min-h-[140px] max-sm:min-h-0' : ''
              }`}
            >
              <svg ref={compareSvgRef} className="block h-full max-h-full w-full max-w-full" preserveAspectRatio="xMidYMid meet" />
            </div>
          )}
        </div>
      </div>

      {sunComparePairLegendInFooter && (
        <div
          className={`mx-auto w-full max-w-full shrink-0 border-t px-1 pt-1.5 pb-1 ${
            theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
          }`}
          style={legendTrackPx != null ? { width: legendTrackPx } : undefined}
        >
          {interactiveLegendNode}
        </div>
      )}
    </div>
  );
}
