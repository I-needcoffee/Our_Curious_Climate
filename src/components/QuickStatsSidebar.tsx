import React, { useMemo } from 'react';
import type { EPWDataRow } from '../lib/epwParser';
import type { UnitSystem } from '../App';
import { UNIT_C, UNIT_F } from '../lib/unitConversion';
import {
  formatAstronomicalSeasonLabel,
  hemisphereFromLatitude,
  seasonForDate,
} from '../lib/seasons';
import {
  computeUtciForEpwRow,
  utciRowOutsideModelRange,
  UTCI_CLOCK_WINDOWS,
  UTCI_HOUR_WINDOW_NOTE_SHORT,
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

function computeUtciC(row: EPWDataRow) {
  return computeUtciForEpwRow(row)?.utci ?? null;
}

function ratio(n: number, d: number) {
  if (!d) return NaN;
  return n / d;
}

function pct(n: number, d: number, digits = 1) {
  const r = ratio(n, d);
  return Number.isFinite(r) ? `${formatNumber(r * 100, digits)} %` : '—';
}

function computeQuickStatsFromRows(
  rows: EPWDataRow[] | undefined,
  unitSystem: UnitSystem,
  siteLatitude?: number | null
) {
  const data = (rows ?? []).filter(r => r && r.date);
  const hemisphere = hemisphereFromLatitude(siteLatitude);

  const tempsC = data.map(r => r.dryBulbTemperature as number).filter(v => v != null && Number.isFinite(v));
  const dni = data.map(r => r.directNormalRadiation as number).filter(v => v != null && Number.isFinite(v));
  const ghi = data.map(r => r.globalHorizontalRadiation as number).filter(v => v != null && Number.isFinite(v));
  const useDirectNormal = dni.length > 0;
  const peakSource = useDirectNormal ? dni : ghi;
  const peakRad = max(peakSource);
  const radUnit = 'Wh/m²';
  const peakRadHint = useDirectNormal ? 'Direct normal' : 'Global horizontal';
  const humid = data.map(r => r.relativeHumidity as number).filter(v => v != null && Number.isFinite(v));
  const cloudTenths = data.map(r => r.totalSkyCover as number).filter(v => v != null && Number.isFinite(v));

  const hiC = max(tempsC);
  const loC = min(tempsC);
  const avgC = mean(tempsC);

  const hi = unitSystem === 'imperial' ? cToF(hiC) : hiC;
  const lo = unitSystem === 'imperial' ? cToF(loC) : loC;
  const avg = unitSystem === 'imperial' ? cToF(avgC) : avgC;
  const tUnit = unitSystem === 'imperial' ? UNIT_F : UNIT_C;

  const avgHumid = mean(humid);
  const avgCloudPct = mean(cloudTenths) * 10;

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
    if (utciRowOutsideModelRange(r)) utciOutOfRange += 1;
    const utciC = computeUtciC(r);
    if (utciC == null) continue;
    const ok = utciComfortableC(utciC);

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

  return {
    highTemp: `${formatNumber(hi, 1)} ${tUnit}`,
    lowTemp: `${formatNumber(lo, 1)} ${tUnit}`,
    avgTemp: `${formatNumber(avg, 1)} ${tUnit}`,
    peakRad: `${formatNumber(peakRad, 0)} ${radUnit}`,
    peakRadHint,
    avgHumidity: `${formatNumber(avgHumid, 0)} %`,
    avgCloudCover: `${formatNumber(avgCloudPct, 0)} %`,
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

/**
 * 4×2 layout: stacked sidebar matching card row heights; weather stats top, comfort stats bottom.
 * Comfort aside uses `id="grid4x2-comfort-stats"` for export grouping with the bottom-right chart.
 */
export function Grid4x2StatsColumn({
  theme,
  rows,
  unitSystem,
  exportMode,
  siteLatitude = null,
}: {
  theme: 'light' | 'dark';
  rows?: EPWDataRow[];
  unitSystem: UnitSystem;
  /** Omit comfort-panel chrome so the combined export frame is a single border. */
  exportMode?: boolean;
  siteLatitude?: number | null;
}) {
  const stats = useMemo(
    () => computeQuickStatsFromRows(rows, unitSystem, siteLatitude),
    [rows, unitSystem, siteLatitude]
  );

  const dark = theme === 'dark';
  const cardShell = `rounded-2xl ${dark ? 'bg-gray-800' : 'bg-white'} ${exportMode ? '' : 'glow-lg'}`;
  const heading = `truncate text-[10px] font-bold uppercase tracking-wider @[14rem]:text-[11px] ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const groupLabel = `truncate text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const labelInk = dark ? 'text-gray-400' : 'text-gray-500';
  const mutedInk = dark ? 'text-gray-500' : 'text-gray-400';
  const valueInk = dark ? 'text-gray-100' : 'text-gray-900';
  const groupBg = dark ? 'bg-gray-700/40' : 'bg-gray-50';
  const group = `flex w-full min-w-0 flex-col items-start gap-1 rounded-xl px-2.5 py-1.5 @[14rem]:py-2 ${groupBg}`;

  const Value = ({ value, emphasis = false }: { value: string; emphasis?: boolean }) => {
    const [rawNum, ...unit] = value.split(' ');
    const num = rawNum.replace(/^-/, '\u2212');
    return (
      <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap leading-none tabular-nums">
        <span
          className={`${emphasis ? 'text-sm font-semibold @[14rem]:text-base' : 'text-xs font-medium @[14rem]:text-[13px]'} leading-none ${valueInk}`}
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
      <span className={`hidden @[18rem]:inline ${mutedInk}`}> {detail}</span>
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
  }: {
    label: React.ReactNode;
    value: string;
    title?: string;
    hint?: string;
  }) => (
    <div className="flex max-w-full min-w-0 flex-col gap-0.5">
      <div className="grid max-w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-1.5">
        <span
          className={`min-w-0 truncate text-[11px] leading-none @[14rem]:text-xs ${labelInk}`}
          title={title}
        >
          {label}
        </span>
        <Value value={value} />
      </div>
      {hint ? <span className={`truncate text-[10px] leading-none ${mutedInk}`}>{hint}</span> : null}
    </div>
  );

  const panelInner =
    'flex min-h-0 w-full flex-1 flex-col gap-1.5 overflow-y-auto p-2.5 @[14rem]:gap-2 @[14rem]:p-3 [&>*]:shrink-0';

  return (
    <div className="contents">
      <aside className={`@container col-start-2 row-start-1 flex min-h-0 min-w-0 flex-col ${cardShell}`}>
        <div className={panelInner}>
          <p className={heading}>Annual weather</p>
          <div className={group}>
            <p className={groupLabel}>Temperature</p>
            <Row label="High" value={stats.highTemp} />
            <Row label="Low" value={stats.lowTemp} />
            <Row label="Average" value={stats.avgTemp} />
          </div>
          <div className={group}>
            <p className={groupLabel}>Sun &amp; sky</p>
            <Row label="Peak radiation" hint={stats.peakRadHint} value={stats.peakRad} />
            <Row label="Avg humidity" hint="Relative humidity" value={stats.avgHumidity} />
            <Row label="Avg cloud cover" hint="Total sky cover" value={stats.avgCloudCover} />
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
            <Row label="Time in comfort" value={stats.comfortAll} />
          </div>

          <div className={group}>
            <p className={groupLabel}>{UTCI_CLOCK_WINDOWS.day.label}</p>
            <Row label="Annual" value={stats.comfort7am7pmAnnual} />
            {(['spring', 'summer', 'fall', 'winter'] as const).map(season => (
              <React.Fragment key={season}>
                <Row
                  label={<SeasonLabel label={formatAstronomicalSeasonLabel(season, hemisphereFromLatitude(siteLatitude))} />}
                  title={formatAstronomicalSeasonLabel(season, hemisphereFromLatitude(siteLatitude))}
                  value={stats.comfort7to19BySeason[season]}
                />
              </React.Fragment>
            ))}
          </div>

          <div className={group}>
            <p className={groupLabel}>Annual by time of day</p>
            <Row label={<DetailLabel name="Morning" detail={UTCI_CLOCK_WINDOWS.morning.label} />} title={`Morning · ${UTCI_CLOCK_WINDOWS.morning.label}`} value={stats.comfortDayParts.morning} />
            <Row label={<DetailLabel name="Midday" detail={UTCI_CLOCK_WINDOWS.midday.label} />} title={`Midday · ${UTCI_CLOCK_WINDOWS.midday.label}`} value={stats.comfortDayParts.midday} />
            <Row label={<DetailLabel name="Afternoon" detail={UTCI_CLOCK_WINDOWS.afternoon.label} />} title={`Afternoon · ${UTCI_CLOCK_WINDOWS.afternoon.label}`} value={stats.comfortDayParts.afternoon} />
            <p className={`text-[10px] font-light italic leading-normal ${mutedInk}`}>{UTCI_HOUR_WINDOW_NOTE_SHORT}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

