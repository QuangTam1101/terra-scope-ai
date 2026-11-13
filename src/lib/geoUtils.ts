/**
 * Terra-Scope AI - Geographic Utilities & Geometry Calculations
 */

import type { Position } from 'geojson';
import type { GeographicSelection } from './types.ts';

// Bounded single world map coordinates (prevents infinite horizontal duplication in 2D map)
export const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-180, -85],
  [180, 85],
];

/** Clamp coordinates strictly within valid bounded world boundaries. */
export function clampLonLat(lng: number, lat: number): [number, number] {
  return [
    Math.max(-180, Math.min(180, lng)),
    Math.max(-85, Math.min(85, lat)),
  ];
}

// Prototype data coverage boundaries: Greater Southeast Asia / Indochina
export const PROTOTYPE_COVERAGE_BOUNDS: [[number, number], [number, number]] = [
  [101.5, 8.0],
  [111.0, 24.0],
];

/** Check if a geographic point falls within the prototype's calibrated data cache. */
export function isWithinPrototypeCoverage(lon: number, lat: number): boolean {
  const [[w, s], [e, n]] = PROTOTYPE_COVERAGE_BOUNDS;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** Check if a bounding box intersects or is contained within the prototype coverage. */
export function isBoundsWithinCoverage(bounds: [[number, number], [number, number]]): boolean {
  const [[bw, bs], [be, bn]] = bounds;
  const [[cw, cs], [ce, cn]] = PROTOTYPE_COVERAGE_BOUNDS;
  return bw < ce && be > cw && bs < cn && bn > cs;
}

/** Compute bounding box for any GeographicSelection. */
export function getSelectionBounds(selection: GeographicSelection): [[number, number], [number, number]] {
  if (selection.type === 'preset') {
    if (selection.regionId === 'north') {
      return [[104.5, 20.1], [107.25, 22.25]];
    }
    // Default to mekong
    return [[104.65, 9.2], [106.85, 11.45]];
  }

  if (selection.type === 'point') {
    const [lon, lat] = selection.coordinates;
    const delta = 0.35; // ~35 km bounding envelope for localized point analysis
    return [
      [Number((lon - delta).toFixed(3)), Number((lat - delta).toFixed(3))],
      [Number((lon + delta).toFixed(3)), Number((lat + delta).toFixed(3))],
    ];
  }

  if (selection.type === 'bbox') {
    return selection.bounds;
  }

  if (selection.type === 'polygon') {
    const ring = selection.coordinates[0];
    if (!ring || ring.length === 0) return [[105, 10], [106, 11]];
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return [
      [Number(minLon.toFixed(3)), Number(minLat.toFixed(3))],
      [Number(maxLon.toFixed(3)), Number(maxLat.toFixed(3))],
    ];
  }

  return [[104.65, 9.2], [106.85, 11.45]];
}

/** Center coordinate [lon, lat] of a bounding box. */
export function getBoundsCenter(bounds: [[number, number], [number, number]]): [number, number] {
  const [[w, s], [e, n]] = bounds;
  return [Number(((w + e) / 2).toFixed(3)), Number(((s + n) / 2).toFixed(3))];
}

/** Approximate geodesic surface area of a bounding box in square kilometers. */
export function calculateBBoxAreaKm2(bounds: [[number, number], [number, number]]): number {
  const [[w, s], [e, n]] = bounds;
  const avgLatRad = (((s + n) / 2) * Math.PI) / 180;
  const latKm = Math.abs(n - s) * 111.13;
  const lonKm = Math.abs(e - w) * 111.32 * Math.cos(avgLatRad);
  return Math.round(latKm * lonKm);
}

/** Approximate polygon area in square kilometers via spherical Shoelace formula. */
export function calculatePolygonAreaKm2(ring: Position[]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  const rad = Math.PI / 180;
  for (let i = 0; i < ring.length - 1; i++) {
    const [p1Lon, p1Lat] = ring[i];
    const [p2Lon, p2Lat] = ring[i + 1];
    total += (p2Lon - p1Lon) * rad * (2 + Math.sin(p1Lat * rad) + Math.sin(p2Lat * rad));
  }
  const earthRadiusKm = 6371.0;
  const area = Math.abs((total * earthRadiusKm * earthRadiusKm) / 2.0);
  return Math.round(area);
}

/** Validate custom polygon geometry. */
export function validatePolygon(ring: Position[]): { valid: boolean; error?: string } {
  if (ring.length < 3) {
    return { valid: false, error: 'A polygon requires at least 3 distinct geographic vertices.' };
  }

  // Check extent size
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const spanLon = maxLon - minLon;
  const spanLat = maxLat - minLat;

  if (spanLon > 15 || spanLat > 15) {
    return { valid: false, error: 'Custom region is too large (max 15° × 15° for high-resolution gridded analysis).' };
  }

  if (spanLon < 0.05 && spanLat < 0.05) {
    return { valid: false, error: 'Custom region is too small (<0.05°). Please select a larger area or use Point Selection.' };
  }

  return { valid: true };
}

/** Format coordinates cleanly for UI display. */
export function formatCoordinates(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}
