// Typed client for the Terra-scope backend (FRONTEND_BACKEND_CONTRACT v0.2.1).
// Rule R13: when the backend fails we surface the error; we never substitute made-up data.

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "") + "/api/v1";

export type BBox = [number, number, number, number];
export type RegionRef =
  | { type: "preset"; id: string }
  | { type: "bbox"; bbox: BBox };

export interface DataSource { product: string; version: string; provider: string; url: string; citation?: string }
export interface Quality { n_months: number; missing_months: number; coverage_fraction: number; sufficient: boolean }

export interface Variable {
  id: string; parameter: string; parameter_name: string; dataset_name: string; name: string; category: string;
  description_simple: string; description_technical: string; units: string; display_units: string;
  spatial_resolution_deg: number; native_resolution_deg: number;
  coverage: { start: string; end: string } | null; extent: BBox | null; available: boolean; source: DataSource;
}
export interface Region { id: string; name: string; bbox: BBox; is_demo: boolean }
export interface RegionsResponse { regions: Region[]; limits: { max_bbox_area_deg2: number; min_cells: number; cell_size_deg: number } }

export interface RegionOut { type: string; id?: string | null; name?: string | null; bbox: BBox }
export interface SeriesPoint { t: string; value: number | null; anomaly: number | null; valid_fraction: number }
export interface SeriesResponse {
  variable_id: string; region: RegionOut; units: string; points: SeriesPoint[]; climatology: (number | null)[];
  quality: Quality; source: DataSource; warnings: string[];
}
export interface TrendResponse {
  trend_id: string; variable_id: string; region: RegionOut; start: string; end: string; units: string;
  slope_per_decade: number | null; slope_ci: [number, number] | null; ci_method: string;
  p_value: number | null; p_value_autocorr_adjusted: number | null; significant: boolean | null;
  direction: "increasing" | "decreasing" | "no_trend"; n: number;
  trend_line: { t: string; value: number }[]; quality: Quality; plain_summary: string; source: DataSource; warnings: string[];
}
export interface GridCell { lon: number; lat: number; slope_per_decade: number | null; q_value: number | null; significant_fdr: boolean | null; valid: boolean }
export interface TrendGrid { variable_id: string; units: string; start: string; end: string; cell_size_deg: number; value_range: { min_slope: number; max_slope: number }; cells: GridCell[]; warnings: string[] }
export interface ValueCell { lon: number; lat: number; value: number | null; valid_fraction: number }
export interface ValueGrid { variable_id: string; units: string; cell_size_deg: number; value_range: { min: number; max: number; p02: number; p98: number }; cells: ValueCell[]; warnings: string[] }
export interface CompareResponse {
  compare_id: string; a: TrendResponse; b: TrendResponse;
  difference: { slope_diff_per_decade: number | null; ci: [number, number] | null; p_value: number | null; significant: boolean; stable_halves: boolean | null; test: string };
  is_contradiction: boolean; verdict: "opposite_significant" | "opposite_not_significant" | "same_direction" | "insufficient_data";
  plain_summary: string; warnings: string[];
}
export interface ExplainResponse {
  answer: string; cited_numbers: { label: string; value: number; units: string; source_field: string }[];
  actions: { type: string; params: Record<string, unknown> }[]; disclaimer: string; model: string; warnings: string[];
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status?: number, public retryable = false) { super(message); }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 45000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      ...init, signal: init?.signal ?? ctrl.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const e = body?.error;
      throw new ApiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? `HTTP ${res.status}`, res.status, !!e?.retryable);
    }
    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error).name === "AbortError") throw new ApiError("NETWORK_ERROR", "The server took too long to answer.", undefined, true);
    throw new ApiError("NETWORK_ERROR", "Cannot reach the Terra-scope server. Is the backend running?", undefined, true);
  } finally {
    clearTimeout(timer);
  }
}

const post = <T,>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });
const qs = (o: Record<string, string | number | undefined>) =>
  "?" + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const api = {
  variables: () => call<{ variables: Variable[] }>("/variables").then((r) => r.variables),
  regions: () => call<RegionsResponse>("/regions"),
  series: (variable_id: string, region: RegionRef, start: string, end: string) =>
    post<SeriesResponse>("/series", { variable_id, region, start, end }),
  trends: (variable_id: string, region: RegionRef, start: string, end: string) =>
    post<TrendResponse>("/trends", { variable_id, region, start, end, method: "seasonal_mk", alpha: 0.05 }),
  trendGrid: (variable_id: string, start: string, end: string) =>
    call<TrendGrid>("/trends/grid" + qs({ variable_id, start, end }), undefined, 90000),
  valueGrid: (variable_id: string, start: string, end: string, month?: number) =>
    call<ValueGrid>("/values/grid" + qs({ variable_id, start, end, month }), undefined, 90000),
  compare: (variable_id: string, region_a: RegionRef, region_b: RegionRef, start: string, end: string) =>
    post<CompareResponse>("/compare", { variable_id, region_a, region_b, start, end, method: "seasonal_mk", alpha: 0.05 }),
  explain: (question: string, context: Record<string, unknown>) => post<ExplainResponse>("/explain", { question, context }),
};

// Friendly copy for each error code (contract §4.11).
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong.";
  const map: Record<string, string> = {
    NO_DATA: "No data for this place and period. Land-only datasets have no values over the sea.",
    REGION_TOO_SMALL: "This area is smaller than one grid cell. Pick a larger area.",
    REGION_TOO_LARGE: "This area is too large.",
    DATA_NOT_READY: "This dataset is not on the server yet.",
    INVALID_TIME_RANGE: "The start year must be before the end year, inside 2001 to 2024.",
    NETWORK_ERROR: e.message,
  };
  return map[e.code] ?? e.message;
}
