import { useMemo, type JSX } from "react";
import { DEMO_VIDEO, hasPlayableVideo, youtubeEmbedUrl } from "../config/demo";
import { Icon, Terra } from "../ui";

// Public landing page shown before the application. It loads no map or analysis data: everything here is
// static text about features that exist today. No results or numbers are shown on this page on purpose.

const FEATURES = [
  { icon: "globe", title: "Explore Earth", text: "See real NASA environmental datasets on an interactive world map and a 3D globe." },
  { icon: "trend", title: "Detect Trends", text: "Turn monthly data into a trend per decade and test whether it is statistically significant." },
  { icon: "hunt", title: "Compare Regions", text: "Check two places side by side, and whether the difference between them is proven." },
  { icon: "detective", title: "Ask the AI Detective", text: "Ask in plain language. Answers are built from backend statistics, with the evidence shown." },
  { icon: "science", title: "Understand the Science", text: "Every result shows its method, p-values, uncertainty and limitations in simple words." },
  { icon: "report", title: "Create a Report", text: "Collect findings with dataset provenance and export them as Markdown or PDF." },
] as const;

const SOURCES = [
  { kind: "Satellite estimate", name: "GPM IMERG", product: "GPM_3IMERGM V07", what: "Monthly precipitation merged from a constellation of satellites and calibrated with rain gauges.",
    url: "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGM_07/summary" },
  { kind: "Land surface model", name: "GLDAS Noah", product: "GLDAS_NOAH025_M 2.1", what: "Soil moisture, near-surface air temperature and evapotranspiration over land, from a model driven by observations.",
    url: "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary" },
  { kind: "Reanalysis", name: "MERRA-2", product: "M2IMNXASM 5.12.4", what: "2 m air temperature over land and sea from a weather model that continuously assimilates observations.",
    url: "https://disc.gsfc.nasa.gov/datasets/M2IMNXASM_5.12.4/summary" },
] as const;

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const FEATURE_ICON: Record<string, () => JSX.Element> = {
  globe: Icon.globe, hunt: Icon.hunt, detective: Icon.detective, report: Icon.report,
  trend: () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path {...S} d="M4 18l5-6 4 3 7-9" /><path {...S} d="M15 6h5v5" /></svg>,
  science: () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path {...S} d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path {...S} d="M7.5 15h9" /></svg>,
};

/** Decorative globe made of coloured squares. It is an illustration, never data. */
function HeroGlobe() {
  const cells = useMemo(() => {
    const out: { x: number; y: number; c: string }[] = [];
    const palette = ["#c4621a", "#f2a65a", "#fbe0c4", "#cfe1f4", "#7fb2e5", "#2f6fb3"];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      const v = Math.sin(x * 0.9 + y * 0.4) + Math.cos(y * 0.7 - x * 0.3);       // deterministic pattern
      out.push({ x: 20 + x * 20, y: 20 + y * 20, c: palette[Math.max(0, Math.min(5, Math.floor((v + 2) * 1.5)))] });
    }
    return out;
  }, []);
  return (
    <figure className="hero-globe" aria-label="Illustration of a trend map on a globe (not real data)">
      <svg viewBox="0 0 320 320" role="img" aria-hidden="true">
        <defs><clipPath id="hg-clip"><circle cx="160" cy="160" r="138" /></clipPath>
          <radialGradient id="hg-shade" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#1b1730" stopOpacity=".28" /></radialGradient></defs>
        <circle cx="160" cy="160" r="150" fill="#2e2850" />
        <g clipPath="url(#hg-clip)" className="hero-globe-spin">
          <rect width="320" height="320" fill="#cdeaf0" />
          {cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width="19" height="19" rx="3" fill={c.c} />)}
        </g>
        <circle cx="160" cy="160" r="138" fill="url(#hg-shade)" />
        <circle cx="160" cy="160" r="138" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2" />
      </svg>
      <div className="hero-mascot"><Terra size={120} label="Terra, the Earth detective" /></div>
      <figcaption>Illustration, not data</figcaption>
    </figure>
  );
}

