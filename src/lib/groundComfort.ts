import type { EPWDataRow } from './epwParser';
import { sunAltitudeDeg, utcInstantFromEpwStationClock } from './solarNightHeatmap';

/**
 * Open-site ground under a standing person.
 *
 * Solar reflectance and thermal emissivity are literature defaults the user can edit.
 * `evaporates` turns on Priestley–Taylor evaporation (grass). Pavements leave it off.
 */
export type GroundSurface = {
  id: string;
  label: string;
  /** Solar reflectance, 0–1. Absorptance of an opaque surface is 1 − reflectance. */
  solarReflectance: number;
  /** Longwave emissivity of the ground, 0–1. Used only when surface temperature is calculated. */
  emissivity: number;
  /** 0–1 irrigation. Above 0, a fraction of well-watered Priestley–Taylor evaporation is applied. */
  irrigation?: number;
  /** True when irrigation is on. Kept in step with `irrigation`. */
  evaporates?: boolean;
  /** Surface layer depth, m. Thickness changes stored heat, not emissivity. */
  thicknessM?: number;
  /** J/m³K. With thickness, sets how much heat the layer holds. */
  volumetricHeat?: number;
  /** W/m·K. With thickness, sets how fast heat leaks downward. */
  conductivity?: number;
  /**
   * Areal heat capacity of the surface layer, J/m²K.
   * Zero keeps the surface at air temperature (no stored heat).
   */
  heatCapacity?: number;
  /** Conductance from the layer into a deep temperature fixed at the air temperature, W/m²K. */
  deepConductance?: number;
};

/** How the ground enters mean radiant temperature. */
export type RadiantMode = 'station' | 'reflectance' | 'surface';

export const RADIANT_MODE_LABEL: Record<RadiantMode, string> = {
  station: 'Station',
  reflectance: '+ Reflectance',
  surface: '+ Surface heat',
};

export type GroundSite = {
  lat: number;
  lng: number;
  /** EPW LOCATION time zone, hours east of Greenwich. */
  timeZone: number;
};

/**
 * Internal fallback reflectance of 0.25 (short grass or dry bare soil) for ASHRAE-55
 * when no material has been chosen. Station mode does not use this value.
 */
export const LADYBUG_GROUND: GroundSurface = {
  id: 'ladybug',
  label: 'Grass or dry soil',
  solarReflectance: 0.25,
  emissivity: 0.95,
  evaporates: false,
  irrigation: 0,
};

/** Same radiant method with ground reflectance set to zero. */
export const NO_GROUND_REFLECTION: GroundSurface = {
  id: 'none',
  label: 'No ground reflection',
  solarReflectance: 0,
  emissivity: 0.95,
  evaporates: false,
  irrigation: 0,
};

