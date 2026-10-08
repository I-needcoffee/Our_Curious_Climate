import React, { useMemo } from 'react';
// @ts-ignore
import tc from 'jsthermalcomfort';
import type { EPWDataRow } from '../lib/epwParser';
import type { UnitSystem } from '../App';
import { UNIT_C, UNIT_F } from '../lib/unitConversion';
import {
  ASTRONOMICAL_SEASON_LABELS,
  hemisphereFromLatitude,
  seasonForDate,
} from '../lib/seasons';

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
  const tdb = row.dryBulbTemperature as number;
  const rh = row.relativeHumidity as number;
  const wind = row.windSpeed as number;
  const ghr = row.globalHorizontalRadiation as number;
  if ([tdb, rh, wind, ghr].some(v => v === null || v === undefined || Number.isNaN(v))) return null;

  const vWind = Math.max(0.5, wind);
  const tr = tdb + 0.02 * Math.max(0, ghr);
  const result = tc.models.utci(tdb, tr, vWind, rh, 'SI', true, false);
  const utci = (result?.utci ?? result) as number;
  return Number.isFinite(utci) ? utci : null;
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
  const rad = data
    .map(r => (r.directNormalRadiation as number) ?? (r.globalHorizontalRadiation as number))
    .filter(v => v != null && Number.isFinite(v));
  const humid = data.map(r => r.relativeHumidity as number).filter(v => v != null && Number.isFinite(v));
  const cloudTenths = data.map(r => r.totalSkyCover as number).filter(v => v != null && Number.isFinite(v));

  const hiC = max(tempsC);
  const loC = min(tempsC);
  const avgC = mean(tempsC);

  const hi = unitSystem === 'imperial' ? cToF(hiC) : hiC;
  const lo = unitSystem === 'imperial' ? cToF(loC) : loC;
  const avg = unitSystem === 'imperial' ? cToF(avgC) : avgC;
  const tUnit = unitSystem === 'imperial' ? UNIT_F : UNIT_C;

  const peakRad = max(rad);
  const radUnit = 'Wh/m²';

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

  for (const r of data) {
    const utciC = computeUtciC(r);
    if (utciC == null) continue;
    const ok = utciComfortableC(utciC);

    comfortAllD += 1;
    if (ok) comfortAllN += 1;

    const h = r.hour as number;
    const m = r.month as number;
    const day = r.day as number;

    if (inHourRange(h, 7, 19)) {
      comfortDayD += 1;
      if (ok) comfortDayN += 1;

      const s = seasonForDate(m, day, hemisphere);
      comfortSeasonD[s] += 1;
      if (ok) comfortSeasonN[s] += 1;
    }

    if (inHourRange(h, 7, 10)) {
      comfortMorningD += 1;
      if (ok) comfortMorningN += 1;
    }
    if (inHourRange(h, 11, 14)) {
      comfortMiddayD += 1;
      if (ok) comfortMiddayN += 1;
    }
    if (inHourRange(h, 15, 19)) {
      comfortAfternoonD += 1;
      if (ok) comfortAfternoonN += 1;
    }
  }

  return {
    highTemp: `${formatNumber(hi, 1)} ${tUnit}`,
    lowTemp: `${formatNumber(lo, 1)} ${tUnit}`,
    avgTemp: `${formatNumber(avg, 1)} ${tUnit}`,
    peakRad: `${formatNumber(peakRad, 0)} ${radUnit}`,
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

  const cardShell =
    theme === 'dark'
      ? 'rounded-xl border border-gray-700 bg-gray-800 shadow-hard-lg'
      : 'rounded-xl border border-gray-100 bg-white shadow-hard-lg';

  const comfortShell =
    exportMode
      ? theme === 'dark'
        ? 'rounded-xl border-0 bg-gray-800 shadow-none'
        : 'rounded-xl border-0 bg-white shadow-none'
      : cardShell;

  const muted = theme === 'dark' ? 'text-gray-300' : 'text-gray-700';
  const label = theme === 'dark' ? 'text-gray-200' : 'text-gray-900';
  const breakdownTone =
    theme === 'dark' ? 'text-gray-400/85 opacity-[0.78]' : 'text-gray-500/90 opacity-[0.72]';

  const Stat = ({ title, value }: { title: string; value: string }) => (
    <div className="min-w-0 w-full">
      <div className={`truncate text-[10px] font-bold ${label}`}>{title}</div>
      <div className={`truncate text-[11px] font-medium ${muted}`}>{value}</div>
    </div>
  );

  const ComfortRow = ({ left, right }: { left: React.ReactNode; right: string }) => (
    <div className={`flex min-w-0 w-full items-baseline justify-between gap-2 ${breakdownTone}`}>
      <span className="min-w-0 shrink truncate text-[10px] font-bold leading-snug">{left}</span>
      <span className="shrink-0 text-[11px] font-medium tabular-nums leading-snug">{right}</span>
    </div>
  );

  const panelInner = 'flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-2';

  return (
    <div className="contents">
      <aside className={`col-start-2 row-start-1 flex min-h-0 min-w-0 flex-col ${cardShell}`}>
        <div className={panelInner}>
          <Stat title="High temp" value={stats.highTemp} />
          <Stat title="Low temp" value={stats.lowTemp} />
          <Stat title="Ave temp" value={stats.avgTemp} />
          <Stat title="Peak radiation" value={stats.peakRad} />
          <Stat title="Average humidity" value={stats.avgHumidity} />
          <Stat title="Average cloud cover" value={stats.avgCloudCover} />
        </div>
      </aside>

      <aside
        id="grid4x2-comfort-stats"
        className={`col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col ${comfortShell}`}
        aria-label="Outdoor comfort summary"
      >
        <div className={panelInner}>
          <Stat title="Avg time in comfort zone" value={stats.comfortAll} />

          <div className="w-full space-y-1">
            <p className={`truncate pb-0.5 text-[10px] font-bold ${label}`}>7am–7pm</p>
            <div className="space-y-1">
              <ComfortRow left="Annual" right={stats.comfort7am7pmAnnual} />
              <ComfortRow
                left={ASTRONOMICAL_SEASON_LABELS.spring}
                right={stats.comfort7to19BySeason.spring}
              />
              <ComfortRow
                left={ASTRONOMICAL_SEASON_LABELS.summer}
                right={stats.comfort7to19BySeason.summer}
              />
              <ComfortRow
                left={ASTRONOMICAL_SEASON_LABELS.fall}
                right={stats.comfort7to19BySeason.fall}
              />
              <ComfortRow
                left={ASTRONOMICAL_SEASON_LABELS.winter}
                right={stats.comfort7to19BySeason.winter}
              />
            </div>
          </div>

          <div className="w-full space-y-1">
            <p className={`truncate pb-0.5 text-[10px] font-bold ${label}`}>Annual</p>
            <div className="space-y-1">
              <ComfortRow left="Morning (7am–10am)" right={stats.comfortDayParts.morning} />
              <ComfortRow left="Midday (11am–2pm)" right={stats.comfortDayParts.midday} />
              <ComfortRow left="Afternoon (3pm–7pm)" right={stats.comfortDayParts.afternoon} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

