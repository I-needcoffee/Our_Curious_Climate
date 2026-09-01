import { useState, useRef, ChangeEvent, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, Marker, Popup, useMap, useMapEvents, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Upload, ExternalLink, Database, CloudLightning, Loader2 } from 'lucide-react';
import L from 'leaflet';
import { parseEPW, ParsedEPW, attachParsedEpwSource } from '../lib/epwParser';
import { CARTO_LIGHT_ALL_WATER_HEX } from '../lib/constants';
import { BasemapLayer, BasemapStyleToggle, readBasemapStyle, writeBasemapStyle, type BasemapStyle } from './BasemapLayer';
import {
  CANADA_NRC_FUTURE_TMY_KML_URL,
  CANADA_NRC_FUTURE_KML_SOURCE_ID,
  compareNrcFutureDatasetZips,
} from '../lib/futureNrcKmlCatalog';
import { loadCachedCanadaNrcFuturePins, saveCachedCanadaNrcFuturePins } from '../lib/futureNrcKmlCache';
import { dedupeNrcFutureKmlPins } from '../lib/dedupeNrcFutureKmlPins';
import type { FtmyUsCountyIndexRow } from '../lib/ftmyUsZenodo';
import { ftmyStateZipZenodoPage, FTMY_ZENODO_CITY_RECORD } from '../lib/ftmyUsZenodo';
import { loadCachedOneBuildingKmlPins, saveCachedOneBuildingKmlPins } from '../lib/oneBuildingKmlCache';
import JSZip from 'jszip';
import { get, set } from 'idb-keyval';
import {
  ONE_BUILDING_TMYX_KML_SOURCES,
  compareDatasetZipsForDisplay,
  dedupeOneBuildingKmlPins,
  labelDatasetZip,
  parseOneBuildingKmlDocument,
  type OneBuildingDatasetZip,
  type OneBuildingKmlPin,
} from '../lib/oneBuildingKmlCatalog';

// Fix Leaflet icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const smallIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [12, 20],
  iconAnchor: [6, 20],
  popupAnchor: [1, -16],
  shadowSize: [20, 20]
});

const futureIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [12, 20],
  iconAnchor: [6, 20],
  popupAnchor: [1, -16],
  shadowSize: [20, 20]
});

/** Below this zoom we skip fetching/rendering the full TMYx KML layer (large downloads + many markers). */
const MIN_ZOOM_OB_KML = 5;
const MAX_OB_KML_MARKERS_VISIBLE = 400;
/** Canada NRC future TMY pins (Climate One Building KML). */
const MIN_ZOOM_FUTURE_NRC = 5;
/** US fTMY county centroids (Zenodo state archives). */
const MIN_ZOOM_FTMY_COUNTIES = 6;
const MAX_FUTURE_LAYER_MARKERS = 400;

type FutureMapRegion = 'canada' | 'usa';

interface EPWLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  url?: string;
  epwData?: string; // For future weather files loaded from ZIP
  isFuture?: boolean;
  /** Basename from URL or ZIP entry */
  filename?: string;
}

/** One downloadable EPW at a map pin (e.g. TMY3 vs TMY2 for the same airport). */
interface EPWFileVariant {
  id: string;
  url?: string;
  epwData?: string;
  filename: string;
  /** Short label for buttons: TMY3, TMY2, TMYX2011, … */
  label: string;
  /** Relative to OneBuilding USA index (state folder + zip name). Loaded via zip extract. */
  oneBuildingZipPath?: string;
}

/** Stations merged when multiple catalog rows describe the same site (WMO/WBAN id or same coordinates). */
interface EPWMapGroup {
  id: string;
  lat: number;
  lng: number;
  /** Human-readable place title for the popup header */
  displayName: string;
  variants: EPWFileVariant[];
  isFuture?: boolean;
  /** `USA_OR_….AP.726980` — matches OneBuilding zip naming for extra datasets. */
  catalogStationKey?: string;
}

const ONE_BUILDING_USA_INDEX =
  'https://climate.onebuilding.org/WMO_Region_4_North_and_Central_America/USA_United_States_of_America/index.html';

const ONE_BUILDING_USA_ZIP_PREFIX =
  'https://climate.onebuilding.org/WMO_Region_4_North_and_Central_America/USA_United_States_of_America/';

/** Canadian NRC future-year archives mirrored on Climate One Building (browse by province). */
const ONE_BUILDING_CANADA_FUTURE_ROOT =
  'https://climate.onebuilding.org/WMO_Region_4_North_and_Central_America/CAN_Canada_Future/';
/** U.S. future typical meteorological year (fTMY) EPW pack — separate research project from the Canadian NRC data. */
const US_FUTURE_FTMY_ZENODO = 'https://zenodo.org/records/6939750';

interface OneBuildingZipEntry {
  relPath: string;
  label: string;
  suffix: string;
}

function epwBasenameFromUrl(url?: string): string {
  if (!url) return '';
  const path = url.split('?')[0];
  const seg = path.split('/').pop();
  return seg || '';
}

const FILE_TYPE_SUFFIX_RE =
  /_(TMYX\d{4}|TMYX|TMYx\.\d{4}-\d{4}|TMYx|TMY3|TMY2|TMY|IWEC|WYEC2|WYEC|TRY|US\.Normals\.\d{4}-\d{4})$/i;

/** Extracts TMY3 / TMY2 / TMYX2011 / … from an EnergyPlus-style basename. */
function fileTypeLabelFromBasename(basename: string): string {
  const base = basename.replace(/\.epw$/i, '');
  const nrc = base.match(/_NRCv\d+_TMY_(GW[\d.]+)$/i);
  if (nrc?.[1]) return `NRC ${nrc[1]}`;
  const m = base.match(FILE_TYPE_SUFFIX_RE);
  if (m) {
    const s = m[1];
    if (/^TMYx\.\d{4}-\d{4}$/i.test(s)) return `TMYx ${s.slice(5)}`;
    if (/^US\.Normals\./i.test(s)) return s.replace(/^US\.Normals\./i, 'Normals ');
    return s.toUpperCase();
  }
  const tail = base.split('_').pop();
  if (tail && tail.length <= 14 && !/^\d{6}$/.test(tail)) return tail.toUpperCase();
  return 'EPW';
}

function roundCoord(n: number, places = 6): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Prefer "City, ST" from USA_XX_City… or CAN_XX_… basename; else shorten title. */
function displayNameFromGroup(arr: EPWLocation[]): string {
  const first = arr[0];
  const basename = first.filename || epwBasenameFromUrl(first.url) || '';
  if (basename) {
    let s = basename.replace(/\.epw$/i, '');
    s = s.replace(FILE_TYPE_SUFFIX_RE, '');
    const us = s.match(/^USA_([A-Z]{2})_(.+)$/i);
    if (us) {
      const city = us[2]
        .replace(/\./g, ' ')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `${city}, ${us[1].toUpperCase()}`;
    }
    const ca = s.match(/^CAN_([A-Z]{2})_(.+)$/i);
    if (ca) {
      const city = ca[2]
        .replace(/\./g, ' ')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `${city}, ${ca[1].toUpperCase()}`;
    }
  }
  const t = first.name?.trim() || 'Weather station';
  if (t.length > 56) return `${t.slice(0, 54)}…`;
  return t;
}

function locationToVariant(loc: EPWLocation): EPWFileVariant {
  const filename = loc.filename || epwBasenameFromUrl(loc.url) || 'unknown.epw';
  return {
    id: loc.id,
    url: loc.url,
    epwData: loc.epwData,
    filename,
    label: fileTypeLabelFromBasename(filename),
  };
}

/** Station id line in `USA_ST_City…AP.726980` form — matches OneBuilding zip basenames. */
function catalogStationKeyFromBasename(basename: string): string | null {
  const b = basename.replace(/\.(epw|zip)$/i, '');
  if (!/^USA_/i.test(b)) return null;
  const m = b.match(/^(.+\.\d{6})_/);
  return m?.[1] ?? null;
}

function humanizeObSuffix(suffix: string): string {
  if (suffix === 'TMY3') return 'TMY3';
  if (suffix === 'TMY2') return 'TMY2';
  if (suffix === 'TMY') return 'TMY';
  if (suffix === 'TMYx') return 'TMYx (full)';
  if (suffix.startsWith('TMYx.')) return `TMYx ${suffix.slice(5)}`;
  if (suffix.startsWith('US.Normals.')) return suffix.replace(/^US\.Normals\./, 'Normals ');
  return suffix;
}

