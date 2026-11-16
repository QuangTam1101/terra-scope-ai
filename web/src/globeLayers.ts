// Extra layers for the 3D globe when the user zooms in:
//  * NASA GIBS Blue Marble (shaded relief + bathymetry) image tiles, EPSG:4326 WMTS, fetched only for the part of the
//    globe in view and only at the detail the screen can show (about 500 m per pixel at the deepest level). Tiles are
//    cached (least recently used first out) and drawn into one "detail" image that the globe samples per pixel.
//  * Country borders (Natural Earth 110m, or 50m loaded on demand when zoomed in) and labels for countries and cities.
// No API key is needed; GIBS sends CORS headers so the browser can read the pixels.
import { geoArea, geoCentroid } from "d3-geo";
import { mesh } from "topojson-client";
import type { Topology } from "topojson-specification";
import { CITY_POINTS, COUNTRY_FEATURES, COUNTRY_TOPO } from "./places";

export const GIBS_LAYER = "BlueMarble_ShadedRelief_Bathymetry";
const GIBS_URL = (z: number, r: number, c: number) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${GIBS_LAYER}/default/500m/${z}/${r}/${c}.jpeg`;
const TILE = 512;                       // pixels per tile side
const MAX_LEVEL = 7;                    // deepest level of the 500m tile matrix set
const MAX_TILES = 20;                   // per detail image (keeps memory and redraw time small)
/** Degrees covered by one tile at a level (GIBS EPSG:4326: 288 degrees at level 0, halving each level). */
export const tileSpan = (z: number) => 288 / 2 ** z;

// ---------- tile cache ----------
const cache = new Map<string, Promise<HTMLImageElement | null>>();
function tile(z: number, r: number, c: number): Promise<HTMLImageElement | null> {
  const key = `${z}/${r}/${c}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }       // refresh LRU position
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const im = new Image();
    im.crossOrigin = "anonymous"; im.decoding = "async";
    im.onload = () => resolve(im);
    im.onerror = () => { cache.delete(key); resolve(null); };
    im.src = GIBS_URL(z, r, c);
  });
  cache.set(key, p);
  while (cache.size > 300) cache.delete(cache.keys().next().value!);
  return p;
}
const loaded = new Map<string, HTMLImageElement>();   // tiles that have arrived, for synchronous drawing

export interface Detail { key: string; z: number; west: number; north: number; span: number; w: number; h: number; px: Uint32Array }
export interface View { lon: number; lat: number; degPerPx: number; radiusDeg: number }

/** Tile level and range for a view, or null when the base photo is already sharp enough. */
export function plan(v: View) {
  let z = Math.max(0, Math.min(MAX_LEVEL, Math.ceil(Math.log2(0.5625 / v.degPerPx))));
  if (z <= 2) return null;                             // the 2048 px base photo (0.18 degrees per pixel) is enough
  const latS = Math.max(-90, v.lat - v.radiusDeg), latN = Math.min(90, v.lat + v.radiusDeg);
  const cosl = Math.max(0.15, Math.cos((Math.min(80, Math.max(Math.abs(latS), Math.abs(latN))) * Math.PI) / 180));
  const lonW = Math.max(-180, v.lon - v.radiusDeg / cosl), lonE = Math.min(180, v.lon + v.radiusDeg / cosl);
  for (; z > 2; z--) {
    const T = tileSpan(z);
    const c0 = Math.floor((lonW + 180) / T), c1 = Math.floor((lonE + 180 - 1e-9) / T);
    const r0 = Math.floor((90 - latN) / T), r1 = Math.min(Math.floor((90 - latS - 1e-9) / T), Math.ceil(180 / T) - 1);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) <= MAX_TILES) return { z, c0, c1, r0, r1, T };
  }
  return null;
}

/** Start loading the tiles of a plan; calls onTile each time one arrives. */
export function request(p: NonNullable<ReturnType<typeof plan>>, onTile: () => void) {
  for (let r = p.r0; r <= p.r1; r++) for (let c = p.c0; c <= p.c1; c++) {
    const key = `${p.z}/${r}/${c}`;
    if (loaded.has(key)) continue;
    tile(p.z, r, c).then((im) => { if (im) { loaded.set(key, im); if (loaded.size > 300) loaded.delete(loaded.keys().next().value!); onTile(); } });
  }
}

