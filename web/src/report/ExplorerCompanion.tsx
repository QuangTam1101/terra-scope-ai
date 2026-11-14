// Interactive Explorer report (screen only, never printed). It explains the SAME evidence the PDF shows: every value
// comes from the report model (backend series and trend). Nothing here calls Gemini or recomputes statistics.
import { useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { LocatorMap } from "./ReportDoc";
import { dirIcon, dirWord, qualityChips, WORKFLOW, XIcon } from "./EditionDoc";
import { linearProjection, plainFinding, plainWords, productKind, testOutcome, trendStamp, yearlyMeans } from "./formd";
import { num, pText, signedNum, type AnalysisEntry, type ReportModel } from "./model";

type View = "yearly" | "monthly";
type Highlight = "none" | "above" | "below";
type Topic = "trend" | "p" | "how" | "matter" | "limits" | "data";

const fmt = (v: number, units: string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v))} ${units}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Bars of real values (yearly mean anomaly or monthly anomaly). Hover, focus and arrow keys show the exact value. */
export function EvidenceChart({ a, view, highlight }: { a: AnalysisEntry; view: View; highlight: Highlight }) {
  const pts = useMemo(() => view === "yearly"
    ? yearlyMeans(a.series).map((y) => ({ id: String(y.year), label: String(y.year), value: y.value as number | null, note: "average of the monthly anomalies that year" }))
    : a.series.points.map((p) => ({ id: p.t, label: `${MONTHS[Number(p.t.slice(5, 7)) - 1]} ${p.t.slice(0, 4)}`, value: p.anomaly, note: p.anomaly === null ? "no data this month" : "compared with the usual for this month" })),
  [a, view]);
  const [sel, setSel] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const vals = pts.map((p) => p.value).filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length < 2) return <p className="small">Too few values to draw this chart.</p>;
  const W = 720, H = 220, PL = 58, PR = 10, PT = 10, PB = 34;
  const max = Math.max(...vals.map(Math.abs), 1e-9) * 1.12;
  const bw = (W - PL - PR) / pts.length;
  const Y = (v: number) => PT + (1 - (v + max) / (2 * max)) * (H - PT - PB);
  const n = pts.length, slope = a.slope ?? 0;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const perStep = view === "yearly" ? slope / 10 : slope / 120;
  const line = (i: number) => mean + perStep * (i - (n - 1) / 2);
  const show = sel !== null ? pts[sel] : null;
  const dim = (v: number | null) => highlight !== "none" && v !== null && (highlight === "above" ? v < 0 : v > 0);
  const tickEvery = Math.max(1, Math.ceil(n / 8));
  const key = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    setSel((s) => {
      const c = s ?? -1;
      return e.key === "Home" ? 0 : e.key === "End" ? n - 1 : Math.max(0, Math.min(n - 1, c + (e.key === "ArrowLeft" ? -1 : 1)));
    });
  };
  return (
    <div className="xc-chart">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="rchart" tabIndex={0} role="group" onKeyDown={key} onMouseLeave={() => setSel(null)}
        aria-label={`${view === "yearly" ? "Yearly" : "Monthly"} values compared with usual for ${a.place}. Use the left and right arrow keys to read each value.`}>
        {[max * 0.8, 0, -max * 0.8].map((v) => (
          <g key={v}><line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? "#8a8399" : "#ece8f1"} />
            <text x={PL - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="#3d3850">{v === 0 ? "usual" : `${v > 0 ? "+" : "−"}${num(Math.abs(v), 1)}`}</text></g>
        ))}
        {pts.map((p, i) => {
          if (p.value === null) return <rect key={p.id} x={PL + i * bw} y={Y(0) - 2} width={Math.max(1, bw * 0.8)} height={4} fill="#c9c4d2" onMouseEnter={() => setSel(i)} />;
          const top = Math.min(Y(p.value), Y(0)), h = Math.max(1, Math.abs(Y(p.value) - Y(0)));
          return <rect key={p.id} x={PL + i * bw + bw * 0.12} y={top} width={Math.max(1, bw * 0.76)} height={h} rx={view === "yearly" ? 2 : 0}
            fill={p.value >= 0 ? "#f5b98a" : "#9cc6ef"} opacity={dim(p.value) ? 0.25 : 1} stroke={sel === i ? "#2b2540" : "none"} strokeWidth={2} onMouseEnter={() => setSel(i)} />;
        })}
        {a.slope !== null && a.sufficient && <line x1={PL + bw / 2} y1={Y(line(0))} x2={PL + (n - 0.5) * bw} y2={Y(line(n - 1))}
          stroke={slope >= 0 ? "#c4621a" : "#2f6fb3"} strokeWidth={3} strokeDasharray={a.significant ? undefined : "9 6"} strokeLinecap="round" pointerEvents="none" />}
        {pts.map((p, i) => (i % tickEvery === 0 || i === n - 1) && (
          <text key={`t${p.id}`} x={i === n - 1 ? W - PR : PL + i * bw + bw / 2} y={H - 12} textAnchor={i === n - 1 ? "end" : "middle"} fontSize="11" fill="#3d3850">{p.label.slice(-4)}</text>))}
      </svg>
      <p className="xc-readout" role="status" aria-live="polite">
        {show ? <><b>{show.label}</b>: {show.value === null ? "no data" : `${fmt(show.value, a.units)} compared with usual`} <span className="muted">({show.note})</span></>
          : <span className="muted">Point at a bar, or focus the chart and use the arrow keys, to read the exact value.</span>}
      </p>
    </div>
  );
}

