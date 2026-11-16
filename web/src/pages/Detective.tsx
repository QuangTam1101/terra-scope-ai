import { useState } from "react";
import type { ChatAction, ChatContext } from "../api";
import { useStore } from "../store";
import { periodEnd, periodStart } from "../period";
import { planChatNavigation } from "../chatNavigation";
import { countryPlace } from "../places";
import { AnswerCard } from "../chat/AnswerCard";
import { signed, Terra } from "../ui";
import { rateOf, rateUnit } from "../units";

export const EXPLORER_QUESTIONS = ["What does this result mean?", "Is the trend clear?", "Can you explain the p-value?",
  "Why do these datasets disagree?", "What should I investigate next?"];
export const SCIENTIST_QUESTIONS = ["What statistical test was applied?", "How was serial dependence handled?",
  "What is the basis for the significance verdict?", "Was BH-FDR applied to raw p-values?", "Does the reported confidence interval correspond to Sen's slope?"];

export function Detective() {
  const { run, sel, variable, regions, variables, runAnalysis, go, tempUnit, ready, chatContext, setSel, setHuntSelection,
    chatTurns: turns, chatBusy: busy, sendChat, clearChat, audience } = useStore();
  const F = tempUnit === "F";
  const [text, setText] = useState("");
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const matchesRun = !chatContext && run?.variable.id === sel.variableId
    && run.trend.start === periodStart(sel) && run.trend.end === periodEnd(sel)
    && JSON.stringify(run.place.ref) === JSON.stringify(sel.place.ref);
  const context: ChatContext = chatContext ?? {
    variable_id: sel.variableId, dataset_id: variable?.source.product, region: sel.place.ref,
    start: periodStart(sel), end: periodEnd(sel),
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
    const plan = planChatNavigation(action, variables, regions, countryPlace);
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
          <span className="small muted">{contextVariable?.parameter_name ?? context.parameter ?? "Choose a variable"} · {contextVariable?.dataset_name ?? "Choose a dataset"} · {contextRegion} · {context.start} to {context.end}</span>
        </div>
      </section>
      <div role="note" className="card pad" style={{ border: "2px solid var(--ink)", font: "700 14px/1.45 var(--body)" }}>
        Terra only explains numbers from the statistics engine and can be wrong, especially about causes. Trend lines are past trends, not forecasts.
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
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
              <AnswerCard response={t.response} fahrenheit={F} audience={audience} variables={variables} onAction={(a) => void act(a)} />
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
        {(turns.filter((t) => t.response).at(-1)?.response?.suggested_questions ?? (audience === "scientist" ? SCIENTIST_QUESTIONS : EXPLORER_QUESTIONS)).map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy || !ready}>{s}</button>
        ))}
      </div>
      <form className="row" data-tour="detective-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label htmlFor="q" style={{ position: "absolute", left: -9999 }}>Ask Terra</label>
        <input id="q" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Ask about the selected place or a method…"
          style={{ flex: 1, minHeight: 50, border: "2px solid var(--line)", borderRadius: 999, padding: "0 18px", font: "600 15px var(--body)", color: "var(--ink)" }} />
        <button type="submit" className="btn" disabled={busy || !ready || !text.trim()}>{busy ? "Checking…" : "Ask"}</button>
      </form>
    </div>
    <aside className="col" style={{ gap: 16 }} data-tour="detective-evidence">
      <section className="card pad col" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 18 }}>Current context</h2>
        <span style={{ fontWeight: 800 }}>{contextVariable?.parameter_name} · {contextVariable?.dataset_name}</span>
        <span className="small muted">{contextRegion} · {context.start} to {context.end}</span>
        {matchesRun && run ? (
          <>
            <div className="grid2">
              <div className="stat"><b>{run.trend.slope_per_decade === null ? "n/a" : signed(rateOf(run.trend.slope_per_decade, run.variable.display_units), 2)}</b><small>{rateUnit(run.variable.display_units)} per decade</small></div>
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
