import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type TrendGrid, type ValueGrid } from "../api";
import { areaPlace, cellPlace, useStore, WORLD } from "../store";
import { PlacePicker } from "../PlacePicker";
import { Legend, WorldMap, type Layer } from "../WorldMap";
import { TrendChart } from "../TrendChart";
import { Terra } from "../ui";
import { ExplorerResult, ScientistResult } from "../ResultViews";
import { trendGridF, valueGridF } from "../units";
import { APPEEARS_URL, giovanniUrl } from "../config/giovanni";
import { globalCells, gridMessage, regionalSteps, type GridOp } from "../progress";
import { ExploreFurther } from "../ExploreFurther";
import { Timelapse } from "../Timelapse";

// Maps already loaded, kept for the whole visit (leaving and reopening Explore does not download them again).
const GRID_CACHE = new Map<string, TrendGrid | ValueGrid>();

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function Explore() {
  const { variables, regions, sel, setSel, variable, runAnalysis, running, run, showError, go, tempUnit, setTempUnit, progress, cancelAnalysis, audience } = useStore();
  const sci = audience === "scientist";
  const [layer, setLayer] = useState<Layer>("trend");
  const [timelapse, setTimelapse] = useState(false);   // 2D time-lapse replaces the static map while on
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [trendGrid, setTrendGrid] = useState<TrendGrid | null>(null);
  const [valueGrid, setValueGrid] = useState<ValueGrid | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridOp, setGridOp] = useState<GridOp>("grid-network");

  const parameters = useMemo(() => {
    const m = new Map<string, { name: string; available: boolean; description: string }>();
    for (const v of variables) {
      const cur = m.get(v.parameter);
      m.set(v.parameter, { name: v.parameter_name, available: (cur?.available ?? false) || v.available, description: cur?.description ?? v.description_simple });
    }
    return [...m.entries()];
  }, [variables]);
  const datasets = variables.filter((v) => v.parameter === sel.parameter);
  const years = useMemo(() => {
    const c = variable?.coverage;
    const a = c ? Number(c.start.slice(0, 4)) : 2001, b = c ? Number(c.end.slice(0, 4)) : 2024;
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }, [variable]);
  const units = variable?.display_units ?? "";
  // Large map mode: the map card fills the workspace (and optionally the screen). Escape leaves it first,
  // before the map's own Escape (clear selection) handler runs.
  const mapRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenOk = typeof document !== "undefined" && !!document.fullscreenEnabled;
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.fullscreenElement) return;
      e.stopPropagation(); setExpanded(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.body.classList.add("no-scroll");
    return () => { window.removeEventListener("keydown", onKey, true); document.body.classList.remove("no-scroll"); };
  }, [expanded]);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mapRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  const isTemp = units === "°C" || units === "°F";
  const toF = isTemp && tempUnit === "F";
  const shownTrend = useMemo(() => (trendGrid && toF ? trendGridF(trendGrid) : trendGrid), [trendGrid, toF]);
  const shownValues = useMemo(() => (valueGrid && toF ? valueGridF(valueGrid) : valueGrid), [valueGrid, toF]);

  // Load the map layer for the chosen dataset and period (cached per combination). Before fetching, ask the
  // server whether this map is already computed so the message says what is really happening (Phase 8.5A).
  useEffect(() => {
    if (!variable?.available || timelapse) return;
    const start = `${sel.startYear}-01`, end = `${sel.endYear}-12`;
    const key = `${layer}|${variable.id}|${start}|${end}|${layer === "values" ? month ?? "" : ""}`;
    const hit = GRID_CACHE.get(key);
    if (hit) { layer === "trend" ? setTrendGrid(hit as TrendGrid) : setValueGrid(hit as ValueGrid); return; }
    let live = true;
    const ctrl = new AbortController();
    setGridLoading(true);
    setGridOp(layer === "trend" ? "grid-network" : "values-load");
    if (layer === "trend") {
      api.gridStatus("trend", variable.id, start, end)
        .then((st) => live && setGridOp(st.cached ? "grid-cache" : "grid-compute"))
        .catch(() => undefined);                       // the status check is optional; keep the neutral message
    }
    const req = layer === "trend" ? api.trendGrid(variable.id, start, end, ctrl.signal) : api.valueGrid(variable.id, start, end, month, ctrl.signal);
    req.then((g) => {
      GRID_CACHE.set(key, g);
      if (live) layer === "trend" ? setTrendGrid(g as TrendGrid) : setValueGrid(g as ValueGrid);
    }).catch((e) => live && showError(e)).finally(() => live && setGridLoading(false));
    // Leaving this combination stops waiting for it (the browser drops the request; a server-side computation
    // that already started still finishes and is cached for next time).
    return () => { live = false; ctrl.abort(); };
  }, [layer, variable, sel.startYear, sel.endYear, month, showError, timelapse]);
  const gridInfo = useMemo(() => variable ? gridMessage(gridOp, {
    dataset: `${variable.parameter_name}, ${variable.dataset_name}`, start: String(sel.startYear), end: String(sel.endYear),
    cells: globalCells(variable.spatial_resolution_deg), month: month ? MONTHS[month - 1] : undefined,
  }) : null, [gridOp, variable, sel.startYear, sel.endYear, month]);

  const pickParameter = (p: string) => {
    const first = variables.find((v) => v.parameter === p && v.available) ?? variables.find((v) => v.parameter === p);
    if (first) setSel({ parameter: p, variableId: first.id });
  };
  const presetValue = sel.place.ref.type === "preset" ? sel.place.ref.id : "";
  const result = run && run.variable.id === sel.variableId ? run : run;

  return (
    <div className="explore">
      {/* ---------- set-up: variable → dataset → time range → place ---------- */}
      <section className="card pad col" aria-labelledby="setup">
        <h2 id="setup" style={{ fontSize: 22 }}>{sci ? "Analysis parameters" : "Set up your case"}</h2>
        <div className="col" style={{ gap: 8 }} data-tour="variable">
          <span className="label">{sci ? "1 · Variable" : "1 · What would you like to investigate?"}</span>
          <div className="row" style={{ gap: 6 }}>
            {parameters.map(([id, p]) => (
              <button key={id} type="button" className={`chip ${sel.parameter === id ? "on" : ""}`} disabled={!p.available}
                aria-pressed={sel.parameter === id} onClick={() => pickParameter(id)} title={p.available ? p.description : "Not available yet"}>
                {p.name}
              </button>
            ))}
          </div>
          {variable && <span className="small muted">{sci ? variable.description_technical : variable.description_simple}</span>}
          {isTemp && (
            <div className="row" style={{ gap: 8 }}>
              <span className="small muted">Show temperature in</span>
              <div className="seg" role="group" aria-label="Temperature unit">
                <button type="button" className={tempUnit === "C" ? "on" : ""} aria-pressed={tempUnit === "C"} onClick={() => setTempUnit("C")} style={{ padding: "0 14px" }}>°C</button>
                <button type="button" className={tempUnit === "F" ? "on" : ""} aria-pressed={tempUnit === "F"} onClick={() => setTempUnit("F")} style={{ padding: "0 14px" }}>°F</button>
              </div>
            </div>
          )}
        </div>
        <div className="col" style={{ gap: 8 }} data-tour="dataset">
          <span className="label">{sci ? "2 · Product" : "2 · Which NASA dataset should we use?"}</span>
          <div className="row" style={{ gap: 6 }}>
            {datasets.map((d) => (
              <button key={d.id} type="button" className={`chip ${sel.variableId === d.id ? "on" : ""}`} disabled={!d.available}
                aria-pressed={sel.variableId === d.id} onClick={() => setSel({ variableId: d.id })}>
                {d.dataset_name}{!d.available && <span className="soon">soon</span>}
              </button>
            ))}
          </div>
          {datasets.filter((d) => d.available).length > 1 && (
            <span className="warn small">Datasets can disagree. For the Sahel, MERRA-2 and GLDAS give opposite temperature trends, so compare both before you trust one.</span>
          )}
        </div>
        <div className="col" style={{ gap: 8 }} data-tour="years">
          <span className="label">{sci ? "3 · Period (monthly series)" : "3 · During which period?"}</span>
          <div className="row">
            <label className="small muted">From{" "}
              <select className="select" value={sel.startYear} onChange={(e) => setSel({ startYear: Number(e.target.value) })}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="small muted">to{" "}
              <select className="select" value={sel.endYear} onChange={(e) => setSel({ endYear: Number(e.target.value) })}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          {sel.endYear - sel.startYear + 1 < 10 && <span className="small muted">Testing needs at least 10 years.</span>}
        </div>
        <div className="col" style={{ gap: 8 }} data-tour="place">
          <span className="label">{sci ? "4 · Region (latitude-longitude box)" : "4 · Where on Earth?"}</span>
          <PlacePicker />
        </div>
        <button type="button" className="btn" data-tour="run" disabled={running || !variable?.available || sel.startYear > sel.endYear} onClick={() => runAnalysis()}>
          {running ? "Testing…" : sci ? "Run analysis" : "Analyze the data"}
        </button>
      </section>

      {/* ---------- map ---------- */}
      <section ref={mapRef} className={`card pad col mapcard${expanded ? " map-expanded" : ""}`} aria-label="Map" data-tour="map">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="seg" role="group" aria-label="Map layer">
            <button type="button" className={!timelapse && layer === "values" ? "on" : ""} aria-pressed={!timelapse && layer === "values"} onClick={() => { setTimelapse(false); setLayer("values"); }}>Values</button>
            <button type="button" className={!timelapse && layer === "trend" ? "on" : ""} aria-pressed={!timelapse && layer === "trend"} onClick={() => { setTimelapse(false); setLayer("trend"); }}>Trend</button>
            <button type="button" className={timelapse ? "on" : ""} aria-pressed={timelapse} onClick={() => setTimelapse(true)}>Time-lapse</button>
          </div>
          <span style={{ font: "800 14px var(--body)" }}>{variable?.parameter_name} · {variable?.dataset_name} · {sel.startYear} to {sel.endYear}</span>
          {!timelapse && layer === "values" && (
            <select className="select" aria-label="Month filter" value={month ?? ""} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>Only {m}</option>)}
            </select>
          )}
          <div className="row" style={{ gap: 6 }}>
            {expanded && fullscreenOk && (
              <button type="button" className="btn soft map-tool" onClick={toggleFullscreen}>{isFullscreen ? "Exit full screen" : "Full screen"}</button>
            )}
            <button type="button" className="btn soft map-tool" aria-pressed={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Exit expanded view" : "Expand map"}
            </button>
          </div>
        </div>
        {timelapse && variable?.available ? (
          <Timelapse variable={variable} start={`${sel.startYear}-01`} end={`${sel.endYear}-12`} toF={toF}
            bbox={sel.place.bbox[2] - sel.place.bbox[0] >= 360 ? null : sel.place.bbox} />
        ) : <>
        <WorldMap layer={layer} trend={shownTrend} values={shownValues} loading={gridLoading} loadingInfo={gridInfo} units={units}
          selected={sel.place.bbox[2] - sel.place.bbox[0] >= 360 ? null : sel.place.bbox} selectedLabel={sel.place.label}
          onClear={() => runAnalysis({ place: WORLD })}
          onPick={(lon, lat) => { const p = cellPlace(lon, lat); runAnalysis({ place: p }); }}
          onArea={(bbox) => runAnalysis({ place: areaPlace(bbox) })} />
        <Legend layer={layer} trend={shownTrend} values={shownValues} units={units} />
        {variable && (
          <span className="small muted">
            Map cells: {variable.spatial_resolution_deg}° processed grid, each cell an area average of the NASA product
            (native resolution {variable.native_resolution_deg}°). Every cell is tested on its own; significance uses
            Benjamini-Hochberg FDR across all cells of this map.
          </span>
        )}
        </>}
      </section>

      {/* ---------- result ---------- */}
      <section className="card pad col result" aria-live="polite" aria-labelledby="result" data-tour="result">
        <h2 id="result" style={{ fontSize: 22 }}>Result</h2>
        {running && progress && (() => {
          const p = regionalSteps(progress);
          return (
            <div className="col progress-box" role="status" aria-live="polite">
              <b>{p.title}</b>
              <ul className="steps-list">
                {p.steps.map((st) => (
                  <li key={st.label} className={`step-${st.state}`}>
                    <span className="step-dot" aria-hidden="true">{st.state === "done" ? "✓" : st.state === "failed" ? "!" : ""}</span>
                    {st.label}<span className="sr-only">: {st.state === "pending" ? "running" : st.state}</span>
                  </li>
                ))}
              </ul>
              <span className="small muted">Only this place is analysed; the world map is loaded separately.</span>
              <button type="button" className="btn soft" style={{ alignSelf: "flex-start" }} onClick={cancelAnalysis}>Cancel</button>
              <div className="skel" style={{ height: 120 }} />
            </div>
          );
        })()}
        {!running && !result && (
          <div className="col" style={{ alignItems: "center", textAlign: "center", padding: "20px 0" }}>
            <Terra size={110} label="Terra the detective" />
            <p style={{ font: "700 15px/1.5 var(--body)", margin: 0 }}>Pick a place on the map or from the list, then press Run analysis. I'll check if the change is real or just noise.</p>
          </div>
        )}
        {!running && result && <ResultBody />}
      </section>
      <ChartCard />
      {!running && <ExploreFurther />}
      <span className="footer" style={{ gridColumn: "1 / -1" }}>
        Preliminary · not yet validated · NASA data: GPM IMERG, GLDAS Noah, MERRA-2 ({variable?.spatial_resolution_deg ?? 0.5}° global grid, {years[0]} to {years[years.length - 1]}).{" "}
        <button type="button" className="btn soft" style={{ minHeight: 32, padding: "0 12px", fontSize: 12.5 }} onClick={() => go("report")}>Open report</button>
      </span>
    </div>
  );
}

