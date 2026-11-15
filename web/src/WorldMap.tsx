import { useEffect, useMemo, useRef, useState } from "react";
import { geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import landTopo from "world-atlas/land-110m.json";
import type { BBox, TrendGrid, ValueGrid } from "./api";
import { plain, signed } from "./ui";
import { Globe } from "./Globe";
import { cellKey, gridCell } from "./places";

export type Layer = "values" | "trend";

export const W = 960, H = 480;                                    // logical size, equirectangular 2:1
const MAX_ZOOM = 12;
const SEQ = ["#fff4c2", "#c8ecc0", "#7fd1c2", "#4aa6c4", "#5a6fb8", "#4b3a8c"];
const UP = ["#fbe0c4", "#f2a65a", "#c4621a"], DOWN = ["#cfe1f4", "#7fb2e5", "#2f6fb3"], NODATA = "#a7a3b0";

export const topo = landTopo as unknown as Topology;
export const land = feature(topo, topo.objects.land);
export const projection = geoEquirectangular().fitSize([W, H], { type: "Sphere" });
const x = (lon: number) => ((lon + 180) / 360) * W;
const y = (lat: number) => ((90 - lat) / 180) * H;

function hatch(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const c = document.createElement("canvas");
  c.width = c.height = 6;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,.95)";
  g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, 6); g.lineTo(6, 0); g.stroke();
  return ctx.createPattern(c, "repeat");
}

export function trendScale(grid: TrendGrid): number {
  // Presentation only: robust colour range (95th percentile of |slope|) so a few extreme cells do not wash out the map.
  const a = grid.cells.filter((c) => c.valid && c.slope_per_decade !== null).map((c) => Math.abs(c.slope_per_decade!)).sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length * 0.95)] || a[a.length - 1] : 1;
}


/** Paints ocean, land, data cells, graticule and coastline in equirectangular logical units (W x H). Shared by the 2D map and the 3D globe texture. */
export function paintMap(ctx: CanvasRenderingContext2D, path: ReturnType<typeof geoPath>, layer: Layer, trend: TrendGrid | null,
  values: ValueGrid | null, scale: number, k: number) {
  ctx.fillStyle = "#cdeaf0"; ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); path(land); ctx.fillStyle = "#f3e3c3"; ctx.fill();

  const pat = hatch(ctx);
  const gap = 0.3 / k;
  if (layer === "trend" && trend) {
    const s = trend.cell_size_deg, cw = (s / 360) * W + gap, ch = (s / 180) * H + gap;
    for (const c of trend.cells) {
      const px = x(c.lon - s / 2), py = y(c.lat + s / 2);
      if (!c.valid || c.slope_per_decade === null) { ctx.fillStyle = NODATA; ctx.fillRect(px, py, cw, ch); continue; }
      const v = c.slope_per_decade, ramp = v >= 0 ? UP : DOWN;
      if (c.significant_fdr) {
        ctx.fillStyle = Math.abs(v) / scale > 0.5 ? ramp[2] : ramp[1];
        ctx.fillRect(px, py, cw, ch);
      } else {
        ctx.fillStyle = ramp[0]; ctx.fillRect(px, py, cw, ch);
        if (pat) { ctx.fillStyle = pat; ctx.fillRect(px, py, cw, ch); }
      }
    }
  }
  if (layer === "values" && values) {
    const s = values.cell_size_deg, cw = (s / 360) * W + gap, ch = (s / 180) * H + gap;
    const { p02, p98 } = values.value_range;
    for (const c of values.cells) {
      const px = x(c.lon - s / 2), py = y(c.lat + s / 2);
      if (c.value === null) { ctx.fillStyle = NODATA; ctx.fillRect(px, py, cw, ch); continue; }
      const t = p98 > p02 ? (c.value - p02) / (p98 - p02) : 0.5;
      ctx.fillStyle = SEQ[Math.max(0, Math.min(5, Math.floor(t * 6)))];
      ctx.fillRect(px, py, cw, ch);
    }
  }
  ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = "rgba(43,37,64,.07)"; ctx.lineWidth = 0.6 / k; ctx.stroke();
  ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(90,70,40,.55)"; ctx.lineWidth = 0.8 / k; ctx.stroke();
}

interface View { k: number; ox: number; oy: number }       // zoom factor and top-left corner (logical units)
const clampView = (v: View): View => {
  const k = Math.max(1, Math.min(MAX_ZOOM, v.k));
  return { k, ox: Math.max(0, Math.min(W - W / k, v.ox)), oy: Math.max(0, Math.min(H - H / k, v.oy)) };
};

