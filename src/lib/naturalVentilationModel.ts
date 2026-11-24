import { UNIT_C, UNIT_F } from './unitConversion';
import type { EPWDataRow } from './epwParser';
import type { GlobalFilterState } from './globalFilter';
import { rowPassesGlobalFilters } from './globalFilter';

/**
 * Outdoor conditions commonly used to screen operable-window / natural ventilation hours.
 * Defaults align with CSE “natural conditioning” guidance (~60–80 °F, RH ≤ 70%) and
 * WELL v2 discouragement above ~60% RH (user can tighten in chart settings).
 */
export interface NaturalVentilationCriteria {
  /** Inclusive lower dry-bulb bound (°C, EPW column 6). */
  tempMinC: number;
  /** Inclusive upper dry-bulb bound (°C). */
  tempMaxC: number;
  /** Maximum outdoor relative humidity (%). */
  maxRhPct: number;
}

const fToC = (f: number) => ((f - 32) * 5) / 9;

export const DEFAULT_NV_CRITERIA: NaturalVentilationCriteria = {
  tempMinC: fToC(60), // 15.556 °C = 60.0 °F
  tempMaxC: fToC(80), // 26.667 °C = 80.0 °F
  maxRhPct: 70,
};

export const NV_CRITERIA_PRESETS: {
  id: string;
  label: string;
  shortLabel: string;
  criteria: NaturalVentilationCriteria;
}[] = [
  {
    id: 'cse-broad',
    label: 'Broad (60–80 °F, RH ≤ 70%)',
    shortLabel: 'Common',
    criteria: DEFAULT_NV_CRITERIA,
  },
  {
    id: 'well-conservative',
    label: 'Conservative (64–78 °F, RH ≤ 60%)',
    shortLabel: 'Conservative',
    criteria: { tempMinC: fToC(64), tempMaxC: fToC(78), maxRhPct: 60 },
  },
  {
    id: 'cooling-only',
    label: 'Cooling relief (≤ 72 °F, RH ≤ 65%)',
    shortLabel: 'Cooling',
    criteria: { tempMinC: -40, tempMaxC: fToC(72), maxRhPct: 65 },
  },
];

export function formatNvPresetLabel(
  preset: (typeof NV_CRITERIA_PRESETS)[number],
  unitSystem: 'metric' | 'imperial'
): string {
  const fmtT = (c: number) =>
    unitSystem === 'imperial'
      ? `${Math.round((c * 9) / 5 + 32)} ${UNIT_F}`
      : `${c.toFixed(1)} ${UNIT_C}`;
  const { tempMinC, tempMaxC, maxRhPct } = preset.criteria;
  const range =
    preset.id === 'cooling-only'
      ? `≤ ${fmtT(tempMaxC)}`
      : `${fmtT(tempMinC).replace(/ °[CF]$/, '')}–${fmtT(tempMaxC)}`;
  const name = preset.id === 'cse-broad' ? 'Broad' : preset.id === 'well-conservative' ? 'Conservative' : 'Cooling relief';
  return `${name} (${range}, RH ≤ ${maxRhPct.toFixed(0)}%)`;
}

export function rowInNvTempRange(
  row: EPWDataRow,
  criteria: NaturalVentilationCriteria
): boolean | null {
  const t = row.dryBulbTemperature as number | null | undefined;
  if (t == null || Number.isNaN(t)) return null;
  return t >= criteria.tempMinC && t <= criteria.tempMaxC;
}

export function rowInNvRhRange(
  row: EPWDataRow,
  criteria: NaturalVentilationCriteria
): boolean | null {
  const rh = row.relativeHumidity as number | null | undefined;
  if (rh == null || Number.isNaN(rh)) return null;
  return rh <= criteria.maxRhPct;
}

export function rowSuitableForNaturalVentilation(
  row: EPWDataRow,
  criteria: NaturalVentilationCriteria
): boolean | null {
  const inTemp = rowInNvTempRange(row, criteria);
  const inRh = rowInNvRhRange(row, criteria);
  if (inTemp == null || inRh == null) return null;
  return inTemp && inRh;
}

export type NvHourStats = {
  suitableHours: number;
  totalHours: number;
  suitablePct: number;
  byMonth: { month: number; suitable: number; total: number; pct: number }[];
};

export type NvPresetQuickStat = {
  id: string;
  shortLabel: string;
  suitableHours: number;
  suitablePct: number;
};

