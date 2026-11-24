import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import {
  CHART_TOOLBAR_TITLE_TEXT_CLASS,
  chartToolbarSelectPillClass,
} from '../lib/chartToolbarLayout';

interface VariableChartSelectProps {
  value: string;
  onChange: (next: string) => void;
  selectedLabel: string;
  theme: 'light' | 'dark';
  children: React.ReactNode;
  domId?: string;
  fillRow?: boolean;
  /** Same layout as UTCI / Wind rose title (flex-1, h-6, truncate). */
  toolbarTitle?: boolean;
}

type ParsedOption = { value: string; label: string; disabled?: boolean };
type ParsedGroup = { heading?: string; options: ParsedOption[] };

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return '';
}

/** Parses standard `<optgroup>` and `<option>` JSX children so callers stay unchanged while rendering a custom UI menu. */
function parseSelectChildren(children: React.ReactNode): ParsedGroup[] {
  const groups: ParsedGroup[] = [];
  let loose: ParsedOption[] = [];

  const flushLoose = () => {
    if (loose.length > 0) {
      groups.push({ options: loose });
      loose = [];
    }
  };

  const visit = (node: React.ReactNode) => {
    React.Children.forEach(node, child => {
      if (!React.isValidElement<any>(child)) return;
      if (child.type === React.Fragment) {
        visit(child.props.children);
        return;
      }
      if (child.type === 'optgroup') {
        flushLoose();
        const opts: ParsedOption[] = [];
        React.Children.forEach(child.props.children, opt => {
          if (React.isValidElement<any>(opt) && opt.type === 'option') {
            const label = extractText(opt.props.children).trim();
            const val = opt.props.value !== undefined ? String(opt.props.value) : label;
            opts.push({ value: val, label, disabled: Boolean(opt.props.disabled) });
          }
        });
        if (opts.length > 0) {
          groups.push({ heading: child.props.label ? String(child.props.label) : undefined, options: opts });
        }
        return;
      }
      if (child.type === 'option') {
        const label = extractText(child.props.children).trim();
        const val = child.props.value !== undefined ? String(child.props.value) : label;
        loose.push({ value: val, label, disabled: Boolean(child.props.disabled) });
      }
    });
  };

  visit(children);
  flushLoose();
  return groups;
}

/**
 * Width-adaptive card header variable dropdown with custom rounded-2xl UI menu matching
 * ChartTypeMenu & ChartToolbarLabeledMenu. Portals to document.body so menus never clip inside
 * narrow/bottom-row 4×2 cards, and sets `data-card-dropdown-open="true"` to hide hover toolbars.
 */
export function VariableChartSelect({
  value,
  onChange,
  selectedLabel,
  theme,
  children,
  domId,
  fillRow = true,
}: VariableChartSelectProps) {
  const uid = useId().replace(/:/g, '');
  const menuId = domId ? `${domId}-menu` : `var-chart-menu-${uid}`;
  const dark = theme === 'dark';

  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    openAbove: boolean;
  } | null>(null);

  const groups = useMemo(() => parseSelectChildren(children), [children]);

  const updateMenuPosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minMenuWidth = Math.min(256, vw - 16);
    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openAbove = spaceBelow < 210 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(150, Math.min(340, openAbove ? spaceAbove - 6 : spaceBelow - 6));
    const left = Math.max(8, Math.min(rect.left, vw - minMenuWidth - 8));
    const top = openAbove ? rect.top - 6 : rect.bottom + 6;
    setMenuPos({ top, left, maxHeight, openAbove });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onViewportChange = () => updateMenuPosition();

    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <div
      id={domId}
      data-card-dropdown-open={open ? 'true' : undefined}
      className={`flex min-w-0 items-center overflow-visible ${
        fillRow ? 'flex-1 basis-0' : 'flex-initial'
      } max-w-full`}
    >
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        title={`Change variable · ${selectedLabel}`}
        onClick={() => setOpen(v => !v)}
        className={`group/var-select inline-flex h-5 min-w-0 max-w-full items-center gap-1 rounded-full px-2 text-left transition-[background-color,box-shadow,color] duration-150 focus-visible:outline-none @lg:h-6 ${CHART_TOOLBAR_TITLE_TEXT_CLASS} ${chartToolbarSelectPillClass(
          theme
        )}`}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-2.5 w-2.5 shrink-0 transition-transform duration-150 @lg:h-3 @lg:w-3 ${
            open ? 'rotate-180 opacity-95' : 'opacity-65 group-hover/var-select:opacity-95'
          }`}
          strokeWidth={2.4}
          aria-hidden
        />
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="listbox"
            aria-label={selectedLabel}
            style={{
              position: 'fixed',
              left: `${menuPos.left}px`,
              top: `${menuPos.top}px`,
              transform: menuPos.openAbove ? 'translateY(-100%)' : undefined,
              maxHeight: `${menuPos.maxHeight}px`,
            }}
            className={`z-[9990] w-[min(16.5rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl p-1.5 font-sans glow-xl ${
              dark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
            }`}
          >
            {groups.map((group, gi) => (
              <div key={group.heading ?? `grp-${gi}`} role="presentation" className={gi > 0 ? 'mt-1' : undefined}>
                {group.heading ? (
                  <div
                    className={`px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      dark ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    {group.heading}
                  </div>
                ) : null}
                <div className="space-y-0.5">
                  {group.options.map(opt => {
                    const active = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={opt.disabled}
                        onClick={() => {
                          setOpen(false);
                          if (opt.value !== value) onChange(opt.value);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-45 ${
                          active
                            ? dark
                              ? 'bg-gray-700 font-semibold text-white'
                              : 'bg-gray-100 font-semibold text-gray-950'
                            : dark
                              ? 'font-medium text-gray-200 hover:bg-gray-700/60'
                              : 'font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-950'
                        }`}
                      >
                        <span className="min-w-0 truncate">{opt.label}</span>
                        {active ? <Check className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
