// Contradiction Hunter 3.0: Discover, Compare (regions, datasets, periods) and Investigate.
// Every number comes from backend /trends, /series, /compare or /hunt/discover. Comparability, categories and the
// evidence status are decided by the deterministic rules in hunt/logic.ts; Gemini is never asked to judge them.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type BBox, type CompareResponse, type HuntCandidate, type HuntResponse, type RegionRef, type SeriesResponse, type TrendResponse, type Variable } from "../api";
import { useStore } from "../store";
import { periodEnd, periodStart } from "../period";
import { TrendChart } from "../TrendChart";
import { ci, pval, signed, Stat, VerdictBadge } from "../ui";
import { compareF, seriesF, trendF } from "../units";
import { LocatorMap } from "../report/ReportDoc";
import { compatiblePartner, EXTENTS } from "../explore";
import {
  CATEGORY_LABEL, categorize, checkComparability, conclusion, detectiveRequest, evidenceStatus, EXAMPLE_QUESTIONS, explainComparison, overlapMonths,
  STATUS_LABEL, VALIDITY_LABEL, type Category, type HuntMode, type Side,
} from "../hunt/logic";
import { PlaceField } from "../hunt/PlaceField";
import { deleteInvestigation, INVESTIGATION_SCHEMA, listInvestigations, saveInvestigation, type Investigation } from "../hunt/investigations";

type View = "landing" | HuntMode | "discover";
type Opt = { id: string; name: string; ref: RegionRef };
interface Config { variableId: string; variableIdB: string; a: string; b: string; startA: number; endA: number; startB: number; endB: number }
interface Result {
  mode: HuntMode; a: Side; b: Side; sa: SeriesResponse; sb: SeriesResponse | null; test: CompareResponse | null;
  flagged: string | null; at: number;
}

const lat = (v: number) => `${Math.abs(v)}°${v >= 0 ? "N" : "S"}`;
const lon = (v: number) => `${Math.abs(v)}°${v >= 0 ? "E" : "W"}`;
const boxName = (b: BBox) => `box ${lat(b[1])} to ${lat(b[3])}, ${lon(b[0])} to ${lon(b[2])}`;
const yearsOf = (v: Variable | undefined) => {
  const s = Number(v?.coverage?.start.slice(0, 4) ?? 2001), e = Number(v?.coverage?.end.slice(0, 4) ?? 2025);
  return Array.from({ length: e - s + 1 }, (_, i) => s + i);
};

/** Survives page navigation within the visit (like the report draft): the view, both configurations and the last result. */
export const huntDraft: { view: View; config: Partial<Record<HuntMode, Config>>; result: Partial<Record<HuntMode, Result>>; extra: Opt[] } = {
  view: "landing", config: {}, result: {}, extra: [],
};

const CARDS: { mode: HuntMode; title: string; explorer: string; scientist: string; can: string; cannot: string }[] = [
  { mode: "regions", title: "Compare Regions", explorer: "Is the same thing changing differently in two places?",
    scientist: "Two areas, same variable, dataset and period; formal test of the difference.",
    can: "Test whether the gap between two places grew or shrank", cannot: "Say why the places differ" },
  { mode: "datasets", title: "Compare NASA Datasets", explorer: "Do two NASA datasets tell the same story for one place?",
    scientist: "Same area and period, two compatible products (same quantity and units).",
    can: "Show where products agree or disagree on direction and significance", cannot: "Test the difference or tell which product is right" },
  { mode: "periods", title: "Compare Time Periods", explorer: "Does the answer change if you look at different years?",
    scientist: "Same area and product, two windows; sensitivity of the Sen slope to the window.",
    can: "Show how much a trend estimate depends on the years chosen", cannot: "Prove that the trend changed (no change-point test)" },
];

