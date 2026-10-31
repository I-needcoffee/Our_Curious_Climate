import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CHART_TOOLBAR_TITLE_TEXT_CLASS, chartToolbarTitleClass } from '../lib/chartToolbarLayout';

/** Chevron (12px) + gap after label when not in toolbar title mode. */
const CHEVRON_GLYPH_PX = 12;
const CHEVRON_GAP_AFTER_TEXT_PX = 4;

export function VariableChartSelect({
  value,
  onChange,
  selectedLabel,
  theme,
  children,
  domId,
  fillRow = true,
  toolbarTitle = false,
}: {
  value: string;
  onChange: (next: string) => void;
  selectedLabel: string;
  theme: 'light' | 'dark';
  children: React.ReactNode;
  domId?: string;
  fillRow?: boolean;
  /** Same layout as UTCI / Wind rose title (flex-1, h-6, truncate). */
  toolbarTitle?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const selectId = domId ? `${domId}-select` : `var-chart-select-${uid}`;
  const dark = theme === 'dark';

  if (toolbarTitle) {
    return (
      <div
        id={domId}
        className={`${chartToolbarTitleClass(theme)} relative gap-0.5`}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown
          className="h-3 w-3 shrink-0 opacity-60 @lg:h-3.5 @lg:w-3.5"
          strokeWidth={2.25}
          aria-hidden
        />
        <select
          id={selectId}
          value={value}
          title={selectedLabel}
          aria-label={selectedLabel}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 z-[1] cursor-pointer appearance-none bg-transparent opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-0 dark:focus-visible:ring-gray-500"
        >
          {children}
        </select>
      </div>
    );
  }

  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const gapMeasureRef = useRef<HTMLSpanElement>(null);
  const [widthPx, setWidthPx] = useState<number | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const minSelectW = 56;

  const recalc = useCallback(() => {
    const span = measureRef.current;
    const wrap = wrapRef.current;
    if (!span || !wrap) return;
    const textW = span.getBoundingClientRect().width;

    let cap = 0;
    const wrapW = wrap.getBoundingClientRect().width;
    if (wrapW > 4) cap = Math.floor(wrapW);

    let node: HTMLElement | null = wrap.parentElement;
    for (let i = 0; i < 2 && node; i++) {
      const w = Math.floor(node.getBoundingClientRect().width);
      if (w > cap) cap = w;
      node = node.parentElement;
    }

    if (!Number.isFinite(cap) || cap < minSelectW) {
      const row = wrap.parentElement;
      if (row) {
        const rowW = row.getBoundingClientRect().width;
        let usedBySiblings = 0;
        for (const child of Array.from(row.children)) {
          if (child === wrap || !(child instanceof HTMLElement)) continue;
          usedBySiblings += child.getBoundingClientRect().width;
        }
        const gapStyle = getComputedStyle(row).columnGap || getComputedStyle(row).gap;
        const gapPx = Number.parseFloat(String(gapStyle).split(/\s+/)[0]) || 8;
        const gaps = Math.max(0, row.children.length - 1) * gapPx;
        const raw = Math.floor(rowW - usedBySiblings - gaps);
        if (raw > 0) cap = Math.max(cap, raw);
      }
    }

    if (!Number.isFinite(cap) || cap <= 0) cap = Math.max(minSelectW, 200);

    let gapW = 8;
    const g = gapMeasureRef.current;
    if (g) gapW = g.getBoundingClientRect().width;

    const desired = Math.ceil(textW + gapW + CHEVRON_GAP_AFTER_TEXT_PX + CHEVRON_GLYPH_PX);
    const resolved = Math.max(minSelectW, Math.min(desired, cap));
    const truncated = resolved + 0.5 < desired;
    setIsTruncated(prev => (prev === truncated ? prev : truncated));
    setWidthPx(prev => (prev === resolved ? prev : resolved));
  }, [selectedLabel, minSelectW]);

  useLayoutEffect(() => {
    recalc();
  }, [recalc]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const row = wrap.parentElement;
    const ro = new ResizeObserver(() => recalc());
    ro.observe(wrap);
    if (row) ro.observe(row);
    return () => ro.disconnect();
  }, [recalc]);

  const measureClass = `${CHART_TOOLBAR_TITLE_TEXT_CLASS} ${dark ? 'text-gray-100' : 'text-gray-800'}`;
  const truncateClass = isTruncated ? 'truncate' : 'whitespace-nowrap';
  const visualClass = `${measureClass} ${truncateClass} min-w-0 flex-1 text-left`;

  const wrapOuter = fillRow
    ? 'relative flex min-w-0 flex-1 basis-0 max-w-full min-h-6 items-center justify-start @2xl:min-h-7'
    : 'relative flex min-w-0 flex-1 max-w-full min-h-6 items-center justify-start @2xl:min-h-7';

  const hitLayerClass =
    'absolute inset-0 z-[1] box-border cursor-pointer rounded-full appearance-none bg-transparent opacity-0 ' +
    'focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-0 ' +
    `${CHART_TOOLBAR_TITLE_TEXT_CLASS}`;

  const layeredSurface = `pointer-events-none relative z-0 flex h-6 w-full min-w-0 max-w-full items-center gap-0.5 rounded-full px-1 @2xl:h-7 ${
    dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
  }`;

  return (
    <div id={domId} ref={wrapRef} className={wrapOuter}>
      <span
        ref={measureRef}
        className={`pointer-events-none absolute left-0 top-0 -z-10 whitespace-nowrap opacity-0 ${measureClass}`}
        aria-hidden
      >
        {selectedLabel}
      </span>
      <span
        ref={gapMeasureRef}
        className={`pointer-events-none absolute left-0 top-0 -z-10 whitespace-pre opacity-0 ${measureClass}`}
        aria-hidden
      >
        {'  '}
      </span>
      <div
        className="relative h-6 shrink-0 @2xl:h-7"
        style={widthPx != null ? { width: `${widthPx}px`, maxWidth: '100%' } : { maxWidth: '100%' }}
      >
        <div className={layeredSurface}>
          <span className={visualClass}>{selectedLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-gray-500 @lg:h-3.5 @lg:w-3.5" strokeWidth={2.25} aria-hidden />
        </div>
        <select
          id={selectId}
          value={value}
          title={selectedLabel}
          aria-label={selectedLabel}
          onChange={e => onChange(e.target.value)}
          className={hitLayerClass}
        >
          {children}
        </select>
      </div>
    </div>
  );
}

