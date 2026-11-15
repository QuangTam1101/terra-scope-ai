// 3D globe view, drawn like Earth seen from space. The same flat map (paintMap) is painted once into an equirectangular
// texture; every frame each screen pixel inside the disc is projected back onto the sphere and coloured from that texture.
// The canvas fills the whole panel (space background, stars, atmosphere glow), so a zoomed-in globe runs off the panel edges
// instead of being cut into a square. Overlays (coastline, graticule, selection) use d3's orthographic projection.
// Interaction: drag to turn (with a little momentum), wheel or pinch-free buttons to zoom towards the pointer, double-click
// to fly to a place, arrow keys to turn, + and - to zoom, click to pick a grid cell.
import { useEffect, useMemo, useRef, useState } from "react";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { BBox, TrendGrid, ValueGrid } from "./api";
import { H, land, paintMap, projection as flat, W, type Layer } from "./WorldMap";
import { cellKey } from "./places";

const TEX = 2;                     // texture = 2 x logical map (1920 x 960)
const MAX_ZOOM = 10;
const D = Math.PI / 180;
const MAX_PX = 900;                // longest canvas side in device pixels (per-pixel rendering cost)
const wrap = (lon: number) => ((lon + 540) % 360) - 180;
const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat));

interface Props {
  layer: Layer; trend: TrendGrid | null; values: ValueGrid | null; scale: number; loading: boolean; loadingInfo?: { title: string; detail: string } | null;
  selected: BBox | null; selectedLabel?: string; lookup: Map<string, string>; cellDeg: number; shape?: GeoJSON.Feature | null;
  onPick: (lon: number, lat: number) => void; onClear: () => void;
}

type Rot = { lon: number; lat: number; k: number };

// fixed star field in unit coordinates, so it does not jump when the panel resizes
const STARS = Array.from({ length: 140 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1), y: r(2), s: 0.4 + r(3) * 1.1, a: 0.25 + r(4) * 0.6 };
});

