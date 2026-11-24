/**
 * For Δ maps, use a **symmetric** range around 0: if the extrema of the differences
 * are min D₀ and max D₁, the bound is B = max(|D₀|, |D₁|) and the domain is [-B, B]
 * so 0 stays visually centered in the legend and color scale.
 */
export function symmetricDiffBound(diffs: number[]): number {
  let bound = 0;
  for (const v of diffs) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const abs = Math.abs(v);
    if (abs > bound) bound = abs;
  }
  return bound;
}
