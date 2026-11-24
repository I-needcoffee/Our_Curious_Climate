import { fetchIemAsosWindCsv } from './asosRequest';
import { knotsToMs } from './constants';
import { parseIemAsosWindCsv, type ParsedIemWindRow } from './parseAsosCsv';

const asosYearCache = new Map<string, Promise<ParsedIemWindRow[]>>();

function asosCacheKey(stationId: string, year: number): string {
  return `${stationId.toUpperCase()}_${year}`;
}

function asosYearBoundsUtc(year: number): { stsUtcIso: string; etsUtcIso: string } {
  // Extend through Jan 2 00:00Z so Western Hemisphere stations (UTC-5 to UTC-10)
  // retain all late-evening Dec 31 local-standard-time hours.
  const stsUtcIso = `${year}-01-01T00:00:00Z`;
  const next = year + 1;
  const etsUtcIso = `${next}-01-02T00:00:00Z`;
  return { stsUtcIso, etsUtcIso };
}

/** Cached routine-report ASOS hourly wind (~:54) parsed to rows; rejects JSON error payloads. */
export function fetchParsedAsosWindYear(stationId: string, year: number): Promise<ParsedIemWindRow[]> {
  const ck = asosCacheKey(stationId, year);
  let p = asosYearCache.get(ck);
  if (p) return p;

  p = (async (): Promise<ParsedIemWindRow[]> => {
    const { stsUtcIso, etsUtcIso } = asosYearBoundsUtc(year);
    const csv = await fetchIemAsosWindCsv({
      stationId,
      stsUtcIso,
      etsUtcIso,
      resultTimeZone: 'UTC',
    });
    const t = csv.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      throw new Error(`IEM ASOS CSV response was not CSV (possibly a validation message).`);
    }
    return parseIemAsosWindCsv(csv, knotsToMs);
  })();

  asosYearCache.set(ck, p);
  p.catch(() => asosYearCache.delete(ck));
  return p;
}
