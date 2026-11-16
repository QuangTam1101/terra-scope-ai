// Form D report: pure helpers (no React). Academic wording built ONLY from backend verdicts and values;
// nothing here decides significance. Yearly means are a drawing aid for the Simple edition, never a test.
import type { SeriesResponse } from "../api";
import { rateOf, rateUnit } from "../units";
import { num, pText, signedNum, toMarkdown, type AnalysisEntry, type ComparisonEntry, type ReportModel } from "./model";

export type Edition = "simple" | "scientist";
export type Stamp = { text: string; cls: "sig" | "np" | "ne" | "inc" };

export function trendStamp(a: Pick<AnalysisEntry, "sufficient" | "significant">): Stamp {
  if (!a.sufficient || a.significant === null) return { text: "Insufficient data", cls: "ne" };
  return a.significant ? { text: "Significant trend", cls: "sig" } : { text: "Not significant", cls: "np" };
}

/** Comparison status from the backend test: confirmed only when the backend flags the difference significant. */
export function compareStamp(c: Pick<ComparisonEntry, "kind" | "test">): Stamp {
  if (c.kind !== "regions") return { text: "Descriptive only", cls: "ne" };
  const d = c.test?.difference;
  if (!d || d.p_value === null) return { text: "Not tested", cls: "ne" };
  if (d.significant) return { text: "Difference confirmed", cls: "sig" };
  const crosses = !!d.ci && d.ci[0] <= 0 && d.ci[1] >= 0;
  return crosses && d.p_value < 0.05 ? { text: "Inconclusive", cls: "inc" } : { text: "Not significant", cls: "np" };
}

const period = (a: Pick<AnalysisEntry, "start" | "end">) => `${a.start} to ${a.end}`;

/** Default finding title, academic register. Users may reword it; the stamp cannot change. */
export function defaultHeadline(a: AnalysisEntry): string {
  const s = trendStamp(a);
  const head = `${a.parameter} in ${a.place}, ${period(a)}`;
  if (s.cls === "ne" || a.slope === null) return `${head}: trend not testable with the available record`;
  const dir = a.slope > 0 ? "increasing" : a.slope < 0 ? "decreasing" : "no";
  return s.cls === "sig" ? `${head}: statistically significant ${dir} trend` : `${head}: ${dir} tendency, not statistically significant`;
}

/** Result statement in academic style, from the backend Sen slope, raw p and alpha only. */
export function resultStatement(a: AnalysisEntry): string {
  if (!a.sufficient || a.slope === null) {
    return `The record contains ${a.nMonths} valid months, which does not meet the sufficiency criterion (at least 10 years and 70% of months); no trend test was performed.`;
  }
  const est = `The seasonal Sen slope estimate is ${signedNum(a.rate)} ${a.rateUnits} per decade (${period(a)}, ${a.nMonths} months).`;
  const p = a.pRaw === null ? "n/a" : a.pRaw < 0.001 ? "p < 0.001" : `p = ${pText(a.pRaw)}`;
  return a.significant
    ? `${est} The raw Seasonal Mann-Kendall test yields ${p}, below α = ${a.alpha}; the null hypothesis of no monotonic trend is rejected. Statistical significance does not by itself establish practical importance or causality.`
    : `${est} The raw Seasonal Mann-Kendall test yields ${p}, which does not fall below α = ${a.alpha}; the null hypothesis of no monotonic trend is not rejected. This outcome does not demonstrate the absence of a trend; a longer record may resolve the question.`;
}

export function compareHeadline(c: ComparisonEntry): string {
  const s = compareStamp(c);
  const pair = `${c.a.label} versus ${c.b.label}`;
  if (c.kind !== "regions") return `${c.variableName}, ${pair}: descriptive comparison of two ${c.kind === "periods" ? "periods" : "datasets"}`;
  return s.text === "Difference confirmed" ? `${c.variableName}, ${pair}: statistically significant difference in trends`
    : s.text === "Inconclusive" ? `${c.variableName}, ${pair}: difference in trends inconclusive`
    : s.text === "Not tested" ? `${c.variableName}, ${pair}: difference not testable`
    : `${c.variableName}, ${pair}: no significant difference in trends`;
}

