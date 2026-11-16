import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { Variable } from "../api";
import { useStore, type Page } from "../store";
import { Terra } from "../ui";
import { DemoPlayer, type Demo } from "../DemoPlayer";
import { clampPeriod } from "../PlaceCompare";

// Demo cases: only ones where the raw Seasonal Mann-Kendall p and the Hamed-Rao adjusted p agree
// (SCIENTIFIC_VALIDATION_RESULTS.md), so Explorer and Scientist never see contradicting verdicts.
// IMERG Final ends 2025-09, so its cases stop at 2024-12. Results are fetched live; nothing here is a result.
export const DEMOS: Demo[] = [
  { id: "world-warming", question: "Is the world warming?", place: "Whole world",
    variable_id: "merra2_air_temperature_2m", region: { type: "preset", id: "global" }, start: "2001-01", end: "2025-12" },
  { id: "amazon-drier", question: "Is the Amazon getting drier?", place: "Amazon",
    variable_id: "imerg_precip", region: { type: "bbox", bbox: [-75, -15, -50, 5] }, start: "2001-01", end: "2024-12" },
  // "Could be chance" must not hang on the start year. Sahara rain (TC-23) and Northern Vietnam soil (TC-18) did: some
  // start years pass the test. Central Highlands rain fails it for every start year 2001 to 2015 (lowest p 0.43; full
  // record p 0.78, Hamed-Rao 0.80), checked with /trends and /trends/sensitivity on 2026-11-15.
  { id: "highlands-rain", question: "Is the rain changing in Vietnam's Central Highlands?", place: "Central Highlands, Vietnam",
    variable_id: "imerg_precip", region: { type: "preset", id: "central_highlands" }, start: "2001-01", end: "2024-12" },
];

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const HOW: { art: ReactNode; text: string; sci: string }[] = [
  { art: <><path {...S} d="M3 10c3-6 5 6 8 0s5 6 8 0" opacity=".45" /><path {...S} d="M3 19h18" /></>,
    text: "Remove the seasons: compare each month with its usual value.", sci: "Anomaly = value minus that calendar month's mean." },
  { art: <><path {...S} d="M3 19L21 7" /><path {...S} d="M12 13h6v-4" opacity=".55" /></>,
    text: "Measure the speed: how much it changes every 10 years.", sci: "Seasonal Sen slope, scaled to one decade." },
  { art: <><path {...S} d="M2 20c4 0 5-14 10-14s6 14 10 14" /><path {...S} d="M19 12v8" stroke="#e8735a" /></>,
    text: "Test it: how likely is a slope like this by pure chance?", sci: "Seasonal Mann-Kendall raw p compared with α = 0.05." },
];

/** A demo's period cut to what the server holds for its variable (the live site's cubes end earlier than local ones). */
export function fitDemo(d: Demo, variables: Variable[]): Demo {
  const p = clampPeriod(d.start, d.end, variables.find((v) => v.id === d.variable_id)?.coverage ?? null);
  return p ? { ...d, start: p.start, end: p.end } : d;
}

/** The guide's sections (demo cases, how the test works, how we check the numbers, method). Shown on Home;
 * #guide opens Home and scrolls here (#guide?proof scrolls to "How we know the numbers are right"). */
export function GuideSections() {
  const { audience, go, variables } = useStore();
  const sci = audience === "scientist";
  const [open, setOpen] = useState<string | null>(null);
  const demos = useMemo(() => DEMOS.map((d) => fitDemo(d, variables)), [variables]);   // stable: DemoPlayer refetches on a new demo object
  const demo = demos.find((d) => d.id === open);
  const link = (p: Page) => (e: MouseEvent) => { e.preventDefault(); go(p); };

  return (
    <>
      <section className="col" aria-labelledby="guide-cases">
        <h2 id="guide-cases" style={{ fontSize: 22 }}>Watch a case</h2>
        <div className="guide-cards">
          {demos.map((d) => (
            <button key={d.id} type="button" className={`card guide-card${open === d.id ? " on" : ""}`} aria-pressed={open === d.id} onClick={() => setOpen(d.id)}>
              <span className="guide-q">{d.question}</span>
              <span className="small muted">{d.place}, {d.start.slice(0, 4)} to {d.end.slice(0, 4)}</span>
              <span className="btn soft">Watch demo</span>
            </button>
          ))}
        </div>
        {demo && <DemoPlayer key={demo.id} demo={demo} />}
      </section>

      <section className="card pad col" aria-labelledby="guide-how">
        <h2 id="guide-how" style={{ fontSize: 22 }}>How a trend test works</h2>
        <ol className="guide-how">
          {HOW.map((h, i) => (
            <li key={i}>
              <span className="guide-num" aria-hidden="true">{i + 1}</span>
              <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">{h.art}</svg>
              <span>{h.text}{sci && <span className="small muted guide-sci">{h.sci}</span>}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card pad col" aria-labelledby="guide-right">
        <h2 id="guide-right" style={{ fontSize: 22 }}>How we know the numbers are right</h2>
        <ul className="guide-proof">
          <li>We recalculated the cleaned data from the raw files, separately from the cleaning code: every compared grid cell matched.
            {sci && <span className="small muted guide-sci"><code>preprocess/verify.py</code>: 100 % of compared cells match for 11 gridded products (6 sample months each); MERRA-2 global mean within 0.003 %; SMAP r = 0.997.</span>}</li>
          <li>Open a case in NASA Giovanni and compare: most NASA datasets in <a href="#explore" onClick={link("explore")}>Explore</a> have the button.</li>
          <li><a href="#hunt" onClick={link("hunt")}>Hunt</a> shows where two NASA datasets disagree.</li>
          {sci && <li>48 of 48 checks pass: the website's numbers equal an independent recalculation (raw Seasonal Mann-Kendall vs Hamed-Rao disagree in 4 of 21 regional cases, so both are shown).</li>}
        </ul>
      </section>

      {sci && (
        <section className="card pad"><details className="disclose guide-method">
          <summary>Method and limits</summary>
          <ul>
            <li>Significance: Seasonal Mann-Kendall test on the monthly series; the raw p is compared with α = 0.05.</li>
            <li>Tested only with at least 10 years and at least 70 % of months with data; otherwise "not enough data".</li>
            <li>Rate: seasonal Sen slope per decade. The interval in Explore is the OLS slope of the deseasonalised anomalies (95 %).</li>
            <li>Hamed-Rao autocorrelation-adjusted p (on the anomalies) is a diagnostic only; it never changes the verdict.</li>
            <li>Trend maps test each 0.5° cell separately, with Benjamini-Hochberg false discovery rate control across cells.</li>
          </ul>
        </details></section>
      )}

    </>
  );
}

export function DetectiveGuide() {
  return (
    <div className="page">
      <section className="card pad row guide-hero">
        <Terra size={110} label="Terra, a round Earth detective with a hat and a magnifying glass" />
        <div className="col guide-intro">
          <h1>Detective guide</h1>
          <p>Be a data detective: pick something to investigate, a place and a period. Terra plots it and tests whether the change is real or could be chance.</p>
        </div>
      </section>
      <GuideSections />
      <section className="row" aria-label="Good to know" style={{ gap: 10 }}>
        {["Shows what changed, not why", "Past trends, not forecasts"].map((t) => <span key={t} className="guide-chip">{t}</span>)}
      </section>
    </div>
  );
}
