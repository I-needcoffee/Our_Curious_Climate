import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, BookOpen, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  comfortPercentHeatStyle,
  formatUtciCategoryRange,
  UTCI_COMFORT_CATEGORY,
  utciExposureScenarioIndex,
  UTCI_HOUR_WINDOW_NOTE,
} from '../../lib/utciModel';
import type { ChartConfig, UnitSystem } from '../../App';
import type { GlobalFilterState } from '../GlobalFilterPanel';
import type { EPWDataRow } from '../../lib/epwParser';
import { getTutorialGuideCopy } from '../../lib/tutorialCopy';
import {
  computeExplorerMonthlyByMonth,
  computeTutorialGuideQuickStats,
  computeTutorialNvQuickStats,
  computeTutorialUtciQuickStats,
  computeTutorialWindInsights,
  type TutorialQuickStat,
  type TutorialQuickStatBlock,
  type WindRoseMiniBin,
} from '../../lib/tutorialGuideStats';
import { useTutorialLive } from '../../context/TutorialLiveContext';
import { NATURAL_VENTILATION_SUITABLE_BLUE_HEX, OUTDOOR_COMFORT_GREEN_HEX } from '../../lib/constants';
import { formatNvPresetLabel, NV_CRITERIA_PRESETS } from '../../lib/naturalVentilationModel';

type ParsedStatBlock = {
  heading?: string;
  peak?: string;
  avg?: string;
  low?: string;
  median?: string;
  spread?: string;
  count?: string;
  other: TutorialQuickStat[];
};

function parseStatBlock(block: TutorialQuickStatBlock): ParsedStatBlock {
  let peak: string | undefined;
  let avg: string | undefined;
  let low: string | undefined;
  let median: string | undefined;
  let spread: string | undefined;
  let count: string | undefined;
  const other: TutorialQuickStat[] = [];

  for (const row of block.rows) {
    const key = row.label.toLowerCase();
    if (key === 'peak' && !peak) peak = row.value;
    else if (key === 'average' && !avg) avg = row.value;
    else if (key === 'low' && !low) low = row.value;
    else if (key.startsWith('median') && !median) median = row.value;
    else if (key.includes('std. dev') && !spread) spread = row.value;
    else if (key.includes('timesteps') && !count) count = row.value;
    else other.push(row);
  }

  return { heading: block.heading, peak, avg, low, median, spread, count, other };
}

function formatCountLabel(raw?: string): string | null {
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return `${n.toLocaleString()} hrs`;
  return raw;
}

/** Muted sage-green & muted amber-orange accents for wind impact roses and labels. */
const WIND_HELPFUL_HEX = { light: '#4d8f6b', dark: '#6eb38d' } as const;
const WIND_HARMFUL_HEX = { light: '#cf7d42', dark: '#df955c' } as const;

function MiniWindRose({
  bins,
  maxHours,
  color,
  dark,
  kindLabel,
}: {
  bins: WindRoseMiniBin[];
  maxHours: number;
  color: string;
  dark: boolean;
  kindLabel: string;
}) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 73;
  const innerR = 4.5;
  const halfStepDeg = 22.5 / 2 - 0.9; // subtle crisp gap between adjacent spokes
  const ringStroke = dark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.22)';
  const labelFill = dark ? '#94a3b8' : '#64748b';
  const safeMax = Math.max(1, maxHours);

  const wedgePath = (centerDeg: number, radius: number) => {
    const a0 = ((centerDeg - halfStepDeg - 90) * Math.PI) / 180;
    const a1 = ((centerDeg + halfStepDeg - 90) * Math.PI) / 180;
    const x0 = cx + radius * Math.cos(a0);
    const y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);
    const ix1 = cx + innerR * Math.cos(a1);
    const iy1 = cy + innerR * Math.sin(a1);
    const ix0 = cx + innerR * Math.cos(a0);
    const iy0 = cy + innerR * Math.sin(a0);
    return `M ${ix0.toFixed(2)} ${iy0.toFixed(2)} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} A ${innerR} ${innerR} 0 0 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`;
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full select-none"
      role="img"
      aria-label={`${kindLabel} directional wind rose`}
    >
      {/* Reference crosshairs */}
      <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke={ringStroke} strokeWidth={0.9} />
      <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke={ringStroke} strokeWidth={0.9} />

      {/* Concentric rings (50% dashed, 100% solid) */}
      <circle
        cx={cx}
        cy={cy}
        r={maxR * 0.5}
        fill="none"
        stroke={ringStroke}
        strokeWidth={0.85}
        strokeDasharray="2.5 2.5"
      />
      <circle cx={cx} cy={cy} r={maxR} fill="none" stroke={ringStroke} strokeWidth={1} />

      {/* 16 directional spokes */}
      {bins.map(bin => {
        if (bin.hours <= 0) return null;
        const r = innerR + (bin.hours / safeMax) * (maxR - innerR);
        return (
          <path
            key={bin.label}
            d={wedgePath(bin.deg, Math.max(innerR + 2.5, r))}
            fill={color}
            fillOpacity={0.84}
            className="transition-opacity duration-150 hover:opacity-100"
          >
            <title>
              From {bin.label}: {bin.hours.toLocaleString()} hrs ({bin.pct.toFixed(1)}% of {kindLabel.toLowerCase()})
            </title>
          </path>
        );
      })}

      {/* Center hub */}
      <circle
        cx={cx}
        cy={cy}
        r={innerR}
        fill={dark ? '#1f2937' : '#ffffff'}
        stroke={ringStroke}
        strokeWidth={0.9}
      />

      {/* Cardinal compass labels */}
      <text x={cx} y={10.5} textAnchor="middle" fill={labelFill} fontSize="10" fontWeight="700">
        N
      </text>
      <text x={size - 7} y={cy + 3.5} textAnchor="middle" fill={labelFill} fontSize="10" fontWeight="700">
        E
      </text>
      <text x={cx} y={size - 3.5} textAnchor="middle" fill={labelFill} fontSize="10" fontWeight="700">
        S
      </text>
      <text x={7.5} y={cy + 3.5} textAnchor="middle" fill={labelFill} fontSize="10" fontWeight="700">
        W
      </text>

      {/* Outer ring peak-sector scale */}
      <text
        x={cx + maxR * 0.72}
        y={cy - maxR * 0.72}
        textAnchor="start"
        fill={labelFill}
        fontSize="8.5"
        fontWeight="600"
        opacity={0.85}
      >
        {safeMax}h
      </text>
    </svg>
  );
}

