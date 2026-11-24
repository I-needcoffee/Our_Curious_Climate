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
    <div id={domId} data-card-dropdown-open={open ? 'true' : undefined} className="relative shrink-0">
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
        <ChevronDown
          className={`h-2.5 w-2.5 shrink-0 transition-transform duration-150 @lg:h-3 @lg:w-3 ${
            open ? 'rotate-180 opacity-90' : 'opacity-65'
          }`}
          strokeWidth={2.4}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          className={`absolute left-0 top-full z-50 mt-1.5 max-h-80 min-w-[14rem] overflow-y-auto rounded-2xl p-1.5 glow-xl ${
            dark ? 'bg-gray-800' : 'bg-white'
          }`}
        >
          {Object.entries(groupedVariables).map(([category, vars]) => (
            <div key={category} role="presentation">
              <div
                className={`px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider ${
                  dark ? 'text-gray-400' : 'text-gray-500'
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
                    className={`w-full rounded-full px-3 py-1.5 text-left text-[13px] font-medium transition-colors ${
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
