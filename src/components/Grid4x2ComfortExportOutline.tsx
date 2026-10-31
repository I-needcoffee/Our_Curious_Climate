import React, { useCallback, useLayoutEffect, useState } from 'react';

const STATS_ID = 'grid4x2-comfort-stats';
const CHART_CORNER_SEL = '[data-export-grid4x2-corner="utci"]';

function unionClientRect(a: DOMRectReadOnly, b: DOMRectReadOnly) {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom);
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Export mode only: draws one rounded rectangle around the comfort quick-stats panel and the
 * bottom-right 4×2 chart, spanning the horizontal gap between them.
 */
export function Grid4x2ComfortExportOutline({
  active,
  containerRef,
  theme,
}: {
  active: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  theme: 'light' | 'dark';
}) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );

  const update = useCallback(() => {
    if (!active) {
      setBox(null);
      return;
    }
    const root = containerRef.current;
    const stats = document.getElementById(STATS_ID);
    const chart = document.querySelector(CHART_CORNER_SEL);
    if (!root || !stats || !chart) {
      setBox(null);
      return;
    }
    const r0 = root.getBoundingClientRect();
    const u = unionClientRect(stats.getBoundingClientRect(), chart.getBoundingClientRect());
    const pad = 3;
    setBox({
      left: u.left - r0.left - pad,
      top: u.top - r0.top - pad,
      width: u.width + pad * 2,
      height: u.height + pad * 2,
    });
  }, [active, containerRef]);

  useLayoutEffect(() => {
    update();
    if (!active) return;

    const ro = new ResizeObserver(() => update());
    const root = containerRef.current;
    const stats = document.getElementById(STATS_ID);
    const chart = document.querySelector(CHART_CORNER_SEL);
    if (root) ro.observe(root);
    if (stats) ro.observe(stats);
    if (chart) ro.observe(chart);

    window.addEventListener('resize', update);
    const id = window.requestAnimationFrame(() => update());
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.cancelAnimationFrame(id);
    };
  }, [active, update, containerRef]);

  if (!active || !box) return null;

  return (
    <div
      className="pointer-events-none absolute z-[5] rounded-2xl glow-lg"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        boxSizing: 'border-box',
      }}
      aria-hidden
    />
  );
}