/** Parses the monolithic OneBuilding USA index HTML for `STATE/USA_….zip` links. */
function parseOneBuildingUsaIndexHtml(html: string): Map<string, OneBuildingZipEntry[]> {
  const map = new Map<string, OneBuildingZipEntry[]>();
  const re = /href="([^"]+\.zip)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const rel = m[1].replace(/&amp;/g, '&');
    const file = rel.split('/').pop() || '';
    if (!file.startsWith('USA_')) continue;
    const base = file.replace(/\.zip$/i, '');
    const sm = base.match(/^(.+\.\d{6})_(.+)$/);
    if (!sm) continue;
    const stationKey = sm[1];
    const suffix = sm[2];
    const label = humanizeObSuffix(suffix);
    const arr = map.get(stationKey) ?? [];
    arr.push({ relPath: rel, label, suffix });
    map.set(stationKey, arr);
  }
  for (const [k, arr] of map) {
    const byPath = new Map(arr.map(x => [x.relPath, x]));
    map.set(
      k,
      [...byPath.values()].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
      )
    );
  }
  return map;
}

function mergeOneBuildingIntoGroup(
  group: EPWMapGroup,
  obMap: Map<string, OneBuildingZipEntry[]> | null
): EPWMapGroup {
  if (group.isFuture || !obMap || !group.catalogStationKey) return group;
  const obList = obMap.get(group.catalogStationKey);
  if (!obList?.length) return group;
  const byLabel = new Map<string, EPWFileVariant>();
  for (const ob of obList) {
    byLabel.set(ob.label, {
      id: `ob-${group.catalogStationKey}-${ob.suffix}`,
      filename: ob.relPath.split('/').pop()!,
      label: ob.label,
      oneBuildingZipPath: ob.relPath,
    });
  }
  for (const v of group.variants) {
    if (!byLabel.has(v.label)) byLabel.set(v.label, v);
  }
  const variants = [...byLabel.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
  );
  return { ...group, variants };
}

/** Lower tier = preferred default when opening a pin (TMY3 → TMY2 → TMY → …). */
function variantDefaultTier(v: EPWFileVariant): number {
  const base = (v.filename || '').replace(/\.(epw|zip)$/i, '');
  const m = base.match(FILE_TYPE_SUFFIX_RE);
  const sufRaw = m?.[1] ?? '';
  const sufU = sufRaw.toUpperCase();
  const lab = v.label.trim().toUpperCase();

  if (sufU === 'TMY3' || lab === 'TMY3') return 0;
  if (sufU === 'TMY2' || lab === 'TMY2') return 1;
  if (
    (sufU === 'TMY' || lab === 'TMY') &&
    !/^TMYX/i.test(sufU) &&
    !lab.startsWith('TMYX')
  )
    return 2;
  if (/^IWEC$/i.test(sufRaw) || lab === 'IWEC') return 3;
  if (/^WYEC2?$/i.test(sufRaw) || /^WYEC/.test(lab)) return 3;
  if (/TMYX|TMYx/i.test(sufRaw) || /TMYx|TMYX/i.test(v.label)) return 4;
  if (/NORMALS|US\.NORMALS/i.test(sufRaw) || /NORMALS/i.test(lab)) return 5;
  if (sufU === 'TRY' || lab === 'TRY') return 6;
  return 7;
}

function pickDefaultVariant(variants: EPWFileVariant[]): EPWFileVariant {
  const first = variants[0];
  if (!first) throw new Error('pickDefaultVariant: empty variants');
  if (variants.length === 1) return first;
  return [...variants].sort((a, b) => {
    const da = variantDefaultTier(a);
    const db = variantDefaultTier(b);
    if (da !== db) return da - db;
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
  })[0]!;
}

function otherVariantsSorted(defaultV: EPWFileVariant, variants: EPWFileVariant[]): EPWFileVariant[] {
  return variants
    .filter(v => v.id !== defaultV.id)
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
    );
}

/**
 * USA-style EPW names embed `…_727930_TMY3` before the extension — same id groups TMY2/TMY3 rows even when
 * GeoJSON coordinates differ slightly between files. Otherwise fall back to rounded lat/lng.
 */
function extractStationIdFromBasename(basename: string): string | null {
  const base = basename.replace(/\.epw$/i, '');
  const m = base.match(
    /[._](\d{6})_(?:TMYX\d{4}|TMYX|TMYx\.\d{4}-\d{4}|TMYx|TMY3|TMY2|TMY|IWEC|WYEC2|WYEC|TRY)$/i
  );
  return m?.[1] ?? null;
}

function groupingKeyForLocation(loc: EPWLocation): string | null {
  const basename = loc.filename || epwBasenameFromUrl(loc.url) || '';
  const sid = basename ? extractStationIdFromBasename(basename) : null;
  if (sid) return `sid:${sid}`;
  if (typeof loc.lat !== 'number' || !Number.isFinite(loc.lat)) return null;
  if (typeof loc.lng !== 'number' || !Number.isFinite(loc.lng)) return null;
  return `ll:${roundCoord(loc.lat)},${roundCoord(loc.lng)}`;
}

/** Merges catalog rows for the same station (id in filename preferred; else coordinates). */
function groupLocationsByCoordinates(locs: EPWLocation[]): EPWMapGroup[] {
  const map = new Map<string, EPWLocation[]>();
  for (const loc of locs) {
    const key = groupingKeyForLocation(loc);
    if (!key) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(loc);
    map.set(key, bucket);
  }

  const groups: EPWMapGroup[] = [];
  for (const [mergeKey, arr] of map) {
    const byUrl = new Map<string, EPWFileVariant>();
    for (const loc of arr) {
      const v = locationToVariant(loc);
      const dedupeKey = v.url || v.epwData || v.id;
      if (!byUrl.has(dedupeKey)) byUrl.set(dedupeKey, v);
    }
    const variants = [...byUrl.values()].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
    );
    if (variants.length === 0) continue;
    const lat = arr[0].lat;
    const lng = arr[0].lng;
    const primaryBasename =
      variants[0]?.filename || epwBasenameFromUrl(arr[0].url || '') || '';
    groups.push({
      id: `grp-${mergeKey.replace(/:/g, '-')}`,
      lat,
      lng,
      displayName: displayNameFromGroup(arr),
      variants,
      isFuture: arr.some(l => l.isFuture),
      catalogStationKey: catalogStationKeyFromBasename(primaryBasename) || undefined,
    });
  }
  return groups;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function nearestGroupsFromPoint(
  groups: EPWMapGroup[],
  lat: number,
  lng: number,
  count: number
): EPWMapGroup[] {
  const valid = groups.filter(
    g =>
      typeof g.lat === 'number' &&
      !isNaN(g.lat) &&
      isFinite(g.lat) &&
      typeof g.lng === 'number' &&
      !isNaN(g.lng) &&
      isFinite(g.lng)
  );
  return [...valid]
    .sort(
      (a, b) =>
        haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng)
    )
    .slice(0, count);
}

function nearestFutureMapPoints(
  lat: number,
  lng: number,
  region: FutureMapRegion,
  nrcPins: OneBuildingKmlPin[],
  counties: FtmyUsCountyIndexRow[],
  count: number
): [number, number][] {
  const ranked: { lat: number; lng: number; d: number }[] = [];
  if (region === 'canada') {
    for (const p of nrcPins) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      ranked.push({ lat: p.lat, lng: p.lng, d: haversineKm(lat, lng, p.lat, p.lng) });
    }
  } else {
    for (const c of counties) {
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
      ranked.push({ lat: c.lat, lng: c.lng, d: haversineKm(lat, lng, c.lat, c.lng) });
    }
  }
  ranked.sort((a, b) => a.d - b.d);
  return ranked.slice(0, count).map(p => [p.lat, p.lng]);
}

interface MapSelectorProps {
  onSelect: (data: ParsedEPW, compareData?: ParsedEPW) => void;
  isSelectingCompare?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Last library the user picked (historical NREL vs future). Used when re-opening the map to add a comparison file. */
  mapLibraryMode?: 'historical' | 'future';
  onMapLibraryModeChange?: (mode: 'historical' | 'future') => void;
  /** Controlled from App + SiteFooter map toggle. */
  showOneBuildingPins?: boolean;
  onShowOneBuildingPinsChange?: (v: boolean) => void;
}

// Component to handle bounding box filtering
function MapBoundsListener({
  groups,
  setVisibleGroups,
}: {
  groups: EPWMapGroup[];
  setVisibleGroups: (g: EPWMapGroup[]) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      updateVisible();
    },
    zoomend: () => {
      updateVisible();
    }
  });

  const updateVisible = () => {
    try {
      const bounds = map.getBounds();
      if (!bounds || !bounds.isValid()) return;
      
      // Add a small buffer to the bounds
      const paddedBounds = bounds.pad(0.1);
      
      const visible = groups.filter(loc => {
        if (typeof loc.lat !== 'number' || isNaN(loc.lat) || !isFinite(loc.lat) ||
            typeof loc.lng !== 'number' || isNaN(loc.lng) || !isFinite(loc.lng)) {
          return false;
        }
        return paddedBounds.contains([loc.lat, loc.lng]);
      });

      // Limit to 500 markers to prevent browser freeze
      setVisibleGroups(visible.slice(0, 500));
    } catch (e) {
      console.warn("Error updating visible locations:", e);
    }
  };

  // Initial update
  useEffect(() => {
    updateVisible();
  }, [groups]);

  return null;
}

