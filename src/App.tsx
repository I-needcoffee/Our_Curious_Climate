/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useMemo, useEffect, useSyncExternalStore, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { ChartTooltipHost } from './components/ChartTooltipHost';
import { MapSelector } from './components/MapSelector';
import { BasemapStyleToggle, readBasemapStyle, writeBasemapStyle, type BasemapStyle } from './components/BasemapLayer';
import { SunPath } from './components/SunPath';
import { DataExplorer } from './components/DataExplorer';
import { WindExplorer } from './components/WindExplorer';
import { WindRose } from './components/WindRose';
import { UtciExplorer } from './components/UtciExplorer';
import { NaturalVentilationExplorer } from './components/NaturalVentilationExplorer';
import { Grid4x2ComfortExportOutline } from './components/Grid4x2ComfortExportOutline';
import { Grid4x2StatsColumn } from './components/QuickStatsSidebar';
import { SiteFooter, type SiteFooterExportCaption } from './components/SiteFooter';
import {
  DEFAULT_GLOBAL_FILTER,
  hasActiveGlobalFilter,
  hourFilterIsPartial,
  monthFilterIsPartial,
  type BarChartFillMode,
  type GlobalFilterState,
  type HeatmapCellStatistic,
} from './lib/globalFilter';
import { formatHourIsolationRange, formatMonthIsolationRange } from './lib/timeIsolationUi';
import { SettingsModal } from './components/SettingsModal';
import { exportDashboardArea, type ExportFormat, type ExportFrameSize } from './lib/exportCapture';
import { ExportModeToolbar } from './components/ExportModeToolbar';
import { SingleModeLayout } from './components/SingleModeLayout';
import { ComparisonModeLayout } from './components/ComparisonModeLayout';
import { TutorialLiveProvider } from './context/TutorialLiveContext';
import { MapPin, ArrowLeft, Plus, Sun, BarChart2, Wind, ThermometerSun, Settings, X, Compass, BarChart3, Radar, Download, FileJson, CloudLightning, Info, MoreHorizontal, RotateCcw, Filter } from 'lucide-react';
import { DiscoverPulseShell } from './components/onboarding/DiscoverPulseShell';
import { dismissOnboarding, ONBOARDING_KEYS } from './lib/onboardingStorage';
import { CARTO_LIGHT_ALL_WATER_HEX, GRADIENTS } from './lib/constants';
import { CHART_TEXT_AUTO } from './lib/chartInk';
import { TUTORIAL_LEGEND_DOM_ID } from './lib/tutorialCopy';
import type { GroundSurface } from './lib/groundComfort';
import { GradientDef } from './components/InteractiveLegend';
import { ParsedEPW } from './lib/epwParser';
import { withDstDisplayRespectingToggle } from './lib/dstDisplay';
import {
  exportFilenameLine,
  weatherFileTypeLine,
  weatherLocationTypeCaption,
  weatherPlaceCaption,
  weatherPlaceLine,
} from './lib/weatherCaption';
import { dryBulbExtentFromFiles } from './lib/dryBulbExtent';
import type { CompareWindIemSharedControls } from './lib/iem/windIemPrefsShared';
import { useWindIemGlobalPrefs } from './lib/iem/globalWindIemPrefsStore';
import { IemWindSetupModal } from './components/IemWindSetupModal';
import { WindStationPickerModal } from './components/WindStationPickerModal';
import type { SiteFooterWindControlsProps } from './components/SiteFooterWindControls';
import { stationKindLabel } from './lib/iem/windStationTypes';

export type { CompareWindIemSharedControls, WindFileSource } from './lib/iem/windIemPrefsShared';

function useMediaMinWidthPx(minWidthPx: number, ssrFallback: boolean) {
  const query = `(min-width: ${minWidthPx}px)`;
  return useSyncExternalStore(
    onStoreChange => {
      if (typeof window === 'undefined') return () => {};
      const mql = window.matchMedia(query);
      const onChange = () => onStoreChange();
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : ssrFallback),
    () => ssrFallback
  );
}

/** Toolbar pictograms for single-mode dashboard layouts (stroke-only, rounded rects). */
function LayoutIconHeroLeft({ className }: { className?: string }) {
  /** Shared vertical band so hero column and 3×2 grid share top/bottom edges. */
  const top = 4;
  const bandH = 20;
  const rowH = 9;
  const rowGap = 2;
  const cellW = 6;
  const colGap = 1;
  const gridLeft = 16;
  return (
    <svg className={className} viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="2" y={top} width="12" height={bandH} rx="2" stroke="currentColor" strokeWidth="1.75" />
      {[0, 1, 2].map(c =>
        [0, 1].map(r => (
          <rect
            key={`${c}-${r}`}
            x={gridLeft + c * (cellW + colGap)}
            y={top + r * (rowH + rowGap)}
            width={cellW}
            height={rowH}
            rx="1"
            stroke="currentColor"
            strokeWidth="1.35"
          />
        ))
      )}
    </svg>
  );
}

function LayoutIconGrid4x2({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {[0, 1, 2, 3].map(c =>
        [0, 1].map(r => (
          <rect
            key={`${c}-${r}`}
            x={2 + c * 9.25}
            y={5 + r * 10.5}
            width="7.5"
            height="8"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.35"
          />
        ))
      )}
    </svg>
  );
}

