// Phase 8.5D1 (Seasonal Trend Explorer) and D3 (Time Window Explorer), shown under the Explore chart.
// D1 is descriptive: yearly means of the chosen months and a Theil-Sen slope, with no significance test, because no
// season-specific test is approved yet. D3 reuses the production /trends test for each window and caps the number
// of windows, and says clearly that many windows mean many tests. Stripes, Month by year and Each year live in Patterns.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TrendResponse } from "./api";
import { useStore } from "./store";
import { EachYear, MonthGrid, Stripes } from "./Patterns";
import { MAX_WINDOWS, SEASONS, seasonalYears, senPerDecade } from "./explore";
import { pval, signed, VerdictBadge } from "./ui";
import { convFor, convTrend } from "./units";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TABS = [["stripes", "Stripes"], ["grid", "Month by year"], ["years", "Each year"], ["season", "Seasons"], ["window", "Time window"]] as const;
type Tab = (typeof TABS)[number][0];

export function ExploreFurther() {
  const { run } = useStore();
  const [tab, setTab] = useState<Tab>("stripes");
  if (!run) return null;
  return (
    <section className="card pad col chartcard" aria-labelledby="further">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="further" style={{ fontSize: 20 }}>Explore further · {run.place.label}</h2>
        <div className="seg" role="tablist" aria-label="Exploration view">
          {TABS.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{name}</button>)}
        </div>
      </div>
      {tab === "stripes" ? <Stripes /> : tab === "grid" ? <MonthGrid /> : tab === "years" ? <EachYear /> : tab === "season" ? <Seasons /> : <Windows />}
    </section>
  );
}

function Seasons() {
  const { run } = useStore();
  const [pick, setPick] = useState<string>("jja");
  const months = SEASONS.find((s) => s.id === pick)?.months ?? [Number(pick)];
  const label = SEASONS.find((s) => s.id === pick)?.name ?? MONTHS[Number(pick) - 1];
  const rows = useMemo(() => (run ? seasonalYears(run.series.points, months) : []), [run, pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const slope = rows.length >= 2 ? senPerDecade(rows.map((r) => r.year), rows.map((r) => r.value)) : null;
  if (!run) return null;
  const u = run.variable.display_units;
  const W = 720, H = 200, PL = 50, PR = 12, PT = 10, PB = 26;
  const ys = rows.map((r) => r.value), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.1 || 1;
  const X = (i: number) => PL + (rows.length > 1 ? i / (rows.length - 1) : 0.5) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - PT - PB);
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6 }}>
        {SEASONS.map((s) => <button key={s.id} type="button" className={`chip ${pick === s.id ? "on" : ""}`} aria-pressed={pick === s.id} onClick={() => setPick(s.id)}>{s.name}</button>)}
        <select className="select" aria-label="Single month" value={SEASONS.some((s) => s.id === pick) ? "" : pick} onChange={(e) => e.target.value && setPick(e.target.value)}>
          <option value="">Single month…</option>
          {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
        </select>
      </div>
      {rows.length < 2 ? <p className="warn">Not enough complete years for {label}.</p> : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="rchart" role="img" aria-label={`Yearly mean for ${label}, ${rows[0].year} to ${rows[rows.length - 1].year}`}>
            {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke="#e4e0ea" />
              <text x={PL - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="#3d3850">{v.toPrecision(3)}</text></g>)}
            <path d={rows.map((r, i) => `${i ? "L" : "M"}${X(i)} ${Y(r.value)}`).join("")} fill="none" stroke="#3d3850" strokeWidth={1.6} />
            {rows.map((r, i) => <circle key={r.year} cx={X(i)} cy={Y(r.value)} r={3} fill="#3d3850" />)}
            {rows.filter((_, i) => i % 4 === 0).map((r) => <text key={r.year} x={X(rows.indexOf(r))} y={H - 8} textAnchor="middle" fontSize="11" fill="#3d3850">{r.year}</text>)}
            {slope !== null && (() => {
              const mid = (rows.length - 1) / 2, mean = ys.reduce((a, b) => a + b, 0) / ys.length, yr = (i: number) => rows[i].year - rows[Math.round(mid)].year;
              return <path d={`M${X(0)} ${Y(mean + (slope / 10) * yr(0))} L${X(rows.length - 1)} ${Y(mean + (slope / 10) * yr(rows.length - 1))}`}
                stroke={slope >= 0 ? "#c4621a" : "#2f6fb3"} strokeWidth={3} strokeDasharray="10 6" fill="none" />;
            })()}
          </svg>
          <p className="small" style={{ margin: 0 }}><b>{label} only:</b> yearly mean of {months.length} month{months.length > 1 ? "s" : ""} for {rows.length} complete years.
            Theil-Sen slope {signed(slope)} {u} per decade (<b>descriptive, not tested</b>). The full-year result above uses all months with the Seasonal Mann-Kendall test;
            the two answer different questions.</p>
          <p className="small muted" style={{ margin: 0 }}>With only {rows.length} values, a season-specific trend is much less certain than the full-series trend. A significance test for single seasons is
            a proposed extension and needs scientific review before it is added.</p>
        </>
      )}
    </div>
  );
}

