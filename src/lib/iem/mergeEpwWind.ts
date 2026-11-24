import type { EPWDataRow, EPWMetadata } from '../epwParser';
import type { ParsedIemWindRow } from './parseAsosCsv';

function daysInUtcMonth(referenceYear: number, month1to12: number): number {
  return new Date(Date.UTC(referenceYear, month1to12, 0)).getUTCDate();
}

function clampDayToUtcMonth(day: number, referenceYear: number, month1to12: number): number {
  const dim = daysInUtcMonth(referenceYear, month1to12);
  return Math.min(day, dim);
}

function floorHourUtc(ms: number): number {
  return Math.floor(ms / (60 * 60 * 1000)) * (60 * 60 * 1000);
}

/** EPW missing dry-bulb sentinel and other non-physical placeholders. */
export function isValidEpwDryBulb(t: unknown): t is number {
  return typeof t === 'number' && Number.isFinite(t) && t < 99;
}

export function stationClockKey(month: number, day: number, hour: number): number {
  return month * 10000 + day * 100 + hour;
}

/** Station calendar (month/day/hour) from a UTC observation — matches {@link epwUtcMsForMergedWind}. */
export function stationClockFromUtcMs(
  validMs: number,
  metadata: EPWMetadata
): { month: number; day: number; hour: number } {
  const t = new Date(validMs + Math.round(metadata.timeZone * 3600000));
  return { month: t.getUTCMonth() + 1, day: t.getUTCDate(), hour: t.getUTCHours() };
}

/** TMY dry-bulb (°C) keyed by EPW station standard-time month/day/hour. */
export function buildEpwDryBulbStationClockLookup(epwRows: EPWDataRow[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const r of epwRows) {
    if (!isValidEpwDryBulb(r.dryBulbTemperature)) continue;
    const c = r.solarStandardClock;
    const m = c?.month ?? r.month;
    const d = c?.day ?? r.day;
    const h = c?.hour ?? r.hour;
    map.set(stationClockKey(m, d, h), r.dryBulbTemperature as number);
  }
  return map;
}

/**
 * Dry-bulb for comfort filtering: use the row value when present, else TMY/EPW at the same station clock.
 */
export function resolveWindRowDryBulbC(
  row: EPWDataRow,
  epwLookup: Map<number, number> | null,
  metadata?: EPWMetadata
): number | null {
  if (isValidEpwDryBulb(row.dryBulbTemperature)) {
    return row.dryBulbTemperature as number;
  }
  if (!epwLookup) return null;

  if (
    typeof row.month === 'number' &&
    typeof row.day === 'number' &&
    typeof row.hour === 'number' &&
    !Number.isNaN(row.month) &&
    !Number.isNaN(row.day) &&
    !Number.isNaN(row.hour)
  ) {
    return epwLookup.get(stationClockKey(row.month, row.day, row.hour)) ?? null;
  }

  if (!metadata) return null;
  const ms = row.date instanceof Date ? row.date.getTime() : NaN;
  if (!Number.isFinite(ms)) return null;
  const sc = stationClockFromUtcMs(ms, metadata);
  return epwLookup.get(stationClockKey(sc.month, sc.day, sc.hour)) ?? null;
}

/**
 * Build a UTC hourly map from IEM rows (prefer last non-empty sample within each UTC hour bucket
 * so a later null reading never overwrites an earlier valid observation).
 */
export function hourlyUtcWindLookup(rows: ParsedIemWindRow[]): Map<number, Pick<ParsedIemWindRow, 'windMs' | 'windFromDeg'>> {
  const buckets = new Map<number, ParsedIemWindRow>();

  for (const row of rows) {
    if (row.windMs === null && row.windFromDeg === null) continue;
    const h = floorHourUtc(row.validMs);
    const prev = buckets.get(h);
    if (!prev || row.validMs >= prev.validMs) {
      buckets.set(h, row);
    }
  }

  const map = new Map<number, Pick<ParsedIemWindRow, 'windMs' | 'windFromDeg'>>();
  for (const [h, row] of buckets) {
    map.set(h, { windMs: row.windMs, windFromDeg: row.windFromDeg });
  }
  return map;
}

/**
 * For each EPW row, synthesize a UTC epoch using **`referenceCalendarYear`** and the EPW calendar
 * in **station standard time** via `metadata.timeZone` — honoring `solarStandardClock` when DST display is active
 * and preserving fractional timezone offsets.
 */
export function epwUtcMsForMergedWind(row: EPWDataRow, metadata: EPWMetadata, referenceCalendarYear: number, minuteMid = 30): number {
  const c = row.solarStandardClock;
  const month = c?.month ?? row.month;
  const day = c?.day ?? row.day;
  const hour = c?.hour ?? row.hour;
  const dom = clampDayToUtcMonth(day, referenceCalendarYear, month);
  const tzMs = Number.isFinite(metadata.timeZone) ? Math.round(metadata.timeZone * 3_600_000) : 0;
  return Date.UTC(referenceCalendarYear, month - 1, dom, hour, minuteMid, 0, 0) - tzMs;
}

