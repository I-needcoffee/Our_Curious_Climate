import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { EPWVariable } from '../lib/epwParser';
import { chartToolbarMenuTriggerClass } from '../lib/chartToolbarLayout';

/**
 * Compact toolbar control: shows only the role label (e.g. Color, Radius).
 * Opens a menu with the full variable list for that role.
 */
export function ChartToolbarLabeledMenu({
  label,
  value,
  onChange,
  groupedVariables,
  convertUnit,
  selectedName,
  theme,
  domId,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  groupedVariables: Record<string, EPWVariable[]>;
  convertUnit: (unit: string) => string;
  selectedName: string;
  theme: 'light' | 'dark';
  domId?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const dark = theme === 'dark';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
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
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const title = `${label}: ${selectedName}`;

  return (
    <div id={domId} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={title}
        className={`${chartToolbarMenuTriggerClass(theme)} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 dark:focus-visible:ring-gray-500 dark:focus-visible:ring-offset-gray-800`}
        onClick={() => setOpen(v => !v)}
      >
        {label}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70 @lg:h-4 @lg:w-4 @2xl:h-5 @2xl:w-5" strokeWidth={2.25} aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          className={`absolute left-0 top-full z-50 mt-1 max-h-52 min-w-[11rem] overflow-y-auto rounded-lg border shadow-hard-lg ${
            dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
          }`}
        >
          {Object.entries(groupedVariables).map(([category, vars]) => (
            <div key={category} role="presentation">
              <div
                className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${
                  dark ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {category}
              </div>
              {vars.map(v => {
                const active = value === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onChange(v.id);
                      setOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
                      active
                        ? dark
                          ? 'bg-gray-700 text-white'
                          : 'bg-gray-100 text-gray-900'
                        : dark
                          ? 'text-gray-200 hover:bg-gray-700/60'
                          : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {v.name} ({convertUnit(v.unit)})
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