interface Props {
  layer: Layer; trend: TrendGrid | null; values: ValueGrid | null; loading: boolean;
  /** What is really running while `loading` (Phase 8.5A); falls back to a neutral message. */
  loadingInfo?: { title: string; detail: string } | null;
  selected: BBox | null; selectedLabel?: string; onClear: () => void; onPick: (lon: number, lat: number) => void; onArea: (bbox: BBox) => void; units: string;
}

export function WorldMap({ layer, trend, values, loading, loadingInfo, selected, selectedLabel, onClear, onPick, onArea, units }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [cssW, setCssW] = useState(0);                       // displayed canvas width, to place the selection label
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setCssW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const [view, setView] = useState<View>({ k: 1, ox: 0, oy: 0 });
  const [hover, setHover] = useState<{ px: number; py: number; text: string } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number; lon0: number; lat0: number } | null>(null);
  // Mouse: left click = pick a place, left drag = draw an area, right drag = move the map.
  const pan = useRef<{ px: number; py: number; view: View } | null>(null);
  const left = useRef<{ px: number; py: number; lon: number; lat: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const scale = useMemo(() => (trend ? trendScale(trend) : 1), [trend]);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const cellDeg = (layer === "trend" ? trend?.cell_size_deg : values?.cell_size_deg) ?? gridCell();
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !(e.target instanceof HTMLInputElement)) onClear(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onClear]);

  const lookup = useMemo(() => {
    const m = new Map<string, string>();
    if (layer === "trend" && trend) for (const c of trend.cells)
      m.set(cellKey(c.lon, c.lat, trend.cell_size_deg), c.valid ? `${signed(c.slope_per_decade)} ${units} per decade${c.significant_fdr ? "" : " (not significant)"}` : "No data");
    if (layer === "values" && values) for (const c of values.cells)
      m.set(cellKey(c.lon, c.lat, values.cell_size_deg), c.value === null ? "No data" : `Mean ${plain(c.value, Math.abs(c.value) < 1 ? 3 : 1)} ${units}`);
    return m;
  }, [layer, trend, values, units]);

  // ---------- drawing ----------
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d")!;
    const { k, ox, oy } = view;
    ctx.setTransform(dpr * k, 0, 0, dpr * k, -ox * dpr * k, -oy * dpr * k);
    const path = geoPath(projection, ctx);
    paintMap(ctx, path, layer, trend, values, scale, k);
    if (selected) {
      const [w, s, e, n] = selected;
      const rx = x(w), ry = y(n), rw = x(e) - x(w), rh = y(s) - y(n);
      // 1) dim everything outside the selection so the chosen area stands out
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(rx, ry, rw, rh);
      ctx.fillStyle = "rgba(43,37,64,.32)"; ctx.fill("evenodd");
      // 2) double outline: white halo, then dark ink line
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6 / k; ctx.strokeRect(rx, ry, rw, rh);
      ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 2.5 / k; ctx.strokeRect(rx, ry, rw, rh);
      // 3) corner marks
      const c = Math.min(10 / k, rw / 2, rh / 2);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4 / k; ctx.lineCap = "round";
      ctx.beginPath();
      for (const [cx, cy, dx, dy] of [[rx, ry, 1, 1], [rx + rw, ry, -1, 1], [rx, ry + rh, 1, -1], [rx + rw, ry + rh, -1, -1]]) {
        ctx.moveTo(cx + dx * c, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * c);
      }
      ctx.stroke();
      // 4) a single cell is tiny on screen: add a locator ring around it
      if (rw * k < 18) {
        const cx = rx + rw / 2, cy = ry + rh / 2;
        ctx.beginPath(); ctx.arc(cx, cy, 14 / k, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5 / k; ctx.stroke();
        ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 2.2 / k; ctx.stroke();
      }
    }
  }, [layer, trend, values, selected, scale, view]);

  // ---------- coordinates & zoom ----------
  const toLonLat = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const fx = (clientX - r.left) / r.width, fy = (clientY - r.top) / r.height;
    const lx = view.ox + (fx * W) / view.k, ly = view.oy + (fy * H) / view.k;
    return { lon: (lx / W) * 360 - 180, lat: 90 - (ly / H) * 180, px: clientX - r.left, py: clientY - r.top, fx, fy };
  };
  const zoomAt = (factor: number, fx = 0.5, fy = 0.5) => setView((v) => {
    const k = Math.max(1, Math.min(MAX_ZOOM, v.k * factor));
    const wx = v.ox + (fx * W) / v.k, wy = v.oy + (fy * H) / v.k;
    return clampView({ k, ox: wx - (fx * W) / k, oy: wy - (fy * H) / k });
  });

  // Mouse wheel / trackpad zoom around the cursor (native listener so we can preventDefault page scroll).
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = cv.getBoundingClientRect();
      zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  });

  const finishArea = (lon1: number, lat1: number) => {
    if (!drag) return;
    const w = Math.max(-180, Math.floor(Math.min(drag.lon0, lon1))), e = Math.min(180, Math.ceil(Math.max(drag.lon0, lon1)));
    const s = Math.max(-90, Math.floor(Math.min(drag.lat0, lat1))), n = Math.min(90, Math.ceil(Math.max(drag.lat0, lat1)));
    setDrag(null);
    onArea([w, s, Math.max(e, w + 1), Math.max(n, s + 1)]);
  };

  const iconBtn = { width: 44, height: 44, borderRadius: 14, border: 0, background: "var(--surface)", boxShadow: "var(--shadow)",
    font: "800 20px var(--body)", color: "var(--ink)", cursor: "pointer" } as const;

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="Map style">
          <button type="button" className={mode === "2d" ? "on" : ""} aria-pressed={mode === "2d"} onClick={() => setMode("2d")} style={{ padding: "0 14px" }}>Flat map</button>
          <button type="button" className={mode === "3d" ? "on" : ""} aria-pressed={mode === "3d"} onClick={() => setMode("3d")} style={{ padding: "0 14px" }}>3D globe</button>
        </div>
      </div>
      {mode === "3d" ? (
        <Globe layer={layer} trend={trend} values={values} scale={scale} loading={loading} loadingInfo={loadingInfo} selected={selected}
          selectedLabel={selectedLabel} lookup={lookup} cellDeg={cellDeg} onPick={onPick} onClear={onClear} />
      ) : (
      <div className="mapwrap">
        <canvas ref={ref} role="img"
          style={{ aspectRatio: "2 / 1", cursor: panning ? "grabbing" : drag ? "crosshair" : "pointer", touchAction: "none" }}
          aria-label={`World map of ${layer === "trend" ? "trends per decade" : "mean values"}, zoom ${view.k.toFixed(1)} times.`}
          onContextMenu={(ev) => ev.preventDefault()}
          onPointerDown={(ev) => {
            const p = toLonLat(ev.clientX, ev.clientY);
            try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* pointer already released */ }
            if (ev.button === 2) { pan.current = { px: ev.clientX, py: ev.clientY, view }; setPanning(true); setHover(null); }
            else if (ev.button === 0) left.current = { px: p.px, py: p.py, lon: p.lon, lat: p.lat };
          }}
          onPointerMove={(ev) => {
            if (pan.current) {
              const r = ev.currentTarget.getBoundingClientRect(), st = pan.current;
              const dx = ((ev.clientX - st.px) / r.width) * (W / st.view.k), dy = ((ev.clientY - st.py) / r.height) * (H / st.view.k);
              setView(clampView({ k: st.view.k, ox: st.view.ox - dx, oy: st.view.oy - dy }));
              return;
            }
            const p = toLonLat(ev.clientX, ev.clientY);
            const l = left.current;
            if (l && (drag || Math.hypot(p.px - l.px, p.py - l.py) > 5)) {   // moved more than a few pixels: it is a drag, draw a box
              setDrag({ x0: l.px, y0: l.py, x1: p.px, y1: p.py, lon0: l.lon, lat0: l.lat });
              setHover(null);
              return;
            }
            const text = lookup.get(cellKey(p.lon, p.lat, cellDeg));
            setHover(text ? { px: p.px, py: p.py, text } : null);
          }}
          onPointerUp={(ev) => {
            const p = toLonLat(ev.clientX, ev.clientY);
            if (ev.button === 2 || pan.current) { pan.current = null; setPanning(false); return; }
            if (ev.button === 0 && left.current) {
              if (drag) finishArea(p.lon, p.lat); else onPick(p.lon, p.lat);
            }
            left.current = null;
          }}
          onPointerLeave={() => setHover(null)} />
        {drag && (
          <div aria-hidden="true" style={{ position: "absolute", left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1),
            width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0), border: "2.5px solid #e8735a",
            background: "rgba(232,115,90,.12)", borderRadius: 4, pointerEvents: "none" }} />
        )}
        {selected && selectedLabel && !drag && cssW > 0 && (() => {
          const sx = ((x(selected[0]) - view.ox) * view.k / W) * cssW;
          const sy = ((y(selected[3]) - view.oy) * view.k / H) * (cssW / 2);
          const ex = ((x(selected[2]) - view.ox) * view.k / W) * cssW;
          if (ex < 0 || sx > cssW || sy > cssW / 2) return null;   // selection scrolled out of view
          const left = Math.max(8, Math.min(sx, cssW - 220));
          const top = sy > 40 ? sy - 34 : Math.max(8, sy + 8);
          return (
            <div style={{ position: "absolute", left, top: top - 2, background: "#2b2540", color: "#fff", borderRadius: 999, padding: "3px 4px 3px 12px",
              font: "800 12.5px var(--body)", boxShadow: "0 4px 12px rgba(0,0,0,.25)", pointerEvents: "none", whiteSpace: "nowrap",
              display: "flex", alignItems: "center", maxWidth: 290 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>⌖ {selectedLabel}</span>
              <button type="button" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={onClear}
                style={{ pointerEvents: "auto", marginLeft: 8, width: 22, height: 22, borderRadius: 999, border: 0, cursor: "pointer",
                  background: "rgba(255,255,255,.2)", color: "inherit", font: "800 14px/1 var(--body)", display: "inline-grid", placeItems: "center" }}>×</button>
            </div>
          );
        })()}
        {hover && !drag && (
          <div className="num" style={{ position: "absolute", left: hover.px + 12, top: hover.py + 12, background: "var(--surface)", borderRadius: 12,
            padding: "4px 10px", font: "700 12.5px var(--body)", boxShadow: "var(--shadow)", pointerEvents: "none", whiteSpace: "nowrap" }}>
            {hover.text}
          </div>
        )}
        <div className="col" style={{ position: "absolute", right: 12, top: 12, gap: 8 }}>
          <button type="button" aria-label="Zoom in" title="Zoom in" style={iconBtn} disabled={view.k >= MAX_ZOOM} onClick={() => zoomAt(1.6)}>+</button>
          <button type="button" aria-label="Zoom out" title="Zoom out" style={iconBtn} disabled={view.k <= 1} onClick={() => zoomAt(1 / 1.6)}>−</button>
          <button type="button" aria-label="Show the whole world" title="Show the whole world" style={{ ...iconBtn, fontSize: 13 }} onClick={() => setView({ k: 1, ox: 0, oy: 0 })}>1:1</button>
        </div>
        {loading && (
          <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(251,246,236,.55)", borderRadius: 20,
            font: "800 15px var(--body)", textAlign: "center", padding: 20, pointerEvents: "none" }}>
            <span>{loadingInfo?.title ?? "Loading the map…"}{loadingInfo?.detail && <><br /><span style={{ font: "600 13px var(--body)" }}>{loadingInfo.detail}</span></>}</span>
          </div>
        )}
        <span className="num" style={{ position: "absolute", left: 10, bottom: 8, font: "700 11px var(--body)", background: "var(--surface)", opacity: 0.92,
          padding: "2px 8px", borderRadius: 999 }}>{cellDeg}° grid · zoom {view.k.toFixed(1)}×</span>
      </div>
      )}
    </div>
  );
}

