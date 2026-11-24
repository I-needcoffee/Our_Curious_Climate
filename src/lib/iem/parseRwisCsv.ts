import { knotsToMs } from './constants';
import type { ParsedIemWindRow } from './parseAsosCsv';

function parseUtcObtimeToMs(obtimeCell: string): number {
  const trimmed = obtimeCell.trim();
  const isoish = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed) ? trimmed.replace(' ', 'T') : trimmed;
  const d = Date.parse(`${isoish}Z`);
  return Number.isFinite(d) ? d : NaN;
}

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

/**
 * Parses RWIS atmos comma output: station,obtime,sknt,drct (sknt in knots).
 */
export function parseIemRwisWindCsv(csv: string): ParsedIemWindRow[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = lines[0]!.split(',').map(s => s.trim().toLowerCase());
  const iStation = header.indexOf('station');
  const iTime = header.indexOf('obtime');
  const iSknt = header.indexOf('sknt');
  const iDrct = header.indexOf('drct');

  if (iStation < 0 || iTime < 0 || iSknt < 0 || iDrct < 0) {
    throw new Error('Unexpected IEM RWIS header (expected station, obtime, sknt, drct).');
  }

  const out: ParsedIemWindRow[] = [];

  for (let r = 1; r < lines.length; r++) {
    const parts = splitCsvLine(lines[r]!);
    if (parts.length < header.length) continue;

    const station = parts[iStation]?.trim();
    const validMs = parseUtcObtimeToMs(parts[iTime] ?? '');
    if (!station || !Number.isFinite(validMs)) continue;

    const skStr = parts[iSknt]?.trim().toLowerCase();
    const drStr = parts[iDrct]?.trim().toLowerCase();

    let windMs: number | null = null;
    if (skStr && skStr !== 'null' && skStr !== '') {
      const knots = Number(skStr);
      if (Number.isFinite(knots) && knots >= 0 && knots < 250) windMs = knotsToMs(knots);
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