function ChartCard() {
  const { run, running } = useStore();
  const [anomaly, setAnomaly] = useState(true);
  if (running) return <section className="card pad chartcard"><div className="skel" style={{ height: 340 }} /></section>;
  if (!run) return null;
  const { trend: t, series, variable: v, place } = run;
  return (
    <section className="card pad col chartcard" aria-labelledby="chart-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="col" style={{ gap: 2 }}>
          <h2 id="chart-title" style={{ fontSize: 20 }}>Monthly {anomaly ? "anomalies (seasons removed)" : "values"}</h2>
          <span className="small muted">{v.parameter_name} · {v.dataset_name} · {place.label}</span>
        </div>
        <div className="seg" role="group" aria-label="Chart mode">
          <button type="button" className={!anomaly ? "on" : ""} aria-pressed={!anomaly} onClick={() => setAnomaly(false)}>Values</button>
          <button type="button" className={anomaly ? "on" : ""} aria-pressed={anomaly} onClick={() => setAnomaly(true)}>Anomaly</button>
        </div>
      </div>
      <TrendChart lines={[{ series, trend: t }]} anomaly={anomaly} units={v.display_units} />
      <div className="row small muted" style={{ gap: 18 }}>
        <span><b style={{ color: t.slope_per_decade !== null && t.slope_per_decade < 0 ? "#2f6fb3" : "#c4621a" }}>━</b> Theil–Sen trend ({t.significant ? "solid: significant" : "dashed: not significant"})</span>
        <span>OLS anomaly slope interval is shown numerically; it is not a Sen confidence band.</span>
        <span>Thin line: each month{anomaly ? ", minus that month's long-term average" : ""}</span>
        <span>Estimated past trend, not a forecast</span>
      </div>
    </section>
  );
}

