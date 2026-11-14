// Phase 8.5B: printable Scientific Evidence Report. Fixed-viewBox SVG charts and maps so print and PDF output do not
// depend on the screen width. Everything shown is taken from the ReportModel (backend evidence).
import { geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import countriesTopo from "world-atlas/countries-110m.json";
import type { SeriesResponse, TrendResponse } from "../api";
import { Terra } from "../ui";
import { num, pText, signedNum, type AnalysisEntry, type ComparisonEntry, type ReportModel } from "./model";

const topo = countriesTopo as unknown as Topology;
const LAND = feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;
const UP = "#c4621a", DOWN = "#2f6fb3";

/** Monthly anomalies (thin) and the seasonal Sen slope drawn through their mean (thick; dashed = not significant). */
export function ReportChart({ lines, units, height = 230 }: {
  lines: { series: SeriesResponse; trend: TrendResponse; color: string; dash?: boolean; label?: string }[]; units: string; height?: number;
}) {
  const W = 720, H = height, PL = 56, PR = 14, PT = 12, PB = 30;
  const n = Math.max(...lines.map((l) => l.series.points.length), 2);
  const vals = lines.flatMap((l) => l.series.points.map((p) => p.anomaly)).filter((v): v is number => v !== null);
  if (!vals.length) return <p className="warn">No values to plot for this selection.</p>;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = (i: number) => PL + (i / (n - 1)) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const raw = (hi - lo) / 5, p10 = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p10;
  const step = (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p10;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(+v.toFixed(10));
  const pts = lines[0].series.points;
  const y0 = Number(pts[0].t.slice(0, 4)), y1 = Number(pts[pts.length - 1].t.slice(0, 4));
  const ys = y1 - y0 > 16 ? 4 : y1 - y0 > 8 ? 2 : 1;
  const path = (s: SeriesResponse) => {
    let d = "", pen = false;
    s.points.forEach((p, i) => { if (p.anomaly === null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.anomaly).toFixed(1)}`; pen = true; });
    return d;
  };
  return (
    <svg className="rchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly anomalies ${y0} to ${y1} with seasonal Sen trend line`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? "#8a8399" : "#e4e0ea"} strokeWidth={v === 0 ? 1.2 : 0.8} />
          <text x={PL - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="#3d3850">{v.toFixed(step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step))))}</text>
        </g>
      ))}
      {pts.map((p, i) => (p.t.endsWith("-01") && (Number(p.t.slice(0, 4)) - y0) % ys === 0
        ? <text key={p.t} x={X(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#3d3850">{p.t.slice(0, 4)}</text> : null))}
      <text x={10} y={PT} fontSize="10.5" fill="#3d3850" transform={`rotate(-90 10 ${PT})`} textAnchor="end">{units}</text>
      {lines.map((l, k) => <path key={`s${k}`} d={path(l.series)} fill="none" stroke={l.color} strokeOpacity={0.7} strokeWidth={1.1} strokeDasharray={l.dash ? "4 3" : undefined} />)}
      {lines.map((l, k) => {
        const t = l.trend;
        if (t.slope_per_decade === null) return null;
        const v = l.series.points.map((p) => p.anomaly).filter((x): x is number => x !== null);
        const c = v.reduce((a, b) => a + b, 0) / v.length, mid = (n - 1) / 2;
        const at = (i: number) => c + (t.slope_per_decade! / 120) * (i - mid);
        return <path key={`t${k}`} d={`M${X(0)} ${Y(at(0))} L${X(n - 1)} ${Y(at(n - 1))}`} stroke={t.slope_per_decade >= 0 ? UP : DOWN}
          strokeWidth={3.2} strokeLinecap="round" strokeDasharray={t.significant ? undefined : "10 6"} fill="none" />;
      })}
    </svg>
  );
}

/** Locator map: the analysed box over country outlines, framed around the region. */
export function LocatorMap({ boxes, height = 300 }: { boxes: { bbox: [number, number, number, number]; label: string; color: string }[]; height?: number }) {
  const W = 720, H = height;
  const w = Math.min(...boxes.map((b) => b.bbox[0])), s = Math.min(...boxes.map((b) => b.bbox[1]));
  const e = Math.max(...boxes.map((b) => b.bbox[2])), n = Math.max(...boxes.map((b) => b.bbox[3]));
  const global = e - w >= 300;
  const padX = Math.max(8, (e - w) * 0.6), padY = Math.max(5, (n - s) * 0.6);
  const ext: [number, number, number, number] = global ? [-180, -90, 180, 90]
    : [Math.max(-180, w - padX), Math.max(-90, s - padY), Math.min(180, e + padX), Math.min(90, n + padY)];
  const frame: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[ext[0], ext[1]], [ext[0], ext[3]], [ext[2], ext[3]], [ext[2], ext[1]], [ext[0], ext[1]]]] } };
  // Clockwise ring: d3-geo treats a counter-clockwise ring as "the whole sphere minus the box".
  const proj = geoEquirectangular().fitSize([W, H], frame).clipExtent([[0, 0], [W, H]]);
  const path = geoPath(proj);
  return (
    <svg className="rmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${boxes.map((b) => b.label).join(" and ")}`}>
      <rect width={W} height={H} fill="#e8f3f7" />
      <path d={path(geoGraticule10()) ?? ""} fill="none" stroke="#c9dde6" strokeWidth={0.6} />
      <path d={path(LAND) ?? ""} fill="#f1e6cf" stroke="#b9a98a" strokeWidth={0.6} />
      {boxes.map((b) => {
        const [x0, y0] = proj([b.bbox[0], b.bbox[3]])!, [x1, y1] = proj([b.bbox[2], b.bbox[1]])!;
        return (
          <g key={b.label}>
            <rect x={x0} y={y0} width={Math.max(3, x1 - x0)} height={Math.max(3, y1 - y0)} fill={b.color} fillOpacity={0.18} stroke={b.color} strokeWidth={2.2} />
            <text x={x0 + 4} y={Math.max(12, y0 - 5)} fontSize="12" fontWeight="700" fill={b.color}>{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="rkv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

const Head = ({ m, title }: { m: ReportModel; title: string }) => (
  <header className="rhead"><span className="rbrand"><Terra size={26} /> TERRA-SCOPE AI</span><span>{title}</span><span>{m.id}</span></header>
);

function AnalysisPages({ m, a, i }: { m: ReportModel; a: AnalysisEntry; i: number }) {
  const sigCls = a.verdict === "Significant trend" ? "sig" : a.verdict === "Not proven yet" ? "np" : "ne";
  return (
    <>
      <section className="rpage">
        <Head m={m} title={`Analysis ${i + 1}: time series and trend`} />
        <h2>{a.parameter} · {a.place}</h2>
        <p className="rlead">{a.finding}</p>
        <div className="rrow">
          <span className={`badge ${sigCls}`}>{a.verdict}</span>
          <span className="rbig">{signedNum(a.slope)} {a.units} <small>per decade (Sen slope)</small></span>
        </div>
        <ReportChart units={a.units} lines={[{ series: a.series, trend: a.trend, color: "#3d3850" }]} />
        <p className="rcap">Thin line: monthly anomalies (each month minus its long-term average for that calendar month). Thick line: seasonal Sen slope
          drawn through the mean anomaly, {a.significant ? "solid because the trend is significant" : "dashed because the trend is not significant"}. Orange = increase, blue = decrease. Estimated past trend, not a forecast.</p>
        <KV rows={[
          ["Sen slope", `${signedNum(a.slope)} ${a.units} per decade (${a.slopeMethod})`],
          ["Raw Seasonal MK p", `${pText(a.pRaw)}: decision basis, significant when below α = ${a.alpha}`],
          ["Autocorrelation-adjusted p", `${pText(a.pAdjusted)}: separate diagnostic (Hamed-Rao on anomalies), does not change the verdict`],
          ["OLS anomaly slope, 95% interval", a.olsInterval ? `${num(a.olsInterval[0])} to ${num(a.olsInterval[1])} ${a.units} per decade. Different estimator from Sen; not a Sen confidence interval.` : "n/a"],
          ["Sample", `${a.nMonths} months with data, ${a.missingMonths} missing (${a.start} to ${a.end}); on average ${a.coveragePct}% of the area has data`],
          ["Data sufficiency", a.sufficient ? "Sufficient (at least 10 years and 70% of months)" : "Insufficient: not tested"],
          ["Method", `${a.method} + ${a.slopeMethod}; interval ${a.ciMethod}; backend ${m.backendVersion}; trend ID ${a.trendId}`],
        ]} />
        {a.warnings.length > 0 && <ul className="rwarn">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </section>
      <section className="rpage">
        <Head m={m} title={`Analysis ${i + 1}: geographic evidence`} />
        <h2>Where this was measured</h2>
        <LocatorMap boxes={[{ bbox: a.bbox, label: a.place, color: "#c4462f" }]} />
        <KV rows={[
          ["Region", a.regionKind === "preset" ? `${a.place} (catalog preset "${a.regionId}")` : `${a.place} (bounding-box approximation)`],
          ["Box", `W ${a.bbox[0]}°, S ${a.bbox[1]}°, E ${a.bbox[2]}°, N ${a.bbox[3]}°`],
          ["Geometry", "The analysis averages every grid cell inside this latitude-longitude box. Country and drawn shapes are approximated by their box."],
          ["Resolution", `${a.gridDeg}° processed grid (about ${Math.round(a.gridDeg * 111)} km); native NASA resolution ${a.nativeDeg}°`],
          ["Dataset", `${a.dataset}: ${a.product} v${a.version}, ${a.provider}`],
          ["Significance on maps", "Grid maps test every cell separately and control the false discovery rate (Benjamini-Hochberg) across all cells; this regional result is one test of the box average."],
        ]} />
      </section>
    </>
  );
}

function ComparisonPage({ m, c }: { m: ReportModel; c: ComparisonEntry }) {
  return (
    <section className="rpage">
      <Head m={m} title="Comparison and contradiction findings" />
      <h2>{c.title}</h2>
      <table className="rtable">
        <thead><tr><th scope="col">Item</th><th scope="col">A: {c.a.label} ({c.a.dataset})</th><th scope="col">B: {c.b.label} ({c.b.dataset})</th></tr></thead>
        <tbody>
          <tr><th scope="row">Sen slope per decade</th><td>{signedNum(c.a.trend.slope_per_decade)} {c.units}</td><td>{signedNum(c.b.trend.slope_per_decade)} {c.units}</td></tr>
          <tr><th scope="row">Raw Seasonal MK p</th><td>{pText(c.a.trend.p_value)}</td><td>{pText(c.b.trend.p_value)}</td></tr>
          <tr><th scope="row">Period</th><td>{c.a.trend.start} to {c.a.trend.end}</td><td>{c.b.trend.start} to {c.b.trend.end}</td></tr>
          <tr><th scope="row">Months with data</th><td>{c.a.trend.quality.n_months}</td><td>{c.b.trend.quality.n_months}</td></tr>
        </tbody>
      </table>
      <ReportChart units={c.units} height={170} lines={[
        { series: c.a.series, trend: c.a.trend, color: "#2b2540", label: "A" },
        { series: c.b.series, trend: c.b.trend, color: "#8d86a0", dash: true, label: "B" },
      ]} />
      <p className="rcap">Monthly anomalies: A solid, B dashed. Thick lines: each seasonal Sen slope.</p>
      {c.kind === "regions" && <LocatorMap height={190} boxes={[{ bbox: c.a.trend.region.bbox, label: "A", color: "#c4462f" }, { bbox: c.b.trend.region.bbox, label: "B", color: "#2f6fb3" }]} />}
      <div className="rcols">
        <div><h3>What agrees</h3><ul>{(c.agrees.length ? c.agrees : ["Nothing in the compared statistics."]).map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h3>What disagrees</h3><ul>{(c.disagrees.length ? c.disagrees : ["Nothing in the compared statistics."]).map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
      <h3>How strong the evidence is</h3><p>{c.strength}</p>
      <h3>What cannot be concluded</h3><ul>{c.cannotConclude.map((x) => <li key={x}>{x}</li>)}</ul>
    </section>
  );
}

export function ReportDoc({ m }: { m: ReportModel }) {
  const date = new Date(m.generatedAt);
  return (
    <article className="report-doc" aria-label="Scientific evidence report">
      <section className="rpage rcover">
        <Head m={m} title="Scientific Evidence Report" />
        <div className="rtitle">
          <Terra size={64} />
          <div><h1>Scientific Evidence Report</h1><p>Environmental trends from NASA Earth observation data</p></div>
        </div>
        <KV rows={[
          ["Report ID", m.id], ["Generated", `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`],
          ["Analyses", `${m.analyses.length} trend ${m.analyses.length === 1 ? "analysis" : "analyses"}${m.comparisons.length ? `, ${m.comparisons.length} comparison${m.comparisons.length === 1 ? "" : "s"}` : ""}`],
          ["NASA products", m.datasets.map((d) => `${d.product} v${d.version}`).join(", ") || "n/a"],
          ["Status", "Preliminary: not peer reviewed"],
        ]} />
        <h2>Executive summary</h2>
        <ol className="rfind">
          {m.analyses.map((a) => <li key={a.key}><b>{a.verdict}.</b> {a.finding}</li>)}
          {m.comparisons.map((c) => <li key={c.key}><b>{c.title}.</b> {c.strength}</li>)}
        </ol>
        <div className="rnote"><b>How to read significance.</b> A trend is called significant only when the raw Seasonal Mann-Kendall p-value is below 0.05 with
          at least 10 years of data. A positive or negative slope on its own is not evidence of a real trend. Not significant does not mean no change.</div>
        <h3>Key limitations</h3>
        <ul>{m.limitations.slice(0, 3).map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
      {m.analyses.map((a, i) => <AnalysisPages key={a.key} m={m} a={a} i={i} />)}
      {m.comparisons.map((c) => <ComparisonPage key={c.key} m={m} c={c} />)}
      <section className="rpage">
        <Head m={m} title="Methods and provenance" />
        <h2>Methods and provenance</h2>
        <table className="rtable">
          <thead><tr><th scope="col" style={{ width: "46%" }}>Product</th><th scope="col">Provider</th><th scope="col">Native grid</th><th scope="col">Processed grid</th></tr></thead>
          <tbody>{m.datasets.map((d) => (
            <tr key={d.product}><td>{d.product} v{d.version}<br /><a className="rurl" href={d.url}>{d.url.replace(/^https?:\/\//, "")}</a></td><td>{d.provider}</td>
              <td>{Number.isFinite(d.nativeDeg) ? `${d.nativeDeg}°` : "see product page"}</td><td>{Number.isFinite(d.gridDeg) ? `${d.gridDeg}°` : "see product page"}</td></tr>
          ))}</tbody>
        </table>
        <KV rows={[
          ["Aggregation", "Monthly values; regional series are area averages of all grid cells in the box."],
          ["Seasonality", "Anomalies remove each calendar month's long-term mean (used for charts, the OLS interval and the adjusted test)."],
          ["Trend test", "Seasonal Mann-Kendall (raw p-value) decides significance; α = 0.05; requires at least 10 years and 70% of months."],
          ["Rate", "Seasonal Sen slope, reported per decade."],
          ["Interval", "95% interval of the OLS slope of anomalies (ols_anomaly). It is a different estimator from Sen and has no HAC adjustment."],
          ["Autocorrelation", "Hamed-Rao modified Mann-Kendall on anomalies is shown as a diagnostic; it does not change the verdict."],
          ["Comparisons", "Two regions: block-bootstrap test of the difference of slopes on anomalies. Two datasets: descriptive only."],
          ["Software", `Terra-scope backend ${m.backendVersion}; NASA data obtained through GES DISC (Harmony) and processed to a common grid.`],
          ["Reproduce", "The JSON export lists every request (variable, region, period, method, α) and the result it returned."],
        ]} />
        <h3>Limitations</h3>
        <ul>{m.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="rdisc">Terra-scope AI is a student project for the NASA Space Apps Challenge 2026. It uses publicly available NASA data. It is not an
          official NASA product, and NASA does not endorse it. Statistical significance is not the same as practical importance.</p>
      </section>
    </article>
  );
}