function DemoVideoSection() {
  const v = DEMO_VIDEO;
  const playable = hasPlayableVideo(v);
  return (
    <section id="demo" className="lp-section" aria-labelledby="demo-title">
      <span className="lp-eyebrow">Product demo</span>
      <h2 id="demo-title" className="lp-h2">See Terra-scope in action</h2>
      <div className="lp-video">
        {playable && v.kind === "file" && (
          <video controls preload="metadata" poster={v.poster} aria-label={v.title}>
            <source src={v.src} />
            {v.captions && <track kind="captions" src={v.captions} srcLang="en" label="English" default />}
          </video>
        )}
        {playable && v.kind === "youtube" && (
          <iframe src={youtubeEmbedUrl(v.id)!} title={v.title} loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        )}
        {!playable && (
          <div className="lp-video-empty" role="status">
            <span className="lp-video-badge">Product Demo: Coming Soon</span>
            <Terra size={110} />
            <p>The demo video is being recorded. Meanwhile, press <b>Get Started</b> and try the guided tour.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function Landing({ onStart }: { onStart: () => void }) {
  const watchDemo = () => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="landing">
      <header className="lp-header">
        <span className="brand"><Terra size={34} /> Terra-scope</span>
        <nav aria-label="Landing sections" className="lp-links">
          <a href="#landing" onClick={(e) => { e.preventDefault(); document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }); }}>Features</a>
          <a href="#landing" onClick={(e) => { e.preventDefault(); document.getElementById("data")?.scrollIntoView({ behavior: "smooth" }); }}>NASA data</a>
          <a href="#landing" onClick={(e) => { e.preventDefault(); watchDemo(); }}>Demo</a>
        </nav>
        <button type="button" className="btn" onClick={onStart}>Get Started</button>
      </header>

      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="col" style={{ gap: 18 }}>
          <span className="lp-eyebrow">NASA Earth Observation · AI-Powered Exploration</span>
          <h1 id="lp-title" className="lp-h1">Discover Earth's Changing Story.</h1>
          <p className="lp-lead">Explore environmental trends using NASA Earth observation data, statistical analysis, and an AI-powered Earth System Detective.</p>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="btn lp-cta" onClick={onStart}>Get Started</button>
            <button type="button" className="btn soft lp-cta" onClick={watchDemo}>Watch Demo</button>
          </div>
          <span className="small muted">A student project for NASA Space Apps Challenge 2026: "Be An Earth System Trend Detective!"</span>
        </div>
        <HeroGlobe />
      </section>

      <section id="features" className="lp-section" aria-labelledby="features-title">
        <span className="lp-eyebrow">What you can do</span>
        <h2 id="features-title" className="lp-h2">Six ways to investigate a changing planet</h2>
        <div className="lp-grid3">
          {FEATURES.map((f) => {
            const I = FEATURE_ICON[f.icon];
            return (
              <article key={f.title} className="lp-card">
                <span className="lp-icon"><I /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="lp-section" aria-labelledby="how-title">
        <span className="lp-eyebrow">How it works</span>
        <h2 id="how-title" className="lp-h2">Select, explore, analyse, explain</h2>
        <ol className="lp-steps">
          <li><b>Select</b><span>Pick a variable, a NASA dataset, a place and the years.</span></li>
          <li><b>Explore</b><span>See where it is rising or falling on the world map.</span></li>
          <li><b>Analyse</b><span>The backend computes the trend per decade and tests it.</span></li>
          <li><b>Explain</b><span>Terra explains the result in plain words, with the evidence attached.</span></li>
        </ol>
        <div className="lp-question">
          <Terra size={64} />
          <div className="col" style={{ gap: 4 }}>
            <span className="lp-eyebrow" style={{ margin: 0 }}>Example question</span>
            <b>"Is rainfall in the Mekong Delta really increasing, or could it be natural ups and downs?"</b>
            <span className="small muted">Terra-scope answers with a rate per decade, a p-value and a plain verdict computed from the data, never a guess.</span>
          </div>
        </div>
      </section>

      <section id="data" className="lp-section" aria-labelledby="data-title">
        <span className="lp-eyebrow">Data</span>
        <h2 id="data-title" className="lp-h2">Built on NASA Earth observation data</h2>
        <div className="lp-grid3">
          {SOURCES.map((s) => (
            <article key={s.name} className="lp-card">
              <span className="lp-kind">{s.kind}</span>
              <h3>{s.name}</h3>
              <p>{s.what}</p>
              <a className="small" href={s.url} target="_blank" rel="noreferrer">{s.product} at NASA GES DISC</a>
            </article>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 14 }}>Satellite estimates, land models and reanalyses are different kinds of evidence: models and
          reanalyses are not direct measurements, and datasets can disagree. Terra-scope always shows which one you are using.</p>
      </section>

      <DemoVideoSection />

      <section className="lp-section lp-two" aria-labelledby="trust-title">
        <div className="lp-card">
          <span className="lp-eyebrow">Scientific transparency</span>
          <h2 id="trust-title" className="lp-h2" style={{ fontSize: 26 }}>What Terra-scope does not claim</h2>
          <ul className="lp-list">
            <li>Trends describe the past; Terra-scope does not forecast the future.</li>
            <li>A trend shows what changed, not why it changed.</li>
            <li>"Not significant" does not mean "no change": a longer record may still reveal one.</li>
            <li>Results are preliminary and have not been peer reviewed.</li>
          </ul>
        </div>
        <div className="lp-card">
          <span className="lp-eyebrow">The team</span>
          <h2 className="lp-h2" style={{ fontSize: 26 }}>A student project</h2>
          <p>Terra-scope AI is built by a student team for the NASA International Space Apps Challenge 2026. It uses publicly
            available NASA data. It is not an official NASA product, and NASA does not endorse or operate it.</p>
        </div>
      </section>

      <footer className="lp-footer">
        <span className="brand"><Terra size={28} /> Terra-scope AI</span>
        <span className="small muted">Data: NASA GES DISC (GPM IMERG, GLDAS Noah, MERRA-2). Not affiliated with or endorsed by NASA.</span>
        <button type="button" className="btn soft" onClick={onStart}>Open the app</button>
      </footer>
    </div>
  );
}
