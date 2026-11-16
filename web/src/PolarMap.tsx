import { useEffect, useMemo, useRef, useState } from "react";
import type { GridCell, PolarGrids, TrendGrid, ValueCell, ValueGrid } from "./api";
import type { Place } from "./store";
import { plain, signed } from "./ui";
import { rateOf, rateUnit } from "./units";
import { Globe } from "./Globe";
import { cellColour, trendScale, type Layer } from "./WorldMap";
import { placeShape, polarPixel, polarPlace, polarPointPlace, type Hemi } from "./places";

// Sea ice stays on NSIDC's own 25 km polar stereographic grids (no regridding), so it gets its own map: one pole at a
// time, drawn in grid pixels (land from the grid's own mask, so coasts match the data). Same mouse as the world map:
// click a pixel, drag a box (exact pixels, sent to the API as a "polar" region), right-drag to move, wheel to zoom.
const OCEAN = "#cdeaf0", LAND = "#f3e3c3", MAX_ZOOM = 12;
const POLES = [["N", "Arctic"], ["S", "Antarctic"]] as const;
type Cell = GridCell | ValueCell;
interface View { k: number; cx: number; cy: number }   // zoom and the grid point (col, row) at the canvas centre

const rgb = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const bits = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const keyOf = (h: string, r: number, c: number) => `${h}${r},${c}`;
/** Ocean and land of one pole, one pixel per grid pixel, from the grid's own land/coast mask (np.packbits by row). */
export function landImage(rows: number, cols: number, land_b64: string): ImageData {
  const img = new ImageData(cols, rows), d = img.data, landBits = bits(land_b64), L = [...rgb(LAND), 255], O = [...rgb(OCEAN), 255];
  for (let i = 0; i < rows * cols; i++) d.set((landBits[i >> 3] >> (7 - (i & 7))) & 1 ? L : O, i * 4);
  return img;
}
const globeKey = (lon: number, lat: number) => { const h = lat >= 0 ? "N" : "S", [r, c] = polarPixel(lat, lon, h).map(Math.floor); return keyOf(h, r, c); };

/** The pole a place is on: a polar square's own pole, else the side of its box centre beyond 45°, else none (whole world). */
export function poleOf(p: Place): Hemi | undefined {
  if (p.ref.type === "polar") return p.ref.hemi;
  const [w, s, e, n] = p.bbox, lat = (s + n) / 2;
  if (e - w >= 360 && n - s >= 180) return undefined;
  return lat >= 45 ? "N" : lat <= -45 ? "S" : undefined;
}

interface Props {
  layer: Layer; trend: TrendGrid | null; values: ValueGrid | null; loading: boolean;
  loadingInfo?: { title: string; detail: string } | null; units: string;
  place: Place; onPlace: (p: Place) => void; onClear: () => void;
  /** Pole shown (owned by Explore, shared with the time-lapse; Explore flips it to the pole of a chosen place). */
  pole: Hemi; onPole: (h: Hemi) => void;
}

