import React, { useEffect, useId, useRef, useState } from 'react';
import { ChartType } from '../App';
import { Sun, BarChart3, ThermometerSun, Wind, ChevronDown, DoorOpen, Check } from 'lucide-react';
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
      className={`${chartToolbarTypePillClass(theme)} shrink-0 gap-0.5 pl-1.5 pr-1 @lg:pl-2 @lg:pr-1.5 ${
        disabled ? 'cursor-default opacity-60' : ''
      }`}
      title={`Switch chart type · ${typeLabel}`}
    >
      <Icon className={`${CHART_TOOLBAR_ICON_GLYPH_CLASS} shrink-0`} />
      {/* Expand chart-type label on hover only in wider cards (@md+) so narrow 4x2 headers never crush sibling titles. */}
      <span
        className={`pointer-events-none hidden max-w-0 items-center overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,padding] duration-200 ease-out motion-reduce:transition-none @md:flex @md:group-hover/chart-type:max-w-[9.5rem] @md:group-hover/chart-type:pl-1 @md:group-hover/chart-type:opacity-100 @md:group-focus-within/chart-type:max-w-[9.5rem] @md:group-focus-within/chart-type:pl-1 @md:group-focus-within/chart-type:opacity-100 ${CHART_TOOLBAR_TITLE_TEXT_CLASS} ${dark ? 'text-gray-100' : 'text-gray-800'}`}
        aria-hidden
      >
        <span className="truncate">{typeLabel}</span>
      </span>
      <ChevronDown
        className={`h-2.5 w-2.5 shrink-0 transition-transform duration-150 @lg:h-3 @lg:w-3 ${
          open ? 'rotate-180 opacity-90' : 'opacity-65'
        }`}
        strokeWidth={2.4}
        aria-hidden
      />
    </button>
  );

  if (display === 'icon') {
    return (
      <div
        id={tutorialAnchorId}
        data-card-dropdown-open={open ? 'true' : undefined}
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
            className={`absolute left-0 z-50 mt-1.5 min-w-[188px] space-y-0.5 overflow-hidden rounded-2xl p-1.5 glow-xl ${
              dark ? 'bg-gray-800' : 'bg-white'
            }`}
          >
            {CHART_TYPE_MENU_OPTIONS.map(t => {
              const active = value === t;
              const ItemIcon = ICON[t];
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
                  className={`flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
                    active
                      ? dark
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-100 text-gray-950'
                      : dark
                        ? 'text-gray-200 hover:bg-gray-700/60'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <ItemIcon className="h-3.5 w-3.5 shrink-0 opacity-75" />
                    <span className="truncate">{LABELS[t]}</span>
                  </span>
                  {active ? <Check className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div id={tutorialAnchorId} data-card-dropdown-open={open ? 'true' : undefined} className="relative min-w-0">
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
        className={`inline-flex max-w-full min-w-0 truncate font-semibold uppercase tracking-wide text-xs underline-offset-2 transition-colors duration-200 w-max ${
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
          className={`absolute left-0 z-50 mt-1.5 min-w-[188px] space-y-0.5 overflow-hidden rounded-2xl p-1.5 glow-xl ${
            dark ? 'bg-gray-800' : 'bg-white'
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
                className={`w-full rounded-full px-3.5 py-2 text-left text-sm font-semibold transition-colors ${
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
