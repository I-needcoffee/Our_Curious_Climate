import { UNIT_C } from './unitConversion';

export interface EPWMetadata {
  city: string;
  state: string;
  country: string;
  source: string;
  wmo: string;
  lat: number;
  lng: number;
  timeZone: number;
  elevation: number;
  /**
   * From `HOLIDAYS/DAYLIGHT SAVINGS` fields 2–3 (DST Start / End day; `0,0` means no DST).
   * Field 1 in EPW is `LeapYear Observed`, not DST. `unspecified` if missing/ambiguous.
   */
  daylightSavings: 'yes' | 'no' | 'unspecified';
}

export interface EPWDataRow {
  date: Date;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfYear: number;
  /**
   * When DST display mode shifts `year`/`month`/`day`/`hour` to civil wall clock, this holds the
   * original EPW **standard-time** calendar used for solar geometry (SunCalc / night shading).
   */
  solarStandardClock?: { year: number; month: number; day: number; hour: number };
  [key: string]: any;
}

export interface EPWVariable {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  category: string;
  fixedMin?: number;
  fixedMax?: number;
}

export const EPW_COLUMNS: { id: string; name: string; unit: string; missing: number; index: number; category: string; fixedMin?: number; fixedMax?: number }[] = [
  /** Narrow fixed domain improves contrast for typical hourly values (heatmap legend span). */
  { id: 'dryBulbTemperature', name: 'Dry Bulb Temperature', unit: UNIT_C, missing: 99.9, index: 6, category: 'Temperature', fixedMin: 5, fixedMax: 35 },
  { id: 'dewPointTemperature', name: 'Dew Point Temperature', unit: UNIT_C, missing: 99.9, index: 7, category: 'Temperature', fixedMin: -20, fixedMax: 30 },
  { id: 'relativeHumidity', name: 'Relative Humidity', unit: '%', missing: 999, index: 8, category: 'Humidity', fixedMin: 0, fixedMax: 100 },
  { id: 'atmosphericPressure', name: 'Atmospheric Station Pressure', unit: 'Pa', missing: 999999, index: 9, category: 'Other', fixedMin: 80000, fixedMax: 110000 },
  { id: 'extraterrestrialHorizontalRadiation', name: 'Extraterrestrial Horizontal Radiation', unit: 'Wh/m²', missing: 9999, index: 10, category: 'Solar', fixedMin: 0, fixedMax: 1200 },
  { id: 'extraterrestrialDirectNormalRadiation', name: 'Extraterrestrial Direct Normal Radiation', unit: 'Wh/m²', missing: 9999, index: 11, category: 'Solar', fixedMin: 0, fixedMax: 1400 },
  { id: 'horizontalInfraredRadiation', name: 'Horizontal Infrared Radiation Intensity', unit: 'Wh/m²', missing: 9999, index: 12, category: 'Solar', fixedMin: 150, fixedMax: 500 },
  { id: 'globalHorizontalRadiation', name: 'Global Horizontal Radiation', unit: 'Wh/m²', missing: 9999, index: 13, category: 'Solar', fixedMin: 0, fixedMax: 1200 },
  { id: 'directNormalRadiation', name: 'Direct Normal Radiation', unit: 'Wh/m²', missing: 9999, index: 14, category: 'Solar', fixedMin: 0, fixedMax: 1000 },
  { id: 'diffuseHorizontalRadiation', name: 'Diffuse Horizontal Radiation', unit: 'Wh/m²', missing: 9999, index: 15, category: 'Solar', fixedMin: 0, fixedMax: 600 },
  { id: 'globalHorizontalIlluminance', name: 'Global Horizontal Illuminance', unit: 'lux', missing: 999999, index: 16, category: 'Solar', fixedMin: 0, fixedMax: 120000 },
  { id: 'directNormalIlluminance', name: 'Direct Normal Illuminance', unit: 'lux', missing: 999999, index: 17, category: 'Solar', fixedMin: 0, fixedMax: 120000 },
  { id: 'diffuseHorizontalIlluminance', name: 'Diffuse Horizontal Illuminance', unit: 'lux', missing: 999999, index: 18, category: 'Solar', fixedMin: 0, fixedMax: 60000 },
  { id: 'zenithLuminance', name: 'Zenith Luminance', unit: 'Cd/m²', missing: 9999, index: 19, category: 'Solar', fixedMin: 0, fixedMax: 40000 },
  { id: 'windDirection', name: 'Wind Direction', unit: 'deg', missing: 999, index: 20, category: 'Wind', fixedMin: 0, fixedMax: 360 },
  /** Narrow max so typical winds use more of the gradient range. */
  { id: 'windSpeed', name: 'Wind Speed', unit: 'm/s', missing: 999, index: 21, category: 'Wind', fixedMin: 0, fixedMax: 12 },
  { id: 'totalSkyCover', name: 'Total Sky Cover', unit: 'tenths', missing: 99, index: 22, category: 'Other', fixedMin: 0, fixedMax: 10 },
  { id: 'opaqueSkyCover', name: 'Opaque Sky Cover', unit: 'tenths', missing: 99, index: 23, category: 'Other', fixedMin: 0, fixedMax: 10 },
  { id: 'visibility', name: 'Visibility', unit: 'km', missing: 9999, index: 24, category: 'Other', fixedMin: 0, fixedMax: 50 },
  { id: 'ceilingHeight', name: 'Ceiling Height', unit: 'm', missing: 99999, index: 25, category: 'Other', fixedMin: 0, fixedMax: 10000 },
  { id: 'precipitableWater', name: 'Precipitable Water', unit: 'mm', missing: 999, index: 28, category: 'Precipitation', fixedMin: 0, fixedMax: 80 },
  { id: 'aerosolOpticalDepth', name: 'Aerosol Optical Depth', unit: 'thousandths', missing: 0.999, index: 29, category: 'Other', fixedMin: 0, fixedMax: 1 },
  { id: 'snowDepth', name: 'Snow Depth', unit: 'cm', missing: 999, index: 30, category: 'Precipitation', fixedMin: 0, fixedMax: 100 },
  { id: 'daysSinceLastSnowfall', name: 'Days Since Last Snowfall', unit: 'days', missing: 99, index: 31, category: 'Precipitation', fixedMin: 0, fixedMax: 90 },
  { id: 'albedo', name: 'Albedo', unit: '', missing: 999, index: 32, category: 'Other', fixedMin: 0, fixedMax: 1 },
  { id: 'liquidPrecipitationDepth', name: 'Liquid Precipitation Depth', unit: 'mm', missing: 999, index: 33, category: 'Precipitation', fixedMin: 0, fixedMax: 50 },
  { id: 'liquidPrecipitationQuantity', name: 'Liquid Precipitation Quantity', unit: 'hr', missing: 99, index: 34, category: 'Precipitation', fixedMin: 0, fixedMax: 24 },
];