function explain(a: AnalysisEntry, m: ReportModel): Record<Topic, { q: string; body: React.ReactNode }> {
  const w = plainWords(a.parameter), o = testOutcome(a), kind = productKind(a.product);
  const proj = linearProjection(a);
  return {
    trend: { q: "What is a trend?", body: <>
      <p>A trend is the overall direction across many years, looking past the normal ups and downs. Here the estimated rate is{" "}
        <b>{a.slope !== null && a.sufficient ? `${signedNum(a.slope)} ${a.units} every 10 years` : "not available"}</b> for {w.noun} in {a.place}.</p>
      <p className="small">Example: if every July were a little {w.up} than the July before, the trend would be upward even though each year still has its cool and warm months.</p>
      {proj && <p className="small">{proj}</p>}</> },
    p: { q: "What is a p-value?", body: <>
      <p>The p-value is a number the test uses to weigh the evidence against "no trend". Small values mean the pattern would be unusual if there were no real trend.</p>
      <p>For this finding: <b>p {pText(a.pRaw)}</b>, threshold {a.alpha}. {o.title}.</p>
      <p className="small">It is not the chance that the finding is true, it says nothing about how big or important the change is, and it never proves a cause.</p></> },
    how: { q: "How was this calculated?", body: <ol className="xc-steps">{WORKFLOW(m).map((s) => <li key={s.title}><b>{s.title}.</b> {s.text}</li>)}
      <li><b>Rate.</b> The typical change between matching months is Sen's slope, given per decade. It is not thrown off by a few unusual months.</li></ol> },
    matter: { q: "Why does this result matter?", body: <>
      <p>{w.noun[0].toUpperCase() + w.noun.slice(1)} affects water, farming, health and ecosystems. Knowing whether it is really changing, and how fast, helps people ask better questions about a place.</p>
      <p className="small">This result describes {a.start.slice(0, 4)} to {a.end.slice(0, 4)} only. It is a starting point for questions, not an answer about causes or the future.</p></> },
    limits: { q: "What are the limitations?", body: <ul>
      <li>It describes past change. It is not a forecast.</li>
      <li>It does not establish why the change happened.</li>
      <li>The area is a latitude-longitude box on a {a.gridDeg}° map grid; a country or a drawn area is approximated by its box.</li>
      <li>{a.product} is {kind.plain}. Other NASA products can give different answers.</li>
      {a.missingMonths > 0 && <li>{a.missingMonths} month{a.missingMonths === 1 ? "" : "s"} had no data and were left out.</li>}
      <li>Results are preliminary and have not been peer reviewed.</li></ul> },
    data: { q: "Which NASA data was used?", body: <>
      <p><b>{a.dataset}</b>: {a.product} v{a.version}, {a.provider}. {kind.kind}: {kind.plain}.</p>
      <p><a href={a.url} target="_blank" rel="noreferrer">Open the NASA dataset page</a> (opens in a new tab).</p></> },
  };
}

/** "Explore the story behind this result": interactive companion to the Explorer report preview. */
export function ExplorerCompanion({ m }: { m: ReportModel }) {
  const { history, setSel, go } = useStore();
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<View>("yearly");
  const [highlight, setHighlight] = useState<Highlight>("none");
  const mapRef = useRef<HTMLDivElement>(null);
  const topicsRef = useRef<HTMLDivElement>(null);
  const a = m.analyses[Math.min(idx, m.analyses.length - 1)];
  if (!a) return null;
  const topics = explain(a, m);
  const run = history.find((r) => r.key === a.key);
  const missing = a.series.points.filter((p) => p.value === null).map((p) => p.t);
  const openTopic = (t: Topic) => {
    const el = topicsRef.current?.querySelector<HTMLDetailsElement>(`[data-topic="${t}"]`);
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.querySelector("summary")?.focus({ preventScroll: true });
  };
  const askDetective = () => {
    if (!run) return;
    setSel({ parameter: run.variable.parameter, variableId: run.variable.id, place: run.place,
      startYear: Number(a.start.slice(0, 4)), endYear: Number(a.end.slice(0, 4)) });
    go("detective");
  };
  const w = plainWords(a.parameter);
  return (
    <section className="card pad col noprint xcomp" aria-labelledby="xc-h">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="xc-h" style={{ fontSize: 22 }}>Explore the story behind this result</h2>
        <span className="small muted">Interactive, on screen only. The PDF below is a static document.</span>
      </div>
      {m.analyses.length > 1 && (
        <div className="seg" role="group" aria-label="Finding">
          {m.analyses.map((x, i) => <button key={x.key} type="button" className={i === idx ? "on" : ""} aria-pressed={i === idx} onClick={() => setIdx(i)}>{x.parameter}, {x.place}</button>)}
        </div>
      )}
      <div className="xc-head">
        <div className={`xrate ${dirIcon(a)}`}><XIcon name={dirIcon(a)} size={34} />
          <div><span className="xrate-k">{dirWord(a)} · estimated rate</span>
            <span className="xrate-v">{a.slope !== null && a.sufficient ? <>{signedNum(a.slope)} <small>{a.units} every 10 years</small></> : <small>not available</small>}</span></div></div>
        <div className="col" style={{ gap: 6, minWidth: 0 }}>
          <span className={`badge rstamp ${trendStamp(a).cls}`} style={{ alignSelf: "flex-start" }}>{trendStamp(a).text}</span>
          <p style={{ margin: 0 }}>{plainFinding(a)}</p>
        </div>
      </div>
      <nav className="xc-journey" aria-label="Story steps">
        <button type="button" className="btn soft" onClick={() => mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>View the study area</button>
        <button type="button" className="btn soft" onClick={() => openTopic("trend")}>Understand the trend</button>
        <button type="button" className="btn soft" onClick={() => openTopic("p")}>Learn about significance</button>
        <button type="button" className="btn soft" onClick={() => openTopic("data")}>Inspect the NASA data source</button>
        <button type="button" className="btn soft" disabled={!run} title={run ? undefined : "This finding came from a reopened case; run it on Explore first"} onClick={askDetective}>Ask the Detective a follow-up</button>
      </nav>
      <div className="xc-grid">
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <div className="seg" role="group" aria-label="Chart view">
              <button type="button" className={view === "yearly" ? "on" : ""} aria-pressed={view === "yearly"} onClick={() => setView("yearly")}>Each year</button>
              <button type="button" className={view === "monthly" ? "on" : ""} aria-pressed={view === "monthly"} onClick={() => setView("monthly")}>Each month</button>
            </div>
            <div className="seg" role="group" aria-label="Highlight">
              <button type="button" className={highlight === "none" ? "on" : ""} aria-pressed={highlight === "none"} onClick={() => setHighlight("none")}>All</button>
              <button type="button" className={highlight === "above" ? "on" : ""} aria-pressed={highlight === "above"} onClick={() => setHighlight("above")}>{w.up[0].toUpperCase() + w.up.slice(1)} than usual</button>
              <button type="button" className={highlight === "below" ? "on" : ""} aria-pressed={highlight === "below"} onClick={() => setHighlight("below")}>{w.down[0].toUpperCase() + w.down.slice(1)} than usual</button>
            </div>
          </div>
          <EvidenceChart a={a} view={view} highlight={highlight} />
          <dl className="xchips">{qualityChips(a).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <details className="disclose">
            <summary>Data coverage month by month</summary>
            <p className="small" style={{ margin: 0 }}>{a.nMonths} months with data from {a.start} to {a.end}. {missing.length
              ? `Months without data: ${missing.join(", ")}.` : "Every month in the period has data."} On average {a.coveragePct}% of the study area had data.</p>
          </details>
        </div>
        <div ref={mapRef} className="col" style={{ gap: 6, minWidth: 0 }}>
          <LocatorMap boxes={[{ bbox: a.bbox, label: a.place, color: "#c4462f" }]} height={260} />
          <span className="small">Study area: {a.place}. Box from {a.bbox[1]}° to {a.bbox[3]}° latitude and {a.bbox[0]}° to {a.bbox[2]}° longitude.</span>
        </div>
      </div>
      <div ref={topicsRef} className="xc-topics">
        {(Object.keys(topics) as Topic[]).map((t) => (
          <details key={t} data-topic={t}>
            <summary>{topics[t].q}</summary>
            <div className="xc-body">{topics[t].body}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
