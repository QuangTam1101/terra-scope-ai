import type { Grid } from './types';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function normalizeLongitude(lon: number): number {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

/** Orthographic projection of a point on a unit sphere, viewed from centerLon/centerLat. */
export function projectGlobe(lon: number, lat: number, centerLon: number, centerLat: number) {
  const phi = lat * RAD;
  const phi0 = centerLat * RAD;
  const lambda = normalizeLongitude(lon - centerLon) * RAD;
  return {
    x: Math.cos(phi) * Math.sin(lambda),
    y: Math.sin(phi) * Math.cos(phi0) - Math.cos(phi) * Math.cos(lambda) * Math.sin(phi0),
    z: Math.sin(phi) * Math.sin(phi0) + Math.cos(phi) * Math.cos(lambda) * Math.cos(phi0),
  };
}

/** Inverse orthographic projection. Null means the pointer is outside the globe. */
export function unprojectGlobe(x: number, y: number, centerLon: number, centerLat: number) {
  const rho2 = x * x + y * y;
  if (rho2 > 1) return null;
  const z = Math.sqrt(Math.max(0, 1 - rho2));
  const phi0 = centerLat * RAD;
  const lat = Math.asin(Math.max(-1, Math.min(1, y * Math.cos(phi0) + z * Math.sin(phi0)))) * DEG;
  const lon = normalizeLongitude(centerLon + Math.atan2(x, z * Math.cos(phi0) - y * Math.sin(phi0)) * DEG);
  return { lon, lat };
}

/** Find the synthetic analysis cell containing a geographic coordinate. */
export function findGridCell(grid: Grid | null, lon: number, lat: number): string | null {
  if (!grid) return null;
  for (const feature of grid.features) {
    const ring = feature.geometry.coordinates[0];
    const west = ring[0][0], south = ring[0][1];
    const east = ring[2][0], north = ring[2][1];
    if (lon >= west && lon <= east && lat >= south && lat <= north) return feature.properties.id;
  }
  return null;
}
