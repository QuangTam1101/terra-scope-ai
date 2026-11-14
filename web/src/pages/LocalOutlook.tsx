import { useCallback, useEffect, useMemo, useState } from "react";
import { localApi, type Confidence, type LocalHazard, type LocalOutlook as Outlook, type LocalTheme } from "../api";
import { useStore } from "../store";
import { PlacePicker } from "../PlacePicker";
import { signed } from "../ui";

// Wording and layout only: every number, level and explanation comes from POST /local-outlook.
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : `${Math.round(x * 100)}%`);
const CONF: Record<Confidence, string> = { high: "High confidence", moderate: "Moderate confidence", low: "Low confidence", none: "No reliable signal" };
const CONF_HINT: Record<Confidence, string> = {
  high: "Tested on real NASA measurements: clearly better than guessing the seasonal norm.",
  moderate: "Some skill in the tests: treat it as a hint, not a promise.",
  low: "Small skill in the tests: only slightly better than a coin toss.",
  none: "The tests show no skill here, so we do not claim a signal.",
};
const ConfBadge = ({ c }: { c: Confidence }) => <span className={`cf ${c}`} title={CONF_HINT[c]}>{CONF[c]}</span>;
const monthName = (ym: string) => new Date(ym + "-01T00:00:00Z").toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
const STORE = "terraPlace";

interface Loc { lat: number; lon: number; label: string }
const readStored = (): Loc | null => { try { const v = JSON.parse(localStorage.getItem(STORE) ?? "null"); return v && typeof v.lat === "number" ? v : null; } catch { return null; } };

function HazardCard({ h, open, onToggle }: { h: LocalHazard; open: boolean; onToggle: () => void }) {
  return (
    <article className={`hz lv-${h.id}-${h.level}`} aria-label={h.title}>
      <div className="hz-top"><b>{h.title}</b><ConfBadge c={h.confidence} /></div>
      <div className="hz-level">{h.level_label}</div>
      <p className="hz-sum">{h.summary}</p>
      <button type="button" className="link" aria-expanded={open} onClick={onToggle}>{open ? "Hide the reasons" : "Why?"}</button>
      {open && <ul className="why">{h.basis.map((b) => <li key={b}>{b}</li>)}</ul>}
    </article>
  );
}

function Timeline({ theme, sci }: { theme: LocalTheme; sci: boolean }) {
  const dryWord = theme.variable === "t2m" ? "cooler" : "drier";
  const wetWord = theme.variable === "t2m" ? "warmer" : theme.variable === "precip" ? "wetter" : "moister";
  return (
    <div className="tl" role="list" aria-label={`${theme.label}, month by month`}>
      {theme.points.map((p, i) => {
        const faded = p.confidence === "none";
        const lead = i < 3 ? "near" : "";
        const tilt = p.p_above - p.p_below;
        return (
          <div key={p.t} role="listitem" className={`tl-m ${lead} ${faded ? "faded" : ""}`}
            title={`${monthName(p.t)}: ${pct(p.p_below)} ${dryWord}, ${pct(p.p_near)} near normal, ${pct(p.p_above)} ${wetWord}. ${CONF[p.confidence]}.`}>
            <small>{monthName(p.t)}</small>
            <div className="tl-bar"><i style={{ height: `${Math.min(100, Math.abs(tilt) * 160)}%`, background: faded ? "#cfcbd9" : tilt >= 0 ? "#f08c3c" : "#3c78c8", [tilt >= 0 ? "bottom" : "top"]: "50%" }} /></div>
            <small className="muted">{faded ? "no signal" : `${Math.round(Math.max(p.p_above, p.p_below) * 100)}%`}</small>
            {sci && <small className="muted">{pct(p.p_below)}/{pct(p.p_near)}/{pct(p.p_above)}</small>}
          </div>
        );
      })}
    </div>
  );
}

