// @ts-ignore
import tc from 'jsthermalcomfort';
import type { EPWDataRow } from './epwParser';
import { utciGradientExtentC } from './unitConversion';
import type { GlobalFilterState, HeatmapCellStatistic } from './globalFilter';
import { aggregateCellStatistic, rowPassesDryBulbTemperature } from './globalFilter';
import { OUTDOOR_COMFORT_GREEN_HEX, OUTDOOR_COMFORT_GREEN_RGB } from './constants';
import {
  ASTRONOMICAL_SEASON_LABELS,
  astronomicalSeasonDaySegments,
  dateInAstronomicalSeason,
  hemisphereFromLatitude,
  monthOverlapsAstronomicalSeason,
  type AstronomicalSeason,
  type Hemisphere,
} from './seasons';

export const UTCI_COLORS: Record<string, string> = {
  'extreme cold stress': '#000033',
  'very strong cold stress': '#000099',
  'strong cold stress': '#0000ff',
  'moderate cold stress': '#0066ff',
  'slight cold stress': '#00ccff',
  'no thermal stress': OUTDOOR_COMFORT_GREEN_HEX,
  'moderate heat stress': '#ffcc00',
  'strong heat stress': '#ff6600',
  'very strong heat stress': '#ff0000',
  'extreme heat stress': '#800000',
};

export const UTCI_CATEGORY_ORDER = Object.keys(UTCI_COLORS);

export const UTCI_COMFORT_CATEGORY = 'no thermal stress';

/**
 * Official UTCI assessment scale (range bins), not nearest-threshold.
 * Do not use `jsthermalcomfort`'s `stress_category`: its mapper picks the nearest
 * boundary label, so e.g. UTCI 15°C (true comfort) is mislabeled "slight cold stress".
 */
export function getUtciCategoryForValue(val: number): string {
  if (!Number.isFinite(val)) return 'slight cold stress';
  if (val < -40) return 'extreme cold stress';
  if (val < -27) return 'very strong cold stress';
  if (val < -13) return 'strong cold stress';
  if (val < 0) return 'moderate cold stress';
  if (val < 9) return 'slight cold stress';
  if (val <= 26) return UTCI_COMFORT_CATEGORY;
  if (val <= 32) return 'moderate heat stress';
  if (val <= 38) return 'strong heat stress';
  if (val <= 46) return 'very strong heat stress';
  return 'extreme heat stress';
}

export function formatUtciCategoryLabel(category: string): string {
  if (category === UTCI_COMFORT_CATEGORY) return 'No thermal stress (comfort)';
  return category.replace(/\b\w/g, c => c.toUpperCase());
}

export function computeUtciForEpwRow(
  row: EPWDataRow,
  opts: { includeSun?: boolean; includeWind?: boolean } = {}
): { utci: number; category: string; isComfortable: boolean } | null {
  const includeSun = opts.includeSun ?? true;
  const includeWind = opts.includeWind ?? true;

  const tdb = row.dryBulbTemperature as number;
  const rh = row.relativeHumidity as number;
  const windSpeed = row.windSpeed as number;
  const ghr = row.globalHorizontalRadiation as number;
  if ([tdb, rh, windSpeed, ghr].some(v => v == null || Number.isNaN(v))) return null;

  const v = includeWind ? Math.max(0.5, windSpeed) : 0.5;
  const tr = includeSun ? tdb + 0.02 * Math.max(0, ghr) : tdb;

  let utciVal = tdb;
  try {
    // Numeric UTCI only — never use library stress_category (nearest-threshold bug).
    const result = tc.models.utci(tdb, tr, v, rh, 'SI', false, false);
    const u = typeof result === 'number' ? result : result?.utci;
    if (Number.isFinite(u)) {
      utciVal = u as number;
    }
  } catch {
    // keep dry-bulb fallback
  }

  const category = getUtciCategoryForValue(utciVal);
  return {
    utci: utciVal,
    category,
    isComfortable: category === UTCI_COMFORT_CATEGORY,
  };
}

function monthInGlobalRange(month: number, f: GlobalFilterState): boolean {
  if (f.startMonth <= f.endMonth) {
    return month >= f.startMonth && month <= f.endMonth;
  }
  return month >= f.startMonth || month <= f.endMonth;
}

function hourInIntersectedRange(
  hour: number,
  periodStart: number,
  periodEndInclusive: number,
  f: GlobalFilterState
): boolean {
  const start = Math.max(periodStart, f.startHour);
  const end = Math.min(periodEndInclusive, f.endHour);
  if (start > end) return false;
  return hour >= start && hour <= end;
}

