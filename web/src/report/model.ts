// Phase 8.5B: the Scientific Evidence Report as data. Every sentence and number comes from backend responses
// (trend, series, compare); nothing is estimated here. Pure functions, so exports can be tested offline.
import type { CompareResponse, SeriesResponse, TrendResponse, Variable } from "../api";

export interface ReportRun {
  key: string; trend: TrendResponse & { method?: string; slope_method?: string; alpha?: number; ci_level?: number };
  series: SeriesResponse; variable: Variable; place: { label: string; bbox: [number, number, number, number]; ref: { type: string; id?: string } };
}
export interface ReportComparison {
  key: string; kind: "regions" | "datasets"; title: string;
  a: { label: string; dataset: string; trend: TrendResponse; series: SeriesResponse };
  b: { label: string; dataset: string; trend: TrendResponse; series: SeriesResponse };
  units: string; variableName: string;
  /** Backend difference test (regions only). Datasets have no approved test: descriptive only. */
  test: CompareResponse | null;
}

export interface AnalysisEntry {
  key: string; trendId: string; place: string; regionKind: string; regionId: string | null; bbox: [number, number, number, number];
  parameter: string; dataset: string; variableId: string; units: string;
  product: string; version: string; provider: string; url: string;
  start: string; end: string; nMonths: number; missingMonths: number; coveragePct: number; sufficient: boolean;
  slope: number | null; olsInterval: [number, number] | null; pRaw: number | null; pAdjusted: number | null;
  alpha: number; significant: boolean | null; verdict: string; method: string; slopeMethod: string; ciMethod: string;
  gridDeg: number; nativeDeg: number; finding: string; warnings: string[];
  series: SeriesResponse; trend: TrendResponse;
}
export interface ComparisonEntry extends ReportComparison {
  agrees: string[]; disagrees: string[]; strength: string; cannotConclude: string[];
}
export interface ReportModel {
  id: string; generatedAt: string; backendVersion: string;
  analyses: AnalysisEntry[]; comparisons: ComparisonEntry[];
  datasets: { product: string; version: string; provider: string; url: string; nativeDeg: number; gridDeg: number }[];
  limitations: string[];
}

export const LIMITATIONS = [
  "A trend shows what changed, not why it changed. Possible causes are hypotheses, not conclusions.",
  "Trend lines are estimated past trends, not forecasts.",
  "The raw Seasonal Mann-Kendall test assumes independent years; monthly climate series are often autocorrelated, so raw p-values can be optimistic. The autocorrelation-adjusted p-value is a separate diagnostic.",
  "The 95% interval shown is for the OLS slope of the anomalies, a different estimator from Sen's slope; it is not a Sen-slope confidence interval and has no HAC adjustment.",
  "Map significance uses Benjamini-Hochberg FDR across cells on raw cell p-values without serial-dependence correction.",
  "Regions are analysed as latitude-longitude boxes on the processed grid; country and drawn areas are bounding-box approximations.",
  "GLDAS is a land-surface model and MERRA-2 a reanalysis: neither is a direct local measurement, and products can disagree.",
  "All results are preliminary and have not been peer reviewed.",
];

export const num = (x: number | null | undefined, digits = 2) =>
  x === null || x === undefined || !Number.isFinite(x) ? "n/a" : (Math.abs(x) >= 100 ? x.toFixed(1) : Math.abs(x) >= 1 ? x.toFixed(digits) : x.toPrecision(3));
