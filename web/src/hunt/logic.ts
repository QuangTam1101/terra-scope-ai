// Contradiction Hunter 3.0: deterministic comparison logic (pure, no React, no network).
// Nothing here computes a statistic. It reads backend /trends and /compare results and decides, by explicit rules:
// whether two results can be compared (validity), what kind of difference they show (categories), and how strong the
// evidence for a difference is (status). A formal difference test exists only for two regions (backend /compare).
import type { CompareResponse, TrendResponse, Variable } from "../api";

export type HuntMode = "regions" | "datasets" | "periods";
export type Category = "opposite_direction" | "magnitude_difference" | "different_significance_labels" | "dataset_disagreement"
  | "time_window_sensitivity" | "insufficient_evidence";
export type EvidenceStatus = "statistically_tested_difference" | "no_supported_difference" | "descriptive_difference" | "inconclusive" | "not_comparable";
export type Validity = "comparable" | "comparable_with_limitations" | "not_comparable" | "more_evidence_needed";

/** One side of a comparison: the trend result and the variable it came from. */
export interface Side { label: string; variable: Pick<Variable, "id" | "parameter" | "parameter_name" | "dataset_name" | "display_units" | "native_resolution_deg" | "spatial_resolution_deg" | "source">; trend: TrendResponse }
export interface Check { id: string; status: "ok" | "limit" | "fail" | "missing"; text: string }

/** A larger magnitude counts as a "magnitude difference" when it is at least this many times the smaller one (same sign). */
export const MAGNITUDE_RATIO = 2;
/** Windows shorter than this many years give an uncertain slope (still tested by the backend when sufficient). */
export const SHORT_WINDOW_YEARS = 15;
/** Coverage difference (fraction of the area with data) above which the two averages describe different cells. */
export const COVERAGE_GAP = 0.05;

