import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { hideChartTooltip, subscribeChartTooltip, type ChartTooltipPayload } from '../lib/chartTooltip';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTooltipMarkup(payload: ChartTooltipPayload, dark: boolean): string {
  const titleCls = dark ? 'text-gray-100' : 'text-gray-900';
  const subCls = dark ? 'text-gray-400' : 'text-gray-500';
  const labelCls = dark ? 'text-gray-400' : 'text-gray-500';
  const valCls = dark ? 'text-gray-100' : 'text-gray-900';
  const hintCls = dark ? 'text-blue-300 border-gray-700/80' : 'text-blue-700 border-gray-100';

  const swatchHtml = payload.swatch
    ? `<span style="display:inline-block;width:9px;height:9px;border-radius:9999px;flex-shrink:0;background:${escapeHtml(payload.swatch)};box-shadow:0 0 0 1px rgba(0,0,0,0.14);"></span>`
    : '';

  const subtitleHtml = payload.subtitle
    ? `<div class="text-[10.5px] leading-tight ${subCls}" style="margin-top:2px;">${escapeHtml(payload.subtitle)}</div>`
    : '';

  const rowsHtml =
    payload.rows && payload.rows.length > 0
      ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;">${payload.rows
          .map(
            r =>
              `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:11px;line-height:1.3;">
                <span class="${labelCls}">${escapeHtml(r.label)}</span>
                <span class="font-semibold tabular-nums ${valCls}" style="text-align:right;">${escapeHtml(r.value)}</span>
              </div>`
          )
          .join('')}</div>`
      : '';

  const hintHtml = payload.hint
    ? `<div class="text-[10px] font-medium border-t ${hintCls}" style="margin-top:6px;padding-top:4px;">${escapeHtml(payload.hint)}</div>`
    : '';

  return `<div style="display:flex;align-items:center;gap:6px;">
      ${swatchHtml}
      <div class="text-[11.5px] font-semibold leading-tight ${titleCls}">${escapeHtml(payload.title)}</div>
    </div>
    ${subtitleHtml}
    ${rowsHtml}
    ${hintHtml}`;
}

export function ChartTooltipHost({ theme }: { theme: 'light' | 'dark' }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef(theme === 'dark');
  darkRef.current = theme === 'dark';

  useEffect(() => {
    const onGlobalHide = () => hideChartTooltip();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideChartTooltip();
    };
    window.addEventListener('scroll', onGlobalHide, true);
    window.addEventListener('blur', onGlobalHide);
    window.addEventListener('keydown', onKeyDown);

    let lastPayloadKey = '';
    const unsub = subscribeChartTooltip((payload, clientX, clientY) => {
      const box = boxRef.current;
      if (!box) return;
      if (!payload) {
        box.style.opacity = '0';
        box.style.visibility = 'hidden';
        lastPayloadKey = '';
        return;
      }

      const key = JSON.stringify(payload) + (darkRef.current ? ':d' : ':l');
      if (key !== lastPayloadKey) {
        box.innerHTML = renderTooltipMarkup(payload, darkRef.current);
        lastPayloadKey = key;
      }

      box.style.visibility = 'visible';
      box.style.opacity = '1';

      const rect = box.getBoundingClientRect();
      const pad = 12;
      const offset = 14;
      let left = clientX + offset;
      let top = clientY + offset;

      if (left + rect.width + pad > window.innerWidth) {
        left = Math.max(pad, clientX - rect.width - offset);
      }
      if (top + rect.height + pad > window.innerHeight) {
        top = Math.max(pad, clientY - rect.height - offset);
      }

      box.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    });

    return () => {
      unsub();
      window.removeEventListener('scroll', onGlobalHide, true);
      window.removeEventListener('blur', onGlobalHide);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={boxRef}
      role="tooltip"
      className={`pointer-events-none fixed left-0 top-0 z-[10050] max-w-[260px] rounded-2xl px-3 py-2 backdrop-blur-md transition-opacity duration-75 ${
        theme === 'dark'
          ? 'bg-gray-900/95 text-gray-100 glow-lg ring-1 ring-white/10'
          : 'bg-white/95 text-gray-900 glow-lg ring-1 ring-black/5'
      }`}
      style={{ opacity: 0, visibility: 'hidden', willChange: 'transform, opacity' }}
    />,
    document.body
  );
}