/** Compose the tiles that have arrived into one image (transparent where a tile is still missing). */
export function compose(p: NonNullable<ReturnType<typeof plan>>): Detail | null {
  const cols = p.c1 - p.c0 + 1, rows = p.r1 - p.r0 + 1;
  const cv = document.createElement("canvas"); cv.width = cols * TILE; cv.height = rows * TILE;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let any = false;
  for (let r = p.r0; r <= p.r1; r++) for (let c = p.c0; c <= p.c1; c++) {
    const im = loaded.get(`${p.z}/${r}/${c}`);
    if (im) { ctx.drawImage(im, (c - p.c0) * TILE, (r - p.r0) * TILE); any = true; }
  }
  if (!any) return null;
  return {
    key: `${p.z}/${p.c0}-${p.c1}/${p.r0}-${p.r1}`, z: p.z, west: -180 + p.c0 * p.T, north: 90 - p.r0 * p.T, span: p.T,
    w: cv.width, h: cv.height, px: new Uint32Array(ctx.getImageData(0, 0, cv.width, cv.height).data.buffer),
  };
}

// ---------- borders and labels ----------
const topo110 = COUNTRY_TOPO as unknown as Topology;
export const borders110 = mesh(topo110, topo110.objects.countries as never, (a, b) => a !== b);
let borders50: GeoJSON.MultiLineString | null = null, loading50 = false;
/** Country borders: the detailed 50m set once loaded (requested on first deep zoom), the 110m set until then. */
export function borders(detailed: boolean, onLoad: () => void): GeoJSON.MultiLineString {
  if (detailed && !borders50 && !loading50) {
    loading50 = true;
    import("world-atlas/countries-50m.json").then((m) => {
      const t = (m.default ?? m) as unknown as Topology;
      borders50 = mesh(t, t.objects.countries as never, (a, b) => a !== b);
      onLoad();
    }).catch(() => { loading50 = false; });
  }
  return detailed && borders50 ? borders50 : borders110;
}

export interface Label { name: string; lon: number; lat: number; kind: "country" | "state" | "city"; area: number; minZoom?: number }
/** Countries (placed at their centroid, larger first) then cities. */
export const LABELS: Label[] = [
  ...COUNTRY_FEATURES.map((f) => {
    // label at the centre of the largest piece (France's centre is not in French Guiana's direction)
    const g = f.geometry;
    const main: GeoJSON.Geometry = g.type === "MultiPolygon"
      ? { type: "Polygon", coordinates: g.coordinates.reduce((best, c) => (geoArea({ type: "Polygon", coordinates: c }) > geoArea({ type: "Polygon", coordinates: best }) ? c : best)) }
      : g;
    const [lon, lat] = geoCentroid(main);
    return { name: f.properties.name, lon, lat, kind: "country" as const, area: geoArea(f) };
  }).filter((l) => Number.isFinite(l.lon)).sort((a, b) => b.area - a.area),
  ...CITY_POINTS.map(([name, , lat, lon]) => ({ name, lon, lat, kind: "city" as const, area: 0 })),
];

// ---------- states / provinces and more cities (Natural Earth 1:10m, public/earth/admin1.json, ~720 KB gzip) ----------
// Loaded on the first zoom past 2.5x. Lines are bucketed into 10 degree squares so a frame only touches what is in view;
// each line and label carries Natural Earth's own minimum zoom, so a far view draws only the main boundaries. Lines are
// projected with plain orthographic maths (no d3 resampling) and stroked as one path.
type Line = { z: number; w: number; s: number; e: number; n: number; xy: Int32Array };
export interface Admin { lines: Line[]; grid: number[][]; states: Label[]; cities: Label[] }
let admin: Admin | null = null, adminLoading = false;
const GW = 36, GH = 18;
export function loadAdmin(onLoad: () => void): Admin | null {
  if (admin || adminLoading) return admin;
  adminLoading = true;
  fetch("/earth/admin1.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d: {
    lines: [number, number, number, number, number, number[]][]; states: [string, number, number, number][]; cities: [string, number, number, number][];
  }) => {
    const lines: Line[] = d.lines.map(([z, w, s, e, n, xy]) => ({ z, w: w / 100, s: s / 100, e: e / 100, n: n / 100, xy: Int32Array.from(xy) }));
    const grid: number[][] = Array.from({ length: GW * GH }, () => []);
    lines.forEach((l, i) => {
      const c0 = Math.max(0, Math.floor((l.w + 180) / 10)), c1 = Math.min(GW - 1, Math.floor((l.e + 180) / 10));
      const r0 = Math.max(0, Math.floor((l.s + 90) / 10)), r1 = Math.min(GH - 1, Math.floor((l.n + 90) / 10));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * GW + c].push(i);
    });
    admin = {
      lines, grid,
      // states: rank 2 (largest) to 11; mapped onto a minimum zoom like the other layers
      states: d.states.map(([name, lon, lat, rank]) => ({ name, lon, lat, kind: "state" as const, area: 0, minZoom: 1.5 + rank * 0.55 })),
      cities: d.cities.map(([name, lon, lat, mz]) => ({ name, lon, lat, kind: "city" as const, area: 0, minZoom: mz })),
    };
    onLoad();
  }).catch(() => { adminLoading = false; });
  return null;
}

