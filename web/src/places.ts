// Offline place search: preset areas from the API, countries (Natural Earth 1:110m via world-atlas) and major cities.
// Countries are analysed by their border (the backend masks the same file); cities and coordinates use the grid cell
// that contains them.
import { geoBounds } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import countriesTopo from "world-atlas/countries-110m.json";
import type { BBox, Region } from "./api";
import type { Place } from "./store";

export interface PlaceHit { kind: "Preset area" | "Country" | "City"; name: string; place: Place }


// Size of one grid cell in degrees. Set from the data the backend serves (0.5° for the cleaned global grid).
let CELL = 0.5;
export const setGridCell = (deg: number) => { if (deg > 0) CELL = deg; };
export const gridCell = () => CELL;
/** Lookup key of the grid cell that contains a point (same key for a cell centre and any point inside it). */
export const cellKey = (lon: number, lat: number, s = CELL) => `${Math.floor((lon + 180) / s)},${Math.floor((lat + 90) / s)}`;

/** The grid cell containing a point. Label is plain coordinates (no "cell" wording). */
export function pointPlace(lat: number, lon: number, name?: string): Place {
  const s0 = CELL;
  const w = Math.max(-180, Math.min(180 - s0, Math.floor(lon / s0) * s0));
  const s = Math.max(-90, Math.min(90 - s0, Math.floor(lat / s0) * s0));
  const bbox: BBox = [w, s, w + s0, s + s0];
  const d = s0 < 1 ? 2 : 1;
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(d)}°${v >= 0 ? pos : neg}`;
  return { ref: { type: "bbox", bbox }, label: name ?? `${f(s + s0 / 2, "N", "S")}, ${f(w + s0 / 2, "E", "W")}`, bbox };
}

// ---------- countries ----------
const topo = countriesTopo as unknown as Topology;
const fc = feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>;
const COUNTRIES: PlaceHit[] = fc.features.map((f) => {
  let [[w, s], [e, n]] = geoBounds(f);
  if (w > e) { if (180 - w >= e + 180) e = 180; else w = -180; }   // crosses the antimeridian: keep the larger side
  const bbox: BBox = [Math.floor(w), Math.floor(s), Math.ceil(e), Math.ceil(n)];   // map label and zoom only
  return { kind: "Country", name: f.properties.name, place: { ref: { type: "country", id: f.properties.name }, label: f.properties.name, bbox } };
});
const SHAPES = new Map(fc.features.map((f) => [f.properties.name, f]));
/** Natural Earth 1:110m country polygons (also used for the globe's labels). */
export const COUNTRY_FEATURES = fc.features;
export const COUNTRY_TOPO = topo;
/** Place for a Natural Earth country name; undefined for an unknown name. */
export const countryPlace = (name: string): Place | undefined => COUNTRIES.find((c) => c.name === name)?.place;
/** Border to draw for a place: countries only (other places are boxes or cells). */
export const placeShape = (p: Place) => (p.ref.type === "country" ? SHAPES.get(p.ref.id) : undefined);

// ---------- cities (name, country, lat, lon) ----------
const CITY_DATA: [string, string, number, number][] = [
  ["Hanoi", "Vietnam", 21.03, 105.85], ["Ho Chi Minh City", "Vietnam", 10.82, 106.63], ["Da Nang", "Vietnam", 16.05, 108.2],
  ["Can Tho", "Vietnam", 10.03, 105.78], ["Hue", "Vietnam", 16.46, 107.59], ["Hai Phong", "Vietnam", 20.86, 106.68],
  ["Da Lat", "Vietnam", 11.94, 108.44], ["Bangkok", "Thailand", 13.75, 100.5], ["Phnom Penh", "Cambodia", 11.56, 104.92],
  ["Vientiane", "Laos", 17.97, 102.6], ["Yangon", "Myanmar", 16.84, 96.17], ["Kuala Lumpur", "Malaysia", 3.14, 101.69],
  ["Singapore", "Singapore", 1.35, 103.82], ["Jakarta", "Indonesia", -6.2, 106.85], ["Manila", "Philippines", 14.6, 120.98],
  ["Beijing", "China", 39.9, 116.4], ["Shanghai", "China", 31.23, 121.47], ["Kunming", "China", 25.04, 102.71],
  ["Hong Kong", "China", 22.32, 114.17], ["Tokyo", "Japan", 35.68, 139.69], ["Seoul", "South Korea", 37.57, 126.98],
  ["Delhi", "India", 28.61, 77.21], ["Mumbai", "India", 19.08, 72.88], ["Kolkata", "India", 22.57, 88.36],
  ["Dhaka", "Bangladesh", 23.81, 90.41], ["Karachi", "Pakistan", 24.86, 67.0], ["Kathmandu", "Nepal", 27.72, 85.32],
  ["Ulaanbaatar", "Mongolia", 47.89, 106.91], ["Tehran", "Iran", 35.69, 51.39], ["Dubai", "United Arab Emirates", 25.2, 55.27],
  ["Riyadh", "Saudi Arabia", 24.71, 46.68], ["Istanbul", "Turkey", 41.01, 28.98], ["Moscow", "Russia", 55.76, 37.62],
  ["London", "United Kingdom", 51.51, -0.13], ["Paris", "France", 48.86, 2.35], ["Berlin", "Germany", 52.52, 13.4],
  ["Madrid", "Spain", 40.42, -3.7], ["Rome", "Italy", 41.9, 12.5], ["Reykjavik", "Iceland", 64.15, -21.94],
  ["Cairo", "Egypt", 30.04, 31.24], ["Khartoum", "Sudan", 15.5, 32.56], ["Addis Ababa", "Ethiopia", 9.03, 38.74],
  ["Nairobi", "Kenya", -1.29, 36.82], ["Kinshasa", "DR Congo", -4.44, 15.27], ["Lagos", "Nigeria", 6.52, 3.38],
  ["Niamey", "Niger", 13.51, 2.11], ["Dakar", "Senegal", 14.72, -17.47], ["Johannesburg", "South Africa", -26.2, 28.05],
  ["New York", "United States", 40.71, -74.01], ["Los Angeles", "United States", 34.05, -118.24], ["Chicago", "United States", 41.88, -87.63],
  ["Madison", "United States (Wisconsin)", 43.07, -89.4], ["Anchorage", "United States (Alaska)", 61.22, -149.9],
  ["Toronto", "Canada", 43.65, -79.38], ["Vancouver", "Canada", 49.28, -123.12], ["Mexico City", "Mexico", 19.43, -99.13],
  ["Bogotá", "Colombia", 4.71, -74.07], ["Lima", "Peru", -12.05, -77.04], ["Manaus", "Brazil", -3.12, -60.02],
  ["São Paulo", "Brazil", -23.55, -46.63], ["Rio de Janeiro", "Brazil", -22.91, -43.17], ["Buenos Aires", "Argentina", -34.6, -58.38],
  ["Sydney", "Australia", -33.87, 151.21], ["Melbourne", "Australia", -37.81, 144.96], ["Perth", "Australia", -31.95, 115.86],
  ["Auckland", "New Zealand", -36.85, 174.76],
];
/** City points for map labels: name, country, lat, lon. */
export const CITY_POINTS: readonly (readonly [string, string, number, number])[] = CITY_DATA;
// Other names people type (Vietnamese spellings, old names); searched but not shown.
const ALIASES: Record<string, string[]> = {
  "Ho Chi Minh City": ["Saigon", "Sai Gon", "Thanh pho Ho Chi Minh", "TPHCM", "HCMC"],
  "Hanoi": ["Ha Noi"], "Da Nang": ["Đà Nẵng"], "Can Tho": ["Cần Thơ"], "Hue": ["Huế"], "Hai Phong": ["Hải Phòng"], "Da Lat": ["Đà Lạt", "Dalat"],
  "Yangon": ["Rangoon"], "Mumbai": ["Bombay"], "Beijing": ["Peking"],
};
// Built on each search so the city cell follows the current grid size.
const cities = (): (PlaceHit & { aliases?: string[] })[] => CITY_DATA.map(([name, country, lat, lon]) => ({
  kind: "City", name: `${name}, ${country}`, aliases: ALIASES[name], place: pointPlace(lat, lon, `${name}, ${country}`),
}));

// Case-, accent- and space-insensitive ("Hà Nội", "ha noi" and "Hanoi" all match).
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
const compact = (s: string) => norm(s).replace(/[\s.,'()-]+/g, "");

export function searchPlaces(query: string, regions: Region[], limit = 8): PlaceHit[] {
  const presets: PlaceHit[] = regions.map((r) => ({ kind: "Preset area", name: r.name, place: { ref: { type: "preset", id: r.id }, label: r.name, bbox: r.bbox } }));
  const q = norm(query), qc = compact(query);
  if (!q) return presets.slice(0, limit);
  const score = (name: string) => {
    const n = norm(name), c = compact(name);
    if (n.startsWith(q) || c.startsWith(qc)) return 0;
    if (n.split(/[\s,()]+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) || c.includes(qc) ? 2 : 9;
  };
  const all: (PlaceHit & { aliases?: string[] })[] = [...presets, ...COUNTRIES, ...cities()];
  const scored = all
    .map((h) => ({ h, s: Math.min(score(h.name), ...(h.aliases ?? []).map(score)) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.h.name.length - b.h.name.length);
  return scored.slice(0, limit).map(({ h }) => ({ kind: h.kind, name: h.name, place: h.place }));
}

/** Parse "10.8, 106.7" or "10.8 106.7" (latitude first). */
export function parseCoords(text: string): { lat: number; lon: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
