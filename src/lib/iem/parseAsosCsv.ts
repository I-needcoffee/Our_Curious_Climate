export interface ParsedIemWindRow {
  station: string;
  /** Parsed from asos `valid` column (interpreted according to asos `tz`; we default to UTC ISO-like strings). */
  validMs: number;
  /** Wind speed — m/s (converted from nautical knots). */
  windMs: number | null;
  /** Degrees meteorological convention (direction wind blows **from**, matching typical EPW). */
  windFromDeg: number | null;
}

function parseUtcValidToMs(validCell: string): number {
  // Observed forma: `2020-06-01 00:54`; treat as UTC when tz=UTC in request.
  const trimmed = validCell.trim();
  const isoish = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const d = Date.parse(`${isoish}Z`);
  if (!Number.isFinite(d)) {
    return NaN;
  }
  return d;
}

/**
 * Parses asos comma output with columns like: station,valid,sknt,drct (sknt in knots).
 * Missing uses `missing=null` recommendation so cells may read `null`.
 */
export function parseIemAsosWindCsv(csv: string, knotsToMsFn: (k: number) => number): ParsedIemWindRow[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = lines[0]!.split(',').map(s => s.trim().toLowerCase());
  const iStation = header.indexOf('station');
  const iValid = header.indexOf('valid');
  const iSknt = header.indexOf('sknt');
  const iDrct = header.indexOf('drct');

  if (iStation < 0 || iValid < 0 || iSknt < 0 || iDrct < 0) {
    throw new Error('Unexpected IEM asos header (expected station, valid, sknt, drct).');
  }

  const out: ParsedIemWindRow[] = [];

  for (let r = 1; r < lines.length; r++) {
    const parts = splitCsvLine(lines[r]!);
    if (parts.length < header.length) continue;

    const station = parts[iStation]?.trim();
    const validMs = parseUtcValidToMs(parts[iValid] ?? '');
    if (!station || !Number.isFinite(validMs)) continue;

    const skStr = parts[iSknt]?.trim().toLowerCase();
    const drStr = parts[iDrct]?.trim().toLowerCase();

    let windMs: number | null = null;
    if (skStr && skStr !== 'null' && skStr !== '') {
      const knots = Number(skStr);
      if (Number.isFinite(knots) && knots >= 0 && knots < 250) windMs = knotsToMsFn(knots);
    }

    let windFromDeg: number | null = null;
    if (drStr && drStr !== 'null' && drStr !== '') {
      const d = Number(drStr);
      if (Number.isFinite(d) && d >= 0 && d <= 360) windFromDeg = d % 360;
    }

    out.push({ station, validMs, windMs, windFromDeg });
  }

  return out;
}

/** Minimal CSV splitter for asos rows (handles quotes only when whole field quoted). */
function splitCsvLine(line: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === ',' && !inQuotes) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}