export function Hunt() {
  const { audience, huntSelection } = useStore();
  const sci = audience === "scientist";
  // The Detective can send two regions here ("compare these two places"): open Compare Regions with them.
  if (huntSelection && (huntDraft.config.regions?.a !== huntSelection.a || huntDraft.config.regions?.b !== huntSelection.b) && huntDraft.view !== "regions") {
    huntDraft.config.regions = { ...(huntDraft.config.regions ?? {}), a: huntSelection.a, b: huntSelection.b } as Config;
    huntDraft.result.regions = undefined;
    huntDraft.view = "regions";
  }
  const [view, setViewState] = useState<View>(huntDraft.view);
  const setView = (v: View) => { huntDraft.view = v; setViewState(v); };
  const [saved, setSaved] = useState<Investigation[]>(() => listInvestigations());
  const [reopen, setReopen] = useState<Investigation | null>(null);
  // The Hunt tutorial may ask for the Compare Regions view so its selectors exist (a view switch only, never a run).
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === "hunt:regions" && (huntDraft.view === "landing" || huntDraft.view === "discover")) setView("regions"); };
    window.addEventListener("terra-tour-prepare", on);
    return () => window.removeEventListener("terra-tour-prepare", on);
  }, []);
  const inspect = (mode: HuntMode, a: Opt, b: Opt | null, cfgPatch: Partial<Config>) => {
    huntDraft.extra = [a, ...(b ? [b] : []), ...huntDraft.extra.filter((x) => x.id !== a.id && x.id !== b?.id)].slice(0, 10);
    huntDraft.config[mode] = { ...(huntDraft.config[mode] ?? {}), ...cfgPatch, a: a.id, b: b?.id ?? a.id } as Config;
    setView(mode);
  };

  return (
    <div className="page hunt">
      <section className="card pad col hunt-head" data-tour="hunt">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          {/* flex-basis lets the Replay button wrap below the title on phones instead of covering it */}
          <div className="col" style={{ gap: 6, minWidth: 0, flex: "1 1 260px" }}>
            <h1 style={{ fontSize: 30 }}>Contradiction Hunter</h1>
            <p className="muted" style={{ margin: 0, font: "600 16px/1.5 var(--body)" }}>
              {sci ? "Investigate differences in environmental trends across regions, datasets and periods."
                : "Discover where Earth's environmental stories don't quite match."}</p>
          </div>
          <button type="button" className="btn ghost" onClick={() => window.dispatchEvent(new Event("terra-hunt-tour"))}>Replay Hunt Tutorial</button>
        </div>
        <div className="hunt-cards" data-tour="hunt-modes" role="group" aria-label="Choose an investigation">
          {CARDS.map((c) => (
            <button key={c.mode} type="button" className={`hunt-card ${view === c.mode ? "on" : ""}`} aria-pressed={view === c.mode} onClick={() => setView(c.mode)}>
              <span className="hunt-card-t">{c.title}</span>
              <span className="hunt-card-q">{sci ? c.scientist : c.explorer}</span>
              <span className="hunt-cc">
                <span className="hunt-cc-item can"><span className="hunt-cc-k"><span className="hunt-cc-ico" aria-hidden="true">✓</span>Can</span>{c.can}</span>
                <span className="hunt-cc-item cannot"><span className="hunt-cc-k"><span className="hunt-cc-ico" aria-hidden="true">✕</span>Cannot</span>{c.cannot}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <button type="button" className={`btn ${view === "discover" ? "" : "soft"}`} data-tour="hunt-discover" aria-pressed={view === "discover"} onClick={() => setView("discover")}>Discover Interesting Differences</button>
          <span className="small muted">{sci ? "Bounded scan of the precomputed trend map; top region pairs are re-tested with the regional difference test." : "Let the app scan a map for places that go opposite ways."}</span>
        </div>
      </section>

      {view === "landing" && (
        <section className="card pad col hunt-intro">
          <h2 style={{ fontSize: 20 }}>{sci ? "Evidence ladder" : "How to read a comparison"}</h2>
          <ol className="hunt-ladder">
            <li><b>{sci ? "Descriptive difference" : "Looks different"}</b>: {sci ? "signs, magnitudes or significance labels differ; no formal test." : "the arrows or numbers differ, but nothing has been tested."}</li>
            <li><b>{sci ? "Inconclusive" : "Not settled"}</b>: {sci ? "one required condition of the difference test fails, or data are insufficient." : "the test could not decide."}</li>
            <li><b>{sci ? "Statistically tested difference" : "Confirmed by a test"}</b>: {sci ? "regions only: Hamed-Rao p < 0.05 on the A minus B anomaly series and a 95% bootstrap interval excluding zero." : "only for two places: the gap itself was tested and is clear."}</li>
          </ol>
          <p className="small muted" style={{ margin: 0 }}>Pick a card above to begin. Results are past trends, never forecasts, and never explain causes.</p>
        </section>
      )}
      {(view === "regions" || view === "datasets" || view === "periods") &&
        <Workspace key={view} mode={view} reopen={reopen?.mode === view ? reopen : null} onReopened={() => setReopen(null)} onSaved={() => setSaved(listInvestigations())} />}
      {view === "discover" && <Discover onInspect={inspect} />}

      {saved.length > 0 && (
        <section className="card pad col" aria-labelledby="inv-h">
          <h2 id="inv-h" style={{ fontSize: 20 }}>Saved investigations</h2>
          <span className="small muted">Saved only in this browser. Reopening recomputes everything from the backend.</span>
          <ul className="report-items">
            {saved.map((s) => (
              <li key={s.id}><span><b>{s.title}</b> · {CARDS.find((c) => c.mode === s.mode)?.title} · {STATUS_LABEL[s.status]?.[sci ? "scientist" : "explorer"] ?? s.status} · {s.created_at.slice(0, 10)}</span>
                <span className="row" style={{ gap: 10 }}>
                  <button type="button" className="linkbtn" onClick={() => { setReopen(s); setView(s.mode); }}>Reopen</button>
                  <button type="button" className="linkbtn" onClick={() => { deleteInvestigation(s.id); setSaved(listInvestigations()); }}>Delete</button>
                </span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- workspace (one comparison mode) */
function Workspace({ mode, reopen, onReopened, onSaved }: { mode: HuntMode; reopen: Investigation | null; onReopened: () => void; onSaved: () => void }) {
  const { regions, variables, variable, sel, showError, tempUnit, addComparison, sendChat, go, audience, backendVersion } = useStore();
  const sci = audience === "scientist";
  const options: Opt[] = (() => {
    const list: Opt[] = [
      ...huntDraft.extra,
      { id: "explore", name: `Explore selection: ${sel.place.label}`, ref: sel.place.ref },
      ...regions.map((r) => ({ id: r.id, name: r.name, ref: { type: "preset" as const, id: r.id } })),
      { id: "sahel_hint", name: "Sahel (box 17°W to 30°E, 10°N to 18°N)", ref: { type: "bbox", bbox: [-17, 10, 30, 18] } },
      { id: "wisconsin", name: "Wisconsin, USA (box)", ref: { type: "bbox", bbox: [-92.9, 42.5, -86.8, 47.1] } },
    ];
    return list.filter((o, i) => list.findIndex((x) => x.id === o.id) === i);
  })();
  const avail = variables.filter((v) => v.available);
  const pairable = avail.filter((v) => compatiblePartner(v.id, variables));
  const defVar = mode === "datasets" ? (pairable.find((v) => v.id === variable?.id) ?? pairable[0]) : (variable?.available ? variable : avail[0]);
  const mid = Math.round((sel.startYear + sel.endYear) / 2);
  const fallback: Config = {
    variableId: defVar?.id ?? "", variableIdB: defVar ? compatiblePartner(defVar.id, variables)?.id ?? "" : "",
    a: mode === "regions" ? "sahel_hint" : "explore", b: mode === "regions" ? "wisconsin" : "explore",
    startA: sel.startYear, endA: mode === "periods" ? mid - 1 : sel.endYear, startB: mode === "periods" ? mid : sel.startYear, endB: sel.endYear,
  };
  const init: Config = { ...fallback, ...(huntDraft.config[mode] ?? {}) };
  const [cfg, setCfgState] = useState<Config>({ ...init, variableId: init.variableId || defVar?.id || "" });
  const setCfg = (p: Partial<Config>) => setCfgState((c) => { const n = { ...c, ...p }; huntDraft.config[mode] = n; return n; });
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<Result | null>(huntDraft.result[mode] ?? null);
  const [added, setAdded] = useState(false);
  const [title, setTitle] = useState(""); const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const reqId = useRef(0);
  const vA = variables.find((v) => v.id === cfg.variableId), vB = mode === "datasets" ? variables.find((v) => v.id === cfg.variableIdB) : vA;
  const opt = (id: string) => options.find((o) => o.id === id) ?? options[0];
  const years = yearsOf(vA);
  const sideYears = { a: [cfg.startA, cfg.endA], b: mode === "periods" ? [cfg.startB, cfg.endB] : [cfg.startA, cfg.endA] };

  // Validity of the inputs before running (the full checks run on the results).
  const preError = !vA ? "Choose a variable." : !vA.available ? "This variable has no data on this server."
    : mode === "regions" && JSON.stringify(opt(cfg.a).ref) === JSON.stringify(opt(cfg.b).ref) ? "Choose two different places."
    : mode === "datasets" && (!vB || !compatiblePartner(vA.id, variables)) ? `${vA.dataset_name} has no compatible second dataset on this server (same quantity and units are required).`
    : mode === "periods" && cfg.startA === cfg.startB && cfg.endA === cfg.endB ? "Choose two different periods."
    : sideYears.a[0] > sideYears.a[1] || sideYears.b[0] > sideYears.b[1] ? "A period ends before it starts."
    : null;

  const runIt = async (c: Config = cfg) => {
    const va = variables.find((v) => v.id === c.variableId), vb = mode === "datasets" ? variables.find((v) => v.id === c.variableIdB) : va;
    if (!va || !vb) return;
    const id = ++reqId.current;               // stale-result guard: only the latest request may update the screen
    const oa = opt(c.a), ob = opt(mode === "regions" ? c.b : c.a);
    const pa = { start: `${c.startA}-01`, end: `${c.endA}-12` };
    const pb = mode === "periods" ? { start: `${c.startB}-01`, end: `${c.endB}-12` } : pa;
    setBusy(true); setAdded(false); setMsg(null);
    try {
      let r: Result;
      if (mode === "regions") {
        const [cmp, sa, sb] = await Promise.all([api.compare(va.id, oa.ref, ob.ref, pa.start, pa.end), api.series(va.id, oa.ref, pa.start, pa.end), api.series(va.id, ob.ref, pa.start, pa.end)]);
        r = { mode, a: { label: oa.name, variable: va, trend: cmp.a }, b: { label: ob.name, variable: va, trend: cmp.b }, sa, sb, test: cmp, flagged: null, at: Date.now() };
      } else if (mode === "datasets") {
        const [ta, tb, sa, sb] = await Promise.all([api.trends(va.id, oa.ref, pa.start, pa.end), api.trends(vb.id, oa.ref, pa.start, pa.end),
          api.series(va.id, oa.ref, pa.start, pa.end), api.series(vb.id, oa.ref, pa.start, pa.end)]);
        r = { mode, a: { label: oa.name, variable: va, trend: ta }, b: { label: oa.name, variable: vb, trend: tb }, sa, sb, test: null, flagged: null, at: Date.now() };
      } else {
        const us = pa.start < pb.start ? pa.start : pb.start, ue = pa.end > pb.end ? pa.end : pb.end;
        const [ta, tb, su] = await Promise.all([api.trends(va.id, oa.ref, pa.start, pa.end), api.trends(va.id, oa.ref, pb.start, pb.end), api.series(va.id, oa.ref, us, ue)]);
        r = { mode, a: { label: `${oa.name}, ${c.startA} to ${c.endA}`, variable: va, trend: ta }, b: { label: `${oa.name}, ${c.startB} to ${c.endB}`, variable: va, trend: tb }, sa: su, sb: null, test: null, flagged: null, at: Date.now() };
      }
      if (id !== reqId.current) return;
      huntDraft.result[mode] = r; setRaw(r);
      setTitle(`${va.parameter_name}: ${r.a.label} vs ${r.b.label}`.slice(0, 120));
    } catch (e) { if (id === reqId.current) showError(e); } finally { if (id === reqId.current) setBusy(false); }
  };
  // A saved investigation reopens its configuration and recomputes it from the backend.
  useEffect(() => {
    if (!reopen) return;
    const find = (ref: RegionRef, label: string): string => {
      const o = options.find((x) => JSON.stringify(x.ref) === JSON.stringify(ref));
      if (o) return o.id;
      const id = `saved-${huntDraft.extra.length}-${Date.now().toString(36)}`;
      huntDraft.extra = [{ id, name: label, ref }, ...huntDraft.extra].slice(0, 10);
      return id;
    };
    const c: Config = { variableId: reopen.a.variable_id, variableIdB: reopen.b.variable_id, a: find(reopen.a.region, reopen.a.label.replace(/, \d{4} to \d{4}$/, "")),
      b: find(reopen.b.region, reopen.b.label.replace(/, \d{4} to \d{4}$/, "")), startA: Number(reopen.a.start.slice(0, 4)), endA: Number(reopen.a.end.slice(0, 4)),
      startB: Number(reopen.b.start.slice(0, 4)), endB: Number(reopen.b.end.slice(0, 4)) };
    setCfgState(c); huntDraft.config[mode] = c; setNotes(reopen.notes);
    onReopened();
    void runIt(c).then(() => setTitle(reopen.title));
  }, [reopen]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = useMemo(() => {
    if (!raw) return null;
    if (!(tempUnit === "F" && raw.a.trend.units === "°C")) return raw;
    return { ...raw, a: { ...raw.a, trend: trendF(raw.a.trend) }, b: { ...raw.b, trend: trendF(raw.b.trend) }, sa: seriesF(raw.sa), sb: raw.sb ? seriesF(raw.sb) : null, test: raw.test ? compareF(raw.test) : null };
  }, [raw, tempUnit]);
  const analysis = useMemo(() => {
    if (!res) return null;
    const { validity, checks } = checkComparability(res.mode, res.a, res.b);
    const cats = categorize(res.mode, res.a.trend, res.b.trend);
    const status = evidenceStatus(res.mode, validity, res.test);
    return { validity, checks, cats, status, text: explainComparison(res.mode, res.a, res.b, res.test, sci), headline: conclusion(status, cats, sci) };
  }, [res, sci]);

  const u = res?.a.variable.display_units ?? vA?.display_units ?? "";
  const toReport = () => {
    if (!res || !raw) return;
    const kind = res.mode;
    addComparison({ key: res.test?.compare_id ?? `${kind}-${raw.a.trend.trend_id}-${raw.b.trend.trend_id}`, kind,
      title: `${res.a.variable.parameter_name}: ${res.a.label} vs ${res.b.label}`,
      a: { label: kind === "datasets" ? res.a.label : res.a.label, dataset: res.a.variable.dataset_name, trend: res.a.trend, series: res.sa },
      b: { label: res.b.label, dataset: res.b.variable.dataset_name, trend: res.b.trend, series: res.sb ?? res.sa },
      units: u, variableName: res.a.variable.parameter_name, test: res.test });
    setAdded(true);
  };
  const ask = () => {
    if (!raw) return;
    const r = detectiveRequest(raw.mode, raw.a, raw.b, sci);
    void sendChat(r.message, r.context);
    go("detective");
  };
  const save = () => {
    if (!raw || !analysis) return;
    const sideCfg = (s: Side, o: Opt) => ({ variable_id: s.variable.id, region: o.ref, label: s.label, start: s.trend.start, end: s.trend.end });
    const ev = (t: TrendResponse) => ({ trend_id: t.trend_id, slope_per_decade: t.slope_per_decade, p_value: t.p_value, significant: t.significant,
      n_months: t.quality.n_months, coverage_fraction: t.quality.coverage_fraction, product: t.source.product, version: t.source.version, units: t.units });
    const inv: Investigation = {
      schema: INVESTIGATION_SCHEMA, id: `inv-${Date.now().toString(36)}`, title: (title.trim() || "Investigation").slice(0, 120), notes: notes.slice(0, 2000),
      created_at: new Date().toISOString(), backend_version: backendVersion, mode: raw.mode,
      a: sideCfg(raw.a, opt(cfg.a)), b: sideCfg(raw.b, opt(raw.mode === "regions" ? cfg.b : cfg.a)),
      evidence: { a: ev(raw.a.trend), b: ev(raw.b.trend), compare: raw.test ? { compare_id: raw.test.compare_id, verdict: raw.test.verdict,
        slope_diff_per_decade: raw.test.difference.slope_diff_per_decade, p_value: raw.test.difference.p_value, ci: raw.test.difference.ci } : null },
      categories: analysis.cats, status: analysis.status, validity: analysis.validity,
      limitations: [...analysis.checks.filter((c) => c.status !== "ok").map((c) => c.text), ...analysis.text.cannot].slice(0, 12),
      flagged_reason: raw.flagged, method: "Raw Seasonal Mann-Kendall (α 0.05) + seasonal Sen slope per side" + (raw.test ? "; Hamed-Rao MK on the anomaly difference + moving-block bootstrap 95% interval" : "; descriptive comparison"),
    };
    setMsg(saveInvestigation(inv) ? `Saved "${inv.title}" in this browser (not in the cloud).` : "This browser blocks local storage, so the investigation could not be saved.");
    onSaved();
  };
  const yearSel = (label: string, value: number, on: (v: number) => void) => (
    <label className="col small muted" style={{ gap: 4, minWidth: 96 }}>{label}
      <select className="select" value={value} onChange={(e) => on(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
  );
  // Free choice: a searched country, city or preset, a point or a typed box becomes an option and is selected.
  const placeSel = (label: string, value: string, on: (v: string) => void, tag?: "A" | "B") => (
    <PlaceField label={label} tag={tag} value={opt(value)} quick={options} regions={regions} onPick={(o) => {
      if (!huntDraft.extra.some((x) => x.id === o.id) && !options.some((x) => x.id === o.id)) huntDraft.extra = [o, ...huntDraft.extra].slice(0, 12);
      on(o.id);
    }} />
  );
  const varList = mode === "datasets" ? pairable : avail;

  return (
    <>
      <section className="card pad col" data-tour="hunt-config" aria-labelledby="hw-h">
        <h2 id="hw-h" style={{ fontSize: 22 }}>{CARDS.find((c) => c.mode === mode)!.title}</h2>
        <div className="row">
          <label className="col small muted" style={{ gap: 4, flex: 1, minWidth: 220 }}>{mode === "datasets" ? "Dataset A" : "Variable and dataset"}
            <select className="select" value={cfg.variableId} onChange={(e) => setCfg({ variableId: e.target.value, variableIdB: compatiblePartner(e.target.value, variables)?.id ?? "" })}>
              {varList.map((v) => <option key={v.id} value={v.id}>{v.parameter_name} · {v.dataset_name}</option>)}</select></label>
          {mode === "datasets" && (
            <label className="col small muted" style={{ gap: 4, flex: 1, minWidth: 220 }}>Dataset B (compatible only)
              <select className="select" value={cfg.variableIdB} onChange={(e) => setCfg({ variableIdB: e.target.value })}>
                {[vA && compatiblePartner(vA.id, variables)].filter((v): v is Variable => !!v).map((v) => <option key={v.id} value={v.id}>{v.parameter_name} · {v.dataset_name}</option>)}</select></label>
          )}
        </div>
        <div className="hunt-ab">
          <div className="hunt-ab-side"><span className="hunt-tag a">A</span>
            {mode === "regions" ? placeSel("Place A", cfg.a, (v) => setCfg({ a: v }), "A") : placeSel("Place (both sides)", cfg.a, (v) => setCfg({ a: v }))}
            {mode === "periods" && <div className="row" style={{ gap: 8 }}>{yearSel("Period A from", cfg.startA, (v) => setCfg({ startA: v }))}{yearSel("to", cfg.endA, (v) => setCfg({ endA: v }))}</div>}
          </div>
          <div className="hunt-ab-side"><span className="hunt-tag b">B</span>
            {mode === "regions" ? placeSel("Place B", cfg.b, (v) => setCfg({ b: v }), "B")
              : mode === "datasets" ? <span className="small">Same place, dataset B: {vB?.dataset_name ?? "none"}</span>
              : <div className="row" style={{ gap: 8 }}>{yearSel("Period B from", cfg.startB, (v) => setCfg({ startB: v }))}{yearSel("to", cfg.endB, (v) => setCfg({ endB: v }))}</div>}
          </div>
        </div>
        {mode !== "periods" && <div className="row" style={{ gap: 8 }}>{yearSel("From", cfg.startA, (v) => setCfg({ startA: v }))}{yearSel("To", cfg.endA, (v) => setCfg({ endA: v }))}
          <span className="small muted" style={{ alignSelf: "flex-end", paddingBottom: 10 }}>Shared period for A and B.</span></div>}
        {mode === "periods" && overlapMonths({ start: `${cfg.startA}-01`, end: `${cfg.endA}-12` }, { start: `${cfg.startB}-01`, end: `${cfg.endB}-12` }) > 0 &&
          <span className="warn small">The two periods overlap, so they share data and are not independent.</span>}
        {mode === "periods" && <span className="small muted">{sci ? "Selecting many windows and reporting the most different pair inflates apparent sensitivity; treat this as exploratory." : "Trying many different year ranges and keeping the most surprising one can mislead: treat this as exploring, not proving."}</span>}
        <div className="row" style={{ alignItems: "center" }}>
          <button type="button" className="btn" data-tour="hunt-run" disabled={busy || !!preError} onClick={() => void runIt()}>{busy ? "Comparing…" : preError ?? "Run the comparison"}</button>
          {busy && <button type="button" className="btn soft" onClick={() => { reqId.current++; setBusy(false); }}>Cancel</button>}
          <span className="small muted">{mode === "regions" ? (sci ? "POST /compare (both trends + difference test) and two /series." : "The server builds both monthly series and tests the trends and the gap between them.")
            : sci ? "Two POST /trends requests (descriptive comparison)." : "The server tests each side's trend; the comparison is a description."}</span>
        </div>
      </section>

      {busy && <div className="card pad" role="status"><b>Building the monthly series from NASA data and testing each trend…</b><div className="skel" style={{ height: 200, marginTop: 10 }} /></div>}
      {res && analysis && !busy && (
        <>
          <section className="card pad col hunt-verdict" data-tour="hunt-evidence">
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className={`badge ${STATUS_LABEL[analysis.status].cls}`}>{STATUS_LABEL[analysis.status][sci ? "scientist" : "explorer"]}</span>
              <span className={`badge ${analysis.validity === "comparable" ? "sig" : analysis.validity === "not_comparable" ? "ne" : "np"}`}>{VALIDITY_LABEL[analysis.validity]}</span>
              {analysis.cats.map((c: Category) => <span key={c} className="chip-cat">{CATEGORY_LABEL[c][sci ? "scientist" : "explorer"]}</span>)}
            </div>
            <p className="hunt-headline">{analysis.headline}</p>
            {res.flagged && <span className="small"><b>Why it was flagged:</b> {res.flagged}</span>}
            <div className="hunt-diff">
              <div><h3>What agrees?</h3><ul>{(analysis.text.agrees.length ? analysis.text.agrees : ["Nothing in the compared statistics."]).map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><h3>What differs?</h3><ul>{analysis.text.differs.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><h3>How was this compared?</h3><ul>{analysis.text.how.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><h3>What cannot be concluded?</h3><ul>{analysis.text.cannot.map((x) => <li key={x}>{x}</li>)}</ul></div>
            </div>
            <details className="disclose" open={sci}>
              <summary>{sci ? "Comparability checks" : "Is this a fair comparison?"}</summary>
              <ul className="hunt-checks">{analysis.checks.map((c) => <li key={c.id} className={c.status}><span aria-hidden="true">{c.status === "ok" ? "✓" : c.status === "fail" ? "✕" : "!"}</span>
                <span><b className="sr">{c.status === "ok" ? "OK" : c.status === "fail" ? "Fails" : c.status === "missing" ? "Missing" : "Limitation"}: </b>{c.text}</span></li>)}</ul>
            </details>
            {sci && (
              <details className="disclose">
                <summary>Method, parameters and provenance</summary>
                <table className="hunt-table"><tbody>
                  <tr><th scope="row">Per-side test</th><td>Raw Seasonal Mann-Kendall, α = 0.05; seasonal Sen slope per decade; sufficiency: ≥ 10 years and ≥ 70% of months</td></tr>
                  <tr><th scope="row">Difference test</th><td>{res.test ? `Hamed-Rao MK on the monthly anomaly difference (A minus B): p ${pval(res.test.difference.p_value)}; Sen slope ${signed(res.test.difference.slope_diff_per_decade)} ${u}/decade; moving-block bootstrap (12-month blocks) 95% interval ${ci(res.test.difference.ci)}; executed for this case (${res.test.compare_id})`
                    : "None implemented for this comparison type (descriptive only)"}</td></tr>
                  {[res.a, res.b].map((s, i) => <tr key={i}><th scope="row">{i ? "B" : "A"}</th><td>{s.variable.dataset_name}: {s.trend.source.product} v{s.trend.source.version} ({s.trend.source.provider}); {s.trend.start} to {s.trend.end};
                    n = {s.trend.quality.n_months} months, {s.trend.quality.missing_months} missing; {Math.round(s.trend.quality.coverage_fraction * 100)}% area coverage; native {s.variable.native_resolution_deg}°, processed {s.variable.spatial_resolution_deg}°; Hamed-Rao p {pval(s.trend.p_value_autocorr_adjusted)} (diagnostic); evidence {s.trend.trend_id}</td></tr>)}
                </tbody></table>
              </details>
            )}
          </section>

          <section className="hunt-panels" data-tour="hunt-visual" aria-label="Evidence A and B">
            {([["A", res.a], ["B", res.b]] as const).map(([k, s]) => (
              <div key={k} className="card pad col hunt-panel">
                <div className="row" style={{ gap: 8, alignItems: "center" }}><span className={`hunt-tag ${k.toLowerCase()}`}>{k}</span><b className="hunt-panel-t">{s.label}</b></div>
                <span className="small muted">{s.variable.dataset_name} · {s.trend.start} to {s.trend.end}</span>
                {mode === "regions" && <LocatorMap height={150} boxes={[{ bbox: s.trend.region.bbox, label: k, color: k === "A" ? "#5b4e94" : "#2b2540" }]} />}
                <VerdictBadge t={s.trend} />
                <span className="num hunt-slope">{signed(s.trend.slope_per_decade)} <small>{u} per decade</small></span>
                <div className="grid2"><Stat value={pval(s.trend.p_value)} label="Raw Seasonal MK p" /><Stat value={`${s.trend.quality.n_months} months, ${Math.round(s.trend.quality.coverage_fraction * 100)}% area`} label="Coverage" /></div>
                {s.trend.warnings.map((w) => <span key={w} className="warn small">{w}</span>)}
              </div>
            ))}
          </section>
          <section className="card pad col">
            {mode !== "regions" && <LocatorMap height={180} boxes={[{ bbox: res.a.trend.region.bbox, label: res.a.label.replace(/, \d{4} to \d{4}$/, ""), color: "#5b4e94" }]} />}
            {mode === "regions" && <LocatorMap height={200} boxes={[{ bbox: res.a.trend.region.bbox, label: "A", color: "#5b4e94" }, { bbox: res.b.trend.region.bbox, label: "B", color: "#2b2540" }]} />}
            <span style={{ font: "800 14px var(--body)" }}>{mode === "periods" ? "One monthly anomaly series, two windows" : "Monthly anomalies, A solid and B dashed, one shared axis"} ({u})</span>
            {mode === "periods" ? <PeriodChart series={res.sa} a={res.a.trend} b={res.b.trend} units={u} />
              : <TrendChart anomaly units={u} lines={[{ series: res.sa, trend: res.a.trend, color: "#2b2540", label: "A" }, { series: res.sb!, trend: res.b.trend, color: "#8d86a0", dash: true, label: "B" }]} />}
            <span className="small muted">Trend lines carry the reported Sen slopes (orange rising, blue falling, dashed = not significant). Missing months are gaps, not interpolated. Estimated past trends, not forecasts.</span>
          </section>

          <section className="card pad col">
            <div className="row" style={{ gap: 10 }} >
              <button type="button" className="btn" data-tour="hunt-detective" onClick={ask}>Investigate with Detective</button>
              <span className="small muted">{sci ? "Sends identifiers only; the backend re-resolves and recomputes the evidence." : "The Detective recalculates the evidence itself before explaining."}</span>
            </div>
            <span className="small muted">Questions to try: {EXAMPLE_QUESTIONS[sci ? "scientist" : "explorer"].join(" · ")}</span>
            <div className="col hunt-save" data-tour="hunt-save">
              <label className="col small muted" style={{ gap: 4 }}>Investigation title
                <input className="select" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="col small muted" style={{ gap: 4 }}>Your notes (not part of the evidence)
                <textarea className="select" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ borderRadius: 16, padding: 10 }} /></label>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn soft" onClick={save}>Save Investigation</button>
                <button type="button" className="btn soft" disabled={added || analysis.validity === "not_comparable"} onClick={toReport}>{added ? "Added to report" : "Add to Report"}</button>
                <button type="button" className="btn ghost" onClick={() => go("report")}>Open Report</button>
              </div>
              {msg && <span className="small" role="status">{msg}</span>}
            </div>
          </section>
        </>
      )}
    </>
  );
}

/** One monthly anomaly series with the two windows shaded and each window's Sen slope drawn inside it (display only). */
function PeriodChart({ series, a, b, units }: { series: SeriesResponse; a: TrendResponse; b: TrendResponse; units: string }) {
  const pts = series.points, n = pts.length;
  const vals = pts.map((p) => p.anomaly).filter((v): v is number => v !== null);
  if (n < 2 || !vals.length) return <div className="warn">No values to plot for this selection.</div>;
  const W = 760, H = 260, PL = 56, PR = 12, PT = 12, PB = 30;
  const lo = Math.min(...vals) * 1.1, hi = Math.max(...vals) * 1.1 || 1;
  const X = (i: number) => PL + (i / (n - 1)) * (W - PL - PR), Y = (v: number) => PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PT - PB);
  const idx = (t: string) => pts.findIndex((p) => p.t === t);
  const path = pts.reduce((d, p, i) => (p.anomaly === null ? d + " " : d + `${d.endsWith(" ") || i === 0 ? "M" : "L"}${X(i).toFixed(1)} ${Y(p.anomaly).toFixed(1)}`), "").replace(/\s+/g, " ");
  const seg = (t: TrendResponse) => {
    const i0 = idx(t.start), i1 = idx(t.end);
    if (i0 < 0 || i1 < 0 || t.slope_per_decade === null || !t.quality.sufficient) return null;
    const w = pts.slice(i0, i1 + 1).map((p) => p.anomaly).filter((v): v is number => v !== null);
    const m = w.reduce((s, v) => s + v, 0) / w.length, mid = (i0 + i1) / 2, at = (i: number) => m + (t.slope_per_decade! / 120) * (i - mid);
    return { i0, i1, d: `M${X(i0)} ${Y(at(i0))} L${X(i1)} ${Y(at(i1))}`, color: t.slope_per_decade >= 0 ? "#c4621a" : "#2f6fb3", dash: !t.significant };
  };
  const sa = seg(a), sb = seg(b);
  const band = (t: TrendResponse, fill: string, k: string) => { const i0 = idx(t.start), i1 = idx(t.end); return i0 < 0 || i1 < 0 ? null
    : <g key={k}><rect x={X(i0)} y={PT} width={Math.max(2, X(i1) - X(i0))} height={H - PT - PB} fill={fill} />
      <text x={X(i0) + 4} y={PT + 13} fontSize="12" fontWeight="800" fill="#2b2540">{k}</text></g>; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rchart" role="img" aria-label={`Monthly anomalies ${pts[0].t} to ${pts[n - 1].t} with window A ${a.start} to ${a.end} and window B ${b.start} to ${b.end}, each with its own Sen slope`}>
      {band(a, "rgba(125,111,176,.12)", "A")}{band(b, "rgba(43,37,64,.08)", "B")}
      <line x1={PL} x2={W - PR} y1={Y(0)} y2={Y(0)} stroke="#8a8399" />
      <text x={PL - 6} y={Y(0) + 4} textAnchor="end" fontSize="11" fill="#3d3850">0</text>
      <text x={PL - 6} y={Y(hi / 1.1) + 4} textAnchor="end" fontSize="11" fill="#3d3850">{`+${(hi / 1.1).toFixed(Math.abs(hi) >= 10 ? 0 : 1)}`}</text>
      <text x={PL - 6} y={Y(lo / 1.1) + 4} textAnchor="end" fontSize="11" fill="#3d3850">{(lo / 1.1).toFixed(Math.abs(lo) >= 10 ? 0 : 1).replace("-", "−")}</text>
      <path d={path} fill="none" stroke="#8d86a0" strokeWidth={1} />
      {[sa, sb].map((s, k) => s && <path key={k} d={s.d} stroke={s.color} strokeWidth={4} strokeLinecap="round" strokeDasharray={s.dash ? "10 7" : undefined} />)}
      {pts.map((p, i) => p.t.endsWith("-01") && (Number(p.t.slice(0, 4)) % 4 === 1 || i === 0) && <text key={p.t} x={X(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#3d3850">{p.t.slice(0, 4)}</text>)}
      <text x={12} y={H / 2} fontSize="11" fontWeight="700" fill="#2b2540" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>{`Anomaly (${units})`}</text>
    </svg>
  );
}

/* ---------------------------------------------------------------- discover */
const candCategories = (mode: HuntResponse["mode"], c: HuntCandidate): Category[] =>
  mode === "regions" ? ["opposite_direction"]
    : ["dataset_disagreement", ...(c.reasons.some((r) => /opposite/i.test(r)) || c.type === "opposite_direction" ? ["opposite_direction" as Category] : []),
      ...(c.reasons.some((r) => /significan/i.test(r)) ? ["different_significance_labels" as Category] : [])];
const CAND_STATUS: Record<HuntCandidate["classification"], keyof typeof STATUS_LABEL> = {
  statistical_evidence: "statistically_tested_difference", inconclusive: "inconclusive", descriptive: "descriptive_difference", unsupported: "not_comparable",
};

function Discover({ onInspect }: { onInspect: (mode: HuntMode, a: Opt, b: Opt | null, cfg: Partial<Config>) => void }) {
  const { variables, variable, sel, showError, tempUnit, audience } = useStore();
  const sci = audience === "scientist";
  const avail = variables.filter((v) => v.available);
  const [varId, setVarId] = useState(variable?.available ? variable.id : avail[0]?.id ?? "");
  const v = variables.find((x) => x.id === varId);
  const partner = v ? compatiblePartner(v.id, variables) : null;
  const [twoDatasets, setTwoDatasets] = useState(false);
  const [extentId, setExtentId] = useState(EXTENTS[1].id);
  const [tile, setTile] = useState(5);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<HuntResponse | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const ext = EXTENTS.find((x) => x.id === extentId)!;
  const tiles = Math.ceil((ext.bbox[2] - ext.bbox[0]) / tile) * Math.ceil((ext.bbox[3] - ext.bbox[1]) / tile);
  const f = tempUnit === "F" && v?.display_units === "°F" ? 1.8 : 1;
  const u = v?.display_units ?? "";

  const scan = async () => {
    if (!v) return;
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setBusy(true); setRes(null);
    try {
      setRes(await api.discover({ variable_id: v.id, variable_id_b: twoDatasets && partner ? partner.id : null,
        start: periodStart(sel), end: periodEnd(sel), extent: ext.bbox, tile_deg: tile, max_candidates: 5 }, c.signal));
    } catch (e) { if (!c.signal.aborted) showError(e); } finally { if (ctrl.current === c) { setBusy(false); ctrl.current = null; } }
  };
  const cancel = () => { ctrl.current?.abort(); ctrl.current = null; setBusy(false); };

  return (
    <>
      <section className="card pad col" aria-labelledby="disc-h">
        <h2 id="disc-h" style={{ fontSize: 22 }}>Discover Interesting Differences</h2>
        <p className="small muted" style={{ margin: 0 }}>{sci
          ? `Scans the precomputed per-cell trend map (Seasonal MK + Sen, BH-FDR across cells) for ${sel.startYear} to ${sel.endYear}. The extent is cut into tiles; a tile "leans" one way when at least 30% of its cells are FDR-significant in that direction. Region pairs leaning opposite ways are ranked by the weaker side's share, then the slope gap, then distance; the top 5 are re-tested with the regional difference test. Candidates are selected and re-tested on the same data, so treat them as leads, not confirmed findings.`
          : `The app looks at the ${sel.startYear} to ${sel.endYear} trend map, cuts it into squares and pairs squares that lean opposite ways. The best pairs are then checked with the same test as Compare Regions. These are leads to investigate, not proof.`}</p>
        <div className="row">
          <label className="col small muted" style={{ gap: 4, minWidth: 220, flex: 1 }}>Variable and dataset
            <select className="select" value={varId} onChange={(e) => { setVarId(e.target.value); setTwoDatasets(false); }}>{avail.map((x) => <option key={x.id} value={x.id}>{x.parameter_name} · {x.dataset_name}</option>)}</select></label>
          <label className="col small muted" style={{ gap: 4, minWidth: 200, flex: 1 }}>Search area
            <select className="select" value={extentId} onChange={(e) => setExtentId(e.target.value)}>{EXTENTS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="col small muted" style={{ gap: 4, minWidth: 140 }}>Tile size
            <select className="select" value={tile} onChange={(e) => setTile(Number(e.target.value))}>{[2.5, 5, 10, 20].map((t) => <option key={t} value={t}>{t}° × {t}°</option>)}</select></label>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <label className="row small" style={{ gap: 8, minHeight: 44 }}>
            <input type="checkbox" checked={twoDatasets && !!partner} disabled={!partner} onChange={(e) => setTwoDatasets(e.target.checked)} />
            {partner ? `Look for disagreement with ${partner.dataset_name} instead (descriptive)` : "No compatible second dataset for this variable"}</label>
          <button type="button" className="btn" disabled={busy || !v?.available || tiles > 600} onClick={() => void scan()}>Scan</button>
          <span className="small muted">{tiles} tiles{tiles > 600 ? " (limit 600: choose larger tiles)" : ""} · at most 5 candidates · period from Explore ({sel.startYear} to {sel.endYear})</span>
        </div>
      </section>
      {busy && (
        <div className="card pad col" role="status">
          <b>Scanning {tiles} tiles of the {v?.dataset_name} trend map…</b>
          <span className="small muted">If this period's map has not been computed yet, the server computes it first (about a minute). Then the top candidates are re-tested.</span>
          <button type="button" className="btn soft" style={{ alignSelf: "flex-start" }} onClick={cancel}>Cancel</button>
        </div>
      )}
      {res && !busy && (
        <section className="card pad col">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 20 }}>{res.candidates.length ? `${res.candidates.length} candidate${res.candidates.length === 1 ? "" : "s"}` : "No interesting differences found"}</h2>
            <span className="small muted">{res.tiles_scanned} tiles with data · {(res.runtime_ms / 1000).toFixed(1)} s</span>
          </div>
          {res.compatibility && <div className="warn small">{res.compatibility}</div>}
          {res.candidates.length === 0 && <p className="muted" style={{ margin: 0 }}>No tiles lean in opposite directions with these settings. Try a larger area, smaller tiles or another period. Finding nothing is not proof that everything agrees.</p>}
          <ol className="cands">
            {res.candidates.map((c) => {
              const st = STATUS_LABEL[CAND_STATUS[c.classification]];
              const oa: Opt = { id: `cand-a-${c.rank}-${c.a.bbox.join("_")}`, name: `Candidate ${c.rank} A (${boxName(c.a.bbox)})`, ref: { type: "bbox", bbox: c.a.bbox } };
              const ob: Opt = { id: `cand-b-${c.rank}-${c.b.bbox.join("_")}`, name: `Candidate ${c.rank} B (${boxName(c.b.bbox)})`, ref: { type: "bbox", bbox: c.b.bbox } };
              return (
                <li key={c.rank} className="cand">
                  <div className="cand-map"><LocatorMap height={200} boxes={res.mode === "regions"
                    ? [{ bbox: c.a.bbox, label: "A", color: "#5b4e94" }, { bbox: c.b.bbox, label: "B", color: "#2b2540" }]
                    : [{ bbox: c.a.bbox, label: "tile", color: "#c4462f" }]} /></div>
                  <div className="col" style={{ gap: 6, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}><b>#{c.rank}</b><span className={`badge ${st.cls}`}>{st[sci ? "scientist" : "explorer"]}</span>
                      {candCategories(res.mode, c).map((k) => <span key={k} className="chip-cat">{CATEGORY_LABEL[k][sci ? "scientist" : "explorer"]}</span>)}</div>
                    <span className="small">{res.mode === "regions" ? <>A: {boxName(c.a.bbox)} · B: {boxName(c.b.bbox)} · {c.metrics.distance_deg}° apart</> : <>Tile: {boxName(c.a.bbox)}</>}</span>
                    {c.regional && (
                      <span className="num small"><b>{res.mode === "regions" ? "A" : v?.dataset_name}</b> {signed(c.regional.a.slope_per_decade === null ? null : c.regional.a.slope_per_decade * f)} {u}/decade (p {pval(c.regional.a.p_value)}) ·{" "}
                        <b>{res.mode === "regions" ? "B" : variables.find((x) => x.id === res.variable_id_b)?.dataset_name}</b> {signed(c.regional.b.slope_per_decade === null ? null : c.regional.b.slope_per_decade * f)} {u}/decade (p {pval(c.regional.b.p_value)})</span>
                    )}
                    {c.test && <span className="num small">Difference test: p {pval(c.test.difference.p_value)}, 95% interval {ci(c.test.difference.ci ? [c.test.difference.ci[0] * f, c.test.difference.ci[1] * f] : null)} {u}/decade</span>}
                    <span className="small">{c.classification_text}</span>
                    <details><summary className="small">Why it was flagged</summary><ul className="small">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                      <span className="small muted">Map tiles share {Math.round(c.metrics.weaker_share * 100)}% FDR-significant cells on the weaker side. Further investigation is justified when the regional test agrees.</span></details>
                    <div className="row" style={{ gap: 8 }}>
                      <button type="button" className="btn soft" onClick={() => res.mode === "regions"
                        ? onInspect("regions", oa, ob, { variableId: res.variable_id, startA: Number(res.start.slice(0, 4)), endA: Number(res.end.slice(0, 4)) })
                        : onInspect("datasets", { ...oa, name: `Tile ${boxName(c.a.bbox)}` }, null, { variableId: res.variable_id, variableIdB: res.variable_id_b ?? "", startA: Number(res.start.slice(0, 4)), endA: Number(res.end.slice(0, 4)) })}>
                        Investigate this pair</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <details><summary className="small">How candidates are ranked</summary>
            <ol className="small">{res.criteria.ranking.map((r) => <li key={r}>{r}</li>)}</ol>
            {res.warnings.map((w) => <p key={w} className="small muted" style={{ margin: "4px 0" }}>{w}</p>)}
          </details>
        </section>
      )}
    </>
  );
}