/** Map zoom in the usual web map sense (0 = whole world in 256 px) for a globe radius in CSS pixels. */
export const webZoom = (radiusCss: number) => Math.log2((2 * Math.PI * radiusCss) / 256);

/** Adds the state / province boundaries in view to the current path (caller strokes). */
export function traceAdmin(ctx: CanvasRenderingContext2D, a: Admin, o: { lon: number; lat: number; R: number; cx: number; cy: number; zoom: number; radiusDeg: number }) {
  const D = Math.PI / 180, l0 = o.lon * D, p0 = o.lat * D, sp0 = Math.sin(p0), cp0 = Math.cos(p0);
  const latS = Math.max(-90, o.lat - o.radiusDeg), latN = Math.min(90, o.lat + o.radiusDeg);
  const cosl = Math.max(0.1, Math.cos(Math.min(85, Math.max(Math.abs(latS), Math.abs(latN))) * D));
  const span = o.radiusDeg / cosl, all = span >= 180;
  const r0 = Math.max(0, Math.floor((latS + 90) / 10)), r1 = Math.min(GH - 1, Math.floor((latN + 90 - 1e-9) / 10));
  const seen = new Uint8Array(a.lines.length), maxZ = o.zoom + 2.2;   // Natural Earth rates many provinces (Vietnam, Thailand) at zoom 8
  const lonW = o.lon - span, lonE = o.lon + span;
  const cols: number[] = [];
  if (all) for (let c = 0; c < GW; c++) cols.push(c);
  else for (let lo = Math.floor(lonW / 10) * 10; lo <= lonE; lo += 10) cols.push((((Math.floor((lo + 180) / 10)) % GW) + GW) % GW);
  for (let r = r0; r <= r1; r++) for (const c of cols) for (const i of a.grid[r * GW + c]) {
    if (seen[i]) continue;
    seen[i] = 1;
    const l = a.lines[i];
    if (l.z > maxZ) continue;
    const xy = l.xy;
    let up = false;
    for (let k = 0; k < xy.length; k += 2) {
      const lam = xy[k] / 100 * D - l0, phi = xy[k + 1] / 100 * D, cphi = Math.cos(phi), sphi = Math.sin(phi), cl = Math.cos(lam);
      if (sp0 * sphi + cp0 * cphi * cl <= 0) { up = false; continue; }    // behind the globe
      const x = o.cx + o.R * cphi * Math.sin(lam), y = o.cy - o.R * (cp0 * sphi - sp0 * cphi * cl);
      if (up) ctx.lineTo(x, y); else { ctx.moveTo(x, y); up = true; }
    }
  }
}

/** Labels for a view, most important first: countries (by area), then cities and states that the zoom allows. */
export function labelList(a: Admin | null, zoom: number, latMin: number, latMax: number): Label[] {
  const inLat = (l: Label) => l.lat >= latMin - 1 && l.lat <= latMax + 1;
  if (!a) return LABELS;
  return [...LABELS.filter((l) => l.kind === "country"),
    ...a.cities.filter((l) => (l.minZoom ?? 9) <= zoom + 0.6 && inLat(l)),
    ...a.states.filter((l) => (l.minZoom ?? 9) <= zoom && inLat(l))];
}

