import { useEffect, useState } from "react";
import { api, type ChatAction, type ChatContext, type ChatEvidence } from "../api";
import { useStore } from "../store";
import { planChatNavigation } from "../chatNavigation";
import { ToolDetails } from "../ToolDetails";
import { ScientificPanel } from '../ScientificPanel';
import { textToF } from "../units";
import { Terra } from "../ui";

function Evidence({ evidence, fahrenheit }: { evidence: ChatEvidence; fahrenheit: boolean }) {
  const t = evidence.trend;
  const temperature = t.units === "degC" || t.units === "°C";
  const factor = temperature && fahrenheit ? 1.8 : 1;
  const units = temperature ? (fahrenheit ? "°F" : "°C") : t.units;
  return (
    <section className="col" style={{ gap: 6 }} aria-label="Analysis evidence">
      <b>{t.variable_id} · {t.source.product} · {t.region.name ?? "Selected area"} · {t.start} to {t.end}</b>
      <span className="small muted">Raw backend evidence. Interpretation appears above.</span>
      <div>{evidence.cited_numbers.map((c) => (fahrenheit && c.units.startsWith("°C")
        ? { ...c, value: c.value * 1.8, units: c.units.replace("°C", "°F") } : c)).map((c) => (
        <span key={c.source_field} className="pill" title={`Source field: ${c.source_field}`}>
          <b>{c.units === "probability" ? (c.value < 0.001 ? "p <0.001" : `p = ${c.value.toFixed(3)}`)
            : `${c.value > 0 ? "+" : ""}${Number(c.value.toPrecision(3))} ${c.units}`}</b>
          <small>{c.label}</small>
        </span>
      ))}</div>
      <span className="small muted">95% OLS interval: {t.slope_ci
        ? `${(t.slope_ci[0] * factor).toPrecision(3)} to ${(t.slope_ci[1] * factor).toPrecision(3)} ${units} per decade`
        : "unavailable"}. This interval uses OLS on anomalies, a different estimator from Sen's slope.</span>
      <details className="small muted">
        <summary>Source and methods</summary>
        <div className="col" style={{ gap: 4, marginTop: 6 }}>
          <a href={t.source.url} target="_blank" rel="noreferrer">{t.source.product} v{t.source.version}</a>
          <span>{t.source.provider} · {t.source.citation}</span>
          <span>Test: {t.method} · slope: {t.slope_method} · interval: {t.ci_method}</span>
          <span>{t.quality.n_months} valid months · {t.quality.missing_months} missing · significance threshold {t.alpha}</span>
          <span>Raw p: {t.p_value ?? "unavailable"} · autocorrelation-adjusted p: {t.p_value_autocorr_adjusted ?? "unavailable"}. The reported decision uses the raw seasonal test.</span>
          <span>Analysis: {t.trend_id}</span>
        </div>
      </details>
      {evidence.scientific_advice && <ScientificPanel advice={evidence.scientific_advice} />}
    </section>
  );
}