export const GROUND_PRESETS: GroundSurface[] = [
  {
    id: 'asphalt-new',
    label: 'Asphalt, new',
    // Synnefa et al., EPIC 2006: new asphalt solar reflectance 0.06, infrared emittance 0.9.
    solarReflectance: 0.06,
    emissivity: 0.9,
    irrigation: 0,
    thicknessM: 0.1,
    volumetricHeat: 2100 * 920,
    conductivity: 0.75,
  },
  {
    id: 'asphalt',
    label: 'Asphalt, aged',
    // Synnefa et al., EPIC 2006: aged asphalt solar reflectance 0.15, infrared emittance 0.9.
    solarReflectance: 0.15,
    emissivity: 0.9,
    irrigation: 0,
    thicknessM: 0.1,
    volumetricHeat: 2100 * 920,
    conductivity: 0.75,
  },
  {
    id: 'concrete-dark',
    label: 'Concrete, dark',
    // Synnefa et al., EPIC 2006: grey concrete solar reflectance 0.20, emittance 0.9.
    solarReflectance: 0.2,
    emissivity: 0.9,
    irrigation: 0,
    thicknessM: 0.1,
    volumetricHeat: 2400 * 880,
    conductivity: 1.4,
  },
  {
    id: 'concrete',
    label: 'Concrete, light gray',
    // PCA SN2982 / LEED: new typical gray concrete solar reflectance 0.35. Emittance 0.90 (ASHRAE 2005).
    solarReflectance: 0.35,
    emissivity: 0.9,
    irrigation: 0,
    thicknessM: 0.1,
    volumetricHeat: 2400 * 880,
    conductivity: 1.4,
  },
  {
    id: 'pavers',
    label: 'Concrete pavers',
    // Lee et al. 2015: flagstone and unit paving in the 0.21–0.25 albedo group. Emittance 0.90.
    solarReflectance: 0.25,
    emissivity: 0.9,
    irrigation: 0,
    thicknessM: 0.06,
    volumetricHeat: 2300 * 880,
    conductivity: 1.0,
  },
  {
    id: 'soil',
    label: 'Bare soil',
    // Dry bare soil commonly sits near 0.20. Emittance of natural ground is high (~0.95).
    solarReflectance: 0.2,
    emissivity: 0.95,
    irrigation: 0,
    thicknessM: 0.1,
    volumetricHeat: 1500 * 800,
    conductivity: 0.5,
  },
  {
    id: 'grass-dry',
    label: 'Grass, dry',
    // Short grass albedo about 0.25 (Oke 1987; Lee et al. 2015, 0.21–0.25). Natural-surface emissivity 0.97.
    solarReflectance: 0.25,
    emissivity: 0.97,
    irrigation: 0,
    thicknessM: 0.05,
    volumetricHeat: 1500 * 800,
    conductivity: 0.5,
  },
  {
    id: 'grass-irrigated',
    label: 'Grass, irrigated',
    solarReflectance: 0.25,
    emissivity: 0.97,
    irrigation: 1,
    thicknessM: 0.05,
    volumetricHeat: 1500 * 800,
    conductivity: 0.5,
  },
  {
    id: 'mulch',
    label: 'Wood mulch',
    // Montague & Kjelgren: pine-bark mulch had the lowest conductivity and the highest surface temperature of six landscape surfaces.
    // Reflectance 0.10 is a dark-organic starting value; published mulch albedos vary, so the slider is the control.
    solarReflectance: 0.1,
    emissivity: 0.95,
    irrigation: 0,
    thicknessM: 0.08,
    volumetricHeat: 400 * 1400,
    conductivity: 0.08,
  },
  {
    id: 'turf',
    label: 'Artificial turf',
    // Melbourne backyard comparison: artificial-turf albedo 0.09 versus natural turf 0.19.
    // Conventional turf thermal emittance about 0.87 (pigment study of commercial turf).
    solarReflectance: 0.09,
    emissivity: 0.87,
    irrigation: 0,
    thicknessM: 0.02,
    volumetricHeat: 800 * 1200,
    conductivity: 0.2,
  },
];

/**
 * Cited solar-reflectance marks for the ASHRAE-55 slider.
 * These name a similar reflectance. They are not a full material model.
 */
const REFLECTANCE_LIKENESS: { at: number; label: string }[] = [
  { at: 0.06, label: 'new asphalt' },
  { at: 0.09, label: 'artificial turf' },
  { at: 0.15, label: 'aged asphalt' },
  { at: 0.2, label: 'dark concrete' },
  { at: 0.25, label: 'short grass' },
  { at: 0.35, label: 'light gray concrete' },
];

/** One line for the reflectance slider. Names a similar published reflectance, not a selected material. */
export function reflectanceLikeness(reflectance: number): string {
  const r = Math.min(0.8, Math.max(0, reflectance));
  if (r < 0.03) return 'Almost no sun bouncing off the ground.';
  const ranked = [...REFLECTANCE_LIKENESS].sort((a, b) => Math.abs(a.at - r) - Math.abs(b.at - r));
  const closest = ranked[0];
  const next = ranked[1];
  const closeEnough =
    Math.abs(next.at - r) < 0.05 && Math.abs(next.at - r) - Math.abs(closest.at - r) <= 0.02;
  return closeEnough
    ? `Similar reflectance to ${closest.label} or ${next.label}.`
    : `Similar reflectance to ${closest.label}.`;
}

