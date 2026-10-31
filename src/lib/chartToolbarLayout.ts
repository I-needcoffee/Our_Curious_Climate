/**
 * Canonical chart card toolbar metrics shared by every chart card (explorers, UTCI, Sun Path, Wind Rose).
 * The header stays compact so the chart drives the card layout; title size steps gently with the
 * card's `@container` width (hierarchy comes from weight and ink rather than size).
 */

type Theme = 'light' | 'dark';

export const CHART_TOOLBAR_HEADER_PAD = 'overflow-visible px-2 pt-1 pb-0 @lg:px-2.5 @lg:pt-1.5';

export const CHART_TOOLBAR_ROW_CLASS =
  'flex h-6 min-h-6 w-full items-center justify-between gap-1 overflow-visible @lg:gap-1.5 @2xl:h-7 @2xl:min-h-7';

/** Export card header: grows with stacked captions (e.g. Sun Path Color + Radius). */
export const CHART_TOOLBAR_EXPORT_ROW_CLASS =
  'flex w-full min-h-6 items-center justify-between gap-1.5 @lg:gap-2 @2xl:min-h-7';

export const CHART_TOOLBAR_EXPORT_STACKED_ROW_CLASS = 'flex w-full items-start gap-1.5 @lg:gap-2';

export const CHART_TOOLBAR_CONTROLS_CLASS =
  'flex h-6 min-h-6 min-w-0 flex-1 items-center gap-1 overflow-visible @lg:gap-1.5 @2xl:h-7 @2xl:min-h-7';

export const CHART_TOOLBAR_ICON_SLOT_CLASS =
  'flex h-5 w-5 shrink-0 items-center justify-center @lg:h-6 @lg:w-6';

export const CHART_TOOLBAR_ICON_GLYPH_CLASS = 'h-3 w-3 @lg:h-3.5 @lg:w-3.5';

export const CHART_TOOLBAR_SETTINGS_GLYPH_CLASS = 'h-3.5 w-3.5';

/** Borderless icon trigger — soft glow instead of an outline. */
export function chartToolbarIconButtonClass(theme: Theme): string {
  return theme === 'dark'
    ? 'bg-gray-800 text-gray-300 glow-sm hover:bg-gray-700 hover:text-gray-100'
    : 'bg-white text-gray-600 glow-sm hover:bg-gray-50 hover:text-gray-900';
}

/** Export card headers: icon only, no chip. */
export function chartToolbarExportIconClass(theme: Theme): string {
  return theme === 'dark' ? 'text-gray-300' : 'text-gray-700';
}

