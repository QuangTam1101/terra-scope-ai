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
const MAX_ZOOM = 12;
type View = { k: number; cx: number; cy: number };             // zoom factor and top-left corner, in map units (W x H)
const clampView = (v: View): View => {
  const k = Math.min(MAX_ZOOM, Math.max(1, v.k));
  return { k, cx: Math.min(W - W / k, Math.max(0, v.cx)), cy: Math.min(H - H / k, Math.max(0, v.cy)) };
};

export function OutlookMap({ variableId, mode, months, unitsLabel, onPick, onArea }: { variableId: string; mode: Mode; months: string[]; unitsLabel: string; onPick: (lat: number, lon: number) => void; onArea?: (bbox: [number, number, number, number]) => void }) {
  const [month, setMonth] = useState(months[Math.min(2, months.length - 1)]);
  useEffect(() => { if (!months.includes(month)) setMonth(months[Math.min(2, months.length - 1)]); }, [months, month]);
  const [data, setData] = useState<ForecastMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<{ px: number; py: number; c: ForecastMapCell } | null>(null);
  const cache = useRef(new Map<string, ForecastMap>());
  const cv = useRef<HTMLCanvasElement>(null);
  const [cssW, setCssW] = useState(760);
  const [view, setView] = useState<View>({ k: 1, cx: 0, cy: 0 });
  // Same controls as the Explore map (WorldMap): left click picks a square, left drag draws an area, right drag moves
  // the map, wheel or + / - zoom around the pointer, 1:1 shows the whole world.
  const pan = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const left = useRef<{ px: number; py: number; lon: number; lat: number } | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number; lon0: number; lat0: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

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
    const sc = (cssW * dpr * view.k) / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sc, 0, 0, sc, -view.cx * sc, -view.cy * sc);
    const path = geoPath(projection, ctx);
    ctx.fillStyle = "#cdeaf0"; ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); path(land); ctx.fillStyle = "#f3e3c3"; ctx.fill();
    const cw = W / 360 + 0.3, ch = H / 180 + 0.3;
    data?.cells.forEach((c) => { ctx.fillStyle = cellColor(c); ctx.fillRect(((c.lon + 180 - 0.5) / 360) * W, ((90 - c.lat - 0.5) / 180) * H, cw, ch); });
    ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(90,70,40,.55)"; ctx.lineWidth = 0.8 / Math.sqrt(view.k); ctx.stroke();
  }, [data, cssW, view]);

  // screen pixel (CSS) -> map units, with the current zoom
  const toMap = (px: number, py: number) => ({ x: view.cx + (px * W) / (cssW * view.k), y: view.cy + (py * W) / (cssW * view.k) });
  const zoomAt = (factor: number, px = cssW / 2, py = cssW / 4) => setView((v) => {
    const m = { x: v.cx + (px * W) / (cssW * v.k), y: v.cy + (py * W) / (cssW * v.k) };
    const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
    return clampView({ k, cx: m.x - (px * W) / (cssW * k), cy: m.y - (py * W) / (cssW * k) });
  });
  // wheel zoom around the cursor; a non-passive listener so the page does not scroll while zooming the map
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  });

  const locate = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top, m = toMap(px, py);
    const lon = Math.floor((m.x / W) * 360 - 180) + 0.5;
    const lat = Math.floor(90 - (m.y / H) * 180) + 0.5;
    return { lon, lat, px, py };
  };
  const iconBtn = { width: 44, height: 44, borderRadius: 14, border: 0, background: "var(--surface)", boxShadow: "var(--shadow)",
    font: "800 20px var(--body)", color: "var(--ink)", cursor: "pointer" } as const;
  // map units -> lon/lat (not snapped), for drawing an area
  const rawLonLat = (px: number, py: number) => { const m = toMap(px, py); return { lon: (m.x / W) * 360 - 180, lat: 90 - (m.y / H) * 180 }; };

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
        pale = no clear tilt. Hover for the probabilities, click a square to forecast that place or drag to draw an area. Scroll or use + and − to zoom, drag with the right button to move the map.
      </span>
      <div style={{ position: "relative", width: "100%" }}>
        <canvas ref={cv} style={{ width: cssW, height: cssW / 2, borderRadius: 14, cursor: grabbing ? "grabbing" : box ? "crosshair" : "pointer", display: "block", opacity: loading ? 0.5 : 1, touchAction: "none" }}
          role="img" aria-label={`Forecast outlook map for ${data?.t ?? month}, zoom ${view.k.toFixed(1)} times.`}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
            if (e.button === 2) { pan.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; setGrabbing(true); setHover(null); return; }
            if (e.button === 0) { const p = locate(e), ll = rawLonLat(p.px, p.py); left.current = { px: p.px, py: p.py, lon: ll.lon, lat: ll.lat }; }
          }}
          onPointerMove={(e) => {
            const st = pan.current;
            if (st) { const u = W / (cssW * view.k); setView(clampView({ k: view.k, cx: st.cx - (e.clientX - st.x) * u, cy: st.cy - (e.clientY - st.y) * u })); return; }
            const p = locate(e), l = left.current;
            if (l && (box || Math.hypot(p.px - l.px, p.py - l.py) > 5)) {   // moved more than a few pixels: it is a drag, draw a box
              setBox({ x0: l.px, y0: l.py, x1: p.px, y1: p.py, lon0: l.lon, lat0: l.lat }); setHover(null); return;
            }
            const c = lookup.get(`${p.lon},${p.lat}`); setHover(c ? { px: p.px, py: p.py, c } : null);
          }}
          onPointerUp={(e) => {
            if (e.button === 2 || pan.current) { pan.current = null; setGrabbing(false); return; }
            const p = locate(e);
            if (e.button === 0 && left.current) {
              if (box && onArea) {
                const ll = rawLonLat(p.px, p.py);
                const w = Math.max(-180, Math.floor(Math.min(box.lon0, ll.lon))), ea = Math.min(180, Math.ceil(Math.max(box.lon0, ll.lon)));
                const so = Math.max(-90, Math.floor(Math.min(box.lat0, ll.lat))), n = Math.min(90, Math.ceil(Math.max(box.lat0, ll.lat)));
                onArea([w, so, Math.max(ea, w + 1), Math.max(n, so + 1)]);
              } else if (!box && lookup.has(`${p.lon},${p.lat}`)) onPick(p.lat, p.lon);
            }
            left.current = null; setBox(null);
          }}
          onPointerLeave={() => setHover(null)} />
        {box && (
          <div aria-hidden="true" style={{ position: "absolute", left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1),
            width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0), border: "2.5px solid #e8735a",
            background: "rgba(232,115,90,.12)", borderRadius: 4, pointerEvents: "none" }} />
        )}
        <div className="col" style={{ position: "absolute", right: 12, top: 12, gap: 8 }}>
          <button type="button" aria-label="Zoom in" title="Zoom in" style={iconBtn} disabled={view.k >= MAX_ZOOM} onClick={() => zoomAt(1.6)}>+</button>
          <button type="button" aria-label="Zoom out" title="Zoom out" style={iconBtn} disabled={view.k <= 1} onClick={() => zoomAt(1 / 1.6)}>−</button>
          <button type="button" aria-label="Show the whole world" title="Show the whole world" style={{ ...iconBtn, fontSize: 13 }} onClick={() => setView({ k: 1, cx: 0, cy: 0 })}>1:1</button>
        </div>
        <span className="num" style={{ position: "absolute", left: 10, bottom: 8, font: "700 11px var(--body)", background: "var(--surface)", opacity: 0.92,
          padding: "2px 8px", borderRadius: 999 }}>1° grid · zoom {view.k.toFixed(1)}×</span>
        {loading && <div className="small" style={{ position: "absolute", top: 10, left: 12, background: "var(--surface)", padding: "4px 10px", borderRadius: 999 }}>Loading the map…</div>}
        {hover && (
          <div className="small" style={{ position: "absolute", left: Math.min(hover.px + 12, cssW - 200), top: hover.py + 12, background: "var(--surface)", padding: "6px 10px", borderRadius: 12, boxShadow: "0 4px 14px rgba(0,0,0,.18)", pointerEvents: "none", whiteSpace: "nowrap" }}>
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
