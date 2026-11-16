import { useEffect, useMemo, useRef, useState } from "react";
import { caseFromHash, deleteCase, encodeCaseParam, listCases, parseCase, saveCase, type SavedCase } from "../cases";
import { useStore } from "../store";
import { rateOf, rateUnit } from "../units";
import { buildReport, toReproJson, signedNum, pText, type ReportComparison, type ReportRun } from "../report/model";
import { EditionDoc, pageCount } from "../report/EditionDoc";
import { ExplorerCompanion } from "../report/ExplorerCompanion";
import { compareHeadline, compareStamp, defaultHeadline, defaultReportTitle, editionMarkdown, headlineWarning, quickCheck, trendStamp, type Edition } from "../report/formd";

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// The reportDraft survives page navigation within the visit (edits, order, selection, chosen edition).
export const reportDraft: { step: 1 | 2 | 3; edition: Edition | null; order: string[]; excluded: string[]; title: string; author: string;
  headlines: Record<string, string>; notes: Record<string, string>; appendix: boolean } = {
  step: 1, edition: null, order: [], excluded: [], title: "", author: "", headlines: {}, notes: {}, appendix: false,
};

const STEPS = ["Who will read it", "Pick findings", "Preview and download"] as const;

/** Form D report: three steps, one report model, Simple or Scientist edition. Everything printed comes from backend evidence. */
export function Report() {
  const { history, comparisons, backendVersion, removeReportItem, go, makeCase, openCase, ready, audience } = useStore();
  const [step, setStepState] = useState(reportDraft.step);
  const [edition, setEditionState] = useState<Edition>(reportDraft.edition ?? (audience === "scientist" ? "scientist" : "simple"));
  const [order, setOrder] = useState<string[]>(reportDraft.order);
  const [excluded, setExcluded] = useState<string[]>(reportDraft.excluded);
  const [title, setTitle] = useState(reportDraft.title);
  const [author, setAuthor] = useState(reportDraft.author);
  const [headlines, setHeadlines] = useState(reportDraft.headlines);
  const [notes, setNotes] = useState(reportDraft.notes);
  const [appendix, setAppendix] = useState(reportDraft.appendix);
  const [cases, setCases] = useState<SavedCase[]>(() => listCases());
  const [caseMsg, setCaseMsg] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const opened = useRef(false);
  useEffect(() => { Object.assign(reportDraft, { step, order, excluded, title, author, headlines, notes, appendix }); }, [step, order, excluded, title, author, headlines, notes, appendix]);
  const setStep = (s: 1 | 2 | 3) => { setStepState(s); window.scrollTo({ top: 0 }); };
  const setEdition = (e: Edition) => { setEditionState(e); reportDraft.edition = e; };

  // Items in report order: the user's order first, then anything new (oldest first, as the analyses were run).
  const items = useMemo(() => {
    const all: ({ kind: "run"; key: string; run: ReportRun } | { kind: "cmp"; key: string; cmp: ReportComparison })[] = [
      ...[...history].reverse().map((r) => ({ kind: "run" as const, key: r.key, run: r as ReportRun })),
      ...[...comparisons].reverse().map((c) => ({ kind: "cmp" as const, key: c.key, cmp: c })),
    ];
    const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length + all.findIndex((x) => x.key === k) : i; };
    return all.sort((a, b) => rank(a.key) - rank(b.key));
  }, [history, comparisons, order]);
  // Untested findings (insufficient data) start unticked; the user can still include them.
  const isIn = (it: (typeof items)[number]) => !excluded.includes(it.key) && !(it.kind === "run" && !it.run.trend.quality.sufficient && !order.includes(`+${it.key}`));
  const toggle = (it: (typeof items)[number]) => {
    if (isIn(it)) setExcluded((x) => [...x, it.key]);
    else { setExcluded((x) => x.filter((k) => k !== it.key)); if (it.kind === "run" && !it.run.trend.quality.sufficient) setOrder((o) => [...o, `+${it.key}`]); }
  };
  const move = (i: number, d: -1 | 1) => {
    const keys = items.map((x) => x.key); const j = i + d;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setOrder([...keys, ...order.filter((k) => k.startsWith("+"))]);
  };

  const [stamp, setStamp] = useState(() => new Date());
  const chosen = items.filter(isIn);
  const model = useMemo(() => buildReport(chosen.filter((x) => x.kind === "run").map((x) => (x as { run: ReportRun }).run),
    chosen.filter((x) => x.kind === "cmp").map((x) => (x as { cmp: ReportComparison }).cmp), stamp, backendVersion),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen.map((x) => x.key).join("|"), stamp, backendVersion]);
  const empty = history.length === 0 && comparisons.length === 0;
  const nothing = chosen.length === 0;
  const checks = useMemo(() => quickCheck(model, headlines), [model, headlines]);

  const reopen = async (c: SavedCase) => {
    setOpening(true); setCaseMsg(`Recomputing "${c.title}" from its saved parameters…`);
    const r = await openCase(c);
    setOpening(false);
    if (!title) setTitle(c.title);
    setCaseMsg(`Reopened "${c.title}": ${r.ok} item${r.ok === 1 ? "" : "s"} recomputed from the backend${r.failed ? `, ${r.failed} could not be recomputed` : ""}.`
      + (r.changed.length ? ` Results differ from when it was saved for: ${r.changed.join("; ")} (the data or method may have changed).` : r.ok ? " Results match the saved values where they were stored." : ""));
    if (r.ok) setStep(3);
  };
  // A "#report?case=..." link reopens that case once the catalog is loaded.
  useEffect(() => {
    if (!ready || opened.current) return;
    const c = caseFromHash(location.hash);
    if (c) { opened.current = true; void reopen(c); }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const caseTitle = () => title.trim() || `Case ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const save = () => {
    const c = makeCase(caseTitle());
    if (!c) return;
    const ok = saveCase(c); setCases(listCases());
    setCaseMsg(ok ? `Saved "${c.title}" in this browser (not in the cloud).` : "This browser blocks local storage: download the case file instead.");
  };
  const copyLink = async () => {
    const c = makeCase(caseTitle());
    if (!c) return;
    const url = `${location.origin}${location.pathname}#report?case=${encodeCaseParam(c)}`;
    try { await navigator.clipboard.writeText(url); setCaseMsg("Link copied. Opening it recomputes the same analyses from the backend."); }
    catch { setCaseMsg(url); }
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try { const c = parseCase(JSON.parse(await f.text())); if (c) await reopen(c); else setCaseMsg("This file is not a valid Terra-scope case."); }
    catch { setCaseMsg("This file is not a valid Terra-scope case."); }
    if (fileRef.current) fileRef.current.value = "";
  };
  // Browser print gives a real text layer (selectable, searchable). While the preview is shown, the document title is the
  // report title, so any print (button or Ctrl+P) gets it as the PDF title and suggested file name.
  const sciEd = edition === "scientist";
  const docTitle = `${(title.trim() || defaultReportTitle(model)).replace(/[\/:*?"<>|]+/g, " ").slice(0, 120)} (${sciEd ? "Scientist" : "Explorer"} report)`;
  useEffect(() => {
    if (step !== 3 || nothing) return;
    const before = document.title;
    document.title = docTitle;
    return () => { document.title = before; };
  }, [step, nothing, docTitle]);
  const printPdf = () => { setStamp(new Date()); setTimeout(() => window.print(), 50); };
  const sci = edition === "scientist";

  const caseBox = (
    <div className="casebox">
      <b>Saved cases</b>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn soft" disabled={empty} onClick={save}>Save case</button>
        <button type="button" className="btn soft" disabled={empty} onClick={copyLink}>Copy share link</button>
        <button type="button" className="btn soft" disabled={empty} onClick={() => { const c = makeCase(caseTitle()); if (c) download(`${c.id}.json`, JSON.stringify(c, null, 2), "application/json"); }}>Download case file</button>
        <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>Open case file</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
      </div>
      {caseMsg && <span className="small" role="status">{caseMsg}</span>}
      {cases.length > 0 && (
        <ul className="report-items">
          {cases.map((c) => (
            <li key={c.id}><span><b>{c.title}</b> · {c.items.length} item{c.items.length === 1 ? "" : "s"} · saved {c.created_at.slice(0, 10)}</span>
              <span className="row" style={{ gap: 10 }}>
                <button type="button" className="linkbtn" disabled={opening} onClick={() => void reopen(c)}>Reopen</button>
                <button type="button" className="linkbtn" onClick={() => { deleteCase(c.id); setCases(listCases()); }}>Delete</button>
              </span></li>
          ))}
        </ul>
      )}
      <span className="small muted">A case stores the parameters of every analysis and the results seen when saved; reopening recomputes them from the backend. Saved only in this browser.</span>
    </div>
  );

  return (
    <div className="page report-page">
      <section className="card pad col noprint" data-tour="report">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 30 }}>Evidence report</h1>
          <a className="prelim" href="#guide">Numbers checked · not peer reviewed</a>
        </div>
        <nav aria-label="Report steps" className="rsteps">
          {STEPS.map((s, i) => (
            <button key={s} type="button" className={`rstep ${step === i + 1 ? "on" : step > i + 1 ? "done" : ""}`} aria-current={step === i + 1 ? "step" : undefined}
              disabled={empty && i > 0} onClick={() => setStep((i + 1) as 1 | 2 | 3)}>
              <span className="n">{step > i + 1 ? "✓" : i + 1}</span>{s}
            </button>
          ))}
        </nav>
        {empty && (
          <>
            <p className="muted" style={{ margin: 0 }}>No results yet. Run an analysis on Explore, or add a comparison from Hunt, and it will appear here. You can also open a saved case.</p>
            <div className="row"><button type="button" className="btn" onClick={() => go("explore")}>Go to Explore</button></div>
            {caseBox}
          </>
        )}
      </section>

      {!empty && step === 1 && (
        <section className="card pad col noprint" aria-labelledby="r1">
          <h2 id="r1" style={{ fontSize: 24 }}>Who will read this report?</h2>
          <div className="redition" role="radiogroup" aria-label="Edition">
            {([["simple", "Explorer", "For students, the public, posters and judges.", ["The discovery: each finding in plain words, with a map", "The evidence: yearly chart and test outcome in words", "Behind the discovery: a visual guide to the method and its limits"]],
               ["scientist", "Scientist", "For researchers and reviewers checking the method.", ["Full statistics on every result page", "Monthly anomaly figures and study-region maps", "Methods, provenance and references"]]] as const).map(([id, name, who, pts]) => (
              <button key={id} type="button" role="radio" aria-checked={edition === id} className={`redcard ${edition === id ? "on" : ""}`} onClick={() => setEdition(id)}>
                <span className="redname">{name}</span><span className="redwho">{who}</span>
                <ul>{pts.map((x) => <li key={x}>{x}</li>)}</ul>
                <span className="small muted">About {pageCount(model, id, appendix)} pages</span>
              </button>
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>Both editions contain the same findings, numbers and verdicts. The edition can be changed again on step 3; nothing is recomputed.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setStep(2)}>Next: pick findings</button></div>
        </section>
      )}

      {!empty && step === 2 && (
        <section className="card pad col noprint" aria-labelledby="r2">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="r2" style={{ fontSize: 24 }}>Which findings go in?</h2>
            <span className="small" style={{ fontWeight: 800 }}>{chosen.length} selected · about {pageCount(model, edition, appendix)} pages · {sci ? "Scientist" : "Explorer"} edition</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Results from Explore and Hunt are listed in the order they will be printed. Tick what to include and use the arrows to reorder.</p>
          <ol className="rpick">
            {items.map((it, i) => {
              const r = it.kind === "run" ? it.run : null, c = it.kind === "cmp" ? it.cmp : null;
              const st = r ? trendStamp({ sufficient: r.trend.quality.sufficient, significant: r.trend.significant }) : compareStamp({ kind: c!.kind, test: c!.test });
              const label = r ? `${r.variable.parameter_name}, ${r.place.label}` : c!.title;
              return (
                <li key={it.key} className={isIn(it) ? "" : "off"}>
                  <input type="checkbox" checked={isIn(it)} onChange={() => toggle(it)} aria-label={`Include ${label}`} />
                  <span className="rpick-main">
                    <b>{label}</b>
                    <span className="small muted">{r ? `${r.variable.dataset_name} · ${r.trend.start} to ${r.trend.end} · ${signedNum(rateOf(r.trend.slope_per_decade, r.variable.display_units))} ${rateUnit(r.variable.display_units)} per decade · p ${pText(r.trend.p_value)}`
                      : `${c!.kind === "regions" ? "Two regions" : c!.kind === "periods" ? "Two periods" : "Two datasets"} · from Hunt`}</span>
                  </span>
                  <span className={`badge rstamp ${st.cls}`}>{st.text}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn ghost ricon" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="btn ghost ricon" aria-label={`Move ${label} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="linkbtn" onClick={() => removeReportItem(it.key)} aria-label={`Remove ${label} from the list`}>Remove</button>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="row"><button type="button" className="btn soft" onClick={() => go("explore")}>Add from Explore</button><button type="button" className="btn soft" onClick={() => go("hunt")}>Add from Hunt</button></div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn soft" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn" disabled={nothing} onClick={() => setStep(3)}>Next: preview</button>
          </div>
        </section>
      )}

      {!empty && step === 3 && (
        <>
          <section className="card pad col noprint" aria-labelledby="r3">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 id="r3" style={{ fontSize: 24 }}>Preview and download</h2>
              <div className="row" style={{ alignItems: "center", gap: 10 }}>
                <span className="label" id="redlabel">Level of detail</span>
                <div className="seg" role="group" aria-labelledby="redlabel">
                  <button type="button" className={!sci ? "on" : ""} aria-pressed={!sci} onClick={() => setEdition("simple")}>Explorer</button>
                  <button type="button" className={sci ? "on" : ""} aria-pressed={sci} onClick={() => setEdition("scientist")}>Scientist</button>
                </div>
                <span className="small" style={{ fontWeight: 800 }}>about {pageCount(model, edition, appendix)} pages · A4</span>
              </div>
            </div>
            {nothing ? <p className="warn" style={{ margin: 0 }}>No finding is selected. Go back to step 2.</p> : (
              <div className="rgrid">
                <div className="col" style={{ gap: 10 }}>
                  <label className="col" style={{ gap: 4 }}><span className="label">Report title</span>
                    <input className="select" aria-label="Report title" value={title} maxLength={200} placeholder={defaultReportTitle(model)} onChange={(e) => setTitle(e.target.value)} /></label>
                  <label className="col" style={{ gap: 4 }}><span className="label">Prepared by</span>
                    <input className="select" aria-label="Prepared by" value={author} maxLength={120} placeholder="Optional" onChange={(e) => setAuthor(e.target.value)} /></label>
                  <details className="disclose" open>
                    <summary>Finding titles and author notes</summary>
                    <div className="col" style={{ gap: 12 }}>
                      {model.analyses.map((a) => {
                        const w = headlines[a.key] ? headlineWarning(headlines[a.key], a) : null;
                        return (
                          <div key={a.key} className="col" style={{ gap: 4 }}>
                            <label className="col" style={{ gap: 4 }}><span className="small" style={{ fontWeight: 800 }}>{a.parameter}, {a.place}</span>
                              <input className="select" value={headlines[a.key] ?? ""} placeholder={defaultHeadline(a)} maxLength={200}
                                aria-label={`Title for ${a.parameter}, ${a.place}`} onChange={(e) => setHeadlines((h) => ({ ...h, [a.key]: e.target.value }))} /></label>
                            {w && <span className="warn small" role="alert">{w}</span>}
                            <textarea className="select" rows={3} value={notes[a.key] ?? ""} maxLength={1000} placeholder="Author note (optional, printed as not part of the evidence)"
                              aria-label={`Author note for ${a.parameter}, ${a.place}`} onChange={(e) => setNotes((n) => ({ ...n, [a.key]: e.target.value }))} style={{ borderRadius: 16, padding: 10 }} />
                          </div>
                        );
                      })}
                      {model.comparisons.map((c) => <span key={c.key} className="small muted">{compareHeadline(c)} (comparison titles follow the test result)</span>)}
                      <span className="small muted">Numbers and verdict labels come from the backend and cannot be edited.</span>
                    </div>
                  </details>
                </div>
                <div className="col" style={{ gap: 10 }}>
                  <div className="rcheck">
                    <b>Quick check</b>
                    {checks.map((c) => <span key={c.text} className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                      <span className={`dotc ${c.ok ? "ok" : "warn"}`} aria-hidden="true">{c.ok ? "✓" : "!"}</span><span className="small">{c.text}</span></span>)}
                  </div>
                  <button type="button" className="btn" style={{ minHeight: 52 }} onClick={printPdf}>Download PDF</button>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn soft" style={{ flex: 1 }} onClick={() => download(`terra-scope-report-${model.id}-${edition}.md`, editionMarkdown(model, edition, { title, author, headlines, notes }), "text/markdown")}>Text (.md)</button>
                    <button type="button" className="btn soft" style={{ flex: 1 }} onClick={() => download(`terra-scope-report-${model.id}.json`, JSON.stringify(toReproJson(model), null, 2), "application/json")}>Data file (.json)</button>
                  </div>
                  <nav aria-label="Pages" className="rpages">
                    <span className="label">Pages</span>
                    <span className="small">1 {sci ? "Research summary" : "The discovery"}</span>
                    {[...model.analyses.map((a) => ({ k: a.key, t: `${a.parameter}, ${a.place}` })), ...model.comparisons.map((c) => ({ k: c.key, t: c.title }))].map((x, i) => (
                      <button key={x.k} type="button" className="linkbtn" style={{ textAlign: "left" }} onClick={() => document.getElementById(`rp-${x.k}`)?.scrollIntoView({ behavior: "auto", block: "start" })}>{i + 2} {x.t}</button>
                    ))}
                    <span className="small">{sci ? "Methods, provenance and reproducibility; references" : `Behind the discovery: how it was done, key ideas, what it cannot tell us, sources${appendix ? "; technical appendix with glossary and full references" : ""}`}</span>
                    {!sci && <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={appendix} onChange={(e) => setAppendix(e.target.checked)} /> Include a technical appendix (every number, glossary, full references)</label>}
                  </nav>
                  <span className="small muted">In the print dialog choose the destination "Save as PDF" (it keeps the text selectable and searchable), paper A4 or Letter, and turn off "Headers and footers". Page numbers are part of the report.</span>
                </div>
              </div>
            )}
            {caseBox}
            <div className="row"><button type="button" className="btn soft" onClick={() => setStep(2)}>Back</button></div>
          </section>
          {!nothing && !sci && model.analyses.length > 0 && <ExplorerCompanion m={model} />}
          {!nothing && <EditionDoc m={model} edition={edition} title={title} author={author} headlines={headlines} notes={notes} appendix={appendix} />}
        </>
      )}
    </div>
  );
}
