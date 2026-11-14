import { useEffect, useMemo, useRef, useState } from "react";
import { api, type BBox, type CompareResponse, type HuntCandidate, type HuntResponse, type RegionRef, type SeriesResponse, type TrendResponse } from "../api";
import { useStore } from "../store";
import { TrendChart } from "../TrendChart";
import { ci, pval, signed, Stat, VerdictBadge } from "../ui";
import { compareF, seriesF, trendF } from "../units";
import { LocatorMap } from "../report/ReportDoc";
import { compatiblePartner, correlation, EXTENTS } from "../explore";

const VERDICT: Record<CompareResponse["verdict"], { text: string; cls: string }> = {
  opposite_significant: { text: "Contradiction confirmed", cls: "sig" },
  opposite_not_significant: { text: "Opposite directions, difference not proven yet", cls: "np" },
  same_direction: { text: "Same direction", cls: "np" },
  insufficient_data: { text: "Not enough data", cls: "ne" },
};
const CLASS: Record<HuntCandidate["classification"], { text: string; cls: string }> = {
  statistical_evidence: { text: "Statistical evidence of disagreement", cls: "sig" },
  inconclusive: { text: "Inconclusive", cls: "np" },
  descriptive: { text: "Descriptive disagreement", cls: "np" },
  unsupported: { text: "Unsupported comparison", cls: "ne" },
};
type Opt = { id: string; name: string; ref: RegionRef };
const lat = (v: number) => `${Math.abs(v)}°${v >= 0 ? "N" : "S"}`;
const lon = (v: number) => `${Math.abs(v)}°${v >= 0 ? "E" : "W"}`;
const boxName = (b: BBox) => `box ${lat(b[1])} to ${lat(b[3])}, ${lon(b[0])} to ${lon(b[2])}`;
const tab = ["compare", "discover", "datasets"] as const;

export function Hunt() {
  const [mode, setMode] = useState<(typeof tab)[number]>("compare");
  const [preset, setPreset] = useState<{ a: Opt; b: Opt; run: number } | null>(null);
  const { audience } = useStore();
  const sci = audience === "scientist";
  return (
    <div className="page">
      <section className="card pad col" data-tour="hunt">
        <h1 style={{ fontSize: 30 }}>{sci ? "Contradiction hunt" : "Where do the results disagree?"}</h1>
        {sci ? (
          <p className="muted" style={{ margin: 0, font: "600 15px/1.5 var(--body)" }}>
            Two regions: the difference series of monthly anomalies (A minus B) is tested with the Hamed-Rao Mann-Kendall test (p-value), its trend is the Sen slope, and a moving-block bootstrap (12-month blocks) gives the 95% interval; a contradiction is confirmed only when the
            trends have opposite signs <b>and</b> the difference has p below 0.05 with a 95% interval that excludes zero. Dataset pairs have no
            approved difference test and are reported as descriptive only.
          </p>
        ) : (
          <p className="muted" style={{ margin: 0, font: "600 16px/1.55 var(--body)" }}>
            The same thing can go up in one place and down in another, and two NASA datasets can tell different stories. Here you can compare them.
            We only say two places really differ when the test is clear about the difference itself; everything else is shown as "not confirmed".
            Comparing does not tell us <b>why</b> they differ.
          </p>
        )}
        <div className="seg" role="tablist" aria-label="Hunt mode">
          {([["compare", "Compare two places"], ["discover", "Discover contradictions"], ["datasets", "Dataset agreement"]] as const).map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{t}</button>
          ))}
        </div>
      </section>
      {mode === "compare" && <ComparePlaces preset={preset} />}
      {mode === "discover" && <Discover onInspect={(a, b) => { setPreset({ a, b, run: Date.now() }); setMode("compare"); }} />}
      {mode === "datasets" && <DatasetAgreement />}
    </div>
  );
}

