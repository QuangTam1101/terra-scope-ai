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
  p_value: number | null; p_value_autocorr_adjusted: number | null; significant: boolean | null; alpha?: number;
  direction: "increasing" | "decreasing" | "no_trend"; n: number;
  trend_line: { t: string; value: number }[]; quality: Quality; plain_summary: string; source: DataSource; warnings: string[];
}
/** POST /trends/sensitivity: the /trends test re-run for each January start year with >= 10 years to `end`, shortest record first. */
export interface SensitivityPoint { start: string; end: string; years: number; slope_per_decade: number | null; p_value: number | null; significant: boolean | null }
export interface SensitivityResponse {
  variable_id: string; units: string; alpha: number;
  points: SensitivityPoint[];
  years_needed: { estimate: number | null; basis: string; caveat: string };   // extra years of data; null when already significant or not estimable
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
export interface HuntTile { bbox: BBox; n_valid: number; share_up: number; share_down: number; mean_slope: number }
export interface HuntRegional { trend_id: string; slope_per_decade: number | null; p_value: number | null; significant: boolean | null; quality: Quality; start: string; end: string; units: string; region: RegionOut; source: DataSource }
export interface HuntCandidate {
  rank: number; type: "opposite_direction" | "dataset_disagreement"; a: HuntTile; b: HuntTile; reasons: string[];
  metrics: { weaker_share: number; slope_gap: number; distance_deg?: number };
  classification: "statistical_evidence" | "inconclusive" | "descriptive" | "unsupported"; classification_text: string;
  test: { compare_id: string; verdict: CompareResponse["verdict"]; difference: CompareResponse["difference"] } | null;
  regional: { a: HuntRegional; b: HuntRegional } | null;
}
export interface HuntResponse {
  mode: "regions" | "datasets"; variable_id: string; variable_id_b: string | null; start: string; end: string; extent: BBox;
  criteria: { tile_deg: number; dominant_share: number; min_valid_cells: number; ranking: string[] };
  tiles_scanned: number; candidates: HuntCandidate[]; compatibility: string | null; runtime_ms: number;
  limits: { max_tiles: number; max_candidates: number; max_retests: number }; warnings: string[];
}
export interface FramesResponse {
  variable_id: string; units: string; kind: "value" | "anomaly"; start: string; end: string; times: string[];
  grid: { west: number; south: number; cell_deg: number; nlon: number; nlat: number };
  scale: number; offset: number; missing: number; display_range: [number, number]; coarsen_factor: number; data_b64: string; note: string;
}
export interface ExplainResponse {
  answer: string; cited_numbers: { label: string; value: number; units: string; source_field: string }[];
  actions: { type: string; params: Record<string, unknown> }[]; disclaimer: string; model: string; warnings: string[];
}

export interface ChatContext {
  variable_id?: string; dataset_id?: string; region?: RegionRef; start?: string; end?: string; trend_id?: string;
  region_b?: RegionRef; intent?: "trend" | "compare" | "series" | "provenance" | "advisor";
  parameter?: string;
}
export interface ChatHistoryTurn { role: "user" | "assistant"; content: string }
export interface ChatRequest { message: string; context: ChatContext; history: ChatHistoryTurn[]; use_tools?: boolean; audience_mode?: "explorer" | "scientist" }
export interface ChatWarning {
  code: "TEMPLATE_MODE" | "ANALYSIS_WARNING" | "CONTEXT_REQUIRED" | "UNSUPPORTED_QUESTION" | "LLM_FALLBACK";
  message: string;
}
export interface ChatAction {
  type: "navigate"; page: "explore" | "hunt" | "report"; label: string;
  params: { variable_id: string; region: RegionRef; region_b?: RegionRef | null; start: string; end: string };
}
export interface ChatEvidence {
  scientific_advice?: MethodAdvice | null;
  trend: TrendResponse & {
    method: string; slope_method: string; ci_level: number; alpha: number; autocorrelation_adjusted: boolean;
  };
  cited_numbers: ExplainResponse["cited_numbers"];
}
export interface ChatResponse {
  answer: string; mode: "template" | "llm"; evidence: ChatEvidence[]; warnings: ChatWarning[];
  actions: ChatAction[]; disclaimer: string; analysis_id?: string;
  tool_results?: ChatToolResult[]; resolved_context?: ChatContext | null; clarification?: string | null;
  suggested_questions?: string[];
}
export interface ChatToolResult {
  tool: string; ok: boolean;
  data: SeriesResponse | TrendResponse | CompareResponse | { variable: Variable; processing_notes: string[] }
    | { variables: Variable[] } | { catalog: RegionsResponse; supported_selection_types: string[] } | MethodAdvice | null;
  warnings: { code: string; message: string }[]; provenance: DataSource[];
  error: { category: string; message: string; retryable: boolean } | null;
}

export interface ScientificRule { rule_id: string; explanation: string; evidence_references: string[] }
export interface MethodGuidance extends ScientificRule { method: string; status: "applied" | "recommended" | "available_not_applied" | "requires_review" | "unsupported" }
export interface MethodAdvice {
  analysis_id: string; applied_methods: MethodGuidance[]; recommended_methods: MethodGuidance[];
  available_methods: MethodGuidance[]; unsupported_methods: MethodGuidance[];
  assumptions: ScientificRule[]; warnings: ScientificRule[]; explanations: ScientificRule[];
  recommendation_status: string; evidence_references: string[];
  trust_assessment?: { status: "supported" | "limited" | "requires_review" | "not_assessed";
    decision_basis: string; estimated_direction: string; magnitude: number | null; units: string;
    statistical_evidence: string; limitations: ScientificRule[]; cannot_conclude: string[]; missing_metadata: string[] } | null;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status?: number, public retryable = false) { super(message); }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 45000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // A caller's signal (user cancel / newer request) and the timeout both abort the same fetch.
  init?.signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(BASE + path, {
      ...init, signal: ctrl.signal,
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
    if ((err as Error).name === "AbortError") {
      if (init?.signal?.aborted) throw new ApiError("CANCELLED", "Cancelled.", undefined, false);
      throw new ApiError("NETWORK_ERROR", "The server took too long to answer.", undefined, true);
    }
    throw new ApiError("NETWORK_ERROR", "Cannot reach the Terra-scope server. Is the backend running?", undefined, true);
  } finally {
    clearTimeout(timer);
  }
}

const post = <T,>(path: string, body: unknown, signal?: AbortSignal) => call<T>(path, { method: "POST", body: JSON.stringify(body), signal });
const qs = (o: Record<string, string | number | undefined>) =>
  "?" + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const api = {
  health: () => call<{ status: string; version: string; available_variables: string[] }>("/health"),
  llmStatus: () => call<{ provider: string; model: string; configured: boolean }>("/llm/status"),
  variables: () => call<{ variables: Variable[] }>("/variables").then((r) => r.variables),
  regions: () => call<RegionsResponse>("/regions"),
  series: (variable_id: string, region: RegionRef, start: string, end: string, signal?: AbortSignal) =>
    post<SeriesResponse>("/series", { variable_id, region, start, end }, signal),
  trends: (variable_id: string, region: RegionRef, start: string, end: string, signal?: AbortSignal) =>
    post<TrendResponse>("/trends", { variable_id, region, start, end, method: "seasonal_mk", alpha: 0.05 }, signal),
  sensitivity: (variable_id: string, region: RegionRef, start: string, end: string, signal?: AbortSignal) =>
    post<SensitivityResponse>("/trends/sensitivity", { variable_id, region, start, end, method: "seasonal_mk", alpha: 0.05 }, signal),
  trendGrid: (variable_id: string, start: string, end: string, signal?: AbortSignal) =>
    call<TrendGrid>("/trends/grid" + qs({ variable_id, start, end }), signal ? { signal } : undefined, 90000),
  valueGrid: (variable_id: string, start: string, end: string, month?: number, signal?: AbortSignal) =>
    call<ValueGrid>("/values/grid" + qs({ variable_id, start, end, month }), signal ? { signal } : undefined, 90000),
  /** Time-lapse frames (display only): one grid per month, value or anomaly. */
  valueFrames: (variable_id: string, start: string, end: string, kind: "value" | "anomaly", bbox?: BBox | null, signal?: AbortSignal) =>
    call<FramesResponse>("/values/frames" + qs({ variable_id, start, end, kind, bbox: bbox ? bbox.join(",") : undefined }), signal ? { signal } : undefined, 120000),
  /** Is a map already computed? Cheap, no computation on the server. */
  gridStatus: (kind: "trend" | "values", variable_id: string, start: string, end: string, month?: number) =>
    call<{ kind: string; cached: boolean; available: boolean; cell_size_deg: number | null }>("/grids/status" + qs({ kind, variable_id, start, end, month }), undefined, 8000),
  compare: (variable_id: string, region_a: RegionRef, region_b: RegionRef, start: string, end: string, signal?: AbortSignal) =>
    post<CompareResponse>("/compare", { variable_id, region_a, region_b, start, end, method: "seasonal_mk", alpha: 0.05 }, signal),
  explain: (question: string, context: Record<string, unknown>) => post<ExplainResponse>("/explain", { question, context }),
  chat: (request: ChatRequest) => post<ChatResponse>("/chat", request),
  discover: (body: { variable_id: string; variable_id_b?: string | null; start: string; end: string; extent: BBox; tile_deg: number; max_candidates: number }, signal?: AbortSignal) =>
    call<HuntResponse>("/hunt/discover", { method: "POST", body: JSON.stringify(body), signal }, 180000),
};

// Friendly copy for each error code (contract §4.11).
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong.";
  const map: Record<string, string> = {
    NO_DATA: "No data for this place and period. Land-only datasets have no values over the sea.",
    REGION_TOO_SMALL: "This area is smaller than one grid cell. Pick a larger area.",
    REGION_TOO_LARGE: "This area is too large.",
    DATA_NOT_READY: "This dataset is not on the server yet.",
    INVALID_TIME_RANGE: e.message || "The start year must be before the end year, inside the years the dataset covers.",
    NETWORK_ERROR: e.message,
    CANCELLED: "Analysis cancelled.",
    INCOMPATIBLE_DATASETS: e.message,
    RESOURCE_LIMIT: e.message,
  };
  return map[e.code] ?? e.message;
}