// Component to handle flying to user location
function LocationFlyer({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (center && center.length === 2 && 
        typeof center[0] === 'number' && !isNaN(center[0]) && isFinite(center[0]) &&
        typeof center[1] === 'number' && !isNaN(center[1]) && isFinite(center[1])) {
      
      const size = map.getSize();
      if (size.x > 0 && size.y > 0) {
        map.flyTo(center, zoom, { duration: 1.5 });
      } else {
        map.setView(center, zoom);
      }
    }
  }, [center, zoom, map]);
  return null;
}

/** Fits the map so all given points (search pin + nearest stations) stay in view. */
function FitBoundsController({
  points,
  trigger,
}: {
  points: [number, number][] | null;
  trigger: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!trigger || !points || points.length === 0) return;
    try {
      const b = L.latLngBounds(points);
      if (b.isValid()) {
        map.fitBounds(b, { padding: [88, 88], maxZoom: 11, animate: true });
      }
    } catch (e) {
      console.warn('fitBounds failed', e);
    }
  }, [trigger, points, map]);
  return null;
}

/** Keeps React state in sync with the Leaflet map zoom (for KML fetch gating). */
function MapZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
    moveend: () => onZoom(map.getZoom()),
  });
  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);
  return null;
}

function ObKmlBoundsListener({
  pins,
  enabled,
  minZoom,
  setVisiblePins,
}: {
  pins: OneBuildingKmlPin[];
  enabled: boolean;
  minZoom: number;
  setVisiblePins: (p: OneBuildingKmlPin[]) => void;
}) {
  const map = useMapEvents({
    moveend: () => updateVisible(),
    zoomend: () => updateVisible(),
  });

  const updateVisible = () => {
    if (!enabled) {
      setVisiblePins([]);
      return;
    }
    try {
      const z = map.getZoom();
      if (z < minZoom) {
        setVisiblePins([]);
        return;
      }
      const bounds = map.getBounds();
      if (!bounds || !bounds.isValid()) return;
      const paddedBounds = bounds.pad(0.12);
      const visible = pins.filter(p => {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
        return paddedBounds.contains([p.lat, p.lng]);
      });
      setVisiblePins(visible.slice(0, MAX_OB_KML_MARKERS_VISIBLE));
    } catch (e) {
      console.warn('OB KML bounds update failed:', e);
    }
  };

  useEffect(() => {
    updateVisible();
  }, [pins, enabled, minZoom]);

  return null;
}

function FutureLayerBoundsListener<T extends { lat: number; lng: number }>({
  items,
  enabled,
  minZoom,
  setVisible,
}: {
  items: T[];
  enabled: boolean;
  minZoom: number;
  setVisible: (items: T[]) => void;
}) {
  const map = useMapEvents({
    moveend: () => updateVisible(),
    zoomend: () => updateVisible(),
  });

  const updateVisible = () => {
    if (!enabled) {
      setVisible([]);
      return;
    }
    try {
      const z = map.getZoom();
      if (z < minZoom) {
        setVisible([]);
        return;
      }
      const bounds = map.getBounds();
      if (!bounds || !bounds.isValid()) return;
      const paddedBounds = bounds.pad(0.12);
      const visible = items.filter(p => {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
        return paddedBounds.contains([p.lat, p.lng]);
      });
      setVisible(visible.slice(0, MAX_FUTURE_LAYER_MARKERS));
    } catch (e) {
      console.warn('Future layer bounds update failed:', e);
    }
  };

  useEffect(() => {
    updateVisible();
  }, [items, enabled, minZoom]);

  return null;
}

function listEpwPathsInZip(zip: JSZip): { path: string; basename: string }[] {
  const out: { path: string; basename: string }[] = [];
  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    const base = path.split('/').pop() || path;
    if (!base.toLowerCase().endsWith('.epw')) continue;
    out.push({ path, basename: base });
  }
  return out.sort((a, b) =>
    a.basename.localeCompare(b.basename, undefined, { sensitivity: 'base', numeric: true })
  );
}

