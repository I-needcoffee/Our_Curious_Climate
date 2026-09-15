import React, { useEffect, useId, useRef, useState } from 'react';
import { ChartType } from '../App';
import { Sun, BarChart3, ThermometerSun, Wind, ChevronDown, DoorOpen } from 'lucide-react';
import { WindRoseGlyph } from './WindRoseGlyph';
import {
  CHART_TOOLBAR_ICON_GLYPH_CLASS,
  CHART_TOOLBAR_ICON_SLOT_CLASS,
  CHART_TOOLBAR_TITLE_TEXT_CLASS,
  chartToolbarExportIconClass,
  chartToolbarTypeBadgeClass,
  chartToolbarTypePillClass,
} from '../lib/chartToolbarLayout';
import { DiscoverPulseShell } from './onboarding/DiscoverPulseShell';
import {
  dismissOnboarding,
  discoverPulseActive,
  ONBOARDING_KEYS,
} from '../lib/onboardingStorage';

const CHART_TYPE_MENU_OPTIONS = [
  'sunpath',
  'explorer',
  'utci',
  'naturalVentilation',
  'wind',
  'windrose',
] as const satisfies readonly ChartType[];

const LABELS: Record<ChartType, string> = {
  sunpath: 'Sun Path',
  explorer: 'Data Explorer',
  utci: 'UTCI Comfort',
  naturalVentilation: 'Natural Ventilation',
  wind: 'Wind Explorer',
  windrose: 'Wind Rose',
  empty: 'Empty',
};
const ICON: Record<ChartType, React.ComponentType<{ className?: string }>> = {
  sunpath: Sun,
  explorer: BarChart3,
  utci: ThermometerSun,
  naturalVentilation: DoorOpen,
  wind: Wind,
  windrose: WindRoseGlyph,
  empty: BarChart3,
};

export function ChartTypeMenu({
  value,
  label,
  onChange,
  theme,
  disabled,
  className,
  display = 'label',
  staticIcon = false,
  /** Compare pair toolbar: dark type chip only (no dropdown). */
  typeBadge = false,
  tutorialAnchorId,
  /** Slow orange pulse on the icon button until the user opens the menu or picks a type. */
  discoverPulse = false,
}: {
  value: ChartType;
  label: string;
  onChange: (v: ChartType) => void;
  theme: 'light' | 'dark';
  disabled?: boolean;
  className?: string;
  display?: 'label' | 'icon';
  staticIcon?: boolean;
  typeBadge?: boolean;
  tutorialAnchorId?: string;
  discoverPulse?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const dark = theme === 'dark';
  const dismissDiscover = () => {
    if (discoverPulse && discoverPulseActive(ONBOARDING_KEYS.chartTypeSwitch)) {
      dismissOnboarding(ONBOARDING_KEYS.chartTypeSwitch);
    }
  };

  useEffect(() => {
    if (staticIcon || !open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, staticIcon]);

  if (staticIcon) {
    const Icon = ICON[value];
    return (
      <div
        className={`${CHART_TOOLBAR_ICON_SLOT_CLASS} self-center ${chartToolbarExportIconClass('light')} ${className ?? ''}`}
        title={label}
        aria-label={label}
      >
        <Icon className={CHART_TOOLBAR_ICON_GLYPH_CLASS} />
      </div>
    );
  }

  if (typeBadge) {
    const Icon = ICON[value];
    return (
      <div
        className={`${chartToolbarTypeBadgeClass(theme)} ${className ?? ''}`}
        title={label}
        aria-label={label}
      >
        <Icon className={CHART_TOOLBAR_ICON_GLYPH_CLASS} />
      </div>
    );
  }

  const typeLabel = LABELS[value] ?? label;
  const Icon = ICON[value];

  const typePillButton = (
    <button
      ref={btnRef}
      type="button"
      disabled={disabled}
      onClick={() => {
        dismissDiscover();
        setOpen(v => !v);
      }}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      className={`${chartToolbarTypePillClass(theme)} shrink-0 pl-0.5 pr-0.5 group-hover/chart-type:pr-1.5 group-focus-within/chart-type:pr-1.5 @lg:pl-1.5 @lg:pr-1.5 @lg:group-hover/chart-type:pr-2.5 @lg:group-focus-within/chart-type:pr-2.5 ${
        disabled ? 'cursor-default opacity-60' : ''
      }`}
      title={`Change chart type Â· ${typeLabel}`}
    >
      <span className={`${CHART_TOOLBAR_ICON_SLOT_CLASS} shrink-0`}>
        <Icon className={CHART_TOOLBAR_ICON_GLYPH_CLASS} />
      </span>
      <span
        className={`pointer-events-none flex max-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,padding] duration-200 ease-out motion-reduce:transition-none group-hover/chart-type:max-w-[10rem] group-hover/chart-type:pl-1 group-hover/chart-type:opacity-100 group-focus-within/chart-type:max-w-[10rem] group-focus-within/chart-type:pl-1 group-focus-within/chart-type:opacity-100 @lg:group-hover/chart-type:max-w-[16rem] @lg:group-focus-within/chart-type:max-w-[16rem] ${CHART_TOOLBAR_TITLE_TEXT_CLASS} text-gray-800`}
        aria-hidden
      >
        <span className="truncate font-medium">{typeLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70 @lg:h-4 @lg:w-4 @2xl:h-5 @2xl:w-5" strokeWidth={2.25} />
      </span>
    </button>
  );

  if (display === 'icon') {
    return (
      <div
        id={tutorialAnchorId}
        className={`group/chart-type relative z-[5] min-w-0 overflow-visible ${className ?? ''}`}
      >
        {discoverPulse ? (
          <DiscoverPulseShell storageKey={ONBOARDING_KEYS.chartTypeSwitch} rounded="pill">
            {typePillButton}
          </DiscoverPulseShell>
        ) : (
          typePillButton
        )}

        {open && (
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            className={`absolute left-0 z-50 mt-1 min-w-[168px] overflow-hidden rounded-lg border shadow-hard-lg ${
              dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            }`}
          >
            {CHART_TYPE_MENU_OPTIONS.map(t => {
              const active = value === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    dismissDiscover();
                    onChange(t);
                  }}
                  className={`w-full rounded-full px-3 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                    active
                      ? dark
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-100 text-gray-900'
                      : dark
                        ? 'text-gray-200 hover:bg-gray-700/60'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {LABELS[t]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div id={tutorialAnchorId} className="relative min-w-0">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          dismissDiscover();
          setOpen(v => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`inline-flex max-w-full min-w-0 truncate font-semibold uppercase tracking-wide text-[10px] underline-offset-2 transition-colors duration-200 w-max ${
          disabled ? 'cursor-default opacity-60' : 'hover:underline'
        } ${dark ? 'text-gray-200' : 'text-gray-800'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-800 ${className ?? ''}`}
        title={label}
      >
        {label}
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          className={`absolute left-0 z-50 mt-1 min-w-[168px] overflow-hidden rounded-lg border shadow-hard-lg ${
            dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
          }`}
        >
          {CHART_TYPE_MENU_OPTIONS.map(t => {
            const active = value === t;
            return (
              <button
                key={t}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  dismissDiscover();
                  onChange(t);
                }}
                className={`w-full rounded-full px-3 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                  active
                    ? dark
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-100 text-gray-900'
                    : dark
                      ? 'text-gray-200 hover:bg-gray-700/60'
                      : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {LABELS[t]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