export function Globe({ layer, trend, values, scale, loading, loadingInfo, selected, selectedLabel, lookup, cellDeg, onPick, onClear, shape }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const start: [number, number] = selected ? [(selected[0] + selected[2]) / 2, (selected[1] + selected[3]) / 2] : [106, 12];
  const [rot, setRot] = useState<Rot>({ lon: start[0], lat: clampLat(Math.max(-60, Math.min(60, start[1]))), k: 1 });
  const [spin, setSpin] = useState(!selected);
  const [hover, setHover] = useState<{ px: number; py: number; text: string } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });           // CSS pixels of the panel
  const [grabbing, setGrabbing] = useState(false);
  const drag = useRef<{ x: number; y: number; lon: number; lat: number; moved: boolean; t: number; vx: number; vy: number } | null>(null);
  const anim = useRef(0);

  // canvas resolution: CSS size x devicePixelRatio, capped for speed
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const q = Math.min(dpr, MAX_PX / Math.max(size.w, size.h));
  const CW = Math.max(1, Math.round(size.w * q)), CH = Math.max(1, Math.round(size.h * q));
  const R0 = Math.min(CW, CH) / 2 - 18 * q;                       // radius at zoom 1: the whole globe fits with a margin
  const R = R0 * rot.k;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.max(280, Math.round(e.contentRect.width));
      setSize({ w, h: Math.round(Math.min(620, Math.max(320, w * 0.62))) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    const tick = (t: number) => { const dt = t - last; last = t; setRot((r) => ({ ...r, lon: wrap(r.lon + dt * 0.006 / r.k) })); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [spin]);

  const stop = () => { cancelAnimationFrame(anim.current); setSpin(false); };
  // smooth move to a target view (fly-to, zoom buttons)
  const rotRef = useRef(rot);
  rotRef.current = rot;
  const animateTo = (target: Partial<Rot>, ms = 450) => {
    cancelAnimationFrame(anim.current);
    setSpin(false);
    const from = rotRef.current;
    const to = { lon: target.lon ?? from.lon, lat: target.lat ?? from.lat, k: target.k ?? from.k };
    const dLon = wrap(to.lon - from.lon), t0 = performance.now();
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      setRot({ lon: wrap(from.lon + dLon * e), lat: clampLat(from.lat + (to.lat - from.lat) * e), k: Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e) });
      if (u < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  const proj = useMemo(() => geoOrthographic().translate([CW / 2, CH / 2]).scale(R).rotate([-rot.lon, -rot.lat]).clipAngle(90), [CW, CH, R, rot.lon, rot.lat]);

  // ---------- render ----------
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (cv.width !== CW) cv.width = CW;
    if (cv.height !== CH) cv.height = CH;
    const ctx = cv.getContext("2d")!;
    const cx0 = CW / 2, cy0 = CH / 2;

    // space: gradient, stars, then the atmosphere glow around the disc
    const g = ctx.createRadialGradient(cx0, cy0 * 0.9, 0, cx0, cy0, Math.hypot(CW, CH) / 1.6);
    g.addColorStop(0, "#2e2850"); g.addColorStop(1, "#141126");
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    for (const s of STARS) { ctx.globalAlpha = s.a; ctx.fillStyle = "#fff"; ctx.fillRect(s.x * CW, s.y * CH, s.s * q, s.s * q); }
    ctx.globalAlpha = 1;
    const halo = ctx.createRadialGradient(cx0, cy0, R * 0.96, cx0, cy0, R * 1.12);
    halo.addColorStop(0, "rgba(140,196,238,.55)"); halo.addColorStop(1, "rgba(140,196,238,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx0, cy0, R * 1.12, 0, Math.PI * 2); ctx.fill();

    // the sphere, pixel by pixel, only where it is on screen
    const img = ctx.getImageData(0, 0, CW, CH);
    const out = new Uint32Array(img.data.buffer);
    const TW = W * TEX, TH = H * TEX;
    const l0 = rot.lon * D, p0 = rot.lat * D, cl = Math.cos(l0), sl = Math.sin(l0), cp = Math.cos(p0), sp = Math.sin(p0);
    const y0 = Math.max(0, Math.floor(cy0 - R)), y1 = Math.min(CH, Math.ceil(cy0 + R));
    for (let py = y0; py < y1; py++) {
      const Y = -(py + 0.5 - cy0) / R;
      const half = Math.sqrt(Math.max(0, 1 - Y * Y)) * R;
      const x0 = Math.max(0, Math.floor(cx0 - half)), x1 = Math.min(CW, Math.ceil(cx0 + half));
      for (let px = x0; px < x1; px++) {
        const X = (px + 0.5 - cx0) / R, r2 = X * X + Y * Y;
        if (r2 > 1) continue;
        const Z = Math.sqrt(1 - r2);
        const yy = Y * cp + Z * sp, z1 = -Y * sp + Z * cp;
        const xw = X * cl + z1 * sl, zw = -X * sl + z1 * cl;
        const lat = Math.asin(Math.max(-1, Math.min(1, yy))), lon = Math.atan2(xw, zw);
        const tx = Math.min(TW - 1, ((lon / D + 180) / 360) * TW | 0), ty = Math.min(TH - 1, ((90 - lat / D) / 180) * TH | 0);
        const c = tex[ty * TW + tx];
        // soft light from the upper left, a little darker towards the limb so it reads as a ball
        const shade = 0.68 + 0.32 * Math.max(0, Z * 0.85 - X * 0.22 + Y * 0.28);
        const rr = (c & 255) * shade, gg = ((c >> 8) & 255) * shade, bb = ((c >> 16) & 255) * shade;
        out[py * CW + px] = (255 << 24) | (Math.min(255, bb) << 16) | (Math.min(255, gg) << 8) | Math.min(255, rr);
      }
    }
    ctx.putImageData(img, 0, 0);

    const path = geoPath(proj, ctx);
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = "rgba(43,37,64,.10)"; ctx.lineWidth = 0.7 * q; ctx.stroke();
    ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(90,70,40,.6)"; ctx.lineWidth = 0.9 * q; ctx.stroke();
    if (selected) {
      const [w, s, e, n] = selected;
      const ring: [number, number][] = [];
      for (let lo = w; lo <= e; lo += Math.max(0.25, (e - w) / 40)) ring.push([lo, s]);
      for (let la = s; la <= n; la += Math.max(0.25, (n - s) / 40)) ring.push([e, la]);
      for (let lo = e; lo >= w; lo -= Math.max(0.25, (e - w) / 40)) ring.push([lo, n]);
      for (let la = n; la >= s; la -= Math.max(0.25, (n - s) / 40)) ring.push([w, la]);
      ring.push(ring[0]);
      const line = shape ?? { type: "LineString" as const, coordinates: ring };   // country: its border, not the box
      ctx.lineJoin = "round";
      ctx.beginPath(); path(line); ctx.strokeStyle = "#fff"; ctx.lineWidth = 6 * q; ctx.stroke();
      ctx.beginPath(); path(line); ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 2.5 * q; ctx.stroke();
      const c = proj([(w + e) / 2, (s + n) / 2]);
      const visible = c ? Math.hypot(c[0] - cx0, c[1] - cy0) < R : false;
      if (c && visible && (e - w) * R * D < 18 * q) {
        ctx.beginPath(); ctx.arc(c[0], c[1], 14 * q, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 5 * q; ctx.stroke(); ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 2.2 * q; ctx.stroke();
      }
    }
    // thin limb line
    ctx.beginPath(); ctx.arc(cx0, cy0, R, 0, Math.PI * 2); ctx.strokeStyle = "rgba(190,220,245,.45)"; ctx.lineWidth = 1.2 * q; ctx.stroke();
  }, [tex, rot, R, proj, selected, shape, CW, CH, q]);

  // ---------- input ----------
  const toCanvas = (ev: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { cx: ((ev.clientX - r.left) / r.width) * CW, cy: ((ev.clientY - r.top) / r.height) * CH, px: ev.clientX - r.left, py: ev.clientY - r.top };
  };
  const lonLat = (cx: number, cy: number) => (Math.hypot(cx - CW / 2, cy - CH / 2) <= R ? proj.invert!([cx, cy]) : null);

  // zoom towards a canvas point: the place under the pointer moves towards the centre as you zoom in
  const zoomAt = (factor: number, cx?: number, cy?: number, smooth = false) => {
    const ll = cx === undefined || cy === undefined ? null : lonLat(cx, cy);
    const k = Math.max(1, Math.min(MAX_ZOOM, rot.k * factor));
    if (k === rot.k) return;
    let lon = rot.lon, lat = rot.lat;
    if (ll && factor > 1) { const f = 1 - rot.k / k; lon = wrap(rot.lon + wrap(ll[0] - rot.lon) * f); lat = clampLat(rot.lat + (ll[1] - rot.lat) * f); }
    if (smooth) animateTo({ lon, lat, k }, 260);
    else { stop(); setRot({ lon, lat, k }); }
  };

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = cv.getBoundingClientRect();
      zoomAt(ev.deltaY < 0 ? 1.18 : 1 / 1.18, ((ev.clientX - r.left) / r.width) * CW, ((ev.clientY - r.top) / r.height) * CH);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  });

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // momentum after a fling
  const fling = (vx: number, vy: number) => {
    let id = 0, last = performance.now(), ux = vx, uy = vy;
    const step = (t: number) => {
      const dt = Math.min(48, t - last); last = t;
      setRot((r) => ({ ...r, lon: wrap(r.lon - ux * dt), lat: clampLat(r.lat + uy * dt) }));
      const decay = Math.pow(0.93, dt / 16); ux *= decay; uy *= decay;
      if (Math.abs(ux) + Math.abs(uy) > 0.0015) { id = requestAnimationFrame(step); anim.current = id; }
    };
    id = requestAnimationFrame(step); anim.current = id;
  };

  const onKey = (ev: React.KeyboardEvent) => {
    const stepDeg = (ev.shiftKey ? 30 : 10) / rot.k;
    const m: Record<string, () => void> = {
      ArrowLeft: () => animateTo({ lon: wrap(rot.lon - stepDeg) }, 200), ArrowRight: () => animateTo({ lon: wrap(rot.lon + stepDeg) }, 200),
      ArrowUp: () => animateTo({ lat: clampLat(rot.lat + stepDeg) }, 200), ArrowDown: () => animateTo({ lat: clampLat(rot.lat - stepDeg) }, 200),
      "+": () => zoomAt(1.4, undefined, undefined, true), "=": () => zoomAt(1.4, undefined, undefined, true), "-": () => zoomAt(1 / 1.4, undefined, undefined, true),
      "0": () => animateTo({ k: 1 }),
    };
    if (m[ev.key]) { ev.preventDefault(); m[ev.key](); }
  };

  const iconBtn = { width: 44, height: 44, borderRadius: 14, border: 0, background: "var(--surface)", boxShadow: "var(--shadow)",
    font: "800 20px var(--body)", color: "var(--ink)", cursor: "pointer" } as const;
  const labelPos = selected ? proj([(selected[0] + selected[2]) / 2, selected[3]]) : null;
  const labelVisible = !!labelPos && Math.hypot(labelPos[0] - CW / 2, labelPos[1] - CH / 2) < R * 0.98
    && labelPos[0] > 0 && labelPos[0] < CW && labelPos[1] > 0 && labelPos[1] < CH;
  // hide the hover reading while the pointer is right on the selection label, so the two never overlap
  const hoverShown = hover && !(labelVisible && labelPos && Math.abs(hover.px - (labelPos[0] / CW) * size.w) < 120 && Math.abs(hover.py - (labelPos[1] / CH) * size.h) < 46);

  return (
    <div ref={box} className="mapwrap globe-wrap" style={{ position: "relative", borderRadius: 20, overflow: "hidden", height: size.h }}>
      <canvas ref={ref} role="img" tabIndex={0}
        aria-label="3D globe. Drag to turn it, scroll or use + and - to zoom towards a place, double-click to fly there, arrow keys to turn, click to pick a place."
        style={{ width: "100%", height: size.h, display: "block", cursor: grabbing ? "grabbing" : "grab", touchAction: "none", background: "#141126", borderRadius: 20 }}
        onContextMenu={(ev) => ev.preventDefault()}
        onKeyDown={onKey}
        onDoubleClick={(ev) => {
          const p = toCanvas(ev), ll = lonLat(p.cx, p.cy);
          if (ll) animateTo({ lon: ll[0], lat: clampLat(ll[1]), k: Math.min(MAX_ZOOM, Math.max(2.5, rot.k * 1.8)) }, 600);
        }}
        onPointerDown={(ev) => {
          try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
          stop();
          drag.current = { x: ev.clientX, y: ev.clientY, lon: rot.lon, lat: rot.lat, moved: false, t: performance.now(), vx: 0, vy: 0 };
        }}
        onPointerMove={(ev) => {
          const d = drag.current;
          if (d) {
            const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) > 4) { d.moved = true; setGrabbing(true); setHover(null); }
            if (d.moved) {
              // degrees per CSS pixel: one globe radius on screen is about 57 degrees of arc
              const f = (1 / ((R / q) * D));
              const now = performance.now(), dt = Math.max(1, now - d.t);
              const lon = wrap(d.lon - dx * f), lat = clampLat(d.lat + dy * f);
              setRot((r) => { d.vx = wrap(lon - r.lon) / dt; d.vy = (lat - r.lat) / dt; return { ...r, lon, lat }; });
              d.t = now;
            }
            return;
          }
          const p = toCanvas(ev), ll = lonLat(p.cx, p.cy);
          const text = ll ? lookup.get(cellKey(ll[0], ll[1], cellDeg)) : undefined;
          setHover(text ? { px: p.px, py: p.py, text } : null);
        }}
        onPointerUp={(ev) => {
          const d = drag.current; drag.current = null; setGrabbing(false);
          if (!d) return;
          if (!d.moved && ev.button === 0) {
            const p = toCanvas(ev), ll = lonLat(p.cx, p.cy);
            if (ll) onPick(ll[0], ll[1]);
          } else if (d.moved && performance.now() - d.t < 60 && Math.abs(d.vx) + Math.abs(d.vy) > 0.01) {
            fling(-d.vx, d.vy);
          }
        }}
        onPointerLeave={() => setHover(null)} />
      {selected && selectedLabel && labelVisible && labelPos && (
        <div style={{ position: "absolute", left: `${(labelPos[0] / CW) * 100}%`, top: `${(labelPos[1] / CH) * 100}%`, transform: "translate(-50%, calc(-100% - 10px))",
          background: "#fff", color: "#2b2540", borderRadius: 999, padding: "3px 4px 3px 12px", font: "800 12.5px var(--body)",
          boxShadow: "0 4px 12px rgba(0,0,0,.3)", pointerEvents: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
          <span>⌖ {selectedLabel}</span>
          <button type="button" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={onClear}
              style={{ pointerEvents: "auto", marginLeft: 8, width: 22, height: 22, borderRadius: 999, border: 0, cursor: "pointer",
                background: "rgba(43,37,64,.1)", color: "inherit", font: "800 14px/1 var(--body)", display: "inline-grid", placeItems: "center" }}>×</button>
        </div>
      )}
      {hoverShown && hover && (
        <div className="num" style={{ position: "absolute", left: Math.min(hover.px + 14, size.w - 220), top: Math.min(hover.py + 18, size.h - 36), background: "var(--surface)", borderRadius: 12,
          padding: "4px 10px", font: "700 12.5px var(--body)", boxShadow: "var(--shadow)", pointerEvents: "none", whiteSpace: "nowrap" }}>{hover.text}</div>
      )}
      <div className="col" style={{ position: "absolute", right: 12, top: 12, gap: 8 }}>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" style={iconBtn} disabled={rot.k >= MAX_ZOOM} onClick={() => zoomAt(1.5, undefined, undefined, true)}>+</button>
        <button type="button" aria-label="Zoom out" title="Zoom out (-)" style={iconBtn} disabled={rot.k <= 1} onClick={() => zoomAt(1 / 1.5, undefined, undefined, true)}>−</button>
        <button type="button" aria-label="Show the whole globe" title="Show the whole globe (0)" style={{ ...iconBtn, fontSize: 13 }} onClick={() => animateTo({ k: 1 })}>1:1</button>
        <button type="button" aria-label={spin ? "Stop turning" : "Turn slowly"} title={spin ? "Stop turning" : "Turn slowly"} style={{ ...iconBtn, fontSize: 18 }} onClick={() => { cancelAnimationFrame(anim.current); setSpin((v) => !v); }}>{spin ? "❚❚" : "↻"}</button>
      </div>
      <span className="small" style={{ position: "absolute", left: 12, bottom: 10, color: "rgba(255,255,255,.75)", font: "700 12px var(--body)", pointerEvents: "none" }}>
        {rot.k > 1.05 ? `${rot.k.toFixed(1)}× · ` : ""}drag to turn · scroll to zoom · double-click to fly there
      </span>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(27,23,48,.55)", color: "#fff", borderRadius: 20,
          font: "800 15px var(--body)", textAlign: "center", padding: 20, pointerEvents: "none" }} role="status" aria-live="polite">
          <span>{loadingInfo?.title ?? "Loading the globe…"}{loadingInfo?.detail && <><br /><span style={{ font: "600 13px var(--body)" }}>{loadingInfo.detail}</span></>}</span></div>
      )}
    </div>
  );
}
