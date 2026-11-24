import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  comfortPercentHeatStyle,
  formatUtciCategoryRange,
  UTCI_COMFORT_CATEGORY,
  utciExposureScenarioIndex,
  UTCI_HOUR_WINDOW_NOTE,
} from '../../lib/utciModel';
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
import { formatNvPresetLabel, NV_CRITERIA_PRESETS } from '../../lib/naturalVentilationModel';

export function TutorialGuidePanel({
  theme,
  slot,
  epwRows,
  filter,
  unitSystem,
  siteLatitude = null,
  siteLng = null,
  siteTimeZone = null,
}: {
  theme: 'light' | 'dark';
  slot: ChartConfig;
  epwRows?: EPWDataRow[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  siteLatitude?: number | null;
  siteLng?: number | null;
  siteTimeZone?: number | null;
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
          'This details view keeps one large chart next to plain-language notes. Pick Sun path, Data explorer, UTCI, Wind explorer, or Wind rose from the empty card.',
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
        ? computeTutorialUtciQuickStats({
            rows: epwRows,
            filter,
            live: snapshot,
            siteLatitude,
            siteLng,
            siteTimeZone,
          })
        : null,
    [slot.type, epwRows, filter, snapshot, siteLatitude, siteLng, siteTimeZone]
  );

  const activeScenarioIndex = useMemo(() => {
    if (snapshot.optimizeMode) {
      const idx = utciStats?.comfortMatrix.scenarios.findIndex(s => s.optimized) ?? -1;
      return idx === -1 ? 4 : idx;
    }
    return utciExposureScenarioIndex(snapshot.includeSun ?? true, snapshot.includeWind ?? true);
  }, [
    snapshot.optimizeMode,
    snapshot.includeSun,
    snapshot.includeWind,
    utciStats?.comfortMatrix.scenarios,
  ]);

  useEffect(() => {
    setSelectedCell(prev => {
      if (!prev) return null;
      if (prev.scenarioIndex === activeScenarioIndex) return prev;
      return { ...prev, scenarioIndex: activeScenarioIndex };
    });
  }, [activeScenarioIndex]);

  const nvStats = useMemo(
    () =>
      slot.type === 'naturalVentilation'
        ? computeTutorialNvQuickStats({ rows: epwRows, filter, unitSystem, live: snapshot })
        : null,
    [slot.type, epwRows, filter, unitSystem, snapshot]
  );

  const formatNvHoursPct = (hours: number, pct: number) =>
    `${hours.toLocaleString()} hrs · ${Number.isFinite(pct) ? pct.toFixed(1) : '—'}%`;

  const dark = theme === 'dark';
  const surface = dark ? 'bg-gray-800' : 'bg-white';
  /** Opaque so sticky table cells inside a panel hide content scrolled beneath them. */
  const panelBg = dark ? 'bg-[#192230]' : 'bg-gray-50';
  const panel = `rounded-2xl p-4 @2xl:p-5 ${panelBg}`;
  const ink = dark ? 'text-gray-100' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-600';
  const sectionTitle = `mb-2.5 text-xs font-bold uppercase tracking-wider ${dark ? 'text-gray-300' : 'text-gray-500'}`;
  const blockTitle = `mb-2 text-[13px] font-semibold ${ink}`;
  const bodyText = 'text-sm leading-relaxed @2xl:text-[15px]';
  const hintText = `text-[13px] leading-relaxed ${muted}`;
  const rowLabel = `text-[13px] leading-snug ${muted}`;
  const rowValue = `text-right text-[13px] font-semibold tabular-nums ${ink}`;
  const tileLabel = `text-[11px] font-bold uppercase tracking-wider ${muted}`;
  const tint = (hex: string) => ({ backgroundColor: dark ? `${hex}22` : `${hex}14` });

  return (
    <aside className={`@container flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-2xl p-4 glow-lg @2xl:p-6 ${surface}`}>
      <div className="flex min-w-0 flex-col gap-4">
          <section>
            <h2 className={`text-lg font-bold leading-tight tracking-[-0.01em] @2xl:text-xl ${ink}`}>{copy.chartTitle}</h2>
            <p className={`mt-2.5 max-w-[68ch] ${bodyText} ${ink}`}>{copy.overviewBody}</p>
          </section>

          {slot.type !== 'empty' ? (
            <section className={panel}>
              <h3 className={sectionTitle}>{copy.readingTitle}</h3>
              <p className={`max-w-[68ch] ${bodyText} ${ink}`}>{copy.readingBody}</p>
            </section>
          ) : null}

          <section className={panel}>
            <h3 className={sectionTitle}>Quick numbers</h3>
            <p className={`mb-4 ${hintText}`}>
              {slot.type === 'utci'
                ? 'Modeled UTCI from your file, using the same month, hour, and temperature filters as Settings. Sun, wind, and a selected period in the table also limit the percentages below.'
                : slot.type === 'naturalVentilation'
                  ? 'Outdoor dry-bulb and humidity from your file, using the same month and hour filters as Settings. Criteria presets match the chart card.'
                  : 'From your loaded file, using the same month and hour filters as the chart (if the chart is empty, this still reflects the file).'}
            </p>
            {slot.type === 'naturalVentilation' ? (
              nvStats ? (
                <div className="flex flex-col gap-5">
                  <div>
                    <h4 className={blockTitle}>Suitable hours by preset</h4>
                    <ul className="grid gap-2">
                      {nvStats.presetStats.map(stat => {
                        const preset = NV_CRITERIA_PRESETS.find(p => p.id === stat.id);
                        return (
                          <li key={stat.id} className="rounded-xl px-3.5 py-3" style={tint(NATURAL_VENTILATION_SUITABLE_BLUE_HEX)}>
                            <p className={tileLabel}>{stat.shortLabel}</p>
                            <p
                              className="mt-1 text-lg font-bold leading-tight tabular-nums"
                              style={{ color: NATURAL_VENTILATION_SUITABLE_BLUE_HEX }}
                            >
                              {formatNvHoursPct(stat.suitableHours, stat.suitablePct)}
                            </p>
                            {preset ? <p className={`mt-1 text-xs leading-snug ${muted}`}>{formatNvPresetLabel(preset, unitSystem)}</p> : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div>
                    <h4 className={blockTitle}>Active criteria breakdown</h4>
                    <p className={`mb-2.5 ${hintText}`}>
                      {nvStats.activeCriteriaSummary} · {nvStats.totalHours.toLocaleString()} filtered hours
                    </p>
                    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
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
                            className={row.primary ? 'text-[13px] font-semibold leading-snug' : rowLabel}
                            style={row.primary ? { color: NATURAL_VENTILATION_SUITABLE_BLUE_HEX } : undefined}
                          >
                            {row.label}
                          </dt>
                          <dd
                            className={rowValue}
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
                <p className={hintText}>No hours match your current filters.</p>
              )
            ) : slot.type === 'utci' ? (
              utciStats ? (
                <div className="flex flex-col gap-5">
                  <div className="rounded-xl px-4 py-3.5" style={tint(OUTDOOR_COMFORT_GREEN_HEX)}>
                    <p className={tileLabel}>Time in comfort</p>
                    <p className="mt-1 text-3xl font-bold leading-none tabular-nums" style={{ color: OUTDOOR_COMFORT_GREEN_HEX }}>
                      {Number.isFinite(utciStats.comfortPercent) ? `${utciStats.comfortPercent.toFixed(1)}%` : '—'}
                    </p>
                    <p className={`mt-1.5 text-xs leading-snug ${muted}`}>
                      No thermal stress ({formatUtciCategoryRange(UTCI_COMFORT_CATEGORY, unitSystem)}) · {utciStats.hoursCounted.toLocaleString()} filtered hours
                      {utciStats.isolationLabel ? ` · ${utciStats.isolationLabel}` : ''}
                    </p>
                  </div>

                  <div>
                    <h4 className={blockTitle}>UTCI categories (% of filtered hours)</h4>
                    <ul className="flex flex-col gap-0.5">
                      {utciStats.categoryShares.map(share => {
                        const rangeLabel = formatUtciCategoryRange(share.category, unitSystem);
                        return (
                          <li
                            key={share.category}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 rounded-full px-2.5 py-1"
                            style={share.isComfort ? tint(OUTDOOR_COMFORT_GREEN_HEX) : undefined}
                          >
                            <span className="h-3 w-3 shrink-0 rounded-full glow-sm" style={{ backgroundColor: share.color }} aria-hidden />
                            <span
                              className={`min-w-0 text-[13px] leading-snug ${share.isComfort ? 'font-semibold' : muted}`}
                              style={share.isComfort ? { color: OUTDOOR_COMFORT_GREEN_HEX } : undefined}
                            >
                              {share.label}
                            </span>
                            <span
                              className={`shrink-0 whitespace-nowrap text-right text-xs tabular-nums ${
                                share.isComfort ? 'font-medium opacity-80' : dark ? 'text-gray-400' : 'text-gray-500'
                              }`}
                              style={share.isComfort ? { color: OUTDOOR_COMFORT_GREEN_HEX } : undefined}
                            >
                              {rangeLabel}
                            </span>
                            <span
                              className={`min-w-[3.25rem] shrink-0 text-right text-[13px] font-semibold tabular-nums ${share.isComfort ? '' : ink}`}
                              style={share.isComfort ? { color: OUTDOOR_COMFORT_GREEN_HEX } : undefined}
                            >
                              {share.percentage.toFixed(1)}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div>
                    <h4 className={blockTitle}>Time in comfort by period</h4>
                    <p className={`mb-3 ${hintText}`}>
                      Click a cell to apply that exposure and highlight the matching time window on the chart. Greener =
                      more comfort time. Optimized picks the best of the four exposures every hour (use the chart’s
                      Exposure toggle to map winning conditions). Click the cell again, use Clear, or click outside
                      the table to remove the highlight. Seasonal rows use astronomical boundaries
                      (equinoxes/solstices), not whole calendar months.
                    </p>
                    {(selectedCell || snapshot.utciFocusPeriodId) && (
                      <button
                        type="button"
                        onClick={clearComfortHighlight}
                        className={`mb-3 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                          dark
                            ? 'bg-orange-950/50 text-orange-200 hover:bg-orange-950/80'
                            : 'bg-orange-50 text-orange-800 glow-sm hover:bg-orange-100'
                        }`}
                      >
                        Clear chart highlight
                      </button>
                    )}
                    <div ref={comfortMatrixRef} className="-mx-1 overflow-x-auto px-1">
                      <table className="w-full min-w-0 border-separate border-spacing-x-1 border-spacing-y-1 text-left text-xs sm:min-w-[24rem]">
                        <thead>
                          <tr>
                            <th className={`sticky left-0 z-10 pb-1 pr-2 text-[11px] font-bold uppercase tracking-wider ${muted} ${panelBg}`}>
                              Period
                            </th>
                            {utciStats.comfortMatrix.scenarios.map((scenario, si) => {
                              const colActive =
                                selectedCell != null ? selectedCell.scenarioIndex === si : activeScenarioIndex === si;
                              return (
                                <th
                                  key={scenario.id}
                                  title={scenario.label}
                                  className={`max-w-[5.5rem] pb-1 text-center text-[11px] font-semibold leading-tight ${
                                    colActive ? (dark ? 'text-orange-300' : 'text-orange-700') : muted
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
                                  className={`sticky left-0 z-10 max-w-[10rem] py-0.5 pr-2 text-left text-xs font-semibold leading-snug ${panelBg} ${
                                    rowSelected ? (dark ? 'text-orange-300' : 'text-orange-800') : ink
                                  }`}
                                  title={period.label}
                                >
                                  {period.label}
                                </th>
                                {utciStats.comfortMatrix.scenarios.map((scenario, si) => {
                                  const cell = utciStats.comfortMatrix.cells[pi][si];
                                  const isSelected =
                                    selectedCell?.periodIndex === pi && selectedCell.scenarioIndex === si;
                                  const heat = comfortPercentHeatStyle(cell.percentComfort, theme);

                                  return (
                                    <td key={`${period.id}-${scenario.id}`}>
                                      <button
                                        type="button"
                                        title={`${period.label} · ${scenario.label}`}
                                        aria-pressed={isSelected}
                                        style={heat}
                                        className={`w-full min-w-[3.25rem] rounded-full px-1 py-1.5 text-center text-xs font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 ${
                                          isSelected ? 'ring-2 ring-black ring-offset-1' : ''
                                        }`}
                                        onClick={() => {
                                          if (isSelected) {
                                            clearComfortHighlight();
                                            return;
                                          }
                                          setSelectedCell({ periodIndex: pi, scenarioIndex: si });
                                          if (scenario.optimized) {
                                            requestUtciSelection({
                                              periodId: period.id,
                                              optimizeMode: true,
                                            });
                                          } else {
                                            requestUtciSelection({
                                              periodId: period.id,
                                              includeSun: scenario.includeSun ?? true,
                                              includeWind: scenario.includeWind ?? true,
                                              optimizeMode: false,
                                            });
                                          }
                                        }}
                                      >
                                        {Number.isFinite(cell.percentComfort) ? `${cell.percentComfort.toFixed(1)}%` : '—'}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className={`mt-2 text-[10px] font-light italic leading-snug ${muted}`}>{UTCI_HOUR_WINDOW_NOTE}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className={hintText}>No hours match your current filters.</p>
              )
            ) : (
              <div className="grid gap-y-5">
                {statBlocks.map((block, bi) => (
                  <div key={bi} className="min-w-0">
                    {block.heading ? <h4 className={blockTitle}>{block.heading}</h4> : null}
                    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
                      {block.rows.map((row, ri) => (
                        <React.Fragment key={`${bi}-${ri}`}>
                          <dt className={rowLabel}>{row.label}</dt>
                          <dd className={rowValue}>{row.value}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </section>

          {explorerMonthlyByMonth ? (
            <section className={panel}>
              <h3 className={sectionTitle}>By month</h3>
              <p className={`mb-3 ${hintText}`}>
                <span className={`font-semibold ${ink}`}>{explorerMonthlyByMonth.variableLabel}</span>
                {' — '}
                high, average, and low per calendar month with the same filters as the chart. When the explorer uses
                mean daily min/max for bars, those extents define high and low here too.
              </p>
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[14rem] border-separate border-spacing-0 text-left text-[13px]">
                  <thead>
                    <tr className={`text-[11px] uppercase tracking-wider ${muted}`}>
                      <th scope="col" className="px-3 pb-2 font-bold">
                        Month
                      </th>
                      <th scope="col" className="px-3 pb-2 text-right font-bold">
                        High
                      </th>
                      <th scope="col" className="px-3 pb-2 text-right font-bold">
                        Avg
                      </th>
                      <th scope="col" className="px-3 pb-2 text-right font-bold">
                        Low
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {explorerMonthlyByMonth.cells.map(cell => (
                      <tr
                        key={cell.abbr}
                        title={cell.title}
                        className={`[&>*:first-child]:rounded-l-full [&>*:last-child]:rounded-r-full ${
                          dark ? 'odd:bg-white/[0.04]' : 'odd:bg-white'
                        }`}
                      >
                        <th scope="row" className={`px-3 py-1.5 font-semibold ${ink}`}>
                          {cell.abbr}
                        </th>
                        <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${ink}`}>{cell.high}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${muted}`}>{cell.avg}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${muted}`}>{cell.low}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
      </div>
    </aside>
  );
}
