import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

type Theme = 'light' | 'dark';

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function CardModal({
  open,
  onClose,
  title,
  theme,
  anchorRef,
  maxWidthPx = 420,
  maxHeightPx,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  theme: Theme;
  /** Legacy: kept for callsite compatibility (no longer used). */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Absolute cap, regardless of card size */
  maxWidthPx?: number;
  /** Absolute cap, regardless of card size. Defaults to the viewport. */
  maxHeightPx?: number;
  children: React.ReactNode;
}) {
  // anchorRef is intentionally unused; modal is now full-screen.
  void anchorRef;

  useEffect(() => {
    if (!open || !canUseDom()) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  if (!canUseDom()) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`flex w-full flex-col overflow-hidden border shadow-hard-xl ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}
        style={{
          maxWidth: `min(${maxWidthPx}px, calc(100vw - 24px))`,
          maxHeight:
            maxHeightPx != null
              ? `min(${maxHeightPx}px, calc(100vh - 48px))`
              : 'calc(100vh - 48px)',
          borderRadius: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
          <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-0 ${
              theme === 'dark' ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
            aria-label="Close"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-3 pb-3">{children}</div>
      </div>
    </div>,
    document.body
  );
}