export function Legend({ layer, trend, values, units }: { layer: Layer; trend: TrendGrid | null; values: ValueGrid | null; units: string }) {
  if (layer === "trend") return <TrendLegend trend={trend} units={units} />;
  return (
    <div className="col" style={{ gap: 6 }}>
      <span style={{ font: "800 13px var(--body)" }}>Mean value · {units}</span>
      <div className="legend-ramp">{SEQ.map((c) => <div key={c} style={{ background: c }} />)}</div>
      <div className="row num small muted" style={{ justifyContent: "space-between" }}>
        <span>{values ? plain(values.value_range.p02, 2) : "low"}</span><span>{values ? plain(values.value_range.p98, 2) : "high"}</span>
      </div>
      <span className="small muted">Colours span the 2nd to 98th percentile · grey = no data</span>
    </div>
  );
}

// ---------- trend legend: the same six colour classes the map draws, plus a share bar ----------
const STRIPES = "repeating-linear-gradient(135deg, rgba(255,255,255,.95) 0 1.4px, transparent 1.4px 5px)";
const Chip = ({ bg, striped, size = 22 }: { bg: string; striped?: boolean; size?: number }) => (
  <span aria-hidden style={{ width: size, height: size, borderRadius: 7, flex: "none", display: "inline-block",
    background: striped ? `${STRIPES}, ${bg}` : bg, boxShadow: "inset 0 0 0 1px rgba(43,37,64,.12)" }} />
);

