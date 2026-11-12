import React, { useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BarChart2, GripVertical, Sun, ThermometerSun, Wind } from 'lucide-react';
import { WindRoseGlyph } from './WindRoseGlyph';
import { ChartType, ChartConfig, LayoutMode, UnitSystem } from '../App';
import type { EPWDataRow } from '../lib/epwParser';
import type { GlobalFilterState } from './GlobalFilterPanel';
import { DEFAULT_GLOBAL_FILTER } from '../lib/globalFilter';
import { TutorialGuidePanel } from './tutorial/TutorialGuidePanel';

const SLOT_DRAG_MIME = 'application/x-climate-slot-index';

interface SingleModeLayoutProps {
  slots: ChartConfig[];
  layoutMode: LayoutMode;
  renderChart: (config: ChartConfig) => React.ReactNode;
  onSelectSlotType: (index: number, type: ChartType) => void;
  onSwapSlots: (a: number, b: number) => void;
  exportMode: boolean;
  theme: 'light' | 'dark';
  /** Guided layout: EPW rows for the tutorial side panel quick stats. */
  tutorialEpwRows?: EPWDataRow[];
  tutorialFilter?: GlobalFilterState;
  tutorialUnitSystem?: UnitSystem;
  tutorialSiteLatitude?: number | null;
  tutorialSiteLng?: number | null;
  tutorialSiteTimeZone?: number | null;
}

function getSlotsPerPage(mode: LayoutMode) {
  if (mode === 'tutorial') return 1;
  if (mode === 'stacked') return 1;
  if (mode === 'hero-left') return 7;
  if (mode === 'grid-4x2') return 8;
  if (mode === 'focus-deep') return 2;
  return 7;
}

