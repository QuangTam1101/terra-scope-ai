import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type SensitivityResponse, type TrendGrid, type ValueGrid, type Variable } from "../api";
import { areaPlace, cellPlace, useStore, WORLD, type Place, type Selection } from "../store";
import { clampPeriod, PlaceCompare } from "../PlaceCompare";
import { ShareButton } from "../ShareButton";
import { exploreHash, linkPlace, parseExplore, type ExploreState } from "../urlState";
import { CaseStarter } from "../CaseStarter";
import { InfoButton } from "../InfoButton";
import { Term } from "../Term";
import { seriesCsv } from "../report/model";
import { periodEnd, periodMonths, periodStart } from "../period";
import { PlacePicker } from "../PlacePicker";
import { countryPlace, placeShape, polarPlace, type Hemi } from "../places";
import { Legend, WorldMap, type Layer } from "../WorldMap";
import { PolarMap, poleOf } from "../PolarMap";
import { TrendChart } from "../TrendChart";
import { byTheme, ParamIcon, paramShort, Terra } from "../ui";
import { ExplorerResult, ScientistResult } from "../ResultViews";
import { convFor, convTrendGrid, convValueGrid } from "../units";
import { APPEEARS_URL, giovanniUrl } from "../config/giovanni";
import { globalCells, gridMessage, regionalSteps, type GridOp } from "../progress";
import { ExploreFurther } from "../ExploreFurther";
import { Timelapse } from "../Timelapse";
import { oppositeHash } from "../opposite";

// Maps already loaded, kept for the whole visit (leaving and reopening Explore does not download them again).
const GRID_CACHE = new Map<string, TrendGrid | ValueGrid>();

/** "2001-01" → "Jan 2001" for labels. */
const periodLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(0, 4)}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Selection fields for a "YYYY-MM" to "YYYY-MM" period. */
const periodSel = (start: string, end: string): Partial<Selection> =>
  ({ startYear: +start.slice(0, 4), startMonth: +start.slice(5, 7), endYear: +end.slice(0, 4), endMonth: +end.slice(5, 7) });
/** The period clamped to a variable's record (GPCC, SMAP and MODIS-Aqua chlorophyll are shorter); the whole record when they do not overlap. */
const fitPeriod = (v: Variable, start: string, end: string): Partial<Selection> => {
  if (!v.coverage) return {};
  const p = clampPeriod(start, end, v.coverage) ?? { start: v.coverage.start, end: v.coverage.end };
  return periodSel(p.start, p.end);
};