function Windows() {
  const { run, variable, tempUnit, audience, showError } = useStore();
  const cov = variable?.coverage;
  const y0 = cov ? Number(cov.start.slice(0, 4)) : 2001, y1 = cov ? Number(cov.end.slice(0, 4)) : 2024;
  const [start, setStart] = useState(y0), [end, setEnd] = useState(y1);
  const [rows, setRows] = useState<{ key: string; start: number; end: number; t: TrendResponse }[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const placeKey = run ? `${run.variable.id}|${JSON.stringify(run.place.ref)}` : "";
  useEffect(() => { setRows([]); }, [placeKey]);   // a new place or dataset starts a new exploration

  useEffect(() => {
    if (!run || end - start + 1 < 10 || rows.some((r) => r.start === start && r.end === end) || rows.length >= MAX_WINDOWS) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {            // debounce: only the window the user settles on is tested
      ctrl.current?.abort();
      const c = new AbortController(); ctrl.current = c;
      setBusy(true);
      api.trends(run.variable.id, run.place.ref, `${start}-01`, `${end}-12`, c.signal)
        .then((t) => setRows((r) => [...r.filter((x) => !(x.start === start && x.end === end)), { key: `${start}-${end}`, start, end, t }].slice(-MAX_WINDOWS)))
        .catch((e) => { if (!c.signal.aborted) showError(e); })
        .finally(() => { if (ctrl.current === c) setBusy(false); });
    }, 700);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [start, end, run]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) return null;
  const c = convFor(run.variable.display_units, tempUnit, audience);   // windows come raw from the API; run is already shown
  const shown = rows.map((r) => ({ ...r, t: c ? convTrend(r.t, c) : r.t })).sort((a, b) => a.start - b.start || a.end - b.end);
  const u = run.variable.display_units;
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row">
        <label className="small muted">From <select className="select" value={start} onChange={(e) => setStart(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <label className="small muted">to <select className="select" value={end} onChange={(e) => setEnd(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <input type="range" aria-label="Start year" min={y0} max={y1 - 9} value={Math.min(start, y1 - 9)} onChange={(e) => setStart(Number(e.target.value))} style={{ flex: "1 1 160px" }} />
        {busy && <span className="small" role="status">Testing {start} to {end}…</span>}
      </div>
      {end - start + 1 < 10 && <span className="warn small">A window needs at least 10 years.</span>}
      {rows.length >= MAX_WINDOWS && <span className="warn small">Limit of {MAX_WINDOWS} windows reached. Each window is another test; with many windows some will look significant by chance.</span>}
      {shown.length > 0 && (
        <table className="rtable">
          <thead><tr><th scope="col">Window</th><th scope="col">Sen slope per decade</th><th scope="col">Raw Seasonal MK p</th><th scope="col">Verdict</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.key}><td>{r.start} to {r.end}</td><td className="num">{signed(r.t.slope_per_decade)} {u}</td><td className="num">{pval(r.t.p_value)}</td><td><VerdictBadge t={r.t} /></td></tr>
          ))}</tbody>
        </table>
      )}
      <p className="small muted" style={{ margin: 0 }}>Exploratory: each row is the same production test on a different period. If the verdict changes between windows, the
        result is sensitive to the period chosen; that is worth reporting, not a reason to pick the window you like. Results are not corrected for testing several windows.</p>
    </div>
  );
}