function LayoutIconFocusDeep({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="2" y="4" width="17" height="20" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="21" y="4" width="17" height="20" rx="2" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

/** Guided single-card layout: large tile with companion text column. */
function LayoutIconTutorial({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="2" y="5" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M22 8h14M22 12h14M22 16h10" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M22 20h12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

export type ChartType = 'sunpath' | 'explorer' | 'wind' | 'windrose' | 'utci' | 'naturalVentilation' | 'empty';
export type LayoutMode = 'hero-left' | 'grid-4x2' | 'focus-deep' | 'tutorial' | 'stacked';

function LayoutIconStacked({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* Two clean vertically stacked full-width cards for scrolling view. */}
      <rect x="7" y="3" width="26" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
      <rect x="7" y="15.5" width="26" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

/**
 * Layout switcher order. The first two are the primary pair shown as always-visible segments
 * (Grid is the default overview, Details is the natural next step); the rest live behind a "…"
 * toggle so the common path stays one click.
 */
const LAYOUT_PICKER: readonly {
  mode: LayoutMode;
  ariaLabel: string;
  title: string;
  Icon: typeof LayoutIconHeroLeft;
  primary: boolean;
}[] = [
  {
    mode: 'grid-4x2',
    ariaLabel: 'Grid layout',
    title: 'Grid',
    Icon: LayoutIconGrid4x2,
    primary: true,
  },
  {
    mode: 'tutorial',
    ariaLabel: 'Details layout',
    title: 'Details',
    Icon: LayoutIconTutorial,
    primary: true,
  },
  {
    mode: 'hero-left',
    ariaLabel: 'Focus Grid layout',
    title: 'Focus Grid',
    Icon: LayoutIconHeroLeft,
    primary: false,
  },
  {
    mode: 'focus-deep',
    ariaLabel: 'Side-by-Side layout',
    title: 'Side-by-Side',
    Icon: LayoutIconFocusDeep,
    primary: false,
  },
  {
    mode: 'stacked',
    ariaLabel: 'Stacked layout',
    title: 'Stacked',
    Icon: LayoutIconStacked,
    primary: false,
  },
];

export interface ChartConfig {
  id: string;
  type: ChartType;
  /** When `type` is `explorer`, default EPW column id (e.g. `directNormalRadiation`). */
  variable?: string;
}

/** Default slot line-up per dashboard layout; ids are layout-prefixed so React charts do not reuse state across layouts. */
function defaultSlotsForLayout(mode: LayoutMode): ChartConfig[] {
  const ex = (suffix: string, variable?: string): ChartConfig =>
    variable
      ? { id: `ex-${mode}-${suffix}`, type: 'explorer', variable }
      : { id: `ex-${mode}-${suffix}`, type: 'explorer' };

  switch (mode) {
    case 'tutorial':
      return [{ id: `sp-${mode}-0`, type: 'sunpath' }];
    case 'stacked':
      return [
        { id: `sp-${mode}-0`, type: 'sunpath' },
        ex('db', 'dryBulbTemperature'),
        { id: `ut-${mode}-0`, type: 'utci' },
        { id: `wr-${mode}-0`, type: 'windrose' },
        { id: `wd-${mode}-0`, type: 'wind' },
        { id: `empty-${mode}-0`, type: 'empty' },
      ];
    case 'focus-deep':
      return [
        { id: `sp-${mode}-0`, type: 'sunpath' },
        { id: `ex-${mode}-dn`, type: 'explorer', variable: 'directNormalRadiation' },
      ];
    case 'grid-4x2':
      /** Row-major: col1 sun+rose, col2 temp+wind, col3 DNR+sky cover, col4 RH+UTCI */
      return [
        { id: `sp-${mode}-0`, type: 'sunpath' },
        ex('db', 'dryBulbTemperature'),
        ex('dn', 'directNormalRadiation'),
        ex('rh', 'relativeHumidity'),
        { id: `wr-${mode}-0`, type: 'windrose' },
        { id: `wd-${mode}-0`, type: 'wind' },
        ex('cloud', 'totalSkyCover'),
        { id: `ut-${mode}-0`, type: 'utci' },
      ];
    case 'hero-left':
      return [
        { id: `sp-${mode}-0`, type: 'sunpath' },
        ex('a'),
        { id: `ut-${mode}-0`, type: 'utci' },
        { id: `wd-${mode}-0`, type: 'wind' },
        ex('b', 'directNormalRadiation'),
        ex('c', 'relativeHumidity'),
        { id: `wr-${mode}-0`, type: 'windrose' },
      ];
  }
}

function initialSlotsByLayout(): Record<LayoutMode, ChartConfig[]> {
  return {
    'hero-left': defaultSlotsForLayout('hero-left'),
    'grid-4x2': defaultSlotsForLayout('grid-4x2'),
    'focus-deep': defaultSlotsForLayout('focus-deep'),
    tutorial: defaultSlotsForLayout('tutorial'),
    stacked: defaultSlotsForLayout('stacked'),
  };
}

export type CompareAggregation = 'hour' | 'day' | 'week' | 'month';

/** Shared explorer controls lifted to compare layout (one header, two panes). */
export interface CompareExplorerSharedControls {
  aggregation: CompareAggregation;
  setAggregation: (v: CompareAggregation) => void;
  colorVar: string;
  setColorVar: (id: string) => void;
  gradientId: string;
  setGradientId: (id: string) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  /** Merged Y domain for the top bar / range so left and right panes share the same axis (compare pair). */
  barYDomain: { min: number; max: number } | null;
  onBarYExtent: (e: { min: number; max: number; pane: 'primary' | 'secondary' } | 'clear') => void;
}

export interface CompareUtciSharedControls {
  aggregation: CompareAggregation;
  setAggregation: (v: CompareAggregation) => void;
  includeSun: boolean;
  setIncludeSun: (v: boolean) => void;
  includeWind: boolean;
  setIncludeWind: (v: boolean) => void;
  optimizeMode: boolean;
  setOptimizeMode: (v: boolean) => void;
  /** When Optimize is on: comfort %/UTCI fills vs exposure-condition map. */
  optimizeView: 'comfort' | 'exposure';
  setOptimizeView: (v: 'comfort' | 'exposure') => void;
  colorMode: 'categories' | 'comfortTime' | 'gradient';
  setColorMode: (v: 'categories' | 'comfortTime' | 'gradient') => void;
  gradientId: string;
  setGradientId: (id: string) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  radiantMode: 'station' | 'reflectance';
  setRadiantMode: (v: 'station' | 'reflectance') => void;
  /** Separate energy-balance estimate. Used only in reflectance mode. */
  surfaceHeat: boolean;
  setSurfaceHeat: (v: boolean) => void;
  /** Active ground for reflectance mode. Station mode ignores reflectance. */
  ground: GroundSurface | null;
  setGround: (v: GroundSurface | null) => void;
}

export interface CompareWindSharedControls {
  aggregation: CompareAggregation;
  setAggregation: (v: CompareAggregation) => void;
  colorVar: string;
  setColorVar: (id: string) => void;
  gradientId: string;
  setGradientId: (id: string) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  /** Compare layout: shared IEM ASOS wind source + reference year for both panes. */
  iem?: CompareWindIemSharedControls;
}

export interface CompareWindRoseSharedControls {
  colorVar: string;
  setColorVar: (id: string) => void;
  gradientId: string;
  setGradientId: (id: string) => void;
  numBins: number;
  setNumBins: (n: number) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  /** Same prefs object instance as Wind Explorer (`CompareWindSharedControls.iem`). */
  iem?: CompareWindIemSharedControls;
}

/** Shared sun path controls for compare layout (single card, dual charts). */
export interface CompareSunpathSharedControls {
  aggregation: CompareAggregation;
  setAggregation: (v: CompareAggregation) => void;
  colorVar: string;
  setColorVar: (id: string) => void;
  radiusVar: string;
  setRadiusVar: (id: string) => void;
  gradientId: string;
  setGradientId: (id: string) => void;
  radiusMin: number | string;
  setRadiusMin: (v: number | string) => void;
  radiusMax: number | string;
  setRadiusMax: (v: number | string) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
}

/** Options when rendering charts inside the compare dashboard pair layout. */
export interface CompareChartOpts {
  /** Primary cell shows full chrome; secondary shows a compact orange location bar. */
  comparePane?: 'primary' | 'secondary';
  paneCity?: string;
  /** Sun path: place baseline / comparison charts side by side. */
  pairComparisonHorizontal?: boolean;
  /** Single shared toolbar for a pair row; panes omit their own header. */
  pairSuppressHeader?: boolean;
  /** When headers suppressed, only the host pane mounts stats/settings modals. */
  pairModalHost?: boolean;
  explorerShared?: CompareExplorerSharedControls;
  utciShared?: CompareUtciSharedControls;
  windShared?: CompareWindSharedControls;
  windRoseShared?: CompareWindRoseSharedControls;
  sunpathShared?: CompareSunpathSharedControls;
  /** Difference card: tighter padding / fill column */
  diffFillColumn?: boolean;
  /** Compare pair row: omit per-pane footer legend (parent renders one shared strip). */
  pairSuppressFooterLegend?: boolean;
}

export type UnitSystem = 'metric' | 'imperial';

export default function App() {
  const [selectedFiles, setSelectedFiles] = useState<ParsedEPW[]>([]);
  const [isSelectingFile, setIsSelectingFile] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'comparison'>('single');
  const [showDiffTable, setShowDiffTable] = useState(true);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [showDifference, setShowDifference] = useState(false);
  const [differenceBaselineIndex, setDifferenceBaselineIndex] = useState(0);
  const [differenceCompareIndex, setDifferenceCompareIndex] = useState(1);
  
  const [customGradients, setCustomGradients] = useState<GradientDef[]>([]);
  const [showGradientModal, setShowGradientModal] = useState(false);
  const [newGradientName, setNewGradientName] = useState('');
  const [newGradientColors, setNewGradientColors] = useState<string[]>(['#ff0000', '#0000ff']);
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>(() => {
    try {
      const saved = window.localStorage.getItem('climatecanvas.unitSystem');
      return saved === 'imperial' ? 'imperial' : 'metric';
    } catch {
      return 'metric';
    }
  });
  const setUnitSystem = useCallback((next: UnitSystem) => {
    try {
      window.localStorage.setItem('climatecanvas.unitSystem', next);
    } catch {
      // ignore storage errors
    }
    startTransition(() => {
      setUnitSystemState(next);
    });
  }, []);
  const [dstDisplayEnabled, setDstDisplayEnabled] = useState(false);
  const [mapLibraryMode, setMapLibraryMode] = useState<'historical' | 'future'>('historical');
  const [mapBasemapStyle, setMapBasemapStyle] = useState<BasemapStyle>(readBasemapStyle);

  /** When the EPW header says the site observes DST, default the display toggle on for this file set. */
  useEffect(() => {
    if (selectedFiles.length === 0) {
      setDstDisplayEnabled(false);
      return;
    }
    setDstDisplayEnabled(selectedFiles.some(f => f.metadata.daylightSavings === 'yes'));
  }, [selectedFiles]);
  const [heatmapTextColor, setHeatmapTextColor] = useState<string>(CHART_TEXT_AUTO);
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    try {
      const saved = window.localStorage.getItem('climatecanvas.theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const setTheme = useCallback((next: 'light' | 'dark') => {
    try {
      window.localStorage.setItem('climatecanvas.theme', next);
    } catch {
      // ignore storage errors
    }
    setThemeState(next);
  }, []);

  const windIemGlobal = useWindIemGlobalPrefs();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  }, [theme]);

  const [globalFilter, setGlobalFilter] = useState<GlobalFilterState>(() => ({
    ...DEFAULT_GLOBAL_FILTER,
  }));

  /** Heatmaps: statistic taken within each aggregation cell (“Ave” = mean). Shared app-wide via footer toggle. */
  const [heatmapCellStatistic, setHeatmapCellStatistic] = useState<HeatmapCellStatistic>('mean');
  /** Explorer bar charts: solid footer statistic color vs legend-aligned gradient (Settings). */
  const [barChartFillMode, setBarChartFillMode] = useState<BarChartFillMode>('solid');

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [exportMode, setExportModeState] = useState(false);
  const [exportFrame, setExportFrame] = useState<ExportFrameSize>('viewport');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [exportBusy, setExportBusy] = useState(false);
  const exportModeRef = useRef(exportMode);
  const setExportMode = (val: boolean) => {
    setExportModeState(val);
    exportModeRef.current = val;
  };

  const allGradients = useMemo(() => [...GRADIENTS, ...customGradients], [customGradients]);

  const displayFiles = useMemo(
    () => selectedFiles.map(f => withDstDisplayRespectingToggle(f, dstDisplayEnabled)),
    [selectedFiles, dstDisplayEnabled]
  );

  const dryBulbExtent = useMemo(() => dryBulbExtentFromFiles(selectedFiles), [selectedFiles]);

  useEffect(() => {
    const minC = dryBulbExtent.minC;
    const maxC = dryBulbExtent.maxC;
    setGlobalFilter(prev => {
      const nextLo = Math.min(maxC, Math.max(minC, prev.temperatureLoC));
      const nextHi = Math.min(maxC, Math.max(minC, prev.temperatureHiC));
      // If clamping to a newly loaded file collapses a `between` range to a single point,
      // turn off temperature isolation rather than filtering out almost the entire file.
      const collapsed = prev.temperatureMode === 'between' && nextLo >= nextHi;
      const nextMode = collapsed ? 'off' : prev.temperatureMode;
      const finalLo = collapsed ? minC : nextLo;
      const finalHi = collapsed ? maxC : nextHi;
      if (
        prev.temperatureMode === nextMode &&
        prev.temperatureLoC === finalLo &&
        prev.temperatureHiC === finalHi
      ) {
        return prev;
      }
      return {
        ...prev,
        temperatureMode: nextMode,
        temperatureLoC: finalLo,
        temperatureHiC: finalHi,
      };
    });
  }, [dryBulbExtent.minC, dryBulbExtent.maxC]);

  /** Files represented in the current dashboard export (active file in single mode; baseline + compare in comparison). */
  const exportCaptionFiles = useMemo(() => {
    if (!selectedFiles.length) return [];
    if (viewMode === 'comparison' && selectedFiles.length >= 2) {
      if (differenceBaselineIndex === differenceCompareIndex) {
        const f = selectedFiles[differenceBaselineIndex];
        return f ? [f] : [];
      }
      const a = selectedFiles[differenceBaselineIndex];
      const b = selectedFiles[differenceCompareIndex];
      const out: ParsedEPW[] = [];
      if (a) out.push(a);
      if (b) out.push(b);
      return out;
    }
    const active = selectedFiles[activeFileIndex];
    return active ? [active] : [];
  }, [selectedFiles, viewMode, differenceBaselineIndex, differenceCompareIndex, activeFileIndex]);

  /** Export-only: place + filename lines shown in the footer strip (not duplicate header). */
  const exportFooterCaptions = useMemo((): SiteFooterExportCaption[] | undefined => {
    if (!exportMode || exportCaptionFiles.length === 0) return undefined;
    return exportCaptionFiles.map(f => ({
      place: weatherPlaceCaption(f),
      filename: exportFilenameLine(f),
    }));
  }, [exportMode, exportCaptionFiles]);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid-4x2');
  const smUp = useMediaMinWidthPx(640, true);
  const activeLayoutPicker = useMemo(() => {
    if (viewMode !== 'single') return LAYOUT_PICKER;
    return smUp ? LAYOUT_PICKER : LAYOUT_PICKER.filter(o => o.mode === 'tutorial' || o.mode === 'stacked');
  }, [smUp, viewMode]);

  useEffect(() => {
    if (viewMode !== 'single') return;
    if (smUp) return;
    setLayoutMode(prev => (prev === 'tutorial' || prev === 'stacked' ? prev : 'tutorial'));
  }, [smUp, viewMode]);

  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  /**
   * Always-visible segments: Grid + Details (or the two phone layouts). If the user is on a
   * layout from the "…" set, that one also appears as a third selected chip so they can see
   * where they are without opening the menu.
   */
  const layoutSegments = useMemo(() => {
    if (!smUp) return activeLayoutPicker;
    const primary = activeLayoutPicker.filter(o => o.primary);
    const activeMore = activeLayoutPicker.find(o => !o.primary && o.mode === layoutMode);
    return activeMore ? [...primary, activeMore] : primary;
  }, [smUp, activeLayoutPicker, layoutMode]);
  const moreLayouts = useMemo(
    () => (smUp ? activeLayoutPicker.filter(o => !o.primary) : []),
    [smUp, activeLayoutPicker]
  );
  const layoutHasMore = moreLayouts.length > 0;
  /** Positioning root for export outline around bottom-right chart + comfort stats. */
  const grid4x2ExportWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLayoutPickerOpen(false);
  }, [smUp, layoutMode]);

  useEffect(() => {
    if (!layoutPickerOpen) return;
    /**
     * Close on outside *click* only (not touchstart). A document touchstart would run before the
     * child button's onClick, could collapse the panel and steal the tap; max-w-0 + overflow
     * can also make targets miss hit-testing. Bubble-phase click: layout buttons fire first.
     */
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (t.closest('#tutorial-nav-layouts')) return;
      setLayoutPickerOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [smUp, layoutPickerOpen]);

  const [slotsByLayout, setSlotsByLayout] = useState<Record<LayoutMode, ChartConfig[]>>(initialSlotsByLayout);
  const slots = slotsByLayout[layoutMode];

  /** Wind source controls in the footer when a wind or wind-rose card is in the current layout. */
  const dashboardHasWindCharts = useMemo(() => {
    if (viewMode === 'comparison' && selectedFiles.length >= 2) return true;
    return slots.some(s => s.type === 'wind' || s.type === 'windrose');
  }, [viewMode, slots, selectedFiles.length]);

  const windPickerMetadata = useMemo(() => {
    if (!selectedFiles.length) return undefined;
    if (viewMode === 'comparison' && selectedFiles.length >= 2) {
      return selectedFiles[differenceBaselineIndex]?.metadata;
    }
    return selectedFiles[activeFileIndex]?.metadata;
  }, [selectedFiles, viewMode, differenceBaselineIndex, activeFileIndex]);

  const windPickerSourceFilename = useMemo(() => {
    if (!selectedFiles.length) return undefined;
    if (viewMode === 'comparison' && selectedFiles.length >= 2) {
      return selectedFiles[differenceBaselineIndex]?.sourceFilename;
    }
    return selectedFiles[activeFileIndex]?.sourceFilename;
  }, [selectedFiles, viewMode, differenceBaselineIndex, activeFileIndex]);

  const windFooter = useMemo((): SiteFooterWindControlsProps | null => {
    if (!dashboardHasWindCharts) return null;
    const st = windIemGlobal.iemStation;
    const stationLabel = st
      ? `${stationKindLabel(st.kind)} ${st.stationId}`
      : null;
    return {
      visible: true,
      source: windIemGlobal.source,
      yearStart: windIemGlobal.iemYearStart,
      yearEnd: windIemGlobal.iemYearEnd,
      stationLabel,
      onSelectTmy: () => windIemGlobal.setSource('epw'),
      onSelectStation: () => {
        if (windIemGlobal.source === 'epw') {
          windIemGlobal.setSource('iem');
          windIemGlobal.openWindStationPicker(true);
        } else {
          windIemGlobal.openWindStationPicker(false);
        }
      },
      onConfigureYears: () => windIemGlobal.openIemSetupModal(false),
      onChangeStation: () => windIemGlobal.openWindStationPicker(false),
    };
  }, [
    dashboardHasWindCharts,
    windIemGlobal.source,
    windIemGlobal.iemYearStart,
    windIemGlobal.iemYearEnd,
    windIemGlobal.iemStation,
    windIemGlobal.setSource,
    windIemGlobal.openIemSetupModal,
    windIemGlobal.openWindStationPicker,
  ]);

  const iemAttributionInExport = windIemGlobal.source === 'iem' && dashboardHasWindCharts;

  /** Low/Ave/High applies to 12×24 explorer-style heatmaps only; comparison mode always includes those cards. */
  const dashboardHasHeatmap1224 = useMemo(() => {
    if (viewMode === 'comparison') return true;
    return slots.some(
      s => s.type === 'explorer' || s.type === 'wind' || s.type === 'utci' || s.type === 'naturalVentilation'
    );
  }, [viewMode, slots]);

  useEffect(() => {
    if (layoutMode !== 'stacked') return;
    setSlotsByLayout(prev => {
      const cur = [...(prev.stacked ?? [])];
      if (cur.length < 2) return prev;
      if (cur[1]?.type !== 'explorer') return prev;
      if (cur[1]?.variable !== 'dryBulbTemperature') return prev;
      if (cur[2]?.type === 'utci') return prev;

      const next = [...cur];
      next.splice(2, 0, { id: `ut-stacked-${Date.now()}`, type: 'utci' });
      return { ...prev, stacked: next };
    });
  }, [layoutMode]);

  const handleChangeType = useCallback(
    (id: string, newType: ChartType) => {
      setSlotsByLayout(prev => ({
        ...prev,
        [layoutMode]: (prev[layoutMode] ?? []).map(s => (s.id === id ? { ...s, type: newType } : s)),
      }));
    },
    [layoutMode]
  );

  const handleRemoveChart = useCallback(
    (id: string) => {
      setSlotsByLayout(prev => {
        const cur = [...(prev[layoutMode] ?? [])];
        const i = cur.findIndex(s => s.id === id);
        if (i === -1) return prev;
        const next = [...cur];
        next[i] = { id: `empty-${Date.now()}`, type: 'empty' };
        return { ...prev, [layoutMode]: next };
      });
    },
    [layoutMode]
  );

  const swapSlotsByIndex = useCallback(
    (a: number, b: number) => {
      if (a === b) return;
      const max = Math.max(a, b);
      const min = Math.min(a, b);
      if (min < 0) return;
      setSlotsByLayout(prev => {
        const cur = [...(prev[layoutMode] ?? [])];
        const next = [...cur];
        while (next.length <= max) next.push({ id: `slot-${Date.now()}-${next.length}`, type: 'empty' });
        const tmp = next[a];
        next[a] = next[b]!;
        next[b] = tmp!;
        return { ...prev, [layoutMode]: next };
      });
    },
    [layoutMode]
  );

  const handleAddGradient = () => {
    if (newGradientName && newGradientColors.length >= 2) {
      setCustomGradients(prev => [...prev, {
        id: `custom-${Date.now()}`,
        name: newGradientName,
        colors: newGradientColors
      }]);
      setShowGradientModal(false);
      setNewGradientName('');
      setNewGradientColors(['#ff0000', '#0000ff']);
    }
  };

  const handleSelectEPW = (data: ParsedEPW, compareData?: ParsedEPW) => {
    if (selectedFiles.length === 0 || isSelectingFile) {
      const newFiles = [data];
      if (compareData) newFiles.push(compareData);
      
      if (isSelectingFile) {
        const updatedFiles = [...selectedFiles, ...newFiles];
        setSelectedFiles(updatedFiles);
        setIsSelectingFile(false);
        if (updatedFiles.length > 1) {
          setDifferenceCompareIndex(updatedFiles.length - 1);
          setViewMode('comparison');
          setShowDifference(true);
          setShowDiffTable(true);
        }
      } else {
        setSelectedFiles(newFiles);
        setActiveFileIndex(0);
        setDifferenceBaselineIndex(0);
        setDifferenceCompareIndex(newFiles.length > 1 ? 1 : 0);
        windIemGlobal.setIemStation(null);
        if (newFiles.length === 1) {
          /** First file opens on the Grid overview (phones only have Details/Stacked). */
          setViewMode('single');
          setShowDifference(false);
          setLayoutMode(smUp ? 'grid-4x2' : 'tutorial');
        } else if (newFiles.length > 1) {
          setViewMode('comparison');
          setShowDifference(true);
          setShowDiffTable(true);
        }
      }
    }
  };

  const handleExport = async () => {
    const element = document.getElementById('dashboard-area');
    if (!element || exportBusy) return;
    const activeForName =
      viewMode === 'comparison'
        ? selectedFiles[differenceBaselineIndex] ?? selectedFiles[0]
        : selectedFiles[activeFileIndex] ?? selectedFiles[0];
    const filenameBase = activeForName?.metadata.city || 'export';
    setExportBusy(true);
    try {
      await exportDashboardArea({ element, frame: exportFrame, format: exportFormat, filenameBase });
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExportBusy(false);
    }
  };

  const renderChartForFile = (
    chart: ChartConfig,
    fileData: ParsedEPW,
    compareFileData?: ParsedEPW,
    isDiffMode: boolean = false,
    isStacked: boolean = false,
    compareOpts?: CompareChartOpts,
    tutorialLegendDomId?: string,
    tutorialChromeAnchors?: boolean
  ) => {
    const isDiffExplorer = chart.id === 'diff-explorer';
    const onRemoveHandler =
      isDiffExplorer || chart.id.startsWith('cmp-')
        ? undefined
        : () => handleRemoveChart(chart.id);
    const onChangeTypeHandler = chart.id.startsWith('cmp-') ? undefined : (t: ChartType) => handleChangeType(chart.id, t);
    const comparePane = compareOpts?.comparePane;
    const paneCity = compareOpts?.paneCity;
    const pairComparisonHorizontal = compareOpts?.pairComparisonHorizontal;
    const pairSuppressHeader = compareOpts?.pairSuppressHeader;
    const pairModalHost = compareOpts?.pairModalHost;
    const explorerShared = compareOpts?.explorerShared;
    const utciShared = compareOpts?.utciShared;
    const windShared = compareOpts?.windShared;
    const windRoseShared = compareOpts?.windRoseShared;
    const sunpathShared = compareOpts?.sunpathShared;
    const diffFillColumn = compareOpts?.diffFillColumn;
    const pairSuppressFooterLegend = compareOpts?.pairSuppressFooterLegend;

    switch (chart.type) {
      case 'sunpath':
        return (
          <SunPath
            metadata={fileData.metadata}
            compareMetadata={compareFileData?.metadata}
            data={fileData.data}
            compareData={compareFileData?.data}
            showDifference={isDiffMode}
            stackedComparison={isStacked}
            pairComparisonHorizontal={pairComparisonHorizontal}
            variables={fileData.variables}
            onRemove={onRemoveHandler}
            onChangeType={onChangeTypeHandler}
            gradients={allGradients}
            filter={globalFilter}
            unitSystem={unitSystem}
            heatmapTextColor={heatmapTextColor}
            theme={theme}
            setShowGradientModal={setShowGradientModal}
            exportMode={exportMode}
            pairSuppressHeader={pairSuppressHeader}
            pairModalHost={pairModalHost}
            sunpathShared={sunpathShared}
            tutorialLegendDomId={tutorialLegendDomId}
            tutorialChromeAnchors={tutorialChromeAnchors}
          />
        );
      case 'explorer':
        return (
          <DataExplorer
            metadata={fileData.metadata}
            data={fileData.data}
            compareData={compareFileData?.data}
            showDifference={isDiffMode}
            stackedComparison={isStacked}
            variables={fileData.variables}
            defaultVariableId={chart.variable}
            comparePane={comparePane}
            paneCity={paneCity}
            onRemove={onRemoveHandler}
            onChangeType={onChangeTypeHandler}
            gradients={allGradients}
            filter={globalFilter}
            heatmapCellStatistic={heatmapCellStatistic}
            barChartFillMode={barChartFillMode}
            unitSystem={unitSystem}
            heatmapTextColor={heatmapTextColor}
            theme={theme}
            setShowGradientModal={setShowGradientModal}
            exportMode={exportMode}
            pairSuppressHeader={pairSuppressHeader}
            pairModalHost={pairModalHost}
            explorerShared={explorerShared}
            diffFillColumn={diffFillColumn}
            tutorialLegendDomId={tutorialLegendDomId}
            tutorialChromeAnchors={tutorialChromeAnchors}
            pairSuppressFooterLegend={pairSuppressFooterLegend}
          />
        );
      case 'wind':
        return (
          <WindExplorer
            metadata={fileData.metadata}
            compareMetadata={compareFileData?.metadata}
            data={fileData.data}
            compareData={compareFileData?.data}
            showDifference={isDiffMode}
            stackedComparison={isStacked}
            variables={fileData.variables}
            comparePane={comparePane}
            paneCity={paneCity}
            onRemove={onRemoveHandler}
            onChangeType={onChangeTypeHandler}
            gradients={allGradients}
            filter={globalFilter}
            heatmapCellStatistic={heatmapCellStatistic}
            barChartFillMode={barChartFillMode}
            unitSystem={unitSystem}
            heatmapTextColor={heatmapTextColor}
            theme={theme}
            setShowGradientModal={setShowGradientModal}
            exportMode={exportMode}
            pairSuppressHeader={pairSuppressHeader}
            pairModalHost={pairModalHost}
            windShared={windShared}
            tutorialLegendDomId={tutorialLegendDomId}
            tutorialChromeAnchors={tutorialChromeAnchors}
            pairSuppressFooterLegend={pairSuppressFooterLegend}
          />
        );
      case 'windrose':
        return (
          <WindRose
            metadata={fileData.metadata}
            compareMetadata={compareFileData?.metadata}
            data={fileData.data}
            compareData={compareFileData?.data}
            showDifference={isDiffMode}
            stackedComparison={isStacked}
            variables={fileData.variables}
            comparePane={comparePane}
            paneCity={paneCity}
            onRemove={onRemoveHandler}
            onChangeType={onChangeTypeHandler}
            gradients={allGradients}
            filter={globalFilter}
            unitSystem={unitSystem}
            heatmapTextColor={heatmapTextColor}
            theme={theme}
            setShowGradientModal={setShowGradientModal}
            exportMode={exportMode}
            pairSuppressHeader={pairSuppressHeader}
            pairModalHost={pairModalHost}
            windRoseShared={windRoseShared}
            tutorialLegendDomId={tutorialLegendDomId}
            tutorialChromeAnchors={tutorialChromeAnchors}
            pairSuppressFooterLegend={pairSuppressFooterLegend}
          />
        );
      case 'utci':
        return (
          <UtciExplorer
            data={fileData.data}
            compareData={compareFileData?.data}
            showDifference={isDiffMode}
            stackedComparison={isStacked}
            comparePane={comparePane}
            paneCity={paneCity}
            onRemove={onRemoveHandler}
            onChangeType={onChangeTypeHandler}
            gradients={allGradients}
            filter={globalFilter}
            heatmapCellStatistic={heatmapCellStatistic}
            barChartFillMode={barChartFillMode}
            unitSystem={unitSystem}
            heatmapTextColor={heatmapTextColor}
            theme={theme}
            setShowGradientModal={setShowGradientModal}
            exportMode={exportMode}
            pairSuppressHeader={pairSuppressHeader}
            pairModalHost={pairModalHost}
            utciShared={utciShared}
            tutorialLegendDomId={tutorialLegendDomId}
            tutorialChromeAnchors={tutorialChromeAnchors}
            pairSuppressFooterLegend={pairSuppressFooterLegend}
            siteLatitude={fileData.metadata.lat}
            metadata={fileData.metadata}
            compareMetadata={compareFileData?.metadata}
          />
        );
      case 'naturalVentilation':
        return (
          <NaturalVentilationExplorer
            data={fileData.data}
            onRemove={onRemoveHandler}
            onChangeType={onChangeTypeHandler}
            filter={globalFilter}
            heatmapCellStatistic={heatmapCellStatistic}
            barChartFillMode={barChartFillMode}
            unitSystem={unitSystem}
            heatmapTextColor={heatmapTextColor}
            theme={theme}
            exportMode={exportMode}
            tutorialChromeAnchors={tutorialChromeAnchors}
          />
        );
      case 'empty':
        return null;
      default:
        return null;
    }
  };

  if (selectedFiles.length === 0 || isSelectingFile) {
    const mapDark = theme === 'dark';
    return (
      <div
        className="relative flex h-dvh w-full flex-col overflow-hidden font-sans"
        style={{ backgroundColor: mapDark ? '#121211' : '#ffffff' }}
      >
        {selectedFiles.length > 0 && (
          <div
            className={`relative z-[2000] flex w-full shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2 shadow-sm ${
              mapDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
            }`}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  mapDark ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
                {selectedFiles.length > 1 ? 'Add comparison site:' : 'Adding to:'}
              </span>
              {selectedFiles.map((file, index) => (
                <span
                  key={`${file.metadata.city}-${index}`}
                  className={`inline-flex max-w-[240px] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    mapDark ? 'bg-gray-800 text-gray-100' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">{weatherPlaceLine(file) || file.metadata.city}</span>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsSelectingFile(false)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold glow-sm transition-colors ${
                mapDark
                  ? 'bg-gray-100 text-gray-900 hover:bg-white'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              Back to dashboard
            </button>
          </div>
        )}
        <div className="relative z-0 min-h-0 flex-1">
          <MapSelector 
            onSelect={handleSelectEPW} 
            isSelectingCompare={isSelectingFile && selectedFiles.length > 0} 
            initialCenter={selectedFiles.length > 0 ? [selectedFiles[0].metadata.lat, selectedFiles[0].metadata.lng] : undefined}
            initialZoom={selectedFiles.length > 0 ? 10 : undefined}
            mapLibraryMode={mapLibraryMode}
            onMapLibraryModeChange={setMapLibraryMode}
            basemapStyle={mapBasemapStyle}
          />
        </div>
        <div
          className={`relative z-[5000] flex w-full shrink-0 items-center gap-2 px-2 py-1.5 shadow-[0_-6px_20px_rgba(15,23,42,0.06)] sm:px-3 ${
            mapDark ? 'bg-[#121211]' : 'bg-white'
          }`}
        >
          <BasemapStyleToggle
            value={mapBasemapStyle}
            onChange={style => {
              setMapBasemapStyle(style);
              writeBasemapStyle(style);
            }}
          />
          <div className="min-w-0 flex-1">
            <SiteFooter
              theme={theme}
              exportMode={false}
              windFooter={null}
              iemWindDatasetActive={false}
            />
          </div>
        </div>
      </div>
    );
  }

  const singleModeLayoutEl = (
    <SingleModeLayout
      slots={slots}
      layoutMode={layoutMode}
      exportMode={exportMode}
      theme={theme}
      tutorialEpwRows={displayFiles[activeFileIndex]?.data}
      tutorialFilter={globalFilter}
      tutorialUnitSystem={unitSystem}
      tutorialSiteLatitude={displayFiles[activeFileIndex]?.metadata.lat}
      tutorialSiteLng={displayFiles[activeFileIndex]?.metadata.lng}
      tutorialSiteTimeZone={displayFiles[activeFileIndex]?.metadata.timeZone}
      renderChart={config => {
        const tutSlot =
          viewMode === 'single' &&
          layoutMode === 'tutorial' &&
          config.id === slots[0]?.id &&
          config.type !== 'empty';
        return renderChartForFile(
          config,
          displayFiles[activeFileIndex],
          undefined,
          false,
          false,
          undefined,
          tutSlot ? TUTORIAL_LEGEND_DOM_ID : undefined,
          tutSlot && !exportMode
        );
      }}
      onSelectSlotType={(idx, type) => {
        setSlotsByLayout(prev => {
          const cur = [...(prev[layoutMode] ?? [])];
          while (cur.length <= idx) cur.push({ id: `slot-${Date.now()}-${cur.length}`, type: 'empty' });
          cur[idx] = { ...cur[idx]!, type };
          if (layoutMode === 'stacked') {
            const last = cur[cur.length - 1];
            const isLast = idx === cur.length - 1;
            const lastWasEmpty = last?.type === 'empty';
            if (isLast && type !== 'empty' && lastWasEmpty) {
              cur.push({ id: `empty-${Date.now()}`, type: 'empty' });
            }
            if (cur.length === 0 || cur[cur.length - 1]?.type !== 'empty') {
              cur.push({ id: `empty-${Date.now()}`, type: 'empty' });
            }
          }
          return { ...prev, [layoutMode]: cur };
        });
      }}
      onSwapSlots={swapSlotsByIndex}
    />
  );

  return (
    <div
      className={`flex h-dvh w-full flex-col overflow-hidden font-sans transition-[background-color,color] duration-200 ease-out ${
        theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'
      }`}
      style={theme === 'dark' ? undefined : { backgroundColor: '#ffffff' }}
    >
      <div id="tutorial-header-dock" className="relative z-20 flex shrink-0 flex-col">
      {/* Top Navigation Bar */}
      <div
        id="tutorial-nav-bar"
        className={`relative z-30 flex min-h-0 w-full min-w-0 items-center justify-between gap-1.5 px-2 py-1.5 transition-[background-color,box-shadow] duration-200 sm:gap-2 sm:px-3 ${
          theme === 'dark'
            ? 'bg-gray-800 shadow-[0_2px_18px_rgba(0,0,0,0.35)]'
            : 'bg-white shadow-[0_2px_18px_rgba(15,23,42,0.07)]'
        }`}
      >
        <div className="flex min-h-0 min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-3 sm:overflow-visible">
          <span className="inline-flex shrink-0 overflow-visible rounded-full sm:control-bleed-sm">
            <button
              id="tutorial-nav-back"
              type="button"
              onClick={() => {
                setSelectedFiles([]);
                setShowDifference(false);
                setActiveFileIndex(0);
                setViewMode('single');
                setDifferenceBaselineIndex(0);
                setDifferenceCompareIndex(1);
                windIemGlobal.setIemStation(null);
              }}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 glow-sm transition-[color,background-color,box-shadow] duration-200 sm:h-10 sm:w-10 ${theme === 'dark' ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
              title="Back to Map"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </span>

          <div
            id="tutorial-nav-files"
            className="flex min-h-0 min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-visible hide-scrollbar py-1 px-0.5 sm:gap-2 sm:px-0 sm:pe-1"
          >
            {selectedFiles.map((file, index) => {
              const fileTypeNote = weatherFileTypeLine(file);
              return (
              <div 
                key={index} 
                className={`group flex shrink-0 items-center gap-1 rounded-full py-1 pl-2.5 pr-1 transition-[color,background-color,box-shadow] duration-200 cursor-pointer sm:gap-2 sm:py-1.5 sm:pl-3 sm:pr-2 ${
                  viewMode === 'single' && activeFileIndex === index 
                    ? (theme === 'dark'
                      ? 'bg-gray-600 text-gray-100 glow-md z-10'
                      : 'bg-white text-gray-900 glow-md z-10')
                    : (theme === 'dark' ? 'bg-gray-700/70 text-gray-200 hover:bg-gray-600' : 'bg-white text-gray-600 glow-sm hover:text-gray-900')
                }`}
                onClick={() => {
                  if (viewMode === 'single') {
                    setActiveFileIndex(index);
                  }
                }}
                title={
                  [weatherLocationTypeCaption(file), file.sourceFilename].filter(Boolean).join('\n') ||
                  undefined
                }
              >
                <MapPin
                  className={`hidden h-3.5 w-3.5 shrink-0 sm:block sm:h-4 sm:w-4 ${viewMode === 'single' && activeFileIndex === index ? (theme === 'dark' ? 'text-gray-200' : 'text-gray-600') : (theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`}
                />
                <div className="flex max-w-[6.75rem] min-w-0 flex-col gap-0.5 text-left leading-none sm:max-w-[16rem] sm:gap-1">
                  <span className="truncate text-[11.5px] font-semibold leading-none sm:text-[13px]">
                    {weatherPlaceLine(file) || file.metadata.city}
                  </span>
                  {fileTypeNote ? (
                    <span
                      className={`truncate text-[9.5px] font-medium leading-none sm:text-[11px] ${
                        viewMode === 'single' && activeFileIndex === index
                          ? theme === 'dark'
                            ? 'text-gray-300'
                            : 'text-gray-600'
                          : theme === 'dark'
                            ? 'text-gray-400'
                            : 'text-gray-500'
                      }`}
                    >
                      {fileTypeNote}
                    </span>
                  ) : null}
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const newFiles = selectedFiles.filter((_, i) => i !== index);
                    setSelectedFiles(newFiles);
                    if (newFiles.length <= 1) {
                      setViewMode('single');
                      setShowDifference(false);
                    }
                    if (activeFileIndex >= newFiles.length) {
                      setActiveFileIndex(Math.max(0, newFiles.length - 1));
                    }
                    setDifferenceBaselineIndex(0);
                    setDifferenceCompareIndex(1);
                  }}
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-red-500/10 hover:text-red-500 sm:h-6 sm:w-6 ${viewMode === 'single' && activeFileIndex === index ? (theme === 'dark' ? 'text-gray-300' : 'text-gray-500') : 'text-gray-400'}`}
                  title="Remove file"
                >
                  <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </button>
              </div>
              );
            })}
            <DiscoverPulseShell storageKey={ONBOARDING_KEYS.addLocation} rounded="pill" className="shrink-0">
              <button
                id="tutorial-nav-add"
                type="button"
                aria-label="Add weather location"
                title="Add weather location"
                onClick={() => {
                  dismissOnboarding(ONBOARDING_KEYS.addLocation);
                  setIsSelectingFile(true);
                }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-0 text-xs font-semibold transition-all sm:h-9 sm:w-auto sm:px-3.5 sm:text-[13px] ${theme === 'dark' ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-700 hover:text-white' : 'bg-white text-gray-600 glow-sm hover:text-gray-900 hover:glow-md'}`}
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
            </DiscoverPulseShell>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          {selectedFiles.length > 1 && (
            <div
              id="tutorial-nav-viewmode"
              className={`flex shrink-0 items-center gap-0.5 rounded-full p-1 ${theme === 'dark' ? 'bg-gray-700/70' : 'bg-white glow-sm'}`}
            >
              <button
                onClick={() => {
                  setViewMode('single');
                  setShowDifference(false);
                }}
                className={`min-w-0 shrink rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-800 sm:px-3.5 sm:text-xs ${
                  viewMode === 'single'
                    ? theme === 'dark'
                      ? 'bg-gray-500 text-white glow-sm'
                      : 'bg-white text-gray-900 shadow-[0_1px_4px_rgba(15,23,42,0.12),0_0_8px_rgba(15,23,42,0.08)]'
                    : theme === 'dark'
                      ? 'text-gray-400 hover:text-gray-200'
                      : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                Single
              </button>
              <button
                onClick={() => {
                  setViewMode('comparison');
                  setShowDifference(true);
                }}
                className={`min-w-0 shrink rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-800 sm:px-3.5 sm:text-xs ${
                  viewMode === 'comparison'
                    ? theme === 'dark'
                      ? 'bg-gray-500 text-white glow-sm'
                      : 'bg-white text-gray-900 shadow-[0_1px_4px_rgba(15,23,42,0.12),0_0_8px_rgba(15,23,42,0.08)]'
                    : theme === 'dark'
                      ? 'text-gray-400 hover:text-gray-200'
                      : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                Compare
              </button>
            </div>
          )}

          {viewMode === 'single' && (
            <div
              id="tutorial-nav-layouts"
              className="relative inline-flex shrink-0"
            >
              <div
                className={`inline-flex h-8 shrink-0 items-stretch gap-0.5 rounded-full p-0.5 sm:h-10 sm:p-1 ${
                  theme === 'dark' ? 'bg-gray-700/70' : 'bg-white glow-sm'
                }`}
                role="group"
                aria-label="Dashboard layout"
              >
                {layoutSegments.map(({ mode, ariaLabel, title, Icon }) => {
                  const active = mode === layoutMode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setLayoutMode(mode)}
                      aria-label={ariaLabel}
                      aria-pressed={active}
                      title={title}
                      className={`flex min-w-8 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-800 sm:min-w-10 sm:px-2.5 ${
                        active
                          ? theme === 'dark'
                            ? 'bg-gray-500 text-gray-100 glow-sm'
                            : 'bg-white text-gray-900 glow-sm'
                          : theme === 'dark'
                            ? 'text-gray-400 hover:bg-gray-700/60 hover:text-gray-200'
                            : 'text-gray-400 hover:text-gray-800'
                      }`}
                    >
                      <Icon className="h-4 w-5 sm:h-5 sm:w-7" />
                      <span
                        className={`hidden max-w-[7rem] truncate pr-1 text-xs leading-none md:inline ${
                          active ? 'font-semibold' : 'font-medium'
                        }`}
                      >
                        {title}
                      </span>
                    </button>
                  );
                })}
                {layoutHasMore && (
                  <button
                    type="button"
                    onClick={() => setLayoutPickerOpen(v => !v)}
                    aria-expanded={layoutPickerOpen}
                    aria-haspopup="menu"
                    aria-label="More layouts"
                    title="More layouts"
                    className={`flex min-w-9 shrink-0 items-center justify-center rounded-full px-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-800 sm:min-w-10 sm:px-2.5 ${
                      layoutPickerOpen || moreLayouts.some(o => o.mode === layoutMode)
                        ? theme === 'dark'
                          ? 'bg-gray-600/70 text-gray-200'
                          : 'bg-white/70 text-gray-800'
                        : theme === 'dark'
                          ? 'text-gray-400 hover:bg-gray-700/60 hover:text-gray-200'
                          : 'text-gray-500 hover:bg-white/60 hover:text-gray-800'
                    }`}
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
              {layoutPickerOpen && moreLayouts.length > 0 && (
                <div
                  role="menu"
                  aria-label="More layouts"
                  className={`absolute right-0 top-full z-40 mt-1.5 min-w-[11rem] rounded-2xl p-1 glow-lg ${
                    theme === 'dark' ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
                  }`}
                >
                  {moreLayouts.map(({ mode, ariaLabel, title, Icon }) => {
                    const active = mode === layoutMode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setLayoutMode(mode);
                          setLayoutPickerOpen(false);
                        }}
                        aria-label={ariaLabel}
                        className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                          active
                            ? theme === 'dark'
                              ? 'bg-gray-700 font-semibold'
                              : 'bg-gray-100 font-semibold'
                            : theme === 'dark'
                              ? 'font-medium text-gray-300 hover:bg-gray-700/70'
                              : 'font-medium text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="h-4 w-6 shrink-0" />
                        <span>{title}</span>
                      </button>
                    );
                  })}
                  <div className={`my-1 h-px ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`} />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSlotsByLayout(prev => ({
                        ...prev,
                        [layoutMode]: defaultSlotsForLayout(layoutMode),
                      }));
                      setLayoutPickerOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      theme === 'dark'
                        ? 'text-gray-300 hover:bg-gray-700/70 hover:text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <RotateCcw className="h-3.5 w-6 shrink-0" aria-hidden />
                    <span>Reset layout</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mx-0.5 hidden w-1 shrink-0 xs:block sm:mx-1" aria-hidden />

          {!exportMode && hasActiveGlobalFilter(globalFilter) && (
            <div
              className={`inline-flex shrink-0 items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[11px] font-semibold glow-sm ${
                theme === 'dark'
                  ? 'bg-orange-500/20 text-orange-200'
                  : 'bg-orange-50 text-orange-800'
              }`}
              title="Global filters are active across all charts"
            >
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Filter className="h-3 w-3 shrink-0" aria-hidden />
                <span className="hidden sm:inline">
                  {[
                    monthFilterIsPartial(globalFilter)
                      ? formatMonthIsolationRange([globalFilter.startMonth, globalFilter.endMonth])
                      : null,
                    hourFilterIsPartial(globalFilter)
                      ? formatHourIsolationRange([globalFilter.startHour, globalFilter.endHour])
                      : null,
                    globalFilter.temperatureMode !== 'off' ? 'Temp' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="sm:hidden">Filtered</span>
              </button>
              <button
                type="button"
                aria-label="Reset global filters"
                title="Reset all global filters"
                onClick={() =>
                  setGlobalFilter({
                    ...DEFAULT_GLOBAL_FILTER,
                    temperatureLoC: dryBulbExtent.minC,
                    temperatureHiC: dryBulbExtent.maxC,
                  })
                }
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                  theme === 'dark' ? 'hover:bg-orange-400/25' : 'hover:bg-orange-200/70'
                }`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {exportMode ? (
            <ExportModeToolbar
              theme={theme}
              frame={exportFrame}
              onFrameChange={setExportFrame}
              format={exportFormat}
              onFormatChange={setExportFormat}
              onExport={handleExport}
              onClose={() => setExportMode(false)}
              exporting={exportBusy}
            />
          ) : null}

          <div className="inline-flex shrink-0 flex-row items-center gap-1">
            <button
              id="tutorial-nav-settings"
              type="button"
              aria-label="Global settings"
              onClick={() => setShowSettingsModal(true)}
              className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 glow-sm transition-[color,background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97] sm:h-10 sm:w-10 ${theme === 'dark' ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
              title="Global settings"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden />
              {hasActiveGlobalFilter(globalFilter) && (
                <span
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white dark:ring-gray-700"
                  aria-hidden
                />
              )}
            </button>
            {!exportMode && (
              <button
                id="tutorial-nav-export"
                type="button"
                aria-label="Export layout"
                data-export-ui
                onClick={() => setExportMode(true)}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 glow-sm transition-[color,background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97] sm:h-10 sm:w-10 ${theme === 'dark' ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                title="Export layout"
              >
                <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>

        </div>
      </div>

      </div>

      {/* Gradient Creator Modal — portaled above CardModal (z-[9999]) with live preview & backdrop/Escape close */}
      {showGradientModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/50 p-2 backdrop-blur-[1px]"
            onMouseDown={e => {
              if (e.target === e.currentTarget) setShowGradientModal(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') setShowGradientModal(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Create custom gradient"
              className={`w-full max-w-xs rounded-3xl p-5 glow-xl sm:max-w-sm ${
                theme === 'dark' ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
              }`}
            >
              <h3 className="mb-3 text-lg font-bold tracking-[-0.01em]">Create custom gradient</h3>
              <div className="space-y-3">
                <div
                  className="h-5 w-full rounded-full glow-sm"
                  style={{ background: `linear-gradient(to right, ${newGradientColors.join(', ')})` }}
                  aria-label="Gradient preview"
                />
                <div>
                  <label
                    className={`mb-1 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={newGradientName}
                    onChange={e => setNewGradientName(e.target.value)}
                    className={`w-full rounded-full px-4 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${
                      theme === 'dark'
                        ? 'bg-gray-900/50 text-gray-100 placeholder:text-gray-500'
                        : 'bg-gray-100 text-gray-900 placeholder:text-gray-400'
                    }`}
                    placeholder="e.g., My Cool Gradient"
                  />
                </div>
                <div>
                  <label
                    className={`mb-1 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    Colors
                  </label>
                  <div className="space-y-2">
                    {newGradientColors.map((color, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`Color stop ${i + 1}`}
                          value={color}
                          onChange={e => {
                            const newColors = [...newGradientColors];
                            newColors[i] = e.target.value;
                            setNewGradientColors(newColors);
                          }}
                          className="h-8 w-8 cursor-pointer rounded-full border-0 p-0"
                        />
                        <input
                          type="text"
                          aria-label={`Color stop ${i + 1} hex`}
                          value={color}
                          onChange={e => {
                            const newColors = [...newGradientColors];
                            newColors[i] = e.target.value;
                            setNewGradientColors(newColors);
                          }}
                          className={`flex-1 rounded-full px-3 py-1.5 text-sm font-mono transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${
                            theme === 'dark'
                              ? 'bg-gray-900/50 text-gray-100'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        />
                        {newGradientColors.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setNewGradientColors(prev => prev.filter((_, idx) => idx !== i))}
                            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-500 transition-colors duration-200 ${
                              theme === 'dark' ? 'hover:bg-red-950/50 hover:text-red-400' : 'hover:bg-red-50 hover:text-red-600'
                            }`}
                            aria-label="Remove color"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setNewGradientColors(prev => [...prev, '#ffffff'])}
                      className={`flex items-center gap-1 text-xs font-bold transition-colors duration-200 ${
                        theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <Plus className="w-3 h-3" /> Add Color
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowGradientModal(false)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                    theme === 'dark'
                      ? 'text-gray-300 hover:bg-gray-700/80 hover:text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newGradientName.trim() || newGradientColors.length < 2}
                  onClick={handleAddGradient}
                  className={`rounded-full px-6 py-2 text-sm font-bold text-white glow-md transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${
                    theme === 'dark' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-gray-800 hover:bg-gray-900'
                  }`}
                >
                  Create
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Dashboard Area — main charts flex-1; footer strip shrink-0 so pills never overlap cards */}
      <div 
        id="dashboard-area"
        data-export-mode={exportMode ? '' : undefined}
        className={`flex min-h-0 flex-1 flex-col overflow-hidden transition-[background-color] duration-200 ease-out ${exportMode ? 'bg-white' : ''}`}
        style={{
          backgroundColor: exportMode ? '#ffffff' : theme === 'dark' ? '#121211' : '#ffffff',
        }}
      >
        <div className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden px-2 pt-2 pb-2.5 sm:px-3 sm:pt-3 sm:pb-3 ${exportMode ? 'bg-white' : ''}`}>
          {showSettingsModal && (
            <SettingsModal
              isOpen={showSettingsModal}
              onClose={() => setShowSettingsModal(false)}
              filter={globalFilter}
              onChangeFilter={setGlobalFilter}
              unitSystem={unitSystem}
              theme={theme}
              setTheme={setTheme}
              heatmapTextColor={heatmapTextColor}
              setHeatmapTextColor={setHeatmapTextColor}
              setShowGradientModal={setShowGradientModal}
              dryBulbExtentMinC={dryBulbExtent.minC}
              dryBulbExtentMaxC={dryBulbExtent.maxC}
              barChartFillMode={barChartFillMode}
              onBarChartFillModeChange={setBarChartFillMode}
            />
          )}

          {windIemGlobal.stationPickerOpen && windPickerMetadata ? (
            <WindStationPickerModal
              open
              theme={theme}
              metadata={windPickerMetadata}
              sourceFilename={windPickerSourceFilename}
              initialSelection={windIemGlobal.iemStation}
              onApply={selection => {
                windIemGlobal.setIemStation(selection);
                windIemGlobal.closeWindStationPicker();
                windIemGlobal.openIemSetupModal(windIemGlobal.stationPickerRevertOnCancel);
              }}
              onCancel={() => {
                if (windIemGlobal.stationPickerRevertOnCancel) {
                  windIemGlobal.setSource('epw');
                }
                windIemGlobal.closeWindStationPicker();
              }}
            />
          ) : null}

          {windIemGlobal.setupModalOpen ? (
            <IemWindSetupModal
              open
              theme={theme}
              initialStart={windIemGlobal.iemYearStart}
              initialEnd={windIemGlobal.iemYearEnd}
              onApply={(s, e) => {
                windIemGlobal.setIemYearRange(s, e);
                windIemGlobal.closeIemSetupModal();
              }}
              onCancel={() => {
                if (windIemGlobal.setupModalRevertOnCancel) {
                  windIemGlobal.setSource('epw');
                }
                windIemGlobal.closeIemSetupModal();
              }}
            />
          ) : null}

          {selectedFiles.length >= 2 && viewMode === 'comparison' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ComparisonModeLayout
                files={displayFiles}
                baselineIndex={differenceBaselineIndex}
                compareIndex={differenceCompareIndex}
                onBaselineIndex={setDifferenceBaselineIndex}
                onCompareIndex={setDifferenceCompareIndex}
                exportMode={exportMode}
                theme={theme}
                unitSystem={unitSystem}
                gradients={allGradients}
                renderChart={(config, baseline, compare, showDiff, stacked, opts) =>
                  renderChartForFile(config, baseline, compare, showDiff, stacked, opts)
                }
              />
            </div>
          ) : (
            <TutorialLiveProvider enabled={layoutMode === 'tutorial'}>
              <div className="flex min-h-0 flex-1 flex-col">
                {layoutMode === 'grid-4x2' ? (
                  <div
                    ref={grid4x2ExportWrapRef}
                    className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,16.666%)] grid-rows-[1fr_1fr] gap-2.5 items-stretch"
                  >
                    <Grid4x2ComfortExportOutline
                      active={exportMode}
                      containerRef={grid4x2ExportWrapRef}
                      theme={theme}
                    />
                    <div className="col-span-1 row-span-2 min-h-0 min-w-0 flex flex-col">{singleModeLayoutEl}</div>
                    <Grid4x2StatsColumn
                      theme={theme}
                      rows={displayFiles[activeFileIndex]?.data}
                      unitSystem={unitSystem}
                      exportMode={exportMode}
                      siteLatitude={displayFiles[activeFileIndex]?.metadata.lat}
                      metadata={displayFiles[activeFileIndex]?.metadata}
                      filter={globalFilter}
                    />
                  </div>
                ) : (
                  singleModeLayoutEl
                )}
              </div>
            </TutorialLiveProvider>
          )}

          </div>
        <div
          className={`relative z-10 shrink-0 overflow-visible ${exportMode ? 'bg-white' : 'bg-inherit'}`}
        >
          <div className="w-full px-2 py-1.5 sm:px-3">
            <SiteFooter
              theme={theme}
              exportMode={exportMode}
              exportCaptions={exportFooterCaptions}
              unitSystem={unitSystem}
              onUnitSystemChange={setUnitSystem}
              heatmapCellStatistic={heatmapCellStatistic}
              onHeatmapCellStatisticChange={setHeatmapCellStatistic}
              dstDisplayEnabled={dstDisplayEnabled}
              onDstDisplayEnabledChange={setDstDisplayEnabled}
              showHeatmapCellToggle={dashboardHasHeatmap1224}
              exportNotesDst={exportMode && dstDisplayEnabled}
              iemWindDatasetActive={iemAttributionInExport}
              windFooter={windFooter}
            />
          </div>
        </div>
      </div>

      <ChartTooltipHost theme={theme} />
    </div>
  );
}
