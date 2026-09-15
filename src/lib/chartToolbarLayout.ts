/**
 * Canonical chart card toolbar metrics — compact row (UTCI, Wind Rose, explorers).
 * Sun Path export captions may use a stacked export row when multiple lines are shown.
 */

export const CHART_TOOLBAR_HEADER_PAD = 'overflow-visible px-1.5 py-0 @lg:px-2.5 @lg:py-1';

export const CHART_TOOLBAR_ROW_CLASS =
  'flex h-5 min-h-5 w-full items-center justify-between gap-1 overflow-visible sm:gap-1.5 @lg:h-8 @lg:min-h-8 @lg:gap-2 @2xl:h-10 @2xl:min-h-10';

/** Export card header: grows with stacked captions (e.g. Sun Path Color + Radius). */
export const CHART_TOOLBAR_EXPORT_ROW_CLASS =
  'flex w-full min-h-5 items-center justify-between gap-1 sm:gap-1.5 @lg:min-h-8 @lg:gap-2 @2xl:min-h-10';

export const CHART_TOOLBAR_EXPORT_STACKED_ROW_CLASS =
  'flex w-full items-start gap-1 sm:gap-1.5';

export const CHART_TOOLBAR_CONTROLS_CLASS =
  'flex h-5 min-h-5 min-w-0 flex-1 items-center gap-1 overflow-visible sm:gap-1.5 @lg:h-8 @lg:min-h-8 @lg:gap-2 @2xl:h-10 @2xl:min-h-10';

export const CHART_TOOLBAR_ICON_SLOT_CLASS =
  'flex h-4 w-4 shrink-0 items-center justify-center @lg:h-5 @lg:w-5 @2xl:h-6 @2xl:w-6';

export const CHART_TOOLBAR_ICON_GLYPH_CLASS = 'h-3 w-3 @lg:h-4 @lg:w-4 @2xl:h-5 @2xl:w-5';

/** Bordered icon trigger — matches footer / header pill controls. */
export function chartToolbarIconButtonClass(theme: 'light' | 'dark'): string {
  return theme === 'dark'
    ? 'border border-gray-600 bg-gray-800 text-gray-300 shadow-hard-sm hover:bg-gray-700 hover:text-gray-100'
    : 'border border-gray-200 bg-white text-gray-600 shadow-hard-sm hover:bg-gray-50 hover:text-gray-900';
}

/** Export card headers: icon only, no bordered chip. */
export function chartToolbarExportIconClass(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? 'text-gray-300' : 'text-gray-600';
}

/** Light 10% grey fill; dark border + icon for contrast (edit + compare). */
const CHART_TYPE_CHIP =
  'border border-gray-600 bg-[#e6e6e6] text-gray-800 shadow-hard-sm hover:bg-[#dcdcdc] hover:text-gray-900';

/** Chart-type pill in edit mode — soft grey chip, muted icon + hover label. */
export function chartToolbarTypePillClass(_theme: 'light' | 'dark'): string {
  return `inline-flex h-5 min-w-0 max-w-full items-center overflow-hidden rounded-full transition-[background-color,border-color,box-shadow,padding] duration-200 ease-out @lg:h-8 @2xl:h-10 ${CHART_TYPE_CHIP} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80 focus-visible:ring-offset-1 dark:focus-visible:ring-orange-500/70 dark:focus-visible:ring-offset-gray-800`;
}

/** Compare-mode card header: type icon only (no menu), same chip. */
export function chartToolbarTypeBadgeClass(_theme: 'light' | 'dark'): string {
  return `inline-flex h-5 shrink-0 items-center justify-center rounded-full @lg:h-8 @2xl:h-10 ${CHART_TYPE_CHIP} ${CHART_TOOLBAR_ICON_SLOT_CLASS}`;
}

export const CHART_TOOLBAR_TITLE_TEXT_CLASS =
  'text-[10px] font-medium leading-none @lg:text-sm @2xl:text-base';

export function chartToolbarTitleInk(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? 'text-gray-300' : 'text-gray-600';
}

/** Title slot beside the chart-type icon. */
export function chartToolbarTitleClass(theme: 'light' | 'dark'): string {
  return `flex h-5 min-w-0 flex-1 items-center truncate @lg:h-8 @2xl:h-10 ${CHART_TOOLBAR_TITLE_TEXT_CLASS} ${chartToolbarTitleInk(theme)}`;
}

/** Sun path Color / Radius triggers — same typography, compact height. */
export function chartToolbarMenuTriggerClass(theme: 'light' | 'dark'): string {
  return `inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md px-0.5 @lg:h-8 @2xl:h-10 ${CHART_TOOLBAR_TITLE_TEXT_CLASS} ${chartToolbarTitleInk(
    theme
  )} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-800 ${
    theme === 'dark'
      ? 'hover:bg-white/5 hover:text-gray-100'
      : 'hover:bg-gray-50 hover:text-gray-900'
  }`;
}
