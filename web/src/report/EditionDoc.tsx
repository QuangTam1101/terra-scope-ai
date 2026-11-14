// Form D printed report, two editions of ONE report model. Academic register in both; the Simple edition is
// shorter and puts conclusions first, the Scientist edition adds full statistics, figures and methods.
// Every number comes from the ReportModel (backend evidence); verdicts come from the backend flags.
import { meterPos } from "../ResultViews";
import { Terra } from "../ui";
import { Head, KV, LocatorMap, MethodsPage, ReportChart } from "./ReportDoc";
import { num, pText, signedNum, type AnalysisEntry, type ComparisonEntry, type ReportModel } from "./model";
import { abstractText, compareHeadline, compareStamp, compareStatement, defaultHeadline, resultStatement, trendStamp, yearlyMeans, type Edition, type Stamp } from "./formd";

export interface EditionProps {
  m: ReportModel; edition: Edition; title: string; author: string;
  headlines: Record<string, string>; notes: Record<string, string>;
}

const REFERENCES = [
  "Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: a practical and powerful approach to multiple testing. Journal of the Royal Statistical Society, Series B, 57(1), 289-300.",
  "Hamed, K. H., & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. Journal of Hydrology, 204(1-4), 182-196.",
  "Hirsch, R. M., Slack, J. R., & Smith, R. A. (1982). Techniques of trend analysis for monthly water quality data. Water Resources Research, 18(1), 107-121.",
  "Kendall, M. G. (1975). Rank Correlation Methods (4th ed.). Charles Griffin, London.",
  "Mann, H. B. (1945). Nonparametric tests against trend. Econometrica, 13(3), 245-259.",
  "Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. Journal of the American Statistical Association, 63(324), 1379-1389.",
];

const StampTag = ({ s }: { s: Stamp }) => <span className={`badge rstamp ${s.cls}`}>{s.text}</span>;

function YearBars({ a }: { a: AnalysisEntry }) {
  const ys = yearlyMeans(a.series);
  if (ys.length < 2) return <p className="rcap">Too few complete years to draw annual means.</p>;
  const W = 720, H = 190, PL = 50, PR = 10, PT = 14, PB = 28;
  const max = Math.max(...ys.map((y) => Math.abs(y.value)), 1e-9) * 1.15;
  const bw = (W - PL - PR) / ys.length;
  const Y = (v: number) => PT + (1 - (v + max) / (2 * max)) * (H - PT - PB);
  const mean = ys.reduce((s, y) => s + y.value, 0) / ys.length, mid = (ys[0].year + ys[ys.length - 1].year) / 2;
  const line = (yr: number) => mean + ((a.slope ?? 0) / 10) * (yr - mid);
  const up = (a.slope ?? 0) >= 0;
  return (
    <svg className="rchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Annual mean anomalies ${ys[0].year} to ${ys[ys.length - 1].year} with the Sen trend`}>
      <line x1={PL} x2={W - PR} y1={Y(0)} y2={Y(0)} stroke="#8a8399" strokeWidth={1.1} />
      <text x={PL - 6} y={Y(0) + 4} textAnchor="end" fontSize="11" fill="#3d3850">0</text>
      <text x={PL - 6} y={Y(max * 0.8) + 4} textAnchor="end" fontSize="11" fill="#3d3850">{num(max * 0.8, 1)}</text>
      <text x={PL - 6} y={Y(-max * 0.8) + 4} textAnchor="end" fontSize="11" fill="#3d3850">{num(-max * 0.8, 1)}</text>
      {ys.map((y, i) => {
        const x = PL + i * bw + bw * 0.15, top = Math.min(Y(y.value), Y(0)), h = Math.abs(Y(y.value) - Y(0));
        return <rect key={y.year} x={x} y={top} width={bw * 0.7} height={Math.max(1, h)} rx={2} fill={y.value >= 0 ? "#f5b98a" : "#9cc6ef"} />;
      })}
      {a.slope !== null && <line x1={PL + bw / 2} y1={Y(line(ys[0].year))} x2={PL + (ys.length - 0.5) * bw} y2={Y(line(ys[ys.length - 1].year))}
        stroke={up ? (a.significant ? "#c4621a" : "#f2a65a") : (a.significant ? "#2f6fb3" : "#7fb2e5")} strokeWidth={3} strokeLinecap="round" strokeDasharray={a.significant ? undefined : "9 6"} />}
      {[ys[0], ys[Math.floor(ys.length / 2)], ys[ys.length - 1]].map((y) => (
        <text key={y.year} x={PL + ys.indexOf(y) * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#3d3850">{y.year}</text>
      ))}
    </svg>
  );
}

function PMeter({ a }: { a: AnalysisEntry }) {
  if (a.pRaw === null || !a.sufficient) return null;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="meter" role="img" aria-label={`Raw p-value ${pText(a.pRaw)} relative to the significance level ${a.alpha}`}>
        <span className="zone" /><span className="dot" style={{ left: `${meterPos(a.pRaw, a.alpha)}%`, background: (a.slope ?? 0) >= 0 ? "#f2a65a" : "#7fb2e5" }} />
      </div>
      <div className="meter-labels"><span>Rejection region (p &lt; {a.alpha})</span><span>Observed: p {pText(a.pRaw)}</span></div>
    </div>
  );
}

