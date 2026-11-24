import type { EPWDataRow, ParsedEPW } from './epwParser';

function rawDryBulbExtentFromRows(rows: EPWDataRow[]): { minC: number; maxC: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    const t = r.dryBulbTemperature as number | undefined;
    if (typeof t !== 'number' || !Number.isFinite(t)) continue;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  if (!(lo <= hi) || !Number.isFinite(lo)) return null;
  return { minC: lo, maxC: hi };
}

/** Min/max dry-bulb (°C) across loaded EPW hourly rows. Fallback when no numeric samples. */
export function dryBulbExtentFromRows(rows: EPWDataRow[]): { minC: number; maxC: number } {
  return rawDryBulbExtentFromRows(rows) ?? { minC: -20, maxC: 45 };
}

export function dryBulbExtentFromFiles(files: ParsedEPW[]): { minC: number; maxC: number } {
  if (!files.length) return { minC: -20, maxC: 45 };
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of files) {
    const e = rawDryBulbExtentFromRows(f.data);
    if (!e) continue;
    if (e.minC < lo) lo = e.minC;
    if (e.maxC > hi) hi = e.maxC;
  }
  if (!(lo <= hi) || !Number.isFinite(lo)) {
    return { minC: -20, maxC: 45 };
  }
  return { minC: lo, maxC: hi };
}