export type UtciComfortPeriodDef = {
  id: string;
  label: string;
  /**
   * Astronomical season (equinox/solstice bounds), or all days in the global filter.
   * See `src/lib/seasons.ts` — not meteorological Mar–May style month blocks.
   */
  season: AstronomicalSeason | 'all';
  startHour: number;
  endHour: number;
};

export type UtciExposureScenario = {
  id: string;
  label: string;
  shortLabel: string;
  includeSun: boolean;
  includeWind: boolean;
};

/** Column order for guided comfort table (matches chart sun/wind toggles). */
export const UTCI_EXPOSURE_SCENARIOS: UtciExposureScenario[] = [
  {
    id: 'exposed',
    label: 'Exposed to Sun and Wind',
    shortLabel: 'Sun + wind',
    includeSun: true,
    includeWind: true,
  },
  {
    id: 'protected-sun',
    label: 'Protected from Sun',
    shortLabel: 'No sun',
    includeSun: false,
    includeWind: true,
  },
  {
    id: 'protected-wind',
    label: 'Protected from Wind',
    shortLabel: 'No wind',
    includeSun: true,
    includeWind: false,
  },
  {
    id: 'protected-both',
    label: 'Protected from Sun & Wind',
    shortLabel: 'Sheltered',
    includeSun: false,
    includeWind: false,
  },
];

export function utciExposureScenarioIndex(includeSun: boolean, includeWind: boolean): number {
  const idx = UTCI_EXPOSURE_SCENARIOS.findIndex(
    s => s.includeSun === includeSun && s.includeWind === includeWind
  );
  return idx === -1 ? 0 : idx;
}

export const UTCI_COMFORT_PERIOD_ROWS: UtciComfortPeriodDef[] = [
  { id: 'annual-24h', label: 'Annual (24 hour)', season: 'all', startHour: 0, endHour: 23 },
  { id: 'annual-7-18', label: 'Annual 7am–6pm', season: 'all', startHour: 7, endHour: 18 },
  {
    id: 'spring-7-18',
    label: `${ASTRONOMICAL_SEASON_LABELS.spring} 7am–6pm`,
    season: 'spring',
    startHour: 7,
    endHour: 18,
  },
  {
    id: 'summer-7-18',
    label: `${ASTRONOMICAL_SEASON_LABELS.summer} 7am–6pm`,
    season: 'summer',
    startHour: 7,
    endHour: 18,
  },
  {
    id: 'fall-7-18',
    label: `${ASTRONOMICAL_SEASON_LABELS.fall} 7am–6pm`,
    season: 'fall',
    startHour: 7,
    endHour: 18,
  },
  {
    id: 'winter-7-18',
    label: `${ASTRONOMICAL_SEASON_LABELS.winter} 7am–6pm`,
    season: 'winter',
    startHour: 7,
    endHour: 18,
  },
  { id: 'annual-7-10', label: 'Annual 7am–10am', season: 'all', startHour: 7, endHour: 10 },
  { id: 'annual-11-14', label: 'Annual 11am–2pm', season: 'all', startHour: 11, endHour: 14 },
  { id: 'annual-15-18', label: 'Annual 3pm–6pm', season: 'all', startHour: 15, endHour: 18 },
];

export function getUtciComfortPeriodById(id: string | null | undefined): UtciComfortPeriodDef | undefined {
  if (!id) return undefined;
  return UTCI_COMFORT_PERIOD_ROWS.find(p => p.id === id);
}

function resolveHemisphere(siteLatitude?: number | null): Hemisphere {
  return hemisphereFromLatitude(siteLatitude);
}

function rowInPeriodSeason(
  row: EPWDataRow,
  period: UtciComfortPeriodDef,
  hemisphere: Hemisphere
): boolean {
  if (period.season === 'all') return true;
  return dateInAstronomicalSeason(
    row.month as number,
    row.day as number,
    period.season,
    hemisphere
  );
}

/** Heatmap month/hour slot (no dry-bulb check). Month dims if it overlaps the season. */
export function heatmapSlotInUtciComfortPeriod(
  month: number,
  hour: number,
  period: UtciComfortPeriodDef,
  filter: GlobalFilterState,
  siteLatitude?: number | null
): boolean {
  if (!monthInGlobalRange(month, filter)) return false;
  if (
    period.season !== 'all' &&
    !monthOverlapsAstronomicalSeason(month, period.season, resolveHemisphere(siteLatitude))
  ) {
    return false;
  }
  return hourInIntersectedRange(hour, period.startHour, period.endHour, filter);
}

