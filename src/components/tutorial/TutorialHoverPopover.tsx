import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type HoverHintDef = { id: string; title: string; body: string };

const GAP = 8;
const VIEW_PAD = 10;
const DEFAULT_MAX_W = 300;

function clampPosition(anchor: DOMRect, tipW: number, tipH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.min(DEFAULT_MAX_W, vw - 2 * VIEW_PAD);
  const w = Math.min(tipW, maxW);
  let left = anchor.left + anchor.width / 2 - w / 2;
  left = Math.max(VIEW_PAD, Math.min(left, vw - w - VIEW_PAD));
  let top = anchor.bottom + GAP;
  if (top + tipH > vh - VIEW_PAD) {
    top = anchor.top - GAP - tipH;
  }
  top = Math.max(VIEW_PAD, Math.min(top, vh - tipH - VIEW_PAD));
  return { left, top, maxW };
}

/**
 * Binds mouse/focus to elements with the given ids and shows a fixed popunder
 * (or above if needed) clamped to the viewport.
 */
export function TutorialHoverPopoverLayer({
  defs,
  theme,
  zIndex = 80,
  /** When this changes, listeners are re-attached (e.g. chart DOM just mounted). */
  rebindKey = '',
}: {
  defs: HoverHintDef[];
  theme: 'light' | 'dark';
  zIndex?: number;
  rebindKey?: string | number;
}) {
  const [open, setOpen] = useState<HoverHintDef | null>(null);
  const [box, setBox] = useState({ left: 0, top: 0, maxW: DEFAULT_MAX_W });
  const anchorElRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const reposition = useCallback(() => {
    const el = anchorElRef.current;
    const panel = panelRef.current;
    if (!el || !panel) return;
    const ar = el.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    setBox(clampPosition(ar, pr.width, pr.height));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => reposition());
    return () => cancelAnimationFrame(id);
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const ro = new ResizeObserver(() => reposition());
    const a = anchorElRef.current;
    const p = panelRef.current;
    if (a) ro.observe(a);
    if (p) ro.observe(p);
    const onWin = () => reposition();
    window.addEventListener('scroll', onWin, true);
    window.addEventListener('resize', onWin);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', onWin, true);
      window.removeEventListener('resize', onWin);
    };
  }, [open, reposition]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    for (const def of defs) {
      const el = document.getElementById(def.id);
      if (!el) continue;

      const onEnter = () => {
        cancelHide();
        anchorElRef.current = el;
        setOpen(def);
      };
      const onLeave = () => {
        hideTimer.current = setTimeout(() => {
          setOpen(null);
          anchorElRef.current = null;
        }, 280);
      };
      /** Close before the control handles the click (dropdowns, buttons, etc.). */
      const onPointerDownCapture = () => {
        cancelHide();
        setOpen(null);
        anchorElRef.current = null;
      };

      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
      el.addEventListener('focusin', onEnter);
      el.addEventListener('focusout', onLeave);
      el.addEventListener('pointerdown', onPointerDownCapture, true);

      cleanups.push(() => {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
        el.removeEventListener('focusin', onEnter);
        el.removeEventListener('focusout', onLeave);
        el.removeEventListener('pointerdown', onPointerDownCapture, true);
      });
    }

    return () => {
      cancelHide();
      setOpen(null);
      anchorElRef.current = null;
      cleanups.forEach(fn => fn());
    };
  }, [defs, rebindKey, cancelHide]);

  /** Match primary UI blue used for the Directions control. */
  const surface =
    theme === 'dark'
      ? 'bg-blue-950 text-blue-50 shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_28px_rgba(59,130,246,0.35)]'
      : 'bg-blue-50 text-gray-900 shadow-[0_8px_24px_rgba(15,23,42,0.12),0_0_28px_rgba(59,130,246,0.3)]';

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="tooltip"
      className={`pointer-events-auto fixed max-w-[min(320px,calc(100vw-20px))] rounded-2xl px-3.5 py-2.5 ${surface}`}
      style={{ left: box.left, top: box.top, maxWidth: box.maxW, zIndex }}
      onMouseEnter={cancelHide}
      onMouseLeave={() => {
        hideTimer.current = setTimeout(() => {
          setOpen(null);
          anchorElRef.current = null;
        }, 280);
      }}
    >
      <div
        className={`text-[11px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-blue-200' : 'text-blue-800'}`}
      >
        {open.title}
      </div>
      <p className={`mt-1 text-[13px] leading-snug ${theme === 'dark' ? 'text-blue-100/95' : 'text-gray-700'}`}>{open.body}</p>
    </div>,
    document.body
  );
}
