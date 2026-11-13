import type { ReactNode } from "react";
import { useStore, WORLD } from "../store";
import { Terra } from "../ui";

// Home = a visual user guide: pictures first, as few words as possible.

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICON: Record<string, ReactNode> = {
  variable: <><path {...S} d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></>,
  dataset: <><ellipse {...S} cx="12" cy="6" rx="7" ry="3" /><path {...S} d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  years: <><rect {...S} x="4" y="5" width="16" height="15" rx="3" /><path {...S} d="M4 10h16M9 3v4M15 3v4" /></>,
  place: <><path {...S} d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" /><circle {...S} cx="12" cy="10" r="2.2" /></>,
  result: <><path {...S} d="M4 19l5-6 4 3 7-9" /><path {...S} d="M15 7h5v5" /></>,
};

function Tile({ icon, title, sub, bg }: { icon: string; title: string; sub: string; bg: string }) {
  return (
    <div className="col" style={{ gap: 8, alignItems: "center", textAlign: "center", flex: "1 1 150px", minWidth: 140 }}>
      <span style={{ width: 72, height: 72, borderRadius: 24, background: bg, display: "grid", placeItems: "center", color: "var(--ink)" }}>
        <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">{ICON[icon]}</svg>
      </span>
      <b style={{ font: "700 17px var(--display)" }}>{title}</b>
      <span className="small muted" style={{ fontWeight: 700, lineHeight: 1.35 }}>{sub}</span>
    </div>
  );
}
const Arrow = () => (
  <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" style={{ flex: "none", marginTop: 26, color: "#8d86a0" }}>
    <path {...S} d="M2 10h22M17 3l7 7-7 7" />
  </svg>
);

