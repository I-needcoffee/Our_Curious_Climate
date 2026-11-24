import { useEffect, useState } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import type { GlobalFilterState } from '../lib/globalFilter';
import type { UnitSystem } from '../App';
import { UNIT_C, UNIT_F } from '../lib/unitConversion';

function effectiveTemperatureBand(
  f: GlobalFilterState,
  minC: number,
  maxC: number
): [number, number] {
  switch (f.temperatureMode) {
    case 'off':
      return [minC, maxC];
    case 'between':
      return [Math.min(f.temperatureLoC, f.temperatureHiC), Math.max(f.temperatureLoC, f.temperatureHiC)];
    case 'above':
      return [f.temperatureLoC, maxC];
    case 'below':
      return [minC, f.temperatureHiC];
    default:
      return [minC, maxC];
  }
}

/** Dual-handle dry-bulb isolation (°C internally); slider rail = extent of loaded file(s). */
export function TemperatureIsolationRange({
  filter,
  onChangeFilter,
  theme,
  unitSystem,
  extentMinC,
  extentMaxC,
  compact,
}: {
  filter: GlobalFilterState;
  onChangeFilter: (f: GlobalFilterState) => void;
  theme: 'light' | 'dark';
  unitSystem: UnitSystem;
  extentMinC: number;
  extentMaxC: number;
  compact?: boolean;
}) {
  const dark = theme === 'dark';
  const minC = Math.min(extentMinC, extentMaxC);
  const maxC = Math.max(extentMinC, extentMaxC);
  const span = Math.max(maxC - minC, 1e-6);

  const [rawLoC, rawHiC] = effectiveTemperatureBand(filter, minC, maxC);
  const clampLo = (t: number) => Math.min(maxC, Math.max(minC, t));
  const loC = clampLo(rawLoC);
  const hiC = clampLo(rawHiC);
  const step = span > 30 ? 1 : 0.5;
  const inputStep = unitSystem === 'imperial' ? 1 : 0.5;
  const syncMode = (nextLoC: number, nextHiC: number): GlobalFilterState['temperatureMode'] => {
    const a = Math.min(nextLoC, nextHiC);
    const b = Math.max(nextLoC, nextHiC);
    const tol = Math.max(step * 0.6, 0.05);
    const atFull = Math.abs(a - minC) <= tol && Math.abs(b - maxC) <= tol;
    return atFull ? 'off' : 'between';
  };

  const display = (c: number) =>
    unitSystem === 'imperial' ? (c * 9) / 5 + 32 : c;
  const parseDisplayToC = (n: number) => (unitSystem === 'imperial' ? ((n - 32) * 5) / 9 : n);
  const fmtInput = (c: number) => String(Math.round(display(c) * 10) / 10);

  const [loDraft, setLoDraft] = useState(() => fmtInput(loC));
  const [hiDraft, setHiDraft] = useState(() => fmtInput(hiC));
  useEffect(() => {
    setLoDraft(fmtInput(loC));
  }, [loC, unitSystem]);
  useEffect(() => {
    setHiDraft(fmtInput(hiC));
  }, [hiC, unitSystem]);

  const commitLo = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setLoDraft(fmtInput(loC));
      return;
    }
    const nextC = clampLo(parseDisplayToC(parsed));
    const hi = clampLo(Math.max(loC, hiC));
    const nextLo = Math.min(nextC, hi);
    onChangeFilter({
      ...filter,
      temperatureLoC: nextLo,
      temperatureHiC: hi,
      temperatureMode: syncMode(nextLo, hi),
    });
    setLoDraft(fmtInput(nextLo));
  };

  const commitHi = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setHiDraft(fmtInput(hiC));
      return;
    }
    const nextC = clampLo(parseDisplayToC(parsed));
    const low = clampLo(Math.min(loC, hiC));
    const nextHi = Math.max(nextC, low);
    onChangeFilter({
      ...filter,
      temperatureLoC: low,
      temperatureHiC: nextHi,
      temperatureMode: syncMode(low, nextHi),
    });
    setHiDraft(fmtInput(nextHi));
  };

  const trackStyle = [{ backgroundColor: dark ? '#9ca3af' : '#525252', height: compact ? '4px' : '6px' }];
  const knob = {
    border: 'none',
    backgroundColor: 'white',
    opacity: 1,
    boxShadow: '0 1px 3px rgba(0,0,0,0.25), 0 0 10px rgba(15,23,42,0.18)',
    width: compact ? '14px' : '18px',
    height: compact ? '14px' : '18px',
    marginTop: compact ? '-5px' : '-6px',
  };
  const handleStyle = [knob, knob];

  const shellMuted = dark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`space-y-3 ${compact ? '' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${dark ? 'bg-gray-700 text-gray-100' : 'bg-white text-gray-800 glow-sm'}`}>
          {filter.temperatureMode === 'off'
            ? `Full file (${display(minC).toFixed(1)}\u2013${display(maxC).toFixed(1)}${unitSystem === 'imperial' ? UNIT_F : UNIT_C})`
            : `Isolating ${display(loC).toFixed(1)}\u2013${display(hiC).toFixed(1)}${unitSystem === 'imperial' ? UNIT_F : UNIT_C}`}
        </span>
        <button
          type="button"
          className={`text-xs font-semibold underline-offset-2 hover:underline ${dark ? 'text-gray-300' : 'text-gray-700'}`}
          onClick={() =>
            onChangeFilter({
              ...filter,
              temperatureMode: 'off',
              temperatureLoC: minC,
              temperatureHiC: maxC,
            })
          }
        >
          Reset to full range
        </button>
      </div>

      <div className={compact ? 'px-1 py-1' : 'px-2 py-2'}>
        <Slider
          range
          min={minC}
          max={maxC}
          step={step}
          value={[clampLo(loC), clampLo(hiC)]}
          onChange={val => {
            if (!Array.isArray(val)) return;
            const a = clampLo(val[0]!);
            const b = clampLo(val[1]!);
            onChangeFilter({
              ...filter,
              temperatureLoC: a,
              temperatureHiC: b,
              temperatureMode: syncMode(a, b),
            });
          }}
          trackStyle={trackStyle}
          handleStyle={handleStyle}
          railStyle={{ backgroundColor: dark ? '#374151' : '#e5e7eb', height: compact ? '4px' : '6px', borderRadius: 9999 }}
        />
      </div>

      <div className={`flex flex-wrap items-end gap-4 text-xs ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
        <label className="flex flex-col gap-1">
          <span className={shellMuted}>Low limit</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step={inputStep}
              value={loDraft}
              onChange={e => setLoDraft(e.target.value)}
              onBlur={() => commitLo(loDraft)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitLo(loDraft);
              }}
              className={`w-24 rounded-full px-3 py-1.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${dark ? 'bg-gray-900/80 text-gray-100' : 'bg-white glow-sm'}`}
            />
            <span className="tabular-nums opacity-75">{unitSystem === 'imperial' ? UNIT_F : UNIT_C}</span>
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className={shellMuted}>High limit</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step={inputStep}
              value={hiDraft}
              onChange={e => setHiDraft(e.target.value)}
              onBlur={() => commitHi(hiDraft)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitHi(hiDraft);
              }}
              className={`w-24 rounded-full px-3 py-1.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${dark ? 'bg-gray-900/80 text-gray-100' : 'bg-white glow-sm'}`}
            />
            <span className="tabular-nums opacity-75">{unitSystem === 'imperial' ? UNIT_F : UNIT_C}</span>
          </div>
        </label>
      </div>

      <p className={`text-xs leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        Uses EPW dry-bulb temperature (stored in °C). Drag both handles or type limits to include only timesteps within
        this band across every chart.
      </p>
    </div>
  );
}