/** Draws labels with collision avoidance. `project` returns canvas coordinates (or null when hidden), `s` is canvas
 * pixels per CSS pixel, `Rpx` the globe radius in canvas pixels (for the 2D map: world width / 2 pi), so a country is
 * named only when it is big enough on screen. `onDark` picks white text with a dark halo (photo, space) or the reverse. */
export function drawLabels(ctx: CanvasRenderingContext2D, list: Label[], o: {
  project: (lon: number, lat: number) => [number, number] | null; s: number; Rpx: number; k: number; width: number; height: number; onDark: boolean;
}) {
  const placed: [number, number, number, number][] = [], names = new Set<string>();
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  const s = o.s;
  let drawn = 0;
  for (const l of list) {
    if (drawn >= 140) break;
    if (l.kind === "country" && l.area * o.Rpx * o.Rpx < 2600 * s * s) continue;
    if (l.kind === "city" && o.k < 2.5) continue;
    if (l.kind !== "country" && names.has(l.name)) continue;
    const pt = o.project(l.lon, l.lat);
    if (!pt || pt[0] < 0 || pt[1] < 0 || pt[0] > o.width || pt[1] > o.height) continue;
    const text = l.kind === "country" ? l.name.toUpperCase() : l.name;
    ctx.font = l.kind === "country" ? `800 ${11.5 * s}px Nunito, sans-serif` : l.kind === "state" ? `italic 700 ${10.5 * s}px Nunito, sans-serif` : `700 ${11.5 * s}px Nunito, sans-serif`;
    const w = ctx.measureText(text).width + 6 * s, h = 15 * s;
    const ox = l.kind === "city" ? w / 2 + 5 * s : 0;
    const box: [number, number, number, number] = [pt[0] + ox - w / 2, pt[1] - h / 2, pt[0] + ox + w / 2, pt[1] + h / 2];
    if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    placed.push(box); drawn++; names.add(l.name);
    const ink = o.onDark ? "rgba(8,12,28,.8)" : "rgba(255,255,255,.9)";
    if (l.kind === "city") {
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 2.6 * s, 0, Math.PI * 2); ctx.fillStyle = o.onDark ? "#fff" : "#2b2540"; ctx.fill();
      ctx.lineWidth = 1.2 * s; ctx.strokeStyle = o.onDark ? "rgba(10,14,30,.85)" : "#fff"; ctx.stroke();
    }
    ctx.lineWidth = 3 * s; ctx.strokeStyle = ink; ctx.strokeText(text, pt[0] + ox, pt[1]);
    ctx.fillStyle = o.onDark
      ? (l.kind === "country" ? "rgba(255,255,255,.92)" : l.kind === "state" ? "rgba(225,232,250,.85)" : "#fff")
      : (l.kind === "country" ? "#2b2540" : l.kind === "state" ? "rgba(60,52,92,.85)" : "#2b2540");
    ctx.fillText(text, pt[0] + ox, pt[1]);
  }
}

/** Adds the state / province boundaries in a lon/lat box to the current path, for a flat (equirectangular) map. */
export function traceAdminFlat(ctx: CanvasRenderingContext2D, a: Admin, o: { w: number; s: number; e: number; n: number; zoom: number; x: (lon: number) => number; y: (lat: number) => number }) {
  const r0 = Math.max(0, Math.floor((o.s + 90) / 10)), r1 = Math.min(GH - 1, Math.floor((o.n + 90 - 1e-9) / 10));
  const c0 = Math.max(0, Math.floor((o.w + 180) / 10)), c1 = Math.min(GW - 1, Math.floor((o.e + 180 - 1e-9) / 10));
  const seen = new Uint8Array(a.lines.length), maxZ = o.zoom + 2.2;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const i of a.grid[r * GW + c]) {
    if (seen[i]) continue;
    seen[i] = 1;
    const l = a.lines[i];
    if (l.z > maxZ || l.e < o.w || l.w > o.e || l.n < o.s || l.s > o.n) continue;
    const xy = l.xy;
    ctx.moveTo(o.x(xy[0] / 100), o.y(xy[1] / 100));
    for (let k = 2; k < xy.length; k += 2) ctx.lineTo(o.x(xy[k] / 100), o.y(xy[k + 1] / 100));
  }
}
