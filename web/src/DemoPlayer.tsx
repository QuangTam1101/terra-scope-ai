import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, errorText, type RegionRef, type SeriesResponse, type TrendResponse } from "./api";
import { countryPlace, polarPlace } from "./places";
import { useStore } from "./store";
import { TrendChart } from "./TrendChart";
import { LocatorMap } from "./report/ReportDoc";
import { Term } from "./Term";
import { InfoButton } from "./InfoButton";
import { exploreHash, linkPlace } from "./urlState";
import { plain, signed, Terra, verdictOf } from "./ui";
import { convFor, convSeries, convTrend } from "./units";

// A demo case: one question, one variable, one place, one period. Every number shown comes from the live /trends and
// /series answers for exactly this request; the captions below are templates filled from those answers.
export interface Demo { id: string; question: string; place: string; variable_id: string; region: RegionRef; start: string; end: string }

const STEPS = ["The question", "What we measure", "Where", "Every month", "Seasons removed", "The verdict"];
const SHORT = ["Question", "Measure", "Where", "Months", "No seasons", "Verdict"];

// Small line icons for the fact tiles (decoration only).
const ic = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICONS = {
  what: <><path {...ic} d="M4 18l5-6 4 3 7-9" /><path {...ic} d="M15 6h5v5" /></>,
  where: <><path {...ic} d="M12 21s-6-6.2-6-11a6 6 0 1 1 12 0c0 4.8-6 11-6 11z" /><circle {...ic} cx="12" cy="10" r="2.2" /></>,
  when: <><rect {...ic} x="4" y="5" width="16" height="15" rx="3" /><path {...ic} d="M4 10h16M9 3v4M15 3v4" /></>,
  data: <><ellipse {...ic} cx="12" cy="6" rx="7" ry="2.6" /><path {...ic} d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" /></>,
  unit: <><path {...ic} d="M4 17h16M6 17v-3M10 17v-5M14 17v-3M18 17v-5" /></>,
};
function Fact({ icon, k, v }: { icon: keyof typeof ICONS; k: string; v: ReactNode }) {
  return (
    <div className="demo-fact">
      <span className="demo-fact-ic"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{ICONS[icon]}</svg></span>
      <span className="demo-fact-k">{k}</span>
      <b className="demo-fact-v">{v}</b>
    </div>
  );
}
const TICK_MS = 4000;

/** p-values as text; a raw p of 0 is an underflow, never "exactly zero". */
export const pText = (p: number | null) => (p === null || !isFinite(p) ? "n/a" : p < 1e-4 ? "< 0.0001" : p.toFixed(p < 0.01 ? 4 : 3));
const digits = (x: number) => (Math.abs(x) < 1 ? 3 : 2);
const yearsOf = (d: Demo) => Number(d.end.slice(0, 4)) - Number(d.start.slice(0, 4)) + 1;

/** The verdict sentence in three parts, so the label can carry a glossary link. Decided by the backend's flags only. */
export function verdictParts(t: TrendResponse, name: string): { change: string; label: string; rest: string } {
  const v = verdictOf(t), s = t.slope_per_decade;
  if (v === "ne" || s === null) return { change: "", label: "Not enough data", rest: "too few months to test this place and period." };
  if (v === "np") return { change: `${name} changed ${signed(s, digits(s))} ${t.units} per decade.`, label: "Not significant",
    rest: "it could still be chance. A longer record might settle it." };
  return { change: `${name} ${s > 0 ? "rose" : "fell"} ${plain(Math.abs(s), digits(s))} ${t.units} per decade.`, label: "Significant",
    rest: "unlikely to be chance alone." };
}

/** Scientist line: the backend's own numbers and method names. */
export function methodLine(t: TrendResponse): string {
  const s = t.slope_per_decade;
  return `Seasonal Mann-Kendall raw p ${pText(t.p_value)} vs α 0.05; Hamed-Rao adjusted p ${pText(t.p_value_autocorr_adjusted)} (diagnostic); `
    + `Sen slope ${s === null ? "n/a" : signed(s, digits(s))} ${t.units}/decade; n = ${t.n} months.`;
}

