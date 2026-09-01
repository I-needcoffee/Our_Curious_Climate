import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleMarker, MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, X } from 'lucide-react';
import type { EPWMetadata } from '../lib/epwParser';
import { CARTO_LIGHT_ALL_WATER_HEX } from '../lib/constants';
import { BasemapLayer, readBasemapStyle } from './BasemapLayer';
import {
  findWindMapStation,
  loadWindStationsNearEpw,
  pickDefaultWindStation,
  windMapStationToSelection,
} from '../lib/iem/windStationCatalog';
import { US_STATE_OPTIONS } from '../lib/iem/usStateCodes';
import {
  stationKindLabel,
  stationMarkerColor,
  windExpectationLabel,
  type IemWindStationSelection,
  type WindMapStation,
} from '../lib/iem/windStationTypes';

/** Leaflet often mis-sizes inside flex modals until the container is measured. */
function MapInvalidateSize({ ready }: { ready: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!ready) return;
    const run = () => map.invalidateSize({ animate: false });
    run();
    const raf = requestAnimationFrame(run);
    const t = window.setTimeout(run, 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [map, ready]);

  return null;
}

function MapFitEpwAndStations({
  epwLat,
  epwLng,
  stations,
  ready,
}: {
  epwLat: number;
  epwLng: number;
  stations: WindMapStation[];
  ready: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!ready) return;
    map.invalidateSize({ animate: false });
    if (stations.length === 0) {
      map.setView([epwLat, epwLng], 8);
      return;
    }
    const pts: L.LatLngExpression[] = [[epwLat, epwLng]];
    for (const s of stations.slice(0, 80)) {
      pts.push([s.lat, s.lng]);
    }
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds.pad(0.14), { maxZoom: 10 });
  }, [map, epwLat, epwLng, stations, ready]);

  return null;
}

function markerFillOpacity(st: WindMapStation): number {
  if (st.windExpectation === 'expected') return 0.92;
  if (st.windExpectation === 'limited') return 0.72;
  return 0.45;
}