/** Preset whose published reflectance is nearest. Used when the surface-temperature estimate is turned on. */
export function nearestReflectancePreset(reflectance: number): GroundSurface {
  return GROUND_PRESETS.reduce((best, preset) =>
    Math.abs(preset.solarReflectance - reflectance) < Math.abs(best.solarReflectance - reflectance) ? preset : best
  );
}

/** Fill heat capacity and conductance from thickness, and keep irrigation and evaporates in step. */
export function realizeGround(ground: GroundSurface): GroundSurface {
  const thicknessM = Math.min(0.4, Math.max(0.01, ground.thicknessM ?? 0.1));
  const volumetricHeat =
    ground.volumetricHeat ??
    (ground.heatCapacity && ground.thicknessM ? ground.heatCapacity / ground.thicknessM : 0);
  const conductivity =
    ground.conductivity ??
    (ground.deepConductance && ground.thicknessM ? ground.deepConductance * ground.thicknessM : 0);
  const irrigation = Math.min(1, Math.max(0, ground.irrigation ?? (ground.evaporates ? 1 : 0)));
  return {
    ...ground,
    thicknessM,
    volumetricHeat,
    conductivity,
    irrigation,
    evaporates: irrigation > 0.02,
    heatCapacity: volumetricHeat * thicknessM,
    deepConductance: thicknessM > 0 ? conductivity / thicknessM : 0,
  };
}

const SIGMA = 5.67e-8;
/** Shortwave absorption of a clothed person. Lindberg, Holmer & Thorsson, SOLWEIG 1.0 (2008). */
const ALPHA_SW = 0.7;
/** Longwave emissivity of the body. Same SOLWEIG reference. */
const EPS_BODY = 0.97;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Höppe / VDI 3787-2 projected area factor for a standing person. Solar altitude in degrees. */
export function standingProjectedAreaFactor(altitudeDeg: number): number {
  const alt = clamp(altitudeDeg, 0, 90);
  const rad = ((alt * Math.PI) / 180) * (0.998 - (alt * alt) / 50000);
  return Math.max(0, 0.308 * Math.cos(rad));
}

function saturationSlopeKpaPerC(taC: number): number {
  const es = 0.6108 * Math.exp((17.27 * taC) / (taC + 237.3));
  return (4098 * es) / (taC + 237.3) ** 2;
}

/**
 * Downward longwave. Prefer the EPW horizontal infrared field (W/m²).
 * Otherwise the MENEX sky formula (Błażejczyk 2005): ε=0.97 and the vapor term.
 */
function skyLongwaveWm2(row: EPWDataRow, taC: number, rhPct: number): number {
  const measured = row.horizontalInfraredRadiation as number;
  if (Number.isFinite(measured) && measured > 50 && measured < 800) return measured;

  const es = 0.6108 * Math.exp((17.27 * taC) / (taC + 237.3));
  const eHpa = Math.max(0.1, (rhPct / 100) * es * 10);
  // Ångström exponent expects vapor pressure in mmHg (1 hPa ≈ 0.75 mmHg).
  // Return raw downwelling sky irradiance (W/m²) without body emissivity so callers
  // multiplying by ground emissivity do not double-apply emissivity.
  const emisSky = clamp(0.82 - 0.25 * 10 ** (-0.094 * 0.75 * eHpa), 0.4, 0.95);
  return SIGMA * (taC + 273.15) ** 4 * emisSky;
}

function hourKey(row: EPWDataRow): string {
  const c = row.solarStandardClock;
  if (c) return `${c.month}-${c.day}-${c.hour}`;
  return `${row.month}-${row.day}-${row.hour}`;
}

