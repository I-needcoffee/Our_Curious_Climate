import { fetchIemNetworkGeoJson } from './geojsonNetwork';
import { nearestNetworkFeature } from './nearestStation';
import { iemAsosNetworkForUsEpw } from './usNetworkFromEpw';
import type { EPWMetadata } from '../epwParser';

const networkGeoJsonCache = new Map<string, ReturnType<typeof fetchIemNetworkGeoJson>>();

export type IemNearestUsStationResult =
  | {
      kind: 'eligible';
      network: string;
      stationId: string;
      stationName: string | undefined;
      distanceKm: number;
    }
  | { kind: 'not_us_epw_location'; detail: string }
  | { kind: 'station_not_found'; network: string };

export async function resolveNearestUsAsosForEpw(metadata: EPWMetadata): Promise<IemNearestUsStationResult> {
  const net = iemAsosNetworkForUsEpw(metadata);
  if (!net) {
    return {
      kind: 'not_us_epw_location',
      detail:
        'Automated Iowa Environmental Mesonet (IEM) ASOS wind overlays are implemented for U.S. locations with a STATE_ASOS catalogue entry. Locations outside this set are not wired up yet.',
    };
  }

  if (!Number.isFinite(metadata.lat) || !Number.isFinite(metadata.lng)) {
    return {
      kind: 'not_us_epw_location',
      detail: 'This weather file is missing valid latitude/longitude in the LOCATION header, so the nearest IEM station cannot be resolved.',
    };
  }

  let gjP = networkGeoJsonCache.get(net);
  if (!gjP) {
    gjP = fetchIemNetworkGeoJson(net);
    networkGeoJsonCache.set(net, gjP);
    gjP.catch(() => networkGeoJsonCache.delete(net));
  }
  const gj = await gjP;
  const hit = nearestNetworkFeature(gj.features, metadata.lat, metadata.lng);
  if (!hit) {
    return { kind: 'station_not_found', network: net };
  }

  const sid = hit.feature.properties.sid;
  return {
    kind: 'eligible',
    network: net,
    stationId: sid,
    stationName: hit.feature.properties.sname,
    distanceKm: hit.distanceKm,
  };
}
