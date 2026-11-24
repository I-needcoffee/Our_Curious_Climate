import React, { useMemo } from 'react';
import type { EPWDataRow, EPWMetadata } from '../lib/epwParser';
import type { UnitSystem } from '../App';
import { convertUnit, convertValue, UNIT_C, UNIT_F } from '../lib/unitConversion';
import type { GlobalFilterState } from '../lib/globalFilter';
import { hasActiveGlobalFilter, rowPassesGlobalFilters } from '../lib/globalFilter';
import {
  formatAstronomicalSeasonLabel,
  hemisphereFromLatitude,
  seasonForDate,
} from '../lib/seasons';
import {
  computeUtciForEpwRow,
  UTCI_CLOCK_WINDOWS,
  UTCI_HOUR_WINDOW_NOTE_SHORT,
  type UtciRowOpts,
} from '../lib/utciModel';

function cToF(v: number) {
  return v * (9 / 5) + 32;
}

function formatNumber(v: number, digits = 1) {
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

function mean(values: number[]) {
  if (!values.length) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function min(values: number[]) {
  if (!values.length) return NaN;
  let m = Infinity;
  for (const v of values) if (v < m) m = v;
  return m;
}

function max(values: number[]) {
  if (!values.length) return NaN;
  let m = -Infinity;
  for (const v of values) if (v > m) m = v;
  return m;
}

function inHourRange(hour: number, startInclusive: number, endExclusive: number) {
  return hour >= startInclusive && hour < endExclusive;
}

function utciComfortableC(utciC: number) {
  return utciC >= 9 && utciC <= 26;
}

function ratio(n: number, d: number) {
  if (!d) return NaN;
  return n / d;
}

function pct(n: number, d: number, digits = 1) {
  const r = ratio(n, d);
  return Number.isFinite(r) ? `${formatNumber(r * 100, digits)} %` : '—';
}

/** Standard ASHRAE balance-point temperature for HDD/CDD: 18.333°C (65°F). */
const DEGREE_DAY_BASE_C = 18.333333333333332;

/**
 * Unit-independent SI + UTCI summary. Decoupled from `unitSystem` so toggling Metric ↔ Imperial
 * never re-runs 8,760 hours of SunCalc + UTCI math.
 */
function computeQuickStatsSi(
  rows: EPWDataRow[] | undefined,
  metadata?: EPWMetadata | null,
  filter?: GlobalFilterState
) {
  const raw = (rows ?? []).filter(r => r && r.date);
  const data = filter ? raw.filter(r => rowPassesGlobalFilters(r, filter)) : raw;
  const siteLatitude = metadata?.lat ?? null;
  const hemisphere = hemisphereFromLatitude(siteLatitude);
  const utciOpts: UtciRowOpts =
    metadata &&
    Number.isFinite(metadata.lat) &&
    Number.isFinite(metadata.lng) &&
    Number.isFinite(metadata.timeZone)
      ? {
          radiantMode: 'station',
          site: { lat: metadata.lat, lng: metadata.lng, timeZone: metadata.timeZone },
        }
      : { radiantMode: 'station' };

  const tempsC: number[] = [];
  const dni: number[] = [];
  const ghi: number[] = [];
  const humid: number[] = [];
  const cloudTenths: number[] = [];
  const windMs: number[] = [];
  let precipMmSum = 0;
  let precipCount = 0;
  let hddCSum = 0;
  let cddCSum = 0;

  let comfortAllN = 0;
  let comfortAllD = 0;

  let comfortDayN = 0;
  let comfortDayD = 0;

  const comfortSeasonN: Record<string, number> = { spring: 0, summer: 0, fall: 0, winter: 0 };
  const comfortSeasonD: Record<string, number> = { spring: 0, summer: 0, fall: 0, winter: 0 };

  let comfortMorningN = 0;
  let comfortMorningD = 0;
  let comfortMiddayN = 0;
  let comfortMiddayD = 0;
  let comfortAfternoonN = 0;
  let comfortAfternoonD = 0;

  let utciOutOfRange = 0;

  for (const r of data) {
    const tdb = r.dryBulbTemperature as number;
    if (tdb != null && Number.isFinite(tdb)) {
      tempsC.push(tdb);
      if (tdb < DEGREE_DAY_BASE_C) hddCSum += (DEGREE_DAY_BASE_C - tdb) / 24;
      else if (tdb > DEGREE_DAY_BASE_C) cddCSum += (tdb - DEGREE_DAY_BASE_C) / 24;
    }
    const dRad = r.directNormalRadiation as number;
    if (dRad != null && Number.isFinite(dRad)) dni.push(dRad);
    const gRad = r.globalHorizontalRadiation as number;
    if (gRad != null && Number.isFinite(gRad)) ghi.push(gRad);
    const rh = r.relativeHumidity as number;
    if (rh != null && Number.isFinite(rh)) humid.push(rh);
    const sky = r.totalSkyCover as number;
    if (sky != null && Number.isFinite(sky)) cloudTenths.push(sky);
    const ws = r.windSpeed as number;
    if (ws != null && Number.isFinite(ws)) windMs.push(ws);
    const precip = r.liquidPrecipitationDepth as number;
    if (precip != null && Number.isFinite(precip) && precip >= 0) {
      precipMmSum += precip;
      precipCount += 1;
    }

    // Single UTCI evaluation per hour (avoids calling SunCalc/MRT twice per row).
    const hasCoreInputs =
      tdb != null &&
      Number.isFinite(tdb) &&
      rh != null &&
      Number.isFinite(rh) &&
      ws != null &&
      Number.isFinite(ws) &&
      gRad != null &&
      Number.isFinite(gRad);

    const utciRes = hasCoreInputs ? computeUtciForEpwRow(r, utciOpts) : null;
    if (hasCoreInputs && utciRes == null) {
      utciOutOfRange += 1;
      continue;
    }
    if (utciRes == null) continue;
    const ok = utciComfortableC(utciRes.utci);

    comfortAllD += 1;
    if (ok) comfortAllN += 1;

    const h = r.hour as number;
    const m = r.month as number;
    const day = r.day as number;

    if (inHourRange(h, UTCI_CLOCK_WINDOWS.day.start, UTCI_CLOCK_WINDOWS.day.end + 1)) {
      comfortDayD += 1;
      if (ok) comfortDayN += 1;

      const s = seasonForDate(m, day, hemisphere);
      comfortSeasonD[s] += 1;
      if (ok) comfortSeasonN[s] += 1;
    }

    if (inHourRange(h, UTCI_CLOCK_WINDOWS.morning.start, UTCI_CLOCK_WINDOWS.morning.end + 1)) {
      comfortMorningD += 1;
      if (ok) comfortMorningN += 1;
    }
    if (inHourRange(h, UTCI_CLOCK_WINDOWS.midday.start, UTCI_CLOCK_WINDOWS.midday.end + 1)) {
      comfortMiddayD += 1;
      if (ok) comfortMiddayN += 1;
    }
    if (inHourRange(h, UTCI_CLOCK_WINDOWS.afternoon.start, UTCI_CLOCK_WINDOWS.afternoon.end + 1)) {
      comfortAfternoonD += 1;
      if (ok) comfortAfternoonN += 1;
    }
  }

  const useDirectNormal = dni.length > 0;
  const peakRadSi = max(useDirectNormal ? dni : ghi);

  return {
    hiC: max(tempsC),
    loC: min(tempsC),
    avgC: mean(tempsC),
    hddC: tempsC.length > 0 ? hddCSum : NaN,
    cddC: tempsC.length > 0 ? cddCSum : NaN,
    peakRadSi,
    peakRadHint: useDirectNormal ? 'Direct normal' : 'Global horizontal',
    avgHumid: mean(humid),
    avgCloudPct: mean(cloudTenths) * 10,
    avgWindMs: mean(windMs),
    totalPrecipMm: precipCount > 0 ? precipMmSum : NaN,
    comfortAll: pct(comfortAllN, comfortAllD),
    comfort7am7pmAnnual: pct(comfortDayN, comfortDayD),
    comfortDayParts: {
      morning: pct(comfortMorningN, comfortMorningD),
      midday: pct(comfortMiddayN, comfortMiddayD),
      afternoon: pct(comfortAfternoonN, comfortAfternoonD),
    },
    comfort7to19BySeason: {
      spring: pct(comfortSeasonN.spring, comfortSeasonD.spring),
      summer: pct(comfortSeasonN.summer, comfortSeasonD.summer),
      fall: pct(comfortSeasonN.fall, comfortSeasonD.fall),
      winter: pct(comfortSeasonN.winter, comfortSeasonD.winter),
    },
    utciOutOfRange,
  };
}

function formatQuickStats(si: ReturnType<typeof computeQuickStatsSi>, unitSystem: UnitSystem) {
  const imp = unitSystem === 'imperial';
  const tUnit = imp ? UNIT_F : UNIT_C;
  const hi = imp ? cToF(si.hiC) : si.hiC;
  const lo = imp ? cToF(si.loC) : si.loC;
  const avg = imp ? cToF(si.avgC) : si.avgC;
  const peakRad = Number.isFinite(si.peakRadSi)
    ? convertValue(si.peakRadSi, 'Wh/m²', unitSystem)
    : NaN;
  const radUnit = convertUnit('Wh/m²', unitSystem);
  const avgWind = Number.isFinite(si.avgWindMs)
    ? convertValue(si.avgWindMs, 'm/s', unitSystem)
    : NaN;
  const windUnit = convertUnit('m/s', unitSystem);
  const precip = Number.isFinite(si.totalPrecipMm)
    ? convertValue(si.totalPrecipMm, 'mm', unitSystem)
    : NaN;
  const precipUnit = convertUnit('mm', unitSystem);
  const hdd = Number.isFinite(si.hddC) ? (imp ? si.hddC * (9 / 5) : si.hddC) : NaN;
  const cdd = Number.isFinite(si.cddC) ? (imp ? si.cddC * (9 / 5) : si.cddC) : NaN;
  const ddBaseLabel = imp ? '65°F' : '18.3°C';

  return {
    highTemp: `${formatNumber(hi, 1)} ${tUnit}`,
    lowTemp: `${formatNumber(lo, 1)} ${tUnit}`,
    avgTemp: `${formatNumber(avg, 1)} ${tUnit}`,
    peakRad: `${formatNumber(peakRad, 0)} ${radUnit}`,
    peakRadHint: si.peakRadHint,
    avgHumidity: `${formatNumber(si.avgHumid, 0)} %`,
    avgCloudCover: `${formatNumber(si.avgCloudPct, 0)} %`,
    avgWind: `${formatNumber(avgWind, 1)} ${windUnit}`,
    totalPrecip: Number.isFinite(precip) ? `${formatNumber(precip, imp ? 1 : 0)} ${precipUnit}` : '—',
    hdd: Number.isFinite(hdd) ? `${Math.round(hdd).toLocaleString()} dd` : '—',
    cdd: Number.isFinite(cdd) ? `${Math.round(cdd).toLocaleString()} dd` : '—',
    ddBaseLabel,
    comfortAll: si.comfortAll,
    comfort7am7pmAnnual: si.comfort7am7pmAnnual,
    comfortDayParts: si.comfortDayParts,
    comfort7to19BySeason: si.comfort7to19BySeason,
    utciOutOfRange: si.utciOutOfRange,
  };
}

/**
 * 4×2 layout: stacked sidebar matching card row heights; weather stats top, comfort stats bottom.
 * Comfort aside uses `id="grid4x2-comfort-stats"` for export grouping with the bottom-right chart.
 */
export const Grid4x2StatsColumn = React.memo(function Grid4x2StatsColumn({
  theme,
  rows,
  unitSystem,
  exportMode,
  siteLatitude = null,
  metadata = null,
  filter,
}: {
  theme: 'light' | 'dark';
  rows?: EPWDataRow[];
  unitSystem: UnitSystem;
  /** Omit comfort-panel chrome so the combined export frame is a single border. */
  exportMode?: boolean;
  siteLatitude?: number | null;
  metadata?: EPWMetadata | null;
  filter?: GlobalFilterState;
}) {
  const effectiveLat = metadata?.lat ?? siteLatitude;
  const isFiltered = filter ? hasActiveGlobalFilter(filter) : false;

  const siStats = useMemo(
    () => computeQuickStatsSi(rows, metadata, filter),
    [rows, metadata, filter]
  );
  const stats = useMemo(() => formatQuickStats(siStats, unitSystem), [siStats, unitSystem]);

  const dark = theme === 'dark';
  const cardShell = `rounded-2xl ${dark ? 'bg-gray-800' : 'bg-white'} ${exportMode ? '' : 'glow-lg'}`;
  const heading = `truncate text-[10px] font-bold uppercase tracking-wider @[14rem]:text-[11px] ${dark ? 'text-gray-300' : 'text-gray-600'}`;
  const groupLabel = `truncate text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const labelInk = dark ? 'text-gray-300' : 'text-gray-600';
  const mutedInk = dark ? 'text-gray-400' : 'text-gray-500';
  const valueInk = dark ? 'text-gray-100' : 'text-gray-900';
  const groupBg = dark ? 'bg-gray-700/40' : 'bg-white glow-sm';
  const group = `flex w-full min-w-0 flex-col items-start gap-1 rounded-xl px-2.5 py-1.5 @[14rem]:py-2 ${groupBg}`;

  const Value = ({ value, emphasis = false }: { value: string; emphasis?: boolean }) => {
    const [rawNum, ...unit] = value.split(' ');
    const num = rawNum.replace(/^-/, '\u2212');
    return (
      <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap leading-none tabular-nums">
        <span
          className={`${emphasis ? 'text-sm font-semibold @[14rem]:text-[15px]' : 'text-xs font-medium @[14rem]:text-[13px]'} leading-none ${valueInk}`}
        >
          {num}
        </span>
        {unit.length ? (
          <span className={`text-[10px] font-normal ${mutedInk}`}>{unit.join(' ')}</span>
        ) : null}
      </span>
    );
  };

  /**
   * Name plus a muted detail (date or hour range). The detail waits until the column can hold
   * "Winter Dec 21–Mar 20" beside its value; narrower columns keep the name only.
   */
  const DetailLabel = ({ name, detail }: { name: string; detail: string }) => (
    <>
      {name}
      <span className={`hidden @[16rem]:inline ${mutedInk}`}> {detail}</span>
    </>
  );

  /** `"Spring (Mar 21–Jun 20)"` → name + date range. */
  const SeasonLabel = ({ label }: { label: string }) => {
    const [name, range = ''] = label.split(' (');
    return <DetailLabel name={name} detail={range.replace(/\)$/, '')} />;
  };

  /**
   * One tight pair: the number sits immediately after its label. Rows stack left-aligned so a
   * short label is never stranded on the left with its value on the far right.
   */
  const Row = ({
    label,
    value,
    title,
    hint,
    emphasis = false,
  }: {
    label: React.ReactNode;
    value: string;
    title?: string;
    hint?: string;
    emphasis?: boolean;
  }) => (
    <div className="flex max-w-full min-w-0 flex-col gap-0.5">
      <div className="grid max-w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-1.5">
        <span
          className={`min-w-0 truncate text-[11px] leading-none @[14rem]:text-xs ${labelInk}`}
          title={title}
        >
          {label}
        </span>
        <Value value={value} emphasis={emphasis} />
      </div>
      {hint ? <span className={`truncate text-[10px] leading-none ${mutedInk}`}>{hint}</span> : null}
    </div>
  );

  const panelInner =
    'flex min-h-0 w-full flex-1 flex-col gap-1.5 overflow-y-auto p-2.5 @[14rem]:gap-2 @[14rem]:p-3 [&>*]:shrink-0';

  const periodHeading = isFiltered ? 'Filtered weather' : 'Annual weather';
  const periodWord = isFiltered ? 'Filtered' : 'Annual';

  return (
    <div className="contents">
      <aside className={`@container col-start-2 row-start-1 flex min-h-0 min-w-0 flex-col ${cardShell}`}>
        <div className={panelInner}>
          <p className={heading}>{periodHeading}</p>
          <div className={group}>
            <p className={groupLabel}>Temperature</p>
            <Row label="Average" value={stats.avgTemp} emphasis />
            <Row label="High" value={stats.highTemp} />
            <Row label="Low" value={stats.lowTemp} />
          </div>
          <div className={group}>
            <p className={groupLabel}>Sun &amp; sky</p>
            <Row label="Peak radiation" hint={stats.peakRadHint} value={stats.peakRad} />
            <Row label="Avg humidity" value={stats.avgHumidity} />
            <Row label="Avg cloud cover" value={stats.avgCloudCover} />
          </div>
          <div className={group}>
            <p className={groupLabel}>Wind &amp; moisture</p>
            <Row label="Avg wind" value={stats.avgWind} />
            <Row label="Precipitation" value={stats.totalPrecip} />
          </div>
          <div className={group}>
            <p className={groupLabel} title={`Degree days relative to ${stats.ddBaseLabel} base`}>
              Degree days ({stats.ddBaseLabel})
            </p>
            <Row label="Heating (HDD)" value={stats.hdd} />
            <Row label="Cooling (CDD)" value={stats.cdd} />
          </div>
        </div>
      </aside>

      <aside
        id="grid4x2-comfort-stats"
        className={`@container col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col ${cardShell}`}
        aria-label="Outdoor comfort summary"
      >
        <div className={panelInner}>
          <p className={heading}>Outdoor comfort</p>
          {stats.utciOutOfRange > 0 ? (
            <p className={`text-[10px] leading-normal ${mutedInk}`}>
              {stats.utciOutOfRange === 1
                ? '1 hour is outside the UTCI model range, so it is not included in these percentages.'
                : `${stats.utciOutOfRange.toLocaleString()} hours are outside the UTCI model range, so they are not included in these percentages.`}
            </p>
          ) : null}
          <div className={group}>
            <Row label="Time in comfort" value={stats.comfortAll} emphasis />
          </div>

          <div className={group}>
            <p className={groupLabel}>{UTCI_CLOCK_WINDOWS.day.label}</p>
            <Row label={periodWord} value={stats.comfort7am7pmAnnual} />
            {(['spring', 'summer', 'fall', 'winter'] as const).map(season => (
              <React.Fragment key={season}>
                <Row
                  label={<SeasonLabel label={formatAstronomicalSeasonLabel(season, hemisphereFromLatitude(effectiveLat))} />}
                  title={formatAstronomicalSeasonLabel(season, hemisphereFromLatitude(effectiveLat))}
                  value={stats.comfort7to19BySeason[season]}
                />
              </React.Fragment>
            ))}
          </div>

          <div className={group}>
            <p className={groupLabel}>{periodWord} by time of day</p>
            <Row label={<DetailLabel name="Morning" detail={UTCI_CLOCK_WINDOWS.morning.label} />} title={`Morning · ${UTCI_CLOCK_WINDOWS.morning.label}`} value={stats.comfortDayParts.morning} />
            <Row label={<DetailLabel name="Midday" detail={UTCI_CLOCK_WINDOWS.midday.label} />} title={`Midday · ${UTCI_CLOCK_WINDOWS.midday.label}`} value={stats.comfortDayParts.midday} />
            <Row label={<DetailLabel name="Afternoon" detail={UTCI_CLOCK_WINDOWS.afternoon.label} />} title={`Afternoon · ${UTCI_CLOCK_WINDOWS.afternoon.label}`} value={stats.comfortDayParts.afternoon} />
            <p className={`text-[10px] font-light italic leading-normal ${mutedInk}`}>{UTCI_HOUR_WINDOW_NOTE_SHORT}</p>
          </div>
        </div>
      </aside>
    </div>
  );
});
