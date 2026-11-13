import { useMemo, useState } from "react";
import { useStore, WORLD } from "./store";
import { parseCoords, pointPlace, searchPlaces } from "./places";

type Mode = "name" | "coords" | "map";

// Step 4 of the set-up: choose a place by name, by coordinates, or on the map.
export function PlacePicker() {
  const { regions, sel, runAnalysis } = useStore();
  const [mode, setMode] = useState<Mode>("name");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [coordError, setCoordError] = useState<string | null>(null);
  const hits = useMemo(() => searchPlaces(query, regions), [query, regions]);

  const useCoords = () => {
    const p = parseCoords(`${lat} ${lon}`) ?? parseCoords(lat);   // also accept "10.8, 106.7" pasted into the first box
    if (!p) { setCoordError("Enter a latitude from −90 to 90 and a longitude from −180 to 180, for example 10.8 and 106.7."); return; }
    setCoordError(null);
    runAnalysis({ place: pointPlace(p.lat, p.lon) });
  };

  const tab = (m: Mode, label: string) => (
    <button type="button" className={mode === m ? "on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)} style={{ padding: "0 12px" }}>{label}</button>
  );

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="seg" role="group" aria-label="How to choose a place" style={{ alignSelf: "flex-start" }}>
        {tab("name", "Name")}{tab("coords", "Coordinates")}{tab("map", "Map")}
      </div>

      {mode === "name" && (
        <div style={{ position: "relative" }}>
          <label htmlFor="place-q" className="small muted">Search a country, city or area</label>
          <input id="place-q" className="select" style={{ width: "100%", marginTop: 4 }} placeholder="e.g. Vietnam, Hanoi, Sahel"
            value={query} autoComplete="off" role="combobox" aria-expanded={open} aria-controls="place-list"
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { runAnalysis({ place: hits[0].place }); setQuery(""); setOpen(false); } }} />
          {open && hits.length > 0 && (
            <ul id="place-list" role="listbox" className="card" style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 6, zIndex: 20,
              listStyle: "none", padding: 6, maxHeight: 300, overflowY: "auto" }}>
              {hits.map((h) => (
                <li key={`${h.kind}-${h.name}`} role="option" aria-selected={false}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { runAnalysis({ place: h.place }); setQuery(""); setOpen(false); }}
                    style={{ width: "100%", minHeight: 44, border: 0, background: "transparent", borderRadius: 14, padding: "6px 10px", textAlign: "left",
                      cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, font: "700 14px var(--body)", color: "var(--ink)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <span>{h.name}</span><span className="small muted" style={{ whiteSpace: "nowrap" }}>{h.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && query && hits.length === 0 && <span className="small muted">No match. Try coordinates or pick it on the map.</span>}
        </div>
      )}

      {mode === "coords" && (
        <form className="col" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); useCoords(); }}>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <label className="small muted" style={{ flex: 1 }}>Latitude
              <input className="select num" style={{ width: "100%", marginTop: 4 }} inputMode="decimal" placeholder="10.8" value={lat} onChange={(e) => setLat(e.target.value)} />
            </label>
            <label className="small muted" style={{ flex: 1 }}>Longitude
              <input className="select num" style={{ width: "100%", marginTop: 4 }} inputMode="decimal" placeholder="106.7" value={lon} onChange={(e) => setLon(e.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn soft">Use these coordinates</button>
          {coordError && <span className="small" style={{ color: "var(--err-ink)", fontWeight: 700 }}>{coordError}</span>}
        </form>
      )}

      {mode === "map" && (
        <span className="small muted">On the map: <b>left click</b> picks a place, <b>left drag</b> draws an area, <b>right drag</b> moves the map, scroll or + and − zoom.</span>
      )}

      <div className="row" style={{ gap: 8 }}>
        <span className="small muted">Selected:</span>
        <span style={{ font: "800 14px var(--body)", background: "var(--lavender-2)", borderRadius: 999, padding: "6px 12px" }}>{sel.place.label}</span>
        {sel.place.bbox[2] - sel.place.bbox[0] < 360 && (
          <button type="button" className="btn soft" style={{ minHeight: 32, padding: "0 12px", fontSize: 12.5 }}
            onClick={() => runAnalysis({ place: WORLD })}>Clear</button>
        )}
      </div>
    </div>
  );
}
