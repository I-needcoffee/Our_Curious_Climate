import { useEffect, useRef, useState, type ReactNode } from 'react';

export type AggregationPeriod = 'hour' | 'day' | 'week' | 'month';

const FULL: Record<AggregationPeriod, string> = {
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

const SHORT: Record<AggregationPeriod, string> = {
  hour: 'H',
  day: 'D',
  week: 'W',
  month: 'M',
};

export interface AggregationToolbarProps {
  value: AggregationPeriod;
  onChange: (v: AggregationPeriod) => void;
  theme: 'light' | 'dark';
  /** Shown on the same row after aggregation (Stats, settings, etc.) */
  trailing?: ReactNode;
  /** When the toolbar is narrower than this (px), use H/D/W/M labels */
  compactWidthThreshold?: number;
  /** DOM id on the toolbar shell (legacy single target for guided hints). */
  tutorialShellId?: string;
  /**
   * When set, each period button gets `id={`${prefix}-${period}`}` (e.g. tutorial-card-aggregation-hour).
   * Prefer this over `tutorialShellId` so hovers can target individual toggles.
   */
  tutorialPeriodIdPrefix?: string;
}

export function AggregationToolbar({
  value,
  onChange,
  theme,
  trailing,
  compactWidthThreshold = 312,
  tutorialShellId,
  tutorialPeriodIdPrefix,
}: AggregationToolbarProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const dark = theme === 'dark';

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCompact(w < compactWidthThreshold);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [compactWidthThreshold]);

  const shellId = tutorialPeriodIdPrefix ? undefined : tutorialShellId;
  return (
    <div
      id={shellId}
      ref={shellRef}
      className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-1.5"
    >
      <div
        className={`flex h-6 min-w-0 shrink flex-nowrap items-center gap-0.5 rounded-full p-0.5 ${
          dark ? 'bg-gray-700/70' : 'bg-gray-100'
        }`}
      >
        {(['hour', 'day', 'week', 'month'] as const).map((agg) => (
          <button
            key={agg}
            id={tutorialPeriodIdPrefix ? `${tutorialPeriodIdPrefix}-${agg}` : undefined}
            type="button"
            title={FULL[agg]}
            onClick={() => onChange(agg)}
            className={`inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full text-[11px] font-semibold capitalize leading-none transition-colors ${
              compact ? 'px-1.5' : 'px-2'
            } ${
              value === agg
                ? dark
                  ? 'bg-gray-500 text-white glow-sm'
                  : 'bg-white text-gray-900 glow-sm'
                : dark
                  ? 'text-gray-300 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {compact ? SHORT[agg] : FULL[agg]}
          </button>
        ))}
      </div>
      {trailing ? (
        <div className="flex shrink-0 flex-nowrap items-center gap-1">{trailing}</div>
      ) : null}
    </div>
  );
}
