// "Same cause, opposite trends": the pair view (one variable rising in one place and falling in another, each tested,
// then the gap tested) and the finder that scans the trend map for such a pair. Numbers come only from /compare,
// /series and /hunt/discover. The mechanism card is curated text (opposite.ts), never a claim about these places' causes.
import { useEffect, useRef, useState } from "react";
import { api, errorText, type CompareResponse, type HuntResponse, type SeriesResponse, type TrendResponse } from "./api";
import { useStore } from "./store";
import { TrendChart } from "./TrendChart";
import { LocatorMap } from "./report/ReportDoc";
import { InfoButton } from "./InfoButton";
import { clampPeriod, rowVerdict } from "./PlaceCompare";
import { exploreHash } from "./urlState";
import { ci, pval, signed, VerdictBadge } from "./ui";
import { convCompare, convFor, convSeries, rateCi, rateOf, rateUnit } from "./units";
import {
  bestPair, boxName, mechanismFor, OPPOSITE_EXAMPLES, oppositeHash, pairStatus, SCAN, wholeYears,
  type OppositeExample, type OppositeRequest, type PairPlace,
} from "./opposite";

const COLOR = { up: "#c4621a", down: "#2f6fb3", flat: "#5b4e94", none: "#5b4e94" };   // TrendChart's rising / falling colours
const years = (s: string, e: string) => `${s.slice(0, 4)} to ${e.slice(0, 4)}`;
const ciCrossesZero = (t: TrendResponse) => !t.slope_ci || (t.slope_ci[0] <= 0 && t.slope_ci[1] >= 0);

