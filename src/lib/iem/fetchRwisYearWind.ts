import { fetchIemRwisWindCsv } from './rwisRequest';
import { parseIemRwisWindCsv } from './parseRwisCsv';
import type { ParsedIemWindRow } from './parseAsosCsv';

const rwisYearCache = new Map<string, Promise<ParsedIemWindRow[]>>();

function rwisCacheKey(network: string, stationId: string, year: number): string {
  return `${network.toUpperCase()}_${stationId.toUpperCase()}_${year}`;
}

function rwisYearBoundsUtc(year: number): { stsUtcIso: string; etsUtcIso: string } {
  // Extend through Jan 2 00:00 UTC so Western Hemisphere stations retain late Dec 31 local hours.
  return {
    stsUtcIso: `${year}-01-01 00:00`,
    etsUtcIso: `${year + 1}-01-02 00:00`,
  };
}

/** Cached RWIS atmos wind for one calendar year (sub-hourly samples; merged hourly downstream). */
export function fetchParsedRwisWindYear(
  network: string,
  stationId: string,
  year: number
): Promise<ParsedIemWindRow[]> {
  const ck = rwisCacheKey(network, stationId, year);
  let p = rwisYearCache.get(ck);
  if (p) return p;

  p = (async (): Promise<ParsedIemWindRow[]> => {
    const { stsUtcIso, etsUtcIso } = rwisYearBoundsUtc(year);
    const csv = await fetchIemRwisWindCsv({
      network,
      stationId,
      stsUtcIso,
      etsUtcIso,
      resultTimeZone: 'UTC',
    });
    const t = csv.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      throw new Error(`IEM RWIS response was not CSV (possibly a validation message).`);
    }
    if (/invalid timestamp/i.test(t)) {
      throw new Error(t.slice(0, 200));
    }
    return parseIemRwisWindCsv(csv);
  })();

  rwisYearCache.set(ck, p);
  p.catch(() => rwisYearCache.delete(ck));
  return p;
}
