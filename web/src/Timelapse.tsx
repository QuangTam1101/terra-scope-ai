// Phase 9: 2D time-lapse of the NASA monthly grids. Plays month by month through the selected period, as anomalies
// (this month minus the usual value for that calendar month) or as raw monthly values. Display only, no statistics.
import { useEffect, useMemo, useRef, useState } from "react";
import { geoPath } from "d3-geo";
import { api, type BBox, type FramesResponse, type Variable } from "./api";
import { H, W, land, projection } from "./WorldMap";
import { colourOf, decodeFrames, DIVERGING, monthLabel, paintFrame, SEQUENTIAL, valueAt, type Frames } from "./timelapseData";
import { plain } from "./ui";
import { periodText } from "./period";
import type { Conv } from "./units";

type Kind = "anomaly" | "value";
const SPEEDS = [{ fps: 3, label: "Slow" }, { fps: 6, label: "Normal" }, { fps: 12, label: "Fast" }];

export function Timelapse({ variable, start, end, bbox, conv }: { variable: Variable; start: string; end: string; bbox: BBox | null; conv: Conv | null }) {
  const [kind, setKind] = useState<Kind>("anomaly");
  const [res, setRes] = useState<FramesResponse | null>(null);
  const [frames, setFrames] = useState<Frames | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(6);
  const [hover, setHover] = useState<{ px: number; py: number; text: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cellCanvas = useRef<HTMLCanvasElement | null>(null);

  // Load all frames once per dataset, period, area and kind; the animation itself makes no requests.
  useEffect(() => {
    const ctrl = new AbortController();
    setRes(null); setFrames(null); setError(null); setPlaying(false); setT(0); setHover(null);
    if (start > end) { setError("The end of the period is before the start. Change the dates to play the time-lapse."); return; }
    api.valueFrames(variable.id, start, end, kind, bbox, ctrl.signal)
      .then((r) => { setRes(r); setFrames(decodeFrames(r)); })
      .catch((e) => { if (!ctrl.signal.aborted) setError(e?.message ?? "Could not load the time-lapse."); });
    return () => ctrl.abort();
  }, [variable.id, start, end, kind, bbox?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play loop: advances one month per tick, wraps at the end.
  useEffect(() => {
    if (!playing || !frames) return;
    const id = window.setInterval(() => setT((x) => (x + 1) % frames.n), 1000 / fps);
    return () => window.clearInterval(id);
  }, [playing, fps, frames]);

  const convert = useMemo(() => (conv ? (kind === "anomaly" ? (v: number) => v * conv.k : (v: number) => v * conv.k + conv.add) : (v: number) => v), [conv, kind]);
  const range = useMemo<[number, number] | null>(() => res && [convert(res.display_range[0]), convert(res.display_range[1])], [res, convert]);
  const units = conv ? conv.to : variable.display_units;
  const palette = kind === "anomaly" ? DIVERGING : SEQUENTIAL;

  // View: whole world, or the selected box with some margin, in the same equirectangular frame as the main map.
  const view = useMemo(() => {
    if (!bbox) return { k: 1, ox: 0, oy: 0 };
    const [w, s, e, n] = bbox, pad = 0.15;
    const x0 = ((w + 180) / 360) * W, x1 = ((e + 180) / 360) * W, y0 = ((90 - n) / 180) * H, y1 = ((90 - s) / 180) * H;
    const bw = (x1 - x0) * (1 + 2 * pad), bh = (y1 - y0) * (1 + 2 * pad);
    const k = Math.min(W / bw, H / bh, 24);
    return { k, ox: W / 2 - ((x0 + x1) / 2) * k, oy: H / 2 - ((y0 + y1) / 2) * k };
  }, [bbox]);

  // Draw: ocean, land, the frame (one pixel per cell, scaled up without smoothing), coastline.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.ox, dpr * view.oy);
    const path = geoPath(projection, ctx);
    ctx.fillStyle = "#cdeaf0"; ctx.fillRect(-W, -H, 3 * W, 3 * H);
    ctx.beginPath(); path(land); ctx.fillStyle = "#f3e3c3"; ctx.fill();
    if (frames && res && range) {
      let cc = cellCanvas.current;
      if (!cc) { cc = document.createElement("canvas"); cellCanvas.current = cc; }
      cc.width = frames.nlon; cc.height = frames.nlat;
      const g = cc.getContext("2d")!, img = g.createImageData(frames.nlon, frames.nlat);
      paintFrame(frames, t, range[0], range[1], palette, img.data, convert);
      g.putImageData(img, 0, 0);
      const { west, south, cell_deg } = res.grid;
      const x0 = ((west + 180) / 360) * W, y0 = ((90 - (south + frames.nlat * cell_deg)) / 180) * H;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cc, x0, y0, (frames.nlon * cell_deg / 360) * W, (frames.nlat * cell_deg / 180) * H);
    }
    ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(43,37,64,.55)"; ctx.lineWidth = 0.7 / view.k; ctx.stroke();
  }, [frames, res, t, range, palette, convert, view]);

  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!frames || !res) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const lx = (((ev.clientX - r.left) / r.width) * W - view.ox) / view.k, ly = (((ev.clientY - r.top) / r.height) * H - view.oy) / view.k;
    const lon = (lx / W) * 360 - 180, lat = 90 - (ly / H) * 180;
    const col = Math.floor((lon - res.grid.west) / res.grid.cell_deg), row = Math.floor((lat - res.grid.south) / res.grid.cell_deg);
    const v = valueAt(frames, t, row, col);
    const where = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
    const text = v === null ? `${where}: no data` : `${where}: ${kind === "anomaly" && convert(v) > 0 ? "+" : ""}${plain(convert(v), 2)} ${units}${kind === "anomaly" ? " vs usual" : ""}`;
    setHover({ px: ev.clientX - r.left, py: ev.clientY - r.top, text });
  };

  const month = res ? monthLabel(res.times[t]) : "";
  return (
    <div className="col tl" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
        <div className="seg" role="group" aria-label="Time-lapse shows">
          <button type="button" className={kind === "value" ? "on" : ""} aria-pressed={kind === "value"} onClick={() => setKind("value")}>Actual values</button>
          <button type="button" className={kind === "anomaly" ? "on" : ""} aria-pressed={kind === "anomaly"} onClick={() => setKind("anomaly")}>Compared with usual</button>
        </div>
        <span className="tl-month num" aria-live="off">{month}</span>
      </div>
      <div style={{ position: "relative" }}>
        <canvas ref={canvas} className="tl-canvas" role="img" aria-label={`Time-lapse of ${variable.parameter_name.toLowerCase()} by month, ${month}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        {!frames && !error && (
          <div className="tl-overlay" role="status">Preparing the monthly maps for {variable.parameter_name.toLowerCase()} ({variable.dataset_name}), {periodText(start, end)}…</div>
        )}
        {error && <div className="tl-overlay warn" role="alert">{error}</div>}
        {hover && <div className="tl-tip num" style={{ left: hover.px + 12, top: hover.py + 12 }}>{hover.text}</div>}
      </div>
      <div className="row tl-controls">
        <button type="button" className="btn" disabled={!frames} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <input type="range" min={0} max={Math.max(0, (frames?.n ?? 1) - 1)} value={t} disabled={!frames} aria-label="Month"
          aria-valuetext={month} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} style={{ flex: 1, minWidth: 160 }} />
        <select className="select" aria-label="Speed" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
          {SPEEDS.map((s) => <option key={s.fps} value={s.fps}>{s.label}</option>)}
        </select>
      </div>
      {range && (
        <div className="col" style={{ gap: 4 }}>
          <div className="tl-legend" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => { const c = colourOf(range[0] + (i / 8) * (range[1] - range[0]), range[0], range[1], palette); return `rgb(${c.join(",")})`; }).join(",")})` }} />
          <div className="row small num" style={{ justifyContent: "space-between" }}>
            <span>{kind === "anomaly" ? "Below usual" : "Low"} {plain(range[0], 2)} {units}</span>
            {kind === "anomaly" && <span>usual</span>}
            <span>{kind === "anomaly" ? "Above usual +" : "High "}{plain(range[1], 2)} {units}</span>
          </div>
        </div>
      )}
      {res && <span className="small muted">{res.note} Each frame is one month of NASA data; this is a picture of what happened, not a trend test or a forecast.</span>}
    </div>
  );
}
