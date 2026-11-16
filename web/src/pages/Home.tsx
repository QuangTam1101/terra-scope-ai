import { useContext, useEffect, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { AppChrome } from "../chrome";
import { useStore, WORLD } from "../store";
import { Terra } from "../ui";
import { GLOSSARY } from "../glossary";
import { oppositeHash } from "../opposite";
import { CaseStarter } from "../CaseStarter";
import { GuideSections } from "./DetectiveGuide";

/** Glossary list: plain definition for Explorer, technical definition for Scientist, the other one in a second line. */
function ScienceWords() {
  const { audience } = useStore();
  const sci = audience === "scientist";
  return (
    <section className="card pad col" aria-labelledby="words">
      <h2 id="words" style={{ fontSize: 22 }}>{sci ? "Glossary" : "Science words, explained"}</h2>
      <details className="disclose">
        <summary>{sci ? "Show all terms with technical definitions" : "Show all words"}</summary>
        <div className="glossary-list">
          {Object.entries(GLOSSARY).map(([id, g]) => (
            <div key={id}>
              <b style={{ font: "600 15px var(--display)" }}>{g.term}</b>
              <p style={{ margin: "4px 0 0" }}>{sci ? g.technical : g.plain}</p>
              <p className="small muted" style={{ margin: "4px 0 0" }}>{sci ? `In plain words: ${g.plain}` : `Example: ${g.example}`}</p>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

// Home = a visual user guide: pictures first, as few words as possible.

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICON: Record<string, ReactNode> = {
  variable: <><path {...S} d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></>,
  dataset: <><ellipse {...S} cx="12" cy="6" rx="7" ry="3" /><path {...S} d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  years: <><rect {...S} x="4" y="5" width="16" height="15" rx="3" /><path {...S} d="M4 10h16M9 3v4M15 3v4" /></>,
  place: <><path {...S} d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" /><circle {...S} cx="12" cy="10" r="2.2" /></>,
  result: <><path {...S} d="M4 19l5-6 4 3 7-9" /><path {...S} d="M15 7h5v5" /></>,
};

function Step({ n, icon, title, sub, eg, tint, last }: { n: number | string; icon: string; title: string; sub: string; eg?: string; tint: string; last?: boolean }) {
  return (
    <li className="hstep">
      <div className="hstep-top"><span className={`hstep-num${last ? " last" : ""}`}>{n}</span></div>
      <div className={`hstep-card${last ? " last" : ""}`} style={{ background: tint }}>
        <span className="hstep-icon"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">{ICON[icon]}</svg></span>
        <b>{title}</b>
        <p>{sub}</p>
        {eg && <span className="hstep-eg">{eg}</span>}
      </div>
    </li>
  );
}

// Mini animated maps for the map guide: one per gesture (CSS animations in styles.css, off for reduced motion).
const LAND = "M8 30c10-12 30-14 44-8s18 18 6 26-34 8-44 2S0 40 8 30zM96 18c14-8 40-6 52 6s4 30-12 34-34 2-42-10-8-24 2-30zM70 70c8-6 26-6 32 2s-2 18-14 18-24-12-18-20z";
// Small mouse that moves on the mini map instead of an arrow pointer. (0,0) is the spot it points at: a small dot,
// with the mouse just below and to the right so it never hides the selection. The button in use is orange.
const Cursor = ({ button }: { button: "left" | "right" | "wheel" }) => {
  const hl = "#e8735a";
  return (
    <g>
      <circle r="2.2" fill={hl} stroke="#fff" strokeWidth="1" />
      <g transform="translate(5 6) scale(1.3)">
        <rect width="14" height="22" rx="7" fill="#fff" stroke="#2b2540" strokeWidth="1.6" />
        {button === "left" && <path className="mouse-press" d="M0.8 8V7.5A6.4 6.4 0 0 1 7 0.8V8z" fill={hl} />}
        {button === "right" && <path className="mouse-press" d="M13.2 8V7.5A6.4 6.4 0 0 0 7 0.8V8z" fill={hl} />}
        <path d="M0.8 8.4h12.4M7 0.8v7.6" stroke="#2b2540" strokeWidth="1.2" />
        <rect x="5.5" y="2.6" width="3" height="4.6" rx="1.5" fill={button === "wheel" ? hl : "#fff"} stroke="#2b2540" strokeWidth="1"
          className={button === "wheel" ? "mouse-press" : undefined} />
      </g>
    </g>
  );
};
function MapDemo({ kind }: { kind: "click" | "drag" | "pan" | "zoom" }) {
  return (
    <svg className={`mapdemo demo-${kind}`} viewBox="0 0 160 100" aria-hidden="true">
      <rect width="160" height="100" rx="12" fill="#cdeaf0" />
      <g className="demo-land"><path d={LAND} fill="#f3e3c3" stroke="#d9c49c" strokeWidth="1" /></g>
      {kind === "click" && <>
        <circle className="demo-ripple" cx="80" cy="44" r="10" fill="none" stroke="#e8735a" strokeWidth="2" />
        <rect className="demo-pin" x="75" y="39" width="10" height="10" rx="2" fill="none" stroke="#2b2540" strokeWidth="2.5" />
        <g transform="translate(80 44)"><Cursor button="left" /></g>
      </>}
      {kind === "drag" && <>
        <rect className="demo-box" x="44" y="22" width="70" height="40" rx="3" fill="rgba(232,115,90,.18)" stroke="#e8735a" strokeWidth="2.5" strokeDasharray="6 4" />
        <g className="demo-dragcursor"><Cursor button="left" /></g>
      </>}
      {kind === "pan" && <g className="demo-pancursor"><Cursor button="right" /></g>}
      {kind === "zoom" && <>
        <g transform="translate(118 18)" stroke="#2b2540" strokeWidth="2.4" strokeLinecap="round" fill="#fff">
          <rect x="-8" y="-8" width="22" height="22" rx="7" /><path d="M-2 3h10M3 -2v10" />
        </g>
        <g transform="translate(80 50)"><Cursor button="wheel" /></g>
      </>}
    </svg>
  );
}
const GESTURE_KEY: Record<"click" | "drag" | "pan" | "zoom", string> = {
  click: "Left click", drag: "Left button + drag", pan: "Right button + drag", zoom: "Scroll wheel",
};

function MapTip({ kind, title, how, result }: { kind: "click" | "drag" | "pan" | "zoom"; title: string; how: string; result: string }) {
  return (
    <div className="maptip">
      <MapDemo kind={kind} />
      <span className="maptip-key">{GESTURE_KEY[kind]}</span>
      <b>{title}</b>
      <p className="how">{how}</p>
      <p className="res">{result}</p>
    </div>
  );
}

const STRIPES = "repeating-linear-gradient(135deg, rgba(255,255,255,.95) 0 2px, transparent 2px 7px)";
// Same six cell styles the trend map draws (WorldMap.paintMap): two shades per direction, pale striped, grey.
function Swatch({ color, striped, label, note }: { color: string; striped?: boolean; label: string; note: string }) {
  return (
    <div className="swatch">
      <span aria-hidden="true" style={{ background: color, backgroundImage: striped ? STRIPES : undefined }} />
      <b>{label}</b>
      <small>{note}</small>
    </div>
  );
}

const Num = ({ n }: { n: number }) => (
  <span aria-hidden="true" style={{ width: 24, height: 24, flex: "none", borderRadius: "50%", background: "#e8735a", color: "#fff", display: "inline-grid",
    placeItems: "center", font: "800 13px var(--body)" }}>{n}</span>
);

// Two mini charts: raw monthly values (seasonal waves) and anomalies (seasons removed, trend visible).
function MiniChart({ anomaly }: { anomaly: boolean }) {
  const n = 96, W = 300, H = 110;
  const pts = Array.from({ length: n }, (_, i) => {
    const season = anomaly ? 0 : 26 * Math.sin((2 * Math.PI * i) / 12);
    const noise = 7 * Math.sin(i * 1.7) * Math.cos(i * 0.6);
    return H / 2 - season - noise - (i - n / 2) * 0.32;
  });
  const d = pts.map((y, i) => `${i ? "L" : "M"}${(8 + (i * (W - 16)) / (n - 1)).toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ background: "var(--bg)", borderRadius: 16 }}>
      {anomaly && <line x1="8" x2={W - 8} y1={H / 2} y2={H / 2} style={{ stroke: "var(--ink)" }} strokeOpacity={0.25} strokeDasharray="4 4" />}
      {anomaly && <polygon points={`8,${H / 2 + 22} ${W - 8},${H / 2 - 20} ${W - 8},${H / 2 - 42} 8,${H / 2 + 8}`} style={{ fill: "var(--band-up)" }} fillOpacity={0.35} />}
      <path d={d} fill="none" style={{ stroke: "var(--ink)" }} strokeWidth="1.8" strokeOpacity={0.7} strokeLinejoin="round" />
      {anomaly && <path d={`M8 ${H / 2 + 15} L${W - 8} ${H / 2 - 31}`} style={{ stroke: "var(--up-3)" }} strokeWidth="4" strokeLinecap="round" />}
    </svg>
  );
}

const card = (extra?: object) => ({ border: 0, padding: 18, textAlign: "left" as const, cursor: "pointer", display: "flex", flexDirection: "column" as const, gap: 6, color: "var(--ink)", ...extra });

export function Home() {
  const { variables, regions, runAnalysis, go } = useStore();
  const chrome = useContext(AppChrome);
  const runCase = (variableId: string, regionId: string) => {
    const v = variables.find((x) => x.id === variableId);
    const r = regions.find((x) => x.id === regionId);
    if (!v) return;
    const place = r ? { ref: { type: "preset" as const, id: r.id }, label: r.name, bbox: r.bbox } : WORLD;
    go("explore");
    const last = v.coverage ? Number(v.coverage.end.slice(0, 4)) : 2025;   // full period: its map is pre-computed
    runAnalysis({ parameter: v.parameter, variableId: v.id, startYear: 2001, endYear: last, startMonth: 1, endMonth: 12, place });
  };

  // #guide (the old Detective guide page) lands here: scroll to the guide part of Home
  useEffect(() => {
    if (!location.hash.startsWith("#guide")) return;
    const id = location.hash.includes("proof") ? "guide-right" : "guide-cases";
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 60);
    return () => window.clearTimeout(t);
  }, []);
  const jump = (id: string) => (e: ReactMouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="page">
      {/* welcome */}
      <section className="card pad row" style={{ gap: 22, alignItems: "center" }}>
        <Terra size={130} label="Terra, a round Earth detective with a hat and a magnifying glass" />
        <div className="col" style={{ flex: 1, minWidth: 260 }}>
          <a className="prelim" href="#guide?proof" onClick={jump("guide-right")} style={{ alignSelf: "flex-start" }}>Numbers checked · not peer reviewed</a>
          <h1 style={{ fontSize: 38, lineHeight: 1.1 }}>Is it really changing?</h1>
          <p style={{ font: "700 17px/1.45 var(--body)", margin: 0 }}>Pick a clue and a place. Terra checks 25 years of NASA data (2001 to 2025) and tells you if the change is real.</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => go("explore")}>Start</button>
            <button type="button" className="btn soft" onClick={() => runCase("merra2_air_temperature_2m", "mekong_delta")}>Try an example</button>
            <button type="button" className="btn ghost" onClick={chrome.replayTutorial}>Replay tutorial</button>
            <button type="button" className="btn ghost" onClick={chrome.toLanding}>About Terra-scope</button>
          </div>
        </div>
      </section>

      {/* front door: three questions → variables to open in Explore */}
      <CaseStarter />

      {/* steps */}
      <section className="card pad col" aria-labelledby="steps" style={{ gap: 16 }}>
        <h2 id="steps" style={{ fontSize: 24 }}>How it works</h2>
        <ol className="hsteps">
          <Step n={1} icon="variable" title="What to check" tint="#e6f2ff"
            sub="Pick the thing you want to follow over time." eg="Rain, soil moisture, temperature, evaporation" />
          <Step n={2} icon="dataset" title="Which data" tint="#f8eedb"
            sub="Choose the NASA source. Sources can disagree, so try more than one." eg="e.g. MERRA-2 or GLDAS" />
          <Step n={3} icon="years" title="When" tint="#fdece3"
            sub="Choose a start and end year. A trend needs at least 10 years." eg="Data: 2001 to 2025" />
          <Step n={4} icon="place" title="Where" tint="#e8f7ef"
            sub="Type a country or city, enter coordinates, or use the map." eg="Anywhere, or the whole world" />
          <Step n="✓" icon="result" title="Your answer" tint="#f1ecfc" last
            sub="How fast it rises or falls per decade, and whether that is real or could be chance." eg="Plus a chart of every month" />
        </ol>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
        {/* map controls */}
        <section className="card pad col" aria-labelledby="mouse" style={{ gap: 14, gridColumn: "1 / -1" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <h2 id="mouse" style={{ fontSize: 22 }}>Choosing a place on the map</h2>
          </div>
          <div className="maptips">
            <MapTip kind="click" title="Pick one place" how="Left-click once on the map."
              result="Terra checks the small square (0.5°, about 55 km) under your cursor." />
            <MapTip kind="drag" title="Draw an area" how="Hold the left button, drag across the map to draw a box, then let go."
              result="Everything inside the box is averaged and checked." />
            <MapTip kind="pan" title="Move the map" how="Hold the right button and drag." result="Nothing is selected, the map just slides." />
            <MapTip kind="zoom" title="Zoom in or out" how="Scroll the mouse wheel, or press + and − on the map."
              result="Zoom in first to draw small areas precisely." />
          </div>
        </section>

        {/* colours */}
        <section className="card pad col" aria-labelledby="colours" style={{ gap: 14, gridColumn: "1 / -1" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <h2 id="colours" style={{ fontSize: 22 }}>Reading the trend map</h2>
            <span className="small muted">Each square is one place. Its colour says which way it changed, how fast, and how sure we are.</span>
          </div>
          <div className="swatches">
            <div className="swatch-group">
              <span className="swatch-head" style={{ color: "#2f6fb3" }}>Going down</span>
              <div className="swatch-row">
                <Swatch color="#2f6fb3" label="Falling fast" note="Strong, reliable decrease" />
                <Swatch color="#7fb2e5" label="Falling slowly" note="Small, reliable decrease" />
              </div>
            </div>
            <div className="swatch-group">
              <span className="swatch-head" style={{ color: "#c4621a" }}>Going up</span>
              <div className="swatch-row">
                <Swatch color="#f2a65a" label="Rising slowly" note="Small, reliable increase" />
                <Swatch color="#c4621a" label="Rising fast" note="Strong, reliable increase" />
              </div>
            </div>
            <div className="swatch-group">
              <span className="swatch-head">Not sure or no data</span>
              <div className="swatch-row">
                <Swatch color="#fbe0c4" striped label="Could be chance" note="Pale stripes: the change is too weak to trust yet (orange or blue shows the direction)" />
                <Swatch color="#a7a3b0" label="No data" note="This source has nothing here (for example the sea for a land-only source)" />
              </div>
            </div>
          </div>
          <span className="small muted">"Fast" and "slow" are relative to the rest of the map for the variable you chose. The exact numbers are in the legend under the map.</span>
        </section>
      </div>

      {/* annotated result */}
      <section className="card pad col" aria-labelledby="read" style={{ gap: 14 }}>
        <h2 id="read" style={{ fontSize: 22 }}>Reading a result</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 22, alignItems: "center" }}>
          <div className="col" style={{ gap: 10, padding: 18, borderRadius: 24, border: "2px dashed var(--line)" }} aria-label="Example result">
            <div className="row" style={{ gap: 8 }}><Num n={1} /><span className="badge sig">✓ Clear trend (significant)</span></div>
            <div className="row" style={{ gap: 8 }}><Num n={2} /><span className="num" style={{ font: "600 38px var(--display)" }}>+0.19 °C</span><b>per decade</b></div>
            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <Num n={3} /><div className="stat"><b>[+0.09, +0.25]</b><small>95% CI</small></div>
              <Num n={4} /><div className="stat"><b>&lt;0.001</b><small>Mann–Kendall p</small></div>
            </div>
            <div className="row" style={{ gap: 8 }}><Num n={5} />
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: "var(--track)" }}><div style={{ width: "100%", height: "100%", borderRadius: 6, background: "var(--quality)" }} /></div>
              <span className="small muted num">300 / 300 months</span></div>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["Verdict", "Real trend, maybe noise, or too little data"],
              ["Speed", "Change every 10 years"],
              ["Range", "Includes 0? Direction not sure"],
              ["p-value", "Below 0.05 = significant"],
              ["Data", "More months = more trust"],
            ].map(([t, d], i) => (
              <li key={t} className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                <Num n={i + 1} /><span><b>{t}</b> <span className="muted" style={{ fontWeight: 700 }}>{d}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* values vs anomaly */}
      <section className="card pad col" aria-labelledby="chart" style={{ gap: 12 }}>
        <h2 id="chart" style={{ fontSize: 22 }}>The monthly chart</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
          <div className="col" style={{ gap: 6 }}><MiniChart anomaly={false} /><b>Values</b><span className="small muted" style={{ fontWeight: 700 }}>Real numbers, with seasons</span></div>
          <div className="col" style={{ gap: 6 }}><MiniChart anomaly /><b>Anomaly</b><span className="small muted" style={{ fontWeight: 700 }}>Seasons removed: trend line + shaded range</span></div>
        </div>
      </section>

      {/* Detective guide: demo cases, how the test works, how we check the numbers (its own panel) */}
      <section className="guide-panel" aria-labelledby="guide-panel-title">
        <div className="guide-panel-head">
          <span className="guide-panel-badge"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M15 15l6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>Detective guide</span>
          <h2 id="guide-panel-title">Learn how Terra decides if a change is real</h2>
          <p>Watch a finished case, see the three steps of the trend test, and how we check the numbers.</p>
        </div>
        <GuideSections />
      </section>

      {/* pages */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {[
          ["Explore", "explore", "Map + trend", "#d8ecff"],
          ["Hunt", "hunt", "Two places, opposite trends?", "#fde2d4"],
          ["Detective", "detective", "Ask Terra in plain words", "#ede6fb"],
          ["Report", "report", "Save your evidence", "#dff5ea"],
        ].map(([t, page, d, bg]) => (
          <button key={t} type="button" className="card force-light" style={card({ background: bg })}
            onClick={() => { if (page === "hunt") location.hash = oppositeHash(null); else go(page as "explore" | "detective" | "report"); }}>
            <span style={{ font: "700 20px var(--display)" }}>{t}</span>
            <span style={{ font: "700 14px var(--body)" }}>{d}</span>
          </button>
        ))}
      </section>

      {/* examples */}
      <section className="col" aria-labelledby="examples" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 id="examples" style={{ fontSize: 22 }}>Try one</h2>
          <a href="#guide" onClick={jump("guide-cases")} style={{ font: "800 14px var(--body)" }}>Watch how it works →</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {[
            ["Is the world warming?", "merra2_air_temperature_2m", "global"],
            ["Europe: warming fast?", "merra2_air_temperature_2m", "europe"],
            ["Central Chile: less rain?", "imerg_precip", "central_chile"],
            ["Southern Amazon: hotter?", "merra2_air_temperature_2m", "southern_amazon"],
            ["Southern Amazon: drier soil?", "gldas_soil_moisture_0_10cm", "southern_amazon"],
            ["Mediterranean: drier?", "imerg_precip", "mediterranean"],
          ].map(([q, v, r]) => (
            <button key={q} type="button" className="card" onClick={() => runCase(v, r)} style={card()}>
              <span style={{ font: "700 18px/1.25 var(--display)" }}>{q}</span>
              <span className="btn soft" style={{ alignSelf: "flex-start", minHeight: 36 }}>Run</span>
            </button>
          ))}
        </div>
      </section>

      <ScienceWords />

      {/* limits */}
      <section className="row" aria-label="Good to know" style={{ gap: 10 }}>
        {["Shows what changed, not why", "Past trends, not forecasts", "0.5° grid (about 55 km)"].map((t) => (
          <span key={t} style={{ background: "var(--surface)", borderRadius: 999, padding: "8px 14px", font: "800 13px var(--body)", boxShadow: "var(--shadow)" }}>{t}</span>
        ))}
      </section>
      <span className="footer">Data: NASA GPM IMERG, GLDAS Noah, MERRA-2, MiCASA, GRACE-DA (GES DISC), MODIS (LP DAAC), SMAP (NSIDC), SeaWiFS (OB.DAAC), GRACE (JPL), FIRMS. Not NASA: GPCC (Deutscher Wetterdienst), CRU TS (University of East Anglia).</span>
    </div>
  );
}
