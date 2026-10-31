import * as d3 from 'd3';
import { EPWDataRow } from './epwParser';
import { epwEquivalentHourKey, indexEpwByEquivalentHour, isFiniteNumber } from './epwClockMatch';

export type DataExplorerAggregation = 'hour' | 'day' | 'week' | 'month';

function finiteField(row: EPWDataRow | undefined, field: string): number | undefined {
  const value = row?.[field] as unknown;
  return isFiniteNumber(value) ? value : undefined;
}

function meanFinite(values: readonly (number | null | undefined)[]): number {
  const finite = values.filter(isFiniteNumber);
  if (!finite.length) return NaN;
  return d3.mean(finite) ?? NaN;
}

/**
 * Per-cell display-space Δ values, matching the heatmap’s aggregation
 * (month/week = group-mean diffs; day/hour = per-row diffs after unit conversion).
 * Hours are paired by month/day/hour, not file row number. A pair is omitted when either
 * side is missing, so a gap is not stored as zero and cannot stretch the color scale.
 *
 * @param groupSource Rows used to build month/week groups and the day/hour series (defaults
 *  to `data`). **Wind** passes filtered rows so the domain matches a heatmap that aggregates
 *  only the filtered slice.
 */
export function dataExplorerDiffValuesForAggregation(
  aggregation: DataExplorerAggregation,
  _data: EPWDataRow[],
  compareData: EPWDataRow[],
  colorVar: string,
  baseUnit: string,
  convertValue: (val: number | null | undefined, unit: string, isDelta?: boolean) => number,
  groupSource: EPWDataRow[] = _data
): number[] {
  const out: number[] = [];
  const compareByHour = indexEpwByEquivalentHour(compareData);
  const compareField = (row: EPWDataRow) =>
    finiteField(compareByHour.get(epwEquivalentHourKey(row)), colorVar);

  const pushGroup = (values: EPWDataRow[]) => {
    const primaryAvg = meanFinite(values.map(row => finiteField(row, colorVar)));
    const compareAvg = meanFinite(values.map(compareField));
    if (!Number.isFinite(primaryAvg) || !Number.isFinite(compareAvg)) return;
    out.push(convertValue(compareAvg - primaryAvg, baseUnit, true));
  };

  if (aggregation === 'month') {
    const groups = d3.group(groupSource, d => d.month, d => d.hour);
    Array.from(groups).forEach(([, hourGroups]) => {
      Array.from(hourGroups).forEach(([, values]) => pushGroup(values));
    });
  } else if (aggregation === 'week') {
    const groups = d3.group(groupSource, d => Math.floor((d.dayOfYear - 1) / 7), d => d.hour);
    Array.from(groups).forEach(([, hourGroups]) => {
      Array.from(hourGroups).forEach(([, values]) => pushGroup(values));
    });
  } else {
    groupSource.forEach(row => {
      const primary = finiteField(row, colorVar);
      const compare = compareField(row);
      if (primary === undefined || compare === undefined) return;
      out.push(convertValue(compare - primary, baseUnit, true));
    });
  }

  return out;
}
