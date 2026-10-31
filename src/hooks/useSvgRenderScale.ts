import { RefObject, useEffect, useState } from 'react';
import { EXPLORER_SVG_BASE_WIDTH, EXPLORER_SVG_DEFAULT_HEIGHT, explorerSvgHeightForBox } from '../lib/explorerChartSvgLayout';

const quantizeScale = (s: number) => Math.max(0.25, Math.round(s * 20) / 20);

/**
 * Rendered CSS px per viewBox unit for an SVG drawn with `preserveAspectRatio="… meet"`.
 * Quantized to 0.05 so small layout jitter does not re-render the chart.
 */
export function useSvgRenderScale(
  ref: RefObject<Element | null>,
  viewBoxWidth: number,
  viewBoxHeight: number
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || viewBoxWidth <= 0 || viewBoxHeight <= 0) return;
    let frame = 0;
    const observer = new ResizeObserver(entries => {
      const box = entries[entries.length - 1]?.contentRect;
      if (!box || box.width <= 0 || box.height <= 0) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = quantizeScale(Math.min(box.width / viewBoxWidth, box.height / viewBoxHeight));
        setScale(prev => (prev === next ? prev : next));
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, viewBoxWidth, viewBoxHeight]);

  return scale;
}

/**
 * Explorer charts: viewBox height chosen from the SVG's CSS box (see `explorerSvgHeightForBox`) so
 * the chart spans the card width, plus the matching render scale.
 */
export function useExplorerSvgFrame(ref: RefObject<Element | null>): { renderScale: number; svgHeight: number } {
  const [frame, setFrame] = useState({ renderScale: 1, svgHeight: EXPLORER_SVG_DEFAULT_HEIGHT });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const observer = new ResizeObserver(entries => {
      const box = entries[entries.length - 1]?.contentRect;
      if (!box || box.width <= 0 || box.height <= 0) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const svgHeight = explorerSvgHeightForBox(box.width, box.height);
        const renderScale = quantizeScale(Math.min(box.width / EXPLORER_SVG_BASE_WIDTH, box.height / svgHeight));
        setFrame(prev =>
          prev.svgHeight === svgHeight && prev.renderScale === renderScale ? prev : { renderScale, svgHeight }
        );
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ref]);

  return frame;
}