export function compareStatement(c: ComparisonEntry): string {
  const d = c.test?.difference;
  if (c.kind !== "regions" || !d) return c.strength;
  const iv = d.ci ? `${num(rateOf(d.ci[0], c.units)!)} to ${num(rateOf(d.ci[1], c.units)!)} ${rateUnit(c.units)} per decade` : "not available";
  return `The trend of the anomaly difference series (A minus B) is ${signedNum(rateOf(d.slope_diff_per_decade, c.units))} ${rateUnit(c.units)} per decade (Sen slope). The Hamed-Rao Mann-Kendall test on that series yields p = ${pText(d.p_value)} `
    + `and a moving-block bootstrap gives a 95% interval of ${iv}. A difference is reported as significant only when p < 0.05 and the interval excludes zero. ${c.strength}`;
}

/** Abstract: one sentence per item, all from the statements above. */
export function abstractText(m: ReportModel): string {
  const products = [...new Set(m.datasets.map((d) => d.product))].join(", ") || "NASA Earth observation products";
  const parts = [
    `This report examines ${m.analyses.length} monthly time series${m.comparisons.length ? ` and ${m.comparisons.length} comparison${m.comparisons.length === 1 ? "" : "s"}` : ""} derived from ${products}, `
    + "using the Seasonal Mann-Kendall test for monotonic trend and the seasonal Sen slope estimator.",
    ...m.analyses.map((a) => `${defaultHeadline(a)} (${signedNum(a.rate)} ${a.rateUnits} per decade, p ${pText(a.pRaw)}).`),
    ...m.comparisons.map((c) => `${compareHeadline(c)}.`),
    "The results describe past change only; they are not forecasts and do not attribute causes. All results are preliminary and have not been peer reviewed.",
  ];
  return parts.join(" ");
}

/** Annual means of the monthly anomalies, for the Simple edition chart only (years with at least 6 valid months). */
export function yearlyMeans(series: Pick<SeriesResponse, "points">): { year: number; value: number }[] {
  const acc = new Map<number, number[]>();
  for (const p of series.points) {
    if (p.anomaly === null || !Number.isFinite(p.anomaly)) continue;
    const y = Number(p.t.slice(0, 4));
    acc.set(y, [...(acc.get(y) ?? []), p.anomaly]);
  }
  return [...acc.entries()].filter(([, v]) => v.length >= 6).sort((x, y) => x[0] - y[0])
    .map(([year, v]) => ({ year, value: v.reduce((s, x) => s + x, 0) / v.length }));
}

/** A reworded title must not claim more (or less) than the test supports. Returns a warning or null. */
export function headlineWarning(text: string, a: Pick<AnalysisEntry, "sufficient" | "significant">): string | null {
  const t = text.toLowerCase();
  const negated = /\bnot\b|\bno\b|n't|\bwithout\b/.test(t);
  const strong = /\b(significant(ly)?|prove[sdn]?|proven|confirm(s|ed)?|clear(ly)?|definite(ly)?|certain(ly)?|demonstrate[sd]?)\b/.test(t);
  if ((!a.sufficient || !a.significant) && strong && !negated) return "This title claims more certainty than the test result supports.";
  if (a.sufficient && a.significant && /\bno (trend|change)\b|not significant/.test(t)) return "This title contradicts the significant test result.";
  if (/\b(because|caused by|due to|will (rise|fall|increase|decrease))\b/.test(t)) return "Titles may not state causes or forecasts.";
  return null;
}

