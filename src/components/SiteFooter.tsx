import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IEM_HOME, WindIemDisclaimerFull } from './WindIemAttribution';
import type { SiteFooterWindControlsProps } from './SiteFooterWindControls';
import { windYearRangeShort } from './SiteFooterWindControls';
import type { UnitSystem } from '../App';
import type { HeatmapCellStatistic } from '../lib/globalFilter';
import { useIsMobileMaxSm } from '../hooks/useIsMobileMaxSm';
import { DiscoverPulseShell } from './onboarding/DiscoverPulseShell';
import { dismissOnboarding, ONBOARDING_KEYS } from '../lib/onboardingStorage';

const CLIMATE_CANVAS = 'https://climatecanvas.app';
const PAYPAL_URL = 'https://www.paypal.com/paypalme/coffee4tim';
const VENMO_URL = 'https://account.venmo.com/u/Tim_Meyers';

const DONATE_MODAL_LINE_1 =
  'Created with the intent of spreading knowledge and climate resources.';
const DONATE_MODAL_LINE_2 = 'Donations toward continued development are greatly appreciated.';

export type SiteFooterExportCaption = {
  place: string;
  filename: string;
};

/**
 * Bottom strip: optional export captions + Created at / Donate (pill hidden in export mode).
 */
export function SiteFooter({
  theme,
  exportMode,
  exportCaptions,
  unitSystem,
  onUnitSystemChange,
  heatmapCellStatistic,
  onHeatmapCellStatisticChange,
  dstDisplayEnabled,
  onDstDisplayEnabledChange,
  showHeatmapCellToggle = true,
  exportNotesDst = false,
  iemWindDatasetActive = false,
  windFooter,
}: {
  theme: 'light' | 'dark';
  exportMode: boolean;
  exportCaptions?: SiteFooterExportCaption[];
  unitSystem?: UnitSystem;
  onUnitSystemChange?: (u: UnitSystem) => void;
  /** Heatmap cell aggregation: min / mean / max within each cell. */
  heatmapCellStatistic?: HeatmapCellStatistic;
  onHeatmapCellStatisticChange?: (v: HeatmapCellStatistic) => void;
  dstDisplayEnabled?: boolean;
  onDstDisplayEnabledChange?: (v: boolean) => void;
  /** When false, hide Low / Ave / High (no 12Ã—24 heatmaps on the dashboard). */
  showHeatmapCellToggle?: boolean;
  /** Export capture only: note DST in footer when the DST toggle is on. */
  exportNotesDst?: boolean;
  /** Export / caption: IEM overlay active for wind. */
  iemWindDatasetActive?: boolean;
  /** Wind TMY vs ASOS + years (only when wind/wind-rose cards are on screen). */
  windFooter?: SiteFooterWindControlsProps | null;
}) {
  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [iemDisclaimerOpen, setIemDisclaimerOpen] = useState(false);
  const isMobile = useIsMobileMaxSm();

  useEffect(() => {
    if (!donateModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDonateModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [donateModalOpen]);

  useEffect(() => {
    if (donateModalOpen || iemDisclaimerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [donateModalOpen, iemDisclaimerOpen]);

  useEffect(() => {
    if (!iemDisclaimerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIemDisclaimerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [iemDisclaimerOpen]);

  /** Light: white pill body; dark: low-contrast shell. */
  const pillShell =
    theme === 'dark'
      ? 'border-white/15 bg-gray-950/90 text-gray-300 shadow-hard-sm backdrop-blur-sm'
      : 'border-gray-200/90 bg-white/92 text-gray-700 shadow-hard-sm backdrop-blur-sm';

  /** One scale for all footer footnote & pill labels; weight varies per control (selected = bold). */
  const footnoteText = 'text-[10px] sm:text-[11px] leading-snug';
  const footerLinkClass =
    theme === 'dark'
      ? 'font-normal text-gray-300 underline decoration-gray-500/60 underline-offset-2 hover:text-white'
      : 'font-normal text-gray-800 underline decoration-gray-400/60 underline-offset-2 hover:text-gray-950';

  const exportLinkClass =
    'font-medium text-gray-900 underline decoration-gray-400/70 underline-offset-2 hover:text-gray-950';

  const captionPlace =
    exportMode
      ? 'text-[11px] font-medium leading-snug text-gray-900'
      : theme === 'dark'
        ? `${footnoteText} font-normal text-gray-100`
        : `${footnoteText} font-normal text-gray-900`;
  const captionFile =
    exportMode
      ? 'font-mono text-[10px] font-normal leading-snug text-gray-500'
      : theme === 'dark'
        ? `font-mono ${footnoteText} font-normal text-gray-400`
        : `font-mono ${footnoteText} font-normal text-gray-500`;

  const donateModal =
    donateModalOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="donate-modal-title"
        onMouseDown={e => {
          if (e.target === e.currentTarget) setDonateModalOpen(false);
        }}
      >
        <div
          className={`relative w-full max-w-md rounded-2xl border p-4 shadow-hard-xl sm:p-5 ${
            theme === 'dark' ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white'
          }`}
        >
          <button
            type="button"
            onClick={() => setDonateModalOpen(false)}
            className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 id="donate-modal-title" className="sr-only">
            Donate
          </h2>
          <div
            className={`px-2 pr-12 text-center font-light sm:px-4 ${
              theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
            }`}
          >
            <p className="text-sm leading-relaxed sm:text-base">{DONATE_MODAL_LINE_1}</p>
            <p className="mt-3 text-sm leading-relaxed sm:text-base">{DONATE_MODAL_LINE_2}</p>
          </div>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
            <a
              href={VENMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center rounded-full border border-gray-200 bg-[#008cff] px-4 py-2.5 text-sm font-bold text-white shadow-hard-sm transition-opacity hover:opacity-92"
            >
              Venmo
            </a>
            <a
              href={PAYPAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center rounded-full border border-gray-200 bg-[#0070ba] px-4 py-2.5 text-sm font-bold text-white shadow-hard-sm transition-opacity hover:opacity-92"
            >
              PayPal
            </a>
          </div>
        </div>
      </div>,
      document.body
    );

  const iemDisclaimerModal =
    iemDisclaimerOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[20050] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iem-disclaimer-title"
        onMouseDown={e => {
          if (e.target === e.currentTarget) setIemDisclaimerOpen(false);
        }}
      >
        <div
          className={`relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-4 shadow-hard-xl sm:p-5 ${
            theme === 'dark' ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white'
          }`}
        >
          <button
            type="button"
            onClick={() => setIemDisclaimerOpen(false)}
            className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 id="iem-disclaimer-title" className="pr-10 text-base font-semibold leading-snug">
            Iowa Environmental Mesonet (IEM) wind data
          </h2>
          <div className="mt-3 pr-2">
            <WindIemDisclaimerFull theme={theme} />
          </div>
        </div>
      </div>,
      document.body
    );

  const showCaptions = Boolean(exportCaptions?.length);

  /** Export: plain attribution link, no pill/donate; captions + link vertically centered as a row. */
  if (exportMode) {
    return (
      <>
        <footer
          className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 ${showCaptions ? 'justify-between' : 'justify-end'}`}
          aria-label="Export caption and attribution"
        >
          {showCaptions ? (
            <div className="flex min-h-5 min-w-0 flex-1 flex-col justify-center gap-0.5 text-left">
              {exportCaptions!.map((row, i) => (
                <div key={`${row.filename}-${i}`} className="flex min-w-0 flex-col gap-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
                  <span className={`min-w-0 truncate ${captionPlace}`}>{row.place}</span>
                  <span className={`min-w-0 truncate ${captionFile}`}>{row.filename}</span>
                </div>
              ))}
              {exportNotesDst ? (
                <span className="text-[9px] font-normal leading-none text-gray-500">
                  Clock display: DST adjustment on
                </span>
              ) : null}
              {iemWindDatasetActive ? (
                <span className="text-[8px] font-normal leading-snug text-gray-500">
                  * Wind speed/direction from{' '}
                  <a href={IEM_HOME} target="_blank" rel="noopener noreferrer" className={exportLinkClass}>
                    Iowa Environmental Mesonet (IEM)
                  </a>
                  . This application is not affiliated with Iowa State University or IEM.
                </span>
              ) : null}
            </div>
          ) : exportNotesDst ? (
            <div className="flex min-h-5 min-w-0 flex-1 items-center text-left">
              <span className="text-[9px] font-normal leading-none text-gray-500">
                Clock display: DST adjustment on
              </span>
            </div>
          ) : iemWindDatasetActive ? (
            <div className="flex min-h-5 min-w-0 flex-1 flex-col justify-center text-left">
              <span className="text-[8px] font-normal leading-snug text-gray-500">
                * Wind speed/direction from{' '}
                <a href={IEM_HOME} target="_blank" rel="noopener noreferrer" className={exportLinkClass}>
                  Iowa Environmental Mesonet (IEM)
                </a>
                . Not affiliated with Iowa State University or IEM.
              </span>
            </div>
          ) : null}
          <div className="flex min-h-5 shrink-0 items-center whitespace-nowrap text-[11px] leading-none">
            <a
              href={CLIMATE_CANVAS}
              target="_blank"
              rel="noopener noreferrer"
              className={`${exportLinkClass} whitespace-nowrap`}
            >
              Created with ClimateCanvas.app
            </a>
          </div>
        </footer>
        {iemDisclaimerModal}
      </>
    );
  }

  const showLeftControls = Boolean(
    onUnitSystemChange && unitSystem !== undefined && onDstDisplayEnabledChange && dstDisplayEnabled !== undefined
  );

  const pillH = 'h-6';
  /** Slightly below inner row height (h-5) so the chip sits with equal top/bottom inset. */
  const donateChipH = 'h-4.5';

  /**
   * Metric / Imperial: grey trough; selected = white, unselected = light grey.
   * Dark: selected white cap, unselected mid grey (reads as â€œunselectedâ€ on dark track).
   */
  const unitTrack =
    theme === 'dark'
      ? `inline-flex ${pillH} min-w-0 max-w-[min(100vw-8rem,15rem)] items-stretch rounded-full border border-gray-600 bg-gray-800 p-0.5 shadow-none`
      : `inline-flex ${pillH} min-w-0 max-w-[min(100vw-8rem,15rem)] items-stretch rounded-full border border-gray-200 bg-gray-100 p-0.5 shadow-none`;
  const unitSegBase = `flex min-w-0 flex-1 items-center justify-center rounded-full px-1.5 ${footnoteText} font-normal transition-[color,background-color,box-shadow,font-weight] duration-200 sm:px-2.5`;

  const metricLabel = isMobile ? 'Met' : 'Metric';
  const imperialLabel = isMobile ? 'Imp' : 'Imperial';
  const dstLabel = isMobile ? 'DST' : 'Daylight savings time';
  const windDataLabel = isMobile ? 'Wind' : 'Wind Data';
  return (
    <>
      <div className="flex w-full flex-col gap-0.5">
      <footer
        className={`flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 ${
          showCaptions || showLeftControls || windFooter?.visible ? 'justify-between' : 'justify-end'
        }`}
        aria-label="Site attribution and display options"
      >
        {showLeftControls ? (
          <div className="pointer-events-auto flex min-w-0 max-w-full flex-wrap items-center gap-2 overflow-visible">
            {showLeftControls ? (
              <>
            <DiscoverPulseShell storageKey={ONBOARDING_KEYS.dstToggle} rounded="pill">
              <button
                type="button"
                role="switch"
                aria-checked={dstDisplayEnabled}
                aria-label="Daylight savings time display"
                title="US-style DST display: between 2nd Sunday in March and 1st Sunday in November, shift each hourly row +1h on the civil clock (EPW rows are usually standard offset; underlying sample time is unchanged for sun math). You can use this for any file as an approximation."
                onClick={() => {
                  dismissOnboarding(ONBOARDING_KEYS.dstToggle);
                  onDstDisplayEnabledChange?.(!dstDisplayEnabled);
                }}
                className={`inline-flex ${pillH} max-w-[min(100vw-6rem,20rem)] min-w-0 items-stretch overflow-visible rounded-full border p-0 ${pillShell}`}
              >
                <span className="flex shrink-0 items-center justify-center pl-2 pr-0.5 sm:pl-2" aria-hidden>
                  <span
                    className={`box-border h-3 w-3 shrink-0 rounded-full border sm:h-3.5 sm:w-3.5 ${
                      dstDisplayEnabled
                        ? 'border-gray-600 bg-gray-600 dark:border-gray-500 dark:bg-gray-500'
                        : theme === 'dark'
                          ? 'border-gray-500 bg-white'
                          : 'border-gray-400 bg-white'
                    }`}
                  />
                </span>
                <span
                  className={`flex min-w-0 flex-1 items-center truncate pl-1 pr-2 text-left sm:pr-2 ${footnoteText} font-normal ${
                    theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                  }`}
                >
                  {dstLabel}
                </span>
              </button>
            </DiscoverPulseShell>
            <DiscoverPulseShell storageKey={ONBOARDING_KEYS.unitSystem} rounded="pill">
            <div
              className={unitTrack}
              title="Unit system for numbers in charts"
              role="group"
              aria-label="Unit system"
            >
              <button
                type="button"
                onClick={() => {
                  dismissOnboarding(ONBOARDING_KEYS.unitSystem);
                  onUnitSystemChange?.('metric');
                }}
                aria-label="Metric"
                className={`${unitSegBase} ${
                  unitSystem === 'metric'
                    ? theme === 'dark'
                      ? 'bg-white text-gray-900 shadow-sm font-bold'
                      : 'bg-white text-gray-900 shadow-sm font-bold'
                    : theme === 'dark'
                      ? 'bg-gray-600/80 text-gray-300 hover:text-white'
                      : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                }`}
              >
                {metricLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissOnboarding(ONBOARDING_KEYS.unitSystem);
                  onUnitSystemChange?.('imperial');
                }}
                aria-label="Imperial"
                className={`${unitSegBase} ${
                  unitSystem === 'imperial'
                    ? theme === 'dark'
                      ? 'bg-white text-gray-900 shadow-sm font-bold'
                      : 'bg-white text-gray-900 shadow-sm font-bold'
                    : theme === 'dark'
                      ? 'bg-gray-600/80 text-gray-300 hover:text-white'
                      : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                }`}
              >
                {imperialLabel}
              </button>
            </div>
            </DiscoverPulseShell>
            {showHeatmapCellToggle && onHeatmapCellStatisticChange && heatmapCellStatistic !== undefined ? (
              <div
                className={unitTrack}
                title="Heatmaps: statistic within each colored cell over selected hours."
                role="group"
                aria-label="Heatmap cell statistic"
              >
                <button
                  type="button"
                  onClick={() => onHeatmapCellStatisticChange('low')}
                  aria-label="Heatmap cells show low"
                  className={`${unitSegBase} ${
                    heatmapCellStatistic === 'low'
                      ? theme === 'dark'
                        ? 'bg-white text-gray-900 shadow-sm font-bold'
                        : 'bg-white text-gray-900 shadow-sm font-bold'
                      : theme === 'dark'
                        ? 'bg-gray-600/80 text-gray-300 hover:text-white'
                        : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {isMobile ? 'Lo' : 'Low'}
                </button>
                <button
                  type="button"
                  onClick={() => onHeatmapCellStatisticChange('mean')}
                  aria-label="Heatmap cells show average"
                  className={`${unitSegBase} ${
                    heatmapCellStatistic === 'mean'
                      ? theme === 'dark'
                        ? 'bg-white text-gray-900 shadow-sm font-bold'
                        : 'bg-white text-gray-900 shadow-sm font-bold'
                      : theme === 'dark'
                        ? 'bg-gray-600/80 text-gray-300 hover:text-white'
                        : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {isMobile ? 'Av' : 'Ave'}
                </button>
                <button
                  type="button"
                  onClick={() => onHeatmapCellStatisticChange('high')}
                  aria-label="Heatmap cells show high"
                  className={`${unitSegBase} ${
                    heatmapCellStatistic === 'high'
                      ? theme === 'dark'
                        ? 'bg-white text-gray-900 shadow-sm font-bold'
                        : 'bg-white text-gray-900 shadow-sm font-bold'
                      : theme === 'dark'
                        ? 'bg-gray-600/80 text-gray-300 hover:text-white'
                        : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {isMobile ? 'Hi' : 'High'}
                </button>
              </div>
            ) : null}
            {windFooter?.visible ? (
              <>
                <DiscoverPulseShell storageKey={ONBOARDING_KEYS.windDataSource} rounded="pill">
                <div
                  className={`inline-flex ${pillH} min-w-0 max-w-[min(100vw-6rem,22rem)] shrink-0 items-stretch overflow-visible rounded-full border ${
                    theme === 'dark'
                      ? 'border-gray-600 bg-gray-800 p-0.5 shadow-none'
                      : 'border-gray-200 bg-gray-100 p-0.5 shadow-none'
                  }`}
                  title="Wind data: weather file (TMY) vs Iowa Environmental Mesonet station archive"
                  role="group"
                  aria-label="Wind data source"
                >
                  <span
                    className={`flex shrink-0 items-center border-r pl-2 pr-1.5 sm:pl-2.5 sm:pr-2 ${footnoteText} font-medium ${
                      theme === 'dark' ? 'border-gray-600 text-gray-300' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    {windDataLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      dismissOnboarding(ONBOARDING_KEYS.windDataSource);
                      windFooter.onSelectTmy();
                    }}
                    aria-label="Wind from weather file (TMY)"
                    className={`${unitSegBase} ${
                      windFooter.source === 'epw'
                        ? theme === 'dark'
                          ? 'bg-white text-gray-900 shadow-sm font-bold'
                          : 'bg-white text-gray-900 shadow-sm font-bold'
                        : theme === 'dark'
                          ? 'bg-gray-600/80 text-gray-300 hover:text-white'
                          : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    TMY
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dismissOnboarding(ONBOARDING_KEYS.windDataSource);
                      windFooter.onSelectStation();
                    }}
                    aria-label="Wind from mesonet station archive"
                    className={`${unitSegBase} ${
                      windFooter.source === 'iem'
                        ? theme === 'dark'
                          ? 'bg-white text-gray-900 shadow-sm font-bold'
                          : 'bg-white text-gray-900 shadow-sm font-bold'
                        : theme === 'dark'
                          ? 'bg-gray-600/80 text-gray-300 hover:text-white'
                          : 'bg-gray-50 text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Station
                  </button>
                </div>
                </DiscoverPulseShell>
                {windFooter.source === 'iem' ? (
                  <>
                    {windFooter.stationLabel ? (
                      <button
                        type="button"
                        onClick={windFooter.onChangeStation}
                        className={`max-w-[7rem] shrink-0 truncate text-left ${footnoteText} font-medium underline decoration-gray-400/60 underline-offset-2 ${
                          theme === 'dark'
                            ? 'text-gray-200 hover:text-gray-100'
                            : 'text-gray-700 hover:text-gray-900'
                        }`}
                        title="Change mesonet station"
                      >
                        {windFooter.stationLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={windFooter.onConfigureYears}
                      className={`max-w-[9rem] shrink-0 truncate text-left ${footnoteText} font-normal tabular-nums underline decoration-gray-400/60 underline-offset-2 ${
                        theme === 'dark'
                          ? 'text-gray-300 hover:text-gray-100'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      title="Change mesonet year range"
                    >
                      {windYearRangeShort(windFooter.yearStart, windFooter.yearEnd)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIemDisclaimerOpen(true)}
                      className={`max-w-[min(100vw-12rem,12rem)] shrink-0 text-left italic underline decoration-gray-400/50 underline-offset-2 ${footnoteText} ${
                        theme === 'dark'
                          ? 'text-gray-400 hover:text-gray-300'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      * IEM notice…
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        {showCaptions ? (
          <div className="min-w-0 flex-1 min-h-6 flex items-center">
            <div className="w-full space-y-0.5 text-left">
            {exportCaptions!.map((row, i) => (
              <div key={`${row.filename}-${i}`} className="flex min-w-0 flex-col gap-0 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
                <span className={`min-w-0 truncate ${captionPlace}`}>{row.place}</span>
                <span className={`min-w-0 truncate ${captionFile}`}>{row.filename}</span>
              </div>
            ))}
            </div>
          </div>
        ) : null}
        <div className="relative z-20 ml-auto flex h-6 min-w-0 max-w-[min(100vw-1rem,22rem)] items-center self-center leading-none">
          <div
            className={`box-border flex h-6 min-w-0 max-w-full items-center overflow-hidden rounded-full border p-0.5 ${pillShell}`}
          >
            <a
              href={CLIMATE_CANVAS}
              target="_blank"
              rel="noopener noreferrer"
              className={`relative z-0 flex h-5 min-h-0 min-w-0 flex-1 items-center truncate rounded-l-full px-2 ${footnoteText} ${footerLinkClass} sm:px-2.5 ${
                theme === 'dark' ? '' : 'bg-white'
              }`}
            >
              Created with ClimateCanvas.app
            </a>
            <div className="relative z-10 flex h-5 shrink-0 items-center justify-center pl-0.5 pr-0.5">
              <button
                type="button"
                onClick={() => setDonateModalOpen(true)}
                className={`inline-flex ${donateChipH} min-h-0 max-w-full items-center justify-center border-l pl-1.5 pr-2 text-left ${footnoteText} font-normal transition-colors duration-200 sm:pl-1.5 sm:pr-2 ${
                  theme === 'dark'
                    ? 'ml-0.5 rounded-l-full rounded-r-full border-white/10 bg-gray-800/50 text-gray-200 hover:bg-gray-800/70 hover:text-white'
                    : 'ml-0.5 rounded-l-full rounded-r-full border-gray-200/90 bg-gray-100 text-gray-800 shadow-sm hover:bg-gray-200/90'
                }`}
              >
                Donate
              </button>
            </div>
          </div>
        </div>
      </footer>
      </div>
      {donateModal}
      {iemDisclaimerModal}
    </>
  );
}
