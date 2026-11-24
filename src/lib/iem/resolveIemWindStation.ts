import type { EPWMetadata } from '../epwParser';
import { loadWindStationsNearEpw, pickDefaultWindStation, windMapStationToSelection } from './windStationCatalog';
import { resolveNearestUsAsosForEpw, type IemNearestUsStationResult } from './resolveNearestUsAsosStation';
import type { IemWindStationSelection } from './windStationTypes';

export type ResolvedIemWindStation =
  | { kind: 'eligible'; selection: IemWindStationSelection }
  | { kind: 'not_us_epw_location'; detail: string }
  | { kind: 'station_not_found'; detail: string };

export async function resolveIemWindStationForEpw(
  metadata: EPWMetadata,
  preferred: IemWindStationSelection | null | undefined
): Promise<ResolvedIemWindStation> {
  if (preferred?.stationId && preferred.network) {
    return {
      kind: 'eligible',
      selection: preferred,
    };
  }

  const catalog = await loadWindStationsNearEpw(metadata);
  if (catalog.kind === 'not_us') {
    return { kind: 'not_us_epw_location', detail: catalog.detail };
  }
  if (catalog.kind === 'no_coordinates') {
    return { kind: 'not_us_epw_location', detail: catalog.detail };
  }

  if (catalog.kind === 'ok') {
    const picked = pickDefaultWindStation(catalog.stations);
    if (picked) {
      return { kind: 'eligible', selection: windMapStationToSelection(picked) };
    }
  }

  const nearest = await resolveNearestUsAsosForEpw(metadata);
  if (nearest.kind === 'eligible') {
    return {
      kind: 'eligible',
      selection: {
        kind: 'asos',
        network: nearest.network,
        stationId: nearest.stationId,
        stationName: nearest.stationName,
        distanceKm: nearest.distanceKm,
      },
    };
  }

  if (nearest.kind === 'not_us_epw_location') {
    return { kind: 'not_us_epw_location', detail: nearest.detail };
  }

  return {
    kind: 'station_not_found',
    detail: `No online mesonet stations were found near this location (${nearest.network}).`,
  };
}

export function messageForResolvedIemWindStation(r: ResolvedIemWindStation): string {
  switch (r.kind) {
    case 'not_us_epw_location':
      return r.detail;
    case 'station_not_found':
      return r.detail;
    default:
      return '';
  }
}

export function stationLineForSelection(
  sel: IemWindStationSelection,
  rangeLabel: string,
  compositeNote: string
): string {
  const kind = sel.kind === 'asos' ? 'ASOS' : 'RWIS';
  const nm = sel.stationName ? ` (${sel.stationName})` : '';
  const dist = sel.distanceKm != null ? ` · ~${sel.distanceKm.toFixed(1)} km` : '';
  return `IEM ${kind}: ${sel.stationId}${nm}${dist} · ${rangeLabel}${compositeNote}`;
}

/** @deprecated Use resolveIemWindStationForEpw — kept for imports that only need ASOS nearest. */
export type { IemNearestUsStationResult };