function stepSurfaceTemperature(
  tsPrev: number,
  row: EPWDataRow,
  ground: GroundSurface,
  heatCapacity: number,
  deepConductance: number,
  solarWm2: number
): number {
  const ta = row.dryBulbTemperature as number;
  const wind = Math.max(0, (row.windSpeed as number) || 0);
  const ghr = Math.max(0, solarWm2);
  const rh = (row.relativeHumidity as number) || 50;
  const hc = 5.7 + 3.8 * wind;
  const eps = clamp(ground.emissivity, 0.05, 1);
  const sw = (1 - clamp(ground.solarReflectance, 0, 0.95)) * ghr;
  const lDown = skyLongwaveWm2(row, ta, rh);
  const pressure = row.atmosphericPressure as number;
  const pKpa = pressure > 50000 && pressure < 110000 ? pressure / 1000 : 101.325;
  const gamma = 0.000665 * pKpa;
  const delta = saturationSlopeKpaPerC(ta);
  const dt = 3600;
  const leak = hc + deepConductance;

  const residualAt = (ts: number) => {
    const lwUp = eps * SIGMA * (ts + 273.15) ** 4;
    const rn = sw + eps * lDown - lwUp;
    let le = 0;
    const irrigation = Math.min(1, Math.max(0, ground.irrigation ?? (ground.evaporates ? 1 : 0)));
    if (irrigation > 0 && rn > 0) {
      le = irrigation * 1.26 * (delta / (delta + gamma)) * rn;
    }
    return (heatCapacity / dt) * (ts - tsPrev) - (rn - le - leak * (ts - ta));
  };

  let ts = tsPrev;
  for (let i = 0; i < 8; i++) {
    const r = residualAt(ts);
    const r2 = residualAt(ts + 0.25);
    const slope = (r2 - r) / 0.25;
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-6) break;
    const next = clamp(ts - r / slope, ta - 20, 95);
    if (Math.abs(next - ts) < 0.02) return next;
    ts = next;
  }
  return ts;
}

/**
 * Hour-by-hour ground temperature for the surface-heat method.
 * The layer keeps heat from the previous hour, so asphalt stays warm after sunset.
 */
export function buildSurfaceTemperatureLookup(
  rows: EPWDataRow[],
  input: GroundSurface,
  groundSun: 'full' | 'diffuse' = 'full'
): Map<string, number> {
  const map = new Map<string, number>();
  const ordered = rows.filter(row => Number.isFinite(row.dryBulbTemperature as number));
  ordered.sort((a, b) => {
    const ca = a.solarStandardClock;
    const cb = b.solarStandardClock;
    const ma = ca?.month ?? (a.month as number);
    const mb = cb?.month ?? (b.month as number);
    if (ma !== mb) return ma - mb;
    const da = ca?.day ?? (a.day as number);
    const db = cb?.day ?? (b.day as number);
    if (da !== db) return da - db;
    const ha = ca?.hour ?? (a.hour as number);
    const hb = cb?.hour ?? (b.hour as number);
    return ha - hb;
  });
  const ground = realizeGround(input);
  const heatCapacity = ground.heatCapacity ?? 0;
  const deepConductance = ground.deepConductance ?? 0;
  if (!(heatCapacity > 1000) || !ordered.length) {
    for (const row of ordered) map.set(hourKey(row), row.dryBulbTemperature as number);
    return map;
  }
  let ts = ordered[0].dryBulbTemperature as number;
  for (const row of ordered) {
    const diffuse = Number.isFinite(row.diffuseHorizontalRadiation as number)
      ? Math.max(0, row.diffuseHorizontalRadiation as number)
      : Math.max(0, (row.globalHorizontalRadiation as number) || 0);
    const solar = groundSun === 'diffuse' ? diffuse : Math.max(0, (row.globalHorizontalRadiation as number) || 0);
    ts = stepSurfaceTemperature(ts, row, ground, heatCapacity, deepConductance, solar);
    map.set(hourKey(row), ts);
  }
  return map;
}

