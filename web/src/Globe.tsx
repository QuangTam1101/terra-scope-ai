// 3D globe view. The same flat map (paintMap) is painted once into an equirectangular texture,
// then every frame each screen pixel is projected back onto the sphere and coloured from that texture.
// Overlays (outline, coastline, selection) are drawn with d3's orthographic projection.
import { useEffect, useMemo, useRef, useState } from "react";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { BBox, TrendGrid, ValueGrid } from "./api";
import { H, land, paintMap, projection as flat, W, type Layer } from "./WorldMap";

const S = 640;                     // internal canvas size (square, CSS scales it)
const TEX = 2;                     // texture = 2 x logical map (1920 x 960)
const MAX_ZOOM = 6;
const D = Math.PI / 180;

interface Props {
  layer: Layer; trend: TrendGrid | null; values: ValueGrid | null; scale: number; loading: boolean;
  selected: BBox | null; selectedLabel?: string; lookup: Map<string, string>;
  onPick: (lon: number, lat: number) => void; onClear: () => void;
}

export function Globe({ layer, trend, values, scale, loading, selected, selectedLabel, lookup, onPick, onClear }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const start: [number, number] = selected ? [(selected[0] + selected[2]) / 2, (selected[1] + selected[3]) / 2] : [106, 12];
  const [rot, setRot] = useState<{ lon: number; lat: number; k: number }>({ lon: start[0], lat: Math.max(-60, Math.min(60, start[1])), k: 1 });
  const [spin, setSpin] = useState(!selected);
  const [hover, setHover] = useState<{ px: number; py: number; text: string } | null>(null);
  const drag = useRef<{ x: number; y: number; lon: number; lat: number; moved: boolean } | null>(null);

  // texture pixels, rebuilt only when the data layer changes
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W * TEX; c.height = H * TEX;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(TEX, 0, 0, TEX, 0, 0);
    paintMap(ctx, geoPath(flat, ctx), layer, trend, values, scale, TEX);
    return new Uint32Array(ctx.getImageData(0, 0, c.width, c.height).data.buffer);
  }, [layer, trend, values, scale]);

  // slow spin until the user touches the globe
  useEffect(() => {
    if (!spin) return;
    let id = 0, last = performance.now();
    const tick = (t: number) => { const dt = t - last; last = t; setRot((r) => ({ ...r, lon: r.lon + dt * 0.006 })); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [spin]);

  const R = (S / 2 - 14) * rot.k;
  const proj = useMemo(() => geoOrthographic().translate([S / 2, S / 2]).scale(R).rotate([-rot.lon, -rot.lat]).clipAngle(90), [R, rot.lon, rot.lat]);

  // ---------- render ----------
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = S; cv.height = S;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(S, S);
    const out = new Uint32Array(img.data.buffer);
    const TW = W * TEX, TH = H * TEX;
    const l0 = rot.lon * D, p0 = rot.lat * D, cl = Math.cos(l0), sl = Math.sin(l0), cp = Math.cos(p0), sp = Math.sin(p0);
    for (let py = 0; py < S; py++) {
      const Y = -(py + 0.5 - S / 2) / R;
      if (Y < -1 || Y > 1) continue;
      for (let px = 0; px < S; px++) {
        const X = (px + 0.5 - S / 2) / R, r2 = X * X + Y * Y;
        if (r2 > 1) continue;
        const Z = Math.sqrt(1 - r2);
        // undo the tilt (about X), then the spin (about Y)
        const y1 = Y * cp + Z * sp, z1 = -Y * sp + Z * cp;
        const xw = X * cl + z1 * sl, zw = -X * sl + z1 * cl;
        const lat = Math.asin(Math.max(-1, Math.min(1, y1))), lon = Math.atan2(xw, zw);
        const tx = Math.min(TW - 1, ((lon / D + 180) / 360) * TW | 0), ty = Math.min(TH - 1, ((90 - lat / D) / 180) * TH | 0);
        const c = tex[ty * TW + tx];
        // soft light from the upper left so it reads as a ball
        const shade = 0.72 + 0.28 * Math.max(0, Z * 0.8 - X * 0.25 + Y * 0.3);
        const rr = (c & 255) * shade, gg = ((c >> 8) & 255) * shade, bb = ((c >> 16) & 255) * shade;
        out[py * S + px] = (255 << 24) | (Math.min(255, bb) << 16) | (Math.min(255, gg) << 8) | Math.min(255, rr);
      }
    }
    ctx.putImageData(img, 0, 0);

    const path = geoPath(proj, ctx);
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = "rgba(43,37,64,.10)"; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(90,70,40,.6)"; ctx.lineWidth = 0.9; ctx.stroke();
    if (selected) {
      const [w, s, e, n] = selected;
      const ring: [number, number][] = [];
      for (let lo = w; lo <= e; lo += Math.max(0.25, (e - w) / 40)) ring.push([lo, s]);
      for (let la = s; la <= n; la += Math.max(0.25, (n - s) / 40)) ring.push([e, la]);
      for (let lo = e; lo >= w; lo -= Math.max(0.25, (e - w) / 40)) ring.push([lo, n]);
      for (let la = n; la >= s; la -= Math.max(0.25, (n - s) / 40)) ring.push([w, la]);
      ring.push(ring[0]);
      const line = { type: "LineString" as const, coordinates: ring };
      ctx.lineJoin = "round";
      ctx.beginPath(); path(line); ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.stroke();
      ctx.beginPath(); path(line); ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 2.5; ctx.stroke();
      const c = proj([(w + e) / 2, (s + n) / 2]);
      const visible = proj.invert && c ? Math.hypot(c[0] - S / 2, c[1] - S / 2) < R : false;
      if (c && visible && (e - w) * R * D < 18) {
        ctx.beginPath(); ctx.arc(c[0], c[1], 14, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 2.2; ctx.stroke();
      }
    }
    // rim
    ctx.beginPath(); ctx.arc(S / 2, S / 2, R, 0, Math.PI * 2); ctx.strokeStyle = "rgba(43,37,64,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
  }, [tex, rot, R, proj, selected]);

  // ---------- input ----------
  const toCanvas = (ev: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { cx: ((ev.clientX - r.left) / r.width) * S, cy: ((ev.clientY - r.top) / r.height) * S, px: ev.clientX - r.left, py: ev.clientY - r.top };
  };
  const lonLat = (cx: number, cy: number) => (Math.hypot(cx - S / 2, cy - S / 2) <= R ? proj.invert!([cx, cy]) : null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const onWheel = (ev: WheelEvent) => { ev.preventDefault(); setSpin(false); setRot((r) => ({ ...r, k: Math.max(1, Math.min(MAX_ZOOM, r.k * (ev.deltaY < 0 ? 1.2 : 1 / 1.2))) })); };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, []);

  const iconBtn = { width: 44, height: 44, borderRadius: 14, border: 0, background: "#fff", boxShadow: "var(--shadow)",
    font: "800 20px var(--body)", color: "var(--ink)", cursor: "pointer" } as const;
  const labelPos = selected ? proj([(selected[0] + selected[2]) / 2, selected[3]]) : null;
  const labelVisible = labelPos && Math.hypot(labelPos[0] - S / 2, labelPos[1] - S / 2) < R * 0.98;

  return (
    <div className="mapwrap" style={{ display: "grid", placeItems: "center", background: "radial-gradient(circle at 50% 45%, #2e2850 0%, #1b1730 70%)", borderRadius: 20 }}>
      <div style={{ position: "relative", width: "min(100%, 560px)" }}>
        <canvas ref={ref} role="img" aria-label="3D globe. Drag to turn it, click to pick a place, scroll to zoom."
          style={{ width: "100%", aspectRatio: "1 / 1", display: "block", cursor: drag.current ? "grabbing" : "grab", touchAction: "none", background: "transparent" }}
          onContextMenu={(ev) => ev.preventDefault()}
          onPointerDown={(ev) => {
            try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
            setSpin(false);
            drag.current = { x: ev.clientX, y: ev.clientY, lon: rot.lon, lat: rot.lat, moved: false };
          }}
          onPointerMove={(ev) => {
            const d = drag.current;
            if (d) {
              const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
              if (Math.hypot(dx, dy) > 4) d.moved = true;
              if (d.moved) {
                const f = 0.35 / rot.k;
                setRot((r) => ({ ...r, lon: d.lon - dx * f, lat: Math.max(-85, Math.min(85, d.lat + dy * f)) }));
                setHover(null);
              }
              return;
            }
            const p = toCanvas(ev), ll = lonLat(p.cx, p.cy);
            const text = ll ? lookup.get(`${Math.floor(ll[0]) + 0.5},${Math.floor(ll[1]) + 0.5}`) : undefined;
            setHover(text ? { px: p.px, py: p.py, text } : null);
          }}
          onPointerUp={(ev) => {
            const d = drag.current; drag.current = null;
            if (d && !d.moved && ev.button === 0) {
              const p = toCanvas(ev), ll = lonLat(p.cx, p.cy);
              if (ll) onPick(ll[0], ll[1]);
            }
          }}
          onPointerLeave={() => setHover(null)} />
        {selected && selectedLabel && labelVisible && labelPos && (
          <div style={{ position: "absolute", left: `${(labelPos[0] / S) * 100}%`, top: `${(labelPos[1] / S) * 100}%`, transform: "translate(-50%, calc(-100% - 10px))",
            background: "#fff", color: "#2b2540", borderRadius: 999, padding: "3px 4px 3px 12px", font: "800 12.5px var(--body)",
            boxShadow: "0 4px 12px rgba(0,0,0,.3)", pointerEvents: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
            <span>⌖ {selectedLabel}</span>
            <button type="button" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={onClear}
                style={{ pointerEvents: "auto", marginLeft: 8, width: 22, height: 22, borderRadius: 999, border: 0, cursor: "pointer",
                  background: "rgba(43,37,64,.1)", color: "inherit", font: "800 14px/1 var(--body)", display: "inline-grid", placeItems: "center" }}>×</button>
          </div>
        )}
        {hover && (
          <div className="num" style={{ position: "absolute", left: hover.px + 12, top: hover.py + 12, background: "#fff", borderRadius: 12,
            padding: "4px 10px", font: "700 12.5px var(--body)", boxShadow: "var(--shadow)", pointerEvents: "none", whiteSpace: "nowrap" }}>{hover.text}</div>
        )}
      </div>
      <div className="col" style={{ position: "absolute", right: 12, top: 12, gap: 8 }}>
        <button type="button" aria-label="Zoom in" title="Zoom in" style={iconBtn} disabled={rot.k >= MAX_ZOOM} onClick={() => { setSpin(false); setRot((r) => ({ ...r, k: Math.min(MAX_ZOOM, r.k * 1.4) })); }}>+</button>
        <button type="button" aria-label="Zoom out" title="Zoom out" style={iconBtn} disabled={rot.k <= 1} onClick={() => setRot((r) => ({ ...r, k: Math.max(1, r.k / 1.4) }))}>−</button>
        <button type="button" aria-label={spin ? "Stop turning" : "Turn slowly"} title={spin ? "Stop turning" : "Turn slowly"} style={{ ...iconBtn, fontSize: 18 }} onClick={() => setSpin((v) => !v)}>{spin ? "❚❚" : "↻"}</button>
      </div>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(27,23,48,.55)", color: "#fff", borderRadius: 20,
          font: "800 15px var(--body)" }}>Loading the globe…</div>
      )}
    </div>
  );
}
