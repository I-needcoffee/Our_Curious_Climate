import type { EPWDataRow } from './epwParser';

/**
 * Key for the same hour of the year in two weather files.
 * Uses standard time (not the DST display shift) and ignores the file year, so a TMY from
 * 2001 still lines up with a TMY from 2018. Feb 29 only matches another leap-day file.
 */
export function epwEquivalentHourKey(row: EPWDataRow): string {
  const standard = row.solarStandardClock;
  const month = standard?.month ?? row.month;
  const day = standard?.day ?? row.day;
  const hour = standard?.hour ?? row.hour;
  return `${month}|${day}|${hour}`;
}

export function indexEpwByEquivalentHour(rows: EPWDataRow[]): Map<string, EPWDataRow> {
  const map = new Map<string, EPWDataRow>();
  for (const row of rows) {
    const key = epwEquivalentHourKey(row);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
