import { useEffect, useMemo, useRef, useState } from "react";
import type { BBox, GridCell, PolarGrids, TrendGrid, ValueCell, ValueGrid } from "./api";
import { plain, signed } from "./ui";
import { rateOf, rateUnit } from "./units";
import { DOWN, FLAT, NODATA, SEQ, UP, trendScale, type Layer } from "./WorldMap";

// Sea ice is kept on NSIDC's own 25 km polar stereographic grids (no regridding), so it gets its own map: one panel per
// pole, one canvas pixel per grid pixel (CSS scales it up, pixelated). Land comes from the grid's own land/coast mask,
// so coastlines match the data exactly. Colours follow the world map: same trend ramps and value ramp.
const OCEAN = "#cdeaf0", LAND = "#f3e3c3";
const PANELS = [["N", "Arctic"], ["S", "Antarctic"]] as const;
type Hemi = (typeof PANELS)[number][0];
type Cell = GridCell | ValueCell;
type Ev = React.MouseEvent<HTMLCanvasElement>;

const rgb = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const bits = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const inBox = (c: Cell, b: BBox) => c.lon >= b[0] && c.lon <= b[2] && c.lat >= b[1] && c.lat <= b[3];

interface Props {
  layer: Layer; trend: TrendGrid | null; values: ValueGrid | null; loading: boolean;
  loadingInfo?: { title: string; detail: string } | null; units: string;
  selected: BBox | null; selectedLabel?: string; onPick: (lon: number, lat: number) => void; onClear: () => void;
}

export function PolarMap({ layer, trend, values, loading, loadingInfo, units, selected, selectedLabel, onPick, onClear }: Props) {
  const grid = layer === "trend" ? trend : values;
  const polar: PolarGrids | undefined = grid?.polar;
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ px: number; py: number; text: string } | null>(null);
  const scale = useMemo(() => (trend ? trendScale(trend) : 1), [trend]);

  const colour = useMemo(() => (c: Cell): string => {
    if (layer === "trend") {
      const t = c as GridCell, v = t.slope_per_decade;
      if (!t.valid || v === null) return NODATA;
      const ramp = v > 0 ? UP : v < 0 ? DOWN : null;
      if (!ramp) return FLAT;
      return t.significant_fdr ? (Math.abs(v) / scale > 0.5 ? ramp[2] : ramp[1]) : ramp[0];   // light = could be chance
    }
    const v = (c as ValueCell).value, r = values?.value_range;
    if (v === null || !r) return NODATA;
    const t = r.p98 > r.p02 ? (v - r.p02) / (r.p98 - r.p02) : 0.5;
    return SEQ[Math.max(0, Math.min(5, Math.floor(t * 6)))];
  }, [layer, scale, values]);
  const text = (c: Cell): string => {
    if (layer === "trend") {
      const t = c as GridCell;
      return t.valid ? `${signed(rateOf(t.slope_per_decade, units))} ${rateUnit(units)} per decade${t.significant_fdr ? "" : " (not significant)"}` : "No data";
    }
    const v = (c as ValueCell).value;
    return v === null ? "No data" : `Mean ${plain(v, 1)} ${units}`;
  };

  // Pixel lookup by hemisphere, row and column (hover and click).
  const lookup = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of (grid?.cells ?? []) as Cell[]) if (c.hemi) m.set(`${c.hemi}${c.row},${c.col}`, c);
    return m;
  }, [grid]);
  useEffect(() => setHover(null), [grid]);   // a new layer or dataset: the old tooltip text no longer applies

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !(e.target instanceof HTMLInputElement)) onClear(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onClear]);

  const at = (ev: Ev, h: Hemi) => {
    const r = ev.currentTarget.getBoundingClientRect(), g = polar![h];
    const col = Math.floor(((ev.clientX - r.left) / r.width) * g.cols), row = Math.floor(((ev.clientY - r.top) / r.height) * g.rows);
    const w = wrap.current!.getBoundingClientRect();
    return { cell: lookup.get(`${h}${row},${col}`), px: ev.clientX - w.left, py: ev.clientY - w.top };
  };

  return (
    <div className="mapwrap" ref={wrap}>
      <div className="polar-row">
        {polar ? PANELS.map(([h, name]) => (
          <figure key={h} className="polar-panel" style={{ flexGrow: polar[h].cols }}>
            <figcaption>{name}</figcaption>
            <Panel g={polar[h]} hemi={h} cells={(grid?.cells ?? []) as Cell[]} colour={colour} selected={selected}
              label={`${name} map of sea ice ${layer === "trend" ? "trends per decade" : "mean values"}`}
              onMove={(ev) => { const p = at(ev, h); setHover(p.cell ? { px: p.px, py: p.py, text: text(p.cell) } : null); }}
              onLeave={() => setHover(null)}
              onClick={(ev) => { const p = at(ev, h); if (p.cell) onPick(p.cell.lon, p.cell.lat); }} />
          </figure>
        )) : <div className="skel" style={{ height: 360, width: "100%" }} />}
      </div>
      {selected && selectedLabel && selected[2] - selected[0] < 360 && (
        <div className="polar-chip">
          <span>⌖ {selectedLabel}</span>
          <button type="button" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={onClear}>×</button>
        </div>
      )}
      {hover && (
        <div className="num" style={{ position: "absolute", left: hover.px + 12, top: hover.py + 12, background: "var(--surface)", borderRadius: 12,
          padding: "4px 10px", font: "700 12.5px var(--body)", boxShadow: "var(--shadow)", pointerEvents: "none", whiteSpace: "nowrap" }}>
          {hover.text}
        </div>
      )}
      {loading && (
        <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(251,246,236,.55)", borderRadius: 20,
          font: "800 15px var(--body)", textAlign: "center", padding: 20, pointerEvents: "none" }}>
          <span style={{ background: "rgba(255,255,255,.94)", color: "#1d1935", padding: "12px 18px", borderRadius: 14, maxWidth: 560, boxShadow: "0 6px 20px rgba(20,16,40,.25)" }}>{loadingInfo?.title ?? "Loading the map…"}{loadingInfo?.detail && <><br /><span style={{ font: "600 13px var(--body)" }}>{loadingInfo.detail}</span></>}</span>
        </div>
      )}
      <span className="small muted">NSIDC 25 km polar grids, centred on each pole. Click a spot of sea ice to analyse it.</span>
    </div>
  );
}

