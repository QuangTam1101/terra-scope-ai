// Shareable Explore links: "#explore?v=imerg_precip&place=region:mekong_delta&from=2001-01&to=2025-12&view=trend".
// Pure module (no React, no DOM except `location` in shareUrl). Bad or unknown values are dropped, never thrown.
import type { RegionRef } from "./api";

export interface ExploreState {
  variableId?: string;
  place?: { kind: "region"; id: string } | { kind: "country"; name: string } | { kind: "cell"; lat: number; lon: number }
    | { kind: "box"; bbox: [number, number, number, number] };
  start?: string; end?: string;            // "YYYY-MM"
  view?: "values" | "trend" | "timelapse";
}

const CELL = 0.5;                                          // the cleaned global grid
const FIRST = "2001-01", LAST = "2026-12";   // GLDAS cubes reach 2026
const ID = /^[a-z0-9_]{1,64}$/;
const COUNTRY = /^[\p{L}\p{M} .,'()-]{1,80}$/u;           // Natural Earth names: "Côte d'Ivoire", "Dem. Rep. Congo"
const VIEWS = ["values", "trend", "timelapse"] as const;

const num = (s: string) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);
/** Centre of the 0.5° cell that holds the point, so a link always names exactly one grid cell. */
const cellCentre = (v: number, max: number) => Math.min(max - CELL, Math.max(-max, Math.floor(v / CELL) * CELL)) + CELL / 2;
const grid = (v: number) => Math.round(v / CELL) * CELL;   // box edges snap to grid lines
const month = (s: string | null) => (s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) && s >= FIRST && s <= LAST ? s : undefined);

function parsePlace(raw: string | null): ExploreState["place"] {
  if (!raw) return undefined;
  const [kind, rest = ""] = raw.split(/:(.*)/s);
  if (kind === "region") return ID.test(rest) ? { kind, id: rest } : undefined;
  if (kind === "country") return COUNTRY.test(rest) ? { kind, name: rest } : undefined;
  const n = rest.split(",").map(num);
  if (kind === "cell" && n.length === 2) {
    const [lat, lon] = n;
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return undefined;
    return { kind, lat: cellCentre(lat, 90), lon: cellCentre(lon, 180) };
  }
  if (kind === "box" && n.length === 4) {
    const [w, s, e, nn] = n.map(grid);
    if (!(w >= -180 && e <= 180 && s >= -90 && nn <= 90 && w < e && s < nn)) return undefined;
    return { kind, bbox: [w, s, e, nn] };
  }
  return undefined;
}

/** State from an "#explore?..." hash; null for any other page ("#report?case=…", "#hunt", …). */
export function parseExplore(hash: string): ExploreState | null {
  const m = /^#\/?explore(?:\?(.*))?$/s.exec(hash);
  if (!m) return null;
  const q = new URLSearchParams(m[1] ?? "");
  const s: ExploreState = {};
  const v = q.get("v");
  if (v && ID.test(v)) s.variableId = v;
  const place = parsePlace(q.get("place"));
  if (place) s.place = place;
  const start = month(q.get("from")), end = month(q.get("to"));
  if (!(start && end && start > end)) { if (start) s.start = start; if (end) s.end = end; }   // reversed period: drop both
  const view = q.get("view");
  if ((VIEWS as readonly string[]).includes(view ?? "")) s.view = view as ExploreState["view"];
  return s;
}

function format(s: ExploreState): string {
  const p = s.place;
  const place = !p ? undefined : p.kind === "region" ? `region:${p.id}` : p.kind === "country" ? `country:${p.name}`
    : p.kind === "cell" ? `cell:${p.lat},${p.lon}` : `box:${p.bbox.join(",")}`;
  const parts = [["v", s.variableId], ["place", place], ["from", s.start], ["to", s.end], ["view", s.view]]
    .filter((kv): kv is [string, string] => kv[1] !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%3A/g, ":").replace(/%2C/g, ",")}`);
  return parts.length ? `#explore?${parts.join("&")}` : "#explore";
}

/** Hash for a state; always starts with "#explore". Values go through the parser rules, so a link never carries junk. */
export const exploreHash = (s: ExploreState): string => format(parseExplore(format(s))!);

/** Full link to this view of the current site. */
export function shareUrl(s: ExploreState): string {
  if (typeof location === "undefined") return exploreHash(s);   // server-side render (tests): no page address yet
  return `${location.origin}${location.pathname}${location.search}${exploreHash(s)}`;
}

/** Link place from an app place ref: presets by id, countries by name, one 0.5° cell as "cell", any other box as "box". */
export function linkPlace(ref: RegionRef): ExploreState["place"] {
  if (ref.type === "preset") return { kind: "region", id: ref.id };
  if (ref.type === "country") return { kind: "country", name: ref.id };
  const [w, s, e, n] = ref.bbox;
  return e - w === CELL && n - s === CELL ? { kind: "cell", lat: s + CELL / 2, lon: w + CELL / 2 } : { kind: "box", bbox: [w, s, e, n] };
}