export function TutorialGuidePanel({
  theme,
  slot,
  epwRows,
  filter,
  unitSystem,
  siteLatitude = null,
  siteLng = null,
  siteTimeZone = null,
}: {
  theme: 'light' | 'dark';
  slot: ChartConfig;
  epwRows?: EPWDataRow[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  siteLatitude?: number | null;
  siteLng?: number | null;
  siteTimeZone?: number | null;
}) {
  const { snapshot, requestUtciSelection, clearUtciFocus } = useTutorialLive();
  const [selectedCell, setSelectedCell] = useState<{ periodIndex: number; scenarioIndex: number } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [utciTab, setUtciTab] = useState<'periods' | 'bands'>('periods');
  const [windLens, setWindLens] = useState<'utci' | 'nv'>('utci');
  const [moreStatsOpen, setMoreStatsOpen] = useState(false);
  const comfortMatrixRef = useRef<HTMLDivElement>(null);

  const clearComfortHighlight = useCallback(() => {
    setSelectedCell(null);
    clearUtciFocus();
  }, [clearUtciFocus]);

  useEffect(() => {
    setGuideOpen(false);
    setMoreStatsOpen(false);
  }, [slot.type]);

  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuideOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [guideOpen]);

  useEffect(() => {
    if (!selectedCell && !snapshot.utciFocusPeriodId) return;
    const onDocPointer = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Element) {
        if (target.closest('[data-export-ui]')) return;
        if (target.closest('[data-slot-shell="true"]')) return;
        if (target.closest('[data-tutorial-guide-keep-focus="true"]')) return;
      }
      const root = comfortMatrixRef.current;
      if (!root?.contains(target as Node)) clearComfortHighlight();
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [selectedCell, snapshot.utciFocusPeriodId, clearComfortHighlight]);

  const explorerMonthlyByMonth = useMemo(
    () =>
      slot.type === 'explorer'
        ? computeExplorerMonthlyByMonth({
            rows: epwRows,
            filter,
            unitSystem,
            slotVariableId: slot.variable,
            live: snapshot,
          })
        : null,
    [slot.type, slot.variable, epwRows, filter, unitSystem, snapshot]
  );

  const copy = useMemo(() => {
    if (slot.type === 'empty') {
      return {
        chartTitle: 'Choose a chart',
        overviewBody:
          'This details view keeps one large chart next to concise summary stats and an on-demand guide. Pick Sun path, Data explorer, UTCI, Natural ventilation, Wind explorer, or Wind rose from the empty card.',
        readingTitle: 'Why one card?',
        readingBody:
          'Focusing on a single chart keeps the story simple: headline numbers up front, interactive breakdowns right below, and plain-language reading notes tucked inside this Guide drawer.',
      };
    }
    return getTutorialGuideCopy({
      chartType: slot.type,
      slotVariableId: slot.variable,
      slotVariableName: undefined,
      live: snapshot,
    });
  }, [slot.type, slot.variable, snapshot]);

  const statBlocks = useMemo(
    () =>
      slot.type === 'utci' ||
      slot.type === 'naturalVentilation' ||
      slot.type === 'wind' ||
      slot.type === 'windrose'
        ? []
        : computeTutorialGuideQuickStats({
            chartType: slot.type,
            rows: epwRows,
            filter,
            unitSystem,
            slotVariableId: slot.variable,
            live: snapshot,
          }),
    [slot.type, slot.variable, epwRows, filter, unitSystem, snapshot]
  );

  const parsedBlocks = useMemo(() => {
    const raw = statBlocks.map(parseStatBlock);
    // Avoid duplicating a standalone "Sample size" block when the main metric block already reports timesteps.
    if (raw.length > 1 && raw[0].heading === 'Sample size' && raw[1].count) {
      return raw.slice(1);
    }
    return raw;
  }, [statBlocks]);

  const utciStats = useMemo(
    () =>
      slot.type === 'utci'
        ? computeTutorialUtciQuickStats({
            rows: epwRows,
            filter,
            live: snapshot,
            siteLatitude,
            siteLng,
            siteTimeZone,
          })
        : null,
    [slot.type, epwRows, filter, snapshot, siteLatitude, siteLng, siteTimeZone]
  );

  const activeScenarioIndex = useMemo(() => {
    if (snapshot.optimizeMode) {
      const idx = utciStats?.comfortMatrix.scenarios.findIndex(s => s.optimized) ?? -1;
      return idx === -1 ? 4 : idx;
    }
    return utciExposureScenarioIndex(snapshot.includeSun ?? true, snapshot.includeWind ?? true);
  }, [
    snapshot.optimizeMode,
    snapshot.includeSun,
    snapshot.includeWind,
    utciStats?.comfortMatrix.scenarios,
  ]);

  useEffect(() => {
    setSelectedCell(prev => {
      if (!prev) return null;
      if (prev.scenarioIndex === activeScenarioIndex) return prev;
      return { ...prev, scenarioIndex: activeScenarioIndex };
    });
  }, [activeScenarioIndex]);

  const nvStats = useMemo(
    () =>
      slot.type === 'naturalVentilation'
        ? computeTutorialNvQuickStats({ rows: epwRows, filter, unitSystem, live: snapshot })
        : null,
    [slot.type, epwRows, filter, unitSystem, snapshot]
  );

  const windInsights = useMemo(
    () =>
      slot.type === 'wind' || slot.type === 'windrose'
        ? computeTutorialWindInsights({
            rows: epwRows,
            filter,
            unitSystem,
            live: snapshot,
            siteLatitude,
            siteLng,
            siteTimeZone,
          })
        : null,
    [slot.type, epwRows, filter, unitSystem, snapshot, siteLatitude, siteLng, siteTimeZone]
  );

  const subtitle = useMemo(() => {
    if (slot.type === 'empty') return 'Select a chart on the left to inspect its numbers';
    if (slot.type === 'utci') {
      const modeText = snapshot.optimizeMode
        ? 'Optimized exposure'
        : `Sun ${snapshot.includeSun !== false ? 'on' : 'off'} · Wind ${snapshot.includeWind !== false ? 'on' : 'off'}`;
      return snapshot.utciGroundLabel ? `${modeText} · ${snapshot.utciGroundLabel}` : modeText;
    }
    if (slot.type === 'naturalVentilation') {
      return nvStats ? nvStats.activeCriteriaSummary : 'Dry-bulb & humidity screening';
    }
    if (slot.type === 'explorer') {
      const varName = parsedBlocks[0]?.heading || 'Weather variable';
      const step = snapshot.aggregation
        ? `${snapshot.aggregation.charAt(0).toUpperCase()}${snapshot.aggregation.slice(1)}ly`
        : 'Monthly';
      return `${varName} · ${step} view`;
    }
    if (slot.type === 'windrose') {
      const bins = snapshot.windRoseBins ?? 16;
      return `${bins} compass bins · Filtered hours`;
    }
    if (slot.type === 'sunpath') {
      return `${snapshot.colorVarName || 'Color'} · ${snapshot.radiusVarName || 'Radius'}`;
    }
    if (slot.type === 'wind') {
      return `Wind speed + ${snapshot.colorVarName || 'color overlay'}`;
    }
    return 'Filtered weather summary';
  }, [slot.type, snapshot, nvStats, parsedBlocks]);

  const methodologyNote = useMemo(() => {
    if (slot.type === 'utci') {
      return 'Modeled UTCI uses the active Settings month, hour, and temperature filters. Clicking a cell in the period table applies that exposure and isolates its time window on the chart. Seasonal rows use astronomical equinox and solstice boundaries rather than whole calendar months.';
    }
    if (slot.type === 'naturalVentilation') {
      return 'Outdoor dry-bulb temperature and relative humidity are evaluated across the active Settings month and hour filters. Presets match the criteria controls inside the chart card.';
    }
    if (slot.type === 'explorer') {
      return 'Values reflect the loaded weather file with the same Settings month and hour filters as the chart. When Month view uses mean daily min/max bar extents, the monthly table matches those extents.';
    }
    if (slot.type === 'wind' || slot.type === 'windrose') {
      return 'Predominant directions group non-calm hours (≥ 0.5 m/s) into 8 compass sectors. Switch between Outdoor comfort (UTCI: compares wind-on vs. sheltered UTCI by ≥ 0.5 °C / 0.9 °F) and Natural ventilation (screens breezy hours against operable-window temperature and ≤ 70% RH limits). Each mini wind rose is scaled to its own peak direction (shown on the outer ring).';
    }
    return 'All summary figures are computed directly from your loaded weather file using the same month and hour filters applied to the chart in Settings.';
  }, [slot.type]);

  const dark = theme === 'dark';
  const surface = dark ? 'bg-gray-800' : 'bg-white';
  /** White-on-white inset sections defined purely by soft outer glows. */
  const softSectionBg = dark ? 'bg-gray-800/95 glow-sm' : 'bg-white glow-sm';
  /** Opaque fill for sticky table headers inside white/dark inset panels. */
  const stickyCellBg = dark ? 'bg-gray-800' : 'bg-white';
  const kpiTileClass = dark
    ? 'rounded-xl bg-gray-800/95 px-3 py-2 glow-sm'
    : 'rounded-xl bg-white px-3 py-2 glow-sm';
  const ink = dark ? 'text-gray-100' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const microLabel = `text-[10px] font-bold uppercase tracking-[0.08em] ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const pillCapsule = dark
    ? 'inline-flex items-center gap-0.5 rounded-full bg-gray-800 p-0.5 glow-sm'
    : 'inline-flex items-center gap-0.5 rounded-full bg-white p-0.5 glow-sm';
  const pillTabActive = dark
    ? 'rounded-full bg-gray-700 px-2.5 py-1 text-[11px] font-semibold text-white glow-sm transition-all'
    : 'rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-950 glow-sm transition-all';
  const pillTabIdle = dark
    ? 'rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-100 transition-colors'
    : 'rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-800 transition-colors';
  const tint = (hex: string) => ({ backgroundColor: dark ? `${hex}22` : `${hex}14` });

  const renderMetricGroup = (block: ParsedStatBlock, key: React.Key, compact = false) => {
    const hasCoreTriple = Boolean(block.peak || block.avg || block.low);
    const countLabel = formatCountLabel(block.count);
    const secondaryChips = [
      block.median ? { label: 'Median', value: block.median } : null,
      block.spread ? { label: 'Spread', value: `±${block.spread}` } : null,
      ...block.other.map(o => ({ label: o.label, value: o.value })),
    ].filter((x): x is { label: string; value: string } => x !== null);

    return (
      <section key={key} className={`rounded-2xl p-3 ${softSectionBg}`}>
        {(block.heading || countLabel) && (
          <div className="mb-2 flex items-center justify-between gap-2">
            {block.heading ? <h3 className={`truncate ${microLabel}`}>{block.heading}</h3> : <span />}
            {countLabel ? (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                  dark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600 glow-sm'
                }`}
              >
                {countLabel}
              </span>
            ) : null}
          </div>
        )}

        {hasCoreTriple ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'High', value: block.peak ?? '—' },
              { label: 'Average', value: block.avg ?? '—', primary: true },
              { label: 'Low', value: block.low ?? '—' },
            ].map(item => (
              <div key={item.label} className={kpiTileClass}>
                <p className={microLabel}>{item.label}</p>
                <p
                  className={`mt-0.5 truncate font-bold leading-tight tabular-nums ${
                    compact ? 'text-sm @lg:text-base' : 'text-base @2xl:text-lg'
                  } ${ink}`}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-xs">
            {block.other.map(row => (
              <React.Fragment key={row.label}>
                <dt className={muted}>{row.label}</dt>
                <dd className={`font-semibold tabular-nums ${ink}`}>{row.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}

        {hasCoreTriple && secondaryChips.length > 0 ? (
          <div className={`mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 px-1 text-[11px] ${muted}`}>
            {secondaryChips.map(chip => (
              <span key={chip.label} className="inline-flex items-baseline gap-1">
                <span>{chip.label}</span>
                <span className={`font-semibold tabular-nums ${ink}`}>{chip.value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <aside
      className={`@container relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl glow-lg ${surface}`}
    >
      {/* Compact Header */}
      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3.5 pb-2.5 @2xl:px-5 @2xl:pt-4">
        <div className="min-w-0 flex-1">
          <h2 className={`truncate text-base font-bold leading-tight tracking-[-0.01em] @2xl:text-lg ${ink}`}>
            {copy.chartTitle}
          </h2>
          <p className={`mt-0.5 truncate text-xs ${muted}`} title={subtitle}>
            {subtitle}
          </p>
        </div>

        <button
          type="button"
          data-tutorial-guide-keep-focus="true"
          onClick={() => setGuideOpen(true)}
          aria-expanded={guideOpen}
          aria-controls="tutorial-guide-drawer"
          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold glow-sm transition-colors ${
            dark
              ? 'bg-gray-800 text-gray-100 hover:bg-gray-700'
              : 'bg-white text-gray-700 hover:text-gray-950'
          }`}
          title="Open plain-language guide & how to read this chart"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          <span>Guide</span>
        </button>
      </header>

      {/* Main single-page structured body */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-3.5 @2xl:px-5 @2xl:pb-4">
        {slot.type === 'utci' ? (
          utciStats ? (
            <>
              {/* Hero Comfort Strip + 10-band visual bar */}
              <section className="shrink-0 rounded-2xl px-3.5 py-2.5 @2xl:px-4 @2xl:py-3" style={tint(OUTDOOR_COMFORT_GREEN_HEX)}>
                <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                  <div>
                    <p className={microLabel}>Time in comfort</p>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span
                        className={`text-2xl font-bold leading-none tabular-nums @2xl:text-3xl ${
                          dark ? 'text-emerald-400' : 'text-emerald-800'
                        }`}
                      >
                        {Number.isFinite(utciStats.comfortPercent) ? `${utciStats.comfortPercent.toFixed(1)}%` : '—'}
                      </span>
                      <span className={`text-[11px] font-medium tabular-nums ${muted}`}>
                        {formatUtciCategoryRange(UTCI_COMFORT_CATEGORY, unitSystem)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                        dark ? 'bg-gray-900/50 text-gray-300' : 'bg-white/80 text-gray-700 glow-sm'
                      }`}
                    >
                      {utciStats.hoursCounted.toLocaleString()} hrs
                    </span>
                    {(selectedCell || snapshot.utciFocusPeriodId) && (
                      <button
                        type="button"
                        data-tutorial-guide-keep-focus="true"
                        onClick={clearComfortHighlight}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                          dark
                            ? 'bg-orange-950/70 text-orange-200 hover:bg-orange-900/80'
                            : 'bg-white text-orange-700 glow-sm hover:bg-orange-50'
                        }`}
                        title="Clear period highlight on chart"
                      >
                        <span>{utciStats.isolationLabel ?? 'Filtered'}</span>
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>

                {/* Proportional 10-band visual summary strip */}
                <div
                  className={`mt-2.5 flex h-2 w-full overflow-hidden rounded-full ${
                    dark ? 'bg-gray-900/60' : 'bg-white/75'
                  }`}
                  aria-label="UTCI stress distribution bar"
                >
                  {utciStats.categoryShares
                    .filter(s => s.percentage > 0)
                    .map(share => (
                      <div
                        key={share.category}
                        style={{
                          width: `${share.percentage}%`,
                          backgroundColor: share.color,
                        }}
                        title={`${share.label} (${formatUtciCategoryRange(share.category, unitSystem)}): ${share.percentage.toFixed(1)}%`}
                      />
                    ))}
                </div>
              </section>

              {/* View switcher: Period Matrix vs 10 Stress Bands */}
              <div
                className="flex shrink-0 flex-wrap items-center justify-between gap-2"
                data-tutorial-guide-keep-focus="true"
              >
                <div className={pillCapsule} role="tablist" aria-label="UTCI detail view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={utciTab === 'periods'}
                    onClick={() => setUtciTab('periods')}
                    className={utciTab === 'periods' ? pillTabActive : pillTabIdle}
                  >
                    By period
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={utciTab === 'bands'}
                    onClick={() => setUtciTab('bands')}
                    className={utciTab === 'bands' ? pillTabActive : pillTabIdle}
                  >
                    Stress bands (10)
                  </button>
                </div>

                <span className={`text-[11px] ${muted}`}>
                  {utciTab === 'periods' ? 'Click any cell to isolate on chart' : '% of filtered hours'}
                </span>
              </div>

              {utciTab === 'periods' ? (
                <section className={`flex min-h-0 flex-col rounded-2xl p-2.5 @2xl:p-3 ${softSectionBg}`}>
                  <div ref={comfortMatrixRef} className="-mx-1 overflow-x-auto px-1">
                    <table className="w-full min-w-0 border-separate border-spacing-x-1 border-spacing-y-1 text-left text-xs sm:min-w-[22rem]">
                      <thead>
                        <tr>
                          <th
                            className={`sticky left-0 z-10 pb-1 pr-2 text-[10px] font-bold uppercase tracking-wider ${muted} ${stickyCellBg}`}
                          >
                            Period
                          </th>
                          {utciStats.comfortMatrix.scenarios.map((scenario, si) => {
                            const colActive =
                              selectedCell != null ? selectedCell.scenarioIndex === si : activeScenarioIndex === si;
                            return (
                              <th
                                key={scenario.id}
                                title={scenario.label}
                                className={`max-w-[5rem] pb-1 text-center text-[10px] font-semibold leading-tight ${
                                  colActive ? (dark ? 'text-orange-300' : 'text-orange-700') : muted
                                }`}
                              >
                                {scenario.shortLabel}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {utciStats.comfortMatrix.periods.map((period, pi) => {
                          const rowSelected = selectedCell?.periodIndex === pi;
                          return (
                            <tr key={period.id}>
                              <th
                                scope="row"
                                className={`sticky left-0 z-10 max-w-[9.5rem] py-0.5 pr-2 text-left text-xs font-semibold leading-snug ${stickyCellBg} ${
                                  rowSelected ? (dark ? 'text-orange-300' : 'text-orange-800') : ink
                                }`}
                                title={period.label}
                              >
                                {period.label}
                              </th>
                              {utciStats.comfortMatrix.scenarios.map((scenario, si) => {
                                const cell = utciStats.comfortMatrix.cells[pi][si];
                                const isSelected =
                                  selectedCell?.periodIndex === pi && selectedCell.scenarioIndex === si;
                                const heat = comfortPercentHeatStyle(cell.percentComfort, theme);

                                return (
                                  <td key={`${period.id}-${scenario.id}`}>
                                    <button
                                      type="button"
                                      title={`${period.label} · ${scenario.label}`}
                                      aria-pressed={isSelected}
                                      style={heat}
                                      className={`w-full min-w-[3.1rem] rounded-full px-1 py-1.5 text-center text-xs font-semibold tabular-nums transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white focus-visible:ring-offset-1 ${
                                        isSelected ? 'ring-2 ring-gray-900 dark:ring-white ring-offset-1' : ''
                                      }`}
                                      onClick={() => {
                                        if (isSelected) {
                                          clearComfortHighlight();
                                          return;
                                        }
                                        setSelectedCell({ periodIndex: pi, scenarioIndex: si });
                                        if (scenario.optimized) {
                                          requestUtciSelection({
                                            periodId: period.id,
                                            optimizeMode: true,
                                          });
                                        } else {
                                          requestUtciSelection({
                                            periodId: period.id,
                                            includeSun: scenario.includeSun ?? true,
                                            includeWind: scenario.includeWind ?? true,
                                            optimizeMode: false,
                                          });
                                        }
                                      }}
                                    >
                                      {Number.isFinite(cell.percentComfort) ? `${cell.percentComfort.toFixed(1)}%` : '—'}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className={`mt-1.5 text-[10px] leading-snug ${muted}`}>{UTCI_HOUR_WINDOW_NOTE}</p>
                </section>
              ) : (
                <section className={`rounded-2xl p-2.5 @2xl:p-3 ${softSectionBg}`}>
                  <ul className="flex flex-col gap-0.5">
                    {utciStats.categoryShares.map(share => {
                      const rangeLabel = formatUtciCategoryRange(share.category, unitSystem);
                      const comfortText = dark ? 'text-emerald-300' : 'text-emerald-800';
                      const pct = Number.isFinite(share.percentage) ? Math.max(0, Math.min(100, share.percentage)) : 0;
                      return (
                        <li
                          key={share.category}
                          className="grid grid-cols-[auto_minmax(0,1fr)_auto_3.5rem_3rem] items-center gap-x-2 rounded-full px-2 py-1"
                          style={share.isComfort ? tint(OUTDOOR_COMFORT_GREEN_HEX) : undefined}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full glow-sm"
                            style={{ backgroundColor: share.color }}
                            aria-hidden
                          />
                          <span
                            className={`truncate text-xs leading-snug ${
                              share.isComfort ? `font-semibold ${comfortText}` : ink
                            }`}
                          >
                            {share.label}
                          </span>
                          <span
                            className={`shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums ${
                              share.isComfort ? `font-medium ${comfortText}` : muted
                            }`}
                          >
                            {rangeLabel}
                          </span>
                          <span
                            className={`h-1.5 w-full overflow-hidden rounded-full ${
                              dark ? 'bg-gray-800' : 'bg-black/[0.08]'
                            }`}
                            aria-hidden
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: share.color }}
                            />
                          </span>
                          <span
                            className={`text-right text-xs font-semibold tabular-nums ${
                              share.isComfort ? comfortText : ink
                            }`}
                          >
                            {share.percentage.toFixed(1)}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <p className={`text-xs ${muted}`}>No hours match your current filters.</p>
          )
        ) : slot.type === 'naturalVentilation' ? (
          nvStats ? (
            <>
              {/* Hero Suitable Hours */}
              <section
                className="shrink-0 rounded-2xl px-3.5 py-2.5 @2xl:px-4 @2xl:py-3"
                style={tint(NATURAL_VENTILATION_SUITABLE_BLUE_HEX)}
              >
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className={microLabel}>Suitable hours (active criteria)</p>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span
                        className={`text-2xl font-bold leading-none tabular-nums @2xl:text-3xl ${
                          dark ? 'text-sky-300' : 'text-sky-800'
                        }`}
                      >
                        {Number.isFinite(nvStats.activeBreakdown.suitablePct)
                          ? `${nvStats.activeBreakdown.suitablePct.toFixed(1)}%`
                          : '—'}
                      </span>
                      <span className={`text-xs font-semibold tabular-nums ${ink}`}>
                        {nvStats.activeBreakdown.suitableHours.toLocaleString()} hrs
                      </span>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                      dark ? 'bg-gray-900/50 text-gray-300' : 'bg-white/80 text-gray-700 glow-sm'
                    }`}
                  >
                    of {nvStats.totalHours.toLocaleString()} hrs
                  </span>
                </div>

                <div
                  className={`mt-2.5 h-2 w-full overflow-hidden rounded-full ${
                    dark ? 'bg-gray-900/60' : 'bg-white/80'
                  }`}
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, nvStats.activeBreakdown.suitablePct))}%`,
                      backgroundColor: NATURAL_VENTILATION_SUITABLE_BLUE_HEX,
                    }}
                  />
                </div>
              </section>

              {/* 3-Column Horizontal Preset Comparison */}
              <section className={`rounded-2xl p-3 ${softSectionBg}`}>
                <h3 className={`mb-2 ${microLabel}`}>Presets comparison</h3>
                <ul className="grid grid-cols-1 gap-2 @sm:grid-cols-3">
                  {nvStats.presetStats.map(stat => {
                    const preset = NV_CRITERIA_PRESETS.find(p => p.id === stat.id);
                    return (
                      <li key={stat.id} className={kpiTileClass}>
                        <p className={microLabel}>{stat.shortLabel}</p>
                        <p
                          className={`mt-0.5 text-base font-bold leading-tight tabular-nums ${
                            dark ? 'text-sky-300' : 'text-sky-800'
                          }`}
                        >
                          {Number.isFinite(stat.suitablePct) ? `${stat.suitablePct.toFixed(1)}%` : '—'}
                        </p>
                        <p className={`text-[11px] font-medium tabular-nums ${ink}`}>
                          {stat.suitableHours.toLocaleString()} hrs
                        </p>
                        {preset ? (
                          <p
                            className={`mt-0.5 truncate text-[10px] ${muted}`}
                            title={formatNvPresetLabel(preset, unitSystem)}
                          >
                            {formatNvPresetLabel(preset, unitSystem)}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Limiting Factor Breakdown with inline bars */}
              <section className={`rounded-2xl p-3 ${softSectionBg}`}>
                <h3 className={`mb-2 ${microLabel}`}>Criteria breakdown</h3>
                <ul className="flex flex-col gap-1.5">
                  {[
                    {
                      label: 'Temp + humidity (suitable)',
                      hours: nvStats.activeBreakdown.suitableHours,
                      pct: nvStats.activeBreakdown.suitablePct,
                      primary: true,
                    },
                    {
                      label: 'Temp range only',
                      hours: nvStats.activeBreakdown.tempOnlyHours,
                      pct: nvStats.activeBreakdown.tempOnlyPct,
                    },
                    {
                      label: 'Humidity limit only',
                      hours: nvStats.activeBreakdown.rhOnlyHours,
                      pct: nvStats.activeBreakdown.rhOnlyPct,
                    },
                    {
                      label: 'Temp OK, humidity too high',
                      hours: nvStats.activeBreakdown.tempOkRhFailHours,
                      pct: nvStats.activeBreakdown.tempOkRhFailPct,
                    },
                    {
                      label: 'Humidity OK, temp out of range',
                      hours: nvStats.activeBreakdown.rhOkTempFailHours,
                      pct: nvStats.activeBreakdown.rhOkTempFailPct,
                    },
                  ].map(row => {
                    const clampedPct = Number.isFinite(row.pct) ? Math.max(0, Math.min(100, row.pct)) : 0;
                    return (
                      <li
                        key={row.label}
                        className="grid grid-cols-[minmax(0,1fr)_3.75rem_auto] items-center gap-x-2.5 text-xs"
                      >
                        <span
                          className={`truncate ${
                            row.primary
                              ? `font-semibold ${dark ? 'text-sky-300' : 'text-sky-800'}`
                              : ink
                          }`}
                        >
                          {row.label}
                        </span>
                        <span
                          className={`h-1.5 w-full overflow-hidden rounded-full ${
                            dark ? 'bg-gray-800' : 'bg-gray-200/80'
                          }`}
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${clampedPct}%`,
                              backgroundColor: row.primary
                                ? NATURAL_VENTILATION_SUITABLE_BLUE_HEX
                                : dark
                                  ? '#64748b'
                                  : '#94a3b8',
                            }}
                          />
                        </span>
                        <span
                          className={`whitespace-nowrap text-right font-semibold tabular-nums ${
                            row.primary ? (dark ? 'text-sky-300' : 'text-sky-800') : ink
                          }`}
                        >
                          {row.hours.toLocaleString()}h · {clampedPct.toFixed(1)}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          ) : (
            <p className={`text-xs ${muted}`}>No hours match your current filters.</p>
          )
        ) : slot.type === 'wind' || slot.type === 'windrose' ? (
          windInsights ? (
            <>
              {/* Compact Wind Overview + Predominant Directions */}
              <section className={`shrink-0 rounded-2xl p-2.5 @2xl:p-3 ${softSectionBg}`}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h3 className={microLabel}>Wind overview &amp; predominant directions</h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                      dark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600 glow-sm'
                    }`}
                  >
                    {windInsights.totalHours.toLocaleString()} hrs
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className={kpiTileClass}>
                    <p className={microLabel}>Avg speed</p>
                    <p className={`mt-0.5 truncate text-sm font-bold leading-tight tabular-nums @2xl:text-base ${ink}`}>
                      {windInsights.avgSpeed}
                    </p>
                  </div>
                  <div className={kpiTileClass}>
                    <p className={microLabel}>Peak speed</p>
                    <p className={`mt-0.5 truncate text-sm font-bold leading-tight tabular-nums @2xl:text-base ${ink}`}>
                      {windInsights.peakSpeed}
                    </p>
                  </div>
                  <div className={kpiTileClass}>
                    <p className={microLabel} title={`Calm hours (${windInsights.calmThresholdLabel})`}>
                      Calm ({windInsights.calmThresholdLabel})
                    </p>
                    <p className={`mt-0.5 truncate text-sm font-bold leading-tight tabular-nums @2xl:text-base ${ink}`}>
                      {windInsights.calmPct.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {windInsights.predominant.length > 0 ? (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {windInsights.predominant.map((dir, i) => (
                      <div
                        key={dir.label}
                        title={`#${i + 1} prevailing: blowing from ${dir.label} (${dir.hours.toLocaleString()} hrs, avg ${dir.avgSpeedFormatted})`}
                        className={`flex items-center justify-between gap-1.5 rounded-xl px-2.5 py-1.5 ${
                          dark ? 'bg-gray-800/90 glow-sm' : 'bg-white glow-sm'
                        }`}
                      >
                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${ink}`}>
                          <ArrowDown
                            className={`h-3 w-3 shrink-0 ${muted}`}
                            style={{ transform: `rotate(${dir.deg}deg)` }}
                            strokeWidth={2.25}
                            aria-hidden
                          />
                          <span>{dir.label}</span>
                        </span>
                        <span className="truncate text-right text-[11px] leading-tight tabular-nums">
                          <strong className={`font-semibold ${ink}`}>{dir.pct.toFixed(0)}%</strong>
                          <span className={`ml-1 text-[10px] ${muted}`}>{dir.avgSpeedFormatted}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {windInsights.overlaySummary ? (
                  <div className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 text-[11px] ${muted}`}>
                    <span className="font-medium">Color · {windInsights.overlaySummary.variableName}:</span>
                    <span>
                      High <strong className={`tabular-nums ${ink}`}>{windInsights.overlaySummary.high}</strong>
                    </span>
                    <span>
                      Avg <strong className={`tabular-nums ${ink}`}>{windInsights.overlaySummary.avg}</strong>
                    </span>
                    <span>
                      Low <strong className={`tabular-nums ${ink}`}>{windInsights.overlaySummary.low}</strong>
                    </span>
                  </div>
                ) : null}
              </section>

              {/* Lens Toggle: Outdoor comfort (UTCI) vs Natural ventilation */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className={pillCapsule} role="tablist" aria-label="Wind impact lens">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={windLens === 'utci'}
                    onClick={() => setWindLens('utci')}
                    className={windLens === 'utci' ? pillTabActive : pillTabIdle}
                  >
                    Outdoor comfort
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={windLens === 'nv'}
                    onClick={() => setWindLens('nv')}
                    className={windLens === 'nv' ? pillTabActive : pillTabIdle}
                  >
                    Natural ventilation
                  </button>
                </div>

                <span className={`text-[11px] ${muted}`}>
                  {windLens === 'utci' ? 'Based on UTCI stress shift' : 'Based on operable-window limits'}
                </span>
              </div>

              {/* Isolated Helpful vs Harmful Wind Roses (Side-by-Side, Full Card Scale) */}
              {(() => {
                const activeLens = windLens === 'utci' ? windInsights.utci : windInsights.nv;
                const cards = [
                  {
                    key: 'helpful',
                    title: 'Helpful winds',
                    bucket: activeLens.helpful,
                    dotColor: dark ? WIND_HELPFUL_HEX.dark : WIND_HELPFUL_HEX.light,
                    textColor: dark ? '#82c5a0' : '#356c4f',
                    emptyText:
                      windLens === 'utci'
                        ? 'Minimal wind cooling relief.'
                        : 'No breezes within ventilation limits.',
                  },
                  {
                    key: 'harmful',
                    title: 'Harmful winds',
                    bucket: activeLens.harmful,
                    dotColor: dark ? WIND_HARMFUL_HEX.dark : WIND_HARMFUL_HEX.light,
                    textColor: dark ? '#e6a36e' : '#9c5623',
                    emptyText:
                      windLens === 'utci'
                        ? 'No significant wind discomfort.'
                        : 'No breezes outside ventilation limits.',
                  },
                ] as const;

                return (
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @sm:grid-cols-2 @sm:[grid-template-rows:minmax(0,1fr)]">
                    {cards.map(card => (
                      <section
                        key={card.key}
                        className={`flex h-full min-h-0 flex-col justify-between rounded-2xl p-3 ${softSectionBg}`}
                      >
                        <div className="shrink-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className={`inline-flex items-center gap-1.5 ${microLabel}`}>
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: card.dotColor }}
                                aria-hidden
                              />
                              <span>{card.title}</span>
                            </h3>
                            <span className={`text-[10px] tabular-nums ${muted}`}>
                              {card.bucket.hours.toLocaleString()} hrs
                            </span>
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                            <div className="flex items-baseline gap-1.5">
                              <span
                                className="text-xl font-bold leading-none tabular-nums @2xl:text-2xl"
                                style={{ color: card.textColor }}
                              >
                                {card.bucket.pctOfWindy.toFixed(1)}%
                              </span>
                              <span className={`text-[11px] ${muted}`}>of windy hrs</span>
                            </div>

                            {card.bucket.topDirections.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {card.bucket.topDirections.slice(0, 2).map(d => (
                                  <span
                                    key={d.label}
                                    title={`From ${d.label}: ${d.hours.toLocaleString()} hrs (${d.pct.toFixed(0)}%)`}
                                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                                      dark ? 'bg-gray-800 glow-sm' : 'bg-white glow-sm'
                                    }`}
                                    style={{ color: card.textColor }}
                                  >
                                    <span>{d.label}</span>
                                    <span className="font-normal opacity-75">{Math.round(d.pct)}%</span>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* Fluid Wind Rose adaptively filling all available vertical & horizontal card space */}
                        <div className="relative my-1.5 min-h-[120px] w-full flex-1">
                          {card.bucket.hours > 0 ? (
                            <MiniWindRose
                              bins={card.bucket.roseBins}
                              maxHours={card.bucket.maxBinHours}
                              color={card.dotColor}
                              dark={dark}
                              kindLabel={card.title}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <p className={`text-center text-xs ${muted}`}>{card.emptyText}</p>
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 space-y-1.5">
                          <dl className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 text-[11px] ${muted}`}>
                            {card.bucket.breakdown.map(row => (
                              <React.Fragment key={row.label}>
                                <dt className="truncate">{row.label}</dt>
                                <dd className={`font-semibold tabular-nums ${ink}`}>
                                  {row.hours.toLocaleString()} hrs
                                </dd>
                              </React.Fragment>
                            ))}
                          </dl>
                          <p className={`text-[10px] leading-snug ${muted}`}>
                            <span className={`font-semibold ${ink}`}>Criteria:</span> {card.bucket.criteriaText}
                          </p>
                        </div>
                      </section>
                    ))}
                  </div>
                );
              })()}
            </>
          ) : (
            <p className={`text-xs ${muted}`}>No wind data matches your current filters.</p>
          )
        ) : slot.type === 'explorer' ? (
          <>
            {parsedBlocks[0] ? renderMetricGroup(parsedBlocks[0], 'explorer-primary') : null}

            {explorerMonthlyByMonth ? (
              <section className={`rounded-2xl px-3 py-2.5 ${softSectionBg}`}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h3 className={microLabel}>Monthly high / avg / low</h3>
                  <span className={`truncate text-[11px] ${muted}`}>{explorerMonthlyByMonth.variableLabel}</span>
                </div>
                <div className="-mx-1 overflow-x-auto px-1">
                  <table className="w-full min-w-[14rem] border-separate border-spacing-0 text-left text-xs">
                    <thead>
                      <tr className={`text-[10px] uppercase tracking-wider ${muted}`}>
                        <th scope="col" className="px-2.5 pb-1 font-bold">
                          Month
                        </th>
                        <th scope="col" className="px-2.5 pb-1 text-right font-bold">
                          High
                        </th>
                        <th scope="col" className="px-2.5 pb-1 text-right font-bold">
                          Avg
                        </th>
                        <th scope="col" className="px-2.5 pb-1 text-right font-bold">
                          Low
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {explorerMonthlyByMonth.cells.map(cell => (
                        <tr
                          key={cell.abbr}
                          title={cell.title}
                          className={`[&>*:first-child]:rounded-l-full [&>*:last-child]:rounded-r-full ${
                            dark ? 'odd:bg-white/[0.04]' : 'odd:bg-slate-900/[0.025]'
                          }`}
                        >
                          <th scope="row" className={`px-2.5 py-1 font-semibold ${ink}`}>
                            {cell.abbr}
                          </th>
                          <td className={`px-2.5 py-1 text-right font-semibold tabular-nums ${ink}`}>{cell.high}</td>
                          <td className={`px-2.5 py-1 text-right tabular-nums ${muted}`}>{cell.avg}</td>
                          <td className={`px-2.5 py-1 text-right tabular-nums ${muted}`}>{cell.low}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <p className={`rounded-xl px-3 py-2 text-xs ${softSectionBg} ${muted}`}>
                Switch the chart to <span className={`font-semibold ${ink}`}>Month</span> view to see a 12-month High /
                Avg / Low breakdown here.
              </p>
            )}
          </>
        ) : (
          <>
            {parsedBlocks.slice(0, 2).map((block, bi) => renderMetricGroup(block, bi, parsedBlocks.length > 1))}
            {parsedBlocks.length > 2 && (
              <div>
                <button
                  type="button"
                  onClick={() => setMoreStatsOpen(v => !v)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold glow-sm transition-colors ${
                    dark ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-white text-gray-700 hover:text-gray-950'
                  }`}
                >
                  <span>{moreStatsOpen ? 'Hide extra stats' : `Show ${parsedBlocks.length - 2} more`}</span>
                  {moreStatsOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
                {moreStatsOpen && (
                  <div className="mt-2 flex flex-col gap-2">
                    {parsedBlocks.slice(2).map((block, bi) => renderMetricGroup(block, bi + 2, true))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Slide-out Guide Drawer (keeps explanatory prose out of the main view until needed) */}
      <div
        className={`absolute inset-0 z-20 transition-opacity duration-200 ${
          guideOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!guideOpen}
      >
        <button
          type="button"
          tabIndex={guideOpen ? 0 : -1}
          aria-label="Close guide drawer"
          onClick={() => setGuideOpen(false)}
          className="h-full w-full bg-black/15 backdrop-blur-[1px] dark:bg-black/35"
        />
      </div>

      <div
        id="tutorial-guide-drawer"
        role="dialog"
        aria-label={`${copy.chartTitle} guide`}
        aria-hidden={!guideOpen}
        data-tutorial-guide-keep-focus="true"
        className={`absolute inset-y-0 right-0 z-30 flex w-full max-w-[min(100%,26rem)] flex-col rounded-l-2xl glow-xl transition-transform duration-200 ease-out ${
          dark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
        } ${guideOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3.5 pb-2.5 @2xl:px-5">
          <div className="min-w-0">
            <p className={microLabel}>Chart guide</p>
            <h3 className={`truncate text-sm font-bold ${ink}`}>{copy.chartTitle}</h3>
          </div>
          <button
            type="button"
            tabIndex={guideOpen ? 0 : -1}
            onClick={() => setGuideOpen(false)}
            aria-label="Close guide"
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
              dark
                ? 'bg-gray-700/80 text-gray-300 hover:bg-gray-600 hover:text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 @2xl:px-5">
          <section className={`rounded-2xl p-3.5 ${softSectionBg}`}>
            <h4 className={`mb-1.5 ${microLabel}`}>What you&apos;re seeing</h4>
            <p className={`text-[13px] leading-relaxed ${ink}`}>{copy.overviewBody}</p>
          </section>

          {slot.type !== 'empty' ? (
            <section className={`rounded-2xl p-3.5 ${softSectionBg}`}>
              <h4 className={`mb-1.5 ${microLabel}`}>{copy.readingTitle}</h4>
              <p className={`text-[13px] leading-relaxed ${ink}`}>{copy.readingBody}</p>
            </section>
          ) : null}

          <section className={`rounded-2xl p-3.5 ${softSectionBg}`}>
            <h4 className={`mb-1.5 ${microLabel}`}>Data &amp; filters</h4>
            <p className={`text-xs leading-relaxed ${muted}`}>{methodologyNote}</p>
          </section>
        </div>
      </div>
    </aside>
  );
}
