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
  rowSuitableForNaturalVentilation,
} from './naturalVentilationModel';
import {
  computeOptimizedUtciCategoryShares,
  computeUtciCategoryShares,
  computeUtciComfortMatrix,
  computeUtciWindEffectForRow,
  formatUtciCategoryLabel,
  getUtciComfortPeriodById,
  rowMatchesUtciComfortPeriod,
  type UtciCategoryShare,
  type UtciComfortMatrix,
  type UtciEnvironment,
  UTCI_COMFORT_CATEGORY,
} from './utciModel';
import { GROUND_PRESETS, LADYBUG_GROUND, buildSurfaceTemperatureLookup, realizeGround, surfaceTemperatureForRow } from './groundComfort';
import { convertUnit, convertValue } from './unitConversion';

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

export type WindDirectionSummary = {
  label: string;
  deg: number;
  hours: number;
  pct: number;
  avgSpeedFormatted: string;
};

export type WindRoseMiniBin = {
  label: string;
  deg: number;
  hours: number;
  pct: number;
};

export type WindImpactBucket = {
  hours: number;
  pctOfWindy: number;
  maxBinHours: number;
  topDirections: { label: string; deg: number; pct: number; hours: number }[];
  roseBins: WindRoseMiniBin[];
  breakdown: { label: string; hours: number }[];
  criteriaText: string;
};

