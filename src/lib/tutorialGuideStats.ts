import * as d3 from 'd3';
import type { ChartType, UnitSystem } from '../App';
import type { TutorialLiveSnapshot } from '../context/TutorialLiveContext';
import type { GlobalFilterState } from './globalFilter';
import { rowPassesGlobalFilters } from './globalFilter';
import type { EPWDataRow } from './epwParser';
import { EPW_COLUMNS } from './epwParser';
import { explorerUsesDailyAvgBarExtents, meanDailyLowHighForRows } from './explorerBarExtents';
import { EXPLORER_MONTH_LABELS_SHORT } from './explorerChartSvgLayout';
import {
  computeNvFilteredStatsBundle,
  DEFAULT_NV_CRITERIA,
  formatNvCriteriaSummary,
} from './naturalVentilationModel';
import {
  computeUtciCategoryShares,
  computeUtciComfortMatrix,
  formatUtciCategoryLabel,
  getUtciComfortPeriodById,
  rowMatchesUtciComfortPeriod,
  type UtciCategoryShare,
  type UtciComfortMatrix,
  UTCI_COMFORT_CATEGORY,
} from './utciModel';

export type TutorialQuickStat = { label: string; value: string };

export type TutorialQuickStatBlock = { heading?: string; rows: TutorialQuickStat[] };

export type TutorialUtciQuickStats = {
  categoryShares: UtciCategoryShare[];
  comfortPercent: number;
  hoursCounted: number;
  comfortMatrix: UtciComfortMatrix;
  /** Set when the guided comfort table has a period selected. */
  isolationLabel: string | null;
};

export type TutorialNvQuickStats = {
  totalHours: number;
  presetStats: { id: string; shortLabel: string; suitableHours: number; suitablePct: number }[];
  activeBreakdown: ReturnType<typeof computeNvFilteredStatsBundle>['activeBreakdown'];
  activeCriteriaSummary: string;
};

function formatPercent(v: number, digits = 1): string {
  return Number.isFinite(v) ? `${v.toFixed(digits)} %` : '—';
}

const COLUMN = Object.fromEntries(EPW_COLUMNS.map(c => [c.id, c])) as Record<string, (typeof EPW_COLUMNS)[number]>;

function filterRows(rows: EPWDataRow[], filter: GlobalFilterState): EPWDataRow[] {
  return rows.filter(d => rowPassesGlobalFilters(d, filter));
}

function numericSeries(rows: EPWDataRow[], columnId: string): number[] {
  const meta = COLUMN[columnId];
  const missing = meta?.missing ?? 999999;
  const out: number[] = [];
  for (const r of rows) {
    const v = r[columnId];
    if (typeof v !== 'number' || Number.isNaN(v) || v === missing) continue;
    out.push(v);
  }
  return out;
}

