import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Settings2 } from 'lucide-react';
import { EPWVariable, ParsedEPW } from '../lib/epwParser';
import { weatherLocationTypeCaption } from '../lib/weatherCaption';
import type {
  ChartConfig,
  ChartType,
  CompareChartOpts,
  CompareExplorerSharedControls,
  CompareSunpathSharedControls,
  CompareUtciSharedControls,
  CompareWindSharedControls,
  CompareWindRoseSharedControls,
  UnitSystem,
} from '../App';
import type { CompareWindIemSharedControls } from '../lib/iem/windIemPrefsShared';
import { useWindIemGlobalPrefs } from '../lib/iem/globalWindIemPrefsStore';
import { variableLegendDomain } from '../lib/variableLegendDomain';
import { convertUnit, convertValue, UNIT_C, UNIT_F } from '../lib/unitConversion';
import { utciGradientExtentFromRows } from '../lib/utciModel';
import { GRADIENTS } from '../lib/constants';
import { DIFFERENCE_DIVERGING_ID } from '../lib/differenceDivergingColor';
import type { GradientDef } from './InteractiveLegend';
import { InteractiveLegend } from './InteractiveLegend';
import {
  UtciCategoryLegendStrip,
  UtciComfortTimeLegendStrip,
  UTCI_LEGEND_FONT_SCALE,
} from './UtciExplorer';
import { ChartTypeMenu } from './ChartTypeMenu';
import { AggregationToolbar } from './AggregationToolbar';
import { VariableChartSelect } from './VariableChartSelect';

interface ComparisonModeLayoutProps {
  files: ParsedEPW[];
  baselineIndex: number;
  compareIndex: number;
  onBaselineIndex: (i: number) => void;
  onCompareIndex: (i: number) => void;
  exportMode: boolean;
  theme: 'light' | 'dark';
  renderChart: (
    config: ChartConfig,
    primary: ParsedEPW,
    compare: ParsedEPW | undefined,
    showDifference: boolean,
    stacked: boolean,
    opts?: CompareChartOpts
  ) => React.ReactNode;
  unitSystem: UnitSystem;
  gradients: GradientDef[];
}