export type TutorialWindInsights = {
  totalHours: number;
  windyHours: number;
  calmHours: number;
  calmPct: number;
  avgSpeed: string;
  peakSpeed: string;
  calmThresholdLabel: string;
  predominant: WindDirectionSummary[];
  utci: {
    helpful: WindImpactBucket;
    harmful: WindImpactBucket;
  };
  nv: {
    helpful: WindImpactBucket;
    harmful: WindImpactBucket;
  };
  overlaySummary: {
    variableName: string;
    high: string;
    avg: string;
    low: string;
  } | null;
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

function formatValue(v: number, unit: string, unitSystem: UnitSystem, isDelta = false): string {
  const n = convertValue(v, unit, unitSystem, isDelta);
  const u = convertUnit(unit, unitSystem);
  if (!Number.isFinite(n)) return '—';
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
    lines.push({ label: 'Hourly spread (std. dev.)', value: formatValue(dev, unit, unitSystem, true) });
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
    const { shares, comfortPercent, hoursCounted } =
      live.optimizeMode === true
        ? computeOptimizedUtciCategoryShares(filtered)
        : computeUtciCategoryShares(filtered, { includeSun, includeWind });

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
function utciEnvFromLive(
  live: TutorialLiveSnapshot,
  site: UtciEnvironment['site'],
  rows: EPWDataRow[]
): UtciEnvironment {
  const named = [LADYBUG_GROUND, ...GROUND_PRESETS].find(p => p.label === live.utciGroundLabel);
  const picked = named ?? {
    ...LADYBUG_GROUND,
    id: 'live',
    label: live.utciGroundLabel ?? LADYBUG_GROUND.label,
    solarReflectance: live.utciGroundReflectance ?? LADYBUG_GROUND.solarReflectance,
    emissivity: live.utciGroundEmissivity ?? LADYBUG_GROUND.emissivity,
    irrigation: live.utciGroundIrrigation,
    thicknessM: live.utciGroundThicknessM,
    volumetricHeat: live.utciGroundVolumetricHeat,
    conductivity: live.utciGroundConductivity,
  };
  const withEdits = realizeGround({
    ...picked,
    solarReflectance: live.utciGroundReflectance ?? picked.solarReflectance,
    emissivity: live.utciGroundEmissivity ?? picked.emissivity,
    irrigation: live.utciGroundIrrigation ?? picked.irrigation,
    thicknessM: live.utciGroundThicknessM ?? picked.thicknessM,
    volumetricHeat: live.utciGroundVolumetricHeat ?? picked.volumetricHeat,
    conductivity: live.utciGroundConductivity ?? picked.conductivity,
  });
  const ground =
    live.utciRadiantMode === 'surface'
      ? withEdits
      : live.utciRadiantMode === 'reflectance'
        ? { ...withEdits, irrigation: 0, evaporates: false, heatCapacity: 0 }
        : LADYBUG_GROUND;
  const lookupSun = live.utciRadiantMode === 'surface' ? buildSurfaceTemperatureLookup(rows, ground, 'full') : null;
  const lookupShade = live.utciRadiantMode === 'surface' ? buildSurfaceTemperatureLookup(rows, ground, 'diffuse') : null;
  return {
    radiantMode: live.utciRadiantMode === 'station' || live.utciRadiantMode == null ? 'station' : 'reflectance',
    site: site ?? null,
    ground,
    surfaceTempForRow:
      lookupSun && lookupShade
        ? (row, sunlitGround) => surfaceTemperatureForRow(sunlitGround ? lookupSun : lookupShade, row)
        : null,
  };
}

export function computeTutorialUtciQuickStats(opts: {
  rows: EPWDataRow[] | undefined;
  filter: GlobalFilterState;
  live: TutorialLiveSnapshot;
  siteLatitude?: number | null;
  siteLng?: number | null;
  siteTimeZone?: number | null;
}): TutorialUtciQuickStats | null {
  const { rows, filter, live, siteLatitude = null, siteLng = null, siteTimeZone = null } = opts;
  if (!rows?.length) return null;

  const globallyFiltered = filterRows(rows, filter);
  if (!globallyFiltered.length) return null;

  const focusPeriod = getUtciComfortPeriodById(live.utciFocusPeriodId);
  const shareRows = focusPeriod
    ? globallyFiltered.filter(row =>
        rowMatchesUtciComfortPeriod(row, focusPeriod, filter, siteLatitude)
      )
    : globallyFiltered;

  const includeSun = live.includeSun ?? true;
  const includeWind = live.includeWind ?? true;
  const optimizeMode = live.optimizeMode === true;
  const site =
    siteLatitude != null &&
    siteLng != null &&
    siteTimeZone != null &&
    Number.isFinite(siteLatitude) &&
    Number.isFinite(siteLng) &&
    Number.isFinite(siteTimeZone)
      ? { lat: siteLatitude, lng: siteLng, timeZone: siteTimeZone }
      : null;
  const env = utciEnvFromLive(live, site, rows);
  const { shares, comfortPercent, hoursCounted } = optimizeMode
    ? computeOptimizedUtciCategoryShares(shareRows, env)
    : computeUtciCategoryShares(shareRows, { ...env, includeSun, includeWind });
  const comfortMatrix = computeUtciComfortMatrix(rows, filter, siteLatitude, env);

  return {
    categoryShares: shares,
    comfortPercent,
    hoursCounted,
    comfortMatrix,
    isolationLabel: focusPeriod?.label ?? null,
  };
}

const COMPASS_8 = [
  { label: 'N', deg: 0 },
  { label: 'NE', deg: 45 },
  { label: 'E', deg: 90 },
  { label: 'SE', deg: 135 },
  { label: 'S', deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270 },
  { label: 'NW', deg: 315 },
] as const;

const COMPASS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

const CALM_WIND_THRESHOLD_MS = 0.5;
const UTCI_WIND_IMPACT_DELTA_C = 0.5;

function utciStressDistance(utciC: number): number {
  if (utciC < 9) return 9 - utciC;
  if (utciC > 26) return utciC - 26;
  return 0;
}

/**
 * Computes predominant wind directions plus physics-backed helpful (cooling comfort relief &
 * natural ventilation) and harmful (cold wind chill & hot convective stress) wind insights.
 */
export function computeTutorialWindInsights(opts: {
  rows: EPWDataRow[] | undefined;
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  live: TutorialLiveSnapshot;
  siteLatitude?: number | null;
  siteLng?: number | null;
  siteTimeZone?: number | null;
}): TutorialWindInsights | null {
  const { rows, filter, unitSystem, live, siteLatitude = null, siteLng = null, siteTimeZone = null } = opts;
  if (!rows?.length) return null;

  const filtered = filterRows(rows, filter);
  if (!filtered.length) return null;

  const site =
    siteLatitude != null &&
    siteLng != null &&
    siteTimeZone != null &&
    Number.isFinite(siteLatitude) &&
    Number.isFinite(siteLng) &&
    Number.isFinite(siteTimeZone)
      ? { lat: siteLatitude, lng: siteLng, timeZone: siteTimeZone }
      : null;
  const env: UtciEnvironment = { radiantMode: 'station', site };

  const sectors = COMPASS_8.map(s => ({
    label: s.label,
    deg: s.deg,
    hours: 0,
    speedSum: 0,
    utciHelpful: 0,
    utciHarmful: 0,
    nvHelpful: 0,
    nvHarmful: 0,
  }));

  const rose16 = COMPASS_16.map((label, idx) => ({
    label,
    deg: idx * 22.5,
    utciHelpful: 0,
    utciHarmful: 0,
    nvHelpful: 0,
    nvHarmful: 0,
  }));

  let totalHours = 0;
  let calmHours = 0;
  let windyHours = 0;
  let speedSum = 0;
  let peakSpeedVal = 0;

  let utciHelpfulHours = 0;
  let utciHelpfulIntoComfort = 0;
  let utciHarmfulHours = 0;
  let utciColdStressHours = 0;
  let utciHeatStressHours = 0;

  let nvHelpfulHours = 0;
  let nvHarmfulHours = 0;
  let nvTempFailHours = 0;
  let nvHumidityFailHours = 0;

  const missingSpeed = COLUMN.windSpeed?.missing ?? 999;
  const missingDir = COLUMN.windDirection?.missing ?? 999;

  for (const row of filtered) {
    const spd = row.windSpeed as number;
    if (typeof spd !== 'number' || Number.isNaN(spd) || spd === missingSpeed || spd < 0) continue;

    totalHours += 1;
    speedSum += spd;
    if (spd > peakSpeedVal) peakSpeedVal = spd;

    if (spd < CALM_WIND_THRESHOLD_MS) {
      calmHours += 1;
      continue;
    }

    const dir = row.windDirection as number;
    const validDir = typeof dir === 'number' && !Number.isNaN(dir) && dir !== missingDir && dir >= 0 && dir <= 360;
    const normDir = validDir ? ((dir % 360) + 360) % 360 : -1;
    const sectorIdx = validDir ? Math.floor((normDir + 22.5) / 45) % 8 : -1;
    const roseIdx = validDir ? Math.floor((normDir + 11.25) / 22.5) % 16 : -1;

    windyHours += 1;
    if (sectorIdx >= 0) {
      sectors[sectorIdx].hours += 1;
      sectors[sectorIdx].speedSum += spd;
    }

    // Lens 1: Outdoor Comfort (UTCI) wind effect
    const effect = computeUtciWindEffectForRow(row, env);
    if (effect) {
      const dWind = utciStressDistance(effect.utciWithWind);
      const dCalm = utciStressDistance(effect.utciSheltered);
      const delta = dWind - dCalm;
      if (delta <= -UTCI_WIND_IMPACT_DELTA_C) {
        utciHelpfulHours += 1;
        if (dWind === 0) utciHelpfulIntoComfort += 1;
        if (sectorIdx >= 0) sectors[sectorIdx].utciHelpful += 1;
        if (roseIdx >= 0) rose16[roseIdx].utciHelpful += 1;
      } else if (delta >= UTCI_WIND_IMPACT_DELTA_C) {
        utciHarmfulHours += 1;
        if (effect.utciWithWind < 9) utciColdStressHours += 1;
        else if (effect.utciWithWind > 26) utciHeatStressHours += 1;
        if (sectorIdx >= 0) sectors[sectorIdx].utciHarmful += 1;
        if (roseIdx >= 0) rose16[roseIdx].utciHarmful += 1;
      }
    }

    // Lens 2: Natural Ventilation suitability
    const nvSuitable = rowSuitableForNaturalVentilation(row, DEFAULT_NV_CRITERIA);
    if (nvSuitable === true) {
      nvHelpfulHours += 1;
      if (sectorIdx >= 0) sectors[sectorIdx].nvHelpful += 1;
      if (roseIdx >= 0) rose16[roseIdx].nvHelpful += 1;
    } else if (nvSuitable === false) {
      nvHarmfulHours += 1;
      const tdb = row.dryBulbTemperature as number;
      const rh = row.relativeHumidity as number;
      if (Number.isFinite(tdb) && (tdb < DEFAULT_NV_CRITERIA.tempMinC || tdb > DEFAULT_NV_CRITERIA.tempMaxC)) {
        nvTempFailHours += 1;
      }
      if (Number.isFinite(rh) && rh > DEFAULT_NV_CRITERIA.maxRhPct) {
        nvHumidityFailHours += 1;
      }
      if (sectorIdx >= 0) sectors[sectorIdx].nvHarmful += 1;
      if (roseIdx >= 0) rose16[roseIdx].nvHarmful += 1;
    }
  }

  if (!totalHours) return null;

  const directedWindyHours = sectors.reduce((acc, s) => acc + s.hours, 0);
  const predominant: WindDirectionSummary[] = [...sectors]
    .filter(s => s.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 3)
    .map(s => ({
      label: s.label,
      deg: s.deg,
      hours: s.hours,
      pct: directedWindyHours > 0 ? (s.hours / directedWindyHours) * 100 : 0,
      avgSpeedFormatted: formatValue(s.speedSum / s.hours, 'm/s', unitSystem),
    }));

  const buildBucket = (
    bucketHours: number,
    sectorKey: 'utciHelpful' | 'utciHarmful' | 'nvHelpful' | 'nvHarmful',
    breakdown: { label: string; hours: number }[],
    criteriaText: string
  ): WindImpactBucket => {
    const topDirections = [...sectors]
      .filter(s => s[sectorKey] > 0)
      .sort((a, b) => b[sectorKey] - a[sectorKey])
      .slice(0, 3)
      .map(s => ({
        label: s.label,
        deg: s.deg,
        hours: s[sectorKey],
        pct: bucketHours > 0 ? (s[sectorKey] / bucketHours) * 100 : 0,
      }));

    const roseBins: WindRoseMiniBin[] = rose16.map(b => ({
      label: b.label,
      deg: b.deg,
      hours: b[sectorKey],
      pct: bucketHours > 0 ? (b[sectorKey] / bucketHours) * 100 : 0,
    }));

    const maxBinHours = Math.max(1, ...roseBins.map(b => b.hours));

    return {
      hours: bucketHours,
      pctOfWindy: windyHours > 0 ? (bucketHours / windyHours) * 100 : 0,
      maxBinHours,
      topDirections,
      roseBins,
      breakdown,
      criteriaText,
    };
  };

  // Optional compact summary when the chart's color overlay is a non-wind-speed variable
  let overlaySummary: TutorialWindInsights['overlaySummary'] = null;
  const colorId = live.colorVarId;
  if (colorId && colorId !== 'windSpeed') {
    const vals = numericSeries(filtered, colorId);
    const meta = COLUMN[colorId];
    if (vals.length && meta) {
      overlaySummary = {
        variableName: live.colorVarName || meta.name || colorId,
        high: formatValue(d3.max(vals)!, meta.unit ?? '', unitSystem),
        avg: formatValue(d3.mean(vals)!, meta.unit ?? '', unitSystem),
        low: formatValue(d3.min(vals)!, meta.unit ?? '', unitSystem),
      };
    }
  }

  const utciHelpfulCriteria =
    unitSystem === 'imperial'
      ? 'Wind lowers UTCI heat stress by ≥ 0.9 °F toward comfort (48–79 °F).'
      : 'Wind lowers UTCI heat stress by ≥ 0.5 °C toward comfort (9–26 °C).';

  const utciHarmfulCriteria =
    unitSystem === 'imperial'
      ? 'Wind increases UTCI cold (< 48 °F) or heat (> 79 °F) stress by ≥ 0.9 °F.'
      : 'Wind increases UTCI cold (< 9 °C) or heat (> 26 °C) stress by ≥ 0.5 °C.';

  const nvHelpfulCriteria =
    unitSystem === 'imperial'
      ? 'Breeze arrives while outdoor air is within 60–80 °F and ≤ 70% RH.'
      : 'Breeze arrives while outdoor air is within 15.6–26.7 °C and ≤ 70% RH.';

  const nvHarmfulCriteria =
    unitSystem === 'imperial'
      ? 'Breeze arrives outside 60–80 °F or above 70% RH (draft / moisture risk).'
      : 'Breeze arrives outside 15.6–26.7 °C or above 70% RH (draft / moisture risk).';

  return {
    totalHours,
    windyHours,
    calmHours,
    calmPct: (calmHours / totalHours) * 100,
    avgSpeed: formatValue(speedSum / totalHours, 'm/s', unitSystem),
    peakSpeed: formatValue(peakSpeedVal, 'm/s', unitSystem),
    calmThresholdLabel:
      unitSystem === 'imperial'
        ? `< ${convertValue(CALM_WIND_THRESHOLD_MS, 'm/s', 'imperial').toFixed(1)} mph`
        : `< ${CALM_WIND_THRESHOLD_MS} m/s`,
    predominant,
    utci: {
      helpful: buildBucket(
        utciHelpfulHours,
        'utciHelpful',
        [
          { label: 'Brings into comfort', hours: utciHelpfulIntoComfort },
          { label: 'Reduces heat stress', hours: Math.max(0, utciHelpfulHours - utciHelpfulIntoComfort) },
        ],
        utciHelpfulCriteria
      ),
      harmful: buildBucket(
        utciHarmfulHours,
        'utciHarmful',
        [
          { label: 'Cold wind chill', hours: utciColdStressHours },
          { label: 'Hot stress wind', hours: utciHeatStressHours },
        ],
        utciHarmfulCriteria
      ),
    },
    nv: {
      helpful: buildBucket(
        nvHelpfulHours,
        'nvHelpful',
        [{ label: 'Temp & RH in range', hours: nvHelpfulHours }],
        nvHelpfulCriteria
      ),
      harmful: buildBucket(
        nvHarmfulHours,
        'nvHarmful',
        [
          { label: 'Temp out of range', hours: nvTempFailHours },
          { label: 'Humidity > 70% RH', hours: nvHumidityFailHours },
        ],
        nvHarmfulCriteria
      ),
    },
    overlaySummary,
  };
}

export { formatUtciCategoryLabel, UTCI_COMFORT_CATEGORY };