export function DemoPlayer({ demo: d, extra }: { demo: Demo; extra?: ReactNode }) {
  const { variables, regions, ready, audience, tempUnit } = useStore();
  const sci = audience === "scientist";
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(!reduce);
  const [data, setData] = useState<{ t: TrendResponse; s: SeriesResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const box = useRef<HTMLElement>(null);

  useEffect(() => { box.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ctrl = new AbortController();
    setData(null); setError(null);
    Promise.all([api.trends(d.variable_id, d.region, d.start, d.end, ctrl.signal), api.series(d.variable_id, d.region, d.start, d.end, ctrl.signal)])
      .then(([t, s]) => setData({ t, s }))
      .catch((e) => { if (!ctrl.signal.aborted) setError(errorText(e)); });
    return () => ctrl.abort();
  }, [d, attempt]);
  // Auto-advance; waits on "Where" until the data has arrived, stops on the verdict.
  const last = STEPS.length - 1;
  useEffect(() => {
    if (!playing || step >= last || (step >= 2 && !data)) return;
    const id = setTimeout(() => setStep(step + 1), TICK_MS);
    return () => clearTimeout(id);
  }, [playing, step, data, last]);

  const v = variables.find((x) => x.id === d.variable_id);
  // The API answers in its own units ("degC", "m3/m3"); show the catalog's display units. Store variables are already
  // converted (°F, % water…), and convFor reads either kind, so this converts the raw demo numbers once.
  const c = convFor(v?.display_units, tempUnit, audience);
  const u = v?.display_units ?? data?.t.units ?? "";
  const t = data && { ...(c ? convTrend(data.t, c) : data.t), units: u }, s = data && { ...(c ? convSeries(data.s, c) : data.s), units: u };
  const ref = d.region;
  const bbox = data?.t.region.bbox ?? (ref.type === "bbox" ? ref.bbox : ref.type === "country" ? countryPlace(ref.id)?.bbox
    : ref.type === "polar" ? polarPlace(ref.hemi, ref.rows, ref.cols).bbox : regions.find((r) => r.id === ref.id)?.bbox);
  const y0 = d.start.slice(0, 4), y1 = d.end.slice(0, 4);
  const skel = <div className="skel demo-skel" role="status" aria-label="Loading" />;
  const failed = error && <div className="warn col demo-error" role="alert">
    <span>Terra could not load this case. {error}</span>
    <button type="button" className="btn soft" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
  </div>;
  const needData = (body: (t: TrendResponse, s: SeriesResponse) => ReactNode) => (t && s ? body(t, s) : error ? null : skel);

  const body: ReactNode[] = [
    <div className="demo-hero">
      <Terra size={104} />
      <div className="col" style={{ gap: 12, flex: 1, minWidth: 220 }}>
        <p className="demo-q">{d.question}</p>
        <div className="demo-facts">
          <Fact icon="what" k="What" v={v?.parameter_name ?? "…"} />
          <Fact icon="where" k="Where" v={d.place} />
          <Fact icon="when" k="When" v={`${y0} to ${y1}`} />
        </div>
        <p className="demo-cap muted">We look at {yearsOf(d)} years of monthly NASA data, {y0} to {y1}.</p>
      </div>
    </div>,
    v ? <>
      <div className="demo-facts">
        <Fact icon="what" k="Variable" v={<>{v.parameter_name} <InfoButton id={v.id} /></>} />
        <Fact icon="data" k="NASA data" v={v.dataset_name} />
        <Fact icon="unit" k="Unit" v={c ? c.to : v.display_units} />
      </div>
      <p className="demo-cap">{sci ? v.description_technical : v.description_simple}</p>
    </> : ready ? <div className="warn">This dataset is not on the server yet.</div> : skel,
    <>
      {bbox ? <LocatorMap boxes={[{ bbox, label: d.place, color: "#e8735a" }]} height={200} /> : skel}
      <p className="demo-cap">{d.place}: we average every 0.5° square inside the box, month by month.</p>
      {sci && bbox && <p className="demo-cap muted num">Box {bbox.join(", ")} (west, south, east, north).</p>}
    </>,
    needData((t, s) => <>
      <TrendChart lines={[{ series: s }]} anomaly={false} height={240} units={t.units} />
      <p className="demo-cap">Every month from {y0} to {y1}. The big waves are the seasons.</p>
    </>),
    needData((t, s) => <>
      <TrendChart lines={[{ series: s, trend: t }]} anomaly height={240} units={t.units} />
      <p className="demo-cap">Each month minus its usual value. The thick line is the trend{t.significant ? "" : ", dashed when it could be chance"}.</p>
      {sci && <p className="demo-cap muted">Anomaly = value minus that calendar month's mean; line = seasonal Sen slope through the anomaly mean.</p>}
    </>),
    needData((t) => { const p = verdictParts(t, v?.parameter_name ?? "The value"); return <>
      <div className="demo-verdict-row">
        <div className={`demo-rate ${t.slope_per_decade !== null && t.slope_per_decade < 0 ? "down" : "up"}`}>
          <b className="num">{t.slope_per_decade === null ? "n/a" : signed(t.slope_per_decade, digits(t.slope_per_decade))}</b>
          <span>{t.units} per decade</span>
        </div>
        <span className={`demo-stamp ${verdictOf(t)}`}>{p.label}</span>
      </div>
      <p className="demo-verdict">{p.change} <Term id="significance">{p.label}</Term>: {p.rest}</p>
      {sci && <p className="demo-cap muted num">{methodLine(t)}</p>}
      {extra}
      <a className="btn" href={exploreHash({ variableId: d.variable_id, place: linkPlace(ref), start: d.start, end: d.end, view: "trend" })}>Try it yourself</a>
    </>; }),
  ];

  const move = (to: number) => { setPlaying(false); setStep(Math.max(0, Math.min(last, to))); };
  const toggle = () => { if (step >= last) { setStep(0); setPlaying(true); } else setPlaying(!playing); };
  return (
    <section ref={box} className="card pad col demo-player" aria-label={`Demo: ${d.question}`}>
      <div className="row demo-head">
        <h3>{d.question}</h3>
        <span className="small muted" aria-live="polite">Step {step + 1} of {STEPS.length}</span>
      </div>
      <ol className="demo-dots" aria-hidden="true">{STEPS.map((x, i) => (
        <li key={x} className={`${i <= step ? "on" : ""} ${i === step ? "now" : ""}`} onClick={() => move(i)}><span className="demo-bar" /><span className="demo-lbl">{SHORT[i]}</span></li>
      ))}</ol>
      <div className="col demo-step">
        <b className="demo-title">{STEPS[step]}</b>
        {body[step]}
        {failed}
      </div>
      <div className="row demo-controls">
        <button type="button" className="btn soft" onClick={() => move(step - 1)} disabled={step === 0}>Back</button>
        <button type="button" className="btn" onClick={toggle}>{playing && step < last ? "Pause" : "Play"}</button>
        <button type="button" className="btn soft" onClick={() => move(step + 1)} disabled={step === last}>Next</button>
      </div>
    </section>
  );
}