// ---------- AI forecast ----------
export type Confidence = "high" | "moderate" | "low" | "none";
export type Mode = "outlook" | "satellite";
export interface ForecastPoint {
  t: string; lead_months: number; forecast: number | null; lower: number | null; upper: number | null; climatology: number | null;
  z_forecast: number | null; p_below: number; p_near: number; p_above: number; normal_range: [number | null, number | null];
  signal: "above" | "below" | "none"; confidence: Confidence;
}
export interface SkillRow { lead_months: number; skill_vs_climatology: number | null; skill_vs_persistence: number | null; rpss: number | null; tercile_accuracy: number | null; coverage_80: number | null }
export interface Analog { origin: string; target: string; distance: number; z_outcome: number; state: Record<string, number> }
export interface Condition { key: string; label: string; value: number; unit: string; as_of: string; phase: string; description: string }
export interface Contribution { group: string; description: string; effect_p_above: number; effect_p_below: number; effect_z: number }
export interface Explanation { month: string; headline: string; simple: string[]; contributions: Contribution[]; conditions: Condition[]; scientific: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
export interface DataStatus { today: string; satellite_data_end: string; indices_end: Record<string, string>; origin: string; mode: string; note: string }
export interface ForecastResponse {
  variable_id: string; region: RegionOut; units: string; mode: Mode; origin: string; interval: number; points: ForecastPoint[];
  backtest: SkillRow[]; drivers: Record<string, number>; analogs: Analog[]; analog_horizon: number; data_inputs: string[];
  data_status: DataStatus; explanation: Explanation; method: string; plain_summary: string; source: DataSource; warnings: string[];
}
export interface ForecastMapCell { lat: number; lon: number; z_forecast: number; signal: "above" | "below" | "none"; p_below: number; p_above: number }
export interface ForecastMap { variable_id: string; mode: Mode; origin: string; t: string; lead_months: number; interval: number; cells: ForecastMapCell[]; warnings: string[] }
export interface RealityRegion {
  months: string[]; actual: (number | null)[]; forecast: number[]; lower: number[]; upper: number[]; persistence: number; baseline_period: string;
  mae_model: number; mae_climatology: number; mae_persistence: number; coverage_80: number; n_months: number;
}
export interface RealityCheck { source: string; origin: string; generated: string; regions: Record<string, Record<string, RealityRegion>> }

export const forecastApi = {
  forecast: (variable_id: string, region: RegionRef, mode: Mode, months: number) =>
    call<ForecastResponse>("/forecast", { method: "POST", body: JSON.stringify({ variable_id, region, mode, months }) }, 120000),
  map: (variable_id: string, mode: Mode, month: string) =>
    call<ForecastMap>(`/forecast/map?variable_id=${encodeURIComponent(variable_id)}&mode=${mode}&month=${month}`, undefined, 120000),
  status: (variable_id: string, mode: Mode) => call<DataStatus>(`/forecast/status?variable_id=${encodeURIComponent(variable_id)}&mode=${mode}`),
  reality: () => call<RealityCheck>("/forecast/reality-check"),
};