export function WindStationPickerModal({
  open,
  theme,
  metadata,
  sourceFilename,
  initialSelection,
  onApply,
  onCancel,
}: {
  open: boolean;
  theme: 'light' | 'dark';
  metadata: EPWMetadata;
  sourceFilename?: string;
  initialSelection: IemWindStationSelection | null;
  onApply: (selection: IemWindStationSelection) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [statePickerNote, setStatePickerNote] = useState<string | null>(null);
  const [needsStatePicker, setNeedsStatePicker] = useState(false);
  const [manualStateCode, setManualStateCode] = useState('');
  const [epwLat, setEpwLat] = useState(metadata.lat);
  const [epwLng, setEpwLng] = useState(metadata.lng);
  const [stations, setStations] = useState<WindMapStation[]>([]);
  const [rwisNote, setRwisNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<IemWindStationSelection | null>(initialSelection);
  /** Next stays disabled until the user clicks a station (auto-suggested default does not count). */
  const [userPickedStation, setUserPickedStation] = useState(false);
  const [basemapStyle] = useState(readBasemapStyle);

  useEffect(() => {
    if (!open) return;
    setSelected(initialSelection);
    setUserPickedStation(!!initialSelection?.stationId);
    const net = initialSelection?.network ?? '';
    const inferred = net.match(/^([A-Z]{2})_(?:ASOS|RWIS)$/i);
    setManualStateCode(inferred?.[1]?.toUpperCase() ?? '');
    setNeedsStatePicker(false);
    setStatePickerNote(null);
    setFatalError(null);
  }, [open, initialSelection]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFatalError(null);
    setStatePickerNote(null);

    const stateOverride = manualStateCode.trim() || undefined;

    loadWindStationsNearEpw(metadata, undefined, undefined, {
      stateCodeOverride: stateOverride,
      sourceFilename,
    })
      .then(res => {
        if (cancelled) return;
        if (res.kind === 'no_coordinates') {
          setFatalError(res.detail);
          setNeedsStatePicker(false);
          setStations([]);
          setLoading(false);
          return;
        }
        if (res.kind === 'not_us') {
          setFatalError(res.detail);
          setNeedsStatePicker(false);
          setStations([]);
          setLoading(false);
          return;
        }
        if (res.kind === 'needs_state') {
          setEpwLat(res.epwLat);
          setEpwLng(res.epwLng);
          setStations([]);
          setRwisNote(null);
          setNeedsStatePicker(true);
          setStatePickerNote(res.detail);
          if (res.suggestedStateCode && !manualStateCode) {
            setManualStateCode(res.suggestedStateCode);
          }
          setLoading(false);
          return;
        }

        setNeedsStatePicker(false);
        setEpwLat(res.epwLat);
        setEpwLng(res.epwLng);
        setStations(res.stations);
        setRwisNote(res.rwisUnavailableNote);
        setLoading(false);

        const existing = findWindMapStation(res.stations, initialSelection);
        if (existing) {
          setSelected(windMapStationToSelection(existing));
          return;
        }
        const def = pickDefaultWindStation(res.stations);
        if (def) setSelected(windMapStationToSelection(def));
      })
      .catch(e => {
        if (cancelled) return;
        setFatalError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, metadata, sourceFilename, initialSelection, manualStateCode]);

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

  const selectedStation = useMemo(() => findWindMapStation(stations, selected), [stations, selected]);

  const counts = useMemo(() => {
    let asos = 0;
    let rwis = 0;
    for (const s of stations) {
      if (s.kind === 'asos') asos++;
      else rwis++;
    }
    return { asos, rwis };
  }, [stations]);

  if (!open) return null;

  const shell =
    theme === 'dark'
      ? 'border-gray-600 bg-gray-800 text-gray-100'
      : 'border-gray-200 bg-white text-gray-900';

  const canContinue = userPickedStation && !!selected?.stationId;

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wind-station-picker-title"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={`relative flex max-h-[min(92vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-hard-xl ${shell}`}
      >
        <button
          type="button"
          onClick={onCancel}
          className={`absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ${
            theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
          }`}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="shrink-0 p-4 pb-2 pr-12 sm:p-5 sm:pb-3">
          <h2 id="wind-station-picker-title" className="text-base font-semibold leading-snug">
            Choose a mesonet wind station
          </h2>
          <p className={`mt-1.5 text-xs leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Map is centered on your EPW site. Blue = ASOS (airport METAR), green = RWIS (road weather). Wind availability
            is estimated from IEM catalog metadata — not probed station-by-station.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ea580c] ring-1 ring-white" aria-hidden />
              EPW site
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2563eb]" aria-hidden />
              ASOS ({counts.asos})
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#059669]" aria-hidden />
              RWIS ({counts.rwis})
            </span>
            <span className={theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}>Faded = shorter/unknown archive</span>
          </div>
          {needsStatePicker ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2.5 text-xs leading-snug ${
                theme === 'dark'
                  ? 'border-amber-700/60 bg-amber-950/40 text-amber-100'
                  : 'border-amber-200 bg-amber-50 text-amber-950'
              }`}
            >
              <p>{statePickerNote}</p>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">U.S. state</span>
                <select
                  value={manualStateCode}
                  onChange={e => {
                    setManualStateCode(e.target.value);
                    setUserPickedStation(false);
                    setSelected(null);
                  }}
                  className={`rounded-md border px-2 py-1.5 text-sm ${
                    theme === 'dark'
                      ? 'border-gray-600 bg-gray-900/60 text-gray-100'
                      : 'border-gray-200 bg-white text-gray-900'
                  }`}
                >
                  <option value="">Select state…</option>
                  {US_STATE_OPTIONS.map(row => (
                    <option key={row.code} value={row.code}>
                      {row.name} ({row.code})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>

        <div
          className="relative min-h-[280px] w-full flex-1 overflow-hidden"
          style={{ backgroundColor: CARTO_LIGHT_ALL_WATER_HEX }}
        >
          {loading ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/10">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden />
              <span className="sr-only">Loading stations</span>
            </div>
          ) : null}
          {fatalError ? (
            <p className="px-4 py-8 text-center text-sm text-red-600 dark:text-red-400 sm:px-5">{fatalError}</p>
          ) : (
            <MapContainer
              center={[epwLat, epwLng]}
              zoom={8}
              className="absolute inset-0 z-0 h-full w-full"
              scrollWheelZoom
              style={{ background: CARTO_LIGHT_ALL_WATER_HEX }}
            >
              <BasemapLayer style={basemapStyle} />
              <MapInvalidateSize ready={!loading && !fatalError} />
              <MapFitEpwAndStations
                epwLat={epwLat}
                epwLng={epwLng}
                stations={stations}
                ready={!loading && !fatalError}
              />
              <CircleMarker
                center={[epwLat, epwLng]}
                radius={9}
                pathOptions={{
                  color: '#ffffff',
                  weight: 2,
                  fillColor: '#ea580c',
                  fillOpacity: 1,
                }}
              />
              {stations.map(st => {
                const isSel =
                  selected?.stationId === st.stationId &&
                  selected?.network === st.network &&
                  selected?.kind === st.kind;
                return (
                  <CircleMarker
                    key={`${st.kind}-${st.stationId}`}
                    center={[st.lat, st.lng]}
                    radius={isSel ? 8 : 5}
                    pathOptions={{
                      color: isSel ? '#111827' : '#ffffff',
                      weight: isSel ? 2.5 : 1,
                      fillColor: stationMarkerColor(st.kind),
                      fillOpacity: markerFillOpacity(st),
                    }}
                    eventHandlers={{
                      click: () => {
                        setSelected(windMapStationToSelection(st));
                        setUserPickedStation(true);
                      },
                    }}
                  />
                );
              })}
            </MapContainer>
          )}
        </div>

        <div className={`shrink-0 space-y-2 border-t px-4 py-3 sm:px-5 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
          {rwisNote ? (
            <p className={`text-[10px] ${theme === 'dark' ? 'text-amber-300/90' : 'text-amber-800'}`}>{rwisNote}</p>
          ) : null}
          {selectedStation ? (
            <div className={`rounded-lg px-3 py-2 text-xs ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
              <p className="font-semibold">
                {stationKindLabel(selectedStation.kind)} · {selectedStation.stationId}
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  {' '}
                  · {selectedStation.stationName} · {selectedStation.distanceKm.toFixed(1)} km
                </span>
              </p>
              <p className={`mt-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {windExpectationLabel(selectedStation.windExpectation, selectedStation.kind)}
                {selectedStation.archiveBegin ? ` · archive from ${selectedStation.archiveBegin.slice(0, 10)}` : ''}
              </p>
            </div>
          ) : needsStatePicker ? (
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
              Pick a state above, then click a station on the map.
            </p>
          ) : (
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Select a station on the map.</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => {
                if (selected) onApply(selected);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                canContinue
                  ? 'cursor-pointer bg-gray-900 text-white shadow-hard-sm hover:bg-gray-800'
                  : `cursor-not-allowed ${
                      theme === 'dark'
                        ? 'bg-gray-700 text-gray-500'
                        : 'bg-gray-200 text-gray-400'
                    }`
              }`}
            >
              Next…
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