// Same pairs as backend app/hunt.py COMPATIBLE: same physical quantity in the same units.
const COMPATIBLE = [["gldas_air_temperature", "merra2_air_temperature_2m"], ["gldas_evapotranspiration", "modis_et"]];
export const compatibleIds = (a: string, b: string) => COMPATIBLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const months = (start: string, end: string) => (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
const later = (x: string, y: string) => (x > y ? x : y), earlier = (x: string, y: string) => (x < y ? x : y);
/** Number of calendar months shared by two periods (0 when they do not overlap). */
export function overlapMonths(a: { start: string; end: string }, b: { start: string; end: string }): number {
  const s = later(a.start, b.start), e = earlier(a.end, b.end);
  return s > e ? 0 : months(s, e);
}
const kindOf = (product: string) => {
  const p = product.toUpperCase();
  return p.includes("IMERG") || p.startsWith("GPM") ? "satellite-based estimate" : p.includes("GLDAS") ? "land-surface model"
    : p.includes("MERRA") || p.startsWith("M2") ? "reanalysis" : "data product";
};
const usable = (t: TrendResponse) => t.quality.sufficient && t.slope_per_decade !== null && t.significant !== null;
const sameRegion = (a: TrendResponse, b: TrendResponse) => a.region.bbox.every((v, i) => Math.abs(v - b.region.bbox[i]) < 1e-9);

/** Deterministic comparability checks. "fail" makes the pair not comparable; "limit" keeps it, with a stated limitation. */
export function checkComparability(mode: HuntMode, a: Side, b: Side): { validity: Validity; checks: Check[] } {
  const ta = a.trend, tb = b.trend, checks: Check[] = [];
  const push = (id: string, status: Check["status"], text: string) => checks.push({ id, status, text });
  // Physical quantity and units.
  if (mode === "datasets") {
    if (a.variable.id === b.variable.id) push("quantity", "fail", "Both sides use the same dataset: choose two different products.");
    else if (!compatibleIds(a.variable.id, b.variable.id)) push("quantity", "fail", `${a.variable.dataset_name} and ${b.variable.dataset_name} do not measure the same physical quantity in the same units, so their trends cannot be compared.`);
    else push("quantity", "ok", `Both measure ${a.variable.parameter_name.toLowerCase()} in ${a.variable.display_units}.`);
  } else if (a.variable.id !== b.variable.id) push("quantity", "fail", "Both sides must use the same variable and dataset.");
  else push("quantity", "ok", `Same variable and dataset on both sides (${a.variable.dataset_name}).`);
  if (ta.units !== tb.units) push("units", "fail", `Units differ (${a.variable.display_units} versus ${b.variable.display_units}).`);
  else push("units", "ok", `Same units (${a.variable.display_units}).`);
  // Space.
  if (mode === "regions") {
    if (sameRegion(ta, tb)) push("space", "fail", "Both sides are the same area: choose two different places.");
    else push("space", "ok", "Two different areas, averaged the same way on the same grid.");
  } else if (!sameRegion(ta, tb)) push("space", "fail", "Both sides must cover the same area.");
  else push("space", "ok", "Same area on both sides.");
  // Time.
  const ov = overlapMonths(ta, tb);
  if (mode === "periods") {
    if (ta.start === tb.start && ta.end === tb.end) push("time", "fail", "The two periods are identical: choose different periods.");
    else if (ov > 0) push("time", "limit", `The periods overlap by ${ov} months, so the two estimates share data and are not independent.`);
    else push("time", "ok", "The periods do not overlap.");
    const short = [ta, tb].filter((t) => months(t.start, t.end) < SHORT_WINDOW_YEARS * 12);
    if (short.length) push("length", "limit", `${short.length === 2 ? "Both periods are" : "One period is"} shorter than ${SHORT_WINDOW_YEARS} years; slopes from short windows are uncertain and change a lot with the start and end year.`);
  } else if (ta.start !== tb.start || ta.end !== tb.end) push("time", "fail", `The periods differ (${ta.start} to ${ta.end} versus ${tb.start} to ${tb.end}); compare over the same period.`);
  else push("time", "ok", `Same period (${ta.start} to ${ta.end}).`);
  // Data sufficiency.
  for (const [k, s] of [["A", a], ["B", b]] as const)
    if (!usable(s.trend)) push(`sufficiency_${k}`, "missing", `${k} (${s.label}) does not have enough data for a trend test (at least 10 years and 70% of months are needed).`);
  // Coverage and provenance.
  const ca = ta.quality.coverage_fraction, cb = tb.quality.coverage_fraction;
  if (Math.abs(ca - cb) > COVERAGE_GAP)
    push("coverage", "limit", `Different spatial coverage: ${Math.round(ca * 100)}% versus ${Math.round(cb * 100)}% of the area has data (for example land only versus land and sea), so the averages describe different cells.`);
  if (mode === "datasets") {
    const ka = kindOf(ta.source.product), kb = kindOf(tb.source.product);
    if (ka !== kb) push("provenance", "limit", `Different kinds of product: ${a.variable.dataset_name} is a ${ka}, ${b.variable.dataset_name} a ${kb}. Neither is treated as ground truth.`);
    if (a.variable.native_resolution_deg !== b.variable.native_resolution_deg)
      push("resolution", "limit", `Different native resolution (${a.variable.native_resolution_deg}° versus ${b.variable.native_resolution_deg}°), both processed to the same ${a.variable.spatial_resolution_deg}° grid.`);
  }
  const validity: Validity = checks.some((c) => c.status === "fail") ? "not_comparable"
    : checks.some((c) => c.status === "missing") ? "more_evidence_needed"
    : checks.some((c) => c.status === "limit") ? "comparable_with_limitations" : "comparable";
  return { validity, checks };
}

/** Machine-readable reasons a pair differs. Classification only: none of these is a hypothesis test. */
export function categorize(mode: HuntMode, a: TrendResponse, b: TrendResponse): Category[] {
  if (!usable(a) || !usable(b)) return ["insufficient_evidence"];
  const sa = a.slope_per_decade!, sb = b.slope_per_decade!, out: Category[] = [];
  if (sa * sb < 0) out.push("opposite_direction");
  else if (sa !== 0 && sb !== 0 && Math.max(Math.abs(sa), Math.abs(sb)) >= MAGNITUDE_RATIO * Math.min(Math.abs(sa), Math.abs(sb))) out.push("magnitude_difference");
  if (a.significant !== b.significant) out.push("different_significance_labels");
  if (out.length && mode === "datasets") out.push("dataset_disagreement");
  if (out.length && mode === "periods") out.push("time_window_sensitivity");
  return out;
}

/** How strong the evidence is for a real difference. Only the backend two-region test can make it "statistically tested". */
export function evidenceStatus(mode: HuntMode, validity: Validity, test: CompareResponse | null): EvidenceStatus {
  if (validity === "not_comparable") return "not_comparable";
  if (validity === "more_evidence_needed") return "inconclusive";
  if (mode === "regions" && test) {
    const d = test.difference;
    if (d.p_value === null) return "inconclusive";
    if (d.significant) return "statistically_tested_difference";
    // p below alpha but the interval includes zero: one of the two required conditions fails.
    return d.p_value < 0.05 ? "inconclusive" : "no_supported_difference";
  }
  return "descriptive_difference";
}

export const CATEGORY_LABEL: Record<Category, { explorer: string; scientist: string }> = {
  opposite_direction: { explorer: "Going opposite ways", scientist: "Opposite trend directions" },
  magnitude_difference: { explorer: "Same way, very different speed", scientist: `Magnitude difference (ratio ≥ ${MAGNITUDE_RATIO})` },
  different_significance_labels: { explorer: "Only one passes the test", scientist: "Different significance labels" },
  dataset_disagreement: { explorer: "Datasets tell different stories", scientist: "Dataset disagreement" },
  time_window_sensitivity: { explorer: "Depends on the years chosen", scientist: "Time-window sensitivity" },
  insufficient_evidence: { explorer: "Not enough data", scientist: "Insufficient evidence" },
};
export const STATUS_LABEL: Record<EvidenceStatus, { explorer: string; scientist: string; cls: "sig" | "np" | "ne" | "inc" }> = {
  statistically_tested_difference: { explorer: "Difference confirmed by a test", scientist: "Statistically tested difference", cls: "sig" },
  no_supported_difference: { explorer: "The test does not support a difference", scientist: "Difference not statistically supported", cls: "np" },
  descriptive_difference: { explorer: "Described, not tested", scientist: "Descriptive difference (no formal test)", cls: "np" },
  inconclusive: { explorer: "Not settled yet", scientist: "Inconclusive", cls: "inc" },
  not_comparable: { explorer: "Can't be compared", scientist: "Not comparable", cls: "ne" },
};
export const VALIDITY_LABEL: Record<Validity, string> = {
  comparable: "Comparable", comparable_with_limitations: "Comparable with limitations", not_comparable: "Not comparable", more_evidence_needed: "More evidence needed",
};

const sgn = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x) >= 100 ? Math.abs(x).toFixed(1) : Math.abs(x) >= 1 ? Math.abs(x).toFixed(2) : Math.abs(x).toPrecision(3)}`;
const pTxt = (p: number | null) => (p === null ? "n/a" : p < 0.001 ? "< 0.001" : p.toFixed(3));

/** "What agrees / differs / how compared / cannot conclude", built only from the results. */
export function explainComparison(mode: HuntMode, a: Side, b: Side, test: CompareResponse | null, sci: boolean) {
  const ta = a.trend, tb = b.trend, u = a.variable.display_units;
  const agrees: string[] = [], differs: string[] = [], how: string[] = [], cannot: string[] = [];
  if (usable(ta) && usable(tb)) {
    const sa = ta.slope_per_decade!, sb = tb.slope_per_decade!;
    if (sa * sb > 0) agrees.push(sci ? "Both Sen slopes have the same sign." : `Both are ${sa > 0 ? "rising" : "falling"}.`);
    else if (sa * sb < 0) differs.push(sci ? "The Sen slopes have opposite signs." : "One is rising while the other is falling.");
    differs.push(sci ? `Sen slopes: ${sgn(sa)} versus ${sgn(sb)} ${u} per decade (simple difference ${sgn(sa - sb)}).`
      : `About ${sgn(sa)} versus ${sgn(sb)} ${u} every 10 years.`);
    if (ta.significant === tb.significant) agrees.push(sci ? `Both ${ta.significant ? "reject" : "do not reject"} the no-trend hypothesis at α = 0.05 (raw Seasonal MK).`
      : `Both ${ta.significant ? "pass" : "do not pass"} the trend test.`);
    else {
      differs.push(sci ? `Only ${ta.significant ? "A" : "B"} rejects the no-trend hypothesis at α = 0.05.` : `Only ${ta.significant ? "A" : "B"} passes the trend test.`);
      cannot.push(sci ? "A significant result on one side and a non-significant one on the other is not a test of their difference."
        : "One passing and one not passing the test does not show that the two are really different.");
    }
  } else differs.push(sci ? "At least one side does not meet the sufficiency criterion, so no trend was tested there." : "At least one side does not have enough data for a trend test.");
  // How it was compared.
  how.push(sci ? "Each side: area-weighted monthly mean over the box, raw Seasonal Mann-Kendall test (α = 0.05) and seasonal Sen slope per decade."
    : "Each side gets the same treatment: the monthly NASA values are averaged over the area, then the same trend test is run.");
  if (mode === "regions" && test) {
    const d = test.difference;
    how.push(sci ? `Difference: the monthly anomaly difference series (A minus B) is tested with the Hamed-Rao Mann-Kendall test (p = ${pTxt(d.p_value)}); its Sen slope is ${d.slope_diff_per_decade === null ? "n/a" : sgn(d.slope_diff_per_decade)} ${u} per decade; a moving-block bootstrap (12-month blocks) gives the 95% interval${d.ci ? ` ${sgn(d.ci[0])} to ${sgn(d.ci[1])}` : ""}. Significant only when p < 0.05 and the interval excludes zero.`
      : "Then the gap between the two places is tested directly: we check whether that gap itself grew or shrank over the years. A difference is confirmed only when that test is clear.");
  } else {
    how.push(sci ? `No formal test of the difference is implemented for ${mode === "datasets" ? "two datasets" : "two periods"}; the comparison is descriptive.`
      : `There is no statistical test for comparing two ${mode === "datasets" ? "datasets" : "periods"} here, so this is a description, not a proof.`);
  }
  // What cannot be concluded.
  if (mode === "datasets") cannot.push(sci ? "Neither product is ground truth; disagreement indicates product uncertainty, not which product is correct." : "We can't tell which dataset is right: neither is treated as the truth.");
  if (mode === "periods") {
    cannot.push(sci ? "A change of slope between windows is not a tested change point; window choice can drive the result." : "A different speed in two periods is not proof that the trend changed: the years you pick can change the answer.");
    if (overlapMonths(ta, tb) > 0) cannot.push(sci ? "Overlapping windows share data, so the two estimates are not independent." : "The two periods share some years, so they are not independent.");
  }
  cannot.push(sci ? "Causal attribution is outside this analysis; candidate mechanisms are hypotheses." : "Why they differ: possible reasons are ideas to investigate, not conclusions.");
  cannot.push(sci ? "Results describe past change and are not forecasts." : "This describes the past, not the future.");
  return { agrees, differs, how, cannot };
}

/** Headline sentence for the comparison, never stronger than the evidence status. */
export function conclusion(status: EvidenceStatus, cats: Category[], sci: boolean): string {
  const opposite = cats.includes("opposite_direction");
  switch (status) {
    case "statistically_tested_difference":
      return sci ? "The difference between the two regional trends is statistically significant (p < 0.05 and the 95% interval excludes zero)."
        : "The test confirms that these two places are changing differently.";
    case "no_supported_difference":
      return sci ? `${opposite ? "The estimated trends have opposite signs, but the" : "The"} difference test does not support a difference in trends.`
        : `${opposite ? "They point in opposite directions, but the" : "The"} test does not show that they are really changing differently.`;
    case "inconclusive":
      return sci ? "The evidence is inconclusive: a required condition is not met or data are insufficient." : "The evidence is not strong enough to decide yet.";
    case "not_comparable":
      return sci ? "These two results cannot be compared meaningfully (see the checks)." : "These two results can't be compared fairly (see why below).";
    default:
      return opposite
        ? (sci ? "The estimated trends point in opposite directions, but this comparison alone does not prove that the underlying trends are statistically different."
          : "They point in opposite directions, but this comparison alone does not prove they are really different.")
        : cats.length ? (sci ? "The results differ descriptively; no formal test of the difference is available for this comparison." : "They differ, but there is no test here that can confirm it.")
          : (sci ? "The two results agree in sign and significance label." : "The two results tell a similar story.");
  }
}

/** Detective handoff: the question and a context the backend resolves and recomputes itself (no client numbers are trusted). */
export function detectiveRequest(mode: HuntMode, a: Side, b: Side, sci: boolean) {
  const ta = a.trend, tb = b.trend, ref = (t: TrendResponse) => t.region.type === "preset" && t.region.id ? { type: "preset" as const, id: t.region.id } : { type: "bbox" as const, bbox: t.region.bbox };
  const v = a.variable.parameter_name.toLowerCase();
  if (mode === "regions") return {
    message: sci ? `Compare the ${v} trends of ${a.label} and ${b.label} (${a.variable.dataset_name}, ${ta.start} to ${ta.end}). Which difference test was applied, is the slope difference statistically supported, and how does serial dependence affect interpretation?`
      : `Why might ${a.label} and ${b.label} show different ${v} trends? Are the differences meaningful? Use the comparison evidence and say what cannot be concluded.`,
    context: { intent: "compare" as const, variable_id: a.variable.id, region: ref(ta), region_b: ref(tb), start: ta.start, end: ta.end },
  };
  if (mode === "datasets") return {
    message: sci ? `For ${a.label}, ${ta.start} to ${ta.end}: ${a.variable.dataset_name} gives a Sen slope of ${ta.slope_per_decade === null ? "n/a" : sgn(ta.slope_per_decade)} and ${b.variable.dataset_name} ${tb.slope_per_decade === null ? "n/a" : sgn(tb.slope_per_decade)} ${a.variable.display_units} per decade. Explain the evidence for ${a.variable.dataset_name}, which provenance differences matter, and state that no two-dataset test exists.`
      : `Why might ${a.variable.dataset_name} and ${b.variable.dataset_name} show different ${v} trends for ${a.label}? Could they be measuring different things? Which NASA data was used?`,
    context: { intent: "trend" as const, variable_id: a.variable.id, region: ref(ta), start: ta.start, end: ta.end },
  };
  return {
    message: sci ? `For ${a.label} (${a.variable.dataset_name}), compare the trend over ${ta.start} to ${ta.end} with ${tb.start} to ${tb.end}. Explain the evidence for the first window and why window choice and length affect slope estimates.`
      : `Why might the ${v} trend in ${a.label} look different in ${ta.start.slice(0, 4)} to ${ta.end.slice(0, 4)} than in ${tb.start.slice(0, 4)} to ${tb.end.slice(0, 4)}? Is the difference meaningful?`,
    context: { intent: "trend" as const, variable_id: a.variable.id, region: ref(ta), start: ta.start, end: ta.end },
  };
}

export const EXAMPLE_QUESTIONS = {
  explorer: ["Why do these places show different trends?", "Are the differences meaningful?", "Which NASA data was used?", "Could the datasets be measuring different things?"],
  scientist: ["Which comparison test was applied?", "Is the slope difference statistically supported?", "Are the study periods and units compatible?",
    "How does serial dependence affect interpretation?", "What dataset provenance differences matter?"],
};
