// Contradiction Hunter 3.0: saved investigations. Stored ONLY in this browser (localStorage), never in the cloud.
// A record keeps the parameters needed to recompute both sides and the results seen when it was saved; reopening
// always recomputes from the backend. User-written title and notes are kept as plain text and are never evidence.
import type { BBox, RegionRef } from "../api";
import type { Category, EvidenceStatus, HuntMode, Validity } from "./logic";

export const INVESTIGATIONS_KEY = "terra-scope:investigations:v1";
export const INVESTIGATION_SCHEMA = "terra-scope-investigation/1";
const MAX = 30;

export interface SideConfig { variable_id: string; region: RegionRef; label: string; start: string; end: string }
export interface SideEvidence { trend_id: string; slope_per_decade: number | null; p_value: number | null; significant: boolean | null; n_months: number; coverage_fraction: number; product: string; version: string; units: string }
export interface Investigation {
  schema: typeof INVESTIGATION_SCHEMA; id: string; title: string; notes: string; created_at: string; backend_version: string;
  mode: HuntMode; a: SideConfig; b: SideConfig;
  evidence: { a: SideEvidence; b: SideEvidence; compare: { compare_id: string; verdict: string; slope_diff_per_decade: number | null; p_value: number | null; ci: [number, number] | null } | null };
  categories: Category[]; status: EvidenceStatus; validity: Validity; limitations: string[]; flagged_reason: string | null;
  method: string;
}

type Store = Pick<Storage, "getItem" | "setItem">;
const local = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const isBBox = (b: unknown): b is BBox => Array.isArray(b) && b.length === 4 && b.every((x) => typeof x === "number" && Number.isFinite(x))
  && b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90 && b[0] < b[2] && b[1] < b[3];
const isRegion = (r: unknown): r is RegionRef => !!r && typeof r === "object" && (
  ((r as { type?: unknown }).type === "preset" && typeof (r as { id?: unknown }).id === "string" && /^[a-z0-9_]{1,40}$/.test((r as { id: string }).id))
  || ((r as { type?: unknown }).type === "bbox" && isBBox((r as { bbox?: unknown }).bbox)));
const txt = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : "");
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const MODES: HuntMode[] = ["regions", "datasets", "periods"];

function side(x: unknown): SideConfig | null {
  const s = x as Record<string, unknown> | null;
  if (!s || typeof s.variable_id !== "string" || !/^[a-z0-9_]{1,60}$/.test(s.variable_id) || !isRegion(s.region)) return null;
  if (typeof s.start !== "string" || typeof s.end !== "string" || !MONTH.test(s.start) || !MONTH.test(s.end) || s.start > s.end) return null;
  return { variable_id: s.variable_id, region: s.region, label: txt(s.label, 120), start: s.start, end: s.end };
}
function ev(x: unknown): SideEvidence {
  const e = (x ?? {}) as Record<string, unknown>;
  return { trend_id: txt(e.trend_id, 60), slope_per_decade: num(e.slope_per_decade), p_value: num(e.p_value), significant: typeof e.significant === "boolean" ? e.significant : null,
    n_months: num(e.n_months) ?? 0, coverage_fraction: num(e.coverage_fraction) ?? 0, product: txt(e.product, 60), version: txt(e.version, 20), units: txt(e.units, 20) };
}

/** Validate untrusted JSON. Unknown fields are dropped; returns null when the configuration cannot be recomputed. */
export function parseInvestigation(raw: unknown): Investigation | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || r.schema !== INVESTIGATION_SCHEMA || !MODES.includes(r.mode as HuntMode)) return null;
  const a = side(r.a), b = side(r.b);
  if (!a || !b) return null;
  const e = (r.evidence ?? {}) as Record<string, unknown>, c = e.compare as Record<string, unknown> | null | undefined;
  const ci = Array.isArray(c?.ci) && c!.ci.length === 2 && c!.ci.every((v) => typeof v === "number") ? (c!.ci as [number, number]) : null;
  return {
    schema: INVESTIGATION_SCHEMA, id: txt(r.id, 60) || `inv-${Date.now().toString(36)}`, title: txt(r.title, 120) || "Investigation", notes: txt(r.notes, 2000),
    created_at: txt(r.created_at, 40), backend_version: txt(r.backend_version, 20), mode: r.mode as HuntMode, a, b,
    evidence: { a: ev(e.a), b: ev(e.b), compare: c ? { compare_id: txt(c.compare_id, 60), verdict: txt(c.verdict, 40), slope_diff_per_decade: num(c.slope_diff_per_decade), p_value: num(c.p_value), ci } : null },
    categories: Array.isArray(r.categories) ? (r.categories.filter((x) => typeof x === "string").slice(0, 6) as Category[]) : [],
    status: txt(r.status, 40) as EvidenceStatus, validity: txt(r.validity, 40) as Validity,
    limitations: Array.isArray(r.limitations) ? r.limitations.filter((x) => typeof x === "string").map((x) => (x as string).slice(0, 400)).slice(0, 12) : [],
    flagged_reason: r.flagged_reason ? txt(r.flagged_reason, 400) : null, method: txt(r.method, 200),
  };
}

export function listInvestigations(s: Store | null = local()): Investigation[] {
  try { const raw = JSON.parse(s?.getItem(INVESTIGATIONS_KEY) ?? "[]"); return Array.isArray(raw) ? raw.map(parseInvestigation).filter((x): x is Investigation => !!x) : []; }
  catch { return []; }
}
/** Saves (or replaces by id). Returns false when this browser blocks storage. */
export function saveInvestigation(inv: Investigation, s: Store | null = local()): boolean {
  if (!s) return false;
  try { s.setItem(INVESTIGATIONS_KEY, JSON.stringify([inv, ...listInvestigations(s).filter((x) => x.id !== inv.id)].slice(0, MAX))); return true; }
  catch { return false; }
}
export function deleteInvestigation(id: string, s: Store | null = local()): void {
  try { s?.setItem(INVESTIGATIONS_KEY, JSON.stringify(listInvestigations(s).filter((x) => x.id !== id))); } catch { /* storage blocked */ }
}