export type NvCriteriaBreakdown = {
  totalHours: number;
  suitableHours: number;
  suitablePct: number;
  tempOnlyHours: number;
  tempOnlyPct: number;
  rhOnlyHours: number;
  rhOnlyPct: number;
  tempOkRhFailHours: number;
  tempOkRhFailPct: number;
  rhOkTempFailHours: number;
  rhOkTempFailPct: number;
};

export type NvFilteredStatsBundle = {
  totalHours: number;
  presetStats: NvPresetQuickStat[];
  activeBreakdown: NvCriteriaBreakdown;
};

function pctOf(n: number, d: number): number {
  return d ? (n / d) * 100 : NaN;
}

export function computeNvFilteredStatsBundle(
  rows: EPWDataRow[],
  filter: GlobalFilterState,
  activeCriteria: NaturalVentilationCriteria
): NvFilteredStatsBundle {
  const presetCounts = Object.fromEntries(NV_CRITERIA_PRESETS.map(p => [p.id, 0])) as Record<
    string,
    number
  >;

  let totalHours = 0;
  let suitableHours = 0;
  let tempOnlyHours = 0;
  let rhOnlyHours = 0;
  let tempOkRhFailHours = 0;
  let rhOkTempFailHours = 0;

  for (const row of rows) {
    if (!rowPassesGlobalFilters(row, filter)) continue;

    const inTemp = rowInNvTempRange(row, activeCriteria);
    const inRh = rowInNvRhRange(row, activeCriteria);
    if (inTemp == null || inRh == null) continue;

    totalHours += 1;

    for (const preset of NV_CRITERIA_PRESETS) {
      if (rowSuitableForNaturalVentilation(row, preset.criteria)) {
        presetCounts[preset.id]! += 1;
      }
    }

    if (inTemp) tempOnlyHours += 1;
    if (inRh) rhOnlyHours += 1;

    if (inTemp && inRh) {
      suitableHours += 1;
    } else if (inTemp && !inRh) {
      tempOkRhFailHours += 1;
    } else if (!inTemp && inRh) {
      rhOkTempFailHours += 1;
    }
  }

  return {
    totalHours,
    presetStats: NV_CRITERIA_PRESETS.map(preset => ({
      id: preset.id,
      shortLabel: preset.shortLabel,
      suitableHours: presetCounts[preset.id] ?? 0,
      suitablePct: pctOf(presetCounts[preset.id] ?? 0, totalHours),
    })),
    activeBreakdown: {
      totalHours,
      suitableHours,
      suitablePct: pctOf(suitableHours, totalHours),
      tempOnlyHours,
      tempOnlyPct: pctOf(tempOnlyHours, totalHours),
      rhOnlyHours,
      rhOnlyPct: pctOf(rhOnlyHours, totalHours),
      tempOkRhFailHours,
      tempOkRhFailPct: pctOf(tempOkRhFailHours, totalHours),
      rhOkTempFailHours,
      rhOkTempFailPct: pctOf(rhOkTempFailHours, totalHours),
    },
  };
}

export function computeNvHourStats(
  rows: EPWDataRow[],
  filter: GlobalFilterState,
  criteria: NaturalVentilationCriteria
): NvHourStats {
  const monthAcc = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    suitable: 0,
    total: 0,
    pct: 0,
  }));

  let suitableHours = 0;
  let totalHours = 0;

  for (const row of rows) {
    if (!rowPassesGlobalFilters(row, filter)) continue;
    const ok = rowSuitableForNaturalVentilation(row, criteria);
    if (ok == null) continue;
    totalHours += 1;
    const m = row.month as number;
    if (m >= 1 && m <= 12) {
      monthAcc[m - 1]!.total += 1;
      if (ok) monthAcc[m - 1]!.suitable += 1;
    }
    if (ok) suitableHours += 1;
  }

  for (const m of monthAcc) {
    m.pct = m.total ? (m.suitable / m.total) * 100 : NaN;
  }

  return {
    suitableHours,
    totalHours,
    suitablePct: totalHours ? (suitableHours / totalHours) * 100 : NaN,
    byMonth: monthAcc.filter(m => m.total > 0),
  };
}

export function formatNvCriteriaSummary(
  criteria: NaturalVentilationCriteria,
  unitSystem: 'metric' | 'imperial'
): string {
  const fmtT = (c: number) => {
    if (unitSystem === 'imperial') return `${((c * 9) / 5 + 32).toFixed(0)}${UNIT_F}`;
    return `${c.toFixed(1)}${UNIT_C}`;
  };
  return `${fmtT(criteria.tempMinC)}–${fmtT(criteria.tempMaxC)}, RH ≤ ${criteria.maxRhPct.toFixed(0)}%`;
}