export function surfaceTemperatureForRow(
  lookup: Map<string, number> | null | undefined,
  row: EPWDataRow
): number | undefined {
  if (!lookup) return undefined;
  return lookup.get(hourKey(row));
}

/**
 * Surface temperature from a steady energy balance (no heat storage in the slab).
 * Pavement: absorbed sun + absorbed sky longwave = emitted longwave + convection.
 * Grass: same, plus FAO-56 ground-heat fractions and Priestley–Taylor (α = 1.26) evaporation.
 * Convection: McAdams (1954), hc = 5.7 + 3.8·v.
 */
export function groundSurfaceTemperatureC(opts: {
  airC: number;
  windMs: number;
  globalHorizontalWm2: number;
  skyLongwaveWm2: number;
  ground: GroundSurface;
  pressurePa?: number;
}): number {
  const ta = opts.airC;
  const hc = 5.7 + 3.8 * Math.max(0, opts.windMs);
  const eps = clamp(opts.ground.emissivity, 0.05, 1);
  const sw = (1 - clamp(opts.ground.solarReflectance, 0, 0.95)) * Math.max(0, opts.globalHorizontalWm2);
  const lDown = Math.max(0, opts.skyLongwaveWm2);
  const pKpa =
    opts.pressurePa != null && opts.pressurePa > 50000 && opts.pressurePa < 110000
      ? opts.pressurePa / 1000
      : 101.325;
  const gamma = 0.000665 * pKpa;
  const delta = saturationSlopeKpaPerC(ta);

  const residual = (ts: number) => {
    const lwUp = eps * SIGMA * (ts + 273.15) ** 4;
    const rn = sw + eps * lDown - lwUp;
    let g = 0;
    let le = 0;
    if (opts.ground.evaporates) {
      const day = sw > 20;
      g = (day ? 0.1 : 0.5) * rn;
      const available = rn - g;
      if (available > 0) le = 1.26 * (delta / (delta + gamma)) * available;
    }
    const sensible = rn - g - le;
    return hc * (ts - ta) - sensible;
  };

  let ts = ta;
  for (let i = 0; i < 12; i++) {
    const r = residual(ts);
    const r2 = residual(ts + 0.25);
    const slope = (r2 - r) / 0.25;
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-4) break;
    const next = clamp(ts - r / slope, ta - 25, 95);
    if (Math.abs(next - ts) < 0.05) {
      ts = next;
      break;
    }
    ts = next;
  }
  return ts;
}

const LADYBUG_SIGMA = 5.6697e-8;
const BODY_ABSORPTIVITY = 0.7;
const BODY_EMISSIVITY = 0.95;
const FRACT_EFF_STANDING = 0.725;
const RAD_TRANS_COEFF = 6.012;
/** Ladybug default: person turned so the sun is on the side or back. */
const SHARP = 135;

/** EnergyPlus / Ladybug sky temperature from horizontal infrared, °C. */
function ladybugSkyTemperatureC(horizIr: number, sourceEmissivity = BODY_EMISSIVITY): number {
  return (horizIr / (sourceEmissivity * LADYBUG_SIGMA)) ** 0.25 - 273.15;
}

