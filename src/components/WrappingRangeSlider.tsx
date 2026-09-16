import { useCallback, useRef, useState } from 'react';

export type WrapRange = [number, number];

function snapToStep(raw: number, min: number, max: number, step: number): number {
  const snapped = Math.round((raw - min) / step) * step + min;
  return Math.max(min, Math.min(max, snapped));
}

function slotCount(min: number, max: number): number {
  return Math.max(1, max - min + 1);
}

function slotStartPct(value: number, min: number, max: number): number {
  return ((value - min) / slotCount(min, max)) * 100;
}

function slotEndPct(value: number, min: number, max: number): number {
  return ((value - min + 1) / slotCount(min, max)) * 100;
}

function handlePct(value: number, min: number, max: number): number {
  return (slotStartPct(value, min, max) + slotEndPct(value, min, max)) / 2;
}

export function wrappingTrackSegments(
  start: number,
  end: number,
  min: number,
  max: number
): { left: number; width: number }[] {
  if (start <= end) {
    const left = slotStartPct(start, min, max);
    const right = slotEndPct(end, min, max);
    return [{ left, width: Math.max(0, right - left) }];
  }
  const left = slotStartPct(start, min, max);
  return [
    { left, width: Math.max(0, 100 - left) },
    { left: 0, width: slotEndPct(end, min, max) },
  ];
}

function valueFromClientX(
  clientX: number,
  rail: DOMRect,
  min: number,
  max: number,
  step: number
): number {
  const t = rail.width <= 0 ? 0 : (clientX - rail.left) / rail.width;
  const n = slotCount(min, max);
  const idx = Math.max(0, Math.min(n - 1, Math.floor(t * n)));
  return snapToStep(min + idx, min, max, step);
}

/**
 * Dual-handle slider that can wrap: start > end highlights from start→max and min→end.
 * Dragging a handle past the other enters or leaves wrap without sorting the values.
 */
export function WrappingRangeSlider({
  min,
  max,
  value,
  onChange,
  step = 1,
  theme = 'light',
  startAriaLabel = 'Range start',
  endAriaLabel = 'Range end',
}: {
  min: number;
  max: number;
  value: WrapRange;
  onChange: (next: WrapRange) => void;
  step?: number;
  theme?: 'light' | 'dark';
  startAriaLabel?: string;
  endAriaLabel?: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const dragRef = useRef<'start' | 'end' | null>(null);
  const [active, setActive] = useState<'start' | 'end' | null>(null);

  const [start, end] = value;
  const wrapping = start > end;
  const startPct = handlePct(start, min, max);
  const endPct = handlePct(end, min, max);
  const segments = wrappingTrackSegments(start, end, min, max);
  const dark = theme === 'dark';

  const applyHandle = useCallback(
    (which: 'start' | 'end', next: number) => {
      const cur = valueRef.current;
      onChange(which === 'start' ? [next, cur[1]] : [cur[0], next]);
    },
    [onChange]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const which = dragRef.current;
      const rail = railRef.current;
      if (!which || !rail) return;
      applyHandle(which, valueFromClientX(e.clientX, rail.getBoundingClientRect(), min, max, step));
    },
    [applyHandle, max, min, step]
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    setActive(null);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
  }, [onPointerMove]);

  const startDrag = (which: 'start' | 'end', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = which;
    setActive(which);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    applyHandle(which, valueFromClientX(e.clientX, railRef.current!.getBoundingClientRect(), min, max, step));
  };

  const onRailPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rail = railRef.current;
    if (!rail) return;
    const next = valueFromClientX(e.clientX, rail.getBoundingClientRect(), min, max, step);
    const distStart = Math.abs(next - valueRef.current[0]);
    const distEnd = Math.abs(next - valueRef.current[1]);
    startDrag(distStart <= distEnd ? 'start' : 'end', e);
  };

  const nudge = (which: 'start' | 'end', delta: number) => {
    const cur = which === 'start' ? valueRef.current[0] : valueRef.current[1];
    applyHandle(which, snapToStep(cur + delta, min, max, step));
  };

  const handleClass = (which: 'start' | 'end') =>
    `absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab appearance-none rounded-full border-2 bg-white p-0 ${
      active === which ? 'z-[3] cursor-grabbing border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.35)]' : 'border-blue-500'
    }`;

  return (
    <div
      ref={railRef}
      className="relative h-3.5 w-full touch-none select-none"
      onPointerDown={onRailPointerDown}
      role="group"
      aria-label={wrapping ? 'Wrapping range' : 'Range'}
    >
      <div
        className={`absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${dark ? 'bg-gray-600' : 'bg-gray-200'}`}
      />
      {segments.map((seg, i) => (
        <div
          key={i}
          className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-500"
          style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
        />
      ))}
      <button
        type="button"
        className={handleClass('start')}
        style={{ left: `${startPct}%` }}
        aria-label={startAriaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={start}
        role="slider"
        onPointerDown={e => startDrag('start', e)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            nudge('start', -step);
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            nudge('start', step);
          } else if (e.key === 'Home') {
            e.preventDefault();
            applyHandle('start', min);
          } else if (e.key === 'End') {
            e.preventDefault();
            applyHandle('start', max);
          }
        }}
      />
      <button
        type="button"
        className={handleClass('end')}
        style={{ left: `${endPct}%` }}
        aria-label={endAriaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={end}
        role="slider"
        onPointerDown={e => startDrag('end', e)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            nudge('end', -step);
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            nudge('end', step);
          } else if (e.key === 'Home') {
            e.preventDefault();
            applyHandle('end', min);
          } else if (e.key === 'End') {
            e.preventDefault();
            applyHandle('end', max);
          }
        }}
      />
    </div>
  );
}