export function Detective() {
  const { run, sel, variable, regions, variables, runAnalysis, go, tempUnit, ready, chatContext, setSel, setHuntSelection,
    chatTurns: turns, chatBusy: busy, sendChat, clearChat } = useStore();
  const F = tempUnit === "F";
  const [text, setText] = useState("");
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  useEffect(() => { let active = true; void api.llmStatus().then((s) => { if (active) setProvider(s.provider); }).catch(() => {}); return () => { active = false; }; }, []);
  const lastResponse = turns.filter((t) => t.response).at(-1)?.response;
  const matchesRun = !chatContext && run?.variable.id === sel.variableId
    && run.trend.start === `${sel.startYear}-01` && run.trend.end === `${sel.endYear}-12`
    && JSON.stringify(run.place.ref) === JSON.stringify(sel.place.ref);
  const context: ChatContext = chatContext ?? {
    variable_id: sel.variableId, dataset_id: variable?.source.product, region: sel.place.ref,
    start: `${sel.startYear}-01`, end: `${sel.endYear}-12`,
    ...(matchesRun && run ? { trend_id: run.trend.trend_id } : {}),
  };
  const contextVariable = context.variable_id ? variables.find((v) => v.id === context.variable_id) : undefined;
  const selectedRegion = context.region;
  const contextRegion = selectedRegion?.type === "preset" ? regions.find((r) => r.id === selectedRegion.id)?.name
    : selectedRegion?.type === "bbox" ? `Area ${selectedRegion.bbox.join(", ")}` : sel.place.label;

  const ask = (q: string) => {
    if (!q.trim() || busy || !ready) return;
    setText("");
    void sendChat(q, context);
  };

  const act = async (action: ChatAction) => {
    const plan = planChatNavigation(action, variables, regions);
    if (!plan.ok) { setNavigationError(plan.reason); return; }
    setNavigationError(null);
    if (plan.page === "hunt" && plan.hunt) {
      setSel(plan.selection); setHuntSelection(plan.hunt); go("hunt");
    } else if (await runAnalysis(plan.selection)) {
      go(plan.page);
    }
  };

  return (
    <div className="detective">
    <div className="col" style={{ gap: 16, minWidth: 0 }}>
      <section className="card pad row" style={{ alignItems: "center" }}>
        <Terra size={70} />
        <div className="col" style={{ gap: 4, flex: 1 }}>
          <h1 style={{ fontSize: 28 }}>Ask Terra</h1>
          <span className="tag-ai">{lastResponse ? (lastResponse.mode === "llm" ? "Gemini AI Mode" : "Template Mode — AI unavailable") : provider === "gemini" ? "Gemini selected" : provider === "template" ? "Template Mode" : "Checking AI mode…"}</span>
          <span className="small muted">{contextVariable?.parameter_name ?? context.parameter ?? "Choose a variable"} · {contextVariable?.dataset_name ?? "Choose a dataset"} · {contextRegion} · {context.start} to {context.end}</span>
        </div>
      </section>
      <div role="note" className="card pad" style={{ border: "2px solid var(--ink)", font: "700 14px/1.45 var(--body)" }}>
        Terra only explains numbers from the statistics engine and can be wrong, especially about causes. Trend lines are past trends, not forecasts.
      </div>
      <div className="row">
        <span className="small muted" style={{ flex: 1 }}>Conversation stays while you navigate. Reloading clears it.</span>
        <button type="button" className="btn soft" disabled={busy || turns.length === 0} onClick={clearChat}>Clear chat</button>
      </div>
      {turns.length === 0 && <div className="card pad col">
        <b>Start with the selected place and dataset</b>
        <span className="small muted">Ask for a trend using catalog place names and dates. Follow-ups keep the verified context; ambiguous selections need clarification. Gemini can select safe tools when connected.</span>
      </div>}
      <div className="col" role="log" aria-label="Conversation" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className="col" style={{ overflowWrap: "anywhere" }}>
            <div className="bubble-user">{t.question}</div>
            {t.response ? (
              <div className="card bubble-ai" style={t.response.mode === "template" ? { border: "2px dashed #8d86a0", boxShadow: "none" } : undefined}>
                <span className="tag-ai">{t.response.mode === "llm" ? "Gemini AI Mode" : "Template Mode — AI unavailable"}</span>
                <p style={{ margin: 0, font: "600 15px/1.55 var(--body)" }}>{F ? textToF(t.response.answer) : t.response.answer}</p>
                {t.response.evidence.map((e) => <Evidence key={e.trend.trend_id} evidence={e} fahrenheit={F} />)}
                {t.response.tool_results?.map((result, index) => <ToolDetails key={`${result.tool}-${index}`} result={result} fahrenheit={F} />)}
                {t.response.clarification && <span className="warn" role="status">Selection needed: {t.response.clarification}</span>}
                {t.response.actions.map((a, k) => (
                  <button key={k} type="button" className="btn soft" style={{ alignSelf: "flex-start" }} onClick={() => void act(a)}>
                    {a.label}
                  </button>
                ))}
                {t.response.tool_results?.length ? <span className="small muted">Backend tools: {t.response.tool_results.map((r) => `${r.tool}: ${r.ok ? "verified" : "failed"}`).join(", ")}</span> : null}
                {t.response.warnings.filter((w, i, all) => w.code !== "TEMPLATE_MODE" && all.findIndex((x) => x.message === w.message) === i).map((w, k) => <span key={`${w.code}-${k}`} className="small muted">{w.message}</span>)}
                <span className="small muted">{t.response.disclaimer}</span>
              </div>
            ) : t.error ? <div className="card bubble-ai" role="alert">
              <b>Could not answer this message</b><span>{t.error}</span>
              <button type="button" className="btn soft" disabled={busy || !ready} onClick={() => void sendChat(t.question, t.context)}>Try again</button>
            </div> : <div role="status" className="col">
              <span className="small muted">Selecting safe tools, checking observations and preparing an explanation…</span>
              <div className="skel" aria-hidden="true" style={{ height: 80, width: "70%" }} />
            </div>}
          </div>
        ))}
      </div>
      {navigationError && <div className="warn" role="alert">{navigationError}</div>}
      <div className="row">
        {(turns.filter((t) => t.response).at(-1)?.response?.suggested_questions ?? ["What is the trend for the current selection?", "List available variables", "List available regions", "What is a confidence interval?"]).map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy || !ready}>{s}</button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label htmlFor="q" style={{ position: "absolute", left: -9999 }}>Ask Terra</label>
        <input id="q" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Ask about the selected place or a method…"
          style={{ flex: 1, minHeight: 50, border: "2px solid var(--line)", borderRadius: 999, padding: "0 18px", font: "600 15px var(--body)", color: "var(--ink)" }} />
        <button type="submit" className="btn" disabled={busy || !ready || !text.trim()}>{busy ? "Checking…" : "Ask"}</button>
      </form>
    </div>
    <aside className="col" style={{ gap: 16 }}>
      <section className="card pad col" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 18 }}>Current context</h2>
        <span style={{ fontWeight: 800 }}>{contextVariable?.parameter_name} · {contextVariable?.dataset_name}</span>
        <span className="small muted">{contextRegion} · {context.start} to {context.end}</span>
        {matchesRun && run ? (
          <>
            <div className="grid2">
              <div className="stat"><b>{run.trend.slope_per_decade === null ? "n/a" : `${run.trend.slope_per_decade > 0 ? "+" : ""}${run.trend.slope_per_decade.toFixed(2)}`}</b><small>{run.variable.display_units} per decade</small></div>
              <div className="stat"><b>{run.trend.p_value === null ? "n/a" : run.trend.p_value < 0.001 ? "<0.001" : run.trend.p_value.toFixed(3)}</b><small>Mann–Kendall p</small></div>
            </div>
          </>
        ) : <span className="small muted">Trend questions use this selection with the existing statistics engine.</span>}
        <button type="button" className="btn soft" onClick={() => go("explore")}>Change selection in Explore</button>
      </section>
      <section className="card pad col" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 18 }}>What Terra will not do</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55, fontSize: 14 }}>
          <li>Make up numbers: every number comes from the statistics engine.</li>
          <li>Forecast the future: trend lines describe the past.</li>
          <li>Claim a cause: a trend shows what changed, not why.</li>
        </ul>
      </section>
      <section className="card pad col" style={{ gap: 6 }}>
        <h2 style={{ fontSize: 18 }}>Data source</h2>
        <span className="small">{contextVariable?.source.product} v{contextVariable?.source.version}</span>
        <span className="small muted">{contextVariable?.source.provider}</span>
      </section>
    </aside>
    </div>
  );
}