function TrendLegend({ trend, units }: { trend: TrendGrid | null; units: string }) {
  const sc = trend ? trendScale(trend) : null;
  const half = sc !== null ? sc / 2 : null;
  const n = { downFast: 0, downSlow: 0, upSlow: 0, upFast: 0, downNs: 0, upNs: 0, none: 0 };
  for (const c of trend?.cells ?? []) {
    const v = c.slope_per_decade;
    if (!c.valid || v === null) n.none++;
    else if (!c.significant_fdr) v >= 0 ? n.upNs++ : n.downNs++;
    else if (v >= 0) Math.abs(v) / (sc || 1) > 0.5 ? n.upFast++ : n.upSlow++;
    else Math.abs(v) / (sc || 1) > 0.5 ? n.downFast++ : n.downSlow++;
  }
  const withData = n.downFast + n.downSlow + n.upSlow + n.upFast + n.downNs + n.upNs;
  const down = n.downFast + n.downSlow, up = n.upFast + n.upSlow;
  const pct = (k: number) => (withData ? Math.round((100 * k) / withData) : 0);
  const h = half !== null ? plain(half, Math.abs(half) < 0.1 ? 4 : 2) : "";
  const cols = [
    { bg: DOWN[2], name: "Falling fast", range: h && `below −${h}` },
    { bg: DOWN[1], name: "Falling slowly", range: h && `−${h} to 0` },
    { bg: UP[1], name: "Rising slowly", range: h && `0 to +${h}` },
    { bg: UP[2], name: "Rising fast", range: h && `above +${h}` },
  ];
  const seg = [
    { k: n.downFast + n.downSlow, bg: DOWN[1], label: "falling" },
    { k: n.downNs + n.upNs, bg: "#ece7f3", label: "could be chance", striped: true },
    { k: n.upFast + n.upSlow, bg: UP[1], label: "rising" },
  ];

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ font: "800 14px var(--body)" }}>How is it changing?</span>
        <span className="small muted">change per decade, in {units}</span>
      </div>

      {/* reliable trends: 4 classes, blue to orange */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6 }}>
        {cols.map((c) => (
          <div key={c.name} className="col" style={{ gap: 3, alignItems: "center", textAlign: "center" }}>
            <div style={{ width: "100%", height: 18, borderRadius: 8, background: c.bg }} />
            <span style={{ font: "800 12.5px var(--body)" }}>{c.name}</span>
            {c.range && <span className="num small muted" style={{ fontSize: 11.5 }}>{c.range}</span>}
          </div>
        ))}
      </div>

      {/* other two map states */}
      <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
        <span className="row" style={{ gap: 6 }}>
          <Chip bg={DOWN[0]} striped /><Chip bg={UP[0]} striped />
          <span className="small"><b>Striped</b>: could be chance (not significant after FDR)</span>
        </span>
        <span className="row" style={{ gap: 6 }}><Chip bg={NODATA} /><span className="small"><b>Grey</b>: no data</span></span>
      </div>

      {/* share of places */}
      {trend && withData > 0 && (
        <div className="col" style={{ gap: 5 }}>
          <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", boxShadow: "inset 0 0 0 1px rgba(43,37,64,.12)" }}>
            {seg.map((s) => s.k > 0 && (
              <div key={s.label} title={`${s.k.toLocaleString("en")} places ${s.label}`}
                style={{ width: `${(100 * s.k) / withData}%`, background: s.striped ? `${STRIPES}, ${s.bg}` : s.bg }} />
            ))}
          </div>
          <span className="small num">
            Of {withData.toLocaleString("en")} places with data: <b style={{ color: DOWN[2] }}>{pct(down)}% falling</b>,{" "}
            <b style={{ color: UP[2] }}>{pct(up)}% rising</b>, {pct(n.downNs + n.upNs)}% could be chance.
          </span>
        </div>
      )}
    </div>
  );
}