export type UtciPeriodHeatmapBounds = {
  /** One or two day spans (end exclusive). Winter wraps the year. */
  segments: { startDay: number; endDay: number }[];
  startHour: number;
  endHour: number;
};

/** Day/hour bounds for a black focus outline on the heatmap (supports wrap-around seasons). */
export function utciPeriodHeatmapBounds(
  rows: EPWDataRow[],
  period: UtciComfortPeriodDef,
  filter: GlobalFilterState,
  siteLatitude?: number | null
): UtciPeriodHeatmapBounds | null {
  const startHour = Math.max(period.startHour, filter.startHour);
  const endHour = Math.min(period.endHour, filter.endHour);
  if (startHour > endHour) return null;

  const hemisphere = resolveHemisphere(siteLatitude);

  if (period.season === 'all') {
    let startDay = 366;
    let endDay = 0;
    for (const row of rows) {
      const m = row.month as number;
      const d = row.dayOfYear as number;
      if (!monthInGlobalRange(m, filter) || d == null || Number.isNaN(d)) continue;
      if (d < startDay) startDay = d;
      if (d + 1 > endDay) endDay = d + 1;
    }
    if (startDay > endDay) return null;
    return { segments: [{ startDay, endDay }], startHour, endHour };
  }

  const nominal = astronomicalSeasonDaySegments(period.season, hemisphere);
  const segments: { startDay: number; endDay: number }[] = [];

  for (const seg of nominal) {
    let startDay = 366;
    let endDay = 0;
    let any = false;
    for (const row of rows) {
      const m = row.month as number;
      const d = row.dayOfYear as number;
      if (!monthInGlobalRange(m, filter) || d == null || Number.isNaN(d)) continue;
      if (d < seg.startDay || d >= seg.endDayExclusive) continue;
      if (!dateInAstronomicalSeason(m, row.day as number, period.season, hemisphere)) continue;
      any = true;
      if (d < startDay) startDay = d;
      if (d + 1 > endDay) endDay = d + 1;
    }
    if (any && startDay < endDay) {
      segments.push({ startDay, endDay });
    }
  }

  if (!segments.length) return null;
  return { segments, startHour, endHour };
}

export function rowMatchesUtciComfortPeriod(
  row: EPWDataRow,
  period: UtciComfortPeriodDef,
  filter: GlobalFilterState,
  siteLatitude?: number | null
): boolean {
  if (!rowPassesDryBulbTemperature(row, filter)) return false;
  if (!monthInGlobalRange(row.month as number, filter)) return false;
  if (!rowInPeriodSeason(row, period, resolveHemisphere(siteLatitude))) return false;
  return hourInIntersectedRange(row.hour as number, period.startHour, period.endHour, filter);
}

export type UtciCategoryShare = {
  category: string;
  label: string;
  percentage: number;
  color: string;
  isComfort: boolean;
};

export function computeUtciCategoryShares(
  rows: EPWDataRow[],
  opts: { includeSun?: boolean; includeWind?: boolean }
): { shares: UtciCategoryShare[]; comfortPercent: number; hoursCounted: number } {
  const counts = new Map<string, number>();
  let comfortN = 0;
  let total = 0;

  for (const row of rows) {
    const utci = computeUtciForEpwRow(row, opts);
    if (!utci) continue;
    total += 1;
    counts.set(utci.category, (counts.get(utci.category) ?? 0) + 1);
    if (utci.isComfortable) comfortN += 1;
  }

  if (!total) {
    return { shares: [], comfortPercent: NaN, hoursCounted: 0 };
  }

  const shares: UtciCategoryShare[] = UTCI_CATEGORY_ORDER.map(category => ({
    category,
    label: formatUtciCategoryLabel(category),
    percentage: ((counts.get(category) ?? 0) / total) * 100,
    color: UTCI_COLORS[category] ?? '#cccccc',
    isComfort: category === UTCI_COMFORT_CATEGORY,
  }));

  return {
    shares,
    comfortPercent: (comfortN / total) * 100,
    hoursCounted: total,
  };
}

export type UtciComfortMatrixCell = {
  percentComfort: number;
  hoursCounted: number;
};