function chartTypeChipTone(theme: Theme): string {
  return theme === 'dark'
    ? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
    : 'bg-gray-100 text-gray-800 hover:bg-gray-200 hover:text-gray-900';
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80 focus-visible:ring-offset-1 dark:focus-visible:ring-orange-500/70 dark:focus-visible:ring-offset-gray-800';

/** Chart-type pill in edit mode — soft filled chip, icon + hover label. */
export function chartToolbarTypePillClass(theme: Theme): string {
  return `inline-flex h-5 min-w-0 max-w-full items-center overflow-hidden rounded-full transition-[background-color,box-shadow,padding] duration-200 ease-out @lg:h-6 ${chartTypeChipTone(theme)} ${FOCUS_RING}`;
}

/** Compare-mode card header: type icon only (no menu), same chip. */
export function chartToolbarTypeBadgeClass(theme: Theme): string {
  return `inline-flex shrink-0 items-center justify-center rounded-full ${chartTypeChipTone(theme)} ${CHART_TOOLBAR_ICON_SLOT_CLASS}`;
}

/**
 * Card title: a caption for the chart, not a headline. 11px in grid cards, 12px once the card is
 * wider than ~450px, 13px only in very wide cards; hierarchy comes from weight, not size.
 */
export const CHART_TOOLBAR_TITLE_TEXT_CLASS =
  'text-[11px] font-semibold leading-none @md:text-xs @2xl:text-[13px]';

export function chartToolbarTitleInk(theme: Theme): string {
  return theme === 'dark' ? 'text-gray-200' : 'text-gray-700';
}

/** Title slot beside the chart-type icon. */
export function chartToolbarTitleClass(theme: Theme): string {
  return `flex h-6 min-w-0 flex-1 items-center truncate @2xl:h-7 ${CHART_TOOLBAR_TITLE_TEXT_CLASS} ${chartToolbarTitleInk(theme)}`;
}

/** Sun path Color / Radius triggers — same typography as titles, pill hover. */
export function chartToolbarMenuTriggerClass(theme: Theme): string {
  return `inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full px-1.5 @2xl:h-7 ${CHART_TOOLBAR_TITLE_TEXT_CLASS} ${chartToolbarTitleInk(
    theme
  )} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-800 ${
    theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100'
  }`;
}

type ChipAccent = 'neutral' | 'blue';

function chartToolbarChipTone(theme: Theme, active: boolean, accent: ChipAccent): string {
  if (active) {
    if (accent === 'blue') {
      return theme === 'dark' ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-700';
    }
    return theme === 'dark' ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-900';
  }
  return theme === 'dark'
    ? 'bg-gray-700/70 text-gray-300 hover:bg-gray-700 hover:text-white'
    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900';
}

/** Text pill in the hover toolbar strip (e.g. "Stats"). */
export function chartToolbarChipButtonClass(theme: Theme, active: boolean, accent: ChipAccent = 'neutral'): string {
  return `inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold leading-none transition-colors ${chartToolbarChipTone(
    theme,
    active,
    accent
  )}`;
}

/** Round icon button in the hover toolbar strip (e.g. chart settings). */
export function chartToolbarRoundButtonClass(theme: Theme, active: boolean, accent: ChipAccent = 'neutral'): string {
  return `inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 transition-colors ${chartToolbarChipTone(
    theme,
    active,
    accent
  )}`;
}

/** Remove-card control in the header row. */
export function chartToolbarRemoveButtonClass(theme: Theme): string {
  return `inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95 ${
    theme === 'dark'
      ? 'text-gray-400 hover:bg-red-900/30 hover:text-red-300'
      : 'text-gray-400 hover:bg-red-50 hover:text-red-500'
  }`;
}

/** Collapsible strip under the title row holding period pills + Stats / settings. */
export function chartToolbarRevealClassFor(expanded: boolean): string {
  return expanded
    ? 'pointer-events-auto max-h-[48px] overflow-visible opacity-100 pt-1 transition-[max-height,opacity] duration-200 ease-out'
    : 'pointer-events-none max-h-0 overflow-hidden opacity-0 transition-[max-height,opacity] duration-200 ease-out group-hover:pointer-events-auto group-hover:max-h-[48px] group-hover:opacity-100 focus-within:pointer-events-auto focus-within:max-h-[48px] focus-within:opacity-100';
}

/** "Baseline · City" / "Comparison · City" pill above each compare pane. */
export function comparePaneLabelClass(theme: Theme, tone: 'baseline' | 'comparison'): string {
  const fill =
    tone === 'baseline'
      ? theme === 'dark'
        ? 'bg-gray-700 text-gray-100'
        : 'bg-gray-200 text-gray-900'
      : theme === 'dark'
        ? 'bg-gray-950 text-gray-50'
        : 'bg-gray-900 text-white';
  return `mb-1.5 truncate rounded-full px-3 py-1 text-center text-[11px] font-bold uppercase leading-none tracking-wide @lg:text-xs ${fill}`;
}

/** Stats modal tiles. */
export function statTileClass(theme: Theme): string {
  return `rounded-xl px-3 py-2.5 ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}`;
}

export function statTileLabelClass(theme: Theme): string {
  return `mb-1 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`;
}

export function statTileValueClass(theme: Theme): string {
  return `text-lg font-semibold leading-tight tabular-nums ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`;
}
