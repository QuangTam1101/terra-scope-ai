// F5 "Not sure where to start?": pick a place type and/or a curiosity, get 1–3 curated cases to investigate.
// Cards show parameters and a sourced hypothesis only; numbers come from the backend after Investigate.
import { useState } from "react";
import { useStore } from "./store";
import { periodEnd, periodStart, periodText } from "./period";
import { CURIOSITIES, PLACE_TYPES, STARTER_CASES, matchCases, type Curiosity, type PlaceType, type StarterCase } from "./starterCases";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const usedCuriosities = CURIOSITIES.filter((k) => STARTER_CASES.some((c) => c.curiosity === k));
// The Detective already has a reviewed answer for this question (backend chat FAQ).
const IDEAS_QUESTION = "What should I investigate next?";

export function CaseStarter({ onPick }: { onPick: (c: StarterCase) => void }) {
  const { variables, regions, audience, sel, chatContext, sendChat, chatBusy, ready, go } = useStore();
  const [placeType, setPlaceType] = useState<PlaceType | null>(null);
  const [curiosity, setCuriosity] = useState<Curiosity | null>(null);
  const picked = placeType !== null || curiosity !== null;
  const cases = picked ? matchCases(placeType, curiosity).slice(0, 3) : [];

  const askTerra = () => {
    void sendChat(IDEAS_QUESTION, chatContext ?? { variable_id: sel.variableId, region: sel.place.ref, start: periodStart(sel), end: periodEnd(sel) });
    go("detective");
  };

  return (
    <section className="card pad col" style={{ gap: 12 }} aria-labelledby="case-starter-title">
      <h2 id="case-starter-title" style={{ fontSize: 20 }}>Not sure where to start?</h2>
      <span className="small muted">Pick a kind of place or a question. Each case brings a clue from real research for you to test.</span>
      <b className="small">What kind of place?</b>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        {PLACE_TYPES.map((p) => (
          <button key={p} type="button" className={`chip${placeType === p ? " on" : ""}`} aria-pressed={placeType === p}
            onClick={() => setPlaceType(placeType === p ? null : p)}>{cap(p)}</button>
        ))}
      </div>
      <b className="small">What are you curious about?</b>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        {usedCuriosities.map((k) => (
          <button key={k} type="button" className={`chip${curiosity === k ? " on" : ""}`} aria-pressed={curiosity === k}
            onClick={() => setCuriosity(curiosity === k ? null : k)}>{cap(k)}</button>
        ))}
      </div>
      {picked && cases.length === 0 && <span className="small muted">No case for this pair yet. Try another chip.</span>}
      {cases.map((c) => {
        const v = variables.find((x) => x.id === c.variable_id && x.available);
        const placeReady = c.place.type === "bbox" || regions.some((r) => c.place.type === "preset" && r.id === c.place.id);
        const runnable = !!v && placeReady;
        return (
          <article key={c.id} className="card pad col" style={{ gap: 6, boxShadow: "none", border: "2px solid var(--line)" }}>
            <b>{c.question}</b>
            <span className="small">Clue to test: {c.hypothesis}</span>
            <span className="small muted">
              {c.placeName} · {periodText(c.start, c.end)}{audience === "scientist" ? ` · ${v ? `${v.parameter_name}, ${v.dataset_name}` : c.variable_id}` : ""}
            </span>
            <span className="small">Source: <a href={c.source.url} target="_blank" rel="noreferrer">{c.source.title}</a>, {c.source.publisher}, {c.source.year}</span>
            <div className="row" style={{ alignItems: "center", gap: 8 }}>
              <button type="button" className="btn" disabled={!runnable} onClick={() => onPick(c)}>Investigate</button>
              {!runnable && <span className="small muted">This dataset or place is not loaded yet.</span>}
            </div>
          </article>
        );
      })}
      <div>
        <button type="button" className="btn soft" disabled={!ready || chatBusy} onClick={askTerra}>Ask Terra for more ideas</button>
      </div>
    </section>
  );
}