export type UtciComfortMatrix = {
  periods: { id: string; label: string }[];
  scenarios: UtciExposureScenario[];
  /** [periodIndex][scenarioIndex] */
  cells: UtciComfortMatrixCell[][];
};

/** Matches UTCI chart “comfort time” scale: grey (0%) → outdoor comfort green (100%). */
export function comfortPercentHeatStyle(
  percent: number,
  theme: 'light' | 'dark'
): { backgroundColor: string; color: string } {
  if (!Number.isFinite(percent)) {
    return {
      backgroundColor: theme === 'dark' ? '#1f2937' : '#e5e7eb',
      color: theme === 'dark' ? '#9ca3af' : '#6b7280',
    };
  }
  const t = Math.max(0, Math.min(1, percent / 100));
  const low = theme === 'dark' ? { r: 55, g: 65, b: 81 } : { r: 243, g: 244, b: 246 };
  const high = OUTDOOR_COMFORT_GREEN_RGB;
  const r = Math.round(low.r + (high.r - low.r) * t);
  const g = Math.round(low.g + (high.g - low.g) * t);
  const b = Math.round(low.b + (high.b - low.b) * t);
  const backgroundColor = `rgb(${r}, ${g}, ${b})`;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const color = luminance > 150 ? '#111827' : '#f9fafb';
  return { backgroundColor, color };
}

export function computeUtciComfortMatrix(
  rows: EPWDataRow[],
  filter: GlobalFilterState,
  siteLatitude?: number | null
): UtciComfortMatrix {
  const periods = UTCI_COMFORT_PERIOD_ROWS.map(p => ({ id: p.id, label: p.label }));

  const cells = UTCI_COMFORT_PERIOD_ROWS.map(period =>
    UTCI_EXPOSURE_SCENARIOS.map(scenario => {
      let comfortN = 0;
      let total = 0;
      for (const row of rows) {
        if (!rowMatchesUtciComfortPeriod(row, period, filter, siteLatitude)) continue;
        const utci = computeUtciForEpwRow(row, {
          includeSun: scenario.includeSun,
          includeWind: scenario.includeWind,
        });
        if (!utci) continue;
        total += 1;
        if (utci.isComfortable) comfortN += 1;
      }
      return {
        percentComfort: total ? (comfortN / total) * 100 : NaN,
        hoursCounted: total,
      };
    })
  );

  return { periods, scenarios: UTCI_EXPOSURE_SCENARIOS, cells };
}

/** UTCI heatmap/bar gradient domain (°C), extended for cold/high-altitude files. */
export function utciGradientExtentFromRows(
  rows: EPWDataRow[],
  opts: { includeSun?: boolean; includeWind?: boolean } = {}
): { minC: number; maxC: number } {
  const values: number[] = [];
  for (const row of rows) {
    const u = computeUtciForEpwRow(row, opts);
    if (u) values.push(u.utci);
  }
  return utciGradientExtentC(values);
}

export type UtciCellScenarioSummary = {
  scenario: UtciExposureScenario;
  /** Aggregated UTCI in °C for the cell hours under this exposure. */
  utciC: number;
  category: string;
  /** Share of hours in “no thermal stress” (0–1). */
  comfortShare: number;
  hourCount: number;
};

/**
 * Recompute UTCI for every hour in a heatmap cell under each exposure scenario
 * (sun/wind on/off), using the same cell statistic as the footer Low/Ave/High toggle.
 */
export function summarizeUtciCellScenarios(
  rows: EPWDataRow[],
  statistic: HeatmapCellStatistic = 'mean'
): UtciCellScenarioSummary[] {
  return UTCI_EXPOSURE_SCENARIOS.map(scenario => {
    const computed = rows
      .map(row => computeUtciForEpwRow(row, {
        includeSun: scenario.includeSun,
        includeWind: scenario.includeWind,
      }))
      .filter((r): r is NonNullable<typeof r> => r != null);

    if (!computed.length) {
      return {
        scenario,
        utciC: NaN,
        category: UTCI_COMFORT_CATEGORY,
        comfortShare: 0,
        hourCount: 0,
      };
    }

    const utciC = aggregateCellStatistic(
      computed.map(c => c.utci),
      statistic
    );
    const comfortShare =
      computed.filter(c => c.isComfortable).length / computed.length;

    return {
      scenario,
      utciC,
      category: getUtciCategoryForValue(utciC),
      comfortShare,
      hourCount: computed.length,
    };
  });
}

