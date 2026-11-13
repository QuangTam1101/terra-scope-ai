import { useState } from "react";
import { api, type ExplainResponse } from "../api";
import { useStore } from "../store";
import { textToF } from "../units";
import { Terra } from "../ui";

interface Turn { q: string; a?: ExplainResponse }

export function Detective() {
  const { run, sel, variable, regions, variables, showError, runAnalysis, go, tempUnit } = useStore();
  const F = tempUnit === "F";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setTurns((t) => [...t, { q }]);
    setText("");
    setBusy(true);
    try {
      const context: Record<string, unknown> = run
        ? { trend_ids: [run.trend.trend_id] }
        : { variable_id: variable?.id, region: sel.place.ref, period: `${sel.startYear}-01/${sel.endYear}-12` };
      const a = await api.explain(q, context);
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    } catch (e) { showError(e); setTurns((t) => t.slice(0, -1)); } finally { setBusy(false); }
  };

  const act = (params: Record<string, unknown>) => {
    const v = variables.find((x) => x.id === params.variable_id);
    const region = params.region as { type: string; id?: string; bbox?: [number, number, number, number] } | undefined;
    if (!v || !region) return;
    const r = region.id ? regions.find((x) => x.id === region.id) : undefined;
    const place = r ? { ref: { type: "preset" as const, id: r.id }, label: r.name, bbox: r.bbox }
      : { ref: { type: "bbox" as const, bbox: region.bbox! }, label: "Selected area", bbox: region.bbox! };
    go("explore");
    runAnalysis({ parameter: v.parameter, variableId: v.id, place });
  };

  const offline = (m: string) => /no language model|offline|template/i.test(m);
  return (
    <div className="detective">
    <div className="col" style={{ gap: 16, minWidth: 0 }}>
      <section className="card pad row" style={{ alignItems: "center" }}>
        <Terra size={70} />
        <div className="col" style={{ gap: 4, flex: 1 }}>
          <h1 style={{ fontSize: 28 }}>Ask Terra</h1>
          <span className="small muted">{run ? `Talking about: ${run.variable.parameter_name} · ${run.variable.dataset_name} · ${run.place.label}` : "Run an analysis first, or ask about the current selection."}</span>
        </div>
      </section>
      <div role="note" className="card pad" style={{ border: "2px solid var(--ink)", font: "700 14px/1.45 var(--body)" }}>
        Terra only explains numbers from the statistics engine and can be wrong, especially about causes. Trend lines are past trends, not forecasts.
      </div>
      <div className="col" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className="col">
            <div className="bubble-user">{t.q}</div>
            {t.a ? (
              <div className="card bubble-ai" style={offline(t.a.model) ? { border: "2px dashed #8d86a0", boxShadow: "none" } : undefined}>
                <span className="tag-ai">{offline(t.a.model) ? "OFFLINE · TEMPLATE ANSWER, NO AI MODEL USED" : "AI-GENERATED"}</span>
                <p style={{ margin: 0, font: "600 15px/1.55 var(--body)" }}>{F ? textToF(t.a.answer) : t.a.answer}</p>
                {t.a.cited_numbers.length > 0 && (
                  <div>{t.a.cited_numbers.map((c) => (F && c.units.startsWith("°C") ? { ...c, value: c.value * 1.8, units: c.units.replace("°C", "°F") } : c)).map((c) => (
                    <span key={c.source_field} className="pill" title={`Source field: ${c.source_field}`}>
                      <b>{c.units === "probability" ? (c.value < 0.001 ? "p <0.001" : `p = ${c.value.toFixed(3)}`) : `${c.value > 0 ? "+" : ""}${Number(c.value.toPrecision(3))} ${c.units}`}</b>
                      <small>{c.label}</small>
                    </span>
                  ))}</div>
                )}
                {t.a.actions.map((a, k) => (
                  <button key={k} type="button" className="btn soft" style={{ alignSelf: "flex-start" }} onClick={() => act(a.params)}>
                    Run this analysis: {String(variables.find((v) => v.id === a.params.variable_id)?.parameter_name ?? a.params.variable_id)}
                  </button>
                ))}
                {t.a.warnings.map((w) => <span key={w} className="small muted">{w}</span>)}
                <span className="small muted">{t.a.disclaimer}</span>
              </div>
            ) : <div className="skel" style={{ height: 80, width: "70%" }} />}
          </div>
        ))}
      </div>
      <div className="row">
        {["Is it getting warmer here?", "Is this trend real or just noise?", "What does the p-value mean here?"].map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label htmlFor="q" style={{ position: "absolute", left: -9999 }}>Ask Terra</label>
        <input id="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a place or a trend…"
          style={{ flex: 1, minHeight: 50, border: "2px solid var(--line)", borderRadius: 999, padding: "0 18px", font: "600 15px var(--body)", color: "var(--ink)" }} />
        <button type="submit" className="btn" disabled={busy || !text.trim()}>{busy ? "Thinking…" : "Ask"}</button>
      </form>
    </div>
    <aside className="col" style={{ gap: 16 }}>
      <section className="card pad col" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 18 }}>Evidence Terra is using</h2>
        {run ? (
          <>
            <span style={{ fontWeight: 800 }}>{run.variable.parameter_name} · {run.variable.dataset_name}</span>
            <span className="small muted">{run.place.label} · {run.trend.start} to {run.trend.end}</span>
            <div className="grid2">
              <div className="stat"><b>{run.trend.slope_per_decade === null ? "n/a" : `${run.trend.slope_per_decade > 0 ? "+" : ""}${run.trend.slope_per_decade.toFixed(2)}`}</b><small>{run.variable.display_units} per decade</small></div>
              <div className="stat"><b>{run.trend.p_value === null ? "n/a" : run.trend.p_value < 0.001 ? "<0.001" : run.trend.p_value.toFixed(3)}</b><small>Mann–Kendall p</small></div>
            </div>
            <button type="button" className="btn soft" onClick={() => go("explore")}>Open this case</button>
          </>
        ) : <span className="small muted">No analysis yet. Terra will use the place and variable selected on Explore.</span>}
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
        <span className="small">{(run?.variable ?? variable)?.source.product} v{(run?.variable ?? variable)?.source.version}</span>
        <span className="small muted">{(run?.variable ?? variable)?.source.provider}</span>
      </section>
    </aside>
    </div>
  );
}