export function Explore() {
  const { variables, sel, setSel, variable, runAnalysis, running, run, failed, showError, go, tempUnit, setTempUnit, progress, cancelAnalysis, audience, regions, ready, page } = useStore();
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
  // Sea ice lives on NSIDC's polar grids: its map is PolarMap (one pole at a time); every other dataset uses the world map.
  const polar = variable?.grid === "polar";
  const [pole, setPole] = useState<Hemi>("N");   // shown pole, shared by the polar map and its time-lapse
  useEffect(() => { const p = poleOf(sel.place); if (p) setPole(p); }, [sel.place]);   // a place on the other pole flips it
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
  const conv = convFor(units, tempUnit, audience);   // map grids come raw from the API
  const shownTrend = useMemo(() => (trendGrid && conv ? convTrendGrid(trendGrid, conv) : trendGrid), [trendGrid, conv]);
  const shownValues = useMemo(() => (valueGrid && conv ? convValueGrid(valueGrid, conv) : valueGrid), [valueGrid, conv]);

  // Load the map layer for the chosen dataset and period (cached per combination). Before fetching, ask the
  // server whether this map is already computed so the message says what is really happening (Phase 8.5A).
  useEffect(() => {
    if (!variable?.available || timelapse) return;
    // An impossible period (end before start) is already explained under the date pickers; asking the server would
    // only add a second, technical error toast ("start must not be after end").
    if (periodMonths(sel) < 1) return;
    const start = periodStart(sel), end = periodEnd(sel);
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
  }, [layer, variable, sel.startYear, sel.endYear, sel.startMonth, sel.endMonth, month, showError, timelapse]);
  const gridInfo = useMemo(() => variable ? gridMessage(gridOp, {
    dataset: `${variable.parameter_name}, ${variable.dataset_name}`, start: periodLabel(periodStart(sel)), end: periodLabel(periodEnd(sel)),
    cells: globalCells(variable.spatial_resolution_deg), month: month ? MONTHS[month - 1] : undefined,
  }) : null, [gridOp, variable, sel.startYear, sel.endYear, sel.startMonth, sel.endMonth, month]);

  /** Change what to analyse. Once a result is showing (or on its way), re-run it for the same place so the result,
   * chart and tables never show the previous variable, dataset or period (a "no data here" answer counts as a result);
   * an impossible period only updates the pickers. */
  const update = (patch: Partial<typeof sel>) =>
    (run || running || failed) && periodMonths({ ...sel, ...patch }) >= 1 ? void runAnalysis(patch) : setSel(patch);
  /** Choosing a variable or a dataset resets the period to that dataset's whole record. */
  const pickVariable = (v: Variable) => update({ parameter: v.parameter, variableId: v.id, ...(v.coverage ? periodSel(v.coverage.start, v.coverage.end) : {}) });
  const pickParameter = (p: string) => {
    const first = variables.find((v) => v.parameter === p && v.available) ?? variables.find((v) => v.parameter === p);
    if (first) pickVariable(first);
  };
  const result = run;
  // A dataset with a shorter record (MODIS-Aqua chlorophyll from 2002-07, GPCC 2001-2020, SMAP 2015-2025) pulls the chosen period inside it.
  useEffect(() => {
    if (!variable?.coverage) return;
    const fit = fitPeriod(variable, periodStart(sel), periodEnd(sel)), s = sel;
    if (fit.startYear !== s.startYear || fit.startMonth !== (s.startMonth ?? 1) || fit.endYear !== s.endYear || fit.endMonth !== (s.endMonth ?? 12)) setSel(fit);
  }, [variable?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** Open one variable at a place, its period clamped to that variable's record. */
  const openVariable = (id: string, place: Place, start: string, end: string) => {
    const v = variables.find((x) => x.id === id);
    if (v) void runAnalysis({ parameter: v.parameter, variableId: v.id, place, ...fitPeriod(v, start, end) });
  };

  // Shareable link (F4): restore variable, place, period and view from "#explore?..." once, then keep the address current.
  const restored = useRef(false);
  const restore = (hash: string) => {
    const st = parseExplore(hash);
    if (!st) return;
    if (st.view === "timelapse") setTimelapse(true); else if (st.view) setLayer(st.view);
    const v = variables.find((x) => x.id === st.variableId && x.available);
    const r = st.place?.kind === "region" ? regions.find((x) => x.id === (st.place as { id: string }).id) : undefined;
    const place: Place | undefined = !st.place ? undefined : st.place.kind === "cell" ? cellPlace(st.place.lon, st.place.lat)
      : st.place.kind === "box" ? areaPlace(st.place.bbox) : st.place.kind === "country" ? countryPlace(st.place.name)
      : st.place.kind === "polar" ? polarPlace(st.place.hemi, st.place.rows, st.place.cols)
      : r && { ref: { type: "preset", id: r.id }, label: r.name, bbox: r.bbox };
    const target = v ?? variable;
    if (!target || (!v && !place)) return;
    const start = st.start ?? periodStart(sel), end = st.end ?? periodEnd(sel);
    void runAnalysis({ parameter: target.parameter, variableId: target.id, ...(place ? { place } : {}), ...fitPeriod(target, start <= end ? start : end, end) });
  };
  const share: ExploreState = { variableId: sel.variableId, place: linkPlace(sel.place.ref), start: periodStart(sel), end: periodEnd(sel), view: timelapse ? "timelapse" : layer };
  const shareHash = exploreHash(share);
  const latest = useRef({ restore, shareHash });
  latest.current = { restore, shareHash };
  useEffect(() => {
    if (restored.current || !ready) return;
    restored.current = true;
    restore(location.hash);
  }, [ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A link pasted while Explore is already open changes only the hash: restore it too (our own replaceState fires no event).
    const onHash = () => { if (restored.current && location.hash.startsWith("#explore?") && location.hash !== latest.current.shareHash) latest.current.restore(location.hash); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (page === "explore" && restored.current && location.hash !== shareHash) history.replaceState(null, "", shareHash);
  }, [page, shareHash]);

  return (
    <div className="explore">
      {/* ---------- set-up: variable → dataset → time range → place ---------- */}
      <section className="card pad col" aria-labelledby="setup">
        <h2 id="setup" style={{ fontSize: 22 }}>{sci ? "Analysis parameters" : "Set up your case"}</h2>
        <div className="col" style={{ gap: 8 }} data-tour="variable">
          <span className="label">{sci ? "1 · Variable" : "1 · What to investigate"}</span>
          <div className="col" style={{ gap: 8 }} role="group" aria-label={sci ? "Variable" : "What would you like to investigate?"}>
            {byTheme(parameters).map(([theme, items]) => (
              <div key={theme} className="col" style={{ gap: 4 }}>
                <span className="param-theme">{theme}</span>
                <div className="param-tiles">
                  {items.map(([id, p]) => (
                    <button key={id} type="button" className={`param-tile ${sel.parameter === id ? "on" : ""}`} disabled={!p.available}
                      aria-pressed={sel.parameter === id} aria-label={p.available ? p.name : `${p.name} (coming soon)`} title={p.description}
                      onClick={() => pickParameter(id)}>
                      <ParamIcon id={id} /><span>{paramShort(id, p.name)}{!p.available && <span className="soon">soon</span>}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {variable && <span className="small muted"><b style={{ color: "var(--ink)" }}>{variable.parameter_name}:</b>{" "}
            {sci ? variable.description_technical : variable.description_simple} <InfoButton id={variable.id} /></span>}
          {(units === "°C" || units === "°F") && (
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
          <span className="label">{sci ? "2 · Product" : "2 · Which dataset"}{variable && <> <InfoButton id={`dataset:${variable.id.split("_")[0]}`} /></>}</span>
          <div className="row" style={{ gap: 6 }}>
            {datasets.map((d) => (
              <button key={d.id} type="button" className={`chip ${sel.variableId === d.id ? "on" : ""}`} disabled={!d.available}
                aria-pressed={sel.variableId === d.id} onClick={() => pickVariable(d)}>
                {d.dataset_name}{!d.available && <span className="soon">soon</span>}
              </button>
            ))}
          </div>
          {datasets.filter((d) => d.available).length > 1 && !["air_haze", "fire", "drought"].includes(sel.parameter) && (   // these list different quantities, not rival datasets
            <span className="warn small">Datasets can disagree{sel.parameter === "air_temperature"
              ? ". For the Sahel, MERRA-2 and GLDAS give opposite temperature trends, so compare both" : ", so compare them"} before you trust one.</span>
          )}
        </div>
        <div className="col" style={{ gap: 8 }} data-tour="years">
          <span className="label">{sci ? "3 · Period (monthly series)" : "3 · Which years"}</span>
          <div className="row period-row">
            <span className="small muted">From</span>
            <select className="select" aria-label="Start month" value={sel.startMonth ?? 1} onChange={(e) => update({ startMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m.slice(0, 3)}</option>)}
            </select>
            <select className="select" aria-label="Start year" value={sel.startYear} onChange={(e) => update({ startYear: Number(e.target.value) })}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="row period-row">
            <span className="small muted">to</span>
            <select className="select" aria-label="End month" value={sel.endMonth ?? 12} onChange={(e) => update({ endMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m.slice(0, 3)}</option>)}
            </select>
            <select className="select" aria-label="End year" value={sel.endYear} onChange={(e) => update({ endYear: Number(e.target.value) })}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {periodMonths(sel) < 1 && <span className="small" style={{ color: "var(--err-ink)" }}>The end is before the start.</span>}
          {periodMonths(sel) >= 1 && periodMonths(sel) < 120 && <span className="small muted">Testing needs at least 10 years.</span>}
        </div>
        <div className="col" style={{ gap: 8 }} data-tour="place">
          <span className="label">{sci ? "4 · Region (latitude-longitude box)" : "4 · Where on Earth?"}</span>
          <PlacePicker />
        </div>
        <button type="button" className="btn" data-tour="run" disabled={running || !variable?.available || periodMonths(sel) < 1} onClick={() => runAnalysis()}>
          {running ? "Testing…" : sci ? "Run analysis" : "Analyze the data"}
        </button>
      </section>

      <details className="card pad starter">
        <summary>Not sure where to start? Answer three questions</summary>
        <CaseStarter />
      </details>

      {/* ---------- map ---------- */}
      <section ref={mapRef} className={`card pad col mapcard${expanded ? " map-expanded" : ""}`} aria-label="Map" data-tour="map">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="seg" role="group" aria-label="Map layer">
            <button type="button" className={!timelapse && layer === "values" ? "on" : ""} aria-pressed={!timelapse && layer === "values"} onClick={() => { setTimelapse(false); setLayer("values"); }}>Values</button>
            <button type="button" className={!timelapse && layer === "trend" ? "on" : ""} aria-pressed={!timelapse && layer === "trend"} onClick={() => { setTimelapse(false); setLayer("trend"); }}>Trend</button>
            <button type="button" className={timelapse ? "on" : ""} aria-pressed={timelapse} onClick={() => setTimelapse(true)}>Time-lapse</button>
          </div>
          <span style={{ font: "800 14px var(--body)" }}>{variable?.parameter_name} · {variable?.dataset_name} · {periodLabel(periodStart(sel))} to {periodLabel(periodEnd(sel))}</span>
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
          <Timelapse variable={variable} start={periodStart(sel)} end={periodEnd(sel)} conv={conv} pole={polar ? pole : undefined} onPole={setPole}
            bbox={sel.place.bbox[2] - sel.place.bbox[0] >= 360 ? null : sel.place.bbox} />
        ) : <>
        {polar ? (
          <PolarMap layer={layer} trend={shownTrend} values={shownValues} loading={gridLoading} loadingInfo={gridInfo} units={units}
            place={sel.place} onClear={() => runAnalysis({ place: WORLD })} onPlace={(place) => runAnalysis({ place })} pole={pole} onPole={setPole} />
        ) : (
        <WorldMap layer={layer} trend={shownTrend} values={shownValues} loading={gridLoading} loadingInfo={gridInfo} units={units}
          selected={sel.place.bbox[2] - sel.place.bbox[0] >= 360 && sel.place.ref.type !== "country" ? null : sel.place.bbox}
          shape={placeShape(sel.place)} selectedLabel={sel.place.label}
          onClear={() => runAnalysis({ place: WORLD })}
          onPick={(lon, lat) => { const p = cellPlace(lon, lat); runAnalysis({ place: p }); }}
          onArea={(bbox) => runAnalysis({ place: areaPlace(bbox) })} />
        )}
        <Legend layer={layer} trend={shownTrend} values={shownValues} units={units} />
        {variable && sci && (
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
        {!running && !result && failed && (
          <div className="col" role="status" style={{ gap: 6 }}>
            <b style={{ font: "700 17px var(--display)" }}>No data for {failed.place.label}</b>
            <p style={{ font: "600 14.5px/1.5 var(--body)", margin: 0 }}>{failed.message}</p>
            <span className="small muted">{failed.variable.parameter_name} · {failed.variable.dataset_name}. Pick another place or another dataset.</span>
          </div>
        )}
        {!running && !result && !failed && (
          <div className="col" style={{ alignItems: "center", textAlign: "center", padding: "20px 0" }}>
            <Terra size={110} label="Terra the detective" />
            <p style={{ font: "700 15px/1.5 var(--body)", margin: 0 }}>Pick a place on the map or from the list, then press Run analysis. I'll check if the change is real or just noise.</p>
          </div>
        )}
        {!running && result && <ResultBody share={share} />}
      </section>
      <ChartCard />
      {!running && (result || failed) && (() => {      // a "no data" place still shows what the other datasets say there
        const place = result?.place ?? failed!.place;
        const start = result?.trend.start ?? periodStart(sel), end = result?.trend.end ?? periodEnd(sel);
        return (
          <section className="card pad col" aria-labelledby="compare-title">
            <h2 id="compare-title" style={{ fontSize: 20 }}>What's changing here?</h2>
            <PlaceCompare place={place} start={start} end={end} variables={variables} onOpen={(id) => openVariable(id, place, start, end)} />
          </section>
        );
      })()}
      <MoreYears />
      {!running && <ExploreFurther />}
      <span className="footer explore-foot">
        <a href="#guide">Numbers checked against an independent recalculation</a> · not peer reviewed · NASA data: GPM IMERG, GLDAS Noah, MERRA-2, MODIS, SMAP, NSIDC sea ice, GRACE, MiCASA, FIRMS; not NASA: GPCC, CRU TS ({polar ? "25 km polar grids" : `${variable?.spatial_resolution_deg ?? 0.5}° global grid`}, {years[0]} to {years[years.length - 1]}).{" "}
        <button type="button" className="btn soft" style={{ minHeight: 32, padding: "0 12px", fontSize: 12.5 }} onClick={() => go("report")}>Open report</button>
      </span>
    </div>
  );
}

function ChartCard() {
  const { run, running, audience } = useStore();
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
        {audience === "scientist" && <span>OLS anomaly slope interval is shown numerically; it is not a Sen confidence band.</span>}
        <span>Thin line: each month{anomaly ? ", minus that month's long-term average" : ""}</span>
        <span>Estimated past trend, not a forecast</span>
      </div>
    </section>
  );
}

// "Would more years help?" (F6): the same test re-run for every start year, from POST /trends/sensitivity.
function MoreYears() {
  const { run, running, audience } = useStore();
  const [res, setRes] = useState<SensitivityResponse | null | "error">(null);
  const settled = audience !== "scientist" && run?.trend.significant === true;   // Explorer: already clear, nothing to add
  useEffect(() => {
    if (!run || settled) return;
    const ctrl = new AbortController();
    setRes(null);
    api.sensitivity(run.variable.id, run.place.ref, run.trend.start, run.trend.end, ctrl.signal)
      .then(setRes, () => { if (!ctrl.signal.aborted) setRes("error"); });
    return () => ctrl.abort();
  }, [run, settled]);
  if (running || !run || settled || res === "error" || run.trend.significant === null) return null;
  if (!res) return <section className="card pad"><div className="skel" style={{ height: 120 }} /></section>;
  const pts = res.points.filter((p) => p.p_value !== null);
  if (pts.length < 2) return null;
  const sci = audience === "scientist", last = res.points[res.points.length - 1];
  // Shorter records that pass while the full one does not: the answer hangs on the start year, and the years estimate
  // (which assumes the full record's rate continues) would contradict the dots, so it is not shown.
  const shorterPass = !last.significant && res.points.some((p) => p.significant);
  const n = shorterPass ? null : res.years_needed.estimate;
  const W = 320, H = 120, L = 34, B = 22;
  const y0 = pts[0].years, y1 = pts[pts.length - 1].years, top = Math.max(0.2, ...pts.map((p) => p.p_value!));
  const x = (yr: number) => L + ((yr - y0) / Math.max(1, y1 - y0)) * (W - L - 8), y = (p: number) => 6 + (1 - p / top) * (H - B - 6);
  return (
    <section className="card pad col" aria-labelledby="years-title">
      <h2 id="years-title" style={{ fontSize: 20 }}>Would more years help?</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 420 }} role="img"
        aria-label={`p-value for records from ${y0} to ${y1} years long, ending ${last.end}`}>
        <line x1={L} x2={W - 8} y1={y(0.05)} y2={y(0.05)} stroke="var(--coral)" strokeDasharray="4 3" />
        <text x={sci ? W - 8 : L + 2} y={y(0.05) - 4} textAnchor={sci ? "end" : "start"} fontSize="10" fill="var(--coral)">{sci ? res.alpha : "below this line: clear"}</text>
        <polyline fill="none" stroke="var(--ink)" strokeWidth="2" points={pts.map((p) => `${x(p.years)},${y(p.p_value!)}`).join(" ")} />
        {pts.map((p) => <circle key={p.start} cx={x(p.years)} cy={y(p.p_value!)} r="2.5" fill={p.significant ? "var(--coral)" : "var(--ink)"} />)}
        {sci && <text x={L - 4} y={y(0) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">0</text>}
        {sci && <text x={L - 4} y={y(top) + 8} textAnchor="end" fontSize="10" fill="var(--muted)">{top.toFixed(2)}</text>}
        <text x={L} y={H - 4} fontSize="10" fill="var(--muted)">{y0} years</text>
        <text x={W - 8} y={H - 4} textAnchor="end" fontSize="10" fill="var(--muted)">{y1} years of data, ending {last.end.slice(0, 4)}</text>
      </svg>
      {sci ? <span className="small">Raw Seasonal Mann-Kendall p by record length (start in January of each year, same end); dashed line α = {res.alpha}.</span>
        : <span className="small">Each dot repeats the test with more years of data. A dot below the dashed line means the change is <Term id="significant">clear, not chance</Term>.</span>}
      <p style={{ margin: 0, fontWeight: 700 }}>
        {last.significant ? `With ${last.years} years of data, the change is already ${sci ? "significant" : "clear"}.`
          : shorterPass ? (sci ? "The answer depends on the start year: some shorter records pass the test, the full record does not. Treat it as a clue, not a verdict."
            : "It depends on the start year. Some shorter stretches pass the test, but the full record does not. Treat it as a clue.")
          : n !== null ? `${sci ? "Not significant" : "Not clear"} yet. If the change keeps its pace, about ${n} more year${n === 1 ? "" : "s"} of data might settle it.`
          : "We cannot say how many more years would help here."}
      </p>
      {!last.significant && !shorterPass && (sci
        ? <span className="small muted">{n !== null ? `${res.years_needed.caveat} ` : ""}{res.years_needed.basis}</span>
        : n !== null && <span className="small muted">A rough guess: it assumes the change and the usual ups and downs stay the same.</span>)}
    </section>
  );
}

function ResultBody({ share }: { share: ExploreState }) {
  const { run, go, audience } = useStore();
  if (!run) return null;
  const { trend: t, variable: v, place } = run;
  const actions = (
    <>
      <div className="row">
        <button type="button" className="btn soft" onClick={() => go("detective")}>Ask the Detective</button>
        <button type="button" className="btn soft" onClick={() => go("hunt")}>Compare with another place</button>
        {/* Same variable and period: Hunt scans the world map for one place rising and one falling. */}
        <button type="button" className="btn soft" onClick={() => { location.hash = oppositeHash({ variableId: v.id, start: t.start, end: t.end }); }}>Where does it go the other way?</button>
      </div>
      <NasaCheck variableId={v.id} provider={v.source.provider} bbox={place.bbox} start={t.start} end={t.end} coverage={v.coverage} />
      {/* secondary tools as quiet links, so the three next steps above stay the obvious choice */}
      <div className="result-tools">
        <ShareButton state={share} />
        <button type="button" className="linkbtn" title="The monthly numbers behind the chart, with the test result, as a spreadsheet file" onClick={() => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([seriesCsv(run, new Date())], { type: "text/csv" }));
          a.download = `terra-scope-${v.id}-${t.start}-${t.end}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }}>{audience === "scientist" ? "Download data (CSV)" : "Download the numbers"}</button>
        <span className="footer">Source: {v.source.product} v{v.source.version}, {v.source.provider}.</span>
      </div>
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
    <details className="disclose">
      <summary>Check it yourself in NASA Giovanni</summary>
    <div className="nasacheck">
      <span>Opens the same data, area and months ({s0} to {shownEnd}) as an area-averaged time series. <b>Press Login (top right in Giovanni) first:</b> without a free Earthdata login Giovanni only plots 4 months. Then press Plot Data. Giovanni uses NASA's original units (for example kelvin instead of °C), so the numbers look different but the pattern should match.</span>
      <a className="btn soft" href={url} target="_blank" rel="noreferrer">Open in Giovanni ↗</a>
    </div>
    </details>
  );
  if (provider.includes("AppEEARS")) return (
    <details className="disclose">
      <summary>Get the same data from NASA AppEEARS</summary>
    <div className="nasacheck">
      <span>These MODIS values were extracted with AppEEARS; you can request the same product for any area there.</span>
      <a className="btn soft" href={APPEEARS_URL} target="_blank" rel="noreferrer">Open AppEEARS ↗</a>
    </div>
    </details>
  );
  return null;
}