export function SingleModeLayout({
  slots,
  layoutMode,
  renderChart,
  onSelectSlotType,
  onSwapSlots,
  exportMode,
  theme,
  tutorialEpwRows,
  tutorialFilter,
  tutorialUnitSystem,
  tutorialSiteLatitude = null,
  tutorialSiteLng = null,
  tutorialSiteTimeZone = null,
}: SingleModeLayoutProps) {
  const tutorialColRef = useRef<HTMLDivElement>(null);
  /** Chart + guide grid only (excludes `TutorialCardChromeHints`) so ResizeObserver does not watch the hints strip. */
  const tutorialChromeObserveRef = useRef<HTMLDivElement>(null);
  const slotsPerPage = getSlotsPerPage(layoutMode);
  const pages = [];
  const [dragSource, setDragSource] = useState<number | null>(null);
  const [dropHover, setDropHover] = useState<number | null>(null);
  const dragGhostRef = useRef<HTMLElement | null>(null);

  const onDragStart = (e: React.DragEvent, globalIndex: number) => {
    e.dataTransfer.setData(SLOT_DRAG_MIME, String(globalIndex));
    e.dataTransfer.setData('text/plain', String(globalIndex));
    e.dataTransfer.effectAllowed = 'move';
    setDragSource(globalIndex);

    // Provide a visible drag preview (ghost outline) so users can see the card shape while dragging.
    try {
      const handleEl = e.currentTarget as HTMLElement;
      const shell = handleEl.closest<HTMLElement>('[data-slot-shell="true"]');
      if (shell) {
        const r = shell.getBoundingClientRect();
        const h = handleEl.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.style.width = `${Math.max(48, r.width)}px`;
        ghost.style.height = `${Math.max(48, r.height)}px`;
        ghost.style.borderRadius = '16px';
        ghost.style.boxSizing = 'border-box';
        ghost.style.background = theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.07)';
        ghost.style.boxShadow = '0 10px 30px rgba(0,0,0,0.18), 0 0 36px rgba(59,130,246,0.25)';
        ghost.style.position = 'fixed';
        ghost.style.top = '-10000px';
        ghost.style.left = '-10000px';
        ghost.style.zIndex = '9999';
        document.body.appendChild(ghost);
        dragGhostRef.current = ghost;
        // Anchor the drag image at the grab handle location (so the outline follows the cursor naturally).
        const offX = Math.max(0, Math.min(r.width, h.left - r.left + h.width / 2));
        const offY = Math.max(0, Math.min(r.height, h.top - r.top + h.height / 2));
        e.dataTransfer.setDragImage(ghost, offX, offY);
      }
    } catch {
      // ignore drag-image failures
    }
  };

  const onDragEnd = () => {
    setDragSource(null);
    setDropHover(null);
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  };

  const onDragOver = (e: React.DragEvent, globalIndex: number) => {
    if (exportMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHover(globalIndex);
  };

  const onDragLeave = (e: React.DragEvent, globalIndex: number) => {
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as HTMLElement).contains(next)) return;
    setDropHover(prev => (prev === globalIndex ? null : prev));
  };

  const onDrop = (e: React.DragEvent, globalIndex: number) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(SLOT_DRAG_MIME) || e.dataTransfer.getData('text/plain');
    const from = parseInt(raw, 10);
    if (Number.isFinite(from) && from !== globalIndex) {
      onSwapSlots(from, globalIndex);
    }
    onDragEnd();
  };

  let allSlots: ChartConfig[];
  if (layoutMode === 'tutorial') {
    allSlots = [slots[0] ?? { id: 'empty-0', type: 'empty' }];
    pages.push(allSlots);
  } else if (layoutMode === 'stacked') {
    // Stacked is a single, scrollable list (no pagination).
    allSlots = [...slots];
    pages.push(allSlots);
  } else {
    allSlots = [...slots];
    while (allSlots.length % slotsPerPage !== 0 || allSlots.length === 0) {
      allSlots.push({ id: `empty-${allSlots.length}`, type: 'empty' });
    }
    for (let i = 0; i < allSlots.length; i += slotsPerPage) {
      pages.push(allSlots.slice(i, i + slotsPerPage));
    }
  }

  const renderSlotShell = (
    slot: ChartConfig,
    idx: number,
    pageIndex: number,
    pageSlots: ChartConfig[],
    baseClass: string,
    /** Bottom-right 4×2 cell — tagged for export outline with comfort stats. */
    exportGrid4x2UtciCorner = false
  ) => {
    const globalIndex = pageIndex * slotsPerPage + idx;
    const draggingActive = dragSource !== null && !exportMode;
    const showHandle = !exportMode && slot.type !== 'empty';
    const isDragging = dragSource === globalIndex;
    const isDropTarget =
      dropHover === globalIndex && dragSource !== null && dragSource !== globalIndex;

    const dragRing = isDropTarget
      ? theme === 'dark'
        ? '!shadow-[0_0_0_1px_rgba(147,197,253,0.35),0_0_36px_rgba(96,165,250,0.55)]'
        : '!shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_0_36px_rgba(59,130,246,0.40)]'
      : '';

    const chartReorderDim =
      draggingActive && slot.type !== 'empty'
        ? `grayscale contrast-[0.94] ${isDragging ? 'opacity-45' : 'opacity-[0.9]'} transition-[filter,opacity] duration-200`
        : '';

    return (
      <div
        key={`${layoutMode}-${slot.id || `slot-${globalIndex}`}`}
        className={`${baseClass} group/slot relative @container ${dragRing} ${slot.type === 'empty' ? '!overflow-visible' : ''}`}
        data-export-grid4x2-corner={exportGrid4x2UtciCorner ? 'utci' : undefined}
        data-slot-shell="true"
        style={{ contain: 'layout style inline-size' }}
        onDragOver={e => onDragOver(e, globalIndex)}
        onDragLeave={e => onDragLeave(e, globalIndex)}
        onDrop={e => onDrop(e, globalIndex)}
      >
        {showHandle && (
          <div
            id="tutorial-slot-reorder-handle"
            draggable
            onDragStart={e => onDragStart(e, globalIndex)}
            onDragEnd={onDragEnd}
            className={`absolute bottom-2 right-2 z-[45] inline-flex items-center justify-center rounded-full p-1.5 glow-md cursor-grab active:cursor-grabbing select-none opacity-0 transition-opacity duration-150 group-hover/slot:opacity-100 group-focus-within/slot:opacity-100 ${
              theme === 'dark'
                ? 'bg-gray-900/80 text-gray-200 hover:bg-gray-900'
                : 'bg-white/95 text-gray-700 hover:bg-white'
            }`}
            title="Drag to swap cards"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </div>
        )}
        {slot.type === 'empty' ? (
          <div className={draggingActive ? 'grayscale opacity-80 transition-[filter,opacity] duration-200' : ''}>
            <EmptySlot
              exportMode={exportMode}
              onSelectType={type => onSelectSlotType(globalIndex, type)}
              theme={theme}
            />
          </div>
        ) : (
          <div className={`min-h-0 flex-1 flex flex-col overflow-hidden rounded-[inherit] ${chartReorderDim}`}>{renderChart(slot)}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full flex-1 min-h-0 gap-3 md:gap-4">
      {pages.map((pageSlots, pageIndex) => (
        <div
          key={pageIndex}
          className={`w-full relative flex flex-col ${pages.length === 1 ? 'flex-1 min-h-0' : ''}`}
        >
          {layoutMode === 'stacked' && (
            <div className="flex w-full flex-1 min-h-0 flex-col gap-2 overflow-y-auto">
              {pageSlots.map((slot, idx) => {
                let className = 'w-full min-h-[340px] flex flex-col overflow-visible ';
                if (!exportMode) {
                  className += `rounded-2xl glow-lg ${
                    theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                  }`;
                }
                return (
                  <div key={`${layoutMode}-${slot.id}-${idx}`} className="w-full">
                    {renderSlotShell(slot, idx, pageIndex, pageSlots, className)}
                  </div>
                );
              })}
            </div>
          )}

          {layoutMode === 'tutorial' && (
            <div ref={tutorialColRef} className="flex w-full flex-1 min-h-0 flex-col gap-2 md:min-h-0 md:overflow-visible">
              <div
                ref={tutorialChromeObserveRef}
                className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,4fr)] md:gap-4 md:overflow-visible"
              >
                {(() => {
                  const slot = pageSlots[0];
                  let className =
                    'flex h-full min-h-[46vh] w-full flex-col overflow-visible md:min-h-0 ';
                  if (!exportMode) {
                    className += `rounded-2xl glow-lg ${
                      theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                    }`;
                  }
                  return (
                    <>
                      {renderSlotShell(slot, 0, pageIndex, pageSlots, className)}
                      <TutorialGuidePanel
                        theme={theme}
                        slot={slot}
                        epwRows={tutorialEpwRows}
                        filter={tutorialFilter ?? DEFAULT_GLOBAL_FILTER}
                        unitSystem={tutorialUnitSystem ?? 'metric'}
                        siteLatitude={tutorialSiteLatitude}
                        siteLng={tutorialSiteLng}
                        siteTimeZone={tutorialSiteTimeZone}
                      />
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {layoutMode === 'hero-left' && (
            // Hero keeps its own 2/5 primary column. Details gives the chart 3/7, a little wider than 2/5.
            <div className="grid w-full gap-2.5 flex-1 min-h-0 grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:[grid-template-rows:minmax(0,1fr)_minmax(0,1fr)] md:overflow-visible">
              {pageSlots.map((slot, idx) => {
                const isHero = idx === 0;
                let className = 'w-full min-h-0 h-full flex flex-col overflow-visible ';
                if (!exportMode) {
                  className += `rounded-2xl glow-lg ${
                    theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                  }`;
                }
                if (isHero) className += ' md:col-span-1 md:row-span-2';
                else className += ' md:col-span-1';
                return renderSlotShell(slot, idx, pageIndex, pageSlots, className);
              })}
            </div>
          )}

          {layoutMode === 'grid-4x2' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 w-full flex-1 min-h-0 md:[grid-template-rows:minmax(0,1fr)_minmax(0,1fr)] md:overflow-visible">
              {(pageSlots.length >= 8 ? GRID_4X2_DISPLAY_ORDER : pageSlots.map((_, i) => i)).map(
                (originalIdx, visualPos) => {
                  const slot = pageSlots[originalIdx];
                  if (!slot) return null;
                  let className = 'w-full min-h-0 h-full flex flex-col overflow-hidden col-span-1 ';
                  if (!exportMode) {
                    className += `rounded-2xl glow-lg ${
                      theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                    }`;
                  }
                  return renderSlotShell(
                    slot,
                    originalIdx,
                    pageIndex,
                    pageSlots,
                    className,
                    visualPos === 7
                  );
                }
              )}
            </div>
          )}

          {layoutMode === 'focus-deep' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 w-full flex-1 min-h-0 md:overflow-visible">
              {pageSlots.map((slot, idx) => {
                let className = 'w-full min-h-0 h-full flex flex-col overflow-hidden col-span-1 ';
                if (!exportMode) {
                  className += `rounded-2xl glow-lg ${
                    theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                  }`;
                }
                return renderSlotShell(slot, idx, pageIndex, pageSlots, className);
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Visual iteration order for 4×2 grid cells (matches slot indices left-to-right, top-to-bottom). */
const GRID_4X2_DISPLAY_ORDER: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

type EmptySlotIcon = LucideIcon | typeof WindRoseGlyph;

const EMPTY_SLOT_CHOICES: { type: ChartType; label: string; Icon: EmptySlotIcon }[] = [
  { type: 'sunpath', label: 'Sun Path', Icon: Sun },
  { type: 'explorer', label: 'Data Explorer', Icon: BarChart2 },
  { type: 'utci', label: 'UTCI Comfort', Icon: ThermometerSun },
  { type: 'wind', label: 'Wind Explorer', Icon: Wind },
  { type: 'windrose', label: 'Wind Rose', Icon: WindRoseGlyph },
];

function EmptySlot({
  onSelectType,
  theme,
  exportMode,
}: {
  onSelectType: (t: ChartType) => void;
  theme: 'light' | 'dark';
  exportMode: boolean;
}) {
  if (exportMode) {
    return <div className="h-full min-h-0 min-w-0 w-full flex-1 bg-transparent" aria-hidden />;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col p-2">
      <div
        className={`flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl px-4 py-6 ${
          theme === 'dark' ? 'bg-gray-900/25' : 'bg-gray-50'
        }`}
      >
        <p
          className={`mb-4 w-full shrink-0 text-center text-sm font-semibold leading-snug ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          Add a chart
        </p>
        <div className="flex max-w-[22rem] flex-wrap items-center justify-center gap-2">
          {EMPTY_SLOT_CHOICES.map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => onSelectType(type)}
              title={label}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full pl-3 pr-3.5 text-[13px] font-semibold glow-sm transition-all active:scale-95 ${
                theme === 'dark'
                  ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