/** One pair: both places' series and trends, the gap test and the mechanism card. a is the place expected to rise. */
export function OppositePair({ variableId, start, end, a, b, title, picked }: {
  variableId: string; start: string; end: string; a: PairPlace; b: PairPlace; title?: string; picked: "scan" | "example";
}) {
  const { variables, audience, tempUnit } = useStore();
  const sci = audience === "scientist";
  const v = variables.find((x) => x.id === variableId);
  const [data, setData] = useState<{ cmp: CompareResponse; sa: SeriesResponse; sb: SeriesResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${variableId}|${start}|${end}|${a.bbox.join()}|${b.bbox.join()}`;
  useEffect(() => {
    const ctrl = new AbortController(), ra = { type: "bbox" as const, bbox: a.bbox }, rb = { type: "bbox" as const, bbox: b.bbox };
    setData(null); setError(null);
    Promise.all([api.compare(variableId, ra, rb, start, end, ctrl.signal), api.series(variableId, ra, start, end, ctrl.signal), api.series(variableId, rb, start, end, ctrl.signal)])
      .then(([cmp, sa, sb]) => setData({ cmp, sa, sb }))
      .catch((e) => { if (!ctrl.signal.aborted) setError(errorText(e)); });
    return () => ctrl.abort();
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The API answers in source units; store variables carry the shown label (°F, % water), convFor reads either.
  const c = convFor(v?.display_units, tempUnit, audience);
  const shown = data && (c ? { cmp: convCompare(data.cmp, c), sa: convSeries(data.sa, c), sb: convSeries(data.sb, c) } : data);
  const u = c?.to ?? v?.display_units ?? data?.cmp.a.units ?? "";
  const st = shown ? pairStatus(shown.cmp.verdict) : null;
  const d = shown?.cmp.difference;
  const sides = shown ? ([["A", a, shown.cmp.a, shown.sa], ["B", b, shown.cmp.b, shown.sb]] as const) : [];

  return (
    <section className="col opp" aria-label={title ?? `Pair for ${v?.parameter_name ?? variableId}`}>
      <div className="card pad col">
        <div className="row opp-head">
          <h3>{title ?? `${v?.parameter_name ?? "This measurement"}: one place rising, one falling?`}</h3>
          <span className="small muted">{v ? `${v.parameter_name} · ${v.dataset_name} · ` : ""}{years(start, end)}</span>
        </div>
        {!shown && !error && <div className="skel" style={{ height: 220 }} role="status" aria-label="Testing both places" />}
        {error && (
          <div className="warn col" role="alert" style={{ gap: 8 }}>
            <span>Terra could not load this pair. {error}</span>
            <button type="button" className="btn soft" style={{ alignSelf: "flex-start" }} onClick={() => setAttempt((n) => n + 1)}>Try again</button>
          </div>
        )}
        {shown && st && d && <>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className={`badge ${st.cls}`}>{st.label}</span>
            {sci && <code className="small">{shown.cmp.verdict}</code>}
          </div>
          <LocatorMap height={220} boxes={sides.map(([k, p, t]) => ({ bbox: p.bbox, label: `${k}: ${rowVerdict(t).label}`, color: COLOR[rowVerdict(t).tone] }))} />
          <p className="small" style={{ margin: 0 }}>
            {sci
              ? <>Difference test (Hamed-Rao Mann-Kendall on the monthly anomaly difference A minus B): Sen slope {signed(d.slope_diff_per_decade)} {u} per decade, p {pval(d.p_value)}; moving-block bootstrap 95% interval {ci(d.ci)}; same sign in both halves: {d.stable_halves === null ? "n/a" : d.stable_halves ? "yes" : "no"}.</>
              : <>The gap between A and B changes by {signed(d.slope_diff_per_decade)} {u} per decade (95% range {ci(d.ci)}, p-value {pval(d.p_value)}). {d.significant ? "The test says this gap is unlikely to be chance." : "The test cannot rule out chance for this gap."}</>}
            {" "}<InfoButton id="difference-test" />
          </p>
        </>}
      </div>

      {shown && (
        <div className="hunt-panels" aria-label="The two places">
          {sides.map(([k, p, t, s]) => {
            const rv = rowVerdict(t);
            const adj = t.p_value_autocorr_adjusted;
            return (
              <div key={k} className="card pad col hunt-panel">
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="hunt-tag" style={{ background: COLOR[rv.tone] }}>{k}</span><b className="hunt-panel-t">{p.name}</b>
                </div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}><b>{rv.label}</b><VerdictBadge t={t} /></div>
                <span className="num hunt-slope">{signed(rateOf(t.slope_per_decade, u))} <small>{rateUnit(u)} per decade</small> <InfoButton id="sens-slope" /></span>
                <span className="small num">{sci ? "95% least-squares interval on anomalies (not for the Sen slope)" : "95% range (a different method from the slope)"}: {ci(rateCi(t.slope_ci, u))} {rateUnit(u)} per decade <InfoButton id="confidence-interval" /></span>
                <span className="small num">{sci ? "Hamed-Rao adjusted p" : "p-value, allowing for linked months"}: {pval(adj)} <InfoButton id="autocorrelation" /></span>
                {sci && <span className="small muted">Seasonal Mann-Kendall raw p {pval(t.p_value)} (decides the verdict); {t.n} months; {Math.round(t.quality.coverage_fraction * 100)}% of the box has data.</span>}
                {t.significant && adj !== null && adj >= 0.05 && <span className="warn small">Careful: the check that allows for linked months does not confirm this trend.</span>}
                {t.significant && ciCrossesZero(t) && <span className="warn small">Careful: the 95% range includes zero, so the direction is not settled.</span>}
                <TrendChart lines={[{ series: s, trend: t }]} anomaly height={200} units={u} />
                <a className="small" href={exploreHash({ variableId, place: { kind: "box", bbox: p.bbox }, start, end, view: "trend" })}>Open this place in Explore</a>
              </div>
            );
          })}
        </div>
      )}
      {shown && <span className="small muted">Charts: each month minus its usual value. Thick line: the trend, dashed when it could be chance. Past trends, not forecasts.</span>}

      <MechanismCard variableId={variableId} name={v?.parameter_name ?? "this measurement"} />
      <p className="small muted" style={{ margin: 0 }}>
        {sci
          ? <>Selection caveat: {picked === "scan" ? "squares were picked" : "we picked these places by scanning"} from the per-cell trend map, with the Benjamini-Hochberg false discovery rate on raw cell p-values. They were then tested on the same data, so p-values are optimistic. Treat the pair as a lead, not a confirmed finding.</>
          : picked === "scan" ? "A pair is a lead, not a finding. The app chose these places from the same data it then tested."
            : "We chose these places by scanning the same data, so treat them as a lead, not a finding."}{" "}
        <InfoButton id="fdr" />
      </p>
    </section>
  );
}

/** "How can one process do both?": one curated, sourced explanation per variable family. Never a verdict on these places. */
export function MechanismCard({ variableId, name }: { variableId: string; name: string }) {
  const m = mechanismFor(variableId);
  return (
    <section className="card pad col opp-mech" aria-label="How can one process do both?">
      <h3>How can one process do both?</h3>
      {m ? <>
        <p style={{ margin: 0 }}><b>One known explanation:</b> {m.text}</p>
        {m.caveat && <p className="small" style={{ margin: 0 }}>{m.caveat}{m.caveatSource && <> Source: <a href={m.caveatSource.url} target="_blank" rel="noreferrer">{m.caveatSource.cite}</a>.</>}</p>}
        <p className="small" style={{ margin: 0 }}>Source: <a href={m.source.url} target="_blank" rel="noreferrer">{m.source.cite}</a>, "{m.source.title}".</p>
      </> : <p style={{ margin: 0 }}>We have no checked explanation for {name.toLowerCase()} yet. The pair still shows that one measurement can move both ways.</p>}
      <p className="small muted" style={{ margin: 0 }}>This tool does not test the cause. Natural swings, such as El Niño, can also shape a trend over these years.</p>
    </section>
  );
}

/** A ready-made example, its period cut to what the server holds (like the guide demos). */
export function ExamplePair({ example: e }: { example: OppositeExample }) {
  const { variables } = useStore();
  const p = clampPeriod(e.start, e.end, variables.find((v) => v.id === e.variable_id)?.coverage ?? null);
  return <OppositePair variableId={e.variable_id} start={p?.start ?? e.start} end={p?.end ?? e.end} a={e.up} b={e.down} title={e.question} picked="example" />;
}

/** Hunt's "Same cause, opposite trends" view: pick a variable (or arrive from Explore with one), scan, show the best pair. */
export function OppositeFinder({ request }: { request: OppositeRequest | null }) {
  const { variables, variable, showError, audience } = useStore();
  const sci = audience === "scientist";
  const avail = variables.filter((x) => x.available);
  const [varId, setVarId] = useState(request?.variableId ?? (variable?.available ? variable.id : ""));
  const v = avail.find((x) => x.id === varId) ?? (varId ? undefined : avail[0]);
  // Explore's period when we came from there; otherwise whole years of the record (maps the server has precomputed).
  const base = request && v?.id === request.variableId ? request : wholeYears(v?.coverage ?? null);
  const per = base && v ? clampPeriod(base.start, base.end, v.coverage) : null;
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<HuntResponse | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [example, setExample] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const run = (id: string, p: { start: string; end: string }) => {
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setBusy(true); setRes(null); setPick(null); setExample(null);
    history.replaceState(null, "", oppositeHash({ variableId: id, start: p.start, end: p.end }));   // the address is a share link for this scan
    api.discover({ variable_id: id, start: p.start, end: p.end, ...SCAN }, c.signal)
      .then((r) => { if (ctrl.current === c) { setRes(r); setPick(bestPair(r.candidates)?.rank ?? null); } })
      .catch((e) => { if (!c.signal.aborted) showError(e); })
      .finally(() => { if (ctrl.current === c) { ctrl.current = null; setBusy(false); } });
  };
  const cancel = () => { ctrl.current?.abort(); ctrl.current = null; setBusy(false); };
  // Arriving with a variable and period (Explore's button or a shared link) starts the scan once the catalog is in.
  useEffect(() => {
    if (!request || v?.id !== request.variableId || !per || per.short) return;
    run(v.id, per);
    return () => ctrl.current?.abort();
  }, [v?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = res?.candidates.find((x) => x.rank === pick) ?? null;
  const confirmed = res?.candidates.some((x) => x.test?.verdict === "opposite_significant") ?? false;
  const ex = OPPOSITE_EXAMPLES.find((x) => x.id === example);
  return (
    <>
      <section className="card pad col" aria-labelledby="opp-h">
        <h2 id="opp-h" style={{ fontSize: 22 }}>Same cause, opposite trends</h2>
        <p className="small muted" style={{ margin: 0 }}>Can one measurement rise in one place and fall in another, even when one process drives both? Pick one. The app finds a rising place and a falling place, then tests the gap between them.</p>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="col small muted" style={{ gap: 4, minWidth: 220, flex: 1 }}>What to measure
            <select className="select" value={v?.id ?? ""} onChange={(e) => { cancel(); setRes(null); setVarId(e.target.value); }}>
              {avail.map((x) => <option key={x.id} value={x.id}>{x.parameter_name} · {x.dataset_name}</option>)}</select></label>
          <button type="button" className="btn" disabled={busy || !v || !per || per.short} onClick={() => v && per && run(v.id, per)}>Find a pair</button>
        </div>
        {v && <span className="small muted">{per ? `Period: ${years(per.start, per.end)}${request && v.id === request.variableId ? ", from Explore" : ", whole years of the record"}.` : "This data has no period to test."}</span>}
        {varId && variables.length > 0 && !v && <span className="warn small">This dataset has no data on this server. Pick another one.</span>}
        {per?.short && <span className="warn small">Testing needs at least 10 years. Pick a longer period in Explore.</span>}
        <div className="col" style={{ gap: 8 }}>
          <b className="small">Or open a ready-made example</b>
          <div className="row" style={{ gap: 8 }}>
            {OPPOSITE_EXAMPLES.map((x) => (
              <button key={x.id} type="button" className={`chip ${example === x.id ? "on" : ""}`} aria-pressed={example === x.id}
                onClick={() => { cancel(); setRes(null); setExample(x.id); }}>{x.question}</button>
            ))}
          </div>
        </div>
      </section>

      {busy && (
        <div className="card pad col" role="status">
          <b>Scanning the {v?.dataset_name} trend map{per ? `, ${years(per.start, per.end)}` : ""}…</b>
          <span className="small muted">The world is cut into 504 squares of 10° by 10°. If this map is not ready yet, the server makes it first, which can take about a minute.</span>
          <button type="button" className="btn soft" style={{ alignSelf: "flex-start" }} onClick={cancel}>Cancel</button>
        </div>
      )}
      {ex && !busy && <ExamplePair key={ex.id} example={ex} />}
      {res && !busy && !ex && (res.candidates.length === 0 || !sel ? (
        <section className="card pad col" role="status">
          <b>No pair found with these settings.</b>
          <span>That doesn't prove the trend is the same everywhere.</span>
        </section>
      ) : <>
        {!confirmed && <div className="warn" role="status">No pair passed the difference test with these settings. That doesn't prove the trend is the same everywhere.</div>}
        <OppositePair key={sel.rank} variableId={res.variable_id} start={res.start} end={res.end} picked="scan"
          a={{ name: boxName(sel.a.bbox), bbox: sel.a.bbox }} b={{ name: boxName(sel.b.bbox), bbox: sel.b.bbox }} />
        <section className="card pad col" aria-labelledby="opp-more">
          <h3 id="opp-more">Other pairs the scan found</h3>
          {res.candidates.length < 2 && <span className="small muted">None.</span>}
          <ul className="report-items">
            {res.candidates.filter((x) => x.rank !== pick).map((x) => (
              <li key={x.rank}>
                <span><span className={`badge ${pairStatus(x.test?.verdict ?? null).cls}`} style={{ minHeight: 26, fontSize: 12.5 }}>{pairStatus(x.test?.verdict ?? null).label}</span>
                  {" "}A: {boxName(x.a.bbox)} · B: {boxName(x.b.bbox)}</span>
                <button type="button" className="linkbtn" onClick={() => setPick(x.rank)}>Show this pair</button>
              </li>
            ))}
          </ul>
          <details className="small">
            <summary>How the scan picks pairs</summary>
            <p className="small" style={{ margin: "6px 0 0" }}>{sci
              ? `Per-cell Seasonal Mann-Kendall test and Sen slope, with the Benjamini-Hochberg false discovery rate across cells. A square leans one way when at least ${Math.round(res.criteria.dominant_share * 100)}% of its valid cells are significant that way. Opposite-leaning squares are ranked by the weaker side's share; the top ${res.limits.max_retests} are re-tested with the difference test. ${res.tiles_scanned} squares had data; ${(res.runtime_ms / 1000).toFixed(1)} s.`
              : "The app cuts the world's trend map into squares. A square leans one way when at least 3 in 10 of its cells show a clear change that way. It pairs squares that lean opposite ways, then tests the best five pairs."}</p>
          </details>
        </section>
      </>)}
    </>
  );
}