export interface CheckItem { ok: boolean; text: string }
export function quickCheck(m: ReportModel, headlines: Record<string, string>): CheckItem[] {
  const items: CheckItem[] = [{ ok: true, text: "Every finding states its region, period, dataset and method." }];
  const bad = m.analyses.filter((a) => headlines[a.key] && headlineWarning(headlines[a.key], a));
  items.push(bad.length ? { ok: false, text: `Check the title of: ${bad.map((a) => a.place).join(", ")}.` } : { ok: true, text: "Titles are consistent with their test results." });
  const ends = new Set(m.analyses.map((a) => a.end));
  if (ends.size > 1) items.push({ ok: false, text: `Periods differ (${[...ends].join(", ")}); each finding states its own period.` });
  const untested = m.analyses.filter((a) => !a.sufficient).length;
  if (untested) items.push({ ok: false, text: `${untested} finding${untested === 1 ? " has" : "s have"} insufficient data and no trend test.` });
  return items;
}

export interface Extras { title?: string; author?: string; headlines?: Record<string, string>; notes?: Record<string, string> }

/** Default report title, used only when the user leaves the title empty (a typed title always wins). */
export function defaultReportTitle(m: ReportModel): string {
  const params = [...new Set(m.analyses.map((a) => a.parameter))], places = [...new Set(m.analyses.map((a) => a.place))];
  if (params.length === 1 && places.length === 1) return `${params[0]} Trend Analysis: ${places[0]}`;
  if (params.length === 1) return `${params[0]} Trend Analysis: ${places.length} regions`;
  return "Trend analysis of NASA Earth observation records";
}