/** Portable SolarCal projected area factor (Ap/Ad), standing, bilinear over Ladybug’s table. */
function projectionFactorStanding(altitude: number, sharp = SHARP): number {
  const apTable = [
    [0.254, 0.254, 0.228, 0.187, 0.149, 0.104, 0.059],
    [0.248, 0.248, 0.225, 0.183, 0.145, 0.102, 0.059],
    [0.239, 0.239, 0.218, 0.177, 0.138, 0.096, 0.059],
    [0.225, 0.225, 0.199, 0.165, 0.127, 0.09, 0.059],
    [0.205, 0.205, 0.182, 0.151, 0.116, 0.083, 0.059],
    [0.183, 0.183, 0.165, 0.136, 0.109, 0.078, 0.059],
    [0.167, 0.167, 0.155, 0.131, 0.107, 0.078, 0.059],
    [0.175, 0.175, 0.161, 0.131, 0.111, 0.081, 0.059],
    [0.199, 0.199, 0.178, 0.147, 0.12, 0.084, 0.059],
    [0.22, 0.22, 0.196, 0.16, 0.126, 0.088, 0.059],
    [0.238, 0.238, 0.21, 0.17, 0.133, 0.091, 0.059],
    [0.249, 0.249, 0.22, 0.177, 0.138, 0.093, 0.059],
    [0.252, 0.252, 0.223, 0.178, 0.138, 0.093, 0.059],
  ];
  const altRange = [0, 15, 30, 45, 60, 75, 90];
  const azRange = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
  const alt = clamp(altitude, 0, 90);
  const az = clamp(sharp, 0, 180);
  const span = (arr: number[], x: number) => {
    for (let i = 0; i < arr.length - 1; i++) {
      if (x >= arr[i] && x <= arr[i + 1]) return i;
    }
    return arr.length - 2;
  };
  const altI = span(altRange, alt);
  const azI = span(azRange, az);
  const ap11 = apTable[azI][altI];
  const ap12 = apTable[azI][altI + 1];
  const ap21 = apTable[azI + 1][altI];
  const ap22 = apTable[azI + 1][altI + 1];
  const az1 = azRange[azI];
  const az2 = azRange[azI + 1];
  const alt1 = altRange[altI];
  const alt2 = altRange[altI + 1];
  return (
    (ap11 * (az2 - az) * (alt2 - alt) +
      ap21 * (az - az1) * (alt2 - alt) +
      ap12 * (az2 - az) * (alt - alt1) +
      ap22 * (az - az1) * (alt - alt1)) /
    ((az2 - az1) * (alt2 - alt1))
  );
}

/**
 * ASHRAE-55 SolarCal radiant temperature, with sky longwave from the weather file.
 * Ground temperature is the air temperature unless a surface temperature is supplied.
 * Shade is a cover over the person and the ground: direct sun and ground-reflected
 * sun are off, and diffuse sky remains.
 */
export function groundMeanRadiantTemperatureC(opts: {
  row: EPWDataRow;
  ground: GroundSurface;
  site: GroundSite | null;
  personInSun: boolean;
  /** When set, this replaces air temperature as the ground temperature in the longwave term. */
  surfaceTempC?: number | null;
}): number | null {
  const row = opts.row;
  const ta = row.dryBulbTemperature as number;
  const rh = row.relativeHumidity as number;
  const wind = row.windSpeed as number;
  const ghr = row.globalHorizontalRadiation as number;
  const dhr = row.diffuseHorizontalRadiation as number;
  const dni = row.directNormalRadiation as number;
  if ([ta, rh, wind, ghr].some(v => v == null || Number.isNaN(v))) return null;

  const clock = row.solarStandardClock;
  let altitude = 0;
  if (
    opts.site &&
    Number.isFinite(opts.site.lat) &&
    Number.isFinite(opts.site.lng) &&
    Number.isFinite(opts.site.timeZone)
  ) {
    const when = utcInstantFromEpwStationClock({
      year: clock?.year ?? (row.year as number),
      month: clock?.month ?? (row.month as number),
      day: clock?.day ?? (row.day as number),
      jsHour: clock?.hour ?? (row.hour as number),
      timeZoneHours: opts.site.timeZone,
    });
    altitude = sunAltitudeDeg(opts.site.lat, opts.site.lng, when);
  }

  const beamNormal = Number.isFinite(dni) ? Math.max(0, dni) : 0;
  const sinAlt = altitude > 0 ? Math.sin((altitude * Math.PI) / 180) : 0;
  // When DHR is missing, derive diffuse from GHR minus beam horizontal rather than using raw GHR (avoids double-counting beam).
  const diffuse = Number.isFinite(dhr)
    ? Math.max(0, dhr)
    : Math.max(0, Math.max(0, ghr) - beamNormal * sinAlt);
  const reflectance = clamp(opts.ground.solarReflectance, 0, 1);
  const horizIr = skyLongwaveWm2(row, ta, rh);
  const sunlit = opts.personInSun;

  const surfaceTemp = Number.isFinite(opts.surfaceTempC as number) ? (opts.surfaceTempC as number) : ta;
  let shortMrtDelta = 0;
  if (altitude >= 2) {
    const globHoriz = diffuse + beamNormal * sinAlt;
    const dirSolar = sunlit ? projectionFactorStanding(altitude) * beamNormal : 0;
    const diffSolar = 0.5 * FRACT_EFF_STANDING * diffuse;
    const refSolar = sunlit ? 0.5 * FRACT_EFF_STANDING * globHoriz * reflectance : 0;
    const shortErf = (dirSolar + diffSolar + refSolar) * (BODY_ABSORPTIVITY / BODY_EMISSIVITY);
    shortMrtDelta = shortErf / (FRACT_EFF_STANDING * RAD_TRANS_COEFF);
  }
  const skyTemp = ladybugSkyTemperatureC(horizIr);
  const longMrtDelta = 0.5 * (skyTemp - surfaceTemp);
  return surfaceTemp + shortMrtDelta + longMrtDelta;
}

