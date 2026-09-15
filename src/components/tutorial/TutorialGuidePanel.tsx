import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { comfortPercentHeatStyle, utciExposureScenarioIndex } from '../../lib/utciModel';
import type { ChartConfig } from '../../App';
import type { UnitSystem } from '../../App';
import type { GlobalFilterState } from '../GlobalFilterPanel';
import type { EPWDataRow } from '../../lib/epwParser';
import { getTutorialGuideCopy } from '../../lib/tutorialCopy';
import {
  computeExplorerMonthlyByMonth,
  computeTutorialGuideQuickStats,
  computeTutorialNvQuickStats,
  computeTutorialUtciQuickStats,
} from '../../lib/tutorialGuideStats';
import { useTutorialLive } from '../../context/TutorialLiveContext';
import { NATURAL_VENTILATION_SUITABLE_BLUE_HEX, OUTDOOR_COMFORT_GREEN_HEX } from '../../lib/constants';
import { NV_CRITERIA_PRESETS } from '../../lib/naturalVentilationModel';

export function TutorialGuidePanel({
  theme,
  slot,
  epwRows,
  filter,
  unitSystem,
}: {
  theme: 'light' | 'dark';
  slot: ChartConfig;
  epwRows?: EPWDataRow[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
}) {
  const { snapshot, requestUtciSelection, clearUtciFocus } = useTutorialLive();
  const [selectedCell, setSelectedCell] = useState<{ periodIndex: number; scenarioIndex: number } | null>(
    null
  );
  const comfortMatrixRef = useRef<HTMLDivElement>(null);

  const clearComfortHighlight = useCallback(() => {
    setSelectedCell(null);
    clearUtciFocus();
  }, [clearUtciFocus]);

  const activeScenarioIndex = utciExposureScenarioIndex(
    snapshot.includeSun ?? true,
    snapshot.includeWind ?? true
  );

  useEffect(() => {
    setSelectedCell(prev => {
      if (!prev) return null;
      if (prev.scenarioIndex === activeScenarioIndex) return prev;
      return { ...prev, scenarioIndex: activeScenarioIndex };
    });
  }, [activeScenarioIndex]);

  useEffect(() => {
    if (!selectedCell && !snapshot.utciFocusPeriodId) return;
    const onDocPointer = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('[data-export-ui]')) return;
      const root = comfortMatrixRef.current;
      if (!root?.contains(target as Node)) clearComfortHighlight();
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [selectedCell, snapshot.utciFocusPeriodId, clearComfortHighlight]);

  const explorerMonthlyByMonth = useMemo(
    () =>
      slot.type === 'explorer'
        ? computeExplorerMonthlyByMonth({
            rows: epwRows,
            filter,
            unitSystem,
            slotVariableId: slot.variable,
            live: snapshot,
          })
        : null,
    [slot.type, slot.variable, epwRows, filter, unitSystem, snapshot]
  );

  const copy = useMemo(() => {
    if (slot.type === 'empty') {
      return {
        chartTitle: 'Choose a chart',
        overviewBody:
          'This details view keeps one large chart next to plain-language notes. Pick Sun path, Data explorer, UTCI, Wind explorer, or Wind rose from the dashed tile.',
        readingTitle: 'Why one card?',
        readingBody:
          'Focusing on a single chart keeps the story simple: what you are looking at, how to read it, and a few headline numbers from your file with the same month and hour filters you set in Settings.',
      };
    }
    return getTutorialGuideCopy({
      chartType: slot.type,
      slotVariableId: slot.variable,
      slotVariableName: undefined,
      live: snapshot,
    });
  }, [slot.type, slot.variable, snapshot]);

  const statBlocks = useMemo(
    () =>
      slot.type === 'utci' || slot.type === 'naturalVentilation'
        ? []
        : computeTutorialGuideQuickStats({
            chartType: slot.type,
            rows: epwRows,
            filter,
            unitSystem,
            slotVariableId: slot.variable,
            live: snapshot,
          }),
    [slot.type, slot.variable, epwRows, filter, unitSystem, snapshot]
  );

  const utciStats = useMemo(
    () =>
      slot.type === 'utci'
        ? computeTutorialUtciQuickStats({ rows: epwRows, filter, live: snapshot })
        : null,
    [slot.type, epwRows, filter, snapshot]
  );

  const nvStats = useMemo(
    () =>
      slot.type === 'naturalVentilation'
        ? computeTutorialNvQuickStats({ rows: epwRows, filter, unitSystem, live: snapshot })
        : null,
    [slot.type, epwRows, filter, unitSystem, snapshot]
  );

  const formatNvHoursPct = (hours: number, pct: number) =>
    `${hours.toLocaleString()} hrs · ${Number.isFinite(pct) ? pct.toFixed(1) : '—'}%`;

  const surface = theme === 'dark' ? 'bg-gray-800/92 shadow-sm' : 'bg-white/95 shadow-sm';
  const ink = theme === 'dark' ? 'text-gray-100' : 'text-gray-900';
  const muted = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
  const textScale = { fontSize: 'clamp(11px, 1.05vw, 13px)', lineHeight: 1.5 } as const;

  return (
    <aside className={`flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-xl p-3 sm:p-4 ${surface}`}>
      <section className="mb-4">
        <h2 className={`text-sm font-semibold sm:text-base ${ink}`}>{copy.chartTitle}</h2>
        <p className={`mt-2 ${ink}`} style={textScale}>
          {copy.overviewBody}
        </p>
      </section>

      {slot.type !== 'empty' ? (
        <section className="mb-4 border-t border-gray-200/80 pt-3 dark:border-gray-700/80">
          <h3 className={`mb-2 text-xs font-bold uppercase tracking-wider ${muted}`}>{copy.readingTitle}</h3>
          <p className={ink} style={textScale}>
            {copy.readingBody}
          </p>
        </section>
      ) : null}

      <section className="mt-1 border-t border-gray-200/80 pt-3 dark:border-gray-700/80">
        <h3 className={`mb-2 text-xs font-bold uppercase tracking-wider ${muted}`}>Quick numbers</h3>
        <p className={`mb-3 text-[11px] leading-snug ${muted}`}>
          {slot.type === 'utci'
            ? 'Modeled UTCI from your file, using the same month, hour, and temperature filters as Settings. Sun, wind, and a selected period in the table also limit the percentages below.'
            : slot.type === 'naturalVentilation'
              ? 'Outdoor dry-bulb and humidity from your file, using the same month and hour filters as Settings. Criteria presets match the chart card.'
              : 'From your loaded file, using the same month and hour filters as the chart (if the chart is empty, this still reflects the file).'}
        </p>
        {slot.type === 'naturalVentilation' ? (
          nvStats ? (
            <div className="flex flex-col gap-4">
              <div>
                <h4 className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  Suitable hours by preset
                </h4>
                <ul className="flex flex-col gap-2">
                  {nvStats.presetStats.map(stat => {
                    const preset = NV_CRITERIA_PRESETS.find(p => p.id === stat.id);
                    return (
                      <li
                        key={stat.id}
                        className="rounded-lg border px-3 py-2"
                        style={{
                          borderColor:
                            theme === 'dark'
                              ? `${NATURAL_VENTILATION_SUITABLE_BLUE_HEX}66`
                              : `${NATURAL_VENTILATION_SUITABLE_BLUE_HEX}40`,
                          backgroundColor:
                            theme === 'dark'
                              ? `${NATURAL_VENTILATION_SUITABLE_BLUE_HEX}1a`
                              : `${NATURAL_VENTILATION_SUITABLE_BLUE_HEX}14`,
                        }}
                      >
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                          {stat.shortLabel}
                        </p>
                        <p
                          className="mt-0.5 text-sm font-bold tabular-nums"
                          style={{ color: NATURAL_VENTILATION_SUITABLE_BLUE_HEX }}
                        >
                          {formatNvHoursPct(stat.suitableHours, stat.suitablePct)}
                        </p>
                        {preset ? (
                          <p className={`mt-0.5 text-[10px] leading-snug ${muted}`}>{preset.label}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h4 className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  Active criteria breakdown
                </h4>
                <p className={`mb-2 text-[10px] leading-snug ${muted}`}>
                  {nvStats.activeCriteriaSummary} · {nvStats.totalHours.toLocaleString()} filtered hours
                </p>
                <dl className="grid w-max max-w-full grid-cols-[max-content_max-content] gap-x-2 gap-y-1.5 text-left">
                  {[
                    {
                      label: 'Temp + humidity (suitable)',
                      hours: nvStats.activeBreakdown.suitableHours,
                      pct: nvStats.activeBreakdown.suitablePct,
                      primary: true,
                    },
                    {
                      label: 'Temp range only',
                      hours: nvStats.activeBreakdown.tempOnlyHours,
                      pct: nvStats.activeBreakdown.tempOnlyPct,
                    },
                    {
                      label: 'Humidity limit only',
                      hours: nvStats.activeBreakdown.rhOnlyHours,
                      pct: nvStats.activeBreakdown.rhOnlyPct,
                    },
                    {
                      label: 'Temp OK, humidity too high',
                      hours: nvStats.activeBreakdown.tempOkRhFailHours,
                      pct: nvStats.activeBreakdown.tempOkRhFailPct,
                    },
                    {
                      label: 'Humidity OK, temp out of range',
                      hours: nvStats.activeBreakdown.rhOkTempFailHours,
                      pct: nvStats.activeBreakdown.rhOkTempFailPct,
                    },
                  ].map(row => (
                    <React.Fragment key={row.label}>
                      <dt
                        className={`text-[11px] ${row.primary ? 'font-semibold' : muted}`}
                        style={row.primary ? { color: NATURAL_VENTILATION_SUITABLE_BLUE_HEX } : undefined}
                      >
                        {row.label}
                      </dt>
                      <dd
                        className={`text-[11px] font-medium tabular-nums ${ink}`}
                        style={row.primary ? { color: NATURAL_VENTILATION_SUITABLE_BLUE_HEX } : undefined}
                      >
                        {formatNvHoursPct(row.hours, row.pct)}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            </div>
          ) : (
            <p className={`text-[11px] ${muted}`}>No hours match your current filters.</p>
          )
        ) : slot.type === 'utci' ? (
          utciStats ? (
            <div className="flex flex-col gap-4">
              <div
                className="rounded-lg border px-3 py-2"
                style={{
                  borderColor: theme === 'dark' ? `${OUTDOOR_COMFORT_GREEN_HEX}66` : `${OUTDOOR_COMFORT_GREEN_HEX}40`,
                  backgroundColor: theme === 'dark' ? `${OUTDOOR_COMFORT_GREEN_HEX}1a` : `${OUTDOOR_COMFORT_GREEN_HEX}14`,
                }}
              >
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Time in comfort</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: OUTDOOR_COMFORT_GREEN_HEX }}>
                  {Number.isFinite(utciStats.comfortPercent) ? `${utciStats.comfortPercent.toFixed(1)}%` : '—'}
                </p>
                <p className={`mt-0.5 text-[10px] leading-snug ${muted}`}>
                  No thermal stress · {utciStats.hoursCounted.toLocaleString()} filtered hours
                  {utciStats.isolationLabel ? ` · ${utciStats.isolationLabel}` : ''}
                </p>
              </div>

              <div>
                <h4 className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  UTCI categories (% of filtered hours)
                </h4>
                <ul className="flex flex-col gap-1">
                  {utciStats.categoryShares.map(share => (
                    <li
                      key={share.category}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 rounded px-1 py-0.5"
                      style={
                        share.isComfort
                          ? {
                              backgroundColor: theme === 'dark' ? `${OUTDOOR_COMFORT_GREEN_HEX}1a` : `${OUTDOOR_COMFORT_GREEN_HEX}14`,
                              boxShadow: `inset 0 0 0 1px ${theme === 'dark' ? `${OUTDOOR_COMFORT_GREEN_HEX}55` : `${OUTDOOR_COMFORT_GREEN_HEX}35`}`,
                            }
                          : undefined
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10"
                        style={{ backgroundColor: share.color }}
                        aria-hidden
                      />
                      <span
                        className={`min-w-0 text-[11px] leading-snug ${share.isComfort ? 'font-semibold' : muted}`}
                        style={share.isComfort ? { color: OUTDOOR_COMFORT_GREEN_HEX } : undefined}
                      >
                        {share.label}
                      </span>
                      <span
                        className={`shrink-0 text-[11px] font-medium tabular-nums ${share.isComfort ? '' : ink}`}
                        style={share.isComfort ? { color: OUTDOOR_COMFORT_GREEN_HEX } : undefined}
                      >
                        {share.percentage.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                  Time in comfort by period
                </h4>
                <p className={`mb-2 text-[10px] leading-snug ${muted}`}>
                  Click a cell to apply that exposure and highlight the matching time window on the chart. Greener = more
                  comfort time. Click the cell again, use Clear, or click outside the table to remove the highlight.
                </p>
                {(selectedCell || snapshot.utciFocusPeriodId) && (
                  <button
                    type="button"
                    onClick={clearComfortHighlight}
                    className={`mb-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      theme === 'dark'
                        ? 'border-orange-700/60 text-orange-200 hover:bg-orange-950/50'
                        : 'border-orange-300 text-orange-800 hover:bg-orange-50'
                    }`}
                  >
                    Clear chart highlight
                  </button>
                )}
                <div ref={comfortMatrixRef} className="-mx-1 overflow-x-auto px-1">
                  <table className="w-full min-w-0 border-separate border-spacing-0 text-left text-[10px] sm:min-w-[24rem]">
                    <thead>
                      <tr>
                        <th
                          className={`sticky left-0 z-10 pb-1 pr-1.5 font-semibold ${muted} ${
                            theme === 'dark' ? 'bg-gray-800/95' : 'bg-white/95'
                          }`}
                        >
                          Period
                        </th>
                        {utciStats.comfortMatrix.scenarios.map((scenario, si) => {
                          const colActive =
                            selectedCell != null
                              ? selectedCell.scenarioIndex === si
                              : activeScenarioIndex === si;
                          return (
                            <th
                              key={scenario.id}
                              title={scenario.label}
                              className={`max-w-[4.5rem] px-0.5 pb-1 text-center text-[9px] font-semibold leading-tight ${
                                colActive
                                  ? theme === 'dark'
                                    ? 'text-orange-300'
                                    : 'text-orange-700'
                                  : muted
                              }`}
                            >
                              {scenario.shortLabel}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {utciStats.comfortMatrix.periods.map((period, pi) => {
                        const rowSelected = selectedCell?.periodIndex === pi;
                        return (
                          <tr key={period.id}>
                            <th
                              scope="row"
                              className={`sticky left-0 z-10 max-w-[6.5rem] py-1 pr-1.5 text-left font-medium leading-snug ${
                                theme === 'dark' ? 'bg-gray-800/95' : 'bg-white/95'
                              } ${rowSelected ? (theme === 'dark' ? 'text-orange-300' : 'text-orange-800') : ink}`}
                            >
                              {period.label}
                            </th>
                            {utciStats.comfortMatrix.scenarios.map((scenario, si) => {
                              const cell = utciStats.comfortMatrix.cells[pi][si];
                              const isSelected =
                                selectedCell?.periodIndex === pi && selectedCell.scenarioIndex === si;
                              const heat = comfortPercentHeatStyle(cell.percentComfort, theme);

                              return (
                                <td key={`${period.id}-${scenario.id}`} className="px-0.5 py-0.5">
                                  <button
                                    type="button"
                                    title={`${period.label} \u00B7 ${scenario.label}`}
                                    aria-pressed={isSelected}
                                    style={heat}
                                    className={`w-full min-w-[2.75rem] rounded-md px-0.5 py-1 text-center text-[10px] font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 ${
                                      isSelected ? 'ring-2 ring-black ring-offset-1' : ''
                                    }`}
                                    onClick={() => {
                                      if (isSelected) {
                                        clearComfortHighlight();
                                        return;
                                      }
                                      setSelectedCell({ periodIndex: pi, scenarioIndex: si });
                                      requestUtciSelection({
                                        periodId: period.id,
                                        includeSun: scenario.includeSun,
                                        includeWind: scenario.includeWind,
                                      });
                                    }}
                                  >
                                    {Number.isFinite(cell.percentComfort)
                                      ? `${cell.percentComfort.toFixed(1)}%`
                                      : '\u2014'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <p className={`text-[11px] ${muted}`}>No hours match your current filters.</p>
          )
        ) : (
          <div className="flex flex-col gap-4">
            {statBlocks.map((block, bi) => (
              <div key={bi}>
                {block.heading ? (
                  <h4 className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                    {block.heading}
                  </h4>
                ) : null}
                <dl className="grid w-max max-w-full grid-cols-[max-content_max-content] gap-x-2 gap-y-1.5 text-left">
                  {block.rows.map((row, ri) => (
                    <React.Fragment key={`${bi}-${ri}`}>
                      <dt className={`text-[11px] ${muted}`}>{row.label}</dt>
                      <dd className={`text-[11px] font-medium tabular-nums ${ink}`}>{row.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      {explorerMonthlyByMonth ? (
        <section className="mt-4 border-t border-gray-200/80 pt-3 dark:border-gray-700/80">
          <h3 className={`mb-1 text-xs font-bold uppercase tracking-wider ${muted}`}>By month</h3>
          <p className={`mb-2 text-[11px] leading-snug ${muted}`}>
            <span className={`font-medium ${ink}`}>{explorerMonthlyByMonth.variableLabel}</span>
            {' â€” '}
            high, average, and low per calendar month with the same filters as the chart. When the explorer uses mean
            daily min/max for bars, those extents define high and low here too.
          </p>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[14rem] border-collapse text-left text-[11px]">
              <thead>
                <tr className={`border-b border-gray-200/80 dark:border-gray-700/80 ${muted}`}>
                  <th scope="col" className="pb-1.5 pr-2 font-semibold">
                    Month
                  </th>
                  <th scope="col" className="pb-1.5 pr-1 text-right font-semibold tabular-nums">
                    High
                  </th>
                  <th scope="col" className="pb-1.5 pr-1 text-right font-semibold tabular-nums">
                    Avg
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-semibold tabular-nums">
                    Low
                  </th>
                </tr>
              </thead>
              <tbody>
                {explorerMonthlyByMonth.cells.map(cell => (
                  <tr
                    key={cell.abbr}
                    title={cell.title}
                    className="border-b border-gray-100/90 last:border-0 dark:border-gray-700/50"
                  >
                    <th scope="row" className={`py-1 pr-2 font-semibold ${ink}`}>
                      {cell.abbr}
                    </th>
                    <td className={`py-1 pr-1 text-right font-medium tabular-nums ${ink}`}>{cell.high}</td>
                    <td className={`py-1 pr-1 text-right tabular-nums ${muted}`}>{cell.avg}</td>
                    <td className={`py-1 text-right tabular-nums ${muted}`}>{cell.low}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </aside>
  );
}
