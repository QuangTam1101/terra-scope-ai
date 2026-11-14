import { useEffect, useMemo, useRef, useState } from "react";
import { caseFromHash, deleteCase, encodeCaseParam, listCases, parseCase, saveCase, type SavedCase } from "../cases";
import { useStore } from "../store";
import { buildReport, toMarkdown, toReproJson, signedNum, pText } from "../report/model";
import { ReportDoc } from "../report/ReportDoc";

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Phase 8.5B: the report is a multi-page print document (A4/Letter) built only from backend evidence.
export function Report() {
  const { history, comparisons, backendVersion, removeReportItem, go, makeCase, openCase, ready } = useStore();
  const [cases, setCases] = useState<SavedCase[]>(() => listCases());
  const [caseMsg, setCaseMsg] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [title, setTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const opened = useRef(false);

  const reopen = async (c: SavedCase) => {
    setOpening(true); setCaseMsg(`Recomputing "${c.title}" from its saved parameters…`);
    const r = await openCase(c);
    setOpening(false);
    setCaseMsg(`Reopened "${c.title}": ${r.ok} item${r.ok === 1 ? "" : "s"} recomputed from the backend${r.failed ? `, ${r.failed} could not be recomputed` : ""}.`
      + (r.changed.length ? ` Results differ from when it was saved for: ${r.changed.join("; ")} (the data or method may have changed).` : r.ok ? " Results match the saved values where they were stored." : ""));
  };
  // A "#report?case=..." link reopens that case once the catalog is loaded.
  useEffect(() => {
    if (!ready || opened.current) return;
    const c = caseFromHash(location.hash);
    if (c) { opened.current = true; void reopen(c); }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const c = makeCase(title || `Case ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    if (!c) return;
    const ok = saveCase(c); setCases(listCases());
    setCaseMsg(ok ? `Saved "${c.title}" in this browser (not in the cloud).` : "This browser blocks local storage: export the case as JSON instead.");
  };
  const copyLink = async () => {
    const c = makeCase(title || "Shared case");
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
  const [stamp, setStamp] = useState(() => new Date());
  const model = useMemo(() => buildReport([...history].reverse(), [...comparisons].reverse(), stamp, backendVersion), [history, comparisons, stamp, backendVersion]);
  const empty = history.length === 0 && comparisons.length === 0;

  const printPdf = () => { setStamp(new Date()); setTimeout(() => window.print(), 50); };

  return (
    <div className="page report-page">
      <section className="card pad col noprint" data-tour="report">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 30 }}>Evidence report</h1>
          <span className="prelim">Preliminary · not yet validated</span>
        </div>
        {empty ? (
          <p className="muted" style={{ margin: 0 }}>No results yet. Run an analysis on Explore, or add a comparison from Hunt, and it will appear here.</p>
        ) : (
          <>
            <p className="muted" style={{ margin: 0, font: "600 14.5px/1.5 var(--body)" }}>
              The report below is laid out as printable pages. Each analysis lists its region, box, period, grid and method so it can be reproduced.
            </p>
            <ul className="report-items">
              {history.map((h) => (
                <li key={h.key}><span><b>{h.variable.parameter_name}</b> · {h.variable.dataset_name} · {h.place.label} · {h.trend.start} to {h.trend.end} · {signedNum(h.trend.slope_per_decade)} {h.variable.display_units}/decade, p {pText(h.trend.p_value)}</span>
                  <button type="button" className="linkbtn" onClick={() => removeReportItem(h.key)} aria-label={`Remove ${h.place.label} from the report`}>Remove</button></li>
              ))}
              {comparisons.map((c) => (
                <li key={c.key}><span><b>Comparison</b> · {c.title}</span>
                  <button type="button" className="linkbtn" onClick={() => removeReportItem(c.key)} aria-label={`Remove ${c.title} from the report`}>Remove</button></li>
              ))}
            </ul>
          </>
        )}
        <div className="row">
          <button type="button" className="btn" disabled={empty} onClick={printPdf}>Save as PDF</button>
          <button type="button" className="btn soft" disabled={empty} onClick={() => download(`terra-scope-report-${model.id}.md`, toMarkdown(model), "text/markdown")}>Export Markdown</button>
          <button type="button" className="btn soft" disabled={empty} onClick={() => download(`terra-scope-report-${model.id}.json`, JSON.stringify(toReproJson(model), null, 2), "application/json")}>Export reproducibility JSON</button>
          {empty && <button type="button" className="btn soft" onClick={() => go("explore")}>Go to Explore</button>}
        </div>
        <div className="casebox">
          <b>Save and reproduce</b>
          <div className="row" style={{ gap: 8 }}>
            <input className="select" style={{ flex: "1 1 200px", minWidth: 0 }} placeholder="Case title (optional)" aria-label="Case title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            <button type="button" className="btn soft" disabled={empty} onClick={save}>Save case</button>
            <button type="button" className="btn soft" disabled={empty} onClick={copyLink}>Copy case link</button>
            <button type="button" className="btn soft" disabled={empty} onClick={() => { const c = makeCase(title || "Exported case"); if (c) download(`${c.id}.json`, JSON.stringify(c, null, 2), "application/json"); }}>Export case JSON</button>
            <button type="button" className="btn soft" onClick={() => fileRef.current?.click()}>Open case file</button>
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
          <span className="small muted">Cases store parameters (dataset, region, period, method) and the results seen when saved. Reopening recomputes everything from the backend. Saved only in this browser.</span>
        </div>
        {!empty && <span className="small muted">In the print dialog choose "Save as PDF", paper A4 or Letter, and turn off "Headers and footers" so the browser does not add its own page address. Page numbers are part of the report.</span>}
      </section>
      {!empty && <ReportDoc m={model} />}
    </div>
  );
}
