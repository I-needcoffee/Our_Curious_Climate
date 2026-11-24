import * as d3 from 'd3';
import { EPWDataRow } from './epwParser';
import { epwEquivalentHourKey, indexEpwByEquivalentHour, isFiniteNumber } from './epwClockMatch';
import {
  aggregateCellStatistic,
  circularDiffDeg,
  type HeatmapCellStatistic,
} from './globalFilter';

export type DataExplorerAggregation = 'hour' | 'day' | 'week' | 'month';

function finiteField(row: EPWDataRow | undefined, field: string): number | undefined {
  const value = row?.[field] as unknown;
  return isFiniteNumber(value) ? value : undefined;
}

/**
 * Per-cell display-space Δ values, matching the heatmap’s aggregation & cell statistic.
 * Hours are paired by month/day/hour, not file row number. A pair is omitted when either
 * side is missing, so a gap is not stored as zero and cannot bias or stretch the color scale.
 */
export function dataExplorerDiffValuesForAggregation(
  aggregation: DataExplorerAggregation,
  _data: EPWDataRow[],
  compareData: EPWDataRow[],
  colorVar: string,
  baseUnit: string,
  convertValue: (val: number | null | undefined, unit: string, isDelta?: boolean) => number,
  groupSource: EPWDataRow[] = _data,
  statistic: HeatmapCellStatistic = 'mean'
): number[] {
  const out: number[] = [];
  const compareByHour = indexEpwByEquivalentHour(compareData);
  const compareField = (row: EPWDataRow) =>
    finiteField(compareByHour.get(epwEquivalentHourKey(row)), colorVar);
  const isCircularDeg = colorVar === 'windDirection';

  const pushGroup = (values: EPWDataRow[]) => {
    const primPaired: number[] = [];
    const compPaired: number[] = [];
    for (const row of values) {
      const p = finiteField(row, colorVar);
      const c = compareField(row);
      if (p === undefined || c === undefined) continue;
      primPaired.push(p);
      compPaired.push(c);
    }
    if (!primPaired.length) return;
    const pStat = aggregateCellStatistic(primPaired, statistic, isCircularDeg);
    const cStat = aggregateCellStatistic(compPaired, statistic, isCircularDeg);
    if (!Number.isFinite(pStat) || !Number.isFinite(cStat)) return;
    const delta = isCircularDeg ? circularDiffDeg(cStat, pStat) : cStat - pStat;
    const converted = convertValue(delta, baseUnit, true);
    if (Number.isFinite(converted)) out.push(converted);
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
      const delta = isCircularDeg ? circularDiffDeg(compare, primary) : compare - primary;
      const converted = convertValue(delta, baseUnit, true);
      if (Number.isFinite(converted)) out.push(converted);
    });
  }

  return out;
}
