import { useEffect, useMemo, useState } from 'react';
import type { EPWDataRow, EPWMetadata } from '../lib/epwParser';
import { fetchParsedIemWindYear } from '../lib/iem/fetchIemWindYear';
import {
  buildEpwDryBulbStationClockLookup,
  hourlyUtcWindLookup,
  stationClockFromUtcMs,
  stationClockKey,
} from '../lib/iem/mergeEpwWind';
import { messageForResolvedIemWindStation, resolveIemWindStationForEpw } from '../lib/iem/resolveIemWindStation';
import type { CompareWindIemSharedControls } from '../lib/iem/windIemPrefsShared';
import type { ParsedIemWindRow } from '../lib/iem/parseAsosCsv';

export type IemAsosSamplesState =
  | {
      kind: 'epw';
      loading: false;
      samples: EPWDataRow[];
      yearCount: number;
      fallbackNote: null;
    }
  | {
      kind: 'iem';
      loading: boolean;
      samples: EPWDataRow[];
      yearCount: number;
      fallbackNote: string | null;
    };

function inclusiveYears(start: number, end: number): number[] {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const out: number[] = [];
  for (let y = lo; y <= hi; y++) out.push(y);
  return out;
}

function samplesToEpwRows(
  rows: ParsedIemWindRow[],
  epwRows: EPWDataRow[],
  metadata: EPWMetadata
): EPWDataRow[] {
  const dryBulbLookup = epwRows.length ? buildEpwDryBulbStationClockLookup(epwRows) : null;
  // Normalize sub-hourly observations (e.g. RWIS 10–20 min reports) to 1 sample per UTC hour
  // so WindRose hour counts accurately represent hours rather than raw sub-hourly readings.
  const hourly = hourlyUtcWindLookup(rows);
  const out: EPWDataRow[] = [];

  for (const [utcHourMs, wind] of hourly) {
    if (!Number.isFinite(utcHourMs)) continue;
    const d = new Date(utcHourMs);
    const sc = stationClockFromUtcMs(utcHourMs, metadata);
    const year = d.getUTCFullYear();
    const row: EPWDataRow = {
      date: d,
      year,
      month: sc.month,
      day: sc.day,
      hour: sc.hour,
      minute: 0,
      dayOfYear: 0,
      windSpeed: wind.windMs,
      windDirection: wind.windFromDeg,
    };
    const tmyDryBulb = dryBulbLookup?.get(stationClockKey(sc.month, sc.day, sc.hour));
    if (tmyDryBulb !== undefined) {
      row.dryBulbTemperature = tmyDryBulb;
    }
    out.push(row);
  }
  return out;
}

const EMPTY_EPW_ROWS: EPWDataRow[] = [];

/**
 * Fetch raw mesonet wind samples (one row per observation) for the selected IEM year range.
 * Unlike the EPW-merge path, this keeps the full distribution across years for wind rose binning.
 */
export function useIemAsosWindSamples(
  metadata: EPWMetadata | undefined,
  iem: Pick<
    CompareWindIemSharedControls,
    'source' | 'iemYearStart' | 'iemYearEnd' | 'iemStation'
  >,
  skip = false,
  /** TMY/EPW timeline used for dry-bulb when mesonet rows have no temperature. */
  epwRows: EPWDataRow[] = EMPTY_EPW_ROWS
): IemAsosSamplesState {
  const years = useMemo(() => inclusiveYears(iem.iemYearStart, iem.iemYearEnd), [iem.iemYearStart, iem.iemYearEnd]);

  const [st, setSt] = useState<IemAsosSamplesState>(() => ({
    kind: iem.source === 'iem' ? 'iem' : 'epw',
    loading: false,
    samples: EMPTY_EPW_ROWS,
    yearCount: 1,
    fallbackNote: null,
  }));

  useEffect(() => {
    if (skip || iem.source !== 'iem') {
      setSt(prev =>
        prev.kind === 'epw' &&
        !prev.loading &&
        prev.samples.length === 0 &&
        prev.yearCount === 1 &&
        prev.fallbackNote === null
          ? prev
          : { kind: 'epw', loading: false, samples: EMPTY_EPW_ROWS, yearCount: 1, fallbackNote: null }
      );
      return;
    }

    if (!metadata) {
      const note =
        'This chart has no EPW location metadata, so an Iowa Environmental Mesonet station match cannot be run.';
      setSt(prev =>
        prev.kind === 'iem' &&
        !prev.loading &&
        prev.samples.length === 0 &&
        prev.yearCount === 1 &&
        prev.fallbackNote === note
          ? prev
          : {
              kind: 'iem',
              loading: false,
              samples: EMPTY_EPW_ROWS,
              yearCount: 1,
              fallbackNote: note,
            }
      );
      return;
    }

    if (!years.length) {
      const note = 'Choose at least one valid IEM year.';
      setSt(prev =>
        prev.kind === 'iem' &&
        !prev.loading &&
        prev.samples.length === 0 &&
        prev.yearCount === 1 &&
        prev.fallbackNote === note
          ? prev
          : { kind: 'iem', loading: false, samples: EMPTY_EPW_ROWS, yearCount: 1, fallbackNote: note }
      );
      return;
    }

    let cancelled = false;
    setSt({ kind: 'iem', loading: true, samples: [], yearCount: years.length, fallbackNote: null });

    (async () => {
      try {
        const res = await resolveIemWindStationForEpw(metadata, iem.iemStation);
        if (cancelled) return;
        if (res.kind !== 'eligible') {
          setSt({
            kind: 'iem',
            loading: false,
            samples: [],
            yearCount: 1,
            fallbackNote: messageForResolvedIemWindStation(res),
          });
          return;
        }

        const all: ParsedIemWindRow[] = [];
        for (const y of years) {
          const yr = await fetchParsedIemWindYear(res.selection, y);
          if (cancelled) return;
          all.push(...yr);
        }

        setSt({
          kind: 'iem',
          loading: false,
          samples: samplesToEpwRows(all, epwRows, metadata),
          yearCount: Math.max(1, years.length),
          fallbackNote: null,
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setSt({
          kind: 'iem',
          loading: false,
          samples: [],
          yearCount: 1,
          fallbackNote: `Could not load IEM wind (${msg}).`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [skip, iem.source, iem.iemStation, metadata, years, epwRows]);

  return st;
}
