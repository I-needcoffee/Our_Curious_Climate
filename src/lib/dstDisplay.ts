import type { EPWDataRow, EPWMetadata, ParsedEPW } from './epwParser';

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && isLeap(y)) return 29;
  return dim[m - 1] ?? 31;
}

/** Add one hour in station *standard* (civil) clock, with month/day rollover. */
function addOneHourSt(
  y: number,
  m: number,
  d: number,
  h: number
): { y: number; m: number; d: number; h: number } {
  let nh = h + 1;
  let nd = d;
  let nm = m;
  let ny = y;
  if (nh < 24) return { y: ny, m: nm, d: nd, h: nh };
  nh = 0;
  nd += 1;
  const max = daysInMonth(ny, nm);
  if (nd > max) {
    nd = 1;
    nm += 1;
    if (nm > 12) {
      nm = 1;
      ny += 1;
    }
  }
  return { y: ny, m: nm, d: nd, h: nh };
}

/** 2nd Sunday in March (2:00 AM ST), 1st Sunday in November (1:00 AM ST = 2:00 AM DST), as epoch ms. */
function dstTransitionUtc(
  year: number,
  month0: number,
  whichSunday: 1 | 2,
  timeZoneStdHours: number,
  localStdHour: number
): number {
  let firstSun = 0;
  for (let day = 1; day <= 7; day++) {
    if (new Date(Date.UTC(year, month0, day)).getUTCDay() === 0) {
      firstSun = day;
      break;
    }
  }
  if (!firstSun) return NaN;
  const day = whichSunday === 1 ? firstSun : firstSun + 7;
  const tzMs = Number.isFinite(timeZoneStdHours) ? Math.round(timeZoneStdHours * 3_600_000) : 0;
  return Date.UTC(year, month0, day, localStdHour, 0, 0, 0) - tzMs;
}

/** Whether `utcMs` (EPW `row.date` instant) is inside US/Canada-style DST, using the file’s offset as standard time. */
export function isInNaStyleDst(utcMs: number, year: number, timeZoneStdHours: number): boolean {
  // month0: 2 = March (2nd Sunday, 2:00 AM ST), 10 = November (1st Sunday, 1:00 AM ST = 2:00 AM DST)
  const start = dstTransitionUtc(year, 2, 2, timeZoneStdHours, 2);
  const end = dstTransitionUtc(year, 10, 1, timeZoneStdHours, 1);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return utcMs >= start && utcMs < end;
}

/**
 * EnergyPlus EPW `HOLIDAYS/DAYLIGHT SAVINGS` (first field) describes whether the **location**
 * observes daylight saving, not whether each hourly value was pre-shifted. Typical TMY/TMYx
 * files keep timestamps on the **standard** offset in `LOCATION` all year (see docs / comments
 * in `solarNightHeatmap.ts`). This app’s DST toggle is a **display** layer: in summer it moves
 * values to the next civil hour (+1h) using US transition dates, while keeping the underlying
 * measurement instant (`date`) unchanged so sun geometry matches the sample.
 */
export function epwHeaderDaylightSavingSummary(m: EPWMetadata): string {
  switch (m.daylightSavings) {
    case 'yes':
      return 'EPW header: location observes DST (timestamps still standard offset unless your source says otherwise).';
    case 'no':
      return 'EPW header: no DST at this location.';
    default:
      return 'EPW header: DST field missing or ambiguous.';
  }
}

function adjustRow(row: EPWDataRow, m: EPWMetadata, apply: boolean, canonicalYear: number): EPWDataRow {
  if (!apply) return row;
  const tz = m.timeZone;
  const utc0 = row.date.getTime();
  if (!isInNaStyleDst(utc0, row.year, tz)) {
    return row;
  }

  const solarStandardClock = {
    year: row.year,
    month: row.month,
    day: row.day,
    hour: row.hour,
  };
  const o = addOneHourSt(row.year, row.month, row.day, row.hour);
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(
    (Date.UTC(canonicalYear, o.m - 1, o.d) - Date.UTC(canonicalYear, 0, 0)) / oneDay
  );

  const next: EPWDataRow = {
    ...row,
    year: o.y,
    month: o.m,
    day: o.d,
    hour: o.h,
    dayOfYear,
    solarStandardClock,
    date: row.date,
  };
  return next;
}

/**
 * When the user turns DST on, apply US-style summer +1h **display** fields (2nd Sun Mar → 1st Sun Nov)
 * for every loaded file, keeping the underlying measurement instant (`date`) and `solarStandardClock`
 * intact so solar geometry stays aligned with the shifted civil-clock rows.
 *
 * Note: Most EnergyPlus/TMYx EPW headers carry `HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0` even for cities
 * that observe DST (because TMY timestamps are stored on standard time), so we must not suppress
 * the user's explicit DST display toggle based on `metadata.daylightSavings === 'no'`.
 */
export function withDstDisplayRespectingToggle(f: ParsedEPW, userWantsDst: boolean): ParsedEPW {
  if (!userWantsDst) return f;
  const hasFeb29 = f.data.some(r => r.month === 2 && r.day === 29);
  const canonicalYear = hasFeb29 ? 2000 : 2001;
  return {
    ...f,
    data: f.data.map(r => adjustRow(r, f.metadata, true, canonicalYear)),
  };
}