/* ---------------------------------------------------------------- compare two places */
function ComparePlaces({ preset }: { preset: { a: Opt; b: Opt; run: number } | null }) {
  const { regions, variable, sel, run, showError, tempUnit, huntSelection, addComparison, sendChat, go } = useStore();
  const base: Opt[] = [
    ...regions.map((r) => ({ id: r.id, name: r.name, ref: { type: "preset" as const, id: r.id } })),
    { id: "sahel_hint", name: "Sahel (box 17°W to 30°E, 10°N to 18°N)", ref: { type: "bbox", bbox: [-17, 10, 30, 18] } },
    { id: "wisconsin", name: "Wisconsin, USA (box)", ref: { type: "bbox", bbox: [-92.9, 42.5, -86.8, 47.1] } },
  ];
  const options = preset ? [preset.a, preset.b, ...base] : base;
  const initialA = preset?.a.id ?? huntSelection?.a ?? (run?.place.ref.type === "preset" ? run.place.ref.id : "sahel_hint");
  const [a, setA] = useState<string>(initialA);
  const [b, setB] = useState<string>(preset?.b.id ?? huntSelection?.b ?? (initialA === "mekong_delta" ? "hanoi" : "mekong_delta"));
  const [busy, setBusy] = useState(false);
  const [raw, setRes] = useState<{ cmp: CompareResponse; sa: SeriesResponse; sb: SeriesResponse; na: string; nb: string } | null>(null);
  const [added, setAdded] = useState(false);
  const auto = useRef<number | null>(null);
  const res = useMemo(() => (raw && tempUnit === "F" && raw.sa.units === "°C"
    ? { ...raw, cmp: compareF(raw.cmp), sa: seriesF(raw.sa), sb: seriesF(raw.sb) } : raw), [raw, tempUnit]);
  const opt = (id: string) => options.find((o) => o.id === id) ?? base[0];

  const check = async (ia = a, ib = b) => {
    if (!variable) return;
    const start = `${sel.startYear}-01`, end = `${sel.endYear}-12`;
    setBusy(true); setAdded(false);
    try {
      const [cmp, sa, sb] = await Promise.all([
        api.compare(variable.id, opt(ia).ref, opt(ib).ref, start, end),
        api.series(variable.id, opt(ia).ref, start, end),
        api.series(variable.id, opt(ib).ref, start, end),
      ]);
      setRes({ cmp, sa, sb, na: opt(ia).name, nb: opt(ib).name });
    } catch (e) { showError(e); } finally { setBusy(false); }
  };
  // A candidate opened from "Discover" is compared straight away (once per click).
  useEffect(() => {
    if (preset && variable && auto.current !== preset.run) { auto.current = preset.run; setA(preset.a.id); setB(preset.b.id); void check(preset.a.id, preset.b.id); }
  }, [preset, variable]); // eslint-disable-line react-hooks/exhaustive-deps

  const u = variable?.display_units ?? "";
  const toReport = () => {
    if (!res || !variable) return;
    addComparison({ key: res.cmp.compare_id, kind: "regions", title: `${variable.parameter_name}: ${res.na} vs ${res.nb}`,
      a: { label: res.na, dataset: variable.dataset_name, trend: res.cmp.a, series: res.sa },
      b: { label: res.nb, dataset: variable.dataset_name, trend: res.cmp.b, series: res.sb },
      units: u, variableName: variable.parameter_name, test: res.cmp });
    setAdded(true);
  };
  const ask = () => {
    if (!raw || !variable) return;
    void sendChat(`Why might ${raw.na} and ${raw.nb} show different ${variable.parameter_name.toLowerCase()} trends? Use the comparison evidence and say what cannot be concluded.`,
      { intent: "compare", variable_id: variable.id, region: opt(a).ref, region_b: opt(b).ref, start: raw.cmp.a.start, end: raw.cmp.a.end });
    go("detective");
  };

  return (
    <>
      <section className="card pad col">
        <div className="row">
          <label className="col small muted" style={{ gap: 4, flex: 1, minWidth: 220 }}>Place A
            <select className="select" value={a} onChange={(e) => setA(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
          <label className="col small muted" style={{ gap: 4, flex: 1, minWidth: 220 }}>Place B
            <select className="select" value={b} onChange={(e) => setB(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
          <button type="button" className="btn" style={{ alignSelf: "flex-end" }} disabled={busy || a === b || !variable?.available} onClick={() => void check()}>
            {busy ? "Testing…" : a === b ? "Choose two different places" : "Run the check"}
          </button>
        </div>
        <span className="small muted">Using {variable?.parameter_name} · {variable?.dataset_name} · {sel.startYear} to {sel.endYear} (change these on Explore).</span>
      </section>

      {busy && <div className="card pad" role="status"><b>Comparing the trends in {opt(a).name} and {opt(b).name}…</b>
        <span className="small muted"> Two regional series, two trend tests and a test of their anomaly difference.</span><div className="skel" style={{ height: 200, marginTop: 10 }} /></div>}
      {res && !busy && (
        <>
          <section className="row" style={{ alignItems: "stretch", gap: 18 }}>
            {([["A", res.na, res.cmp.a, "#2b2540"], ["B", res.nb, res.cmp.b, "#5e5872"]] as const).map(([k, nm, tr, col]) => (
              <div key={k} className="card pad col" style={{ flex: 1, minWidth: 260 }}>
                <span className="label" style={{ color: col }}>Place {k} · {k === "A" ? "solid line" : "dashed line"}</span>
                <h2 style={{ fontSize: 20 }}>{nm}</h2>
                <VerdictBadge t={tr} />
                <span className="num" style={{ font: "600 34px var(--display)" }}>{signed(tr.slope_per_decade)} {u} <span style={{ font: "800 14px var(--body)" }}>per decade</span></span>
                <div className="grid2"><Stat value={ci(tr.slope_ci)} label="95% OLS anomaly interval" /><Stat value={pval(tr.p_value)} label="Raw Seasonal MK p" /></div>
              </div>
            ))}
            <div className="card pad col" style={{ flex: 1, minWidth: 260 }}>
              <span className="label">Difference A minus B</span>
              <span className={`badge ${VERDICT[res.cmp.verdict].cls}`}>{VERDICT[res.cmp.verdict].text}</span>
              <span className="num" style={{ font: "600 34px var(--display)" }}>{signed(res.cmp.difference.slope_diff_per_decade)} {u} <span style={{ font: "800 14px var(--body)" }}>per decade</span></span>
              <div className="grid2"><Stat value={ci(res.cmp.difference.ci)} label="95% bootstrap interval" /><Stat value={pval(res.cmp.difference.p_value)} label="p of the difference" /></div>
              <p style={{ margin: 0, font: "600 14.5px/1.5 var(--body)" }}>{res.cmp.plain_summary}</p>
              <span className="small muted">Confirmed only when p &lt; 0.05 <b>and</b> the interval excludes zero. A significant trend in one place and a non-significant one in the other does not by itself show they differ.</span>
            </div>
          </section>
          <section className="card pad col">
            <span style={{ font: "800 14px var(--body)" }}>Both places · monthly anomalies (seasons removed)</span>
            <TrendChart anomaly units={u} lines={[
              { series: res.sa, trend: res.cmp.a, color: "#2b2540", label: "A" },
              { series: res.sb, trend: res.cmp.b, color: "#8d86a0", dash: true, label: "B" },
            ]} />
            <span className="small muted">Thin lines: monthly anomalies (A solid, B dashed) · Thick lines: Theil–Sen trends, orange = increasing, blue = decreasing · Estimated past trends, not forecasts.</span>
            {res.cmp.warnings.map((w) => <div key={w} className="warn">{w}</div>)}
            <div className="row">
              <button type="button" className="btn soft" onClick={ask}>Investigate with Detective</button>
              <button type="button" className="btn soft" disabled={added} onClick={toReport}>{added ? "Added to report" : "Add to report"}</button>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- discover */
function Discover({ onInspect }: { onInspect: (a: Opt, b: Opt) => void }) {
  const { variables, variable, sel, showError, tempUnit, addComparison, sendChat, go } = useStore();
  const partner = variable ? compatiblePartner(variable.id, variables) : null;
  const [twoDatasets, setTwoDatasets] = useState(false);
  const [extentId, setExtentId] = useState(EXTENTS[1].id);
  const [tile, setTile] = useState(5);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<HuntResponse | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const ext = EXTENTS.find((x) => x.id === extentId)!;
  const tiles = Math.ceil((ext.bbox[2] - ext.bbox[0]) / tile) * Math.ceil((ext.bbox[3] - ext.bbox[1]) / tile);
  const f = tempUnit === "F" && variable?.display_units === "°F" ? 1.8 : 1;   // slopes arrive in °C
  const u = variable?.display_units ?? "";

  const scan = async () => {
    if (!variable) return;
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setBusy(true); setRes(null);
    try {
      setRes(await api.discover({ variable_id: variable.id, variable_id_b: twoDatasets && partner ? partner.id : null,
        start: `${sel.startYear}-01`, end: `${sel.endYear}-12`, extent: ext.bbox, tile_deg: tile, max_candidates: 5 }, c.signal));
    } catch (e) { if (!c.signal.aborted) showError(e); } finally { if (ctrl.current === c) { setBusy(false); ctrl.current = null; } }
  };
  const cancel = () => { ctrl.current?.abort(); ctrl.current = null; setBusy(false); };

  const toReport = (cand: HuntCandidate) => {
    if (!variable || !cand.regional || !res) return;
    const b = res.variable_id_b ? variables.find((v) => v.id === res.variable_id_b) : null;
    Promise.all([
      api.series(res.variable_id, { type: "bbox", bbox: cand.a.bbox }, res.start, res.end),
      api.series(res.variable_id_b ?? res.variable_id, { type: "bbox", bbox: res.mode === "regions" ? cand.b.bbox : cand.a.bbox }, res.start, res.end),
      api.trends(res.variable_id, { type: "bbox", bbox: cand.a.bbox }, res.start, res.end),
      api.trends(res.variable_id_b ?? res.variable_id, { type: "bbox", bbox: res.mode === "regions" ? cand.b.bbox : cand.a.bbox }, res.start, res.end),
      res.mode === "regions" ? api.compare(res.variable_id, { type: "bbox", bbox: cand.a.bbox }, { type: "bbox", bbox: cand.b.bbox }, res.start, res.end) : Promise.resolve(null),
    ]).then(([sa, sb, ta, tb, cmp]) => {
      const F = tempUnit === "F" && sa.units === "°C";
      addComparison({ key: `hunt-${res.mode}-${cand.a.bbox.join(",")}-${cand.b.bbox.join(",")}-${res.start}-${res.end}`, kind: res.mode,
        title: res.mode === "regions" ? `${variable.parameter_name}: ${boxName(cand.a.bbox)} vs ${boxName(cand.b.bbox)}`
          : `${variable.parameter_name}: ${variable.dataset_name} vs ${b?.dataset_name} over ${boxName(cand.a.bbox)}`,
        a: { label: res.mode === "regions" ? boxName(cand.a.bbox) : boxName(cand.a.bbox), dataset: variable.dataset_name, trend: F ? trendF(ta) : ta, series: F ? seriesF(sa) : sa },
        b: { label: res.mode === "regions" ? boxName(cand.b.bbox) : boxName(cand.a.bbox), dataset: b?.dataset_name ?? variable.dataset_name, trend: F ? trendF(tb) : tb, series: F ? seriesF(sb) : sb },
        units: u, variableName: variable.parameter_name, test: cmp ? (F ? compareF(cmp) : cmp) : null });
    }).catch(showError);
  };
  const ask = (cand: HuntCandidate) => {
    if (!variable || !res) return;
    const other = res.variable_id_b ? variables.find((v) => v.id === res.variable_id_b) : null;
    const q = res.mode === "regions"
      ? `Why might these two places show opposite ${variable.parameter_name.toLowerCase()} trends? Use the comparison evidence and say what cannot be concluded.`
      : `Why might ${variable.dataset_name} and ${other?.dataset_name} show different ${variable.parameter_name.toLowerCase()} trends here? Use the evidence, list possible reasons only as hypotheses, and say what cannot be concluded.`;
    void sendChat(q, res.mode === "regions"
      ? { intent: "compare", variable_id: res.variable_id, region: { type: "bbox", bbox: cand.a.bbox }, region_b: { type: "bbox", bbox: cand.b.bbox }, start: res.start, end: res.end }
      : { intent: "trend", variable_id: res.variable_id, region: { type: "bbox", bbox: cand.a.bbox }, start: res.start, end: res.end });
    go("detective");
  };

  return (
    <>
      <section className="card pad col">
        <h2 style={{ fontSize: 22 }}>Discover contradictions</h2>
        <p className="small muted" style={{ margin: 0 }}>Scans the already computed trend map for {variable?.parameter_name} · {variable?.dataset_name}, {sel.startYear} to {sel.endYear}{" "}
          (change on Explore). The area is cut into square tiles; tiles where at least 30% of cells are significant (after FDR) in one direction are paired
          with tiles leaning the other way. The top pairs are then re-tested as two regions with the same test as "Compare two places".</p>
        <div className="row">
          <label className="col small muted" style={{ gap: 4, minWidth: 200, flex: 1 }}>Search area
            <select className="select" value={extentId} onChange={(e) => setExtentId(e.target.value)}>{EXTENTS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <label className="col small muted" style={{ gap: 4, minWidth: 140 }}>Tile size
            <select className="select" value={tile} onChange={(e) => setTile(Number(e.target.value))}>{[2.5, 5, 10, 20].map((t) => <option key={t} value={t}>{t}° × {t}°</option>)}</select>
          </label>
          <label className="row small" style={{ gap: 8, alignSelf: "flex-end", minHeight: 44 }}>
            <input type="checkbox" checked={twoDatasets && !!partner} disabled={!partner} onChange={(e) => setTwoDatasets(e.target.checked)} />
            {partner ? `Compare with ${partner.dataset_name} instead` : "No compatible second dataset for this variable"}
          </label>
          <button type="button" className="btn" style={{ alignSelf: "flex-end" }} disabled={busy || !variable?.available || tiles > 600} onClick={() => void scan()}>Scan</button>
        </div>
        <span className="small muted">{tiles} tiles{tiles > 600 ? " (limit 600: choose larger tiles)" : ""}. At most 5 candidates; the top 5 are re-tested.</span>
      </section>

      {busy && (
        <div className="card pad col" role="status">
          <b>Scanning {tiles} tiles of the {variable?.dataset_name} trend map…</b>
          <span className="small muted">If this period's map has not been computed yet, the server computes it first (about a minute). Then the top candidates are re-tested.</span>
          <button type="button" className="btn soft" style={{ alignSelf: "flex-start" }} onClick={cancel}>Cancel</button>
        </div>
      )}
      {res && !busy && (
        <section className="card pad col">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 20 }}>{res.candidates.length ? `${res.candidates.length} candidate${res.candidates.length === 1 ? "" : "s"}` : "No candidates"}</h2>
            <span className="small muted">{res.tiles_scanned} tiles with data · {(res.runtime_ms / 1000).toFixed(1)} s</span>
          </div>
          {res.compatibility && <div className="warn small">{res.compatibility}</div>}
          {res.candidates.length === 0 && <p className="muted" style={{ margin: 0 }}>No tiles lean in opposite directions with these settings. Try a larger area, smaller tiles or another period. No contradiction is not proof of agreement.</p>}
          <ol className="cands">
            {res.candidates.map((c) => (
              <li key={c.rank} className="cand">
                <div className="cand-map"><LocatorMap height={200} boxes={res.mode === "regions"
                  ? [{ bbox: c.a.bbox, label: "A", color: "#c4621a" }, { bbox: c.b.bbox, label: "B", color: "#2f6fb3" }]
                  : [{ bbox: c.a.bbox, label: "tile", color: "#c4462f" }]} /></div>
                <div className="col" style={{ gap: 6, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}><b>#{c.rank}</b><span className={`badge ${CLASS[c.classification].cls}`}>{CLASS[c.classification].text}</span></div>
                  <span className="small">{res.mode === "regions" ? <>A: {boxName(c.a.bbox)} · B: {boxName(c.b.bbox)} · {c.metrics.distance_deg}° apart</> : <>Tile: {boxName(c.a.bbox)}</>}</span>
                  {c.regional && (
                    <span className="num small"><b>{res.mode === "regions" ? "A" : variable?.dataset_name}</b> {signed(c.regional.a.slope_per_decade === null ? null : c.regional.a.slope_per_decade * f)} {u}/decade (p {pval(c.regional.a.p_value)}) ·{" "}
                      <b>{res.mode === "regions" ? "B" : variables.find((v) => v.id === res.variable_id_b)?.dataset_name}</b> {signed(c.regional.b.slope_per_decade === null ? null : c.regional.b.slope_per_decade * f)} {u}/decade (p {pval(c.regional.b.p_value)})</span>
                  )}
                  {c.test && <span className="num small">Difference test: p {pval(c.test.difference.p_value)}, 95% interval {ci(c.test.difference.ci ? [c.test.difference.ci[0] * f, c.test.difference.ci[1] * f] : null)} {u}/decade</span>}
                  <span className="small">{c.classification_text}</span>
                  <details><summary className="small">Why it was flagged</summary><ul className="small">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul></details>
                  <div className="row" style={{ gap: 8 }}>
                    {res.mode === "regions" && <button type="button" className="btn soft" onClick={() => onInspect(
                      { id: `cand-a-${c.rank}`, name: `Candidate ${c.rank} A (${boxName(c.a.bbox)})`, ref: { type: "bbox", bbox: c.a.bbox } },
                      { id: `cand-b-${c.rank}`, name: `Candidate ${c.rank} B (${boxName(c.b.bbox)})`, ref: { type: "bbox", bbox: c.b.bbox } })}>Inspect</button>}
                    <button type="button" className="btn soft" onClick={() => ask(c)}>Investigate with Detective</button>
                    <button type="button" className="btn soft" disabled={!c.regional} onClick={() => toReport(c)}>Add to report</button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <details><summary className="small">How candidates are ranked</summary>
            <ol className="small">{res.criteria.ranking.map((r) => <li key={r}>{r}</li>)}</ol>
            {res.warnings.map((w) => <p key={w} className="small muted" style={{ margin: "4px 0" }}>{w}</p>)}
          </details>
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 8.5D2 dataset agreement */
function DatasetAgreement() {
  const { variables, variable, sel, showError, tempUnit, addComparison, go } = useStore();
  const partner = variable ? compatiblePartner(variable.id, variables) : null;
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<{ ta: TrendResponse; tb: TrendResponse; sa: SeriesResponse; sb: SeriesResponse } | null>(null);
  const [added, setAdded] = useState(false);
  const res = useMemo(() => (raw && tempUnit === "F" && raw.sa.units === "°C"
    ? { ta: trendF(raw.ta), tb: trendF(raw.tb), sa: seriesF(raw.sa), sb: seriesF(raw.sb) } : raw), [raw, tempUnit]);
  const u = variable?.display_units ?? "";

  const runIt = async () => {
    if (!variable || !partner) return;
    const start = `${sel.startYear}-01`, end = `${sel.endYear}-12`, r = sel.place.ref;
    setBusy(true); setAdded(false);
    try {
      const [ta, tb, sa, sb] = await Promise.all([api.trends(variable.id, r, start, end), api.trends(partner.id, r, start, end),
        api.series(variable.id, r, start, end), api.series(partner.id, r, start, end)]);
      setRaw({ ta, tb, sa, sb });
    } catch (e) { showError(e); } finally { setBusy(false); }
  };
  const corr = res ? correlation(res.sa.points.map((p) => p.anomaly), res.sb.points.map((p) => p.anomaly)) : null;

  if (!partner) return (
    <section className="card pad col"><h2 style={{ fontSize: 22 }}>Dataset agreement</h2>
      <p className="muted" style={{ margin: 0 }}>{variable?.parameter_name} has no second compatible dataset on this server. Compatible pairs measure the same quantity in the
        same units (today: air temperature from GLDAS and MERRA-2). Choose Air temperature on Explore to use this view.</p>
      <button type="button" className="btn soft" style={{ alignSelf: "flex-start" }} onClick={() => go("explore")}>Go to Explore</button></section>
  );
  return (
    <>
      <section className="card pad col">
        <h2 style={{ fontSize: 22 }}>Dataset agreement</h2>
        <p className="small muted" style={{ margin: 0 }}>Compares {variable?.dataset_name} and {partner.dataset_name} for {sel.place.label}, {sel.startYear} to {sel.endYear}, with the same
          trend test for each. Both are {u} on the same {variable?.spatial_resolution_deg}° grid; they are produced differently, and neither is treated as ground truth.
          No statistical test of the difference between datasets is implemented, so this comparison is descriptive.</p>
        <button type="button" className="btn" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void runIt()}>{busy ? "Comparing…" : "Compare the two datasets"}</button>
      </section>
      {busy && <div className="card pad" role="status"><b>Building both monthly series and testing each trend for {sel.place.label}…</b><div className="skel" style={{ height: 180, marginTop: 10 }} /></div>}
      {res && !busy && (
        <>
          <section className="row" style={{ alignItems: "stretch", gap: 18 }}>
            {([[variable?.dataset_name, res.ta, "#2b2540"], [partner.dataset_name, res.tb, "#5e5872"]] as const).map(([nm, t, col]) => (
              <div key={nm} className="card pad col" style={{ flex: 1, minWidth: 260 }}>
                <span className="label" style={{ color: col }}>{nm}</span>
                <VerdictBadge t={t} />
                <span className="num" style={{ font: "600 32px var(--display)" }}>{signed(t.slope_per_decade)} {u} <span style={{ font: "800 14px var(--body)" }}>per decade</span></span>
                <div className="grid2"><Stat value={pval(t.p_value)} label="Raw Seasonal MK p" /><Stat value={`${t.quality.n_months}`} label="Months with data" /></div>
              </div>
            ))}
            <div className="card pad col" style={{ flex: 1, minWidth: 260 }}>
              <span className="label">Agreement (descriptive)</span>
              <Stat value={res.ta.slope_per_decade !== null && res.tb.slope_per_decade !== null ? `${signed(res.ta.slope_per_decade - res.tb.slope_per_decade)} ${u}` : "n/a"} label="Slope difference per decade" />
              <Stat value={corr ? `${corr.r.toFixed(2)} (${corr.n} months)` : "n/a"} label="Correlation of monthly anomalies" />
              <span className="small">{res.ta.slope_per_decade !== null && res.tb.slope_per_decade !== null && res.ta.slope_per_decade * res.tb.slope_per_decade < 0
                ? "The two products give opposite trend directions here." : "Both products point the same way here."}{" "}
                High correlation means the month-to-month ups and downs match; it does not mean the long-term trends match.</span>
              {Math.abs(res.ta.quality.coverage_fraction - res.tb.quality.coverage_fraction) > 0.05 && (
                <span className="warn small">Different spatial coverage: {variable?.dataset_name} has data in {Math.round(res.ta.quality.coverage_fraction * 100)}% of this area,
                  {" "}{partner.dataset_name} in {Math.round(res.tb.quality.coverage_fraction * 100)}% (for example land only versus land and sea). The averages describe different cells, so part
                  of the difference comes from coverage. Choose an area over land to compare like with like.</span>
              )}
            </div>
          </section>
          <section className="card pad col">
            <span style={{ font: "800 14px var(--body)" }}>Monthly anomalies · {variable?.dataset_name} solid, {partner.dataset_name} dashed</span>
            <TrendChart anomaly units={u} lines={[{ series: res.sa, trend: res.ta, color: "#2b2540", label: variable?.dataset_name }, { series: res.sb, trend: res.tb, color: "#8d86a0", dash: true, label: partner.dataset_name }]} />
            <div className="row"><button type="button" className="btn soft" disabled={added} onClick={() => {
              if (!variable) return;
              addComparison({ key: `ds-${res.ta.trend_id}-${res.tb.trend_id}`, kind: "datasets", title: `${variable.parameter_name}: ${variable.dataset_name} vs ${partner.dataset_name}, ${sel.place.label}`,
                a: { label: sel.place.label, dataset: variable.dataset_name, trend: res.ta, series: res.sa }, b: { label: sel.place.label, dataset: partner.dataset_name, trend: res.tb, series: res.sb },
                units: u, variableName: variable.parameter_name, test: null });
              setAdded(true);
            }}>{added ? "Added to report" : "Add to report"}</button></div>
          </section>
        </>
      )}
    </>
  );
}
