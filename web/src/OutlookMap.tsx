import { useEffect, useMemo, useRef, useState } from "react";
import { geoPath } from "d3-geo";
import { forecastApi, type ForecastMap, type ForecastMapCell, type Mode } from "./api";
import { H, land, projection, W } from "./WorldMap";

// Drawing only: colours come from p_below / p_above sent by GET /forecast/map. Orange = tilted above normal, blue = below normal.
const ABOVE = [244, 140, 60], BELOW = [60, 120, 200], NEUTRAL = [240, 236, 226];
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
const cellColor = (c: ForecastMapCell) => {
  const d = c.p_above - c.p_below;                       // −1 … +1; ±0.35 already means a clear tilt
  return mix(NEUTRAL, d >= 0 ? ABOVE : BELOW, Math.min(1, Math.abs(d) / 0.45));
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function OutlookMap({ variableId, mode, months, unitsLabel, onPick }: { variableId: string; mode: Mode; months: string[]; unitsLabel: string; onPick: (lat: number, lon: number) => void }) {
  const [month, setMonth] = useState(months[Math.min(2, months.length - 1)]);
  useEffect(() => { if (!months.includes(month)) setMonth(months[Math.min(2, months.length - 1)]); }, [months, month]);
  const [data, setData] = useState<ForecastMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<{ px: number; py: number; c: ForecastMapCell } | null>(null);
  const cache = useRef(new Map<string, ForecastMap>());
  const cv = useRef<HTMLCanvasElement>(null);
  const [cssW, setCssW] = useState(760);

  useEffect(() => {
    const key = `${variableId}|${mode}|${month}`;
    const hit = cache.current.get(key);
    if (hit) { setData(hit); setErr(null); return; }
    let live = true;
    setLoading(true); setErr(null);
    forecastApi.map(variableId, mode, month)
      .then((m) => { cache.current.set(key, m); if (live) setData(m); })
      .catch((e: Error) => live && setErr(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [variableId, mode, month]);

  useEffect(() => {
    if (!cv.current) return;
    const ro = new ResizeObserver(([e]) => setCssW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(cv.current.parentElement!);
    return () => ro.disconnect();
  }, []);

  const lookup = useMemo(() => {
    const m = new Map<string, ForecastMapCell>();
    data?.cells.forEach((c) => m.set(`${c.lon},${c.lat}`, c));
    return m;
  }, [data]);

  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr; canvas.height = (cssW / 2) * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform((cssW * dpr) / W, 0, 0, (cssW * dpr) / W, 0, 0);
    const path = geoPath(projection, ctx);
    ctx.fillStyle = "#cdeaf0"; ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); path(land); ctx.fillStyle = "#f3e3c3"; ctx.fill();
    const cw = W / 360 + 0.3, ch = H / 180 + 0.3;
    data?.cells.forEach((c) => { ctx.fillStyle = cellColor(c); ctx.fillRect(((c.lon + 180 - 0.5) / 360) * W, ((90 - c.lat - 0.5) / 180) * H, cw, ch); });
    ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(90,70,40,.55)"; ctx.lineWidth = 0.8; ctx.stroke();
  }, [data, cssW]);

  const locate = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const lon = Math.floor(((e.clientX - r.left) / r.width) * 360 - 180) + 0.5;
    const lat = Math.floor(90 - ((e.clientY - r.top) / r.height) * 180) + 0.5;
    return { lon, lat, px: e.clientX - r.left, py: e.clientY - r.top };
  };

  return (
    <section className="card pad col" aria-label="Global outlook map">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ fontSize: 18, margin: 0 }}>Global outlook map</h3>
        <label className="small muted">Month{" "}
          <select className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <span className="small muted">
        Each square is 1° wide. <b style={{ color: "#c4621a" }}>Orange</b> = tilted toward above-normal {unitsLabel}, <b style={{ color: "#2f6fb3" }}>blue</b> = tilted toward below-normal,
        pale = no clear tilt. Hover for the probabilities, click a square to forecast that place.
      </span>
      <div style={{ position: "relative", width: "100%" }}>
        <canvas ref={cv} style={{ width: cssW, height: cssW / 2, borderRadius: 14, cursor: "crosshair", display: "block", opacity: loading ? 0.5 : 1 }}
          role="img" aria-label={`Forecast outlook map for ${data?.t ?? month}`}
          onMouseMove={(e) => { const p = locate(e); const c = lookup.get(`${p.lon},${p.lat}`); setHover(c ? { px: p.px, py: p.py, c } : null); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const p = locate(e); if (lookup.has(`${p.lon},${p.lat}`)) onPick(p.lat, p.lon); }} />
        {loading && <div className="small" style={{ position: "absolute", top: 10, left: 12, background: "#fff", padding: "4px 10px", borderRadius: 999 }}>Loading the map…</div>}
        {hover && (
          <div className="small" style={{ position: "absolute", left: Math.min(hover.px + 12, cssW - 200), top: hover.py + 12, background: "#fff", padding: "6px 10px", borderRadius: 12, boxShadow: "0 4px 14px rgba(0,0,0,.18)", pointerEvents: "none", whiteSpace: "nowrap" }}>
            <b>{hover.c.lat}°, {hover.c.lon}°</b><br />below {pct(hover.c.p_below)} · near {pct(1 - hover.c.p_below - hover.c.p_above)} · above {pct(hover.c.p_above)}
          </div>
        )}
      </div>
      <div className="row small muted" style={{ gap: 10 }}>
        <span>below normal</span>
        <span style={{ flex: "0 1 220px", height: 10, borderRadius: 6, background: `linear-gradient(90deg, ${mix(NEUTRAL, BELOW, 1)}, ${mix(NEUTRAL, BELOW, 0)} 50%, ${mix(NEUTRAL, ABOVE, 1)})` }} />
        <span>above normal</span>
        {data && <span style={{ marginLeft: "auto" }}>For {data.t} · {data.lead_months} months after the last data ({data.origin})</span>}
      </div>
      <span className="small muted">“Normal” is the 2001–2016 climate of each square (the middle third of what happened in that calendar month). Because the world has warmed since then, temperature maps lean orange almost everywhere. That is the warming trend, not a local alarm.</span>
      {err && <span className="warn small">{err}</span>}
      {data?.warnings.map((w) => <span key={w} className="warn small">{w}</span>)}
    </section>
  );
}
