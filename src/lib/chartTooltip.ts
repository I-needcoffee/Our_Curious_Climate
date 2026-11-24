import type { BaseType, Selection } from 'd3';

export interface ChartTooltipRow {
  label: string;
  value: string;
}

export interface ChartTooltipPayload {
  title: string;
  subtitle?: string;
  swatch?: string;
  rows?: ChartTooltipRow[];
  hint?: string;
}

type TooltipListener = (
  payload: ChartTooltipPayload | null,
  clientX: number,
  clientY: number
) => void;

const listeners = new Set<TooltipListener>();

export function subscribeChartTooltip(fn: TooltipListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function showChartTooltip(
  ev: { clientX: number; clientY: number },
  payload: ChartTooltipPayload
): void {
  for (const l of listeners) l(payload, ev.clientX, ev.clientY);
}

export function moveChartTooltip(
  ev: { clientX: number; clientY: number },
  payload: ChartTooltipPayload
): void {
  for (const l of listeners) l(payload, ev.clientX, ev.clientY);
}

export function hideChartTooltip(): void {
  for (const l of listeners) l(null, 0, 0);
}

/**
 * Attach instant floating tooltips + subtle hover emphasis to any D3 selection.
 * Avoids React re-renders during pointer movement by pushing coordinates directly
 * to the mounted `<ChartTooltipHost />`.
 */
export function attachChartTooltip<GElement extends BaseType, Datum>(
  selection: Selection<GElement, Datum, any, any>,
  buildPayload: (d: Datum) => ChartTooltipPayload | null,
  options?: {
    hoverStroke?: string;
    hoverStrokeWidth?: number;
  }
): void {
  const hoverStroke = options?.hoverStroke;
  const hoverStrokeWidth = options?.hoverStrokeWidth ?? 1.5;

  selection
    .on('mouseenter.charttip', function (event: MouseEvent, d: Datum) {
      const payload = buildPayload(d);
      if (!payload) return;
      const el = this as unknown as SVGElement;
      if (hoverStroke && el?.style) {
        el.dataset.prevStroke = el.style.stroke || '';
        el.dataset.prevStrokeWidth = el.style.strokeWidth || '';
        el.style.stroke = hoverStroke;
        el.style.strokeWidth = `${hoverStrokeWidth}px`;
      }
      showChartTooltip(event, payload);
    })
    .on('mousemove.charttip', function (event: MouseEvent, d: Datum) {
      const payload = buildPayload(d);
      if (!payload) {
        hideChartTooltip();
        return;
      }
      moveChartTooltip(event, payload);
    })
    .on('mouseleave.charttip', function () {
      const el = this as unknown as SVGElement;
      if (hoverStroke && el?.style) {
        el.style.stroke = el.dataset.prevStroke ?? '';
        el.style.strokeWidth = el.dataset.prevStrokeWidth ?? '';
        delete el.dataset.prevStroke;
        delete el.dataset.prevStrokeWidth;
      }
      hideChartTooltip();
    });
}