export function LocalOutlook({ sci }: { sci: boolean }) {
  const { sel } = useStore();
  const [loc, setLoc] = useState<Loc | null>(readStored);
  const [data, setData] = useState<Outlook | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [geo, setGeo] = useState<"idle" | "asking" | "denied" | "unsupported">("idle");
  const [open, setOpen] = useState<string | null>("drought");
  const [theme, setTheme] = useState("heat");

  // A place picked with the search box becomes the current place (the default "whole world" is ignored).
  useEffect(() => {
    const p = sel.place;
    if (p.ref.type === "preset" && p.ref.id === "global") return;
    const [w, s, e, n] = p.bbox;
    setLoc({ lat: (s + n) / 2, lon: (w + e) / 2, label: p.label });
  }, [sel.place]);

  useEffect(() => {
    if (!loc) return;
    try { localStorage.setItem(STORE, JSON.stringify(loc)); } catch { /* private mode */ }
    let live = true;
    setLoading(true); setErr(null);
    localApi.outlook(loc.lat, loc.lon, loc.label)
      .then((d) => { if (live) { setData(d); setTheme(d.themes.heat ? "heat" : Object.keys(d.themes)[0]); } })
      .catch((e: Error) => live && setErr(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [loc]);

  const useMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) { setGeo("unsupported"); return; }
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo("idle"); setLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Your location" }); },
      () => setGeo("denied"),
      { timeout: 15000, maximumAge: 600000 },
    );
  }, []);

  const download = () => {
    if (!data) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `terra-scope-local-outlook-${data.as_of.data_through}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const th = data?.themes[theme];
  const sciLive = data?.scientific?.live_backtest as Record<string, { by_horizon?: Record<string, { n: number; model: Record<string, number>; persistence: Record<string, number> }> }> | undefined;
  const themeKeys = useMemo(() => Object.keys(data?.themes ?? {}), [data]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <section className="card pad col" aria-labelledby="lo-title">
        <h2 id="lo-title" style={{ fontSize: 22, margin: 0 }}>What is coming for your place?</h2>
        <span className="small muted">A drought, rain and heat outlook for the next months, built from the latest NASA measurements and ocean signals such as El Niño. It also tells you how much to trust each answer.</span>
        <div className="row">
          <button type="button" className="btn" onClick={useMyLocation} disabled={geo === "asking"}>{geo === "asking" ? "Finding you…" : "Use my location"}</button>
          <span className="small muted">or search for a place:</span>
        </div>
        <PlacePicker />
        {geo === "denied" && <span className="warn small">Location was not shared, so nothing was sent. Search for a place above instead.</span>}
        {geo === "unsupported" && <span className="warn small">This browser cannot share a location. Search for a place above instead.</span>}
        <span className="small muted">Privacy: your exact position is used only to find your 1° square (about 110 km). Only that square's centre is used to read NASA data.</span>
      </section>

      {loading && <section className="card pad" role="status" aria-live="polite">Reading the latest NASA observations for {loc?.label ?? "your place"}… the first time can take up to a minute.</section>}
      {err && <section className="card pad warn" role="alert">{err}</section>}

      {data && !loading && (
        <>
          <section className="card pad col" aria-label="Where and when">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 20, margin: 0 }}>{data.place.label}</h3>
              <span className="small muted">{data.place.lat.toFixed(1)}°, {data.place.lon.toFixed(1)}° · today {data.as_of.today} · latest NASA month {data.as_of.data_through}</span>
            </div>
            {data.now.items.length > 0 && (
              <>
                <span className="label">Right now ({data.now.month}), measured</span>
                <div className="row" style={{ gap: 8 }}>
                  {data.now.items.map((it) => (
                    <span key={it.key} className={`cond st-${it.state.replace(/\s+/g, "-")}`} title={`Last 3 months: ${it.last3_state}`}><b>{it.label}: {it.state}</b><small>{it.detail}</small></span>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="hz-grid" aria-label="Outlook for the next 3 months">
            {data.hazards.map((h) => <HazardCard key={h.id} h={h} open={open === h.id} onToggle={() => setOpen(open === h.id ? null : h.id)} />)}
          </section>

          {th && (
            <section className="card pad col" aria-labelledby="lo-tl">
              <h3 id="lo-tl" style={{ fontSize: 18, margin: 0 }}>The next 12 months</h3>
              <span className="small muted">Orange bars lean above normal, blue bars below normal; taller means more likely. The first three months are the most reliable. Grey months have no reliable signal.</span>
              <div className="seg" role="group" aria-label="Choose what to show">
                {themeKeys.map((k) => <button key={k} type="button" className={theme === k ? "on" : ""} aria-pressed={theme === k} onClick={() => setTheme(k)}>{data.themes[k].label}</button>)}
              </div>
              <Timeline theme={th} sci={sci} />
            </section>
          )}

          <section className="card pad col" aria-labelledby="lo-why">
            <h3 id="lo-why" style={{ fontSize: 18, margin: 0 }}>Why does the model say this?</h3>
            <div className="row" style={{ gap: 8 }}>
              {data.explanation.conditions.map((c) => <span key={c.key} className="cond" title={c.description}><b>{c.phase}</b><small>{c.label.split(" (")[0]} · {c.as_of}</small></span>)}
            </div>
            <ul className="why">{data.explanation.simple.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </section>

          <section className="card pad col" aria-labelledby="lo-trust">
            <h3 id="lo-trust" style={{ fontSize: 18, margin: 0 }}>How much can you trust it?</h3>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{data.trust.summary}</p>
            <div className="grid2">
              {Object.entries(data.trust.by_theme).map(([k, rows]) => {
                const label = data.themes[k]?.label ?? k;
                const r1 = rows["1"], r3 = rows["3"];
                return (
                  <div key={k} className="trust">
                    <b>{label}</b>
                    <small className="muted">{r1 ? `1 month ahead: right third ${pct(r1.right_third)} of the time (33% by chance).` : "Not tested."}</small>
                    {r3 && <small className="muted">3 months ahead: right third {pct(r3.right_third)}.</small>}
                  </div>
                );
              })}
            </div>
          </section>

          {sci && (
            <section className="card pad col" aria-labelledby="lo-sci">
              <h3 id="lo-sci" style={{ fontSize: 18, margin: 0 }}>For scientists</h3>
              <span className="small muted">{data.as_of.note} Source: {data.as_of.source}. Climate indices last updated: {Object.entries(data.as_of.indices_through).map(([k, v]) => `${k} ${v}`).join(", ")}.</span>
              <span className="label">Real-data backtest (after the training period), by lead time</span>
              <div style={{ overflowX: "auto" }}>
                <table className="fc-table">
                  <thead><tr><th>Variable</th><th>Lead</th><th>n</th><th>Skill vs norm</th><th>Persistence skill</th><th>RPSS</th><th>Right third</th><th>80% coverage</th></tr></thead>
                  <tbody>
                    {Object.entries(sciLive ?? {}).flatMap(([v, m]) => Object.entries(m.by_horizon ?? {}).map(([h, r]) => (
                      <tr key={`${v}${h}`}><td>{v}</td><td>{h}</td><td>{r.n}</td><td>{signed(r.model.skill_vs_clim, 3)}</td><td>{signed(r.persistence.skill_vs_clim, 3)}</td>
                        <td className={r.model.rpss >= 0.07 ? "fc-pos" : "muted"}>{signed(r.model.rpss, 3)}</td><td>{pct(r.model.tercile_accuracy)}</td><td>{pct(r.model.coverage_conformal)}</td></tr>
                    )))}
                  </tbody>
                </table>
              </div>
              <span className="label">Observed last 12 months at this square (z = standard deviations from the 2001 to 2020 mean)</span>
              <div style={{ overflowX: "auto" }}>
                <table className="fc-table">
                  <thead><tr><th>Month</th><th>z temp</th><th>z rain</th><th>z soil</th><th>z evap</th><th>Rain (mm)</th><th>Normal rain (mm)</th></tr></thead>
                  <tbody>{(data.scientific.observed as Record<string, number | string | null>[]).map((o) => (
                    <tr key={String(o.t)}><td>{o.t}</td><td>{signed(o.z_t2m as number, 2)}</td><td>{signed(o.z_precip as number, 2)}</td><td>{signed(o.z_soil as number, 2)}</td><td>{signed(o.z_evap as number, 2)}</td><td>{Number(o.raw_precip).toFixed(0)}</td><td>{Number(o.normal_precip).toFixed(0)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <span className="label">Hazard rule</span>
              <span className="small muted">{data.scientific.hazard_rules?.drought}</span>
              <span className="small muted">{data.scientific.method}</span>
              <div className="row"><button type="button" className="btn soft" onClick={download}>Download results (JSON)</button></div>
            </section>
          )}

          <section className="card pad col" aria-label="What this cannot tell you">
            <b style={{ fontSize: 15 }}>What this cannot tell you</b>
            {data.limits.map((l) => <span key={l} className="small muted">• {l}</span>)}
          </section>
        </>
      )}
    </div>
  );
}
