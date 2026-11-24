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

function enhanceStateAndCountryBorders(glMap: any) {
  try {
    const style = glMap.getStyle?.();
    if (!style || !Array.isArray(style.layers)) return;

    let enhancedState = false;
    for (const layer of style.layers) {
      if (layer.type !== 'line') continue;
      const id = String(layer.id || '');
      const srcLayer = String(layer['source-layer'] || '');

      if (id === 'boundary_state' || (srcLayer === 'boundary' && /state|province|admin[_-]?4/i.test(id))) {
        enhancedState = true;
        glMap.setLayoutProperty(id, 'visibility', 'visible');
        glMap.setLayerZoomRange(id, 2, 24);
        glMap.setPaintProperty(id, 'line-color', '#94a3b8');
        glMap.setPaintProperty(id, 'line-opacity', 0.85);
        glMap.setPaintProperty(id, 'line-width', [
          'interpolate',
          ['linear'],
          ['zoom'],
          2,
          0.7,
          5,
          1.1,
          8,
          1.5,
        ]);
      } else if (id.startsWith('boundary_country') || (srcLayer === 'boundary' && /country|admin[_-]?2/i.test(id))) {
        glMap.setPaintProperty(id, 'line-color', '#7c8796');
        glMap.setPaintProperty(id, 'line-opacity', 0.9);
      }
    }

    // Defensive fallback if the remote Positron style ever omits a dedicated `boundary_state` layer.
    if (!enhancedState && style.sources && !glMap.getLayer('custom-boundary-state')) {
      const sourceName =
        'openmaptiles' in style.sources
          ? 'openmaptiles'
          : Object.keys(style.sources).find(k => style.sources[k]?.type === 'vector');
      if (sourceName) {
        const beforeLabel = style.layers.find((l: any) => l.type === 'symbol')?.id;
        glMap.addLayer(
          {
            id: 'custom-boundary-state',
            type: 'line',
            source: sourceName,
            'source-layer': 'boundary',
            minzoom: 2,
            filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
            paint: {
              'line-color': '#94a3b8',
              'line-opacity': 0.85,
              'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.7, 5, 1.1, 8, 1.5],
            },
          },
          beforeLabel
        );
      }
    }
  } catch {
    // Ignore transient style errors while MapLibre is still loading
  }
}

function PositronGlLayer() {
  const map = useMap();

  useEffect(() => {
    const layer = maplibreGL({
      style: OPENFREEMAP_POSITRON_STYLE,
      attributionControl: { customAttribution: OPENFREEMAP_ATTRIBUTION },
      // Zero throttle & generous pre-rendered padding eliminate panning lag and blank edges.
      updateInterval: 0,
      padding: 0.35,
      interactive: false,
      fadeDuration: 0,
    } as any);
    map.addLayer(layer);

    const glMap = (layer as any).getMaplibreMap?.();
    if (glMap) {
      const onStyleReady = () => enhanceStateAndCountryBorders(glMap);
      if (glMap.isStyleLoaded?.()) onStyleReady();
      glMap.on('load', onStyleReady);
      glMap.on('styledata', onStyleReady);
      return () => {
        glMap.off('load', onStyleReady);
        glMap.off('styledata', onStyleReady);
        map.removeLayer(layer);
      };
    }

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
        <TileLayer
          attribution={ESRI_SATELLITE_ATTRIBUTION}
          url={ESRI_SATELLITE_URL}
          maxZoom={19}
          keepBuffer={4}
          updateWhenIdle={false}
        />
        <TileLayer
          attribution=""
          url={ESRI_SATELLITE_LABELS_URL}
          maxZoom={19}
          keepBuffer={4}
          updateWhenIdle={false}
        />
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
        className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold leading-none transition-colors ${
          selected
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="inline-flex h-6 shrink-0 items-stretch rounded-full border border-gray-200 bg-white p-0.5"
      role="group"
      aria-label="Map style"
    >
      {btn('map', 'Map')}
      {btn('satellite', 'Satellite')}
    </div>
  );
}
