import type { EPWDataRow } from './epwParser';

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Hour labels matching the 12×24 Y-axis (`0` = 12 AM … `23` = 11 PM). */
export function formatEpwStationHour(hour0to23: number): string {
  const h = ((Math.floor(hour0to23) % 24) + 24) % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

/**
 * Format an EPW row using its station calendar fields (`year`/`month`/`day`/`hour`),
 * not `row.date.toLocaleString()` — `date` is a UTC instant for SunCalc and would show
 * the viewer's browser timezone instead of the weather-file clock.
 */
export function formatEpwStationDateTime(
  row: Pick<EPWDataRow, 'year' | 'month' | 'day' | 'hour'>
): string {
  const mon = MONTH_SHORT[row.month - 1] ?? `M${row.month}`;
  return `${mon} ${row.day}, ${row.year}, ${formatEpwStationHour(row.hour)}`;
}

export function formatEpwStationDate(
  row: Pick<EPWDataRow, 'year' | 'month' | 'day'>
): string {
  const mon = MONTH_SHORT[row.month - 1] ?? `M${row.month}`;
  return `${mon} ${row.day}, ${row.year}`;
}