export interface ParsedEPW {
  metadata: EPWMetadata;
  data: EPWDataRow[];
  variables: EPWVariable[];
  /** Original basename when known (e.g. USA_OR_…_TMY3.epw or path inside a ZIP). */
  sourceFilename?: string;
  /** Short dataset label (TMY3, TMYx …) derived from the filename when available. */
  sourceFileLabel?: string;
}

/** Attach catalog/upload identity after `parseEPW` (mutates `parsed`). */
export function attachParsedEpwSource(
  parsed: ParsedEPW,
  sourceFilename: string,
  sourceFileLabel?: string
): void {
  parsed.sourceFilename = sourceFilename;
  if (sourceFileLabel !== undefined && sourceFileLabel.trim() !== '') {
    parsed.sourceFileLabel = sourceFileLabel.trim();
  }
}

export function parseEPW(csvString: string): ParsedEPW {
  // Detect if there are multiple LOCATION blocks (concatenated EPWs), anchored to line starts
  const blocks = csvString.split(/(?=^LOCATION,)/m).filter(b => b.trim().length > 0);
  if (blocks.length > 1) {
    console.log(`Detected ${blocks.length} EPW blocks in file. Parsing the first one.`);
    return parseSingleEPW(blocks[0]);
  }
  return parseSingleEPW(csvString);
}

