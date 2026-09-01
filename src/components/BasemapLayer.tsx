import { useEffect } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';

/** Carto Positron clone hosted by OpenFreeMap — no API key or registration. */
export const OPENFREEMAP_POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';

const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap</a>';

/** Esri World Imagery — public raster tiles, no API key. */
const ESRI_SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_SATELLITE_LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ESRI_SATELLITE_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> — Esri, Maxar, Earthstar Geographics, and the GIS User Community';

const STORAGE_KEY = 'climate-compare-basemap-style';

export type BasemapStyle = 'map' | 'satellite';

export function readBasemapStyle(): BasemapStyle {
  if (typeof window === 'undefined') return 'map';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'satellite' ? 'satellite' : 'map';
  } catch {
    return 'map';
  }
}

export function writeBasemapStyle(style: BasemapStyle) {
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    /* ignore quota / private mode */
  }
}

function PositronGlLayer() {
  const map = useMap();

  useEffect(() => {
    const layer = maplibreGL({
      style: OPENFREEMAP_POSITRON_STYLE,
      attributionControl: { customAttribution: OPENFREEMAP_ATTRIBUTION },
    });
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);

  return null;
}

/**
 * Light grayscale Positron (default) or Esri satellite. Carto raster tiles now
 * overlay “API KEY REQUIRED”; OpenFreeMap serves the same open Positron style.
 */
export function BasemapLayer({ style }: { style: BasemapStyle }) {
  if (style === 'satellite') {
    return (
      <>
        <TileLayer attribution={ESRI_SATELLITE_ATTRIBUTION} url={ESRI_SATELLITE_URL} maxZoom={19} />
        <TileLayer attribution="" url={ESRI_SATELLITE_LABELS_URL} maxZoom={19} />
      </>
    );
  }
  return <PositronGlLayer />;
}

export function BasemapStyleToggle({
  value,
  onChange,
}: {
  value: BasemapStyle;
  onChange: (style: BasemapStyle) => void;
}) {
  const btn = (style: BasemapStyle, label: string) => {
    const selected = value === style;
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(style)}
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3 sm:text-xs ${
          selected
            ? 'bg-gray-900 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-3 z-[1000] flex rounded-full border border-gray-200 bg-white/95 p-0.5 shadow-hard-md"
      role="group"
      aria-label="Map style"
    >
      {btn('map', 'Map')}
      {btn('satellite', 'Satellite')}
    </div>
  );
}
