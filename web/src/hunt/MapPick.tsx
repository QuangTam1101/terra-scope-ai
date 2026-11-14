// "Choose your own coordinates": a large world map in a dialog. Drag to draw a box (snapped to whole degrees by the
// shared WorldMap), or click once for the grid cell under the pointer; the four typed fields are the keyboard way to
// do the same. Nothing is computed here: Confirm only fills slot A or B with the chosen box.
import { useEffect, useRef, useState } from "react";
import type { BBox } from "../api";
import { WorldMap } from "../WorldMap";
import { gridCell, pointPlace } from "../places";

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v)}°${v >= 0 ? pos : neg}`;
export const describeBox = (b: BBox) => `${deg(b[1], "N", "S")} to ${deg(b[3], "N", "S")}, ${deg(b[0], "E", "W")} to ${deg(b[2], "E", "W")}`;

/** Checks a typed or drawn box against the app's rules; returns an error message or null. */
export function boxProblem(b: BBox, cell = gridCell()): string | null {
  const [w, s, e, n] = b;
  if (![w, s, e, n].every(Number.isFinite)) return "Enter four numbers.";
  if (w < -180 || e > 180 || s < -90 || n > 90) return "Longitude must be between −180 and 180, latitude between −90 and 90.";
  if (w >= e) return "West must be smaller than east. A box cannot cross the 180° line: choose one side or split it into two comparisons.";
  if (s >= n) return "South must be smaller than north.";
  if (e - w < cell || n - s < cell) return `The box must be at least one grid cell (${cell}°) wide and tall.`;
  return null;
}

export function MapPick({ slot, initial, onConfirm, onCancel }: { slot: "A" | "B" | null; initial: BBox | null; onConfirm: (b: BBox) => void; onCancel: () => void }) {
  const [box, setBox] = useState<BBox | null>(initial);
  const [typed, setTyped] = useState<string[]>(initial ? initial.map(String) : ["", "", "", ""]);
  const dialog = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const set = (b: BBox) => { setBox(b); setTyped(b.map(String)); };
  const typedBox = typed.map((x) => Number(x.replace("−", "-"))) as BBox;
  const typedErr = typed.every((x) => x.trim() !== "") ? boxProblem(typedBox) : null;
  const err = box ? boxProblem(box) : null;

  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      else if (e.key === "Tab" && dialog.current) {
        const f = [...dialog.current.querySelectorAll<HTMLElement>("button, input")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); restore.current?.focus?.(); };
  }, [onCancel]);

  const fields: [string, string][] = [["West (longitude)", "−180 to 180"], ["South (latitude)", "−90 to 90"], ["East (longitude)", "−180 to 180"], ["North (latitude)", "−90 to 90"]];
  return (
    <div className="mappick-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={dialog} className="card pad col mappick" role="dialog" aria-modal="true" aria-labelledby="mappick-h">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="mappick-h" style={{ fontSize: 22 }}>Choose your own coordinates{slot ? ` for place ${slot}` : ""}</h2>
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Drag on the map to draw a box, or click once for the grid cell under the pointer. Scroll or use + and − to zoom, right-drag to move.
          Boxes snap to whole degrees and cannot cross the 180° line. You can also type the edges below.</p>
        <WorldMap layer="values" trend={null} values={null} loading={false} units="" selected={box} selectedLabel={slot ? `Place ${slot}` : "Your box"}
          onClear={() => setBox(null)} onPick={(lon, lat) => set(pointPlace(lat, lon).bbox)} onArea={(b) => set(b)} />
        <div className="mappick-fields" role="group" aria-label="Box edges in degrees">
          {fields.map(([label, hint], i) => (
            <label key={label} className="col small muted" style={{ gap: 4 }}>{label}
              <input className="select num" inputMode="decimal" placeholder={hint} value={typed[i]}
                onChange={(e) => { const t = [...typed]; t[i] = e.target.value; setTyped(t); const nb = t.map((x) => Number(x.replace("−", "-"))) as BBox;
                  if (t.every((x) => x.trim() !== "") && !boxProblem(nb)) setBox(nb); }} />
            </label>
          ))}
        </div>
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <span className="small" role="status" aria-live="polite">{box ? <><b>Selected box:</b> {describeBox(box)} (west {box[0]}, south {box[1]}, east {box[2]}, north {box[3]})</> : "No box selected yet."}</span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn" disabled={!box || !!err} onClick={() => box && onConfirm(box)}>Use this box{slot ? ` for ${slot}` : ""}</button>
          </div>
        </div>
        {(typedErr || err) && <span className="warn small" role="alert">{typedErr ?? err}</span>}
      </div>
    </div>
  );
}