/** Same pattern as `SunPath`: measure the left chart pane and size/center the footer legend strip. */
function useLegendTrackWidthFromLeftPane() {
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const [legendTrackPx, setLegendTrackPx] = useState<number | null>(null);
  useEffect(() => {
    const el = leftPaneRef.current;
    if (!el) return;
    const read = () => setLegendTrackPx(Math.max(0, Math.round(el.getBoundingClientRect().width)));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { leftPaneRef, legendTrackPx };
}

/** Two spaces + chevron: align with `VariableChartSelect` (text measure + `CHEVRON_SLOT_PX`). */
const PILL_DROPDOWN_CHEVRON_GUTTER_PX = 20;

function pillSelectOptionLabel(f: ParsedEPW) {
  return (
    weatherLocationTypeCaption(f) || `${f.metadata.city}${f.metadata.state ? `, ${f.metadata.state}` : ''}` || '\u2014'
  );
}

function PillSelect({
  label,
  value,
  onChange,
  options,
  tone,
  theme,
}: {
  label: string;
  value: number;
  onChange: (i: number) => void;
  options: ParsedEPW[];
  /** Baseline = light grey; comparison = near-black (light) / ink (dark). */
  tone: 'baseline' | 'comparison';
  theme: 'light' | 'dark';
}) {
  const base =
    tone === 'baseline'
      ? theme === 'dark'
        ? 'border-gray-600 bg-gray-700/55 text-gray-100'
        : 'border-gray-300 bg-gray-200/90 text-gray-900'
      : theme === 'dark'
        ? 'border-gray-700 bg-gray-950 text-gray-50'
        : 'border-gray-800 bg-gray-950 text-white';

  const caret =
    tone === 'baseline'
      ? theme === 'dark'
        ? 'text-gray-400'
        : 'text-gray-500'
      : theme === 'dark'
        ? 'text-gray-500'
        : 'text-gray-300';

  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const gapRef = useRef<HTMLSpanElement>(null);
  const [boxW, setBoxW] = useState<number | null>(null);
  const [paddingRightPx, setPaddingRightPx] = useState(PILL_DROPDOWN_CHEVRON_GUTTER_PX);
  const selectedLabel = useMemo(
    () => (options[value] != null ? pillSelectOptionLabel(options[value]) : ''),
    [options, value]
  );

  const recalc = useCallback(() => {
    const m = measureRef.current;
    const row = rowRef.current;
    if (!m || !row) return;
    const textW = m.getBoundingClientRect().width;
    let gapW = 8;
    if (gapRef.current) gapW = gapRef.current.getBoundingClientRect().width;
    const pr = Math.ceil(gapW + PILL_DROPDOWN_CHEVRON_GUTTER_PX);
    const cap = Math.max(40, Math.floor(row.getBoundingClientRect().width));
    const desired = Math.ceil(textW + pr);
    setPaddingRightPx(prev => (prev === pr ? prev : pr));
    const nextW = Math.min(desired, cap);
    setBoxW(prev => (prev === nextW ? prev : nextW));
  }, [selectedLabel]);

  useLayoutEffect(() => {
    recalc();
  }, [recalc]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(() => recalc());
    ro.observe(row);
    return () => ro.disconnect();
  }, [recalc]);

  return (
    <label
      className={`mx-auto flex w-full max-w-[min(100%,280px)] flex-col items-center justify-center gap-0.5 rounded-full border px-2 py-0.5 text-center shadow-sm ${base}`}
    >
      <span
        className={`block w-full text-center text-[7px] font-bold uppercase leading-none tracking-wider ${
          tone === 'baseline'
            ? theme === 'dark'
              ? 'text-gray-400'
              : 'text-gray-600'
            : theme === 'dark'
              ? 'text-gray-400'
              : 'text-gray-300'
        }`}
      >
        {label}
      </span>
      <div ref={rowRef} className="relative flex w-full min-w-0 items-center justify-center">
        <span
          ref={measureRef}
          className={`pointer-events-none absolute left-0 top-0 -z-10 whitespace-nowrap opacity-0 text-[10px] font-semibold ${
            tone === 'baseline'
              ? theme === 'dark'
                ? 'text-gray-100'
                : 'text-gray-900'
              : theme === 'dark'
                ? 'text-gray-50'
                : 'text-white'
          }`}
          style={{ lineHeight: 1.15 }}
          aria-hidden
        >
          {selectedLabel}
        </span>
        <span
          ref={gapRef}
          className={`pointer-events-none absolute left-0 top-0 -z-10 whitespace-pre opacity-0 text-[10px] font-semibold ${
            tone === 'baseline'
              ? theme === 'dark'
                ? 'text-gray-100'
                : 'text-gray-900'
              : theme === 'dark'
                ? 'text-gray-50'
                : 'text-white'
          }`}
          style={{ lineHeight: 1.15 }}
          aria-hidden
        >
          {'  '}
        </span>
        <div
          className="relative min-w-0 max-w-full shrink-0"
          style={boxW != null ? { width: `${boxW}px`, maxWidth: '100%' } : { maxWidth: '100%' }}
        >
          <select
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            className={`m-0 block h-auto min-h-0 w-full cursor-pointer appearance-none truncate rounded-none border-0 bg-transparent py-0 pl-0 pr-0 text-center text-[10px] font-semibold leading-none outline-none ring-0 focus:ring-0 ${
              tone === 'baseline'
                ? theme === 'dark'
                  ? 'text-gray-100'
                  : 'text-gray-900'
                : theme === 'dark'
                  ? 'text-gray-50'
                  : 'text-white'
            }`}
            style={{ lineHeight: 1.15, paddingRight: paddingRightPx }}
            title={selectedLabel}
          >
            {options.map((f, i) => (
              <option key={i} value={i} className="bg-white text-gray-900">
                {pillSelectOptionLabel(f)}
              </option>
            ))}
          </select>
          <span
            className={`pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 text-[8px] leading-none opacity-70 ${caret}`}
            aria-hidden
          >
            â–¾
          </span>
        </div>
      </div>
    </label>
  );
}

function CompareCardShell({
  children,
  theme,
  exportMode,
  className = '',
}: {
  children: React.ReactNode;
  theme: 'light' | 'dark';
  exportMode: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-hard-lg ${className} ${
        exportMode
          ? 'border-gray-200 bg-white'
          : theme === 'dark'
            ? 'border-gray-700 bg-gray-800'
            : 'border-gray-200 bg-white'
      }`}
    >
      {children}
    </div>
  );
}

function groupVariables(variables: ParsedEPW['variables']): Record<string, EPWVariable[]> {
  return variables.reduce<Record<string, EPWVariable[]>>((acc, v) => {
    const cat = v.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(v);
    return acc;
  }, {});
}

function PairSharedToolbar({
  theme,
  exportMode,
  children,
}: {
  theme: 'light' | 'dark';
  exportMode: boolean;
  children: React.ReactNode;
}) {
  if (exportMode) return null;
  return (
    <div
      className={`shrink-0 border-b px-1.5 py-1.5 ${
        theme === 'dark' ? 'border-gray-700 bg-gray-800/95' : 'border-gray-200 bg-gray-50/90'
      }`}
    >
      {children}
    </div>
  );
}

function convertUnitForLegend(unit: string, unitSystem: UnitSystem) {
  return convertUnit(unit, unitSystem);
}

export function ComparisonModeLayout({
  files,
  baselineIndex,
  compareIndex,
  onBaselineIndex,
  onCompareIndex,
  exportMode,
  theme,
  renderChart,
  unitSystem,
  gradients,
}: ComparisonModeLayoutProps) {
  const baseline = files[baselineIndex];
  const compare = files[compareIndex];

  const baselineGrouped = useMemo(() => groupVariables(baseline.variables), [baseline.variables]);

  const [expAgg, setExpAgg] = useState<CompareExplorerSharedControls['aggregation']>('month');
  const [expVar, setExpVar] = useState('dryBulbTemperature');
  const [expGrad, setExpGrad] = useState(DIFFERENCE_DIVERGING_ID);
  const [expStats, setExpStats] = useState(false);
  const [expSettings, setExpSettings] = useState(false);

  const [barYDomain, setBarYDomain] = useState<{ min: number; max: number } | null>(null);
  const barYPrimary = useRef<{ min: number; max: number } | null>(null);
  const barYSecondary = useRef<{ min: number; max: number } | null>(null);

  const onBarYExtent = useCallback(
    (e: { min: number; max: number; pane: 'primary' | 'secondary' } | 'clear') => {
      if (e === 'clear') {
        barYPrimary.current = null;
        barYSecondary.current = null;
        setBarYDomain(null);
        return;
      }
      if (e.pane === 'primary') barYPrimary.current = { min: e.min, max: e.max };
      else barYSecondary.current = { min: e.min, max: e.max };
      const p = barYPrimary.current;
      const s = barYSecondary.current;
      const setIfChanged = (next: { min: number; max: number } | null) => {
        setBarYDomain(cur => {
          if (cur === null && next === null) return cur;
          if (cur && next) {
            const same =
              Math.abs(cur.min - next.min) < 1e-4 && Math.abs(cur.max - next.max) < 1e-4;
            if (same) return cur;
            return next;
          }
          return next;
        });
      };
      if (p && s) {
        const lo = Math.min(p.min, s.min);
        const hi = Math.max(p.max, s.max);
        const n = d3.scaleLinear().domain([lo, hi]).nice();
        const d = n.domain();
        setIfChanged({ min: d[0]!, max: d[1]! });
      } else {
        const only = p ?? s;
        if (only) {
          const n = d3.scaleLinear().domain([only.min, only.max]).nice();
          const d = n.domain();
          setIfChanged({ min: d[0]!, max: d[1]! });
        } else {
          setIfChanged(null);
        }
      }
    },
    []
  );

  useEffect(() => {
    barYPrimary.current = null;
    barYSecondary.current = null;
    setBarYDomain(null);
  }, [expVar, expAgg, baselineIndex, compareIndex]);

  const explorerShared: CompareExplorerSharedControls = useMemo(
    () => ({
      aggregation: expAgg,
      setAggregation: setExpAgg,
      colorVar: expVar,
      setColorVar: setExpVar,
      gradientId: expGrad,
      setGradientId: setExpGrad,
      showStats: expStats,
      setShowStats: setExpStats,
      showSettings: expSettings,
      setShowSettings: setExpSettings,
      barYDomain,
      onBarYExtent,
    }),
    [
      expAgg,
      expVar,
      expGrad,
      expStats,
      expSettings,
      barYDomain,
      onBarYExtent,
    ]
  );

  const [utciAgg, setUtciAgg] = useState<CompareUtciSharedControls['aggregation']>('month');
  const [utciSun, setUtciSun] = useState(true);
  const [utciWind, setUtciWind] = useState(true);
  const [utciColorMode, setUtciColorMode] = useState<CompareUtciSharedControls['colorMode']>('comfortTime');
  const [utciGrad, setUtciGrad] = useState(DIFFERENCE_DIVERGING_ID);
  const [utciStats, setUtciStats] = useState(false);
  const [utciSettings, setUtciSettings] = useState(false);

  const utciShared: CompareUtciSharedControls = {
    aggregation: utciAgg,
    setAggregation: setUtciAgg,
    includeSun: utciSun,
    setIncludeSun: setUtciSun,
    includeWind: utciWind,
    setIncludeWind: setUtciWind,
    colorMode: utciColorMode,
    setColorMode: setUtciColorMode,
    gradientId: utciGrad,
    setGradientId: setUtciGrad,
    showStats: utciStats,
    setShowStats: setUtciStats,
    showSettings: utciSettings,
    setShowSettings: setUtciSettings,
  };

  const iemGlobal = useWindIemGlobalPrefs();
  const compareWindIem: CompareWindIemSharedControls = useMemo(
    () => ({
      source: iemGlobal.source,
      setSource: iemGlobal.setSource,
      iemYearStart: iemGlobal.iemYearStart,
      iemYearEnd: iemGlobal.iemYearEnd,
      setIemYearRange: iemGlobal.setIemYearRange,
      iemStation: iemGlobal.iemStation,
      setIemStation: iemGlobal.setIemStation,
    }),
    [
      iemGlobal.source,
      iemGlobal.iemYearStart,
      iemGlobal.iemYearEnd,
      iemGlobal.iemStation,
      iemGlobal.setSource,
      iemGlobal.setIemYearRange,
      iemGlobal.setIemStation,
    ]
  );

  const [windAgg, setWindAgg] = useState<CompareWindSharedControls['aggregation']>('month');
  const [windVar, setWindVar] = useState(
    () => baseline.variables.find(v => v.id === 'windSpeed')?.id || baseline.variables[0]?.id || ''
  );
  const [windGrad, setWindGrad] = useState(DIFFERENCE_DIVERGING_ID);
  const [windStats, setWindStats] = useState(false);
  const [windSettings, setWindSettings] = useState(false);

  const windShared: CompareWindSharedControls = {
    aggregation: windAgg,
    setAggregation: setWindAgg,
    colorVar: windVar,
    setColorVar: setWindVar,
    gradientId: windGrad,
    setGradientId: setWindGrad,
    showStats: windStats,
    setShowStats: setWindStats,
    showSettings: windSettings,
    setShowSettings: setWindSettings,
    iem: compareWindIem,
  };

  const [roseVar, setRoseVar] = useState(
    () => baseline.variables.find(v => v.id === 'windSpeed')?.id || baseline.variables[0]?.id || ''
  );
  const [roseGrad, setRoseGrad] = useState(DIFFERENCE_DIVERGING_ID);
  const [roseBins, setRoseBins] = useState(16);
  const [roseSettings, setRoseSettings] = useState(false);

  const windRoseShared: CompareWindRoseSharedControls = {
    colorVar: roseVar,
    setColorVar: setRoseVar,
    gradientId: roseGrad,
    setGradientId: setRoseGrad,
    numBins: roseBins,
    setNumBins: setRoseBins,
    showSettings: roseSettings,
    setShowSettings: setRoseSettings,
    iem: compareWindIem,
  };

  const [sunAgg, setSunAgg] = useState<CompareSunpathSharedControls['aggregation']>('week');
  const [sunColorVar, setSunColorVar] = useState(
    () => baseline.variables[0]?.id || ''
  );
  const [sunRadiusVar, setSunRadiusVar] = useState(
    () =>
      baseline.variables.find(v => v.id === 'globalHorizontalRadiation')?.id ||
      baseline.variables[0]?.id ||
      ''
  );
  const [sunGrad, setSunGrad] = useState(DIFFERENCE_DIVERGING_ID);
  const [sunRadMin, setSunRadMin] = useState<number | string>(1);
  const [sunRadMax, setSunRadMax] = useState<number | string>(5);
  const [sunStats, setSunStats] = useState(false);
  const [sunSettings, setSunSettings] = useState(false);

  const sunpathShared: CompareSunpathSharedControls = {
    aggregation: sunAgg,
    setAggregation: setSunAgg,
    colorVar: sunColorVar,
    setColorVar: setSunColorVar,
    radiusVar: sunRadiusVar,
    setRadiusVar: setSunRadiusVar,
    gradientId: sunGrad,
    setGradientId: setSunGrad,
    radiusMin: sunRadMin,
    setRadiusMin: setSunRadMin,
    radiusMax: sunRadMax,
    setRadiusMax: setSunRadMax,
    showStats: sunStats,
    setShowStats: setSunStats,
    showSettings: sunSettings,
    setShowSettings: setSunSettings,
  };

  const expColorDef = baseline.variables.find(v => v.id === expVar) || baseline.variables[0];
  const sunColorDef = baseline.variables.find(v => v.id === sunColorVar) || baseline.variables[0];
  const sunRadiusDef = baseline.variables.find(v => v.id === sunRadiusVar) || baseline.variables[0];
  const windColorDef = baseline.variables.find(v => v.id === windVar) || baseline.variables[0];
  const roseColorDef = baseline.variables.find(v => v.id === roseVar) || baseline.variables[0];
  const expVarLabel = `${expColorDef.name} (${convertUnitForLegend(expColorDef.unit, unitSystem)})`;
  const sunColorLabel = `${sunColorDef.name} (${convertUnitForLegend(sunColorDef.unit, unitSystem)})`;
  const sunRadiusLabel = `${sunRadiusDef.name} (${convertUnitForLegend(sunRadiusDef.unit, unitSystem)})`;
  const windVarLabel = `${windColorDef.name} (${convertUnitForLegend(windColorDef.unit, unitSystem)})`;
  const roseVarLabel = `${roseColorDef.name} (${convertUnitForLegend(roseColorDef.unit, unitSystem)})`;

  const explorerPairLegend = useMemo(
    () =>
      variableLegendDomain(baseline.variables, expVar, unitSystem, false, baseline.data, undefined),
    [baseline.variables, baseline.data, expVar, unitSystem]
  );
  const windPairLegend = useMemo(
    () =>
      variableLegendDomain(baseline.variables, windVar, unitSystem, false, baseline.data, undefined),
    [baseline.variables, baseline.data, windVar, unitSystem]
  );
  const rosePairLegend = useMemo(
    () =>
      variableLegendDomain(baseline.variables, roseVar, unitSystem, false, baseline.data, undefined),
    [baseline.variables, baseline.data, roseVar, unitSystem]
  );

  const utciExtentC = useMemo(
    () => utciGradientExtentFromRows(baseline.data),
    [baseline.data]
  );
  const utciPairUnit = unitSystem === 'imperial' ? UNIT_F : UNIT_C;
  const utciPairGradMin = convertValue(utciExtentC.minC, UNIT_C, unitSystem);
  const utciPairGradMax = convertValue(utciExtentC.maxC, UNIT_C, unitSystem);

  const noopType = (_t: ChartType) => {};

  const explorerLegendTrack = useLegendTrackWidthFromLeftPane();
  const utciLegendTrack = useLegendTrackWidthFromLeftPane();
  const windLegendTrack = useLegendTrackWidthFromLeftPane();
  const roseLegendTrack = useLegendTrackWidthFromLeftPane();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden lg:overflow-hidden lg:flex-row lg:gap-4">
      <aside className="flex w-full min-w-0 shrink-0 flex-col overflow-hidden lg:w-1/2 lg:min-w-0 lg:flex-none">
        <CompareCardShell theme={theme} exportMode={exportMode} className="min-h-0 flex-1">
          {renderChart(
            { id: 'diff-explorer', type: 'explorer' },
            baseline,
            compare,
            true,
            false,
            { diffFillColumn: true }
          )}
        </CompareCardShell>
      </aside>

      <section className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3 overflow-visible pb-2 pr-0.5 lg:w-1/2 lg:flex-none lg:overflow-y-auto lg:overflow-x-hidden">
        <div
          className={`z-10 -mx-0.5 mb-0.5 grid shrink-0 grid-cols-2 gap-2 px-0.5 pb-1 pt-0.5 sm:gap-3 lg:sticky lg:top-0 ${
            theme === 'dark' ? 'border-b border-gray-800/50 bg-transparent' : 'border-b border-gray-200/60 bg-transparent'
          }`}
        >
          <div className="flex min-w-0 justify-center">
            <PillSelect
              label="Baseline"
              value={baselineIndex}
              onChange={onBaselineIndex}
              options={files}
              tone="baseline"
              theme={theme}
            />
          </div>
          <div className="flex min-w-0 justify-center">
            <PillSelect
              label="Comparison"
              value={compareIndex}
              onChange={onCompareIndex}
              options={files}
              tone="comparison"
              theme={theme}
            />
          </div>
        </div>
        <CompareCardShell theme={theme} exportMode={exportMode} className="min-h-[280px] sm:min-h-[300px]">
          <PairSharedToolbar theme={theme} exportMode={exportMode}>
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <ChartTypeMenu
                value="sunpath"
                label="Sun Path"
                onChange={noopType}
                theme={theme}
                display="icon"
                typeBadge
              />
              <VariableChartSelect
                value={sunColorVar}
                onChange={setSunColorVar}
                selectedLabel={sunColorLabel}
                theme={theme}
                fillRow={false}
              >
                {(Object.entries(baselineGrouped) as [string, EPWVariable[]][]).map(([category, vars]) => (
                  <optgroup key={category} label={category}>
                    {vars.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({convertUnitForLegend(v.unit, unitSystem)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </VariableChartSelect>
              <VariableChartSelect
                value={sunRadiusVar}
                onChange={setSunRadiusVar}
                selectedLabel={sunRadiusLabel}
                theme={theme}
                fillRow={false}
              >
                {(Object.entries(baselineGrouped) as [string, EPWVariable[]][]).map(([category, vars]) => (
                  <optgroup key={category} label={category}>
                    {vars.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({convertUnitForLegend(v.unit, unitSystem)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </VariableChartSelect>
              </div>
              <AggregationToolbar
                value={sunAgg}
                onChange={setSunAgg}
                theme={theme}
                  trailing={
                    <>
                      <button
                        type="button"
                        onClick={() => setSunStats(v => !v)}
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
                          sunStats
                            ? theme === 'dark'
                              ? 'bg-gray-700/90 text-gray-200'
                              : 'bg-gray-100 text-gray-800'
                            : theme === 'dark'
                              ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                              : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        Stats
                      </button>
                      <button
                        type="button"
                        onClick={() => setSunSettings(v => !v)}
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${
                          sunSettings
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
          </PairSharedToolbar>
          {renderChart(
            { id: 'cmp-sun', type: 'sunpath' },
            baseline,
            compare,
            false,
            true,
            {
              pairComparisonHorizontal: true,
              pairSuppressHeader: true,
              pairModalHost: true,
              sunpathShared,
            }
          )}
        </CompareCardShell>

        <CompareCardShell theme={theme} exportMode={exportMode} className="min-h-[300px] sm:min-h-[360px]">
          <PairSharedToolbar theme={theme} exportMode={exportMode}>
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <ChartTypeMenu
                value="explorer"
                label="Data Explorer"
                onChange={noopType}
                theme={theme}
                display="icon"
                typeBadge
              />
              <VariableChartSelect
                value={expVar}
                onChange={setExpVar}
                selectedLabel={expVarLabel}
                theme={theme}
                fillRow={false}
              >
                {(Object.entries(baselineGrouped) as [string, EPWVariable[]][]).map(([category, vars]) => (
                  <optgroup key={category} label={category}>
                    {vars.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({convertUnitForLegend(v.unit, unitSystem)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </VariableChartSelect>
              </div>
              <AggregationToolbar
                value={expAgg}
                onChange={setExpAgg}
                theme={theme}
                trailing={
                  <>
                    <button
                      type="button"
                      onClick={() => setExpStats(v => !v)}
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
                          expStats
                            ? theme === 'dark'
                              ? 'bg-gray-700/90 text-gray-200'
                              : 'bg-gray-100 text-gray-800'
                            : theme === 'dark'
                              ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                              : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        Stats
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpSettings(v => !v)}
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${
                          expSettings
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
          </PairSharedToolbar>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden divide-x divide-gray-200 dark:divide-gray-700">
              <div
                ref={explorerLegendTrack.leftPaneRef}
                className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[280px]"
              >
                {renderChart(
                  { id: 'cmp-explorer-l', type: 'explorer', variable: 'dryBulbTemperature' },
                  baseline,
                  undefined,
                  false,
                  false,
                  {
                    comparePane: 'primary',
                    paneCity: baseline.metadata.city,
                    pairSuppressHeader: true,
                    pairModalHost: true,
                    pairSuppressFooterLegend: true,
                    explorerShared,
                  }
                )}
              </div>
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[280px]">
                {renderChart(
                  { id: 'cmp-explorer-r', type: 'explorer', variable: 'dryBulbTemperature' },
                  compare,
                  undefined,
                  false,
                  false,
                  {
                    comparePane: 'secondary',
                    paneCity: compare.metadata.city,
                    pairSuppressHeader: true,
                    pairModalHost: false,
                    pairSuppressFooterLegend: true,
                    explorerShared,
                  }
                )}
              </div>
            </div>
            <div
              className={`mx-auto w-full max-w-full shrink-0 border-t px-1 pt-1.5 pb-1 ${
                theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
              }`}
              style={
                explorerLegendTrack.legendTrackPx != null
                  ? { width: explorerLegendTrack.legendTrackPx }
                  : undefined
              }
            >
              <InteractiveLegend
                variable={{
                  ...explorerPairLegend.colorVarDef,
                  min: explorerPairLegend.cMin,
                  max: explorerPairLegend.cMax,
                  unit: explorerPairLegend.cUnit,
                }}
                gradientId={expGrad}
                setGradientId={setExpGrad}
                gradients={gradients}
                theme={theme}
              />
            </div>
          </div>
        </CompareCardShell>

        <CompareCardShell theme={theme} exportMode={exportMode} className="min-h-[300px] sm:min-h-[360px]">
          <PairSharedToolbar theme={theme} exportMode={exportMode}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ChartTypeMenu
                value="utci"
                label="Outdoor Comfort"
                onChange={noopType}
                theme={theme}
                disabled
                display="icon"
              />
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
              >
                Outdoor Comfort (UTCI)
              </span>
              <div className="min-w-0 flex-1 basis-full sm:basis-[min(100%,320px)]">
                <AggregationToolbar
                  value={utciAgg}
                  onChange={setUtciAgg}
                  theme={theme}
                  trailing={
                    <>
                      <button
                        type="button"
                        onClick={() => setUtciStats(v => !v)}
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
                          utciStats
                            ? theme === 'dark'
                              ? 'bg-blue-900/40 text-blue-400'
                              : 'bg-blue-50 text-blue-600'
                            : theme === 'dark'
                              ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                              : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        Stats
                      </button>
                      <button
                        type="button"
                        onClick={() => setUtciSettings(v => !v)}
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${
                          utciSettings
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
          </PairSharedToolbar>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden divide-x divide-gray-200 dark:divide-gray-700">
              <div
                ref={utciLegendTrack.leftPaneRef}
                className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[280px]"
              >
                {renderChart({ id: 'cmp-utci-l', type: 'utci' }, baseline, undefined, false, false, {
                  comparePane: 'primary',
                  paneCity: baseline.metadata.city,
                  pairSuppressHeader: true,
                  pairModalHost: true,
                  pairSuppressFooterLegend: true,
                  utciShared,
                })}
              </div>
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[280px]">
                {renderChart({ id: 'cmp-utci-r', type: 'utci' }, compare, undefined, false, false, {
                  comparePane: 'secondary',
                  paneCity: compare.metadata.city,
                  pairSuppressHeader: true,
                  pairModalHost: false,
                  pairSuppressFooterLegend: true,
                  utciShared,
                })}
              </div>
            </div>
            <div
              className={`mx-auto w-full max-w-full shrink-0 border-t px-1 pt-1.5 pb-1 ${
                theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
              }`}
              style={
                utciLegendTrack.legendTrackPx != null ? { width: utciLegendTrack.legendTrackPx } : undefined
              }
            >
              {utciColorMode === 'categories' ? (
                <UtciCategoryLegendStrip theme={theme} />
              ) : utciColorMode === 'gradient' ? (
                <InteractiveLegend
                  variable={{
                    id: 'utci',
                    name: 'UTCI',
                    unit: utciPairUnit,
                    min: utciPairGradMin,
                    max: utciPairGradMax,
                    category: 'Comfort',
                  }}
                  gradientId={utciGrad}
                  setGradientId={setUtciGrad}
                  gradients={gradients}
                  theme={theme}
                  fontScale={UTCI_LEGEND_FONT_SCALE}
                />
              ) : (
                <UtciComfortTimeLegendStrip theme={theme} />
              )}
            </div>
          </div>
        </CompareCardShell>

        <CompareCardShell theme={theme} exportMode={exportMode} className="min-h-[300px] sm:min-h-[360px]">
          <PairSharedToolbar theme={theme} exportMode={exportMode}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ChartTypeMenu
                value="wind"
                label="Wind Explorer"
                onChange={noopType}
                theme={theme}
                disabled
                display="icon"
              />
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
              >
                Wind Explorer
              </span>
              <VariableChartSelect
                value={windVar}
                onChange={setWindVar}
                selectedLabel={windVarLabel}
                theme={theme}
                fillRow={false}
              >
                {(Object.entries(baselineGrouped) as [string, EPWVariable[]][]).map(([category, vars]) => (
                  <optgroup key={category} label={category}>
                    {vars.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({convertUnitForLegend(v.unit, unitSystem)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </VariableChartSelect>
              <div className="min-w-0 flex-1 basis-full sm:basis-[min(100%,280px)]">
                <AggregationToolbar
                  value={windAgg}
                  onChange={setWindAgg}
                  theme={theme}
                  trailing={
                    <>
                      <button
                        type="button"
                        onClick={() => setWindStats(v => !v)}
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
                          windStats
                            ? theme === 'dark'
                              ? 'bg-gray-700/90 text-gray-200'
                              : 'bg-gray-100 text-gray-800'
                            : theme === 'dark'
                              ? 'bg-gray-800 text-gray-400 hover:text-gray-200'
                              : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        Stats
                      </button>
                      <button
                        type="button"
                        onClick={() => setWindSettings(v => !v)}
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${
                          windSettings
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
          </PairSharedToolbar>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden divide-x divide-gray-200 dark:divide-gray-700">
              <div
                ref={windLegendTrack.leftPaneRef}
                className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[280px]"
              >
                {renderChart({ id: 'cmp-wind-l', type: 'wind' }, baseline, undefined, false, false, {
                  comparePane: 'primary',
                  paneCity: baseline.metadata.city,
                  pairSuppressHeader: true,
                  pairModalHost: true,
                  pairSuppressFooterLegend: true,
                  windShared,
                })}
              </div>
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[280px]">
                {renderChart({ id: 'cmp-wind-r', type: 'wind' }, compare, undefined, false, false, {
                  comparePane: 'secondary',
                  paneCity: compare.metadata.city,
                  pairSuppressHeader: true,
                  pairModalHost: false,
                  pairSuppressFooterLegend: true,
                  windShared,
                })}
              </div>
            </div>
            <div
              className={`mx-auto w-full max-w-full shrink-0 border-t px-1 pt-1.5 pb-1 ${
                theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
              }`}
              style={
                windLegendTrack.legendTrackPx != null ? { width: windLegendTrack.legendTrackPx } : undefined
              }
            >
              <InteractiveLegend
                variable={{
                  ...windPairLegend.colorVarDef,
                  min: windPairLegend.cMin,
                  max: windPairLegend.cMax,
                  unit: windPairLegend.cUnit,
                }}
                gradientId={windGrad}
                setGradientId={setWindGrad}
                gradients={gradients}
                theme={theme}
              />
            </div>
          </div>
        </CompareCardShell>

        <CompareCardShell theme={theme} exportMode={exportMode} className="min-h-[300px] sm:min-h-[360px]">
          <PairSharedToolbar theme={theme} exportMode={exportMode}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ChartTypeMenu
                value="windrose"
                label="Wind Rose"
                onChange={noopType}
                theme={theme}
                disabled
                display="icon"
              />
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
              >
                Wind Rose
              </span>
              <VariableChartSelect
                value={roseVar}
                onChange={setRoseVar}
                selectedLabel={roseVarLabel}
                theme={theme}
                fillRow={false}
              >
                {(Object.entries(baselineGrouped) as [string, EPWVariable[]][]).map(([category, vars]) => (
                  <optgroup key={category} label={category}>
                    {vars.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({convertUnitForLegend(v.unit, unitSystem)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </VariableChartSelect>
              <label className={`flex items-center gap-1 text-[10px] font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                <span className="whitespace-nowrap">Bins</span>
                <select
                  value={roseBins}
                  onChange={e => setRoseBins(Number(e.target.value))}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    theme === 'dark'
                      ? 'border-gray-600 bg-gray-700 text-gray-100'
                      : 'border-gray-200 bg-white text-gray-800'
                  }`}
                >
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                  <option value={36}>36</option>
                  <option value={72}>72</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setRoseSettings(v => !v)}
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${
                  roseSettings
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
          </PairSharedToolbar>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden divide-x divide-gray-200 dark:divide-gray-700">
              <div
                ref={roseLegendTrack.leftPaneRef}
                className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[280px]"
              >
                {renderChart({ id: 'cmp-rose-l', type: 'windrose' }, baseline, undefined, false, false, {
                  comparePane: 'primary',
                  paneCity: baseline.metadata.city,
                  pairSuppressHeader: true,
                  pairModalHost: true,
                  pairSuppressFooterLegend: true,
                  windRoseShared,
                })}
              </div>
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[280px]">
                {renderChart({ id: 'cmp-rose-r', type: 'windrose' }, compare, undefined, false, false, {
                  comparePane: 'secondary',
                  paneCity: compare.metadata.city,
                  pairSuppressHeader: true,
                  pairModalHost: false,
                  pairSuppressFooterLegend: true,
                  windRoseShared,
                })}
              </div>
            </div>
            <div
              className={`mx-auto w-full max-w-full shrink-0 border-t px-1 pt-1.5 pb-1 ${
                theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
              }`}
              style={
                roseLegendTrack.legendTrackPx != null ? { width: roseLegendTrack.legendTrackPx } : undefined
              }
            >
              <InteractiveLegend
                variable={{
                  ...rosePairLegend.colorVarDef,
                  min: rosePairLegend.cMin,
                  max: rosePairLegend.cMax,
                  unit: rosePairLegend.cUnit,
                }}
                gradientId={roseGrad}
                setGradientId={setRoseGrad}
                gradients={gradients}
                theme={theme}
              />
            </div>
          </div>
        </CompareCardShell>
      </section>
    </div>
  );
}
