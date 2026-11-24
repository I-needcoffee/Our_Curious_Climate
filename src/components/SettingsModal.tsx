import { useEffect, type ReactNode } from 'react';
import { X, Calendar, Clock, Palette, Sun, Moon, Settings, Filter, Thermometer, BarChart2, Type, RotateCcw } from 'lucide-react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import {
  DEFAULT_GLOBAL_FILTER,
  hasActiveGlobalFilter,
  type BarChartFillMode,
  type GlobalFilterState,
} from '../lib/globalFilter';
import type { UnitSystem } from '../App';
import { CHART_TEXT_AUTO, chartAxisInk } from '../lib/chartInk';
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

  const dark = theme === 'dark';
  const textAuto = heatmapTextColor === CHART_TEXT_AUTO;
  const customTextColor = chartAxisInk(heatmapTextColor, theme);

  const getGrayscaleValue = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    return Number.isFinite(r) ? Math.round((r / 255) * 100) : 0;
  };

  const setGrayscaleValue = (val: number) => {
    const gray = Math.round((val / 100) * 255);
    const hex = `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
    setHeatmapTextColor(hex);
  };

  const monthRange: [number, number] = [filter.startMonth, filter.endMonth];
  const hourRange: [number, number] = [filter.startHour, filter.endHour];

  const optionPill = (selected: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
      selected
        ? dark
          ? 'bg-gray-100 text-gray-900 glow-sm'
          : 'bg-gray-900 text-white glow-sm'
        : dark
          ? 'bg-gray-700/70 text-gray-300 hover:bg-gray-700 hover:text-white'
          : 'bg-white text-gray-700 glow-sm hover:bg-gray-100 hover:text-gray-900'
    }`;
  const valueBadge = `rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${
    dark ? 'bg-gray-700 text-gray-100' : 'bg-white text-gray-800 glow-sm'
  }`;
  const hint = `text-xs leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const tick = `text-xs font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const rowLabel = 'flex items-center gap-2 text-sm font-semibold';
  const iconInk = dark ? 'text-gray-300' : 'text-gray-700';

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const filterActive = hasActiveGlobalFilter(filter);

  return (
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/50 p-3 backdrop-blur-[1px]"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global settings"
        className={`max-h-[min(90vh,680px)] w-full max-w-lg overflow-y-auto rounded-3xl glow-xl ${
          dark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
        }`}
      >
        <div className={`sticky top-0 z-10 flex items-center justify-between px-5 pb-2 pt-4 ${dark ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center gap-2.5 text-lg font-bold tracking-[-0.01em]">
            <Settings className={`h-5 w-5 ${iconInk}`} />
            <span>Settings</span>
          </div>
          <div className="flex items-center gap-1.5">
            {filterActive && (
              <button
                type="button"
                onClick={() =>
                  onChangeFilter({
                    ...DEFAULT_GLOBAL_FILTER,
                    temperatureLoC: dryBulbExtentMinC,
                    temperatureHiC: dryBulbExtentMaxC,
                  })
                }
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  dark
                    ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
                    : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                <span>Reset filters</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${
                dark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-4 pb-5 pt-1">
          <SettingsSection theme={theme} icon={<Filter className={`h-4 w-4 ${iconInk}`} />} title="Global time filters">
            {/* Month Filter — same wrapping slider + presets as Wind Rose */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={rowLabel}>
                  <Calendar className={`h-4 w-4 ${iconInk}`} />
                  Months
                </span>
                <span className={valueBadge}>{formatMonthIsolationRange(monthRange)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SEASON_MONTH_PRESETS.map(preset => (
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
                    className={optionPill(isolationRangesEqual(monthRange, preset.range))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className={hint}>{MONTH_WRAP_HINT}</p>
              <div className="px-2">
                <WrappingRangeSlider
                  min={1}
                  max={12}
                  value={monthRange}
                  onChange={([startMonth, endMonth]) => onChangeFilter({ ...filter, startMonth, endMonth })}
                  theme={theme}
                  startAriaLabel="Start month"
                  endAriaLabel="End month"
                />
                <div className="mt-1.5 flex justify-between">
                  <span className={tick}>Jan</span>
                  <span className={tick}>Jun</span>
                  <span className={tick}>Dec</span>
                </div>
              </div>
            </div>

            {/* Hour Filter — wrapping midnight, shared wording with Wind Rose */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className={rowLabel}>
                  <Clock className={`h-4 w-4 ${iconInk}`} />
                  Hours
                </span>
                <span className={valueBadge}>{formatHourIsolationRange(hourRange)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {GLOBAL_HOUR_PRESETS.map(preset => (
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
                    className={optionPill(isolationRangesEqual(hourRange, preset.range))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className={hint}>{HOUR_WRAP_HINT}</p>
              <div className="px-2">
                <WrappingRangeSlider
                  min={0}
                  max={23}
                  value={hourRange}
                  onChange={([startHour, endHour]) => onChangeFilter({ ...filter, startHour, endHour })}
                  theme={theme}
                  startAriaLabel="Start hour"
                  endAriaLabel="End hour"
                />
                <div className="mt-1.5 flex justify-between">
                  <span className={tick}>12am</span>
                  <span className={tick}>12pm</span>
                  <span className={tick}>11pm</span>
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* Dry-bulb isolation — dual slider + typed limits (stored °C) */}
          <SettingsSection theme={theme} icon={<Thermometer className={`h-4 w-4 ${iconInk}`} />} title="Temperature isolation">
            <TemperatureIsolationRange
              filter={filter}
              onChangeFilter={onChangeFilter}
              theme={theme}
              unitSystem={unitSystem}
              extentMinC={dryBulbExtentMinC}
              extentMaxC={dryBulbExtentMaxC}
            />
          </SettingsSection>

          <SettingsSection theme={theme} icon={<Palette className={`h-4 w-4 ${iconInk}`} />} title="Graphics">
            <div className="space-y-2.5">
              <span className={rowLabel}>Interface theme</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    if (!textAuto) setHeatmapTextColor('#000000');
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 ${optionPill(theme === 'light')}`}
                >
                  <Sun className="h-4 w-4" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTheme('dark');
                    if (!textAuto) setHeatmapTextColor('#ffffff');
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 ${optionPill(theme === 'dark')}`}
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </button>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <span className={rowLabel}>
                  <Type className={`h-4 w-4 ${iconInk}`} />
                  Chart text color
                </span>
                {!textAuto && (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full glow-sm" style={{ backgroundColor: customTextColor }} />
                    <span className={valueBadge}>{customTextColor.toUpperCase()}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHeatmapTextColor(CHART_TEXT_AUTO)}
                  className={`flex-1 ${optionPill(textAuto)}`}
                >
                  Auto contrast
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (textAuto) setHeatmapTextColor(dark ? '#ffffff' : '#000000');
                  }}
                  className={`flex-1 ${optionPill(!textAuto)}`}
                >
                  Custom
                </button>
              </div>
              {textAuto ? (
                <p className={hint}>
                  Axis labels follow the light/dark theme, and heatmap cell values use one uniform dark ink for a calm,
                  consistent grid.
                </p>
              ) : (
                <div className="flex items-center gap-3 px-2 pt-1">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Black
                  </span>
                  <div className="flex-1">
                    <Slider
                      min={0}
                      max={100}
                      value={getGrayscaleValue(customTextColor)}
                      onChange={val => {
                        if (typeof val === 'number') setGrayscaleValue(val);
                      }}
                      trackStyle={[{ backgroundColor: 'transparent', height: '6px' }]}
                      handleStyle={[
                        {
                          border: 'none',
                          backgroundColor: 'white',
                          opacity: 1,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.25), 0 0 10px rgba(0,0,0,0.15)',
                          width: '18px',
                          height: '18px',
                          marginTop: '-6px',
                        },
                      ]}
                      railStyle={{ background: 'linear-gradient(to right, #000, #fff)', height: '6px', borderRadius: 9999 }}
                    />
                  </div>
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    White
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2.5 pt-2">
              <span className={rowLabel}>
                <BarChart2 className={`h-4 w-4 ${iconInk}`} />
                Bar chart colors
              </span>
              <p className={hint}>
                Single tone uses the footer Low / Ave / High selection. Gradient tone fills each bar with the
                variable&apos;s legend ramp from min to max.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onBarChartFillModeChange('solid')}
                  className={`flex-1 ${optionPill(barChartFillMode === 'solid')}`}
                >
                  Single tone
                </button>
                <button
                  type="button"
                  onClick={() => onBarChartFillModeChange('gradient')}
                  className={`flex-1 ${optionPill(barChartFillMode === 'gradient')}`}
                >
                  Gradient tone
                </button>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <span className={rowLabel}>Color palettes</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setShowGradientModal(true);
                }}
                className={`flex w-full items-center justify-center gap-2 ${optionPill(false)}`}
              >
                <Palette className="h-4 w-4" />
                Create new gradient
              </button>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  theme,
  icon,
  title,
  children,
}: {
  theme: 'light' | 'dark';
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`space-y-3 rounded-2xl p-4 ${theme === 'dark' ? 'bg-gray-900/40' : 'bg-gray-50'}`}>
      <h3
        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
        }`}
      >
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