function ResultBody() {
  const { run, go, audience } = useStore();
  if (!run) return null;
  const { trend: t, variable: v, place } = run;
  const actions = (
    <>
      <div className="row">
        <button type="button" className="btn soft" onClick={() => go("detective")}>Ask the Detective</button>
        <button type="button" className="btn soft" onClick={() => go("hunt")}>Compare with another place</button>
      </div>
      <NasaCheck variableId={v.id} provider={v.source.provider} bbox={place.bbox} start={t.start} end={t.end} coverage={v.coverage} />
      <span className="footer">Source: {v.source.product} v{v.source.version}, {v.source.provider}.</span>
    </>
  );
  return audience === "scientist" ? <ScientistResult run={run} actions={actions} /> : <ExplorerResult run={run} actions={actions} />;
}

// Lets the user repeat this exact analysis in NASA's own tool, to check our numbers independently.
function NasaCheck({ variableId, provider, bbox, start, end, coverage }: { variableId: string; provider: string; bbox: [number, number, number, number]; start: string; end: string; coverage: { start: string; end: string } | null }) {
  // Months outside the data the dataset really has (e.g. IMERG ends 2025-09) would make Giovanni reject the request.
  const s0 = coverage && start < coverage.start ? coverage.start : start;
  const e0 = coverage && end > coverage.end ? coverage.end : end;
  const url = giovanniUrl(variableId, bbox, s0, e0);
  const shownEnd = url?.match(/endtime=(\d{4}-\d{2})/)?.[1] ?? e0;
  if (url) return (
    <div className="nasacheck">
      <span><b>Check it with NASA Giovanni.</b> Opens the same data, area and months ({s0} to {shownEnd}) as an area-averaged time series. <b>Press Login (top right in Giovanni) first:</b> without a free Earthdata login Giovanni only plots 4 months. Then press Plot Data. Giovanni uses NASA's original units (for example kelvin instead of °C), so the numbers look different but the pattern should match.</span>
      <a className="btn soft" href={url} target="_blank" rel="noreferrer">Open in Giovanni ↗</a>
    </div>
  );
  if (provider.includes("AppEEARS")) return (
    <div className="nasacheck">
      <span><b>From NASA AppEEARS.</b> These MODIS values were extracted with AppEEARS; you can request the same product for any area there.</span>
      <a className="btn soft" href={APPEEARS_URL} target="_blank" rel="noreferrer">Open AppEEARS ↗</a>
    </div>
  );
  return null;
}