function ObKmlPinPopupContent({
  pin,
  usaIndexRows,
  usaZipPrefix,
  setLoading,
  setErrorMsg,
  onEpwSelected,
}: {
  pin: OneBuildingKmlPin;
  usaIndexRows: OneBuildingZipEntry[] | null;
  usaZipPrefix: string;
  setLoading: (v: boolean) => void;
  setErrorMsg: (msg: string | null) => void;
  onEpwSelected: (parsed: ParsedEPW) => void;
}) {
  const onEpwSelectedRef = useRef(onEpwSelected);
  onEpwSelectedRef.current = onEpwSelected;

  const [selectedArchiveUrl, setSelectedArchiveUrl] = useState(pin.zipUrl);
  const [epwLoading, setEpwLoading] = useState(false);

  const archiveOptions = useMemo((): OneBuildingDatasetZip[] => {
    const map = new Map<string, string>();
    const fromPin =
      pin.datasetZips && pin.datasetZips.length > 0
        ? pin.datasetZips
        : [{ zipUrl: pin.zipUrl, label: labelDatasetZip(pin.stationKey, pin.zipUrl) }];
    for (const d of fromPin) map.set(d.zipUrl, d.label);
    if (usaIndexRows) {
      for (const ob of usaIndexRows) {
        const url = `${usaZipPrefix}${ob.relPath}`;
        if (!map.has(url)) map.set(url, ob.label);
      }
    }
    const list: OneBuildingDatasetZip[] = [...map.entries()].map(([zipUrl, label]) => ({ zipUrl, label }));
    list.sort(compareDatasetZipsForDisplay);
    return list;
  }, [pin.datasetZips, pin.zipUrl, pin.stationKey, usaIndexRows, usaZipPrefix]);

  const loadSelectedArchive = async () => {
    const url = selectedArchiveUrl;
    if (!url) return;
    setEpwLoading(true);
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/proxy-binary?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('Failed to download archive');
      const buf = await res.arrayBuffer();
      const z = await JSZip.loadAsync(buf);
      const epws = listEpwPathsInZip(z);
      if (epws.length === 0) throw new Error('No EPW file found in this archive.');
      const pick = epws[0]!;
      const entry = z.files[pick.path];
      if (!entry || entry.dir) throw new Error('EPW entry missing in archive.');
      const text = await entry.async('string');
      const parsed = parseEPW(text);
      const label = fileTypeLabelFromBasename(pick.basename);
      attachParsedEpwSource(parsed, pick.basename, label);
      onEpwSelectedRef.current(parsed);
    } catch (e) {
      console.error(e);
      setErrorMsg(e instanceof Error ? e.message : 'Could not load weather from this archive.');
    } finally {
      setEpwLoading(false);
      setLoading(false);
    }
  };

  const btnPrimary =
    'w-full rounded-full bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-hard-sm transition-colors hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="max-w-[min(280px,88vw)] space-y-2 p-2 text-center">
      <h3 className="line-clamp-3 font-semibold leading-snug text-gray-900">{pin.name}</h3>
      <p className="text-[11px] leading-snug text-sky-800">
        OneBuilding TMYx (KML catalog){' '}
        <span className="whitespace-nowrap">· climate.onebuilding.org</span>
      </p>
      <p className="text-left text-[10px] leading-snug text-gray-600">
        TMY3, TMY2, and other dataset names appear when the KML lists another archive for this station, or when a US
        site has extra zips on the merged OneBuilding USA index.
      </p>
      {archiveOptions.length > 1 ? (
        <label className="block text-left text-[10px] font-medium uppercase tracking-wide text-gray-600">
          Weather archive
          <select
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-900"
            value={selectedArchiveUrl}
            onChange={e => setSelectedArchiveUrl(e.target.value)}
            disabled={epwLoading}
          >
            {archiveOptions.map(opt => (
              <option key={opt.zipUrl} value={opt.zipUrl}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : archiveOptions[0] ? (
        <p className="text-left text-[10px] leading-snug text-gray-600">
          Archive: <span className="font-medium text-gray-800">{archiveOptions[0].label}</span>
        </p>
      ) : null}
      <button
        type="button"
        disabled={epwLoading || !selectedArchiveUrl}
        onClick={() => void loadSelectedArchive()}
        className={btnPrimary}
      >
        {epwLoading ? 'Loading weather file…' : 'Load weather file'}
      </button>
    </div>
  );
}

function FutureNrcPinPopupContent({
  pin,
  setLoading,
  setErrorMsg,
  onEpwSelected,
}: {
  pin: OneBuildingKmlPin;
  setLoading: (v: boolean) => void;
  setErrorMsg: (msg: string | null) => void;
  onEpwSelected: (parsed: ParsedEPW) => void;
}) {
  const onEpwSelectedRef = useRef(onEpwSelected);
  onEpwSelectedRef.current = onEpwSelected;

  const [selectedArchiveUrl, setSelectedArchiveUrl] = useState(pin.zipUrl);
  const [epwLoading, setEpwLoading] = useState(false);

  const archiveOptions = useMemo(() => {
    const list =
      pin.datasetZips && pin.datasetZips.length > 0
        ? [...pin.datasetZips]
        : [{ zipUrl: pin.zipUrl, label: pin.zipUrl.split('/').pop()?.replace(/\.zip$/i, '') ?? 'EPW' }];
    list.sort(compareNrcFutureDatasetZips);
    return list;
  }, [pin.datasetZips, pin.zipUrl]);

  const loadSelectedArchive = async () => {
    const url = selectedArchiveUrl;
    if (!url) return;
    setEpwLoading(true);
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/proxy-binary?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('Failed to download archive');
      const buf = await res.arrayBuffer();
      const z = await JSZip.loadAsync(buf);
      const epws = listEpwPathsInZip(z);
      if (epws.length === 0) throw new Error('No EPW file found in this archive.');
      const pick = epws[0]!;
      const entry = z.files[pick.path];
      if (!entry || entry.dir) throw new Error('EPW entry missing in archive.');
      const text = await entry.async('string');
      const parsed = parseEPW(text);
      attachParsedEpwSource(parsed, pick.basename, fileTypeLabelFromBasename(pick.basename));
      onEpwSelectedRef.current(parsed);
    } catch (e) {
      console.error(e);
      setErrorMsg(e instanceof Error ? e.message : 'Could not load future weather from this archive.');
    } finally {
      setEpwLoading(false);
      setLoading(false);
    }
  };

  const btnPrimary =
    'w-full rounded-full bg-orange-600 px-3 py-2 text-xs font-semibold text-white shadow-hard-sm transition-colors hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="max-w-[min(280px,88vw)] space-y-2 p-2 text-center">
      <h3 className="line-clamp-3 font-semibold leading-snug text-gray-900">{pin.name}</h3>
      <p className="text-[11px] leading-snug text-orange-900">
        NRC Canada future TMY <span className="whitespace-nowrap">· Climate One Building</span>
      </p>
      {archiveOptions.length > 1 ? (
        <label className="block text-left text-[10px] font-medium uppercase tracking-wide text-gray-600">
          Global warming level
          <select
            className="mt-1 w-full rounded-xl border border-orange-100 bg-white px-2 py-2 text-xs font-medium text-gray-900"
            value={selectedArchiveUrl}
            onChange={e => setSelectedArchiveUrl(e.target.value)}
            disabled={epwLoading}
          >
            {archiveOptions.map(opt => (
              <option key={opt.zipUrl} value={opt.zipUrl}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : archiveOptions[0] ? (
        <p className="text-left text-[10px] leading-snug text-gray-600">
          Scenario: <span className="font-medium text-gray-800">{archiveOptions[0].label}</span>
        </p>
      ) : null}
      <button
        type="button"
        disabled={epwLoading || !selectedArchiveUrl}
        onClick={() => void loadSelectedArchive()}
        className={btnPrimary}
      >
        {epwLoading ? 'Loading weather file…' : 'Load weather file'}
      </button>
    </div>
  );
}

function FutureUsCountyPopupContent({
  county,
  setErrorMsg,
  onEpwSelected,
}: {
  county: FtmyUsCountyIndexRow;
  setErrorMsg: (msg: string | null) => void;
  onEpwSelected: (parsed: ParsedEPW) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleEpwFile = async (file: File) => {
    setErrorMsg(null);
    try {
      const text = await file.text();
      const parsed = parseEPW(text);
      attachParsedEpwSource(
        parsed,
        file.name,
        fileTypeLabelFromBasename(file.name)
      );
      onEpwSelected(parsed);
    } catch (e) {
      console.error(e);
      setErrorMsg('Could not read that EPW file.');
    }
  };

  const zenodoPage = ftmyStateZipZenodoPage(county.state);

  return (
    <div className="max-w-[min(300px,90vw)] space-y-2 p-2 text-center">
      <h3 className="font-semibold leading-snug text-gray-900">
        {county.name}, {county.state}
      </h3>
      <p className="text-[11px] leading-snug text-violet-900">
        US fTMY (ORNL / Zenodo) · county FIPS {county.fips}
      </p>
      <p className="text-left text-[10px] leading-snug text-gray-600">
        County EPWs are packaged in <strong className="font-medium text-gray-800">{county.state}.zip</strong> on
        Zenodo (hundreds of MB to a few GB per state). After download, extract{' '}
        <span className="break-all font-mono text-[9px] text-gray-700">{county.epwBasename}</span> and upload it
        below.
      </p>
      <a
        href={zenodoPage}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Open {county.state}.zip on Zenodo
      </a>
      <input
        ref={fileRef}
        type="file"
        accept=".epw"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void handleEpwFile(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-full bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-hard-sm transition-colors hover:bg-violet-700"
      >
        Upload county .epw
      </button>
    </div>
  );
}

export function MapSelector({
  onSelect,
  isSelectingCompare,
  initialCenter,
  initialZoom,
  mapLibraryMode = 'historical',
  onMapLibraryModeChange,
  showOneBuildingPins = false,
  onShowOneBuildingPinsChange,
}: MapSelectorProps) {
  const [search, setSearch] = useState('');
  const [basemapStyle, setBasemapStyle] = useState<BasemapStyle>(readBasemapStyle);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locations, setLocations] = useState<EPWLocation[]>([]);
  const [futureLocations, setFutureLocations] = useState<EPWLocation[]>([]);
  const [showFuture, setShowFuture] = useState(false);
  const [visibleGroups, setVisibleGroups] = useState<EPWMapGroup[]>([]);
  /** Parsed OneBuilding USA index — many `.zip` datasets per US station (TMYx windows, normals, …). */
  const [usaObZipByStation, setUsaObZipByStation] = useState<Map<
    string,
    OneBuildingZipEntry[]
  > | null>(null);
  const [loadingDb, setLoadingDb] = useState(true);
  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [fitBoundsPoints, setFitBoundsPoints] = useState<[number, number][] | null>(null);
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);
  const [futureMapRegion, setFutureMapRegion] = useState<FutureMapRegion>('canada');
  const [futureNrcPins, setFutureNrcPins] = useState<OneBuildingKmlPin[]>([]);
  const [visibleFutureNrcPins, setVisibleFutureNrcPins] = useState<OneBuildingKmlPin[]>([]);
  const [futureNrcLoading, setFutureNrcLoading] = useState(false);
  const [futureNrcError, setFutureNrcError] = useState<string | null>(null);
  const futureNrcLoadedRef = useRef(false);
  const [ftmyCounties, setFtmyCounties] = useState<FtmyUsCountyIndexRow[]>([]);
  const [visibleFtmyCounties, setVisibleFtmyCounties] = useState<FtmyUsCountyIndexRow[]>([]);
  const [ftmyCountiesLoading, setFtmyCountiesLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  /** OneBuilding.org published TMYx location KMLs (global coverage); toggled from SiteFooter on map screen. */
  const [liveMapZoom, setLiveMapZoom] = useState(initialZoom || 7);
  const [obKmlPins, setObKmlPins] = useState<OneBuildingKmlPin[]>([]);
  const [visibleObKmlPins, setVisibleObKmlPins] = useState<OneBuildingKmlPin[]>([]);
  const [obKmlLoading, setObKmlLoading] = useState(false);
  const [obKmlLoadProgress, setObKmlLoadProgress] = useState(0);
  const [obKmlError, setObKmlError] = useState<string | null>(null);
  const obKmlLoadedRef = useRef(false);
  const obKmlSessionFetchedRef = useRef(false);
  const obKmlFetchGenRef = useRef(0);
  
  // Default to Seattle region or initialCenter
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    initialCenter && !isNaN(initialCenter[0]) ? initialCenter : [47.6062, -122.3321]
  );
  const [mapZoom, setMapZoom] = useState(initialZoom || 7);

  useEffect(() => {
    setLiveMapZoom(mapZoom);
  }, [mapZoom]);

  // Sync with initialCenter if it changes
  useEffect(() => {
    if (initialCenter && !isNaN(initialCenter[0]) && !isNaN(initialCenter[1])) {
      setMapCenter(initialCenter);
      if (initialZoom) {
        setMapZoom(initialZoom);
        setLiveMapZoom(initialZoom);
      }
    }
  }, [initialCenter, initialZoom]);

  // When re-opening the map to add a comparison, restore Historical vs Future from the last choice.
  useEffect(() => {
    if (isSelectingCompare) {
      setShowFuture(mapLibraryMode === 'future');
    }
  }, [isSelectingCompare, mapLibraryMode]);

  useEffect(() => {
    setSearchPin(null);
    setFitBoundsPoints(null);
  }, [showFuture]);

  // Load cached ZIP on mount
  useEffect(() => {
    const checkCache = async () => {
      try {
        const cachedZip = await get('future_weather_zip');
        if (cachedZip) {
          console.log("Loading cached Future Weather ZIP...");
          processZip(cachedZip);
        }
      } catch (e) {
        console.warn("Failed to load IndexedDB cache:", e);
      }
    };
    checkCache();
  }, []);

  useEffect(() => {
    // Try to get user's actual location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = Number(position.coords.latitude);
          const lng = Number(position.coords.longitude);
          if (typeof lat === 'number' && !isNaN(lat) && isFinite(lat) &&
              typeof lng === 'number' && !isNaN(lng) && isFinite(lng)) {
            setMapCenter([lat, lng]);
            setMapZoom(8);
            setLiveMapZoom(8);
          }
        },
        (error) => {
          console.log("Geolocation error or denied, using default location.", error);
        },
        { timeout: 5000 }
      );
    }

    const fetchLocations = async () => {
      try {
        const response = await fetch('https://raw.githubusercontent.com/NREL/EnergyPlus/develop/weather/master.geojson');
        if (!response.ok) throw new Error('Failed to fetch EPW database');
        
        const geojson = await response.json();
        
        const parsedLocations: EPWLocation[] = geojson.features.map((feature: any, index: number) => {
          // Extract URL from HTML string: <a href=https://...>Download...</a>
          const epwHtml = feature.properties.epw || '';
          const urlMatch = epwHtml.match(/href=([^>]+)>/);
          const url = urlMatch ? urlMatch[1] : '';
          
          const coords = feature.geometry?.coordinates;
          const lat = coords && coords.length >= 2 ? Number(coords[1]) : NaN;
          const lng = coords && coords.length >= 2 ? Number(coords[0]) : NaN;
          
          return {
            id: `epw-${index}`,
            name: feature.properties.title || 'Unknown Location',
            lat,
            lng,
            url: url,
            filename: url ? epwBasenameFromUrl(url) : undefined,
          };
        }).filter((loc: EPWLocation) => {
          return loc.url && 
                 typeof loc.lat === 'number' && !isNaN(loc.lat) && isFinite(loc.lat) &&
                 typeof loc.lng === 'number' && !isNaN(loc.lng) && isFinite(loc.lng);
        });
        
        setLocations(parsedLocations);
      } catch (error) {
        console.error("Error loading EPW database:", error);
        setErrorMsg("Failed to load global weather database.");
      } finally {
        setLoadingDb(false);
      }
    };

    fetchLocations();
  }, []);

  const processZip = async (data: ArrayBuffer | Blob) => {
    setLoading(true);
    setLoadingProgress(0);
    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(data);
      
      const newFutureLocations: EPWLocation[] = [];
      const entries = Object.entries(loadedZip.files).filter(([name, entry]) => !entry.dir && name.endsWith('.epw'));
      const total = entries.length;
      let count = 0;
      
      for (const [filename, zipEntry] of entries) {
        const text = await zipEntry.async("string");
        const lines = text.split(/\r?\n/);
        const locLine = lines.find(l => l.trim().startsWith('LOCATION,'));
        if (locLine) {
          const parts = locLine.split(',');
          if (parts.length >= 8) {
            const city = parts[1];
            const state = parts[2];
            const lat = parseFloat(parts[6]);
            const lng = parseFloat(parts[7]);
            
            if (!isNaN(lat) && !isNaN(lng)) {
              newFutureLocations.push({
                id: `future-${count}`,
                name: `${city}, ${state} (${filename})`,
                lat,
                lng,
                epwData: text,
                isFuture: true,
                filename
              });
            }
          }
        }
        count++;
        if (count % 50 === 0) setLoadingProgress(Math.round((count / total) * 100));
      }
      
      if (newFutureLocations.length > 0) {
        setFutureLocations(newFutureLocations);
        setShowFuture(true);
        onMapLibraryModeChange?.('future');
      }
    } catch (error) {
      console.error(error);
      setErrorMsg("Failed to process ZIP file.");
    } finally {
      setLoading(false);
      setLoadingProgress(0);
    }
  };

  const handleZipUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Save to IndexedDB for next time
      await set('future_weather_zip', arrayBuffer);
      await processZip(arrayBuffer);
      setShowFuture(true);
      onMapLibraryModeChange?.('future');
    } catch (error) {
      console.error(error);
      setErrorMsg("Failed to upload ZIP file.");
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  const activeLocations = useMemo(() => {
    return showFuture ? futureLocations : locations;
  }, [showFuture, futureLocations, locations]);

  const activeGroups = useMemo(
    () => groupLocationsByCoordinates(activeLocations),
    [activeLocations]
  );

  const activeGroupsWithOneBuilding = useMemo(
    () => activeGroups.map(g => mergeOneBuildingIntoGroup(g, usaObZipByStation)),
    [activeGroups, usaObZipByStation]
  );

  const onLiveMapZoom = useCallback((z: number) => {
    setLiveMapZoom(z);
  }, []);

  useEffect(() => {
    if (!showFuture) return;
    onShowOneBuildingPinsChange?.(false);
  }, [showFuture, onShowOneBuildingPinsChange]);

  // Canada NRC future TMY catalog (Climate One Building KML).
  useEffect(() => {
    if (!showFuture) return;
    let cancelled = false;

    void (async () => {
      if (!futureNrcLoadedRef.current) {
        const cached = await loadCachedCanadaNrcFuturePins();
        if (cancelled) return;
        if (cached?.length) {
          futureNrcLoadedRef.current = true;
          setFutureNrcPins(cached);
        }
      }

      setFutureNrcLoading(true);
      setFutureNrcError(null);
      try {
        const res = await fetch(
          `/api/proxy-epw?url=${encodeURIComponent(CANADA_NRC_FUTURE_TMY_KML_URL)}`
        );
        if (!res.ok) throw new Error(`KML HTTP ${res.status}`);
        const xml = await res.text();
        if (cancelled) return;
        const rows = parseOneBuildingKmlDocument(xml, CANADA_NRC_FUTURE_KML_SOURCE_ID);
        const deduped = dedupeNrcFutureKmlPins(rows);
        futureNrcLoadedRef.current = true;
        setFutureNrcPins(deduped);
        void saveCachedCanadaNrcFuturePins(deduped);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setFutureNrcError(
            e instanceof Error ? e.message : 'Failed to load Canada future weather catalog.'
          );
          if (!futureNrcLoadedRef.current) setFutureNrcPins([]);
        }
      } finally {
        if (!cancelled) setFutureNrcLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showFuture]);

  // US fTMY county centroid index (for map + Zenodo state association).
  useEffect(() => {
    if (!showFuture || ftmyCounties.length > 0) return;
    let cancelled = false;
    setFtmyCountiesLoading(true);
    void (async () => {
      try {
        const res = await fetch('/data/ftmy-us-county-index.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as FtmyUsCountyIndexRow[];
        if (!cancelled) setFtmyCounties(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setErrorMsg('Could not load US county index for fTMY.');
        }
      } finally {
        if (!cancelled) setFtmyCountiesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showFuture, ftmyCounties.length]);

  useEffect(() => {
    if (showOneBuildingPins) return;
    obKmlFetchGenRef.current += 1;
    setObKmlLoading(false);
    setVisibleObKmlPins([]);
  }, [showOneBuildingPins]);

  useEffect(() => {
    if (!showOneBuildingPins || showFuture) return;
    if (liveMapZoom < MIN_ZOOM_OB_KML) return;
    if (obKmlSessionFetchedRef.current) return;

    const startGen = obKmlFetchGenRef.current;
    let cancelled = false;

    void (async () => {
      if (!obKmlLoadedRef.current) {
        const cached = await loadCachedOneBuildingKmlPins();
        if (cancelled || obKmlFetchGenRef.current !== startGen) return;
        if (cached?.length) {
          obKmlLoadedRef.current = true;
          setObKmlPins(cached);
        }
      }

      setObKmlLoading(true);
      setObKmlError(null);
      setObKmlLoadProgress(0);
      let completed = 0;

      try {
        const chunks = await Promise.all(
          ONE_BUILDING_TMYX_KML_SOURCES.map(async src => {
            const res = await fetch(`/api/proxy-epw?url=${encodeURIComponent(src.url)}`);
            if (!res.ok) throw new Error(`${src.label}: HTTP ${res.status}`);
            const xml = await res.text();
            const rows = parseOneBuildingKmlDocument(xml, src.id);
            if (!cancelled && obKmlFetchGenRef.current === startGen) {
              completed += 1;
              setObKmlLoadProgress(completed);
            }
            return rows;
          })
        );
        if (cancelled || obKmlFetchGenRef.current !== startGen) return;
        const deduped = dedupeOneBuildingKmlPins(chunks.flat());
        obKmlLoadedRef.current = true;
        obKmlSessionFetchedRef.current = true;
        setObKmlPins(deduped);
        void saveCachedOneBuildingKmlPins(deduped);
      } catch (e) {
        console.error(e);
        if (!cancelled && obKmlFetchGenRef.current === startGen) {
          setObKmlError(e instanceof Error ? e.message : 'Failed to load OneBuilding KML catalogs.');
          if (!obKmlLoadedRef.current) {
            setObKmlPins([]);
          }
        }
      } finally {
        if (!cancelled && obKmlFetchGenRef.current === startGen) {
          setObKmlLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showOneBuildingPins, showFuture, liveMapZoom]);

  useEffect(() => {
    if (showFuture) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/proxy-epw?url=${encodeURIComponent(ONE_BUILDING_USA_INDEX)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        if (cancelled) return;
        setUsaObZipByStation(parseOneBuildingUsaIndexHtml(html));
      } catch (e) {
        console.warn('Could not load Climate.OneBuilding USA file listing:', e);
        if (!cancelled) setUsaObZipByStation(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showFuture]);

  const handleLocationSearch = async () => {
    const q = search.trim();
    if (!q) return;
    setErrorMsg(null);

    const hasFutureCatalog =
      showFuture &&
      ((futureMapRegion === 'canada' && futureNrcPins.length > 0) ||
        (futureMapRegion === 'usa' && ftmyCounties.length > 0));

    if (!showFuture && activeGroupsWithOneBuilding.length === 0) {
      setErrorMsg('Weather stations are still loading — try again in a moment.');
      return;
    }
    if (showFuture && !hasFutureCatalog && activeGroupsWithOneBuilding.length === 0) {
      setErrorMsg('Future weather catalog is still loading — try again in a moment.');
      return;
    }

    setLocating(true);
    try {
      const res = await fetch(`/api/nominatim?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Geocoding service error');
      const data = (await res.json()) as { lat?: string; lon?: string }[];
      if (!Array.isArray(data) || data.length === 0) {
        setErrorMsg('Location not found. Try a city, airport code, address, or landmark.');
        return;
      }
      const lat = parseFloat(String(data[0].lat));
      const lon = parseFloat(String(data[0].lon));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setErrorMsg('Unexpected geocoding response.');
        return;
      }
      const pts: [number, number][] = [[lat, lon]];

      if (showFuture && hasFutureCatalog) {
        for (const p of nearestFutureMapPoints(
          lat,
          lon,
          futureMapRegion,
          futureNrcPins,
          ftmyCounties,
          2
        )) {
          const dup = pts.some(
            q => Math.abs(q[0] - p[0]) < 1e-7 && Math.abs(q[1] - p[1]) < 1e-7
          );
          if (!dup) pts.push(p);
        }
      }

      if (activeGroupsWithOneBuilding.length > 0) {
        for (const s of nearestGroupsFromPoint(activeGroupsWithOneBuilding, lat, lon, 2)) {
          const dup = pts.some(
            p => Math.abs(p[0] - s.lat) < 1e-7 && Math.abs(p[1] - s.lng) < 1e-7
          );
          if (!dup) pts.push([s.lat, s.lng]);
        }
      }

      if (pts.length < 2) {
        setErrorMsg(
          showFuture
            ? 'No future-weather sites found near that place in the current region. Try zooming the map or switching Canada / United States.'
            : 'No stations found near that place in the current dataset.'
        );
        return;
      }
      setSearchPin({ lat, lng: lon });
      setFitBoundsPoints(pts);
      setFitBoundsTrigger(t => t + 1);
    } catch (e) {
      console.error(e);
      setErrorMsg(
        'Could not look up that place. Try again in a moment, or pan the map to pick a station. (Hosted builds need the /api/nominatim proxy — see README.)'
      );
    } finally {
      setLocating(false);
    }
  };

  const handleVariantSelect = async (group: EPWMapGroup, variant: EPWFileVariant) => {
    const loc: EPWLocation = {
      id: variant.id,
      name: group.displayName,
      lat: group.lat,
      lng: group.lng,
      url: variant.url,
      epwData: variant.epwData,
      isFuture: group.isFuture,
      filename: variant.filename,
    };
    setLoading(true);
    setErrorMsg(null);
    try {
      if (loc.epwData) {
        const parsed = parseEPW(loc.epwData);
        attachParsedEpwSource(
          parsed,
          loc.filename || 'weather.epw',
          variant.label
        );

        // If this is a future location and we are NOT selecting a comparison yet,
        // try to find a baseline (e.g. 2020 or historical) in the same dataset to default the comparison
        if (!isSelectingCompare && loc.filename) {
          const baseName = loc.name.split('(')[0].trim();
          const otherYears = futureLocations.filter(
            f => f.id !== loc.id && f.name.startsWith(baseName)
          );

          if (otherYears.length > 0) {
            const baseline =
              otherYears.find(
                f =>
                  f.filename?.includes('2005') ||
                  f.filename?.includes('2020') ||
                  /_TMY_GW0\.5(?=\.epw)/i.test(f.filename || '')
              ) || otherYears[0];
            if (baseline.epwData) {
              const parsedBaseline = parseEPW(baseline.epwData);
              attachParsedEpwSource(
                parsedBaseline,
                baseline.filename || 'baseline.epw',
                fileTypeLabelFromBasename(baseline.filename || '')
              );
              onMapLibraryModeChange?.(showFuture ? 'future' : 'historical');
              onSelect(parsed, parsedBaseline);
              return;
            }
          }
        }

        onMapLibraryModeChange?.(showFuture ? 'future' : 'historical');
        onSelect(parsed);
      } else if (variant.oneBuildingZipPath) {
        const fullUrl = `${ONE_BUILDING_USA_ZIP_PREFIX}${variant.oneBuildingZipPath}`;
        const response = await fetch(`/api/proxy-binary?url=${encodeURIComponent(fullUrl)}`);
        if (!response.ok) throw new Error('Failed to download weather archive');
        const buf = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const epwEntry = Object.entries(zip.files).find(
          ([name, f]) => !f.dir && name.toLowerCase().endsWith('.epw')
        );
        if (!epwEntry) throw new Error('No EPW file found in zip archive');
        const text = await epwEntry[1].async('string');
        const parsed = parseEPW(text);
        const innerBase = epwEntry[0].split('/').pop() || variant.filename;
        attachParsedEpwSource(parsed, innerBase, variant.label);
        onMapLibraryModeChange?.(showFuture ? 'future' : 'historical');
        onSelect(parsed);
      } else if (loc.url) {
        const response = await fetch(`/api/proxy-epw?url=${encodeURIComponent(loc.url)}`);
        if (!response.ok) throw new Error('Failed to fetch EPW file');
        const text = await response.text();
        const parsed = parseEPW(text);
        attachParsedEpwSource(parsed, variant.filename || epwBasenameFromUrl(loc.url), variant.label);
        onMapLibraryModeChange?.(showFuture ? 'future' : 'historical');
        onSelect(parsed);
      }
    } catch (error) {
      console.error(error);
      setErrorMsg('Failed to load weather file. The file might be unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseEPW(text);
        const label = fileTypeLabelFromBasename(file.name);
        attachParsedEpwSource(parsed, file.name, label);

        // In Future mode, keep the uploaded file on the map so the user can pick another file nearby.
        if (showFuture) {
          onMapLibraryModeChange?.('future');
          setShowFuture(true);
          setFutureLocations(prev => [
            ...prev,
            {
              id: `future-upload-${Date.now()}`,
              name: `${file.name}`,
              lat: parsed.metadata.lat,
              lng: parsed.metadata.lng,
              epwData: text,
              isFuture: true,
              filename: file.name,
            },
          ]);
        } else {
          onMapLibraryModeChange?.('historical');
        }
        onSelect(parsed);
      } catch (error) {
        console.error(error);
        setErrorMsg("Failed to parse EPW file. Ensure it is a valid format.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="h-full w-full relative"
      style={{ backgroundColor: basemapStyle === 'satellite' ? '#1c1917' : CARTO_LIGHT_ALL_WATER_HEX }}
    >
      {loading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-700 font-medium">
              Processing ZIP Archive... {loadingProgress > 0 ? `${loadingProgress}%` : ''}
            </p>
          </div>
        </div>
      )}
      
      {errorMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[2000] bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl shadow-md flex items-center gap-3">
          <span className="block sm:inline">{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold leading-none text-red-700 transition-colors hover:bg-red-200/60 hover:text-red-900"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {showOneBuildingPins && !showFuture && liveMapZoom < MIN_ZOOM_OB_KML && !obKmlLoading ? (
        <div className="pointer-events-none absolute top-[5.25rem] left-1/2 z-[1500] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-2.5 text-center text-xs font-medium text-amber-950 shadow-hard-md sm:top-[6rem] sm:text-sm">
          please zoom in to see OneBuilding map locations.
        </div>
      ) : null}

      {obKmlError ? (
        <div className="absolute top-[5.25rem] left-1/2 z-[1500] flex w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-hard-md sm:top-[6rem]">
          <span className="min-w-0 flex-1 leading-snug">
            <span className="font-semibold">TMYx KML:</span> {obKmlError}
          </span>
          <button
            type="button"
            onClick={() => setObKmlError(null)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold leading-none text-amber-900 transition-colors hover:bg-amber-200/70"
            aria-label="Dismiss KML error"
          >
            &times;
          </button>
        </div>
      ) : null}

      {obKmlLoading ? (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-[1500] flex -translate-x-1/2 items-center gap-2 rounded-full border border-sky-200 bg-white/95 px-4 py-2 text-xs font-medium text-sky-950 shadow-hard-md sm:text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" aria-hidden />
          <span>
            Loading OneBuilding TMYx KML…{' '}
            <span className="tabular-nums font-semibold">
              {obKmlLoadProgress}/{ONE_BUILDING_TMYX_KML_SOURCES.length}
            </span>
          </span>
        </div>
      ) : null}

      {showFuture && futureNrcLoading ? (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-[1500] flex -translate-x-1/2 items-center gap-2 rounded-full border border-orange-200 bg-white/95 px-4 py-2 text-xs font-medium text-orange-950 shadow-hard-md sm:text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-600" aria-hidden />
          <span>Loading Canada NRC future weather catalog…</span>
        </div>
      ) : null}

      {futureNrcError ? (
        <div className="absolute top-[5.25rem] left-1/2 z-[1500] flex w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950 shadow-hard-md sm:top-[6rem]">
          <span className="min-w-0 flex-1 leading-snug">
            <span className="font-semibold">Canada future KML:</span> {futureNrcError}
          </span>
          <button
            type="button"
            onClick={() => setFutureNrcError(null)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold leading-none text-orange-900 transition-colors hover:bg-orange-200/70"
            aria-label="Dismiss catalog error"
          >
            &times;
          </button>
        </div>
      ) : null}

      {showFuture &&
      futureMapRegion === 'canada' &&
      liveMapZoom < MIN_ZOOM_FUTURE_NRC &&
      !futureNrcLoading &&
      futureNrcPins.length > 0 ? (
        <div className="pointer-events-none absolute top-[5.25rem] left-1/2 z-[1500] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-orange-200 bg-orange-50/95 px-4 py-2.5 text-center text-xs font-medium text-orange-950 shadow-hard-md sm:top-[6rem] sm:text-sm">
          Zoom in to see Canadian NRC future weather stations.
        </div>
      ) : null}

      {showFuture &&
      futureMapRegion === 'usa' &&
      liveMapZoom < MIN_ZOOM_FTMY_COUNTIES &&
      !ftmyCountiesLoading &&
      ftmyCounties.length > 0 ? (
        <div className="pointer-events-none absolute top-[5.25rem] left-1/2 z-[1500] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-violet-200 bg-violet-50/95 px-4 py-2.5 text-center text-xs font-medium text-violet-950 shadow-hard-md sm:top-[6rem] sm:text-sm">
          Zoom in to see US county locations (fTMY on Zenodo).
        </div>
      ) : null}

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-3xl px-4 flex flex-col sm:flex-row gap-2 items-center pointer-events-none">
        <div className="relative flex-1 w-full pointer-events-auto bg-white p-2 rounded-full shadow-hard-md border border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex min-w-0 flex-1 flex-row items-center">
            {locating ? (
              <Loader2
                className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 animate-spin text-gray-500"
                aria-hidden
              />
            ) : (
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
            )}
            <input
              type="text"
              placeholder="City, airport, or landmark"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleLocationSearch();
                }
              }}
              aria-describedby="map-search-hint"
              disabled={locating || loadingDb}
              className="min-w-0 flex-1 border-none bg-transparent py-2 pl-9 pr-4 text-sm text-gray-700 outline-none transition-all focus:ring-0 disabled:opacity-60"
            />
          </div>
          <p id="map-search-hint" className="sr-only">
            Enter a city, airport, landmark, or address, then press Enter. The map zooms to that location and frames the two closest weather stations.
          </p>
          <button
            type="button"
            aria-pressed={showFuture}
            aria-label={
              showFuture ? 'Return to the historic typical-year station map' : 'Open future weather data options'
            }
            title={
              showFuture
                ? 'Return to the historic typical-year (TMY) station map'
                : 'Future weather: samples, country links, or ZIP'
            }
            onClick={() => {
              if (showFuture) {
                setShowFuture(false);
                onMapLibraryModeChange?.('historical');
              } else {
                setShowFuture(true);
                onMapLibraryModeChange?.('future');
              }
            }}
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-center rounded-full border px-3 text-xs font-semibold shadow-hard-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 sm:h-10 sm:px-4 sm:text-sm ${
              showFuture
                ? 'border-orange-200 bg-white text-orange-800 ring-1 ring-orange-200/80 focus-visible:ring-orange-400'
                : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 focus-visible:ring-gray-400'
            }`}
          >
            {showFuture ? (
              <>
                <Database className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 text-center text-[10px] font-semibold leading-tight sm:text-sm">
                  Return to Historic Map
                </span>
              </>
            ) : (
              <>
                <CloudLightning className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
                <span className="max-w-[10rem] truncate sm:max-w-none">Future weather</span>
              </>
            )}
          </button>
        </div>
        
        <div className="flex items-center gap-2 pointer-events-auto">

          <input 
            type="file" 
            accept=".epw" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            id="map-upload-epw"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center w-12 h-12 bg-white text-gray-700 rounded-full shadow-hard-md hover:bg-gray-50 transition-colors border border-gray-200"
            title="Upload .epw — load more weather files"
          >
            <Upload className="w-5 h-5" />
          </button>
        </div>
      </div>

      <BasemapStyleToggle
        value={basemapStyle}
        onChange={style => {
          setBasemapStyle(style);
          writeBasemapStyle(style);
        }}
      />

      {showFuture ? (
        <div className="pointer-events-auto absolute top-20 left-1/2 z-[1000] max-h-[calc(100dvh-5.5rem)] w-[min(100%,20rem)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-3.5 shadow-hard-lg sm:top-24 sm:max-h-[calc(100dvh-6.5rem)] sm:w-full sm:max-w-md">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <CloudLightning className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
            Future weather
          </h3>

          <div className="mb-3 flex rounded-full border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setFutureMapRegion('canada')}
              className={`flex-1 rounded-full px-2 py-1.5 transition-colors ${
                futureMapRegion === 'canada'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Canada
            </button>
            <button
              type="button"
              onClick={() => setFutureMapRegion('usa')}
              className={`flex-1 rounded-full px-2 py-1.5 transition-colors ${
                futureMapRegion === 'usa'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              United States
            </button>
          </div>

          {futureMapRegion === 'canada' ? (
            <div className="mb-3 space-y-2 text-xs leading-snug text-gray-600">
              <p>
                <strong className="font-semibold text-gray-800">564 NRC stations</strong> load from Climate One
                Building. Zoom in, tap a pin, pick a warming level (GW0.5–GW3.5), and load the EPW.
              </p>
              {futureNrcPins.length > 0 ? (
                <p className="text-[11px] text-orange-800">
                  Catalog ready — {Math.round(futureNrcPins.length)} stations on the map.
                </p>
              ) : null}
              <a
                href={ONE_BUILDING_CANADA_FUTURE_ROOT}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-200"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Full library on Climate One Building
              </a>
            </div>
          ) : (
            <div className="mb-3 space-y-2 text-xs leading-snug text-gray-600">
              <p>
                There is <strong className="font-semibold text-gray-800">no public KML</strong> for US fTMY. Zoom in to
                county dots, open a county, download that state&apos;s archive on Zenodo, then upload the county{' '}
                <span className="font-mono text-[10px]">.epw</span>.
              </p>
              {ftmyCounties.length > 0 ? (
                <p className="text-[11px] text-violet-800">
                  {ftmyCounties.length.toLocaleString()} counties indexed.
                </p>
              ) : null}
              <a
                href={`https://zenodo.org/records/${FTMY_ZENODO_CITY_RECORD}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Zenodo — 18 climate-zone cities (smaller pack)
              </a>
              <a
                href={US_FUTURE_FTMY_ZENODO}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-200"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Zenodo — all US counties (by state)
              </a>
            </div>
          )}

          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-800">Advanced: bulk ZIP upload</summary>
            <p className="mt-2 leading-snug">
              If you already downloaded provincial or state archives, upload a ZIP of EPW files here.
            </p>
            <input type="file" accept=".zip" className="hidden" ref={zipInputRef} onChange={handleZipUpload} />
            <button
              type="button"
              onClick={() => zipInputRef.current?.click()}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-200"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Upload ZIP
            </button>
          </details>
        </div>
      ) : null}
      
      <div className="h-full w-full z-0">
        {typeof mapCenter[0] === 'number' && !isNaN(mapCenter[0]) && isFinite(mapCenter[0]) &&
         typeof mapCenter[1] === 'number' && !isNaN(mapCenter[1]) && isFinite(mapCenter[1]) ? (
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            className="h-full w-full"
            minZoom={2}
            zoomControl={false}
            style={{ background: basemapStyle === 'satellite' ? '#1c1917' : CARTO_LIGHT_ALL_WATER_HEX }}
          >
            <LocationFlyer center={mapCenter} zoom={mapZoom} />
            <FitBoundsController points={fitBoundsPoints} trigger={fitBoundsTrigger} />
            <BasemapLayer style={basemapStyle} />
            <MapZoomTracker onZoom={onLiveMapZoom} />
            <MapBoundsListener groups={activeGroupsWithOneBuilding} setVisibleGroups={setVisibleGroups} />
            <ObKmlBoundsListener
              pins={obKmlPins}
              enabled={showOneBuildingPins && !showFuture}
              minZoom={MIN_ZOOM_OB_KML}
              setVisiblePins={setVisibleObKmlPins}
            />
            <FutureLayerBoundsListener
              items={futureNrcPins}
              enabled={showFuture && futureMapRegion === 'canada'}
              minZoom={MIN_ZOOM_FUTURE_NRC}
              setVisible={setVisibleFutureNrcPins}
            />
            <FutureLayerBoundsListener
              items={ftmyCounties}
              enabled={showFuture && futureMapRegion === 'usa'}
              minZoom={MIN_ZOOM_FTMY_COUNTIES}
              setVisible={setVisibleFtmyCounties}
            />

            {searchPin &&
              Number.isFinite(searchPin.lat) &&
              Number.isFinite(searchPin.lng) && (
                <CircleMarker
                  center={[searchPin.lat, searchPin.lng]}
                  radius={11}
                  pathOptions={{
                    color: '#1d4ed8',
                    fillColor: '#93c5fd',
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                />
              )}

            {visibleObKmlPins.map(pin => (
              <CircleMarker
                key={pin.id}
                center={[pin.lat, pin.lng]}
                radius={6}
                pathOptions={{
                  color: '#0369a1',
                  fillColor: '#bae6fd',
                  fillOpacity: 0.92,
                  weight: 1.5,
                }}
              >
                <Popup className="rounded-2xl">
                  <ObKmlPinPopupContent
                    key={pin.id}
                    pin={pin}
                    usaIndexRows={usaObZipByStation?.get(pin.stationKey) ?? null}
                    usaZipPrefix={ONE_BUILDING_USA_ZIP_PREFIX}
                    setLoading={setLoading}
                    setErrorMsg={setErrorMsg}
                    onEpwSelected={parsed => {
                      onMapLibraryModeChange?.('historical');
                      onSelect(parsed);
                    }}
                  />
                </Popup>
              </CircleMarker>
            ))}

            {visibleFutureNrcPins.map(pin => (
              <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={futureIcon}>
                <Popup className="rounded-2xl">
                  <FutureNrcPinPopupContent
                    pin={pin}
                    setLoading={setLoading}
                    setErrorMsg={setErrorMsg}
                    onEpwSelected={parsed => {
                      onMapLibraryModeChange?.('future');
                      onSelect(parsed);
                    }}
                  />
                </Popup>
              </Marker>
            ))}

            {visibleFtmyCounties.map(county => (
              <CircleMarker
                key={county.fips}
                center={[county.lat, county.lng]}
                radius={5}
                pathOptions={{
                  color: '#6d28d9',
                  fillColor: '#ddd6fe',
                  fillOpacity: 0.9,
                  weight: 1.25,
                }}
              >
                <Popup className="rounded-2xl">
                  <FutureUsCountyPopupContent
                    county={county}
                    setErrorMsg={setErrorMsg}
                    onEpwSelected={parsed => {
                      onMapLibraryModeChange?.('future');
                      onSelect(parsed);
                    }}
                  />
                </Popup>
              </CircleMarker>
            ))}

            {visibleGroups.map(group => {
              if (typeof group.lat !== 'number' || isNaN(group.lat) || !isFinite(group.lat) ||
                  typeof group.lng !== 'number' || isNaN(group.lng) || !isFinite(group.lng)) {
                return null;
              }
              const defaultVariant = pickDefaultVariant(group.variants);
              const alternateVariants = otherVariantsSorted(defaultVariant, group.variants);
              const hasAlternates = alternateVariants.length > 0;
              const btnBase =
                'rounded-full text-xs font-semibold transition-colors shadow-hard-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
              const btnHistorical = `${btnBase} bg-[#3388ff] text-white hover:bg-[#2d7de0] focus-visible:ring-[#3388ff]`;
              const btnFuture = `${btnBase} bg-orange-600 text-white hover:bg-orange-700 focus-visible:ring-orange-400`;
              const btnClass = group.isFuture ? btnFuture : btnHistorical;
              const selectBase =
                'max-w-[min(11rem,calc(85vw-8rem))] rounded-full border border-gray-200 bg-white py-2 pl-2.5 pr-7 text-xs font-semibold text-gray-800 shadow-hard-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
                (group.isFuture
                  ? 'focus-visible:ring-orange-400 border-orange-100'
                  : 'focus-visible:ring-[#3388ff]');
              return (
                <Marker key={group.id} position={[group.lat, group.lng]} icon={group.isFuture ? futureIcon : smallIcon}>
                  <Popup className="rounded-2xl">
                    <div
                      className={`p-2 text-center ${hasAlternates ? 'max-w-[min(280px,85vw)]' : 'max-w-[220px]'}`}
                    >
                      <h3 className="font-semibold leading-snug text-gray-900 line-clamp-3">
                        {group.displayName}
                      </h3>
                      <p className="mb-2 mt-1 text-[11px] text-gray-500">
                        {group.isFuture ? 'Future weather projection' : 'EnergyPlus weather database'}
                      </p>
                      {!group.isFuture && group.variants.some(v => !!v.oneBuildingZipPath) ? (
                        <p className="mb-2 text-[10px] leading-snug text-slate-500">
                          Extra formats from{' '}
                          <span className="whitespace-nowrap">climate.onebuilding.org</span> via Load other….
                        </p>
                      ) : null}
                      <div className="flex flex-nowrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleVariantSelect(group, defaultVariant)}
                          className={`${btnClass} shrink-0 px-3 py-2 text-sm font-medium`}
                          title={defaultVariant.filename}
                        >
                          Load {defaultVariant.label}
                        </button>
                        {hasAlternates ? (
                          <select
                            className={`${selectBase} min-w-0 shrink`}
                            aria-label="Load other weather file formats"
                            defaultValue=""
                            onChange={e => {
                              const id = e.target.value;
                              const el = e.currentTarget;
                              if (!id) return;
                              const v = group.variants.find(x => x.id === id);
                              if (v) void handleVariantSelect(group, v);
                              el.value = '';
                            }}
                          >
                            <option value="">Load other…</option>
                            {alternateVariants.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        ) : (
          <div
            className="h-full w-full flex items-center justify-center"
            style={{ backgroundColor: basemapStyle === 'satellite' ? '#1c1917' : CARTO_LIGHT_ALL_WATER_HEX }}
          >
            <p className="text-gray-500">Initializing map...</p>
          </div>
        )}
      </div>
    </div>
  );
}