/**
 * Radiant temperature for ordinary weather-station files, as published for UTCI
 * by Błażejczyk (Geographia Polonica 2021) and calculated in BioKlima 2.6.
 *
 * Absorbed sunlight is MENEX 2005 SolGlob: total horizontal solar radiation and
 * sun height. Ground reflection is inside those equations. There is no reflectance input.
 * Skin albedo is the MENEX nude-person default, 30%.
 *
 * Longwave follows the 2021 station formula. Ground temperature is 1.25 × air
 * temperature (°C) when cloud cover is under 80% and the air is above freezing,
 * 0.9 × air temperature when the air is below freezing, and equal to the air
 * temperature when cloud cover is at least 80%. The same rule applies at night.
 *
 * Shade uses the MENEX shaded-site equation (sun height only) and holds the
 * ground at the air temperature, because the cover blocks sun from the ground.
 */
export function stationMeanRadiantTemperatureC(opts: {
  row: EPWDataRow;
  site: GroundSite | null;
  personInSun: boolean;
}): number | null {
  const row = opts.row;
  const ta = row.dryBulbTemperature as number;
  const rh = row.relativeHumidity as number;
  const ghr = row.globalHorizontalRadiation as number;
  if ([ta, rh, ghr].some(v => v == null || Number.isNaN(v))) return null;

  const altitude = solarAltitudeDegForRow(row, opts.site);
  if (altitude == null) return null;

  const kglob = Math.max(0, ghr);
  const absorb = 0.7;
  let sunlitRprim = 0;
  if (altitude > 0 && kglob > 0) {
    let raw = 0;
    if (altitude <= 12) {
      raw = 0.0014 * kglob * kglob + 0.476 * kglob - 3.8;
    } else {
      const kt = -0.0015 * altitude ** 3 + 0.1796 * altitude ** 2 + 9.6375 * altitude - 11.9;
      const ratio = kt > 1 ? kglob / kt : 0;
      if (ratio <= 0.8) raw = 0.2467 * kglob ** 0.9763;
      else if (ratio <= 1.05) raw = 3.6922 * kglob ** 0.5842;
      else if (ratio <= 1.2) raw = 43.426 * kglob ** 0.2326;
      else raw = 8.9281 * kglob ** 0.4861;
    }
    sunlitRprim = Math.max(0, raw * absorb);
  }

  let rprim = 0;
  if (opts.personInSun) {
    rprim = sunlitRprim;
  } else if (altitude > 0 && kglob > 0) {
    // MENEX shaded-site SolAlt formula, bounded by actual sunlit SolGlob absorbed radiation
    // so heavy overcast shade can never absorb more solar radiation than full sun.
    const raw = altitude <= 4 ? (1.642 + 0.254 * altitude) ** 2 : 0.9506 * altitude ** 1.039;
    rprim = Math.min(sunlitRprim, Math.max(0, raw * absorb));
  }

  const cover = row.totalSkyCover as number;
  const cloudPct = Number.isFinite(cover) && cover >= 0 && cover <= 10 ? cover * 10 : null;
  let tg = ta;
  // Apply daytime solar ground heating only when sun is up and irradiance is positive so
  // toggling Sun vs Shade never alters nighttime ground temperatures.
  if (opts.personInSun && altitude > 0 && kglob > 0 && cloudPct != null && cloudPct < 80) {
    if (ta > 0) tg = 1.25 * ta;
    else if (ta < 0) tg = 0.9 * ta;
  }

  const vp = 6.112 * 10 ** ((7.5 * ta) / (237.7 + ta)) * 0.01 * Math.max(0, rh);
  const skyFactor = 0.82 - 0.25 * 10 ** (-0.094 * 0.75 * vp);
  const la = 5.5e-8 * (273 + ta) ** 4 * skyFactor;
  const lg = 5.5e-8 * (273 + tg) ** 4;
  const mrtK = ((rprim + 0.5 * lg + 0.5 * la) / 5.384e-8) ** 0.25;
  return mrtK - 273;
}

