import { useEffect, useState } from 'react';
import type { EPWDataRow, EPWMetadata } from '../lib/epwParser';
import { mergeHourlyWindFromMultiYearIemIntoEpw } from '../lib/iem/mergeEpwWind';
import { fetchParsedIemWindYears } from '../lib/iem/fetchIemWindYear';
import {
  messageForResolvedIemWindStation,
  resolveIemWindStationForEpw,
  stationLineForSelection,
} from '../lib/iem/resolveIemWindStation';
import type { CompareWindIemSharedControls } from '../lib/iem/windIemPrefsShared';

export interface ResolvedIemWindState {
  /** Rows used for charts (EPW file winds, or file winds merged with IEM mesonet). */
  rows: EPWDataRow[];
  loadingIem: boolean;
  /** When user asked for IEM but we fell back to the weather file. */
  iemFallbackNote: string | null;
  /** When IEM wind is successfully merged into `rows`. */
  iemActive: boolean;
  iemStationLine: string | null;
}

const initial = (rows: EPWDataRow[]): ResolvedIemWindState => ({
  rows,
  loadingIem: false,
  iemFallbackNote: null,
  iemActive: false,
  iemStationLine: null,
});

function inclusiveYears(start: number, end: number): number[] {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const out: number[] = [];
  for (let y = lo; y <= hi; y++) out.push(y);
  return out;
}

/**
 * Resolves optional IEM ASOS/RWIS hourly wind for US sites and merges onto the EPW timeline
 * (reference calendar year(s)), otherwise returns the original EPW rows.
 */
export function useResolvedIemWindRows(
  epwRows: EPWDataRow[],
  metadata: EPWMetadata | undefined,
  iem: Pick<
    CompareWindIemSharedControls,
    'source' | 'iemYearStart' | 'iemYearEnd' | 'iemStation'
  >,
  skip = false
): ResolvedIemWindState {
  const [st, setSt] = useState<ResolvedIemWindState>(() => initial(epwRows));

  useEffect(() => {
    if (skip || iem.source === 'epw') {
      setSt(prev =>
        prev.rows === epwRows &&
        !prev.loadingIem &&
        prev.iemFallbackNote === null &&
        !prev.iemActive &&
        prev.iemStationLine === null
          ? prev
          : initial(epwRows)
      );
      return;
    }

    if (!metadata) {
      const note =
        'This chart has no EPW location metadata, so an Iowa Environmental Mesonet station match cannot be run. Using wind from the weather file.';
      setSt(prev =>
        prev.rows === epwRows &&
        !prev.loadingIem &&
        prev.iemFallbackNote === note &&
        !prev.iemActive &&
        prev.iemStationLine === null
          ? prev
          : {
              rows: epwRows,
              loadingIem: false,
              iemFallbackNote: note,
              iemActive: false,
              iemStationLine: null,
            }
      );
      return;
    }

    const years = inclusiveYears(iem.iemYearStart, iem.iemYearEnd);
    if (years.length === 0) {
      const note = 'Choose at least one valid IEM year.';
      setSt(prev =>
        prev.rows === epwRows &&
        !prev.loadingIem &&
        prev.iemFallbackNote === note &&
        !prev.iemActive &&
        prev.iemStationLine === null
          ? prev
          : {
              rows: epwRows,
              loadingIem: false,
              iemFallbackNote: note,
              iemActive: false,
              iemStationLine: null,
            }
      );
      return;
    }

    let cancelled = false;
    setSt({
      rows: epwRows,
      loadingIem: true,
      iemFallbackNote: null,
      iemActive: false,
      iemStationLine: null,
    });

    (async () => {
      try {
        const res = await resolveIemWindStationForEpw(metadata, iem.iemStation);
        if (cancelled) return;

        if (res.kind !== 'eligible') {
          setSt({
            rows: epwRows,
            loadingIem: false,
            iemFallbackNote: messageForResolvedIemWindStation(res),
            iemActive: false,
            iemStationLine: null,
          });
          return;
        }

        const windByYear = await fetchParsedIemWindYears(res.selection, years);
        if (cancelled) return;

        const merged = mergeHourlyWindFromMultiYearIemIntoEpw(epwRows, metadata, years, windByYear);
        const yLo = years[0]!;
        const yHi = years[years.length - 1]!;
        const rangeLabel = yLo === yHi ? `${yLo}` : `${yLo}–${yHi}`;
        const compositeNote =
          years.length > 1 ? ` · ${years.length}-year vector mean (UTC hour matched per year)` : ` · UTC-aligned to EPW clock`;

        const stationLine = stationLineForSelection(res.selection, rangeLabel, compositeNote);

        setSt({
          rows: merged,
          loadingIem: false,
          iemFallbackNote: null,
          iemActive: true,
          iemStationLine: stationLine,
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setSt({
          rows: epwRows,
          loadingIem: false,
          iemFallbackNote: `Could not load IEM wind (${msg}). Using wind from the weather file.`,
          iemActive: false,
          iemStationLine: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [skip, iem.source, iem.iemYearStart, iem.iemYearEnd, iem.iemStation, metadata, epwRows]);

  return st;
}
