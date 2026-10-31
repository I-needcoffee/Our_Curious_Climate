import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

function yearOptions(): number[] {
  const cap = new Date().getFullYear();
  const out: number[] = [];
  for (let y = cap; y >= 1980; y--) out.push(y);
  return out;
}

export function IemWindSetupModal({
  open,
  theme,
  initialStart,
  initialEnd,
  onApply,
  onCancel,
}: {
  open: boolean;
  theme: 'light' | 'dark';
  initialStart: number;
  initialEnd: number;
  onApply: (start: number, end: number) => void;
  onCancel: () => void;
}) {
  const years = useMemo(() => yearOptions(), []);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  useEffect(() => {
    if (!open) return;
    setStart(initialStart);
    setEnd(initialEnd);
  }, [open, initialStart, initialEnd]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const apply = () => {
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    onApply(lo, hi);
  };

  const shell =
    theme === 'dark'
      ? 'bg-gray-800 text-gray-100'
      : 'bg-white text-gray-900';

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="iem-wind-setup-title"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={`relative w-full max-w-md rounded-3xl p-5 glow-xl sm:p-6 ${shell}`}>
        <button
          type="button"
          onClick={onCancel}
          className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
          }`}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 id="iem-wind-setup-title" className="pr-10 text-base font-semibold leading-snug">
          Mesonet wind — years to compile
        </h2>
        <p className={`mt-2 text-xs leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Choose one or more calendar years. Multiple years are merged as a vector mean at each EPW hour (one mesonet sample
          per year per UTC hour). Larger ranges take longer to download.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={`text-xs font-semibold uppercase tracking-wide ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
              Start year
            </span>
            <select
              value={start}
              onChange={e => setStart(Number(e.target.value))}
              className={`rounded-full px-3.5 py-1.5 text-sm tabular-nums ${
                theme === 'dark' ? 'bg-gray-900/40 text-gray-100' : 'bg-gray-100 text-gray-900'
              }`}
            >
              {years.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={`text-xs font-semibold uppercase tracking-wide ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
              End year
            </span>
            <select
              value={end}
              onChange={e => setEnd(Number(e.target.value))}
              className={`rounded-full px-3.5 py-1.5 text-sm tabular-nums ${
                theme === 'dark' ? 'bg-gray-900/40 text-gray-100' : 'bg-gray-100 text-gray-900'
              }`}
            >
              {years.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              theme === 'dark' ? 'text-gray-300 hover:bg-gray-700/80 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className={`rounded-full px-5 py-2 text-sm font-semibold text-white glow-sm ${
              theme === 'dark' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-gray-800 hover:bg-gray-900'
            }`}
          >
            Load wind data
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Absolute overlay on chart area while IEM rows resolve. */
export function IemWindChartLoadingOverlay({
  theme,
  label,
}: {
  theme: 'light' | 'dark';
  label?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 ${
        theme === 'dark' ? 'bg-gray-950/55' : 'bg-white/70'
      }`}
      aria-busy
      aria-live="polite"
    >
      <Loader2 className={`h-8 w-8 animate-spin ${theme === 'dark' ? 'text-sky-400' : 'text-gray-700'}`} aria-hidden />
      <span className={`max-w-[14rem] text-center text-[11px] font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
        {label ?? 'Loading IEM ASOS wind…'}
      </span>
    </div>
  );
}
