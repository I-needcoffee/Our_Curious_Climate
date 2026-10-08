import { useState } from 'react';
import { Calendar, Clock, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import type { GlobalFilterState } from '../lib/globalFilter';
import { WrappingRangeSlider } from './WrappingRangeSlider';
import {
  GLOBAL_HOUR_PRESETS,
  HOUR_WRAP_HINT,
  MONTH_WRAP_HINT,
  SEASON_MONTH_PRESETS,
  formatHourIsolationRange,
  formatMonthIsolationRange,
  isolationRangesEqual,
} from '../lib/timeIsolationUi';

export type { GlobalFilterState } from '../lib/globalFilter';

interface GlobalFilterPanelProps {
  filter: GlobalFilterState;
  onChange: (filter: GlobalFilterState) => void;
  theme: 'light' | 'dark';
  uiScale: number;
}

export function GlobalFilterPanel({ filter, onChange, theme }: GlobalFilterPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const monthRange: [number, number] = [filter.startMonth, filter.endMonth];
  const hourRange: [number, number] = [filter.startHour, filter.endHour];

  return (
    <div className={`z-10 mx-4 mt-2 overflow-hidden rounded-b-2xl border-x border-t border-b shadow-sm transition-[background-color,border-color,box-shadow] duration-200 ease-out ${theme === 'dark' ? 'border-gray-700 bg-gray-800 shadow-[0_1px_0_0_rgba(0,0,0,0.35)]' : 'border-gray-200 bg-white'}`}>
      <div
        className={`flex cursor-pointer items-center justify-between transition-colors duration-200 ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ padding: '8px 16px' }}
      >
        <div className={`flex items-center gap-2 font-semibold ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`} style={{ fontSize: '14px' }}>
          <Filter className="w-4 h-4 text-gray-900 dark:text-gray-100" style={{ width: '16px', height: '16px' }} />
          <span>Global Time Filters</span>
          <span className={`font-normal ml-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: '12px' }}>
            {formatMonthIsolationRange(monthRange)} | {formatHourIsolationRange(hourRange)}
          </span>
        </div>
        {isCollapsed ? (
          <ChevronDown className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} style={{ width: '16px', height: '16px' }} />
        ) : (
          <ChevronUp className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} style={{ width: '16px', height: '16px' }} />
        )}
      </div>

      {!isCollapsed && (
        <div className={`flex flex-col border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`} style={{ padding: '16px', gap: '24px' }}>
          <div className="flex flex-col lg:flex-row gap-8" style={{ gap: '32px' }}>
            {/* Month Filter */}
            <div className="flex flex-col gap-3 flex-1" style={{ gap: '12px' }}>
              <div className={`flex items-center justify-between font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-900 dark:text-gray-100" style={{ width: '16px', height: '16px' }} />
                  <span className="font-semibold" style={{ fontSize: '14px' }}>
                    Months
                  </span>
                </div>
                <span
                  className={`font-mono px-2 py-0.5 rounded-full font-medium border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-100 text-gray-500'}`}
                  style={{ fontSize: '12px' }}
                >
                  {formatMonthIsolationRange(monthRange)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1" style={{ gap: '6px' }}>
                {SEASON_MONTH_PRESETS.map(preset => {
                  const selected = isolationRangesEqual(monthRange, preset.range);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...filter,
                          startMonth: preset.range[0],
                          endMonth: preset.range[1],
                        })
                      }
                      className={`font-medium rounded-full transition-colors border shadow-hard-sm ${
                        selected
                          ? theme === 'dark'
                            ? 'bg-gray-600 text-gray-100 border-gray-500'
                            : 'bg-gray-200 text-gray-900 border-gray-400'
                          : theme === 'dark'
                            ? 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[10px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                {MONTH_WRAP_HINT}
              </p>
              <div className="px-2 py-1">
                <WrappingRangeSlider
                  min={1}
                  max={12}
                  value={monthRange}
                  onChange={([startMonth, endMonth]) => onChange({ ...filter, startMonth, endMonth })}
                  theme={theme}
                  startAriaLabel="Start month"
                  endAriaLabel="End month"
                />
                <div className="mt-1 flex justify-between">
                  <span className="text-[10px] text-gray-400">Jan</span>
                  <span className="text-[10px] text-gray-400">Jun</span>
                  <span className="text-[10px] text-gray-400">Dec</span>
                </div>
              </div>
            </div>

            <div className={`hidden lg:block w-px h-auto ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`} />

            {/* Hour Filter */}
            <div className="flex flex-col gap-3 flex-1" style={{ gap: '12px' }}>
              <div className={`flex items-center justify-between font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-900 dark:text-gray-100" style={{ width: '16px', height: '16px' }} />
                  <span className="font-semibold" style={{ fontSize: '14px' }}>
                    Hours
                  </span>
                </div>
                <span
                  className={`font-mono px-2 py-0.5 rounded-full font-medium border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-100 text-gray-500'}`}
                  style={{ fontSize: '12px' }}
                >
                  {formatHourIsolationRange(hourRange)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1" style={{ gap: '6px' }}>
                {GLOBAL_HOUR_PRESETS.map(preset => {
                  const selected = isolationRangesEqual(hourRange, preset.range);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.hint}
                      onClick={() =>
                        onChange({
                          ...filter,
                          startHour: preset.range[0],
                          endHour: preset.range[1],
                        })
                      }
                      className={`font-medium rounded-full transition-colors border shadow-hard-sm ${
                        selected
                          ? theme === 'dark'
                            ? 'bg-gray-600 text-gray-100 border-gray-500'
                            : 'bg-gray-200 text-gray-900 border-gray-400'
                          : theme === 'dark'
                            ? 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[10px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                {HOUR_WRAP_HINT}
              </p>
              <div className="px-2 py-1">
                <WrappingRangeSlider
                  min={0}
                  max={23}
                  value={hourRange}
                  onChange={([startHour, endHour]) => onChange({ ...filter, startHour, endHour })}
                  theme={theme}
                  startAriaLabel="Start hour"
                  endAriaLabel="End hour"
                />
                <div className="mt-1 flex justify-between">
                  <span className="text-[10px] text-gray-400">12am</span>
                  <span className="text-[10px] text-gray-400">12pm</span>
                  <span className="text-[10px] text-gray-400">11pm</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
