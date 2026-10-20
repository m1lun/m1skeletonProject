import type { GeoPoint } from '../models/common';

export type TravelMode = 'walk' | 'bike' | 'drive';

// Used until the viewer has saved preferences.
export const DEFAULT_TRAVEL_MODE: TravelMode = 'walk';

// Minutes from origin to each destination, in order, or null where there is no route.
// Returns an empty list when the routing service is unavailable, so the feed still
// loads without travel times.
export type TravelTimes = (origin: GeoPoint, destinations: GeoPoint[], mode: TravelMode) => Promise<(number | null)[]>;

// Not connected to a routing service yet, so it always returns an empty list.
export const travelTimes: TravelTimes = () => Promise.resolve([]);