/** Shallow row copies with substituted wind Speed / Direction (degrees, m/s EPW-compatible). */
export function mergeHourlyWindFromIemIntoEpw(
  rows: EPWDataRow[],
  metadata: EPWMetadata,
  referenceCalendarYear: number,
  asosRows: ParsedIemWindRow[]
): EPWDataRow[] {
  const lookup = hourlyUtcWindLookup(asosRows);
  return rows.map(r => {
    const utcHour = floorHourUtc(epwUtcMsForMergedWind(r, metadata, referenceCalendarYear));
    const wind = lookup.get(utcHour);
    if (!wind || (wind.windMs === null && wind.windFromDeg === null)) {
      return r;
    }

    const next: EPWDataRow = { ...r };

    if (wind.windMs !== null) {
      next.windSpeed = wind.windMs;
    }

    // Avoid hybrid EPW/IEM vectors: if IEM reports speed with variable/missing direction (VRB),
    // store 0 for calm or null for variable direction instead of retaining an unrelated EPW direction.
    if (wind.windMs !== null && wind.windMs < 1e-6) {
      next.windDirection = 0;
    } else if (wind.windFromDeg !== null) {
      next.windDirection = wind.windFromDeg;
    } else {
      next.windDirection = null;
    }

    return next;
  });
}

/**
 * Merges IEM ASOS wind from multiple calendar years onto the EPW timeline.
 *
 * Note: “average wind speed” for charts is usually the arithmetic mean of speeds, not the magnitude of
 * the mean vector. A vector-mean across years can look artificially low when directions vary.
 *
 * We therefore compute:
 * - windSpeed: arithmetic mean of available speeds at the matched UTC hour across years
 * - windDirection: direction of the mean wind vector (circular mean), when directional samples exist
 *
 * A single year delegates to {@link mergeHourlyWindFromIemIntoEpw} for identical behaviour to the one-year path.
 */
export function mergeHourlyWindFromMultiYearIemIntoEpw(
  rows: EPWDataRow[],
  metadata: EPWMetadata,
  years: number[],
  asosRowsByYear: Map<number, ParsedIemWindRow[]>
): EPWDataRow[] {
  const unique = [...new Set(years)].filter(y => Number.isFinite(y)).sort((a, b) => a - b);
  if (unique.length === 0) return rows;
  if (unique.length === 1) {
    const y = unique[0]!;
    const asos = asosRowsByYear.get(y) ?? [];
    return mergeHourlyWindFromIemIntoEpw(rows, metadata, y, asos);
  }

  const lookups = new Map<number, ReturnType<typeof hourlyUtcWindLookup>>();
  for (const y of unique) {
    lookups.set(y, hourlyUtcWindLookup(asosRowsByYear.get(y) ?? []));
  }

  return rows.map(r => {
    let sumSpeed = 0;
    let nSpeed = 0;
    let sumU = 0;
    let sumV = 0;
    let nVec = 0;

    for (const y of unique) {
      const utcHour = floorHourUtc(epwUtcMsForMergedWind(r, metadata, y));
      const wind = lookups.get(y)?.get(utcHour);
      if (!wind) continue;
      const { windMs, windFromDeg } = wind;
      if (windMs === null && windFromDeg === null) continue;

      if (windMs !== null) {
        sumSpeed += windMs;
        nSpeed++;
      }

      if (windMs !== null && windMs > 1e-6 && windFromDeg !== null) {
        const rad = windFromDeg * (Math.PI / 180);
        sumU += -windMs * Math.sin(rad);
        sumV += -windMs * Math.cos(rad);
        nVec++;
      }
    }

    if (nSpeed === 0 && nVec === 0) return r;

    const avgSpeed = nSpeed > 0 ? sumSpeed / nSpeed : null;
    const avgU = nVec > 0 ? sumU / nVec : 0;
    const avgV = nVec > 0 ? sumV / nVec : 0;
    let avgDir: number | null = null;
    if (nVec > 0 && Math.hypot(avgU, avgV) > 1e-9) {
      let d = (Math.atan2(-avgU, -avgV) * 180) / Math.PI;
      if (d < 0) d += 360;
      avgDir = d;
    }

    const next: EPWDataRow = { ...r };
    if (avgSpeed !== null) {
      next.windSpeed = avgSpeed;
    }
    if (avgSpeed !== null && avgSpeed < 1e-6) {
      next.windDirection = 0;
    } else if (avgDir !== null) {
      next.windDirection = avgDir;
    } else {
      next.windDirection = null;
    }
    return next;
  });
}