export const signedNum = (x: number | null | undefined, digits = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "n/a" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${num(Math.abs(x), digits)}`);
export const pText = (p: number | null | undefined) => (p === null || p === undefined ? "n/a" : p < 0.001 ? "< 0.001" : p.toFixed(3));

/** Small stable hash (FNV-1a) so the same evidence always gives the same report id. */
export function hashId(parts: string[]): string {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return "TS-" + h.toString(36).toUpperCase().padStart(7, "0");
}

export function verdictText(t: Pick<TrendResponse, "quality" | "significant">): string {
  if (!t.quality.sufficient || t.significant === null) return "Insufficient evidence";
  return t.significant ? "Significant trend" : "Not proven yet";
}

/** One plain sentence built only from the numbers. A positive slope is never called significant by itself. */
export function findingSentence(e: Pick<AnalysisEntry, "parameter" | "place" | "dataset" | "units" | "start" | "end" | "slope" | "pRaw" | "alpha" | "significant" | "sufficient">): string {
  if (!e.sufficient || e.slope === null) return `${e.parameter} in ${e.place} (${e.dataset}, ${e.start} to ${e.end}): not enough data to test a trend (at least 10 years and 70% of months are needed).`;
  const dir = e.slope > 0 ? "an increase" : e.slope < 0 ? "a decrease" : "no change";
  const head = `${e.parameter} in ${e.place} (${e.dataset}, ${e.start} to ${e.end}): the estimated Sen slope is ${signedNum(e.slope)} ${e.units} per decade (${dir}).`;
  const sig = e.significant
    ? ` The raw Seasonal Mann-Kendall p-value is ${pText(e.pRaw)}, below α = ${e.alpha}, so the trend is statistically significant under this test.`
    : ` The raw Seasonal Mann-Kendall p-value is ${pText(e.pRaw)}, not below α = ${e.alpha}, so the trend is not statistically significant; the change could be natural variability, and a longer record may help.`;
  return head + sig;
}

function analysis(r: ReportRun): AnalysisEntry {
  const t = r.trend, v = r.variable, q = t.quality;
  const e: AnalysisEntry = {
    key: r.key, trendId: t.trend_id, place: r.place.label, regionKind: t.region.type, regionId: t.region.id ?? null,
    bbox: t.region.bbox, parameter: v.parameter_name, dataset: v.dataset_name, variableId: v.id, units: v.display_units,
    product: t.source.product, version: t.source.version, provider: t.source.provider, url: t.source.url,
    start: t.start, end: t.end, nMonths: q.n_months, missingMonths: q.missing_months,
    coveragePct: Math.round(q.coverage_fraction * 100), sufficient: q.sufficient,
    slope: t.slope_per_decade, olsInterval: t.slope_ci, pRaw: t.p_value, pAdjusted: t.p_value_autocorr_adjusted,
    alpha: t.alpha ?? 0.05, significant: t.significant, verdict: verdictText(t),
    method: t.method ?? "seasonal_mk", slopeMethod: t.slope_method ?? "sen_seasonal", ciMethod: t.ci_method,
    gridDeg: v.spatial_resolution_deg, nativeDeg: v.native_resolution_deg, finding: "", warnings: t.warnings,
    series: r.series, trend: t,
  };
  e.finding = findingSentence(e);
  return e;
}

function judge(c: ReportComparison): ComparisonEntry {
  const a = c.a.trend, b = c.b.trend, agrees: string[] = [], disagrees: string[] = [], cannot: string[] = [];
  const sa = a.slope_per_decade, sb = b.slope_per_decade;
  if (sa !== null && sb !== null) {
    if (sa * sb > 0) agrees.push("Both estimated trends point in the same direction.");
    else if (sa * sb < 0) disagrees.push("The estimated trends point in opposite directions.");
    disagrees.push(`The estimated rates differ by ${signedNum(sa - sb)} ${c.units} per decade (A minus B).`);
  }
  const la = verdictText(a), lb = verdictText(b);
  if (la === lb) agrees.push(`Both are classified "${la}".`);
  else {
    disagrees.push(`A is classified "${la}" and B "${lb}".`);
    cannot.push("A significant result in one place and a non-significant one in the other does not by itself show that the two trends differ.");
  }
  let strength: string;
  if (c.kind === "regions" && c.test) {
    const d = c.test.difference;
    const iv = d.ci ? `${num(d.ci[0])} to ${num(d.ci[1])} ${c.units} per decade` : "not available";
    const crossesZero = !!d.ci && d.ci[0] <= 0 && d.ci[1] >= 0;
    // Backend rule: significant only when p < alpha AND the 95% bootstrap interval of the difference excludes zero.
    strength = d.p_value === null
      ? "The difference between the two trends could not be tested (not enough data)."
      : d.significant
        ? `The difference between the two trends is statistically significant: p = ${pText(d.p_value)} and the 95% bootstrap interval of the difference (${iv}) excludes zero.`
        : crossesZero && d.p_value < ((a as { alpha?: number }).alpha ?? 0.05)
          ? `The difference is not confirmed: p = ${pText(d.p_value)}, but the 95% bootstrap interval of the difference (${iv}) includes zero. Both conditions are required, so the evidence for a real disagreement is inconclusive.`
          : `The difference between the two trends is not statistically significant (p = ${pText(d.p_value)}; 95% bootstrap interval ${iv}): the evidence for a real disagreement is weak.`;
  } else {
    strength = "Descriptive comparison only: no statistical test of the difference between two datasets is implemented, so this disagreement is not proven.";
    cannot.push("Neither product is assumed to be the ground truth.");
    const ca = a.quality.coverage_fraction, cb = b.quality.coverage_fraction;
    if (Math.abs(ca - cb) > 0.05)
      cannot.push(`The products cover different parts of the area (${Math.round(ca * 100)}% versus ${Math.round(cb * 100)}% of grid cells, for example land only versus land and sea), so part of the difference reflects coverage, not the trend.`);
  }
  cannot.push("Why the trends differ: possible reasons (data sources, model physics, coverage) are hypotheses to investigate, not conclusions.");
  return { ...c, agrees, disagrees, strength, cannotConclude: cannot };
}

export function buildReport(runs: ReportRun[], comparisons: ReportComparison[], generatedAt: Date, backendVersion: string): ReportModel {
  const analyses = runs.map(analysis);
  const comps = comparisons.map(judge);
  const seen = new Map<string, ReportModel["datasets"][number]>();
  for (const r of runs) {
    const s = r.trend.source;
    seen.set(`${s.product}|${s.version}`, { product: s.product, version: s.version, provider: s.provider, url: s.url,
      nativeDeg: r.variable.native_resolution_deg, gridDeg: r.variable.spatial_resolution_deg });
  }
  for (const c of comparisons) for (const side of [c.a, c.b]) {
    const s = side.trend.source;
    if (!seen.has(`${s.product}|${s.version}`)) seen.set(`${s.product}|${s.version}`, { product: s.product, version: s.version, provider: s.provider, url: s.url, nativeDeg: NaN, gridDeg: NaN });
  }
  const id = hashId([...analyses.map((a) => a.trendId), ...comps.map((c) => c.key)].sort());
  return { id, generatedAt: generatedAt.toISOString(), backendVersion, analyses, comparisons: comps, datasets: [...seen.values()], limitations: LIMITATIONS };
}

const regionText = (e: AnalysisEntry) =>
  `${e.place} (${e.regionKind === "preset" ? `preset "${e.regionId}"` : "bounding-box approximation"}; W ${e.bbox[0]}, S ${e.bbox[1]}, E ${e.bbox[2]}, N ${e.bbox[3]})`;

export function toMarkdown(m: ReportModel): string {
  const L: string[] = [
    "# Terra-scope AI: Scientific Evidence Report", "",
    `- Report ID: ${m.id}`, `- Generated: ${m.generatedAt}`, `- Backend version: ${m.backendVersion}`,
    "- Status: preliminary, not peer reviewed", "",
    "## Executive summary", "", ...m.analyses.map((a) => `- ${a.finding}`), ...m.comparisons.map((c) => `- ${c.title}: ${c.strength}`), "",
  ];
  for (const a of m.analyses) {
    L.push(`## ${a.parameter} · ${a.place}`, "",
      `| Item | Value |`, `|---|---|`,
      `| Region | ${regionText(a)} |`,
      `| Dataset | ${a.dataset}: ${a.product} v${a.version}, ${a.provider} |`,
      `| Period | ${a.start} to ${a.end} (${a.nMonths} months with data, ${a.missingMonths} missing, ${a.coveragePct}% of the area covered) |`,
      `| Grid | ${a.gridDeg}° processed grid (native ${a.nativeDeg}°) |`,
      `| Sen slope | ${signedNum(a.slope)} ${a.units} per decade (${a.slopeMethod}) |`,
      `| Raw Seasonal MK p (decision basis) | ${pText(a.pRaw)} with α = ${a.alpha} |`,
      `| Autocorrelation-adjusted p (diagnostic only) | ${pText(a.pAdjusted)} |`,
      `| OLS anomaly slope 95% interval (not a Sen interval) | ${a.olsInterval ? `${num(a.olsInterval[0])} to ${num(a.olsInterval[1])}` : "n/a"} ${a.units} per decade |`,
      `| Verdict | ${a.verdict} |`,
      `| Method | ${a.method} + ${a.slopeMethod}, interval ${a.ciMethod} (backend ${m.backendVersion}) |`,
      `| Trend ID | ${a.trendId} |`, "");
    if (a.warnings.length) L.push(...a.warnings.map((w) => `> ${w}`), "");
  }
  for (const c of m.comparisons) {
    L.push(`## Comparison: ${c.title}`, "",
      `| | A: ${c.a.label} (${c.a.dataset}) | B: ${c.b.label} (${c.b.dataset}) |`, `|---|---|---|`,
      `| Sen slope per decade | ${signedNum(c.a.trend.slope_per_decade)} ${c.units} | ${signedNum(c.b.trend.slope_per_decade)} ${c.units} |`,
      `| Raw Seasonal MK p | ${pText(c.a.trend.p_value)} | ${pText(c.b.trend.p_value)} |`,
      `| Verdict | ${verdictText(c.a.trend)} | ${verdictText(c.b.trend)} |`, "",
      "What agrees:", ...c.agrees.map((x) => `- ${x}`), "", "What disagrees:", ...c.disagrees.map((x) => `- ${x}`), "",
      `Strength of evidence: ${c.strength}`, "", "What cannot be concluded:", ...c.cannotConclude.map((x) => `- ${x}`), "");
  }
  L.push("## Methods and provenance", "",
    "Monthly values are averaged over the region on the processed grid. The raw Seasonal Mann-Kendall test (comparing matching calendar months across years) decides significance at α = 0.05 when at least 10 years and 70% of months have data. The seasonal Sen slope estimates the rate per decade. Hamed-Rao Mann-Kendall on anomalies is reported separately as an autocorrelation diagnostic. Region comparisons use a block-bootstrap test of the difference of slopes on anomalies.", "",
    ...m.datasets.map((d) => `- ${d.product} v${d.version}, ${d.provider}: ${d.url}`), "",
    "## Limitations", "", ...m.limitations.map((l) => `- ${l}`), "");
  return L.join("\n");
}