function solarAltitudeDegForRow(row: EPWDataRow, site: GroundSite | null): number | null {
  if (
    !site ||
    !Number.isFinite(site.lat) ||
    !Number.isFinite(site.lng) ||
    !Number.isFinite(site.timeZone)
  ) {
    return null;
  }
  const clock = row.solarStandardClock;
  const when = utcInstantFromEpwStationClock({
    year: clock?.year ?? (row.year as number),
    month: clock?.month ?? (row.month as number),
    day: clock?.day ?? (row.day as number),
    jsHour: clock?.hour ?? (row.hour as number),
    timeZoneHours: site.timeZone,
  });
  return sunAltitudeDeg(site.lat, site.lng, when);
}

export const GROUND_METHOD_SUMMARY = [
  'Station uses the procedure the UTCI authors published for ordinary weather-station files (Błażejczyk, BioKlima). It takes the file’s total sunlight, the height of the sun, cloud cover, air temperature, and humidity. Sunlight reflected from the ground is already inside that sunlight equation, so there is no reflectance setting and no material choice. During sunlit daytime hours when cloud cover is under 80% and the air is above freezing, the ground is estimated at 1.25 times the air temperature in degrees Celsius. At night, at or above 80% cloud cover, or when the file has no cloud cover, the ground equals the air temperature.',
  'Reflectance uses ASHRAE-55. The only ground property in that method is solar reflectance: how much sunlight bounces off the ground onto a person. A darker ground bounces less sun, so this step alone can make a dark surface look more comfortable. ASHRAE-55 does not calculate how hot the surface gets. The ground temperature equals the air temperature unless the surface-temperature estimate is on.',
  'Shade on Station uses the same authors’ shaded-site equation, which depends on sun height, and holds the ground at the air temperature. Shade on Reflectance turns off direct sun and ground-reflected sun and leaves diffuse light from the sky.',
  'The surface-temperature estimate is separate from both the station procedure and ASHRAE-55. The layer stores heat, conducts some of it downward toward air temperature, and can evaporate. Irrigation at 100% applies Priestley–Taylor evaporation for a well-watered surface. Values between 0% and 100% are a straight mix, not a measured watering rate. Layer thickness, heat capacity, and conductivity are modeling choices. The underside of the layer is held at the air temperature, so evening warmth is weaker than a pavement whose base has also heated.',
];
