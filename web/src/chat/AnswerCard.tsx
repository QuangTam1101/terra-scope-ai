// Detective answer card: the explanation first, then compact evidence cards, the between-region test, actions and
// the fine print. Everything shown comes from the chat response (backend tool results); this file only lays it out.
import type { ChatAction, ChatEvidence, ChatResponse, CompareResponse, Variable } from "../api";
import { ScientificPanel } from "../ScientificPanel";
import { ToolDetails } from "../ToolDetails";
import { signed, Terra, VerdictBadge } from "../ui";
import { convAllText, convFor, type Conv } from "../units";
import { XIcon } from "../report/EditionDoc";
import { periodText } from "../period";

const CAVEAT = /causalit|forecast|not why|hypothes|not proof|do not establish|cannot establish/i;
const pText = (p: number | null | undefined) => (p === null || p === undefined ? "n/a" : p < 0.001 ? "< 0.001" : p.toFixed(3));
const isC = (u: string) => u === "degC" || u === "°C";
const deg = (v: number, pos: string, neg: string) => `${Math.abs(v)}°${v >= 0 ? pos : neg}`;
/** Region name, or a readable box when the area has no catalog name. */
const placeName = (r: { name?: string | null; bbox: [number, number, number, number] }) =>
  r.name ?? `Area ${deg(r.bbox[1], "N", "S")} to ${deg(r.bbox[3], "N", "S")}, ${deg(r.bbox[0], "E", "W")} to ${deg(r.bbox[2], "E", "W")}`;

/** Splits the answer into readable paragraphs, a data line and caveats (no words are changed). */
export function splitAnswer(text: string): { paragraphs: string[]; data: string[]; caveats: string[] } {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
  const data: string[] = [], caveats: string[] = [], main: string[] = [];
  for (const s of sentences) (/^Data: /.test(s) ? data : CAVEAT.test(s) ? caveats : main).push(s);
  const paragraphs: string[] = [];
  for (let i = 0; i < main.length; i += 2) paragraphs.push(main.slice(i, i + 2).join(" "));
  return { paragraphs, data: [...new Set(data)], caveats: [...new Set(caveats)] };
}

/** Numbers in chat results are raw API units; the store's variables may already carry the shown label (°F, % water). */
function shownUnits(raw: string, v: Variable | undefined, conv: Conv | null) {
  return conv ? conv.to : isC(raw) ? "°C" : (v?.display_units ?? raw);
}

