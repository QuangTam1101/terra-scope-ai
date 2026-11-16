// Free place choice for one side of a comparison: search a preset area, country or city, type a point
// ("10.8, 106.7", the grid cell that contains it) or a box ("west, south, east, north"). Quick picks are shown when
// the field is empty. Only the place reference is chosen here; nothing is computed until the user runs the comparison.
import { useId, useMemo, useState } from "react";
import type { BBox, Region, RegionRef } from "../api";
import { parseCoords, pointPlace, searchPlaces } from "../places";
import { MapPick } from "./MapPick";

export type PlaceOpt = { id: string; name: string; ref: RegionRef };

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v)}°${v >= 0 ? pos : neg}`;
export const boxLabel = (b: BBox) => `Box ${deg(b[1], "N", "S")} to ${deg(b[3], "N", "S")}, ${deg(b[0], "E", "W")} to ${deg(b[2], "E", "W")}`;

/** "west, south, east, north" (four numbers) as a valid box, or null. */
export function parseBox(text: string): BBox | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const [w, s, e, n] = m.slice(1, 5).map(Number);
  return w >= -180 && e <= 180 && s >= -90 && n <= 90 && w < e && s < n ? [w, s, e, n] : null;
}

const idOf = (ref: RegionRef) => (ref.type === "bbox" ? `box-${ref.bbox.join("_")}` : ref.type === "country" ? `country-${ref.id}`
  : ref.type === "polar" ? `polar-${ref.hemi}-${ref.rows.join("_")}-${ref.cols.join("_")}` : ref.id);

export function PlaceField({ label, tag, value, quick, regions, onPick }: {
  label: string; tag?: "A" | "B"; value: PlaceOpt; quick: PlaceOpt[]; regions: Region[]; onPick: (o: PlaceOpt) => void;
}) {
  const uid = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const hits: PlaceOpt[] = useMemo(() => {
    const t = q.trim();
    if (!t) return quick.slice(0, 10);
    const box = parseBox(t);
    if (box) return [{ id: idOf({ type: "bbox", bbox: box }), name: boxLabel(box), ref: { type: "bbox", bbox: box } }];
    const pt = parseCoords(t);
    if (pt) { const p = pointPlace(pt.lat, pt.lon); return [{ id: idOf(p.ref), name: `Point ${p.label} (one grid cell)`, ref: p.ref }]; }
    return searchPlaces(t, regions, 8).map((h) => ({ id: idOf(h.place.ref), name: `${h.name}${h.kind === "Preset area" ? "" : ` (${h.kind.toLowerCase()} box)`}`, ref: h.place.ref }));
  }, [q, quick, regions]);
  const pick = (o: PlaceOpt) => { onPick(o); setQ(""); setOpen(false); setErr(null); };
  const enter = () => {
    if (hits[0] && q.trim()) pick(hits[0]);
    else if (q.trim()) setErr("No match. Try a country or city name, a point such as 10.8, 106.7, or a box as west, south, east, north.");
  };
  return (
    <div className="col place-field" style={{ gap: 4, flex: 1, minWidth: 220, position: "relative" }}>
      <label htmlFor={`${uid}-q`} className="small muted">{label}</label>
      <input id={`${uid}-q`} className="select" autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`${uid}-list`}
        aria-label={`${label}: search a place, a point or a box`} data-place={tag}
        placeholder={value.name} value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setErr(null); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enter(); } if (e.key === "Escape") setOpen(false); }} />
      <div className="row place-row">
        <span className="place-current" aria-live="polite"><b>{tag ? `${tag}: ` : ""}</b>{value.name}</span>
        <button type="button" className="linkbtn" data-map-pick={tag ?? "single"} onClick={() => { setOpen(false); setMapOpen(true); }}>Choose your own coordinates</button>
      </div>
      {mapOpen && <MapPick slot={tag ?? null} initial={value.ref.type === "bbox" ? value.ref.bbox : null} onCancel={() => setMapOpen(false)}
        onConfirm={(b) => { setMapOpen(false); pick({ id: idOf({ type: "bbox", bbox: b }), name: boxLabel(b), ref: { type: "bbox", bbox: b } }); }} />}
      {open && hits.length > 0 && (
        <ul id={`${uid}-list`} role="listbox" className="card place-list">
          {!q.trim() && <li className="small muted place-hint">Type a country, city, a point (10.8, 106.7) or a box (west, south, east, north)</li>}
          {!q.trim() && <li role="option" aria-selected={false}><button type="button" className="place-map-opt" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setOpen(false); setMapOpen(true); }}>Choose your own coordinates on the map</button></li>}
          {hits.map((h) => (
            <li key={h.id + h.name} role="option" aria-selected={h.id === value.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}>{h.name}</button>
            </li>
          ))}
        </ul>
      )}
      {err && <span className="warn small" role="alert">{err}</span>}
    </div>
  );
}