/** Machine-readable reproducibility record: parameters to re-run every analysis plus the results it gave. No secrets. */
export function toReproJson(m: ReportModel) {
  return {
    schema: "terra-scope-report/1", report_id: m.id, generated_at: m.generatedAt, backend_version: m.backendVersion,
    analyses: m.analyses.map((a) => ({
      request: { endpoint: "POST /api/v1/trends", variable_id: a.variableId,
        region: a.regionKind === "preset" && a.regionId ? { type: "preset", id: a.regionId } : { type: "bbox", bbox: a.bbox },
        start: a.start, end: a.end, method: a.method, alpha: a.alpha },
      context: { place: a.place, dataset: `${a.product} v${a.version}`, provider: a.provider, source_url: a.url, grid_deg: a.gridDeg, native_deg: a.nativeDeg },
      result: { trend_id: a.trendId, slope_per_decade: a.slope, slope_method: a.slopeMethod, p_value_raw: a.pRaw,
        p_value_autocorr_adjusted: a.pAdjusted, significant: a.significant, ols_anomaly_interval: a.olsInterval, ci_method: a.ciMethod,
        n_months: a.nMonths, missing_months: a.missingMonths, units_per_decade: a.units },
    })),
    comparisons: m.comparisons.map((c) => ({ kind: c.kind, title: c.title,
      a: { label: c.a.label, dataset: c.a.dataset, trend_id: c.a.trend.trend_id, slope_per_decade: c.a.trend.slope_per_decade, p_value_raw: c.a.trend.p_value },
      b: { label: c.b.label, dataset: c.b.dataset, trend_id: c.b.trend.trend_id, slope_per_decade: c.b.trend.slope_per_decade, p_value_raw: c.b.trend.p_value },
      difference_test: c.test ? c.test.difference : null, verdict: c.test ? c.test.verdict : "descriptive_only" })),
  };
}

