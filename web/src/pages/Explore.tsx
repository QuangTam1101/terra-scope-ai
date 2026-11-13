import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TrendGrid, type ValueGrid } from "../api";
import { areaPlace, cellPlace, useStore, WORLD } from "../store";
import { PlacePicker } from "../PlacePicker";
import { Legend, WorldMap, type Layer } from "../WorldMap";
import { TrendChart } from "../TrendChart";
import { ci, pval, signed, Stat, Terra, VerdictBadge } from "../ui";
import { trendGridF, valueGridF } from "../units";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function Explore() {
  const { variables, regions, sel, setSel, variable, runAnalysis, running, run, showError, go, tempUnit, setTempUnit } = useStore();
  const [layer, setLayer] = useState<Layer>("trend");
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [trendGrid, setTrendGrid] = useState<TrendGrid | null>(null);
  const [valueGrid, setValueGrid] = useState<ValueGrid | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const cache = useRef(new Map<string, TrendGrid | ValueGrid>());

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
  const isTemp = units === "°C" || units === "°F";
  const toF = isTemp && tempUnit === "F";
  const shownTrend = useMemo(() => (trendGrid && toF ? trendGridF(trendGrid) : trendGrid), [trendGrid, toF]);
  const shownValues = useMemo(() => (valueGrid && toF ? valueGridF(valueGrid) : valueGrid), [valueGrid, toF]);

  // Load the map layer for the chosen dataset and period (cached per combination).
  useEffect(() => {
    if (!variable?.available) return;
    const start = `${sel.startYear}-01`, end = `${sel.endYear}-12`;
    const key = `${layer}|${variable.id}|${start}|${end}|${layer === "values" ? month ?? "" : ""}`;
    const hit = cache.current.get(key);
    if (hit) { layer === "trend" ? setTrendGrid(hit as TrendGrid) : setValueGrid(hit as ValueGrid); return; }
    let live = true;
    setGridLoading(true);
    const req = layer === "trend" ? api.trendGrid(variable.id, start, end) : api.valueGrid(variable.id, start, end, month);
    req.then((g) => {
      cache.current.set(key, g);
      if (live) layer === "trend" ? setTrendGrid(g as TrendGrid) : setValueGrid(g as ValueGrid);
    }).catch((e) => live && showError(e)).finally(() => live && setGridLoading(false));
    return () => { live = false; };
  }, [layer, variable, sel.startYear, sel.endYear, month, showError]);

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
        <h2 id="setup" style={{ fontSize: 22 }}>Set up your case</h2>
        <div className="col" style={{ gap: 8 }}>
          <span className="label">1 · Environmental variable</span>
          <div className="row" style={{ gap: 6 }}>
            {parameters.map(([id, p]) => (
              <button key={id} type="button" className={`chip ${sel.parameter === id ? "on" : ""}`} disabled={!p.available}
                aria-pressed={sel.parameter === id} onClick={() => pickParameter(id)} title={p.available ? p.description : "Not available yet"}>
                {p.name}
              </button>
            ))}
          </div>
          {variable && <span className="small muted">{variable.description_simple}</span>}
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
        <div className="col" style={{ gap: 8 }}>
          <span className="label">2 · Dataset</span>
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
        <div className="col" style={{ gap: 8 }}>
          <span className="label">3 · Time range</span>
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
        <div className="col" style={{ gap: 8 }}>
          <span className="label">4 · Place</span>
          <PlacePicker />
        </div>
        <button type="button" className="btn" disabled={running || !variable?.available || sel.startYear > sel.endYear} onClick={() => runAnalysis()}>
          {running ? "Testing…" : "Run analysis"}
        </button>
      </section>

      {/* ---------- map ---------- */}
      <section className="card pad col" aria-label="Map">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="seg" role="group" aria-label="Map layer">
            <button type="button" className={layer === "values" ? "on" : ""} aria-pressed={layer === "values"} onClick={() => setLayer("values")}>Values</button>
            <button type="button" className={layer === "trend" ? "on" : ""} aria-pressed={layer === "trend"} onClick={() => setLayer("trend")}>Trend</button>
          </div>
          <span style={{ font: "800 14px var(--body)" }}>{variable?.parameter_name} · {variable?.dataset_name} · {sel.startYear} to {sel.endYear}</span>
          {layer === "values" && (
            <select className="select" aria-label="Month filter" value={month ?? ""} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>Only {m}</option>)}
            </select>
          )}
        </div>
        <WorldMap layer={layer} trend={shownTrend} values={shownValues} loading={gridLoading} units={units}
          selected={sel.place.bbox[2] - sel.place.bbox[0] >= 360 ? null : sel.place.bbox} selectedLabel={sel.place.label}
          onClear={() => runAnalysis({ place: WORLD })}
          onPick={(lon, lat) => { const p = cellPlace(lon, lat); runAnalysis({ place: p }); }}
          onArea={(bbox) => runAnalysis({ place: areaPlace(bbox) })} />
        <Legend layer={layer} trend={shownTrend} values={shownValues} units={units} />
      </section>

      {/* ---------- result ---------- */}
      <section className="card pad col result" aria-live="polite" aria-labelledby="result">
        <h2 id="result" style={{ fontSize: 22 }}>Result</h2>
        {running && (
          <div className="col"><div className="skel" style={{ height: 34, width: 200 }} /><div className="skel" style={{ height: 56 }} />
            <div className="skel" style={{ height: 120 }} /><div className="skel" style={{ height: 220 }} /></div>
        )}
        {!running && !result && (
          <div className="col" style={{ alignItems: "center", textAlign: "center", padding: "20px 0" }}>
            <Terra size={110} label="Terra the detective" />
            <p style={{ font: "700 15px/1.5 var(--body)", margin: 0 }}>Pick a place on the map or from the list, then press Run analysis. I'll check if the change is real or just noise.</p>
          </div>
        )}
        {!running && result && <ResultBody />}
      </section>
      <ChartCard />
      <span className="footer" style={{ gridColumn: "1 / -1" }}>
        Preliminary · not yet validated · NASA data: GPM IMERG, GLDAS Noah, MERRA-2 (1° global grid, 2001 to 2024).{" "}
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
        <span>▒ 95% CI from a linear fit on anomalies</span>
        <span>Thin line: each month{anomaly ? ", minus that month's long-term average" : ""}</span>
        <span>Estimated past trend, not a forecast</span>
      </div>
    </section>
  );
}

