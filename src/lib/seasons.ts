/**
 * Astronomical seasons (equinox / solstice), not meteorological 3-month blocks.
 * Fixed calendar dates match the SunPath markers (Mar 21 / Jun 21 / Dec 21) and
 * Sep 22 for the autumn equinox — stable for EPW/TMY years.
 *
 * Northern Hemisphere (local):
 *   Spring  Mar 21 – Jun 20
 *   Summer  Jun 21 – Sep 21
 *   Fall    Sep 22 – Dec 20
 *   Winter  Dec 21 – Mar 20
 *
 * Southern Hemisphere uses the opposite season on the same calendar dates
 * (local summer = NH winter dates, etc.).
 */

export type AstronomicalSeason = 'spring' | 'summer' | 'fall' | 'winter';
export type Hemisphere = 'northern' | 'southern';

export type SeasonDateBound = {
  startMonth: number;
  startDay: number;
  /** Inclusive end date. */
  endMonth: number;
  endDay: number;
};

/** Northern-hemisphere astronomical bounds (inclusive). */
export const ASTRONOMICAL_SEASON_BOUNDS_NH: Record<AstronomicalSeason, SeasonDateBound> = {
  spring: { startMonth: 3, startDay: 21, endMonth: 6, endDay: 20 },
  summer: { startMonth: 6, startDay: 21, endMonth: 9, endDay: 21 },
  fall: { startMonth: 9, startDay: 22, endMonth: 12, endDay: 20 },
  winter: { startMonth: 12, startDay: 21, endMonth: 3, endDay: 20 },
};

export const ASTRONOMICAL_SEASON_LABELS: Record<AstronomicalSeason, string> = {
  spring: 'Spring (Mar 21–Jun 20)',
  summer: 'Summer (Jun 21–Sep 21)',
  fall: 'Fall (Sep 22–Dec 20)',
  winter: 'Winter (Dec 21–Mar 20)',
};

const DAYS_IN_MONTH_NON_LEAP = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DAYS_IN_MONTH_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function hemisphereFromLatitude(lat: number | null | undefined): Hemisphere {
  if (lat != null && Number.isFinite(lat) && lat < 0) return 'southern';
  return 'northern';
}

export function oppositeAstronomicalSeason(season: AstronomicalSeason): AstronomicalSeason {
  switch (season) {
    case 'spring':
      return 'fall';
    case 'summer':
      return 'winter';
    case 'fall':
      return 'spring';
    case 'winter':
      return 'summer';
  }
}

function monthDayKey(month: number, day: number): number {
  return month * 100 + day;
}

/** True if calendar month/day falls in the given *local* astronomical season. */
export function dateInAstronomicalSeason(
  month: number,
  day: number,
  season: AstronomicalSeason,
  hemisphere: Hemisphere = 'northern'
): boolean {
  const nhSeason = hemisphere === 'southern' ? oppositeAstronomicalSeason(season) : season;
  const b = ASTRONOMICAL_SEASON_BOUNDS_NH[nhSeason];
  const t = monthDayKey(month, day);
  const start = monthDayKey(b.startMonth, b.startDay);
  const end = monthDayKey(b.endMonth, b.endDay);
  if (start <= end) return t >= start && t <= end;
  // Wraps year (e.g. winter Dec 21 – Mar 20)
  return t >= start || t <= end;
}

export function seasonForDate(
  month: number,
  day: number,
  hemisphere: Hemisphere = 'northern'
): AstronomicalSeason {
  for (const season of ['spring', 'summer', 'fall', 'winter'] as AstronomicalSeason[]) {
    if (dateInAstronomicalSeason(month, day, season, hemisphere)) return season;
  }
  return 'winter';
}

export function monthOverlapsAstronomicalSeason(
  month: number,
  season: AstronomicalSeason,
  hemisphere: Hemisphere = 'northern'
): boolean {
  if (month < 1 || month > 12) return false;
  const days = DAYS_IN_MONTH_NON_LEAP[month - 1];
  for (let day = 1; day <= days; day++) {
    if (dateInAstronomicalSeason(month, day, season, hemisphere)) return true;
  }
  return false;
}

export function monthDayToDayOfYear(month: number, day: number, leapYear = false): number {
  const days = leapYear ? DAYS_IN_MONTH_LEAP : DAYS_IN_MONTH_NON_LEAP;
  let doy = day;
  for (let m = 1; m < month; m++) doy += days[m - 1];
  return doy;
}

/**
 * Day-of-year segments for heatmap outlines (end exclusive).
 * Uses a non-leap year (standard EPW/TMY 8760-hour file).
 */
export function astronomicalSeasonDaySegments(
  season: AstronomicalSeason,
  hemisphere: Hemisphere = 'northern'
): { startDay: number; endDayExclusive: number }[] {
  const nhSeason = hemisphere === 'southern' ? oppositeAstronomicalSeason(season) : season;
  const b = ASTRONOMICAL_SEASON_BOUNDS_NH[nhSeason];
  const startDoy = monthDayToDayOfYear(b.startMonth, b.startDay, false);
  // day after inclusive end
  let endMonth = b.endMonth;
  let endDay = b.endDay + 1;
  const dim = DAYS_IN_MONTH_NON_LEAP[endMonth - 1];
  if (endDay > dim) {
    endDay = 1;
    endMonth = endMonth === 12 ? 1 : endMonth + 1;
  }
  const endExclusive = monthDayToDayOfYear(endMonth, endDay, false);

  if (startDoy < endExclusive) {
    return [{ startDay: startDoy, endDayExclusive: endExclusive }];
  }
  // Wraps Dec → Jan
  return [
    { startDay: startDoy, endDayExclusive: 366 },
    { startDay: 1, endDayExclusive: endExclusive },
  ];
}