export function PolarMap({ layer, trend, values, loading, loadingInfo, units, place, onPlace, onClear, pole, onPole: setPole }: Props) {
  const grid = layer === "trend" ? trend : values;
  const polar: PolarGrids | undefined = grid?.polar;
  const [mode, setMode] = useState<"map" | "globe">("map");
  const g = polar?.[pole];
  const scale = useMemo(() => (trend ? trendScale(trend) : 1), [trend]);
  const [b0, b1, b2, b3] = place.bbox;
  const chosen = b2 - b0 < 360 || b3 - b1 < 180;
  const ref = place.ref;

  const text = (c: Cell): string => {
    if (layer === "trend") {
      const t = c as GridCell;
      return t.valid ? `${signed(rateOf(t.slope_per_decade, units))} ${rateUnit(units)} per decade${t.significant_fdr ? "" : " (not significant)"}` : "No data";
    }
    const v = (c as ValueCell).value;
    return v === null ? "No data" : `Mean ${plain(v, 1)} ${units}`;
  };
  const cells = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of (grid?.cells ?? []) as Cell[]) if (c.hemi) m.set(keyOf(c.hemi, c.row!, c.col!), c);
    return m;
  }, [grid]);
  const lookup = useMemo(() => new Map([...cells].map(([k, c]) => [k, text(c)])), [cells, layer, units]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The pole at one canvas pixel per grid pixel: data colours, pixels outside a chosen place washed out.
  const { image, sel } = useMemo(() => {
    if (!g) return { image: null, sel: null };
    const inside = (c: Cell) => ref.type === "polar" ? c.hemi === ref.hemi && c.row! >= ref.rows[0] && c.row! <= ref.rows[1] && c.col! >= ref.cols[0] && c.col! <= ref.cols[1]
      : c.lon >= b0 && c.lon <= b2 && c.lat >= b1 && c.lat <= b3;
    const img = landImage(g.rows, g.cols, g.land_b64), d = img.data;
    let sel: [number, number, number, number] | null = null;   // r0, r1, c0, c1 of the chosen pixels on this pole
    if (chosen && ref.type === "polar") sel = ref.hemi === pole ? [ref.rows[0], ref.rows[1], ref.cols[0], ref.cols[1]] : null;
    for (const c of cells.values()) {
      if (c.hemi !== pole) continue;
      let px = rgb(cellColour(layer, c, scale, values?.value_range));
      if (chosen && !inside(c)) px = px.map((v) => Math.round(v + (255 - v) * 0.6));
      else if (chosen && ref.type !== "polar") {
        const r = c.row!, q = c.col!;
        sel = sel ? [Math.min(sel[0], r), Math.max(sel[1], r), Math.min(sel[2], q), Math.max(sel[3], q)] : [r, r, q, q];
      }
      d.set([...px, 255], (c.row! * g.cols + c.col!) * 4);
    }
    const cv = document.createElement("canvas");
    cv.width = g.cols; cv.height = g.rows;
    cv.getContext("2d")!.putImageData(img, 0, 0);
    return { image: cv, sel };
  }, [g, pole, cells, layer, scale, values, chosen, ref, b0, b1, b2, b3]);

  // ---------- view, size and drawing ----------
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 1, cx: 152, cy: 224 });
  useEffect(() => { if (g) setView({ k: 1, cx: g.cols / 2, cy: g.rows / 2 }); }, [pole, !!g]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cv.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(cv.current);
    return () => ro.disconnect();
  }, [mode, !!g]);   // eslint-disable-line react-hooks/exhaustive-deps
  const s = g && size.w ? Math.min(size.w / g.cols, size.h / g.rows) * 0.97 * view.k : 1;   // CSS px per grid pixel
  const clamp = (v: View): View => ({ k: Math.max(1, Math.min(MAX_ZOOM, v.k)), cx: Math.max(0, Math.min(g?.cols ?? 0, v.cx)), cy: Math.max(0, Math.min(g?.rows ?? 0, v.cy)) });
  const toGrid = (clientX: number, clientY: number) => {
    const r = cv.current!.getBoundingClientRect(), px = clientX - r.left, py = clientY - r.top;
    return { px, py, col: (px - size.w / 2) / s + view.cx, row: (py - size.h / 2) / s + view.cy };
  };
  const zoomAt = (f: number, px = size.w / 2, py = size.h / 2) => setView((v) => {
    const k = Math.max(1, Math.min(MAX_ZOOM, v.k * f)), dx = (px - size.w / 2) / s, dy = (py - size.h / 2) / s;   // keep the point under the cursor
    return clamp({ k, cx: v.cx + dx * (1 - v.k / k), cy: v.cy + dy * (1 - v.k / k) });
  });

  useEffect(() => {
    const c = cv.current;
    if (!c || !image || !g || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr; c.height = size.h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e3eef1"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (size.w / 2 - view.cx * s), dpr * (size.h / 2 - view.cy * s));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    ctx.strokeStyle = "rgba(43,37,64,.25)"; ctx.lineWidth = 1 / s; ctx.strokeRect(0, 0, g.cols, g.rows);
    if (sel) {
      const [r0, r1, c0, c1] = sel, w = c1 - c0 + 1, h = r1 - r0 + 1;
      ctx.lineJoin = "round";
      if (ref.type === "polar") {
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6 / s; ctx.strokeRect(c0, r0, w, h);
        ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 2.5 / s; ctx.strokeRect(c0, r0, w, h);
      }
      if (Math.max(w, h) * s < 18) {   // a clicked pixel is tiny on screen: ring it so it can be found
        ctx.beginPath(); ctx.arc(c0 + w / 2, r0 + h / 2, 14 / s, 0, 2 * Math.PI);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5 / s; ctx.stroke();
        ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 2.2 / s; ctx.stroke();
      }
    }
  }, [image, sel, g, size, view, s, ref.type]);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const onWheel = (ev: WheelEvent) => { ev.preventDefault(); const r = c.getBoundingClientRect(); zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, ev.clientX - r.left, ev.clientY - r.top); };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  });

  useEffect(() => {
    if (!chosen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !(e.target instanceof HTMLInputElement)) onClear(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chosen, onClear]);

  // ---------- mouse: left click = a pixel, left drag = a box of pixels, right drag = move ----------
  const [hover, setHover] = useState<{ px: number; py: number; text: string } | null>(null);
  useEffect(() => setHover(null), [grid, pole]);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const left = useRef<{ px: number; py: number; row: number; col: number } | null>(null);
  const pan = useRef<{ px: number; py: number; view: View } | null>(null);
  const inGrid = (row: number, col: number) => !!g && row >= 0 && row < g.rows && col >= 0 && col < g.cols;
  const finish = (row: number, col: number) => {
    const l = left.current!, fit = (a: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(a)));
    const rows: [number, number] = [fit(Math.min(l.row, row), g!.rows), fit(Math.max(l.row, row), g!.rows)];
    const cols: [number, number] = [fit(Math.min(l.col, col), g!.cols), fit(Math.max(l.col, col), g!.cols)];
    onPlace(polarPlace(pole, rows, cols));
  };

  const iconBtn = { width: 44, height: 44, borderRadius: 14, border: 0, background: "var(--surface)", boxShadow: "var(--shadow)",
    font: "800 20px var(--body)", color: "var(--ink)", cursor: "pointer" } as const;
  const name = POLES.find((p) => p[0] === pole)![1];

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="Map style">
          <button type="button" className={mode === "map" ? "on" : ""} aria-pressed={mode === "map"} onClick={() => setMode("map")} style={{ padding: "0 14px" }}>Polar map</button>
          <button type="button" className={mode === "globe" ? "on" : ""} aria-pressed={mode === "globe"} onClick={() => setMode("globe")} style={{ padding: "0 14px" }}>3D globe</button>
        </div>
        <div className="seg" role="group" aria-label="Pole">
          {POLES.map(([h, label]) => (
            <button key={h} type="button" className={pole === h ? "on" : ""} aria-pressed={pole === h} onClick={() => setPole(h)} style={{ padding: "0 14px" }}>{label}</button>
          ))}
        </div>
      </div>
      {mode === "globe" ? (
        <Globe key={pole} layer={layer} trend={trend} values={values} scale={scale} loading={loading} loadingInfo={loadingInfo}
          selected={chosen ? place.bbox : null} shape={placeShape(place)} selectedLabel={place.label} lookup={lookup} cellDeg={0.25}
          keyOf={globeKey} home={[pole === "N" ? -45 : 0, pole === "N" ? 90 : -90]} onClear={onClear}
          onPick={(lon, lat) => { const p = polarPointPlace(lat, lon); if (p && cells.has(globeKey(lon, lat))) onPlace(p); }} />
      ) : (
      <div className="mapwrap">
        {g ? (
          <canvas ref={cv} className="polar-canvas" role="img" aria-label={`${name} map of sea ice ${layer === "trend" ? "trends per decade" : "mean values"}, zoom ${view.k.toFixed(1)} times.`}
            style={{ cursor: panning ? "grabbing" : drag ? "crosshair" : "pointer" }}
            onContextMenu={(ev) => ev.preventDefault()}
            onPointerDown={(ev) => {
              const p = toGrid(ev.clientX, ev.clientY);
              try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* pointer already released */ }
              if (ev.button === 2) { pan.current = { px: ev.clientX, py: ev.clientY, view }; setPanning(true); setHover(null); }
              else if (ev.button === 0) left.current = p;
            }}
            onPointerMove={(ev) => {
              if (pan.current) {
                const st = pan.current;
                setView(clamp({ ...st.view, cx: st.view.cx - (ev.clientX - st.px) / s, cy: st.view.cy - (ev.clientY - st.py) / s }));
                return;
              }
              const p = toGrid(ev.clientX, ev.clientY), l = left.current;
              if (l && (drag || Math.hypot(p.px - l.px, p.py - l.py) > 5)) { setDrag({ x0: l.px, y0: l.py, x1: p.px, y1: p.py }); setHover(null); return; }
              const r = Math.floor(p.row), c = Math.floor(p.col);
              setHover(inGrid(r, c) ? { px: p.px, py: p.py, text: lookup.get(keyOf(pole, r, c)) ?? "No sea ice data here" } : null);
            }}
            onPointerUp={(ev) => {
              const p = toGrid(ev.clientX, ev.clientY), r = Math.floor(p.row), c = Math.floor(p.col);
              if (pan.current) { pan.current = null; setPanning(false); return; }
              if (ev.button === 0 && left.current) {
                if (drag) finish(p.row, p.col);
                else if (cells.has(keyOf(pole, r, c))) onPlace(polarPlace(pole, [r, r], [c, c]));
              }
              left.current = null; setDrag(null);
            }}
            onPointerLeave={() => setHover(null)} />
        ) : <div className="skel polar-canvas" />}
        {drag && (
          <div aria-hidden="true" style={{ position: "absolute", left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1),
            width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0), border: "2.5px solid #e8735a",
            background: "rgba(232,115,90,.12)", borderRadius: 4, pointerEvents: "none" }} />
        )}
        {chosen && !drag && (
          <div className="polar-chip">
            <span>⌖ {place.label}</span>
            <button type="button" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={onClear}>×</button>
          </div>
        )}
        {hover && !drag && (
          <div className="num" style={{ position: "absolute", left: hover.px + 12, top: hover.py + 12, background: "var(--surface)", borderRadius: 12,
            padding: "6px 12px", font: "800 14px var(--body)", boxShadow: "var(--shadow)", pointerEvents: "none", whiteSpace: "nowrap" }}>
            {hover.text}
          </div>
        )}
        <div className="col" style={{ position: "absolute", right: 12, top: 12, gap: 8 }}>
          <button type="button" aria-label="Zoom in" title="Zoom in" style={iconBtn} disabled={view.k >= MAX_ZOOM} onClick={() => zoomAt(1.6)}>+</button>
          <button type="button" aria-label="Zoom out" title="Zoom out" style={iconBtn} disabled={view.k <= 1} onClick={() => zoomAt(1 / 1.6)}>−</button>
          <button type="button" aria-label={`Show the whole ${name}`} title={`Show the whole ${name}`} style={{ ...iconBtn, fontSize: 13 }}
            onClick={() => g && setView({ k: 1, cx: g.cols / 2, cy: g.rows / 2 })}>1:1</button>
        </div>
        {loading && (
          <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(251,246,236,.55)", borderRadius: 20,
            font: "800 15px var(--body)", textAlign: "center", padding: 20, pointerEvents: "none" }}>
            <span>{loadingInfo?.title ?? "Loading the map…"}{loadingInfo?.detail && <><br /><span style={{ font: "600 13px var(--body)" }}>{loadingInfo.detail}</span></>}</span>
          </div>
        )}
        <span className="num" style={{ position: "absolute", left: 10, bottom: 8, font: "700 12.5px var(--body)", background: "var(--surface)", opacity: 0.92,
          padding: "2px 8px", borderRadius: 999 }}>{name} · 25 km pixels · zoom {view.k.toFixed(1)}×</span>
      </div>
      )}
    </div>
  );
}