// A small mouse drawing: which button is highlighted, and the gesture drawn next to it.
function Mouse({ button, gesture, title }: { button: "left" | "right" | "wheel"; gesture: "click" | "drag" | "scroll"; title: string }) {
  const hl = "#e8735a";
  return (
    <div className="col" style={{ alignItems: "center", gap: 8, flex: "1 1 130px" }}>
      <svg width="110" height="86" viewBox="0 0 110 86" aria-hidden="true">
        <rect x="12" y="6" width="44" height="72" rx="22" fill="#fff" stroke="#2b2540" strokeWidth="3" />
        <path d="M12 34h44M34 6v28" stroke="#2b2540" strokeWidth="3" />
        {button === "left" && <path d="M14 33V28a20 20 0 0 1 18-20v25z" fill={hl} />}
        {button === "right" && <path d="M54 33V28a20 20 0 0 0-18-20v25z" fill={hl} />}
        <rect x="30" y="14" width="8" height="14" rx="4" fill={button === "wheel" ? hl : "#fff"} stroke="#2b2540" strokeWidth="2.5" />
        {gesture === "click" && <g stroke={hl} strokeWidth="3" strokeLinecap="round"><path d="M70 22l8-6M72 32h10M70 42l8 6" /></g>}
        {gesture === "drag" && <g fill="none" stroke={hl} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M66 60h34M92 52l8 8-8 8" /><rect x="66" y="16" width="32" height="26" rx="4" strokeDasharray="5 4" /></g>}
        {gesture === "scroll" && <g fill="none" stroke={hl} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M80 14v54M72 22l8-8 8 8M72 60l8 8 8-8" /></g>}
      </svg>
      <b style={{ font: "800 14.5px var(--body)", textAlign: "center" }}>{title}</b>
    </div>
  );
}

function Swatch({ color, striped, label }: { color: string; striped?: boolean; label: string }) {
  return (
    <div className="col" style={{ alignItems: "center", gap: 6, flex: "1 1 90px" }}>
      <span aria-hidden="true" style={{ width: 64, height: 42, borderRadius: 12, background: color,
        backgroundImage: striped ? "repeating-linear-gradient(135deg, rgba(255,255,255,.95) 0 2px, transparent 2px 7px)" : undefined }} />
      <b style={{ font: "800 13.5px var(--body)", textAlign: "center" }}>{label}</b>
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
      {anomaly && <line x1="8" x2={W - 8} y1={H / 2} y2={H / 2} stroke="rgba(43,37,64,.3)" />}
      {anomaly && <polygon points={`8,${H / 2 + 22} ${W - 8},${H / 2 - 20} ${W - 8},${H / 2 - 42} 8,${H / 2 + 8}`} fill="#f5b98a" fillOpacity=".45" />}
      <path d={d} fill="none" stroke="#5e5872" strokeWidth="1.6" strokeOpacity=".8" />
      {anomaly && <path d={`M8 ${H / 2 + 15} L${W - 8} ${H / 2 - 31}`} stroke="#c4621a" strokeWidth="4.5" strokeLinecap="round" />}
    </svg>
  );
}

const card = (extra?: object) => ({ border: 0, padding: 18, textAlign: "left" as const, cursor: "pointer", display: "flex", flexDirection: "column" as const, gap: 6, color: "var(--ink)", ...extra });

export function Home() {
  const { variables, regions, runAnalysis, go } = useStore();
  const runCase = (variableId: string, regionId: string) => {
    const v = variables.find((x) => x.id === variableId);
    const r = regions.find((x) => x.id === regionId);
    if (!v) return;
    const place = r ? { ref: { type: "preset" as const, id: r.id }, label: r.name, bbox: r.bbox } : WORLD;
    go("explore");
    runAnalysis({ parameter: v.parameter, variableId: v.id, startYear: 2001, endYear: 2024, place });
  };

  return (
    <div className="page">
      {/* welcome */}
      <section className="card pad row" style={{ gap: 22, alignItems: "center" }}>
        <Terra size={130} label="Terra, a round Earth detective with a hat and a magnifying glass" />
        <div className="col" style={{ flex: 1, minWidth: 260 }}>
          <span className="prelim" style={{ alignSelf: "flex-start" }}>Preliminary · not yet validated</span>
          <h1 style={{ fontSize: 38, lineHeight: 1.1 }}>Is it really changing?</h1>
          <p style={{ font: "700 17px/1.45 var(--body)", margin: 0 }}>Pick a clue and a place. Terra checks 24 years of NASA data and tells you if the change is real.</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => go("explore")}>Start</button>
            <button type="button" className="btn soft" onClick={() => runCase("merra2_air_temperature_2m", "mekong_delta")}>Try an example</button>
          </div>
        </div>
      </section>

      {/* steps */}
      <section className="card pad col" aria-labelledby="steps" style={{ gap: 16 }}>
        <h2 id="steps" style={{ fontSize: 24 }}>How it works</h2>
        <div className="row" style={{ alignItems: "flex-start", gap: 6, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Tile icon="variable" title="1 · Variable" sub="Rain, soil, heat, evaporation" bg="#d8ecff" /><Arrow />
          <Tile icon="dataset" title="2 · Dataset" sub="Which NASA source" bg="#f3e3c3" /><Arrow />
          <Tile icon="years" title="3 · Years" sub="2001 to 2024, at least 10" bg="#fde2d4" /><Arrow />
          <Tile icon="place" title="4 · Place" sub="Name, coordinates or map" bg="#dff5ea" /><Arrow />
          <Tile icon="result" title="Result" sub="Trend + verdict" bg="#ede6fb" />
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
        {/* map controls */}
        <section className="card pad col" aria-labelledby="mouse" style={{ gap: 12 }}>
          <h2 id="mouse" style={{ fontSize: 22 }}>On the map</h2>
          <div className="row" style={{ justifyContent: "space-around", gap: 4 }}>
            <Mouse button="left" gesture="click" title="Click: a place" />
            <Mouse button="left" gesture="drag" title="Drag: an area" />
            <Mouse button="right" gesture="drag" title="Right drag: move" />
            <Mouse button="wheel" gesture="scroll" title="Scroll: zoom" />
          </div>
        </section>

        {/* colours */}
        <section className="card pad col" aria-labelledby="colours" style={{ gap: 12 }}>
          <h2 id="colours" style={{ fontSize: 22 }}>Map colours</h2>
          <div className="row" style={{ justifyContent: "space-around", gap: 6 }}>
            <Swatch color="#c4621a" label="Increasing" />
            <Swatch color="#2f6fb3" label="Decreasing" />
            <Swatch color="#fbe0c4" striped label="Not proven yet" />
            <Swatch color="#a7a3b0" label="No data" />
          </div>
          <span className="small muted" style={{ textAlign: "center", fontWeight: 700 }}>Darker = faster change</span>
        </section>
      </div>

      {/* annotated result */}
      <section className="card pad col" aria-labelledby="read" style={{ gap: 14 }}>
        <h2 id="read" style={{ fontSize: 22 }}>Reading a result</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 22, alignItems: "center" }}>
          <div className="col" style={{ gap: 10, padding: 18, borderRadius: 24, border: "2px dashed var(--line)" }} aria-label="Example result">
            <div className="row" style={{ gap: 8 }}><Num n={1} /><span className="badge sig">✓ Clear trend (significant)</span></div>
            <div className="row" style={{ gap: 8 }}><Num n={2} /><span className="num" style={{ font: "600 38px var(--display)" }}>+0.28 °C</span><b>per decade</b></div>
            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <Num n={3} /><div className="stat"><b>[+0.19, +0.33]</b><small>95% CI</small></div>
              <Num n={4} /><div className="stat"><b>&lt;0.001</b><small>Mann–Kendall p</small></div>
            </div>
            <div className="row" style={{ gap: 8 }}><Num n={5} />
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: "var(--track)" }}><div style={{ width: "100%", height: "100%", borderRadius: 6, background: "var(--quality)" }} /></div>
              <span className="small muted num">288 / 288 months</span></div>
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

      {/* pages */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {[
          ["Explore", "explore", "Map + trend", "#d8ecff"],
          ["Hunt", "hunt", "Two places, opposite trends?", "#fde2d4"],
          ["Detective", "detective", "Ask Terra in plain words", "#ede6fb"],
          ["Report", "report", "Save your evidence", "#dff5ea"],
        ].map(([t, page, d, bg]) => (
          <button key={t} type="button" className="card" onClick={() => go(page as "explore" | "hunt" | "detective" | "report")} style={card({ background: bg })}>
            <span style={{ font: "700 20px var(--display)" }}>{t}</span>
            <span style={{ font: "700 14px var(--body)" }}>{d}</span>
          </button>
        ))}
      </section>

      {/* examples */}
      <section className="col" aria-labelledby="examples" style={{ gap: 10 }}>
        <h2 id="examples" style={{ fontSize: 22 }}>Try one</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {[
            ["Is the world warming?", "merra2_air_temperature_2m", "global"],
            ["Mekong Delta: hotter?", "merra2_air_temperature_2m", "mekong_delta"],
            ["Mekong Delta: wetter?", "imerg_precip", "mekong_delta"],
          ].map(([q, v, r]) => (
            <button key={q} type="button" className="card" onClick={() => runCase(v, r)} style={card()}>
              <span style={{ font: "700 18px/1.25 var(--display)" }}>{q}</span>
              <span className="btn soft" style={{ alignSelf: "flex-start", minHeight: 36 }}>Run</span>
            </button>
          ))}
        </div>
      </section>

      {/* limits */}
      <section className="row" aria-label="Good to know" style={{ gap: 10 }}>
        {["Shows what changed, not why", "Past trends, not forecasts", "1° grid (about 110 km)", "Preliminary results"].map((t) => (
          <span key={t} style={{ background: "#fff", borderRadius: 999, padding: "8px 14px", font: "800 13px var(--body)", boxShadow: "var(--shadow)" }}>{t}</span>
        ))}
      </section>
      <span className="footer">Data: NASA GPM IMERG, GLDAS Noah, MERRA-2 via NASA GES DISC.</span>
    </div>
  );
}
