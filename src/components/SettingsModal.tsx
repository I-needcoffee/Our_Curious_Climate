import { X, Calendar, Clock, Palette, Sun, Moon, Settings, Filter, Thermometer, BarChart2 } from 'lucide-react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import type { BarChartFillMode, GlobalFilterState } from '../lib/globalFilter';
import type { UnitSystem } from '../App';
import { TemperatureIsolationRange } from './TemperatureIsolationRange';
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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  filter: GlobalFilterState;
  onChangeFilter: (filter: GlobalFilterState) => void;
  unitSystem: UnitSystem;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  heatmapTextColor: string;
  setHeatmapTextColor: (color: string) => void;
  setShowGradientModal: (show: boolean) => void;
  /** Min/max dry-bulb (°C) in loaded EPW — slider rail endpoints. */
  dryBulbExtentMinC: number;
  dryBulbExtentMaxC: number;
  barChartFillMode: BarChartFillMode;
  onBarChartFillModeChange: (mode: BarChartFillMode) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  filter,
  onChangeFilter,
  unitSystem,
  theme,
  setTheme,
  heatmapTextColor,
  setHeatmapTextColor,
  setShowGradientModal,
  dryBulbExtentMinC,
  dryBulbExtentMaxC,
  barChartFillMode,
  onBarChartFillModeChange,
}: SettingsModalProps) {
  if (!isOpen) return null;

  const getGrayscaleValue = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    return Math.round((r / 255) * 100);
  };

  const setGrayscaleValue = (val: number) => {
    const gray = Math.round((val / 100) * 255);
    const hex = `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
    setHeatmapTextColor(hex);
  };

  const monthRange: [number, number] = [filter.startMonth, filter.endMonth];
  const hourRange: [number, number] = [filter.startHour, filter.endHour];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2">
      <div className={`rounded-xl shadow-xl max-w-md w-full max-h-[min(90vh,560px)] overflow-y-auto border ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-200'}`}>
        <div className={`flex items-center justify-between p-2 border-b sticky top-0 z-10 ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Settings className="w-4 h-4 text-gray-900 dark:text-gray-100" />
            <span>Settings</span>
          </div>
          <button type="button" onClick={onClose} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-4">
          {/* Time Filters */}
          <div className="space-y-4">
            <h3 className="font-semibold text-xs border-b pb-1.5 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-gray-900 dark:text-gray-100" />
              Global time filters
            </h3>
            
            {/* Month Filter — same wrapping slider + presets as Wind Rose */}
            <div className="space-y-3">
              <div className="flex items-center justify-between font-medium text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-900 dark:text-gray-100" />
                  <span>Months</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 font-mono text-xs ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                  {formatMonthIsolationRange(monthRange)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SEASON_MONTH_PRESETS.map(preset => {
                  const selected = isolationRangesEqual(monthRange, preset.range);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        onChangeFilter({
                          ...filter,
                          startMonth: preset.range[0],
                          endMonth: preset.range[1],
                        })
                      }
                      className={`text-xs font-medium rounded-full transition-colors border px-3 py-1.5 ${
                        selected
                          ? theme === 'dark'
                            ? 'bg-gray-600 text-gray-100 border-gray-500'
                            : 'bg-gray-200 text-gray-900 border-gray-400'
                          : theme === 'dark'
                            ? 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[10px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                {MONTH_WRAP_HINT}
              </p>
              <div className="px-2">
                <WrappingRangeSlider
                  min={1}
                  max={12}
                  value={monthRange}
                  onChange={([startMonth, endMonth]) =>
                    onChangeFilter({ ...filter, startMonth, endMonth })
                  }
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

            {/* Hour Filter — wrapping midnight, shared wording with Wind Rose */}
            <div className="space-y-3">
              <div className="flex items-center justify-between font-medium text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-900 dark:text-gray-100" />
                  <span>Hours</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 font-mono text-xs ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                  {formatHourIsolationRange(hourRange)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {GLOBAL_HOUR_PRESETS.map(preset => {
                  const selected = isolationRangesEqual(hourRange, preset.range);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.hint}
                      onClick={() =>
                        onChangeFilter({
                          ...filter,
                          startHour: preset.range[0],
                          endHour: preset.range[1],
                        })
                      }
                      className={`text-xs font-medium rounded-full transition-colors border px-3 py-1.5 ${
                        selected
                          ? theme === 'dark'
                            ? 'bg-gray-600 text-gray-100 border-gray-500'
                            : 'bg-gray-200 text-gray-900 border-gray-400'
                          : theme === 'dark'
                            ? 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[10px] leading-snug ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                {HOUR_WRAP_HINT}
              </p>
              <div className="px-2">
                <WrappingRangeSlider
                  min={0}
                  max={23}
                  value={hourRange}
                  onChange={([startHour, endHour]) =>
                    onChangeFilter({ ...filter, startHour, endHour })
                  }
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

          {/* Dry-bulb isolation — dual slider + typed limits (stored °C) */}
          <div className={`space-y-3 border-t pt-4 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2 font-medium text-sm">
              <Thermometer className="w-4 h-4 text-gray-900 dark:text-gray-100" />
              <span>Temperature isolation</span>
            </div>
            <TemperatureIsolationRange
              filter={filter}
              onChangeFilter={onChangeFilter}
              theme={theme}
              unitSystem={unitSystem}
              extentMinC={dryBulbExtentMinC}
              extentMaxC={dryBulbExtentMaxC}
            />
          </div>

          {/* Graphics Adjustments */}
          <div className="space-y-4">
            <h3 className="font-semibold text-xs border-b pb-1.5 flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-gray-900 dark:text-gray-100" />
              Graphics adjustments
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Theme Toggle */}
              <div className="space-y-3">
                <span className="font-medium text-sm">Interface Theme</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setTheme('light');
                      setHeatmapTextColor('#000000');
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-full font-medium transition-colors border text-sm p-2 ${theme === 'light' ? 'bg-gray-200 text-gray-900 border-gray-400 shadow-sm' : 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                  >
                    <Sun className="w-4 h-4" />
                    Light
                  </button>
                  <button
                    onClick={() => {
                      setTheme('dark');
                      setHeatmapTextColor('#ffffff');
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-full font-medium transition-colors border text-sm p-2 ${theme === 'dark' ? 'bg-gray-600 text-gray-100 border-gray-500 shadow-sm' : 'bg-transparent text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                  >
                    <Moon className="w-4 h-4" />
                    Dark
                  </button>
                </div>
              </div>

              {/* Text Color Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between font-medium text-sm">
                  <span>Chart Text Color</span>
                  <div className="flex items-center gap-2">
                    <div 
                      className={`h-3 w-3 rounded-full border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`} 
                      style={{ backgroundColor: heatmapTextColor }}
                    />
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-xs ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                      {heatmapTextColor.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-2">
                  <span className={`font-bold uppercase tracking-wider text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Black</span>
                  <div className="flex-1">
                    <Slider 
                      min={0} 
                      max={100} 
                      value={getGrayscaleValue(heatmapTextColor)} 
                      onChange={(val) => {
                        if (typeof val === 'number') {
                          setGrayscaleValue(val);
                        }
                      }}
                      trackStyle={[{ backgroundColor: theme === 'dark' ? '#9ca3af' : '#525252', height: '4px' }]}
                      handleStyle={[
                        {
                          borderColor: theme === 'dark' ? '#9ca3af' : '#525252',
                          backgroundColor: 'white',
                          opacity: 1,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          width: '14px',
                          height: '14px',
                          marginTop: '-5px',
                        },
                      ]}
                      railStyle={{ background: 'linear-gradient(to right, #000, #fff)', height: '4px' }}
                    />
                  </div>
                  <span className={`font-bold uppercase tracking-wider text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>White</span>
                </div>
              </div>

              {/* Bar chart fill */}
              <div className="space-y-3 sm:col-span-2">
                <span className="font-medium text-sm flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-gray-900 dark:text-gray-100" />
                  Bar chart colors
                </span>
                <p className={`text-xs leading-snug ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Single tone uses the footer Low / Ave / High selection. Gradient tone fills each bar with the
                  variable&apos;s legend ramp from min to max.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onBarChartFillModeChange('solid')}
                    className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                      barChartFillMode === 'solid'
                        ? theme === 'dark'
                          ? 'bg-gray-600 text-gray-100 border-gray-500 shadow-sm'
                          : 'bg-gray-200 text-gray-900 border-gray-400 shadow-sm'
                        : theme === 'dark'
                          ? 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Single tone
                  </button>
                  <button
                    type="button"
                    onClick={() => onBarChartFillModeChange('gradient')}
                    className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                      barChartFillMode === 'gradient'
                        ? theme === 'dark'
                          ? 'bg-gray-600 text-gray-100 border-gray-500 shadow-sm'
                          : 'bg-gray-200 text-gray-900 border-gray-400 shadow-sm'
                        : theme === 'dark'
                          ? 'bg-transparent text-gray-400 border-gray-700 hover:bg-gray-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Gradient tone
                  </button>
                </div>
              </div>

              {/* Color Palettes */}
              <div className="space-y-3 sm:col-span-2">
                <span className="font-medium text-sm">Color Palettes</span>
                <button
                  onClick={() => {
                    onClose();
                    setShowGradientModal(true);
                  }}
                  className={`flex items-center justify-center gap-1.5 w-full rounded-full font-medium transition-colors border text-sm p-2 ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-gray-100 hover:bg-gray-600' : 'border-gray-300 bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                >
                  <Palette className="w-4 h-4" />
                  Create New Gradient
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