function Panel({ g, hemi, cells, colour, selected, label, onMove, onLeave, onClick }: {
  g: PolarGrids[Hemi]; hemi: Hemi; cells: Cell[]; colour: (c: Cell) => string; selected: BBox | null; label: string;
  onMove: (ev: Ev) => void; onLeave: () => void; onClick: (ev: Ev) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const img = new ImageData(g.cols, g.rows), d = img.data, land = bits(g.land_b64);
    const L = [...rgb(LAND), 255], O = [...rgb(OCEAN), 255];
    for (let i = 0; i < g.rows * g.cols; i++) d.set((land[i >> 3] >> (7 - (i & 7))) & 1 ? L : O, i * 4);
    const fade = selected && selected[2] - selected[0] < 360;   // a chosen place: pixels outside it are washed out
    const inside: Cell[] = [];
    for (const c of cells) {
      if (c.hemi !== hemi) continue;
      let px = rgb(colour(c));
      if (fade && !inBox(c, selected!)) px = px.map((v) => Math.round(v + (255 - v) * 0.6));
      else if (fade) inside.push(c);
      d.set([...px, 255], (c.row! * g.cols + c.col!) * 4);
    }
    cv.width = g.cols; cv.height = g.rows;
    const ctx = cv.getContext("2d")!;
    ctx.putImageData(img, 0, 0);
    if (inside.length && inside.length <= 40) {   // a clicked spot is only a few pixels: ring it so it can be found
      const x = inside.reduce((a, c) => a + c.col!, 0) / inside.length + 0.5, y = inside.reduce((a, c) => a + c.row!, 0) / inside.length + 0.5;
      ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI); ctx.stroke();
    }
  }, [g, hemi, cells, colour, selected]);
  return <canvas ref={ref} role="img" aria-label={label} style={{ aspectRatio: `${g.cols} / ${g.rows}`, cursor: "pointer" }}
    onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick} />;
}
