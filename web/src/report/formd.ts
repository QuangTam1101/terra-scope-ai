// Form D report: pure helpers (no React). Academic wording built ONLY from backend verdicts and values;
// nothing here decides significance. Yearly means are a drawing aid for the Simple edition, never a test.
import type { SeriesResponse } from "../api";
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
  const est = `The seasonal Sen slope estimate is ${signedNum(a.slope)} ${a.units} per decade (${period(a)}, ${a.nMonths} months).`;
  const p = a.pRaw === null ? "n/a" : a.pRaw < 0.001 ? "p < 0.001" : `p = ${pText(a.pRaw)}`;
  return a.significant
    ? `${est} The raw Seasonal Mann-Kendall test yields ${p}, below α = ${a.alpha}; the null hypothesis of no monotonic trend is rejected. Statistical significance does not by itself establish practical importance or causality.`
    : `${est} The raw Seasonal Mann-Kendall test yields ${p}, which does not fall below α = ${a.alpha}; the null hypothesis of no monotonic trend is not rejected. This outcome does not demonstrate the absence of a trend; a longer record may resolve the question.`;
}

export function compareHeadline(c: ComparisonEntry): string {
  const s = compareStamp(c);
  const pair = `${c.a.label} versus ${c.b.label}`;
  if (c.kind !== "regions") return `${c.variableName}, ${pair}: descriptive comparison of two datasets`;
  return s.text === "Difference confirmed" ? `${c.variableName}, ${pair}: statistically significant difference in trends`
    : s.text === "Inconclusive" ? `${c.variableName}, ${pair}: difference in trends inconclusive`
    : s.text === "Not tested" ? `${c.variableName}, ${pair}: difference not testable`
    : `${c.variableName}, ${pair}: no significant difference in trends`;
}

export function compareStatement(c: ComparisonEntry): string {
  const d = c.test?.difference;
  if (c.kind !== "regions" || !d) return c.strength;
  const iv = d.ci ? `${num(d.ci[0])} to ${num(d.ci[1])} ${c.units} per decade` : "not available";
  return `The estimated difference (A minus B) is ${signedNum(d.slope_diff_per_decade)} ${c.units} per decade. The block-bootstrap test yields p = ${pText(d.p_value)} `
    + `and a 95% interval of ${iv}. A difference is reported as significant only when p < 0.05 and the interval excludes zero. ${c.strength}`;
}

/** Abstract: one sentence per item, all from the statements above. */
export function abstractText(m: ReportModel): string {
  const products = [...new Set(m.datasets.map((d) => d.product))].join(", ") || "NASA Earth observation products";
  const parts = [
    `This report examines ${m.analyses.length} monthly time series${m.comparisons.length ? ` and ${m.comparisons.length} comparison${m.comparisons.length === 1 ? "" : "s"}` : ""} derived from ${products}, `
    + "using the Seasonal Mann-Kendall test for monotonic trend and the seasonal Sen slope estimator.",
    ...m.analyses.map((a) => `${defaultHeadline(a)} (${signedNum(a.slope)} ${a.units} per decade, p ${pText(a.pRaw)}).`),
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

/** Markdown for either edition: title, abstract, findings in academic wording, then the full Scientific body (every number). */
export function editionMarkdown(m: ReportModel, edition: Edition, x: Extras = {}): string {
  const body = toMarkdown(m, "scientific").split("\n").slice(1).join("\n");   // drop the generic first heading
  const head = [
    `# ${x.title?.trim() || "Trend analysis of NASA Earth observation records"}`, "",
    `- Edition: ${edition === "scientist" ? "Scientist" : "Simple"}`, ...(x.author?.trim() ? [`- Prepared by: ${x.author.trim()}`] : []), "",
    "## Abstract", "", abstractText(m), "",
    "## Key findings", "",
    ...m.analyses.map((a) => `- ${x.headlines?.[a.key]?.trim() || defaultHeadline(a)}. ${resultStatement(a)}`),
    ...m.comparisons.map((c) => `- ${compareHeadline(c)}. ${compareStatement(c)}`), "",
  ];
  const notes = m.analyses.filter((a) => x.notes?.[a.key]?.trim()).map((a) => `- ${a.parameter}, ${a.place}: ${x.notes![a.key].trim()}`);
  return [...head, body.trimStart(), ...(notes.length ? ["", "## Author notes (not part of the evidence)", "", ...notes] : []), ""].join("\n");
}