/** Markdown for either edition. User-authored text is escaped and labelled as such; every number comes from the model. */
export function editionMarkdown(m: ReportModel, edition: Edition, x: Extras = {}): string {
  const title = x.title?.trim() ? safeText(x.title.trim()) : defaultReportTitle(m);
  const meta = [`- Edition: ${edition === "scientist" ? "Scientist" : "Explorer"}`, ...(x.author?.trim() ? [`- Prepared by: ${safeText(x.author.trim())}`] : []),
    `- Report ID: ${m.id}`, `- Generated: ${m.generatedAt}`, ""];
  const notes = m.analyses.filter((a) => x.notes?.[a.key]?.trim()).map((a) => `- ${a.parameter}, ${a.place}: ${safeText(x.notes![a.key].trim()).replace(/\n/g, " / ")}`);
  const noteBlock = notes.length ? ["", "## Author notes (written by the report author, not part of the evidence)", "", ...notes] : [];
  const head = (a: AnalysisEntry) => (x.headlines?.[a.key]?.trim() ? safeText(x.headlines[a.key].trim()) : edition === "simple" ? explorerHeadline(a) : defaultHeadline(a));
  if (edition === "simple") {
    const L = [`# ${title}`, "", ...meta, "## Summary of findings", ""];
    for (const a of m.analyses) {
      const o = testOutcome(a), rate = plainRate(a), proj = linearProjection(a);
      L.push(`### ${head(a)}`, "", plainFinding(a), "", ...(rate ? [rate, ""] : []), ...(proj ? [proj, ""] : []), `Statistical test outcome: ${o.title}. ${o.detail}`, "",
        `Data: ${a.dataset} (${a.product} v${a.version}, ${a.provider}), ${a.start} to ${a.end}, ${a.nMonths} months. Source: ${a.url}`, "");
    }
    for (const c of m.comparisons) L.push(`### ${compareHeadline(c)}`, "", plainCompare(c), "");
    L.push("## What this report cannot tell us", "", "- A trend describes past change. It does not predict future conditions.",
      "- This analysis does not establish what caused the change.", "- Different NASA products may produce different estimates.",
      "- The study area is approximated by a geographic box.", "", "## Glossary", "", ...GLOSSARY.map(([k, v]) => `- **${k}**: ${v}`), "",
      "## References", "", ...m.datasets.map((d) => `- ${d.product} v${d.version}. ${d.provider}. ${d.url}`),
      ...REFERENCES.map((r) => `- ${r.text}${r.doi ? ` https://doi.org/${r.doi}` : ""}`), ...noteBlock, "");
    return L.join("\n");
  }
  const body = toMarkdown(m, "scientific").split("\n").slice(1).join("\n");   // drop the generic first heading
  return [`# ${title}`, "", ...meta, "## Abstract", "", abstractText(m), "", "## Key findings", "",
    ...m.analyses.map((a) => `- ${head(a)}. ${resultStatement(a)}`), ...m.comparisons.map((c) => `- ${compareHeadline(c)}. ${compareStatement(c)}`), "",
    body.trimStart(), "", "## References", "", ...REFERENCES.map((r) => `- ${r.text}${r.doi ? ` https://doi.org/${r.doi}` : ""}`), ...noteBlock, ""].join("\n");
}

/* ---------------------------------------------------------------- Explorer edition (plain language) */
// Same evidence as the Scientist edition, worded for readers without a statistics background. The direction and the
// verdict always come from the backend (slope sign, significant flag, sufficiency); nothing here re-tests anything.

/** Everyday words for "higher / lower than usual" per quantity. */
export function plainWords(parameter: string): { up: string; down: string; noun: string } {
  const p = parameter.toLowerCase();
  if (p.includes("temperature")) return { up: "warmer", down: "cooler", noun: "temperature" };
  if (p.includes("precip") || p.includes("rain")) return { up: "wetter", down: "drier", noun: "rainfall" };
  if (p.includes("soil")) return { up: "wetter soil", down: "drier soil", noun: "soil moisture" };
  if (p.includes("vegetation") || p.includes("ndvi")) return { up: "greener", down: "less green", noun: "vegetation greenness" };
  if (p.includes("potential")) return { up: "higher evaporative demand", down: "lower evaporative demand", noun: "potential evapotranspiration (how much water the air could take)" };
  if (p.includes("evapo")) return { up: "more evaporation", down: "less evaporation", noun: "evaporation from land and plants" };
  return { up: "higher", down: "lower", noun: p };
}

const years = (a: Pick<AnalysisEntry, "start" | "end">) => Number(a.end.slice(0, 4)) - Number(a.start.slice(0, 4)) + 1;

/** One-sentence finding (D4 templates), from the backend direction and verdict. */
export function plainFinding(a: AnalysisEntry): string {
  const w = plainWords(a.parameter), where = `${a.place}, ${a.start.slice(0, 4)} to ${a.end.slice(0, 4)}`;
  if (!a.sufficient || a.slope === null) return `For ${where}, the available data is not sufficient for a reliable trend conclusion about ${w.noun}.`;
  const dir = a.slope > 0 ? "upward" : a.slope < 0 ? "downward" : "flat";
  return a.significant
    ? `For ${where}, the analysis found statistical evidence of ${dir === "upward" ? "an" : "a"} ${dir} trend in ${w.noun}.`
    : `For ${where}, the estimated trend in ${w.noun} is ${dir}, but the statistical test did not find enough evidence to confirm a clear ${a.slope >= 0 ? "increase" : "decrease"}.`;
}

/** Default finding title for the Explorer edition, plain words; a typed title always wins. */
export function explorerHeadline(a: AnalysisEntry): string {
  const y = `${a.start.slice(0, 4)} to ${a.end.slice(0, 4)}`;
  if (!a.sufficient || a.slope === null) return `${a.parameter} in ${a.place}: not enough data for a trend`;
  if (a.significant) return `${a.parameter} in ${a.place} ${a.slope > 0 ? "went up" : a.slope < 0 ? "went down" : "stayed level"} from ${y}`;
  return `${a.parameter} in ${a.place}, ${y}: ${a.slope >= 0 ? "an upward" : "a downward"} tendency the test does not confirm`;
}

/** The rate in everyday terms: per decade only. A total over the period is a separate, clearly labelled projection. */
export function plainRate(a: AnalysisEntry): string | null {
  if (a.slope === null || !a.sufficient) return null;
  return `About ${signedNum(a.rate)} ${a.rateUnits} every 10 years (estimated rate).`;
}

/** Straight-line projection of the estimated rate over the selected years. Shown only for significant trends, and always
 *  labelled as a projection: it is not the measured difference between the first and the last year. */
export function linearProjection(a: AnalysisEntry): string | null {
  if (a.slope === null || !a.sufficient || !a.significant) return null;
  const n = years(a), total = (a.rate! * n) / 10;
  return `If this estimated rate had held steadily for all ${n} years, it would add up to about ${signedNum(total)} ${a.rateUnits}. `
    + "This is a straight-line projection of the rate, not a measured difference between the first and the last year.";
}

/** What kind of NASA product this is, in plain words (never "satellite measurement" for a model or reanalysis). */
export function productKind(product: string): { kind: string; plain: string } {
  const p = product.toUpperCase();
  if (p.includes("IMERG") || p.startsWith("GPM")) return { kind: "Satellite-based estimate", plain: "rainfall estimated from a constellation of satellites and adjusted with rain-gauge data" };
  if (p.includes("GLDAS")) return { kind: "Land-surface model", plain: "a computer model of the land surface driven by observations; it is not a direct measurement" };
  if (p.includes("MERRA") || p.startsWith("M2")) return { kind: "Reanalysis", plain: "a reanalysis: a weather model that blends many past observations into a consistent record; it is not a direct satellite measurement" };
  if (p.startsWith("MOD")) return { kind: "Satellite measurement", plain: "measured by the MODIS sensor on NASA's Terra satellite; clear-sky only, so cloudy months can be missing" };
  return { kind: "NASA Earth data product", plain: "a NASA Earth-system data product" };
}

/** Width of a grid cell: north-south is fixed, east-west shrinks with latitude (cos). Returns rounded km. */
export function cellSizeKm(deg: number, lat: number): { ns: number; ew: number } {
  const ns = deg * 111.2;
  return { ns: Math.round(ns), ew: Math.round(ns * Math.cos((Math.abs(lat) * Math.PI) / 180)) };
}

/** Short labels for the method references (full entries stay in REFERENCES). */
export const SHORT_REFS: { label: string; doi?: string; what: string }[] = [
  { label: "Mann (1945)", doi: "10.2307/1907187", what: "trend test" },
  { label: "Kendall (1975)", what: "trend test" },
  { label: "Hirsch et al. (1982)", doi: "10.1029/WR018i001p00107", what: "seasonal version" },
  { label: "Sen (1968)", doi: "10.1080/01621459.1968.10480934", what: "rate of change" },
  { label: "Hamed & Rao (1998)", doi: "10.1016/S0022-1694(97)00125-X", what: "autocorrelation check" },
  { label: "Benjamini & Hochberg (1995)", doi: "10.1111/j.2517-6161.1995.tb02031.x", what: "map corrections" },
];

/** Plain-language concept cards; which ones are printed depends on the report's findings. */
export const CONCEPTS: Record<string, { title: string; text: string }> = {
  trend: { title: "Trend", text: "The overall direction of change across many years, looking past the normal ups and downs of the seasons." },
  perDecade: { title: "Per decade", text: "The rate is given for every 10 years, so periods of different length can be compared." },
  anomaly: { title: "Anomaly", text: "How much a value differs from what is usual for that time of year, for example this July compared with an average July." },
  pValue: { title: "p-value", text: "A number the test uses to weigh the evidence against \"no trend\". Small means the pattern would be unusual without a real trend. It is not the chance that the finding is true, and it never proves a cause." },
  notSig: { title: "Not significant", text: "The test could not rule out chance. That is not proof that nothing changed: a longer record may still show a trend." },
  notTested: { title: "Not tested", text: "A trend test needs at least 10 years and 70% of months with data. With less, no verdict is given." },
};

export function explorerConcepts(m: ReportModel): (keyof typeof CONCEPTS)[] {
  const out: (keyof typeof CONCEPTS)[] = ["trend", "pValue"];
  if (m.analyses.some((a) => !a.sufficient)) out.push("notTested");
  else if (m.analyses.some((a) => a.significant === false)) out.push("notSig");
  else out.push("anomaly");
  return out;
}

/** Test outcome without an evidence meter or percentage (D5). */
export function testOutcome(a: AnalysisEntry): { met: boolean | null; title: string; detail: string } {
  if (!a.sufficient || a.pRaw === null) return { met: null, title: "Not tested", detail: "The record is too short or has too many gaps (at least 10 years and 70% of months are needed), so no test was run." };
  return a.significant
    ? { met: true, title: "Meets the selected significance threshold", detail: `The test's p-value is ${a.pRaw < 0.001 ? "below 0.001" : pText(a.pRaw)}, which is below the threshold of ${a.alpha}. A pattern this strong would be unusual if there were no real trend. It does not say how important the change is, or why it happened.` }
    : { met: false, title: "Does not meet the selected significance threshold", detail: `The test's p-value is ${pText(a.pRaw)}, which is not below the threshold of ${a.alpha}. The ups and downs in the record could plausibly produce this pattern without a real trend. This is not proof that nothing changed; a longer record may help.` };
}

/** Plain sentence for a comparison, from the backend difference test. */
export function plainCompare(c: ComparisonEntry): string {
  const s = compareStamp(c);
  if (c.kind === "periods") return "The same place and dataset were compared over two periods. There is no statistical test for a change of trend between periods, so this comparison only describes them; the years chosen can change the answer.";
  if (c.kind !== "regions") return "These two NASA products were compared side by side. There is no statistical test for differences between products, so this comparison only describes them; neither product is assumed to be correct.";
  if (s.text === "Difference confirmed") return "The two places changed at clearly different rates: the statistical test confirms the difference between their trends.";
  if (s.text === "Inconclusive") return "The two trends look different, but the test cannot confirm it: one of its two conditions is not met, so the result is inconclusive.";
  if (s.text === "Not tested") return "There is not enough data to test whether the two trends differ.";
  return "The test did not find a clear difference between the two trends.";
}

/** Escapes user-authored text for Markdown/HTML viewers (it is printed as text, never as markup). */
export const safeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const GLOSSARY: [string, string][] = [
  ["Anomaly", "How much a month differed from the usual value for that calendar month (for example, this July compared with an average July)."],
  ["Trend", "The overall direction of change across many years, after removing the regular seasons."],
  ["Per decade", "Change for every 10 years."],
  ["p-value", "A number from the statistical test. Small values mean the pattern would be unusual if there were no real trend. It is not the chance that the finding is true."],
  ["Significance threshold", "The cut-off (0.05 here). A p-value below it means the test supports a trend."],
  ["Grid cell", "One square of the processed map grid (0.5° of latitude and longitude). North to south it is about 56 km; east to west it narrows away from the equator (about 28 km at 60° latitude)."],
];

/** Verified references (DOIs checked against Crossref on 2026-11-14). */
export const REFERENCES: { text: string; doi?: string }[] = [
  { text: "Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: a practical and powerful approach to multiple testing. Journal of the Royal Statistical Society, Series B, 57(1), 289-300.", doi: "10.1111/j.2517-6161.1995.tb02031.x" },
  { text: "Hamed, K. H., & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. Journal of Hydrology, 204(1-4), 182-196.", doi: "10.1016/S0022-1694(97)00125-X" },
  { text: "Hirsch, R. M., Slack, J. R., & Smith, R. A. (1982). Techniques of trend analysis for monthly water quality data. Water Resources Research, 18(1), 107-121.", doi: "10.1029/WR018i001p00107" },
  { text: "Kendall, M. G. (1975). Rank Correlation Methods (4th ed.). Charles Griffin, London." },
  { text: "Mann, H. B. (1945). Nonparametric tests against trend. Econometrica, 13(3), 245-259.", doi: "10.2307/1907187" },
  { text: "Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. Journal of the American Statistical Association, 63(324), 1379-1389.", doi: "10.1080/01621459.1968.10480934" },
];