function EvidenceCard({ evidence, fahrenheit, audience, variables }: { evidence: ChatEvidence; fahrenheit: boolean; audience: string; variables: Variable[] }) {
  const t = evidence.trend;
  const v = variables.find((x) => x.id === t.variable_id);
  const conv = convFor(v?.display_units ?? (isC(t.units) ? "°C" : undefined), fahrenheit ? "F" : "C", audience), f = conv?.k ?? 1;
  const units = shownUnits(t.units, v, conv);
  const slope = t.slope_per_decade === null ? null : t.slope_per_decade * f;
  const dir = !t.quality.sufficient || slope === null ? "none" : slope > 0 ? "up" : slope < 0 ? "down" : "flat";
  return (
    <article className="ev-card" aria-label={`Evidence for ${placeName(t.region)}`}>
      <div className="ev-head">
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <b className="ev-title">{v?.parameter_name ?? t.variable_id} · {placeName(t.region)}</b>
          <span className="small muted">{v?.dataset_name ?? t.source.product} · {periodText(t.start, t.end)}</span>
        </div>
        <VerdictBadge t={t} />
      </div>
      <div className={`ev-rate ${dir}`}>
        <XIcon name={dir} size={28} />
        <span className="ev-num">{signed(slope)}</span><span className="ev-unit">{units} per decade</span>
      </div>
      <div className="ev-facts">
        <span><b>{pText(t.p_value)}</b> p-value</span>
        <span><b>{t.quality.n_months}</b> months{t.quality.missing_months ? `, ${t.quality.missing_months} missing` : ""}</span>
        <span><b>{Math.round(t.quality.coverage_fraction * 100)}%</b> of the area</span>
      </div>
      <details className="ev-more">
        <summary>Details and method</summary>
        <ul>
          <li>Trend test: Seasonal Mann-Kendall (raw p {pText(t.p_value)}, threshold {t.alpha}); the rate is Sen's slope per decade.</li>
          <li>Autocorrelation-adjusted p (diagnostic only): {pText(t.p_value_autocorr_adjusted)}.</li>
          <li>95% OLS interval on anomalies: {t.slope_ci ? `${signed(t.slope_ci[0] * f)} to ${signed(t.slope_ci[1] * f)} ${units} per decade` : "unavailable"} (a different estimator from Sen's slope).</li>
          <li>Data: <a href={t.source.url} target="_blank" rel="noreferrer">{t.source.product} v{t.source.version}</a>, {t.source.provider}.</li>
          <li className="muted">Evidence ID {t.trend_id}</li>
        </ul>
        {evidence.scientific_advice && <ScientificPanel advice={evidence.scientific_advice} />}
      </details>
    </article>
  );
}

function CompareCard({ c, fahrenheit, audience, variables }: { c: CompareResponse; fahrenheit: boolean; audience: string; variables: Variable[] }) {
  const v = variables.find((x) => x.id === c.a.variable_id);
  const conv = convFor(v?.display_units ?? (isC(c.a.units) ? "°C" : undefined), fahrenheit ? "F" : "C", audience);
  const d = c.difference, f = conv?.k ?? 1, u = shownUnits(c.a.units, v, conv);
  const crosses = !!d.ci && d.ci[0] <= 0 && d.ci[1] >= 0;
  const st = d.p_value === null ? { t: "Not tested", cls: "ne" } : d.significant ? { t: "Difference confirmed", cls: "sig" }
    : d.p_value < 0.05 && crosses ? { t: "Inconclusive", cls: "inc" } : { t: "No significant difference", cls: "np" };
  return (
    <section className="ev-compare" aria-label="Between-region comparison">
      <div className="ev-head"><b className="ev-title">Do the two trends really differ?</b><span className={`badge ${st.cls}`}>{st.t}</span></div>
      <div className="ev-facts">
        <span><b>{signed(d.slope_diff_per_decade === null ? null : d.slope_diff_per_decade * f)}</b> {u} per decade, trend of the gap (A minus B)</span>
        <span><b>{pText(d.p_value)}</b> p-value of the difference</span>
        <span><b>{d.ci ? `${signed(d.ci[0] * f)} to ${signed(d.ci[1] * f)}` : "n/a"}</b> 95% interval</span>
      </div>
      <span className="small">A difference counts only when p is below 0.05 <b>and</b> the interval excludes zero. Different or opposite slopes alone are not proof.</span>
      <details className="ev-more"><summary>Method</summary>
        <ul><li>Hamed-Rao Mann-Kendall test on the monthly anomaly difference series (A minus B); its trend is Sen's slope; a moving-block bootstrap (12-month blocks) gives the 95% interval.</li>
          <li className="muted">Comparison ID {c.compare_id}</li></ul></details>
    </section>
  );
}

export function AnswerCard({ response, fahrenheit, audience, variables, onAction }: { response: ChatResponse; fahrenheit: boolean; audience: string; variables: Variable[]; onAction: (a: ChatAction) => void }) {
  const llm = response.mode === "llm";
  const { paragraphs, caveats } = splitAnswer(convAllText(response.answer, fahrenheit ? "F" : "C", audience));
  const compares = (response.tool_results ?? []).filter((r) => r.ok && r.tool === "compare_regions").map((r) => r.data as CompareResponse);
  const others = (response.tool_results ?? []).filter((r) => !(r.ok && r.tool === "compare_regions"));
  // Only a fallback notice stays visible (it changes how to read the answer); the general disclaimer is shown once at the top of the page.
  const fallback = response.warnings.filter((w, i, all) => w.code === "LLM_FALLBACK" && all.findIndex((x) => x.message === w.message) === i);
  return (
    <div className={`card bubble-ai answer ${llm ? "" : "template"}`}>
      <div className="answer-head">
        <Terra size={34} />
        <span className="tag-ai">{llm ? "Gemini AI Mode" : "Template Mode: AI unavailable"}</span>
      </div>
      <div className="answer-text">{paragraphs.map((p) => <p key={p}>{p}</p>)}</div>
      {fallback.map((w) => <span key={w.message} className="small muted" role="status">{w.message}</span>)}
      {response.clarification && <span className="warn" role="status">Selection needed: {response.clarification}</span>}
      {response.evidence.length > 0 && (
        <div className={`ev-grid ${response.evidence.length > 1 ? "two" : ""}`}>
          {response.evidence.map((e) => <EvidenceCard key={e.trend.trend_id} evidence={e} fahrenheit={fahrenheit} audience={audience} variables={variables} />)}
        </div>
      )}
      {compares.map((c) => <CompareCard key={c.compare_id} c={c} fahrenheit={fahrenheit} audience={audience} variables={variables} />)}
      {others.map((r, i) => <ToolDetails key={`${r.tool}-${i}`} result={r} fahrenheit={fahrenheit} />)}
      {caveats.length > 0 && <ul className="answer-caveats" aria-label="What this cannot tell us">{caveats.map((c) => <li key={c}>{c}</li>)}</ul>}
      {response.actions.length > 0 && (
        <div className="answer-actions">{response.actions.map((a, k) => <button key={k} type="button" className="btn soft" onClick={() => onAction(a)}>{a.label}</button>)}</div>
      )}
    </div>
  );
}
