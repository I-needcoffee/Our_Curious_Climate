import type { RefObject } from 'react';
import { Sun, Wind } from 'lucide-react';
import { CardModal } from './CardModal';
import {
  UTCI_COLORS,
  formatUtciCategoryLabel,
  type UtciCellScenarioSummary,
} from '../lib/utciModel';
import { UNIT_C, UNIT_F } from '../lib/unitConversion';

export type UtciCellInspectPayload = {
  /** Human-readable cell identity (date / month+hour / week+hour). */
  title: string;
  /** Aggregation + statistic context. */
  subtitle: string;
  scenarios: UtciCellScenarioSummary[];
};

function convertUtciDisplay(utciC: number, unitSystem: 'metric' | 'imperial'): number {
  if (unitSystem === 'imperial') return (utciC * 9) / 5 + 32;
  return utciC;
}

function categoryTextClass(category: string, theme: 'light' | 'dark'): string {
  if (category === 'no thermal stress') {
    return theme === 'dark' ? 'text-emerald-300' : 'text-emerald-800';
  }
  if (category.includes('cold')) {
    return theme === 'dark' ? 'text-sky-300' : 'text-sky-800';
  }
  return theme === 'dark' ? 'text-orange-300' : 'text-orange-900';
}

export function UtciCellScenarioModal({
  open,
  onClose,
  theme,
  unitSystem,
  payload,
  activeIncludeSun,
  activeIncludeWind,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  unitSystem: 'metric' | 'imperial';
  payload: UtciCellInspectPayload | null;
  /** Current chart exposure — highlight matching scenario column. */
  activeIncludeSun: boolean;
  activeIncludeWind: boolean;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  if (!payload) return null;

  const unit = unitSystem === 'imperial' ? UNIT_F : UNIT_C;
  const muted = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';
  const ink = theme === 'dark' ? 'text-gray-100' : 'text-gray-900';

  return (
    <CardModal
      open={open}
      onClose={onClose}
      title="Cell comfort by protection"
      theme={theme}
      anchorRef={anchorRef}
      maxWidthPx={720}
    >
      <div className="space-y-3">
        <div>
          <p className={`m-0 text-sm font-semibold ${ink}`}>{payload.title}</p>
          <p className={`m-0 mt-0.5 text-[11px] leading-snug ${muted}`}>{payload.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {payload.scenarios.map(s => {
            const isActive =
              s.scenario.includeSun === activeIncludeSun &&
              s.scenario.includeWind === activeIncludeWind;
            const color = UTCI_COLORS[s.category] || '#94a3b8';
            const feels = Number.isFinite(s.utciC)
              ? convertUtciDisplay(s.utciC, unitSystem).toFixed(1)
              : '—';
            const comfortPct = Number.isFinite(s.comfortShare)
              ? `${(s.comfortShare * 100).toFixed(0)}%`
              : '—';

            return (
              <div
                key={s.scenario.id}
                className={`flex flex-col overflow-hidden rounded-2xl border ${
                  isActive
                    ? theme === 'dark'
                      ? 'border-blue-500/70 bg-gray-900/60 ring-1 ring-blue-500/40'
                      : 'border-blue-400 bg-white ring-1 ring-blue-300'
                    : theme === 'dark'
                      ? 'border-gray-600 bg-gray-900/40'
                      : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div
                  className="h-1.5 w-full shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <div className="flex flex-1 flex-col gap-2 p-2.5">
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className={`m-0 text-[11px] font-bold leading-tight ${ink}`}>
                        {s.scenario.shortLabel}
                      </p>
                      <p className={`m-0 mt-0.5 text-[9px] leading-snug ${muted}`}>
                        {s.scenario.label}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Sun
                        className={`h-3 w-3 ${
                          s.scenario.includeSun
                            ? theme === 'dark'
                              ? 'text-amber-400'
                              : 'text-amber-600'
                            : theme === 'dark'
                              ? 'text-gray-600 opacity-40'
                              : 'text-gray-300'
                        }`}
                        aria-hidden
                      />
                      <Wind
                        className={`h-3 w-3 ${
                          s.scenario.includeWind
                            ? theme === 'dark'
                              ? 'text-sky-400'
                              : 'text-sky-600'
                            : theme === 'dark'
                              ? 'text-gray-600 opacity-40'
                              : 'text-gray-300'
                        }`}
                        aria-hidden
                      />
                    </div>
                  </div>

                  <div>
                    <p className={`m-0 text-[9px] font-semibold uppercase tracking-wide ${muted}`}>
                      Feels like
                    </p>
                    <p className={`m-0 text-lg font-semibold tabular-nums leading-none ${ink}`}>
                      {feels}
                      <span className="ml-0.5 text-xs font-medium opacity-70">{unit}</span>
                    </p>
                  </div>

                  <div>
                    <p className={`m-0 text-[9px] font-semibold uppercase tracking-wide ${muted}`}>
                      Stress category
                    </p>
                    <p
                      className={`m-0 mt-0.5 text-[11px] font-semibold leading-snug ${categoryTextClass(
                        s.category,
                        theme
                      )}`}
                    >
                      {formatUtciCategoryLabel(s.category)}
                    </p>
                  </div>

                  <p className={`m-0 mt-auto text-[9px] ${muted}`}>
                    Comfort time {comfortPct}
                    {s.hourCount > 0 ? ` · ${s.hourCount} hr${s.hourCount === 1 ? '' : 's'}` : ''}
                    {isActive ? ' · chart view' : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <p className={`m-0 text-[10px] leading-snug ${muted}`}>
          Values use the same Low / Ave / High setting as the chart. Click a matrix scenario or the
          sun/wind badges to change what the 12×24 shows.
        </p>
      </div>
    </CardModal>
  );
}