const AuthorNote = ({ text }: { text?: string }) =>
  text?.trim() ? <div className="rauthor"><b>Author note</b> (not part of the evidence): {text.trim()}</div> : null;

function Cover({ p, n }: { p: EditionProps; n: number }) {
  const { m, edition } = p;
  const date = new Date(m.generatedAt);
  const sci = edition === "scientist";
  return (
    <section className="rpage rcover">
      <Head m={m} title={sci ? "Evidence report · Scientist edition" : "Evidence report · Simple edition"} />
      <div className="rtitle">
        <Terra size={58} />
        <div><h1>{p.title || "Trend analysis of NASA Earth observation records"}</h1>
          <p>{p.author ? `${p.author} · ` : ""}{date.toISOString().slice(0, 10)} · Preliminary, not peer reviewed</p></div>
      </div>
      <h2>Abstract</h2>
      <p className="rabstract">{abstractText(m)}</p>
      <h2>{sci ? "Table 1. Summary of findings" : "Key findings"}</h2>
      {sci ? (
        <table className="rtable">
          <thead><tr><th scope="col" style={{ width: "40%" }}>Finding</th><th scope="col">Sen slope per decade</th><th scope="col">Raw p</th><th scope="col">Months</th><th scope="col">Result</th></tr></thead>
          <tbody>
            {m.analyses.map((a) => (
              <tr key={a.key}><td>{a.parameter}, {a.place} ({a.dataset}, {a.start} to {a.end})</td><td>{signedNum(a.slope)} {a.units}</td><td>{pText(a.pRaw)}</td><td>{a.nMonths}</td><td><StampTag s={trendStamp(a)} /></td></tr>
            ))}
            {m.comparisons.map((c) => (
              <tr key={c.key}><td>{c.title}</td><td>{c.test ? `${signedNum(c.test.difference.slope_diff_per_decade)} ${c.units} (A minus B)` : "n/a"}</td><td>{c.test ? pText(c.test.difference.p_value) : "n/a"}</td><td>n/a</td><td><StampTag s={compareStamp(c)} /></td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {m.analyses.map((a) => (
            <div key={a.key} className="rcard"><div className="rbig">{signedNum(a.slope)} <small>{a.units} per decade</small></div>
              <span>{p.headlines[a.key] || defaultHeadline(a)}</span><StampTag s={trendStamp(a)} /></div>
          ))}
          {m.comparisons.map((c) => (
            <div key={c.key} className="rcard"><div className="rbig" style={{ fontSize: "14pt" }}>{c.a.label} vs {c.b.label}</div>
              <span>{compareHeadline(c)}</span><StampTag s={compareStamp(c)} /></div>
          ))}
        </div>
      )}
      <div className="rnote"><b>Decision rule.</b> A trend is reported as statistically significant when the raw Seasonal Mann-Kendall p-value is below α = 0.05 and the
        record covers at least 10 years and 70% of months. A non-significant result does not demonstrate the absence of change. Results describe past change; they are
        neither forecasts nor causal attributions.</div>
      <p className="rcap">{n} pages. {sci ? "Sections: abstract, results with figures and statistics, comparisons, methods and provenance, references." : "Sections: abstract, results, comparisons, methods, technical appendix and references."}</p>
    </section>
  );
}

function SimpleFinding({ p, a, i }: { p: EditionProps; a: AnalysisEntry; i: number }) {
  return (
    <section className="rpage" id={`rp-${a.key}`}>
      <Head m={p.m} title={`Result ${i + 1}`} />
      <div className="rrow" style={{ justifyContent: "space-between" }}><span className="rkicker">Result {i + 1}</span><StampTag s={trendStamp(a)} /></div>
      <h2>{p.headlines[a.key] || defaultHeadline(a)}</h2>
      <div className="rhero"><div className="rbig">{signedNum(a.slope)} <small>{a.units} per decade (seasonal Sen slope)</small></div>
        <span>{a.place} · {a.dataset} · {a.start} to {a.end}</span></div>
      <p>{resultStatement(a)}</p>
      <YearBars a={a} />
      <p className="rcap">Figure {i + 1}. Annual means of monthly anomalies (orange above, blue below the long-term monthly mean) with the seasonal Sen trend
        ({a.significant ? "solid: significant" : "dashed: not significant"}). Annual means are shown for readability; the test uses all {a.nMonths} monthly values.</p>
      <h3>Strength of evidence</h3>
      <PMeter a={a} />
      <AuthorNote text={p.notes[a.key]} />
      <p className="rdisc">Region: box W {a.bbox[0]}°, S {a.bbox[1]}°, E {a.bbox[2]}°, N {a.bbox[3]}° ({a.gridDeg}° grid). Data: {a.product} v{a.version}, {a.provider}.
        Full statistics: technical appendix.</p>
    </section>
  );
}

function ScientistFinding({ p, a, i }: { p: EditionProps; a: AnalysisEntry; i: number }) {
  return (
    <section className="rpage" id={`rp-${a.key}`}>
      <Head m={p.m} title={`Result ${i + 1}`} />
      <div className="rrow" style={{ justifyContent: "space-between" }}><span className="rkicker">Result {i + 1}</span><StampTag s={trendStamp(a)} /></div>
      <h2>{p.headlines[a.key] || defaultHeadline(a)}</h2>
      <div className="rhero"><div className="rbig">{signedNum(a.slope)} <small>{a.units} per decade</small></div>
        <span className="rbig" style={{ fontSize: "15pt" }}>p {pText(a.pRaw)} <small>raw Seasonal MK</small></span></div>
      <p>{resultStatement(a)}</p>
      <ReportChart units={a.units} height={190} lines={[{ series: a.series, trend: a.trend, color: "#3d3850" }]} />
      <p className="rcap">Figure {i + 1}. Monthly anomalies (deviation from the long-term mean of each calendar month) and the seasonal Sen trend drawn through the
        mean anomaly ({a.significant ? "solid: significant" : "dashed: not significant"}). Estimated past trend, not a forecast.</p>
      <div className="rcols">
        <div>
          <h3>Used for the verdict</h3>
          <KV rows={[
            ["Seasonal Sen slope", `${signedNum(a.slope)} ${a.units} per decade`],
            ["Raw Seasonal MK p", `${pText(a.pRaw)} (α = ${a.alpha})`],
            ["Sufficiency", a.sufficient ? `${a.nMonths} months, ${a.missingMonths} missing` : "not met"],
          ]} />
          <h3>Context only</h3>
          <KV rows={[
            ["Adjusted p (Hamed-Rao)", `${pText(a.pAdjusted)}, diagnostic`],
            ["OLS anomaly slope, 95% interval", a.olsInterval ? `${num(a.olsInterval[0])} to ${num(a.olsInterval[1])}; not a Sen confidence interval` : "n/a"],
          ]} />
        </div>
        <div>
          <LocatorMap boxes={[{ bbox: a.bbox, label: a.place, color: "#c4462f" }]} height={170} />
          <p className="rcap">Study region: {a.regionKind === "preset" ? `catalog preset "${a.regionId}"` : "bounding-box approximation"}, W {a.bbox[0]}°, S {a.bbox[1]}°,
            E {a.bbox[2]}°, N {a.bbox[3]}°; {a.gridDeg}° processed grid (native {a.nativeDeg}°); {a.coveragePct}% of the area with data. Product {a.product} v{a.version}, {a.provider}.</p>
        </div>
      </div>
      {a.warnings.length > 0 && <ul className="rwarn">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <AuthorNote text={p.notes[a.key]} />
    </section>
  );
}

function Comparison({ p, c, i }: { p: EditionProps; c: ComparisonEntry; i: number }) {
  const sci = p.edition === "scientist";
  const d = c.test?.difference;
  const pOk = d?.p_value != null && d.p_value < 0.05;
  const ivOk = !!d?.ci && (d.ci[0] > 0 || d.ci[1] < 0);
  return (
    <section className="rpage" id={`rp-${c.key}`}>
      <Head m={p.m} title={`Comparison ${i + 1}`} />
      <div className="rrow" style={{ justifyContent: "space-between" }}><span className="rkicker">Comparison {i + 1}</span><StampTag s={compareStamp(c)} /></div>
      <h2>{compareHeadline(c)}</h2>
      <div className="rcols">
        <div className="rcard"><span>A: {c.a.label} ({c.a.dataset})</span><div className="rbig">{signedNum(c.a.trend.slope_per_decade)} <small>{c.units} per decade</small></div></div>
        <div className="rcard"><span>B: {c.b.label} ({c.b.dataset})</span><div className="rbig">{signedNum(c.b.trend.slope_per_decade)} <small>{c.units} per decade</small></div></div>
      </div>
      {c.kind === "regions" && d ? (
        <div className="rnote">
          <b>Criteria for a significant difference (both required)</b>
          <ul>
            <li>{pOk ? "Met" : "Not met"}: block-bootstrap p = {pText(d.p_value)} (required below 0.05).</li>
            <li>{ivOk ? "Met" : "Not met"}: the 95% interval of the difference{d.ci ? ` (${num(d.ci[0])} to ${num(d.ci[1])} ${c.units} per decade)` : ""} {ivOk ? "excludes" : "includes"} zero.</li>
          </ul>
        </div>
      ) : <div className="rnote"><b>Descriptive comparison.</b> No statistical test of a difference between two datasets is implemented; neither product is treated as ground truth.</div>}
      <p>{compareStatement(c)}</p>
      {sci && (
        <>
          <ReportChart units={c.units} height={160} lines={[
            { series: c.a.series, trend: c.a.trend, color: "#2b2540", label: "A" },
            { series: c.b.series, trend: c.b.trend, color: "#8d86a0", dash: true, label: "B" },
          ]} />
          <p className="rcap">Figure C{i + 1}. Monthly anomalies, A solid and B dashed, with each seasonal Sen trend.</p>
          <table className="rtable">
            <thead><tr><th scope="col">Statistic</th><th scope="col">A: {c.a.label}</th><th scope="col">B: {c.b.label}</th></tr></thead>
            <tbody>
              <tr><th scope="row">Raw Seasonal MK p</th><td>{pText(c.a.trend.p_value)}</td><td>{pText(c.b.trend.p_value)}</td></tr>
              <tr><th scope="row">Period</th><td>{c.a.trend.start} to {c.a.trend.end}</td><td>{c.b.trend.start} to {c.b.trend.end}</td></tr>
              <tr><th scope="row">Months with data</th><td>{c.a.trend.quality.n_months}</td><td>{c.b.trend.quality.n_months}</td></tr>
            </tbody>
          </table>
        </>
      )}
      <div className="rcols">
        <div><h3>Points of agreement</h3><ul>{(c.agrees.length ? c.agrees : ["None in the compared statistics."]).map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h3>Limits of inference</h3><ul>{c.cannotConclude.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
    </section>
  );
}

function SimpleClosing({ p }: { p: EditionProps }) {
  const { m } = p;
  return (
    <section className="rpage">
      <Head m={m} title="Methods and technical appendix" />
      <h2>Methods</h2>
      <p>Monthly values of each NASA product are averaged over the study region on a common processed grid. The seasonal cycle is removed by subtracting the
        long-term mean of each calendar month. The Seasonal Mann-Kendall test (Hirsch et al., 1982) assesses monotonic trend at α = 0.05, and the seasonal Sen
        slope (Sen, 1968) estimates its rate per decade. Region comparisons use a block-bootstrap test of the difference of slopes.</p>
      <h2>Limitations</h2>
      <ul>{m.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      <h2>Technical appendix</h2>
      <p className="rcap">Table A1. Full statistics. The verdict uses the raw Seasonal Mann-Kendall p; the adjusted p is a diagnostic only; the interval is for the OLS
        slope of anomalies and is not a Sen confidence interval.</p>
      <table className="rtable">
        <thead><tr><th scope="col" style={{ width: "34%" }}>Finding</th><th scope="col">Sen slope per decade</th><th scope="col">Raw p</th><th scope="col">Adjusted p</th><th scope="col">OLS 95% interval</th><th scope="col">Months</th></tr></thead>
        <tbody>{m.analyses.map((a) => (
          <tr key={a.key}><td>{a.parameter}, {a.place} ({a.dataset}, {a.start} to {a.end})</td><td>{signedNum(a.slope)} {a.units}</td><td>{pText(a.pRaw)}</td>
            <td>{pText(a.pAdjusted)}</td><td>{a.olsInterval ? `${num(a.olsInterval[0])} to ${num(a.olsInterval[1])}` : "n/a"}</td><td>{a.nMonths}</td></tr>
        ))}</tbody>
      </table>
      <h3>Terms</h3>
      <KV rows={[
        ["Anomaly", "Monthly value minus the long-term mean of the same calendar month."],
        ["Sen slope", "Median of pairwise slopes within each calendar month, expressed per decade; robust to outliers."],
        ["p-value", "Probability, under the hypothesis of no trend and the test assumptions, of a statistic at least as extreme as observed. Not the probability that the hypothesis is true."],
        ["Statistical significance", "p below α = 0.05; distinct from practical importance and from causation."],
      ]} />
      <h3>Data and references</h3>
      <ul className="rrefs">
        {m.datasets.map((d) => <li key={d.product}>{d.product} v{d.version}. {d.provider}. {d.url}</li>)}
        {REFERENCES.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <p className="rdisc">Terra-scope AI is a student project for the NASA Space Apps Challenge 2026. It is not an official NASA product, and NASA does not endorse it.</p>
    </section>
  );
}

function References({ m }: { m: ReportModel }) {
  return (
    <section className="rpage">
      <Head m={m} title="References" />
      <h2>References</h2>
      <h3>Data</h3>
      <ul className="rrefs">{m.datasets.map((d) => <li key={d.product}>{d.product} v{d.version}. {d.provider}. {d.url}</li>)}</ul>
      <h3>Methods</h3>
      <ul className="rrefs">{REFERENCES.map((r) => <li key={r}>{r}</li>)}</ul>
    </section>
  );
}

export function pageCount(m: ReportModel, edition: Edition): number {
  return 1 + m.analyses.length + m.comparisons.length + (edition === "scientist" ? 2 : 1);
}

export function EditionDoc(p: EditionProps) {
  const sci = p.edition === "scientist";
  const n = pageCount(p.m, p.edition);
  return (
    <article className="report-doc" aria-label={sci ? "Scientist edition report" : "Simple edition report"}>
      <Cover p={p} n={n} />
      {p.m.analyses.map((a, i) => sci ? <ScientistFinding key={a.key} p={p} a={a} i={i} /> : <SimpleFinding key={a.key} p={p} a={a} i={i} />)}
      {p.m.comparisons.map((c, i) => <Comparison key={c.key} p={p} c={c} i={i} />)}
      {sci ? <><MethodsPage m={p.m} /><References m={p.m} /></> : <SimpleClosing p={p} />}
    </article>
  );
}