function parseSingleEPW(csvString: string): ParsedEPW {
  // Remove BOM if present and split into lines
  const cleanString = csvString.replace(/^\uFEFF/, '');
  const lines = cleanString.split(/\r?\n/).map(l => l.trim());
  
  // Find the LOCATION line
  let locationLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('LOCATION,')) {
      locationLineIndex = i;
      break;
    }
  }

  if (locationLineIndex === -1) {
    throw new Error("Invalid EPW file: Missing LOCATION header");
  }

  // Parse Header (LOCATION line)
  const headerParts = lines[locationLineIndex].split(',');
  let daylightSavings: EPWMetadata['daylightSavings'] = 'unspecified';
  for (let hi = 0; hi < lines.length; hi++) {
    const hl = lines[hi] ?? '';
    if (!/^HOLIDAYS\/DAYLIGHT SAVINGS/i.test(hl) && !/^HOLIDAYS,.*DAYLIGHT/i.test(hl)) continue;
    const hp = hl.split(',');
    // EnergyPlus EPW spec: hp[1] = LeapYear Observed, hp[2] = DST Start Day, hp[3] = DST End Day.
    const dstStart = (hp[2] ?? '').trim();
    const dstEnd = (hp[3] ?? '').trim();
    if (dstStart && dstEnd) {
      if (dstStart === '0' && dstEnd === '0') {
        daylightSavings = 'no';
      } else if (dstStart !== '0' && dstEnd !== '0') {
        daylightSavings = 'yes';
      }
    }
    break;
  }
  
  const metadata: EPWMetadata = {
    city: headerParts[1]?.trim() || 'Unknown',
    state: headerParts[2]?.trim() || '',
    country: headerParts[3]?.trim() || '',
    source: headerParts[4]?.trim() || '',
    wmo: headerParts[5]?.trim() || '',
    lat: parseFloat(headerParts[6]),
    lng: parseFloat(headerParts[7]),
    timeZone: parseFloat(headerParts[8]),
    elevation: parseFloat(headerParts[9]),
    daylightSavings,
  };

  const data: EPWDataRow[] = [];
  const varMinMax: Record<string, { min: number; max: number; count: number }> = {};

  EPW_COLUMNS.forEach(col => {
    varMinMax[col.id] = { min: Infinity, max: -Infinity, count: 0 };
  });

  const isMissingEpwValue = (colId: string, missing: number, val: number): boolean => {
    if (!Number.isFinite(val)) return true;
    if (val === missing) return true;
    // Per EnergyPlus EPW Data Dictionary:
    if (
      (colId === 'globalHorizontalIlluminance' ||
        colId === 'directNormalIlluminance' ||
        colId === 'diffuseHorizontalIlluminance') &&
      val >= 999900
    ) {
      return true;
    }
    if (colId === 'zenithLuminance' && val >= 9999) return true;
    // 77777 = unlimited ceiling height, 88888 = cirroform ceiling (categorical codes, not meters)
    if (colId === 'ceilingHeight' && (val === 77777 || val === 88888 || val >= 99999)) return true;
    return false;
  };

  const tzMs = Number.isFinite(metadata.timeZone) ? Math.round(metadata.timeZone * 3_600_000) : 0;
  let hasFeb29 = false;

  // Parse Data
  for (let i = locationLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const parts = line.split(',');
    // Data lines in EPW have many columns (usually 35+)
    if (parts.length < 30) continue;
    
    // Check if the first few parts are numbers (Year, Month, Day, Hour)
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const hour = parseInt(parts[3], 10);
    const rawMinute = parseInt(parts[4], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour)) continue;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (month === 2 && day === 29) hasFeb29 = true;

    // EPW hours are 1-24 (end-of-hour). Convert to 0-23 (clamped if a non-standard file uses 0-23).
    const jsHour = hour >= 1 && hour <= 24 ? hour - 1 : Math.max(0, Math.min(23, hour));
    const minute = Number.isNaN(rawMinute) ? 0 : rawMinute;
    // Use :30 interval midpoint for standard hourly EPW timestamps (minute 0 or 60) so SunCalc
    // matches `solarNightHeatmap.ts` regardless of whether a generator emits minute=0 or minute=60.
    const sampleMinute = minute === 0 || minute === 60 ? 30 : minute;

    /**
     * Convert station-local standard time → UTC instant without truncating fractional time zones
     * (Date.UTC truncates fractional hour arguments toward zero).
     */
    const utcMs = Date.UTC(year, month - 1, day, jsHour, sampleMinute) - tzMs;
    const jsDate = new Date(utcMs);

    const row: EPWDataRow = {
      date: jsDate,
      year,
      month,
      day,
      hour: jsHour,
      minute,
      dayOfYear: 1,
    };

    EPW_COLUMNS.forEach(col => {
      const parsedVal = parseFloat(parts[col.index]);
      let val: number | null = parsedVal;
      if (isMissingEpwValue(col.id, col.missing, parsedVal)) {
        val = null;
      } else {
        const mm = varMinMax[col.id];
        if (parsedVal < mm.min) mm.min = parsedVal;
        if (parsedVal > mm.max) mm.max = parsedVal;
        mm.count += 1;
      }
      row[col.id] = val;
    });

    data.push(row);
  }

  // Assign canonical dayOfYear (1..365 for standard TMY, 1..366 only if the file actually has Feb 29).
  // Using each row's historical year in mixed-year TMY files causes gaps (59→61) and overlapping days.
  const oneDay = 1000 * 60 * 60 * 24;
  const canonicalYear = hasFeb29 ? 2000 : 2001;
  const canonicalYearStart = Date.UTC(canonicalYear, 0, 0);
  for (const row of data) {
    row.dayOfYear = Math.floor((Date.UTC(canonicalYear, row.month - 1, row.day) - canonicalYearStart) / oneDay);
  }

  // Create variables list — exclude all-missing columns (count === 0) instead of fabricating [0, 100].
  const variables: EPWVariable[] = EPW_COLUMNS.filter(
    col =>
      col.id === 'dryBulbTemperature' ||
      (varMinMax[col.id].count > 0 && varMinMax[col.id].min !== varMinMax[col.id].max)
  ).map(col => {
    const minMax = varMinMax[col.id];
    return {
      id: col.id,
      name: col.name,
      unit: col.unit,
      min: minMax.count > 0 ? minMax.min : 0,
      max: minMax.count > 0 ? minMax.max : 100,
      category: col.category,
      fixedMin: col.fixedMin,
      fixedMax: col.fixedMax,
    };
  });

  return { metadata, data, variables };
}
