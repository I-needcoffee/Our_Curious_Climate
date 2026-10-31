import type { EPWDataRow, EPWVariable } from './epwParser';
import { symmetricDiffBound } from './symmetricDiffDomain';
import { epwEquivalentHourKey, indexEpwByEquivalentHour, isFiniteNumber } from './epwClockMatch';
import {
  convertUnit,
  convertValue,
  effectiveVariableLegendBounds,
  type LegendUnitSystem,
} from './unitConversion';

export type { LegendUnitSystem } from './unitConversion';

/** Matches `DataExplorer` / `WindExplorer` legend domain for heatmap color scales. */
export function variableLegendDomain(
  variables: EPWVariable[],
  colorVarId: string,
  unitSystem: LegendUnitSystem,
  showDifference: boolean,
  data: EPWDataRow[],
  compareData?: EPWDataRow[]
) {
  const def = variables.find(v => v.id === colorVarId) ?? variables[0];
  const bounds = effectiveVariableLegendBounds(def);
  let min = convertValue(bounds.lo, def.unit, unitSystem);
  let max = convertValue(bounds.hi, def.unit, unitSystem);
  const unit = convertUnit(def.unit, unitSystem);

  if (showDifference && compareData) {
    const compareByHour = indexEpwByEquivalentHour(compareData);
    const diffs: number[] = [];
    for (const row of data) {
      const primaryVal = row[colorVarId] as unknown;
      const compareVal = compareByHour.get(epwEquivalentHourKey(row))?.[colorVarId] as unknown;
      if (!isFiniteNumber(primaryVal) || !isFiniteNumber(compareVal)) continue;
      diffs.push(compareVal - primaryVal);
    }
    const bound = symmetricDiffBound(diffs);
    const half = bound > 0 ? bound : 1;
    min = convertValue(-half, def.unit, unitSystem, true);
    max = convertValue(half, def.unit, unitSystem, true);
  }
  return { colorVarDef: def, cMin: min, cMax: max, cUnit: unit };
}
