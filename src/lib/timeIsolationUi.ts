/** Shared month/hour isolation labels, presets, and formatters (Settings + Wind Rose). */

export type IsolationRange = [number, number];

export const MONTH_SHORT = [
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

export const SEASON_MONTH_PRESETS: { id: string; label: string; range: IsolationRange }[] = [
  { id: 'annual', label: 'Annual', range: [1, 12] },
  { id: 'spring', label: 'Spring', range: [3, 5] },
  { id: 'summer', label: 'Summer', range: [6, 8] },
  { id: 'fall', label: 'Fall', range: [9, 11] },
  { id: 'winter', label: 'Winter', range: [12, 2] },
];

/** Global settings / filter panel hour chips (includes wrap Night). */
export const GLOBAL_HOUR_PRESETS: {
  id: string;
  label: string;
  hint: string;
  range: IsolationRange;
}[] = [
  { id: 'all', label: 'All hours', hint: '12am–11pm', range: [0, 23] },
  { id: 'day', label: 'Day', hint: '7am–6pm', range: [7, 18] },
  { id: 'night', label: 'Night', hint: '8pm–6am', range: [20, 6] },
  { id: 'morning', label: 'Morning', hint: '7am–10am', range: [7, 10] },
  { id: 'midday', label: 'Midday', hint: '11am–2pm', range: [11, 14] },
  { id: 'afternoon', label: 'Afternoon', hint: '3pm–6pm', range: [15, 18] },
];

/** Compact Wind Rose hour chips. */
export const WIND_ROSE_HOUR_PRESETS: {
  id: string;
  label: string;
  hint: string;
  range: IsolationRange;
}[] = [
  { id: 'all', label: 'All hours', hint: '12am–11pm', range: [0, 23] },
  { id: 'day', label: 'Day', hint: '7am–6pm', range: [7, 18] },
  { id: 'night', label: 'Night', hint: '8pm–6am', range: [20, 6] },
];

export const MONTH_WRAP_HINT =
  'Drag a handle past the other to wrap around the year (Winter is Dec–Feb).';

export const HOUR_WRAP_HINT =
  'Drag a handle past the other to wrap around midnight (Night is 8pm–6am).';

export function isolationRangesEqual(a: IsolationRange, b: IsolationRange): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function formatHourClock(hour: number): string {
  const suffix = hour >= 12 && hour < 24 ? 'pm' : 'am';
  const hr = hour % 12 === 0 ? 12 : hour % 12;
  return `${hr}${suffix}`;
}

export function formatHourIsolationRange(range: IsolationRange): string {
  const label = `${formatHourClock(range[0])}–${formatHourClock(range[1])}`;
  return range[0] <= range[1] ? label : `${label} wrap`;
}

export function formatMonthIsolationRange(range: IsolationRange): string {
  const label = `${MONTH_SHORT[range[0] - 1]}–${MONTH_SHORT[range[1] - 1]}`;
  return range[0] <= range[1] ? label : `${label} wrap`;
}
