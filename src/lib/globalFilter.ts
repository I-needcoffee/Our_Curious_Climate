import type { EPWDataRow } from './epwParser';

/**
 * Workspace-wide filtering for chart rows:
 * • Season (month range wrapping year OK) + hour range
 * • Optional dry-bulb temperature isolation (EPW dry-bulb °C in column 6 — always Celsius in parsed data).
 */
export interface GlobalFilterState {
  startMonth: number;
  endMonth: number;
  startHour: number;
  endHour: number;
  /** When not `off`, rows must satisfy this against `dryBulbTemperature` (°C). */
  temperatureMode: 'off' | 'above' | 'below' | 'between';
  /** Lower °C inclusive — interpretation depends on `temperatureMode`. */
  temperatureLoC: number;
  /** Upper °C inclusive — interpretation depends on `temperatureMode`. */
  temperatureHiC: number;
}

export const DEFAULT_GLOBAL_FILTER: GlobalFilterState = {
  startMonth: 1,
  endMonth: 12,
  startHour: 0,
  endHour: 23,
  temperatureMode: 'off',
  temperatureLoC: 18,
  temperatureHiC: 26,
};

/** Inclusive month range; wraps when start > end (e.g. winter Dec–Feb). */
export function monthInRange(month: number, startMonth: number, endMonth: number): boolean {
  return startMonth <= endMonth
    ? month >= startMonth && month <= endMonth
    : month >= startMonth || month <= endMonth;
}

/** Inclusive hour range; wraps when start > end (e.g. night 20–6). */
export function hourInWrappedRange(hour: number, startHour: number, endHour: number): boolean {
  return startHour <= endHour
    ? hour >= startHour && hour <= endHour
    : hour >= startHour || hour <= endHour;
}

/** True when month isolation is not the full calendar year. */
export function monthFilterIsPartial(f: Pick<GlobalFilterState, 'startMonth' | 'endMonth'>): boolean {
  return !(f.startMonth === 1 && f.endMonth === 12);
}

/** True when hour isolation is not the full day. */
export function hourFilterIsPartial(f: Pick<GlobalFilterState, 'startHour' | 'endHour'>): boolean {
  return !(f.startHour === 0 && f.endHour === 23);
}

/**
 * Inclusive hour filter as one or two half-open [start, endExclusive) segments
 * for heatmap outlines (supports midnight wrap).
 */
export function hourRangeOutlineSegments(
  startHour: number,
  endHour: number
): { startHour: number; endHourExclusive: number }[] {
  if (startHour <= endHour) {
    return [{ startHour, endHourExclusive: endHour + 1 }];
  }
  return [
    { startHour, endHourExclusive: 24 },
    { startHour: 0, endHourExclusive: endHour + 1 },
  ];
}

/**
 * Day-of-year spans (end exclusive) for the global month filter outline.
 * Supports Dec→Feb wrap as two segments.
 */
export function globalFilterDaySegments(
  data: EPWDataRow[],
  filter: Pick<GlobalFilterState, 'startMonth' | 'endMonth'>
): { startDay: number; endDay: number }[] {
  if (!monthFilterIsPartial(filter)) {
    return [{ startDay: 1, endDay: 366 }];
  }
  if (filter.startMonth <= filter.endMonth) {
    const startDay = data.find(d => d.month === filter.startMonth)?.dayOfYear || 1;
    const endDayData = [...data].reverse().find(d => d.month === filter.endMonth);
    const endDay = endDayData ? endDayData.dayOfYear + 1 : 366;
    return [{ startDay, endDay }];
  }
  const startDay = data.find(d => d.month === filter.startMonth)?.dayOfYear || 1;
  const segs: { startDay: number; endDay: number }[] = [{ startDay, endDay: 366 }];
  const endDayData = [...data].reverse().find(d => d.month === filter.endMonth);
  const endDay = endDayData ? endDayData.dayOfYear + 1 : 1;
  if (endDay > 1) segs.push({ startDay: 1, endDay });
  return segs;
}

export function rowsMatchSeasonHours(row: EPWDataRow, f: GlobalFilterState): boolean {
  const isMonthMatch = monthInRange(row.month, f.startMonth, f.endMonth);
  const isHourMatch = hourInWrappedRange(row.hour, f.startHour, f.endHour);
  return isMonthMatch && isHourMatch;
}

/** EPW dry-bulb is °C; Settings temperature isolation compares against °C internally. */
export function dryBulbCPassesGlobalTemperature(t: number | null | undefined, f: GlobalFilterState): boolean {
  if (f.temperatureMode === 'off') return true;
  if (t == null || typeof t !== 'number' || Number.isNaN(t)) return false;
  const lo = f.temperatureLoC;
  const hi = f.temperatureHiC;
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  switch (f.temperatureMode) {
    case 'above':
      return t >= lo;
    case 'below':
      return t <= hi;
    case 'between':
      return t >= a && t <= b;
    default:
      return true;
  }
}

/** EPW stores dry-bulb in °C. */
export function rowPassesDryBulbTemperature(row: EPWDataRow, f: GlobalFilterState): boolean {
  return dryBulbCPassesGlobalTemperature(row.dryBulbTemperature as number | null | undefined, f);
}

export function rowPassesGlobalFilters(row: EPWDataRow, f: GlobalFilterState): boolean {
  return rowsMatchSeasonHours(row, f) && rowPassesDryBulbTemperature(row, f);
}

/** Heatmap cell content: statistic within each aggregation bin (after global filters via row lists). */
export type HeatmapCellStatistic = 'low' | 'mean' | 'high';

/** Explorer bar fill: solid from footer Low/Ave/High, or legend-aligned vertical gradient. */
export type BarChartFillMode = 'solid' | 'gradient';

export function explorerBarSolidColor(
  colorAt: (v: number) => string,
  stat: HeatmapCellStatistic,
  dims: {
    valueSelected: number;
    minSelected?: number | null;
    maxSelected?: number | null;
  }
): string {
  const min = dims.minSelected ?? dims.valueSelected;
  const max = dims.maxSelected ?? dims.valueSelected;
  return colorAt(
    explorerBarStatisticY(stat, {
      valueSelected: dims.valueSelected,
      minSelected: min,
      maxSelected: max,
    })
  );
}

/** Y position value for explorer bar midpoint marker (/footer Low · Ave · High). Bars still use span min–max. */
export function explorerBarStatisticY(
  stat: HeatmapCellStatistic,
  dims: {
    valueSelected: number;
    minSelected?: number;
    maxSelected?: number;
  }
): number {
  if (stat === 'low') return dims.minSelected ?? dims.valueSelected;
  if (stat === 'high') return dims.maxSelected ?? dims.valueSelected;
  return dims.valueSelected;
}

/** Reduce hourly samples in one heatmap cell to a scalar (default: mean ≈ footer “Ave”). */
export function aggregateCellStatistic(values: number[], stat: HeatmapCellStatistic): number {
  const v = values.filter(x => typeof x === 'number' && !Number.isNaN(x));
  if (!v.length) return 0;
  if (stat === 'mean') return v.reduce((a, b) => a + b, 0) / v.length;
  if (stat === 'high') return Math.max(...v);
  return Math.min(...v);
}
