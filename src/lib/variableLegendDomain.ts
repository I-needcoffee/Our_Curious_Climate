import { EPW_COLUMNS, type EPWDataRow, type EPWVariable } from './epwParser';
import { symmetricDiffBound } from './symmetricDiffDomain';
import { epwEquivalentHourKey, indexEpwByEquivalentHour, isFiniteNumber } from './epwClockMatch';
import { circularDiffDeg } from './globalFilter';
import {
  convertUnit,
  convertValue,
  effectiveVariableLegendBounds,
  type LegendUnitSystem,
} from './unitConversion';

export type { LegendUnitSystem } from './unitConversion';

/**
 * Look up a variable definition from the loaded file's `variables` list, falling back to
 * the canonical `EPW_COLUMNS` definition so constant/stripped columns in a comparison file
 * (e.g. `snowDepth = 0`) never silently fall back to `dryBulbTemperature` (°C).
 */
export function resolveEpwVariableDef(
  variables: EPWVariable[],
  colorVarId: string
): EPWVariable {
  const fromFile = variables.find(v => v.id === colorVarId);
  if (fromFile) return fromFile;
  const fromSpec = EPW_COLUMNS.find(c => c.id === colorVarId);
  if (fromSpec) {
    return {
      id: fromSpec.id,
      name: fromSpec.name,
      unit: fromSpec.unit,
      min: fromSpec.fixedMin ?? 0,
      max: fromSpec.fixedMax ?? 100,
      category: fromSpec.category,
      fixedMin: fromSpec.fixedMin,
      fixedMax: fromSpec.fixedMax,
    };
  }
  return (
    variables[0] ?? {
      id: colorVarId,
      name: colorVarId,
      unit: '',
      min: 0,
      max: 100,
      category: 'Other',
    }
  );
}

/** Matches `DataExplorer` / `WindExplorer` legend domain for heatmap color scales. */
export function variableLegendDomain(
  variables: EPWVariable[],
  colorVarId: string,
  unitSystem: LegendUnitSystem,
  showDifference: boolean,
  data: EPWDataRow[],
  compareData?: EPWDataRow[]
) {
  const def = resolveEpwVariableDef(variables, colorVarId);
  const bounds = effectiveVariableLegendBounds(def);
  let min = convertValue(bounds.lo, def.unit, unitSystem);
  let max = convertValue(bounds.hi, def.unit, unitSystem);
  const unit = convertUnit(def.unit, unitSystem);

  if (showDifference && compareData) {
    const compareByHour = indexEpwByEquivalentHour(compareData);
    const diffs: number[] = [];
    const isCircularDeg = def.id === 'windDirection';
    for (const row of data) {
      const primaryVal = row[def.id] as unknown;
      const compareVal = compareByHour.get(epwEquivalentHourKey(row))?.[def.id] as unknown;
      if (!isFiniteNumber(primaryVal) || !isFiniteNumber(compareVal)) continue;
      diffs.push(isCircularDeg ? circularDiffDeg(compareVal, primaryVal) : compareVal - primaryVal);
    }
    const bound = symmetricDiffBound(diffs);
    const half = bound > 0 ? bound : 1;
    min = convertValue(-half, def.unit, unitSystem, true);
    max = convertValue(half, def.unit, unitSystem, true);
  }
  return { colorVarDef: def, cMin: min, cMax: max, cUnit: unit };
}