function formatValue(v: number, unit: string, unitSystem: UnitSystem): string {
  let n = v;
  let u = unit;
  if (unitSystem === 'imperial') {
    if (unit === '°C') {
      n = (v * 9) / 5 + 32;
      u = '°F';
    } else if (unit === 'm/s') {
      n = v * 2.23694;
      u = 'mph';
    } else if (unit === 'mm') {
      n = v / 25.4;
      u = 'in';
    } else if (unit === 'km') {
      n = v * 0.621371;
      u = 'mi';
    }
  }
  const abs = Math.abs(n);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${n.toFixed(decimals)}${u ? ` ${u}` : ''}`;
}

function coreStats(vals: number[], unit: string, unitSystem: UnitSystem): TutorialQuickStat[] {
  if (!vals.length) return [{ label: 'Values', value: 'None in this filtered range.' }];
  const min = d3.min(vals)!;
  const max = d3.max(vals)!;
  const mean = d3.mean(vals)!;
  const median = d3.median(vals)!;
  const dev = d3.deviation(vals);
  const lines: TutorialQuickStat[] = [
    { label: 'Peak', value: formatValue(max, unit, unitSystem) },
    { label: 'Low', value: formatValue(min, unit, unitSystem) },
    { label: 'Average', value: formatValue(mean, unit, unitSystem) },
    { label: 'Median (middle timestep)', value: formatValue(median as number, unit, unitSystem) },
  ];
  if (dev != null && vals.length > 2 && Number.isFinite(dev) && dev > 0) {
    lines.push({ label: 'Typical day-to-day swing (std. dev.)', value: formatValue(dev, unit, unitSystem) });
  }
  lines.push({ label: 'Timesteps counted', value: String(vals.length) });
  return lines;
}

function blockForColumn(
  rows: EPWDataRow[],
  columnId: string,
  unitSystem: UnitSystem,
  heading?: string
): TutorialQuickStatBlock {
  const vals = numericSeries(rows, columnId);
  const meta = COLUMN[columnId];
  const unit = meta?.unit ?? '';
  const h = heading || meta?.name || columnId;
  return { heading: h, rows: coreStats(vals, unit, unitSystem) };
}

function windSpeedBlock(rows: EPWDataRow[], unitSystem: UnitSystem): TutorialQuickStatBlock {
  const vals = numericSeries(rows, 'windSpeed');
  const unit = 'm/s';
  return {
    heading: 'Wind speed (same hours as the chart)',
    rows: coreStats(vals, unit, unitSystem),
  };
}

/** One row per calendar month when guided panel matches Data Explorer month aggregation. */
export type TutorialMonthlyExplorerCell = {
  abbr: string;
  title: string;
  high: string;
  avg: string;
  low: string;
};

export type TutorialMonthlyExplorerTable = {
  variableLabel: string;
  cells: TutorialMonthlyExplorerCell[];
};

/** Returns 12 rows when chart is month aggregation; otherwise `null`. */
export function computeExplorerMonthlyByMonth(opts: {
  rows: EPWDataRow[] | undefined;
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  slotVariableId?: string;
  live: TutorialLiveSnapshot;
}): TutorialMonthlyExplorerTable | null {
  const { rows, filter, unitSystem, slotVariableId, live } = opts;
  if (live.aggregation !== 'month' || !rows?.length) return null;

  const columnId = live.colorVarId || slotVariableId || 'dryBulbTemperature';
  const meta = COLUMN[columnId];
  if (!meta) return null;

  const unit = meta.unit ?? '';
  const category = meta.category ?? '';
  const useDaily = explorerUsesDailyAvgBarExtents(columnId, category);
  const filtered = filterRows(rows, filter);
  const variableLabel = meta.name ?? columnId;

  const cells = [...EXPLORER_MONTH_LABELS_SHORT].map((abbr, mi) => {
    const month = mi + 1;
    const mrows = filtered.filter(r => r.month === month);
    if (!mrows.length) {
      const dash = '—';
      return { abbr, title: `${abbr}: no samples in filtered range`, high: dash, avg: dash, low: dash };
    }

    const nums = numericSeries(mrows, columnId);
    if (!nums.length) {
      const dash = '—';
      return { abbr, title: `${abbr}: no numeric values`, high: dash, avg: dash, low: dash };
    }

    const avgR = d3.mean(nums)!;
    let lowR = d3.min(nums)!;
    let highR = d3.max(nums)!;
    if (useDaily) {
      const ext = meanDailyLowHighForRows(mrows, columnId);
      if (ext) {
        lowR = ext.low;
        highR = ext.high;
      }
    }

    const lowS = formatValue(lowR, unit, unitSystem);
    const avgS = formatValue(avgR, unit, unitSystem);
    const highS = formatValue(highR, unit, unitSystem);

    return {
      abbr,
      title: `${abbr}: high ${highS} · average ${avgS} · low ${lowS} (${variableLabel}, filtered)`,
      high: highS,
      avg: avgS,
      low: lowS,
    };
  });

  return { variableLabel, cells };
}

export function computeTutorialGuideQuickStats(opts: {
  chartType: ChartType | 'empty';
  rows: EPWDataRow[] | undefined;
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  slotVariableId?: string;
  live: TutorialLiveSnapshot;
}): TutorialQuickStatBlock[] {
  const { chartType, rows, filter, unitSystem, slotVariableId, live } = opts;
  if (!rows?.length) return [];

  const filtered = filterRows(rows, filter);
  if (!filtered.length) {
    return [{ heading: undefined, rows: [{ label: 'Filtered range', value: 'No rows match your month/hour filters.' }] }];
  }

  if (chartType === 'empty') {
    return [blockForColumn(filtered, 'dryBulbTemperature', unitSystem, 'Air temperature in your file')];
  }

  if (chartType === 'explorer') {
    const id = live.colorVarId || slotVariableId || 'dryBulbTemperature';
    return [blockForColumn(filtered, id, unitSystem)];
  }

  if (chartType === 'sunpath') {
    const colorId = live.colorVarId || 'dryBulbTemperature';
    const radiusId = live.radiusVarId || 'globalHorizontalRadiation';
    const colorHeading = `Dot color · ${live.colorVarName || COLUMN[colorId]?.name || 'Variable'}`;
    const radiusHeading = `Dot radius · ${live.radiusVarName || COLUMN[radiusId]?.name || 'Variable'}`;
    return [
      blockForColumn(filtered, colorId, unitSystem, colorHeading),
      blockForColumn(filtered, radiusId, unitSystem, radiusHeading),
    ];
  }

  if (chartType === 'wind') {
    const colorId = live.colorVarId || 'dryBulbTemperature';
    return [windSpeedBlock(filtered, unitSystem), blockForColumn(filtered, colorId, unitSystem, `Color overlay · ${live.colorVarName || COLUMN[colorId]?.name || 'Variable'}`)];
  }

  if (chartType === 'windrose') {
    const colorId = live.colorVarId || 'windSpeed';
    return [
      {
        heading: 'Sample size',
        rows: [{ label: 'Filtered hours in the rose', value: String(filtered.length) }],
      },
      blockForColumn(filtered, colorId, unitSystem, `Petal color · ${live.colorVarName || COLUMN[colorId]?.name || 'Variable'}`),
    ];
  }

  if (chartType === 'naturalVentilation') {
    return [];
  }

  if (chartType === 'utci') {
    const includeSun = live.includeSun ?? true;
    const includeWind = live.includeWind ?? true;
    const { shares, comfortPercent, hoursCounted } = computeUtciCategoryShares(filtered, {
      includeSun,
      includeWind,
    });

    if (!hoursCounted) {
      return [
        {
          heading: 'UTCI stress categories',
          rows: [{ label: 'Filtered range', value: 'No hours match your month/hour filters.' }],
        },
      ];
    }

    const categoryRows: TutorialQuickStat[] = shares.map(s => ({
      label: s.label,
      value: formatPercent(s.percentage),
    }));

    return [
      {
        heading: 'Time in comfort (no thermal stress)',
        rows: [{ label: 'Share of filtered hours', value: formatPercent(comfortPercent) }],
      },
      {
        heading: 'UTCI stress categories (% of filtered hours)',
        rows: categoryRows,
      },
    ];
  }

  return [blockForColumn(filtered, 'dryBulbTemperature', unitSystem)];
}

/** Natural ventilation preset comparison + active-criteria breakdown for guided details panel. */
export function computeTutorialNvQuickStats(opts: {
  rows: EPWDataRow[] | undefined;
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  live: TutorialLiveSnapshot;
}): TutorialNvQuickStats | null {
  const { rows, filter, unitSystem, live } = opts;
  if (!rows?.length) return null;

  const activeCriteria = live.nvCriteria ?? DEFAULT_NV_CRITERIA;
  const bundle = computeNvFilteredStatsBundle(rows, filter, activeCriteria);
  if (!bundle.totalHours) return null;

  return {
    totalHours: bundle.totalHours,
    presetStats: bundle.presetStats,
    activeBreakdown: bundle.activeBreakdown,
    activeCriteriaSummary: formatNvCriteriaSummary(activeCriteria, unitSystem),
  };
}

/** UTCI category breakdown + comfort table for guided Outdoor comfort panel. */
export function computeTutorialUtciQuickStats(opts: {
  rows: EPWDataRow[] | undefined;
  filter: GlobalFilterState;
  live: TutorialLiveSnapshot;
}): TutorialUtciQuickStats | null {
  const { rows, filter, live } = opts;
  if (!rows?.length) return null;

  const globallyFiltered = filterRows(rows, filter);
  if (!globallyFiltered.length) return null;

  const focusPeriod = getUtciComfortPeriodById(live.utciFocusPeriodId);
  const shareRows = focusPeriod
    ? globallyFiltered.filter(row => rowMatchesUtciComfortPeriod(row, focusPeriod, filter))
    : globallyFiltered;

  const includeSun = live.includeSun ?? true;
  const includeWind = live.includeWind ?? true;
  const modelOpts = { includeSun, includeWind };

  const { shares, comfortPercent, hoursCounted } = computeUtciCategoryShares(shareRows, modelOpts);
  const comfortMatrix = computeUtciComfortMatrix(rows, filter);

  return {
    categoryShares: shares,
    comfortPercent,
    hoursCounted,
    comfortMatrix,
    isolationLabel: focusPeriod?.label ?? null,
  };
}

export { formatUtciCategoryLabel, UTCI_COMFORT_CATEGORY };
