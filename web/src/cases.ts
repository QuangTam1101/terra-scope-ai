// Phase 8.5D4: Save & Reproduce Case. A case stores the parameters needed to recompute every analysis (never API
// keys or environment values) plus the results seen when it was saved, so a reopened case can be checked against a
// fresh recomputation. Saved in this browser only (localStorage); there is no cloud storage.
import type { BBox, RegionRef } from "./api";

export const CASE_SCHEMA = "terra-scope-case/1";
export const CASES_KEY = "terra-scope:cases:v1";
const MAX_CASES = 20;

export interface CaseTrend {
  kind: "trend"; variable_id: string; region: RegionRef; place_label: string; bbox: BBox; start: string; end: string;
  method: "seasonal_mk"; alpha: number;
  /** What the backend answered when saved (evidence reference; recomputed on reopen). */
  saved_result?: { trend_id: string; slope_per_decade: number | null; p_value: number | null; significant: boolean | null; units: string; product: string; version: string };
}
export interface CaseCompare {
  kind: "compare"; variable_id: string; region_a: RegionRef; region_b: RegionRef; label_a: string; label_b: string;
  start: string; end: string; method: "seasonal_mk"; alpha: number;
  saved_result?: { compare_id: string; verdict: string; slope_diff_per_decade: number | null; p_value: number | null };
}
export type CaseItem = CaseTrend | CaseCompare;
export interface SavedCase { schema: typeof CASE_SCHEMA; id: string; title: string; created_at: string; backend_version: string; items: CaseItem[] }

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const store = (): Storage | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const isBBox = (b: unknown): b is BBox => Array.isArray(b) && b.length === 4 && b.every((x) => typeof x === "number" && Number.isFinite(x))
  && b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90 && b[0] < b[2] && b[1] < b[3];
const isRegion = (r: unknown): r is RegionRef => !!r && typeof r === "object" &&
  (((r as RegionRef).type === "preset" && typeof (r as { id?: unknown }).id === "string" && /^[a-z0-9_]{1,40}$/.test((r as { id: string }).id))
    || ((r as RegionRef).type === "bbox" && isBBox((r as { bbox?: unknown }).bbox)));
const isId = (x: unknown) => typeof x === "string" && /^[a-z0-9_]{1,60}$/.test(x);
const okPeriod = (s: unknown, e: unknown) => typeof s === "string" && typeof e === "string" && MONTH.test(s) && MONTH.test(e) && s <= e;
const text = (x: unknown, n = 120) => (typeof x === "string" ? x.slice(0, n) : "");

/** Validate untrusted JSON (a file or a link). Returns a clean case or null; unknown fields are dropped. */
export function parseCase(raw: unknown): SavedCase | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.schema !== CASE_SCHEMA || !Array.isArray(c.items) || c.items.length === 0 || c.items.length > 12) return null;
  const items: CaseItem[] = [];
  for (const it of c.items as Record<string, unknown>[]) {
    if (!it || typeof it !== "object" || !isId(it.variable_id) || !okPeriod(it.start, it.end)) return null;
    const alpha = typeof it.alpha === "number" && it.alpha > 0 && it.alpha < 0.5 ? it.alpha : 0.05;
    if (it.kind === "trend" && isRegion(it.region) && isBBox(it.bbox)) {
      items.push({ kind: "trend", variable_id: it.variable_id as string, region: it.region, place_label: text(it.place_label) || "Saved place",
        bbox: it.bbox, start: it.start as string, end: it.end as string, method: "seasonal_mk", alpha,
        saved_result: it.saved_result as CaseTrend["saved_result"] });
    } else if (it.kind === "compare" && isRegion(it.region_a) && isRegion(it.region_b)) {
      items.push({ kind: "compare", variable_id: it.variable_id as string, region_a: it.region_a, region_b: it.region_b,
        label_a: text(it.label_a) || "A", label_b: text(it.label_b) || "B", start: it.start as string, end: it.end as string,
        method: "seasonal_mk", alpha, saved_result: it.saved_result as CaseCompare["saved_result"] });
    } else return null;
  }
  return { schema: CASE_SCHEMA, id: text(c.id, 40) || "case", title: text(c.title) || "Saved case", created_at: text(c.created_at, 40),
    backend_version: text(c.backend_version, 20), items };
}

/** Link-safe encoding (base64url of JSON) for "#report?case=..." links. Parameters only, no results. */
export function encodeCaseParam(c: SavedCase): string {
  const slim = { ...c, items: c.items.map(({ saved_result: _drop, ...rest }) => rest) };
  const bytes = new TextEncoder().encode(JSON.stringify(slim));
  let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeCaseParam(s: string): SavedCase | null {
  try {
    if (s.length > 8000) return null;
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    return parseCase(JSON.parse(json));
  } catch { return null; }
}
export const caseFromHash = (hash: string) => { const m = hash.match(/[?&]case=([A-Za-z0-9_-]+)/); return m ? decodeCaseParam(m[1]) : null; };

export function listCases(s: Storage | null = store()): SavedCase[] {
  try {
    const raw = JSON.parse(s?.getItem(CASES_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.map(parseCase).filter((c): c is SavedCase => c !== null) : [];
  } catch { return []; }
}
export function saveCase(c: SavedCase, s: Storage | null = store()): boolean {
  try {
    const all = [c, ...listCases(s).filter((x) => x.id !== c.id)].slice(0, MAX_CASES);
    s?.setItem(CASES_KEY, JSON.stringify(all));
    return !!s;
  } catch { return false; }
}
export function deleteCase(id: string, s: Storage | null = store()): void {
  try { s?.setItem(CASES_KEY, JSON.stringify(listCases(s).filter((x) => x.id !== id))); } catch { /* storage blocked */ }
}
