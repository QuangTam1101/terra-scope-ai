// "Start investigating" (F5): three plain questions → a short ranked list of variables (wizard.ts), each opening
// Explore through the share-link state (urlState.ts). Matching curated cases (starterCases.ts) show as research clues.
// Nothing is computed here: numbers come from the backend once Explore runs the link.
import { useState } from "react";
import type { BBox } from "./api";
import { InfoButton } from "./InfoButton";
import { MapPick, describeBox } from "./hunt/MapPick";
import { clampPeriod, periodEnd, periodStart, periodText } from "./period";
import { useStore } from "./store";
import { exploreHash, linkPlace } from "./urlState";
import { PLACES, TOPICS, cluesFor, rankVariables, regionFor, type PeriodChoice, type PlaceId, type Suggested, type TopicId } from "./wizard";

// The Detective already has a reviewed answer for this question (backend chat FAQ).
const IDEAS_QUESTION = "What should I investigate next?";
const FIRST_YEAR = 2001;

export function CaseStarter() {
  const { variables, regions, audience, sel, chatContext, sendChat, chatBusy, ready, go } = useStore();
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [place, setPlace] = useState<PlaceId | null>(null);
  const [drawn, setDrawn] = useState<BBox | null>(null);
  const [picking, setPicking] = useState(false);
  const [kind, setKind] = useState<PeriodChoice["kind"]>("longest");
  const lastYear = Math.max(FIRST_YEAR, ...variables.filter((v) => v.coverage).map((v) => Number(v.coverage!.end.slice(0, 4))));
  const [from, setFrom] = useState(FIRST_YEAR);
  const [to, setTo] = useState<number | null>(null);   // null: latest year with data
  const choice: PeriodChoice = kind === "custom" ? { kind, from, to: to ?? lastYear } : { kind };
  const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

  const suggested: Suggested | null = topic && place
    ? place === "map" ? (drawn && { name: describeBox(drawn), ref: { type: "bbox", bbox: drawn } }) : regionFor(topic, place) : null;
  const presetId = suggested?.ref.type === "preset" ? suggested.ref.id : null;
  const preset = presetId ? regions.find((r) => r.id === presetId) : undefined;
  // A preset the backend does not list (older deployment): open Explore without a place rather than with a broken one.
  const linkTo = suggested && (!presetId || preset) ? linkPlace(suggested.ref) : undefined;
  const placeName = preset?.name ?? suggested?.name;
  const answered = !!topic && !!place && (place !== "map" || !!drawn);
  const list = answered ? rankVariables(topic!, place!, variables, choice) : [];
  const clues = answered ? cluesFor(topic!, place!) : [];

  const pickPlace = (p: PlaceId) => {
    if (p === "map") { setPlace("map"); setPicking(true); return; }
    setPlace(place === p ? null : p);
  };
  const askTerra = () => {
    void sendChat(IDEAS_QUESTION, chatContext ?? { variable_id: sel.variableId, region: sel.place.ref, start: periodStart(sel), end: periodEnd(sel) });
    go("detective");
  };

  return (
    <section className="card pad col wizard" style={{ gap: 14 }} aria-labelledby="case-starter-title">
      <h2 id="case-starter-title" style={{ fontSize: 24 }}>Start investigating</h2>
      <span className="small muted">Answer three quick questions. Terra suggests what to check, where, and for which years, then opens it for you.</span>

      <fieldset className="wiz-q">
        <legend>1 · What are you curious about?</legend>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {TOPICS.map((t) => (
            <button key={t.id} type="button" className={`chip${topic === t.id ? " on" : ""}`} aria-pressed={topic === t.id}
              onClick={() => setTopic(topic === t.id ? null : t.id)}>{t.label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="wiz-q">
        <legend>2 · What kind of place?</legend>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {PLACES.map((p) => (
            <button key={p.id} type="button" className={`chip${place === p.id ? " on" : ""}`} aria-pressed={place === p.id}
              onClick={() => pickPlace(p.id)}>{p.label}</button>
          ))}
        </div>
        {place === "map" && (
          <span className="small">{drawn ? <>Your place: {describeBox(drawn)} </> : "No place drawn yet. "}
            <button type="button" className="linkbtn" onClick={() => setPicking(true)}>{drawn ? "Change" : "Open the map"}</button></span>
        )}
      </fieldset>

      <fieldset className="wiz-q">
        <legend>3 · Over what period?</legend>
        <div className="seg wiz-seg" role="group" aria-label="Period">
          {([["longest", "All the years we have"], ["recent", "Last 10 years"], ["custom", "Choose years"]] as const).map(([k, label]) => (
            <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
        {kind === "custom" && (
          <div className="row period-row">
            <span className="small muted">From</span>
            <select className="select" aria-label="First year" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="small muted">to</span>
            <select className="select" aria-label="Last year" value={to ?? lastYear} onChange={(e) => setTo(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        <span className="small muted">Each dataset covers different years; Terra fits the period to each one.</span>
      </fieldset>

      {answered && (
        <div className="col" style={{ gap: 10 }} aria-live="polite">
          <b>{list.length ? `Try these${placeName ? ` in ${placeName}` : ""}:` : "No dataset fits these answers."}</b>
          {!list.length && <span className="small muted">
            {topic === "soil" && place === "ocean" ? "Soil is only on land. Pick another place or topic." : "None of the matching datasets has data in those years. Try a longer period."}
          </span>}
          <ol className="wiz-list">
            {list.map((s, i) => (
              <li key={s.variable.id} className="wiz-item">
                <span className="wiz-rank" aria-hidden="true">{i + 1}</span>
                <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                  <span><b>{s.variable.parameter_name}</b> <span className="small muted">· {s.variable.dataset_name}</span> <InfoButton id={s.variable.id} /></span>
                  <span className="small">{s.reason}</span>
                  <span className="small muted">
                    {placeName ?? "Your place"} · {periodText(s.start, s.end)}
                    {s.clamped && kind !== "longest" ? " (fitted to this dataset's years)" : ""}
                    {s.short ? ". Under 10 years: too short to test a trend." : ""}
                  </span>
                </div>
                <a className="btn" href={exploreHash({ variableId: s.variable.id, place: linkTo, start: s.start, end: s.end, view: "trend" })}>Open in Explore</a>
              </li>
            ))}
          </ol>
          {clues.map((c) => {
            const v = variables.find((x) => x.id === c.variable_id && x.available);
            const p = v && clampPeriod(c.start, c.end, v.coverage);   // a dataset may end earlier than when the case was written
            return (
              <article key={c.id} className="wiz-clue col">
                <b className="small">Clue from research: {c.question}</b>
                <span className="small">{c.hypothesis}</span>
                <span className="small muted">
                  {c.placeName} · {periodText(p ? p.start : c.start, p ? p.end : c.end)}{audience === "scientist" && v ? ` · ${v.parameter_name}, ${v.dataset_name}` : ""}.{" "}
                  Source: <a href={c.source.url} target="_blank" rel="noreferrer">{c.source.title}</a>, {c.source.publisher}, {c.source.year}
                </span>
                {p && <a className="btn soft" style={{ alignSelf: "flex-start" }}
                  href={exploreHash({ variableId: c.variable_id, place: linkPlace(c.place), start: p.start, end: p.end, view: "trend" })}>Test this clue</a>}
              </article>
            );
          })}
        </div>
      )}

      <div>
        <button type="button" className="btn ghost" disabled={!ready || chatBusy} onClick={askTerra}>Ask Terra for more ideas</button>
      </div>
      {picking && <MapPick slot={null} initial={drawn} onCancel={() => { setPicking(false); if (!drawn) setPlace(null); }}
        onConfirm={(b) => { setDrawn(b); setPicking(false); }} />}
    </section>
  );
}