function ResultBody() {
  const { run, go } = useStore();
  if (!run) return null;
  const { trend: t, variable: v, place } = run;
  const u = v.display_units;
  const q = t.quality;
  return (
    <div className="col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <VerdictBadge t={t} />
        <span className="small muted" style={{ fontWeight: 700 }}>{place.label} · {v.dataset_name}</span>
      </div>
      {q.sufficient && t.slope_per_decade !== null ? (
        <div><span className="num" style={{ font: "600 46px/1 var(--display)" }}>{signed(t.slope_per_decade)} {u}</span>{" "}
          <span style={{ font: "800 16px var(--body)" }}>per decade</span></div>
      ) : (
        <p className="warn" style={{ margin: 0 }}>Not enough data to test this trend: at least 10 years and 70% of months are needed. Try a longer period.</p>
      )}
      <p style={{ margin: 0, font: "600 15px/1.5 var(--body)" }}>{t.plain_summary}</p>
      <div className="grid2">
        <Stat value={signed(t.slope_per_decade)} label={`Sen's slope per decade (${u})`} title="Theil–Sen slope from the Seasonal Mann–Kendall test" />
        <Stat value={ci(t.slope_ci)} label="95% CI" title="CI from a linear fit on anomalies" />
        <Stat value={pval(t.p_value)} label="Mann–Kendall p" title="Seasonal Mann–Kendall test" />
        <Stat value={pval(t.p_value_autocorr_adjusted)} label="Autocorrelation-adjusted p" title="Hamed–Rao modified Mann–Kendall" />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span style={{ font: "800 13px var(--body)" }}>Data quality</span>
        <div style={{ height: 12, borderRadius: 6, background: "var(--track)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round((q.n_months / (q.n_months + q.missing_months || 1)) * 100)}%`, background: "var(--quality)" }} />
        </div>
        <span className="small muted num">{q.n_months} of {q.n_months + q.missing_months} months · {Math.round(q.coverage_fraction * 100)}% of the area has data</span>
      </div>
      <span className="small muted">The monthly chart is below the map.</span>
      {t.warnings.length > 0 && <div className="col" style={{ gap: 6 }}>{t.warnings.map((w) => <div key={w} className="warn">{w}</div>)}</div>}
      <div className="row">
        <button type="button" className="btn soft" onClick={() => go("detective")}>Ask the Detective</button>
        <button type="button" className="btn soft" onClick={() => go("hunt")}>Compare with another place</button>
      </div>
      <span className="footer">Source: {v.source.product} v{v.source.version}, {v.source.provider}.</span>
    </div>
  );
}
