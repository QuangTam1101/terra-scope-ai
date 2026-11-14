// Printed report, two editions of ONE report model (same numbers, same verdicts):
// - Explorer: plain language for readers without a statistics background (The discovery, The evidence, Behind the
//   discovery; optional technical appendix with the glossary and full references).
// - Scientist: research summary, results with full statistics and figures, methods, provenance, references.
// Every number comes from the ReportModel (backend evidence). User-authored text (title, author, finding titles,
// notes) is printed as plain text (React escapes it) and labelled as the author's, never as evidence.
import { Terra } from "../ui";
import { Head, KV, LocatorMap, ReportChart } from "./ReportDoc";
import { num, pText, signedNum, type AnalysisEntry, type ComparisonEntry, type ReportModel } from "./model";
import {
  abstractText, cellSizeKm, compareHeadline, compareStamp, compareStatement, CONCEPTS, defaultHeadline, defaultReportTitle, explorerConcepts, explorerHeadline, GLOSSARY,
  linearProjection, plainCompare, plainFinding, plainWords, productKind, REFERENCES, resultStatement, SHORT_REFS, testOutcome, trendStamp, yearlyMeans,
  type Edition, type Stamp,
} from "./formd";

declare const __GIT_REV__: string;
const GIT_REV = typeof __GIT_REV__ === "string" ? __GIT_REV__ : "unknown";

export interface EditionProps {
  m: ReportModel; edition: Edition; title: string; author: string;
  headlines: Record<string, string>; notes: Record<string, string>; appendix?: boolean;
}

const StampTag = ({ s }: { s: Stamp }) => <span className={`badge rstamp ${s.cls}`}>{s.text}</span>;
const titleOf = (p: EditionProps) => p.title.trim() || defaultReportTitle(p.m);
const headOf = (p: EditionProps, a: AnalysisEntry) => p.headlines[a.key]?.trim() || (p.edition === "scientist" ? defaultHeadline(a) : explorerHeadline(a));
/** Long user titles get a smaller size so the cover keeps its content on one page. */
const titleCls = (t: string) => `ruser${t.length > 110 ? " rtitle-xl" : t.length > 60 ? " rtitle-l" : ""}`;
const Link = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

const AuthorNote = ({ text }: { text?: string }) =>
  text?.trim() ? <div className="rauthor"><b>Author note</b> <span className="rauthor-tag">written by the report author, not part of the evidence</span><p className="ruser">{text.trim()}</p></div> : null;

function Refs({ m }: { m: ReportModel }) {
  return (
    <>
      <h3>Data</h3>
      <ul className="rrefs">{m.datasets.map((d) => <li key={d.product}>{d.product} v{d.version}. {d.provider}. <Link href={d.url}>{d.url}</Link></li>)}</ul>
      <h3>Methods</h3>
      <ul className="rrefs">{REFERENCES.map((r) => <li key={r.text}>{r.text}{r.doi && <> <Link href={`https://doi.org/${r.doi}`}>https://doi.org/{r.doi}</Link></>}</li>)}</ul>
    </>
  );
}

/** Explorer figure: one bar per year (yearly mean of the monthly anomalies) and the reported Sen trend. */
function YearBars({ a }: { a: AnalysisEntry }) {
  const ys = yearlyMeans(a.series);
  if (ys.length < 2) return <p className="rcap">Too few complete years to draw the yearly chart.</p>;
  const W = 720, H = 230, PL = 66, PR = 10, PT = 14, PB = 46;
  const max = Math.max(...ys.map((y) => Math.abs(y.value)), 1e-9) * 1.15;
  const bw = (W - PL - PR) / ys.length;
  const Y = (v: number) => PT + (1 - (v + max) / (2 * max)) * (H - PT - PB);
  const mean = ys.reduce((s, y) => s + y.value, 0) / ys.length, mid = (ys[0].year + ys[ys.length - 1].year) / 2;
  const line = (yr: number) => mean + ((a.slope ?? 0) / 10) * (yr - mid);
  const up = (a.slope ?? 0) >= 0;
  const tick = (v: number) => `${v > 0 ? "+" : ""}${num(v, Math.abs(v) >= 10 ? 0 : 1)}`;
  return (
    <svg className="rchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Each year compared with the usual level, ${ys[0].year} to ${ys[ys.length - 1].year}, with the estimated long-term trend`}>
      {[max * 0.8, 0, -max * 0.8].map((v) => (
        <g key={v}><line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? "#8a8399" : "#ece8f1"} strokeWidth={v === 0 ? 1.2 : 0.8} />
          <text x={PL - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="#3d3850">{v === 0 ? "usual" : tick(v)}</text></g>
      ))}
      {ys.map((y, i) => {
        const x = PL + i * bw + bw * 0.15, top = Math.min(Y(y.value), Y(0)), h = Math.abs(Y(y.value) - Y(0));
        return <rect key={y.year} x={x} y={top} width={bw * 0.7} height={Math.max(1, h)} rx={2} fill={y.value >= 0 ? "#f5b98a" : "#9cc6ef"} />;
      })}
      {a.slope !== null && a.sufficient && <line x1={PL + bw / 2} y1={Y(line(ys[0].year))} x2={PL + (ys.length - 0.5) * bw} y2={Y(line(ys[ys.length - 1].year))}
        stroke={up ? "#c4621a" : "#2f6fb3"} strokeWidth={3} strokeLinecap="round" strokeDasharray={a.significant ? undefined : "9 6"} />}
      {ys.filter((_, i) => i % Math.max(1, Math.ceil(ys.length / 7)) === 0 || i === ys.length - 1).map((y) => (
        <text key={y.year} x={PL + ys.indexOf(y) * bw + bw / 2} y={H - 26} textAnchor="middle" fontSize="11" fill="#3d3850">{y.year}</text>
      ))}
      <text x={(PL + W - PR) / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#2b2540">Year</text>
      {(() => {
        // Never clipped: centred on the whole chart and squeezed when longer than its height.
        const lab = `Compared with usual (${a.units})`, avail = H - 8, fit = lab.length * 6.6 > avail;
        return <text x={14} y={H / 2} fontSize="11.5" fontWeight="700" fill="#2b2540" textAnchor="middle"
          textLength={fit ? avail : undefined} lengthAdjust={fit ? "spacingAndGlyphs" : undefined}
          transform={`rotate(-90 14 ${H / 2})`}>{lab}</text>;
      })()}
    </svg>
  );
}

function Legend({ a }: { a: AnalysisEntry }) {
  const w = plainWords(a.parameter);
  return (
    <ul className="rlegend" aria-label="How to read the chart">
      <li><span className="sw" style={{ background: "#f5b98a" }} />Orange bar: a year that was {w.up} than usual</li>
      <li><span className="sw" style={{ background: "#9cc6ef" }} />Blue bar: a year that was {w.down} than usual</li>
      {a.sufficient && a.slope !== null && <li><span className="sw line" style={{ borderColor: (a.slope ?? 0) >= 0 ? "#c4621a" : "#2f6fb3", borderStyle: a.significant ? "solid" : "dashed" }} />
        Line: the estimated long-term trend ({a.significant ? "solid because the test supports it" : "dashed because the test does not confirm it"})</li>}
    </ul>
  );
}

function Outcome({ a }: { a: AnalysisEntry }) {
  const o = testOutcome(a);
  return (
    <div className={`routcome ${o.met === true ? "met" : o.met === false ? "notmet" : "none"}`}>
      <span className="routcome-k">Statistical test outcome</span>
      <b>{o.title}</b>
      <p>{o.detail}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Explorer edition */
// "Show first, explain second": The discovery (cover), The evidence (one page per finding), Behind the discovery
// (how it was done, key ideas, what it cannot tell us, sources). Dynamic pagination; the technical appendix is optional.

type IconName = "data" | "region" | "seasons" | "test" | "past" | "why" | "limits" | "up" | "down" | "flat" | "none";

/** Small original line icons (no product or instrument artwork, so nothing implies the wrong data source). */
export function XIcon({ name, size = 30 }: { name: IconName; size?: number }) {
  const c = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const d: Record<IconName, React.ReactNode> = {
    data: <><ellipse cx="16" cy="8" rx="10" ry="4" {...c} /><path d="M6 8v8c0 2.2 4.5 4 10 4s10-1.8 10-4V8M6 16v8c0 2.2 4.5 4 10 4s10-1.8 10-4v-8" {...c} /></>,
    region: <><path d="M4 7l8-3 8 3 8-3v21l-8 3-8-3-8 3z" {...c} /><rect x="10" y="11" width="11" height="8" rx="1" {...c} strokeDasharray="2 2" /></>,
    seasons: <><rect x="4" y="6" width="24" height="22" rx="3" {...c} /><path d="M4 12h24M10 3v6M22 3v6M10 18h3M19 18h3M10 23h3M19 23h3" {...c} /></>,
    test: <><path d="M16 4v24M8 28h16M5 10h22M5 10l-3 8h6zM27 10l-3 8h6z" {...c} /><path d="M2 18a3 2 0 006 0M24 18a3 2 0 006 0" {...c} /></>,
    past: <><circle cx="16" cy="16" r="11" {...c} /><path d="M16 9v7l5 3M5 6v5h5" {...c} /></>,
    why: <><circle cx="16" cy="16" r="11" {...c} /><path d="M12.5 12.5a3.5 3.5 0 117 0c0 2.5-3.5 3-3.5 5.5M16 22v.5" {...c} /></>,
    limits: <><path d="M16 4l12 22H4z" {...c} /><path d="M16 12v7M16 22.5v.5" {...c} /></>,
    up: <path d="M6 24l8-8 5 5 8-11M21 10h6v6" {...c} strokeWidth={2.6} />,
    down: <path d="M6 9l8 8 5-5 8 11M21 23h6v-6" {...c} strokeWidth={2.6} />,
    flat: <path d="M5 16h22M21 11l6 5-6 5" {...c} strokeWidth={2.6} />,
    none: <><circle cx="16" cy="16" r="11" {...c} /><path d="M10 16h12" {...c} /></>,
  };
  return <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" style={{ flex: "none" }}>{d[name]}</svg>;
}

export const dirIcon = (a: Pick<AnalysisEntry, "sufficient" | "slope">): "up" | "down" | "flat" | "none" =>
  !a.sufficient || a.slope === null ? "none" : a.slope > 0 ? "up" : a.slope < 0 ? "down" : "flat";
export const dirWord = (a: Pick<AnalysisEntry, "sufficient" | "slope">) =>
  (!a.sufficient || a.slope === null ? "Not tested" : a.slope > 0 ? "Rising" : a.slope < 0 ? "Falling" : "Level");

/** Short, cautious takeaway built from the verdicts only. */
export function takeaway(m: ReportModel): string {
  if (m.analyses.length === 1 && !m.comparisons.length) {
    const a = m.analyses[0], w = plainWords(a.parameter);
    if (!a.sufficient || a.slope === null) return `There is not enough data yet to judge whether ${w.noun} in ${a.place} is changing.`;
    if (a.significant) return `Over ${a.start.slice(0, 4)} to ${a.end.slice(0, 4)}, ${w.noun} in ${a.place} shows a ${a.slope > 0 ? "rising" : "falling"} trend that passes the statistical test. It tells us what changed, not why, and not what comes next.`;
    return `The estimated direction is ${a.slope >= 0 ? "upward" : "downward"}, but the evidence is not strong enough yet to call it a trend. A longer record may settle it.`;
  }
  return "Each finding has its own verdict. Read them one by one: a confirmed trend in one place says nothing about another place or another dataset.";
}

function RateBox({ a, size, wide, projection }: { a: AnalysisEntry; size: number; wide?: boolean; projection?: string | null }) {
  return (
    <div className={`xrate ${dirIcon(a)}${wide ? " wide" : ""}`}>
      <XIcon name={dirIcon(a)} size={size} />
      {a.slope !== null && a.sufficient
        ? <div><span className="xrate-k">{dirWord(a)} · estimated rate</span><span className="xrate-v">{signedNum(a.slope)} <small>{a.units} every 10 years</small></span>
          {projection && <span className="xproj">{projection}</span>}</div>
        : <div><span className="xrate-k">No rate estimated</span><span className="xrate-v"><small>at least 10 years and 70% of months are needed</small></span></div>}
    </div>
  );
}

function DiscoveryCard({ p, a }: { p: EditionProps; a: AnalysisEntry }) {
  const w = plainWords(a.parameter), single = p.m.analyses.length === 1;
  return (
    <div className={`xdisc${single ? " single" : " compact"}`}>
      <div className="xdisc-main">
        <div className="rrow" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}><b className="ruser xdisc-h">{headOf(p, a)}</b><StampTag s={trendStamp(a)} /></div>
        <p>{plainFinding(a)}</p>
        <RateBox a={a} size={single ? 40 : 30} />
        <span className="small">{w.noun[0].toUpperCase() + w.noun.slice(1)} · {a.start.slice(0, 4)} to {a.end.slice(0, 4)} · {a.dataset}</span>
      </div>
      {single && <figure className="xdisc-map">
        <LocatorMap boxes={[{ bbox: a.bbox, label: a.place, color: "#c4462f" }]} height={250} />
        <figcaption className="rcap">Study area: {a.place} (box {a.bbox[1]}° to {a.bbox[3]}° latitude, {a.bbox[0]}° to {a.bbox[2]}° longitude).</figcaption>
      </figure>}
    </div>
  );
}

/** One map for all study areas (several findings): each area once, labelled. */
function AllAreasMap({ m }: { m: ReportModel }) {
  const seen = new Map<string, AnalysisEntry>();
  for (const a of m.analyses) if (!seen.has(a.bbox.join(","))) seen.set(a.bbox.join(","), a);
  const areas = [...seen.values()];
  return (
    <figure className="rfig">
      <LocatorMap boxes={areas.map((a) => ({ bbox: a.bbox, label: a.place, color: "#c4462f" }))} height={150} />
      <figcaption className="rcap">Study areas: {areas.map((a) => `${a.place} (${a.bbox[1]}° to ${a.bbox[3]}° latitude, ${a.bbox[0]}° to ${a.bbox[2]}° longitude)`).join("; ")}.</figcaption>
    </figure>
  );
}

function ExplorerCover({ p }: { p: EditionProps }) {
  const { m } = p;
  const regions = [...new Set(m.analyses.map((a) => a.place))].join(", ");
  const span = m.analyses.length ? `${m.analyses.map((a) => a.start.slice(0, 4)).sort()[0]} to ${m.analyses.map((a) => a.end.slice(0, 4)).sort().at(-1)}` : "";
  return (
    <section className="rpage rcover xcover">
      <Head m={m} title="Explorer report" />
      <span className="rkicker">The discovery</span>
      <p className="xquestion">What changed in this part of Earth?</p>
      <div className="rtitle"><Terra size={58} />
        <div><h1 className={titleCls(titleOf(p))}>{titleOf(p)}</h1>
          <p>{p.author.trim() && <span className="ruser">{p.author.trim()} · </span>}{m.generatedAt.slice(0, 10)} · Preliminary, not peer reviewed</p></div>
      </div>
      <KV rows={[
        ...(regions ? [["Where", regions] as [string, string]] : []), ...(span ? [["When", span] as [string, string]] : []),
        ["NASA data", m.datasets.map((d) => `${d.product} v${d.version} (${productKind(d.product).kind.toLowerCase()})`).join("; ") || "n/a"],
      ]} />
      {m.analyses.length > 1 && <AllAreasMap m={m} />}
      <div className={m.analyses.length > 1 ? "xdisc-grid" : "col"}>{m.analyses.map((a) => <DiscoveryCard key={a.key} p={p} a={a} />)}</div>
      {m.comparisons.map((c) => (
        <div key={c.key} className="rfinding">
          <div className="rrow" style={{ justifyContent: "space-between" }}><b>{c.a.label} compared with {c.b.label}</b><StampTag s={compareStamp(c)} /></div>
          <p>{plainCompare(c)}</p>
        </div>
      ))}
      <div className="xtake"><b>Takeaway</b><p>{takeaway(m)}</p></div>
    </section>
  );
}

/** Grid-cell size in words: north-south is fixed; east-west depends on latitude, so a tall area gets a range. */
export function cellSizeText(a: Pick<AnalysisEntry, "gridDeg" | "bbox">): string {
  if (!Number.isFinite(a.gridDeg)) return "see product page";
  const [s, n] = [a.bbox[1], a.bbox[3]];
  const near = s <= 0 && n >= 0 ? 0 : Math.min(Math.abs(s), Math.abs(n)), far = Math.max(Math.abs(s), Math.abs(n));
  const a0 = cellSizeKm(a.gridDeg, near), a1 = cellSizeKm(a.gridDeg, far);
  return a0.ew - a1.ew <= 5
    ? `${a.gridDeg}° cells, about ${a0.ns} km by ${a0.ew} km here (north-south by east-west)`
    : `${a.gridDeg}° cells, about ${a0.ns} km north-south; east-west from about ${a0.ew} km down to ${a1.ew} km across this area`;
}

export function qualityChips(a: AnalysisEntry): [string, string][] {
  return [
    ["Months with data", `${a.nMonths}${a.missingMonths ? ` (${a.missingMonths} missing)` : " (none missing)"}`],
    ["Area with data", `${a.coveragePct}% on average`],
    ["Kind of data", productKind(a.product).kind],
    ["Map squares", cellSizeText(a)],
  ];
}

function ExplorerFinding({ p, a, i }: { p: EditionProps; a: AnalysisEntry; i: number }) {
  const w = plainWords(a.parameter);
  return (
    <section className="rpage" id={`rp-${a.key}`}>
      <Head m={p.m} title={`Finding ${i + 1}: the evidence`} />
      <div className="rrow" style={{ justifyContent: "space-between" }}><span className="rkicker">The evidence · finding {i + 1}</span><StampTag s={trendStamp(a)} /></div>
      <h2 className="ruser">{headOf(p, a)}</h2>
      <p className="rlead">{plainFinding(a)}</p>
      <RateBox a={a} size={34} wide projection={linearProjection(a)} />
      <figure className="rfig">
        <YearBars a={a} />
        <figcaption className="rcap">Figure {i + 1}. Each bar shows how one year compared with the usual {w.noun} for {a.place} (the usual value of each
          calendar month over {a.start.slice(0, 4)} to {a.end.slice(0, 4)}). The line summarises the estimated long-term trend. Yearly bars are for reading only;
          the test uses all {a.nMonths} monthly values.</figcaption>
      </figure>
      <Legend a={a} />
      <Outcome a={a} />
      <dl className="xchips" aria-label="Data quality">{qualityChips(a).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="small">Source: {a.dataset} ({a.product} v{a.version}, {a.provider}).</p>
      {a.warnings.length > 0 && <ul className="rwarn">{a.warnings.map((x) => <li key={x}>{x}</li>)}</ul>}
      <AuthorNote text={p.notes[a.key]} />
    </section>
  );
}

function ExplorerComparison({ p, c, i }: { p: EditionProps; c: ComparisonEntry; i: number }) {
  return (
    <section className="rpage" id={`rp-${c.key}`}>
      <Head m={p.m} title={`Comparison ${i + 1}`} />
      <div className="rrow" style={{ justifyContent: "space-between" }}><span className="rkicker">Comparison {i + 1}</span><StampTag s={compareStamp(c)} /></div>
      <h2>{c.a.label} compared with {c.b.label}</h2>
      <p className="rlead">{plainCompare(c)}</p>
      <div className="rcols">
        <div className="rcard"><span>{c.a.label} ({c.a.dataset})</span><div className="rbig">{signedNum(c.a.trend.slope_per_decade)} <small>{c.units} every 10 years</small></div></div>
        <div className="rcard"><span>{c.b.label} ({c.b.dataset})</span><div className="rbig">{signedNum(c.b.trend.slope_per_decade)} <small>{c.units} every 10 years</small></div></div>
      </div>
      {c.kind === "regions" && <LocatorMap height={170} boxes={[{ bbox: c.a.trend.region.bbox, label: "A", color: "#c4621a" }, { bbox: c.b.trend.region.bbox, label: "B", color: "#2f6fb3" }]} />}
      <h3>What this comparison cannot tell us</h3>
      <ul>{c.cannotConclude.map((x) => <li key={x}>{x}</li>)}</ul>
    </section>
  );
}

/** Mini visuals for the workflow steps: schematic drawings that carry no data values. */
function MiniVisual({ step }: { step: 1 | 2 | 3 | 4 }) {
  if (step === 1) return (
    <svg viewBox="0 0 160 44" className="xmini" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={6 + i * 12.5} y={6} width={10} height={26} rx={2} fill={i % 3 === 0 ? "#d9d2ea" : "#ece8f3"} />)}
    </svg>);
  if (step === 2) return (
    <svg viewBox="0 0 160 44" className="xmini" aria-hidden="true">
      {Array.from({ length: 4 }, (_, r) => Array.from({ length: 10 }, (_, c) => <rect key={`${r}-${c}`} x={10 + c * 14} y={3 + r * 9.5} width={13} height={8.5} fill="#ece8f3" />))}
      <rect x={51} y={12} width={56} height={19} fill="#c4462f" fillOpacity={0.12} stroke="#c4462f" strokeWidth={1.8} strokeDasharray="3 2" />
    </svg>);
  if (step === 3) return (
    <svg viewBox="0 0 160 44" className="xmini" aria-hidden="true">
      {[0, 1, 2].map((y) => <g key={y}>{[8, 12, 20, 28, 32, 28, 20, 12, 8, 6].map((h, i) => <rect key={i} x={6 + y * 51 + i * 4.8} y={40 - h} width={3.6} height={h} fill={i === 4 ? "#7d6fb0" : "#d9d2ea"} />)}</g>)}
      <path d="M27.4 6 Q78 0 129.4 6" fill="none" stroke="#7d6fb0" strokeWidth={1.3} strokeDasharray="2 2" />
    </svg>);
  return (
    <svg viewBox="0 0 160 44" className="xmini" aria-hidden="true">
      <rect x={10} y={14} width={140} height={10} rx={5} fill="#ece8f3" />
      <rect x={10} y={14} width={12} height={10} rx={5} fill="#7d6fb0" />
      <path d="M22 9v20" stroke="#2b2540" strokeWidth={1.5} />
    </svg>);
}

export const WORKFLOW = (m: ReportModel) => {
  const products = m.datasets.length === 1 ? `${m.datasets[0].product} (${productKind(m.datasets[0].product).kind.toLowerCase()})`
    : m.datasets.length ? `${m.datasets.length} NASA products: ${m.datasets.map((d) => d.product).join(", ")}` : "a NASA Earth-system product";
  return [
    { icon: "data" as const, title: "Start with NASA Earth data", text: `This study uses monthly values from ${products}.` },
    { icon: "region" as const, title: "Focus on your region", text: `The ${m.analyses[0]?.gridDeg ?? 0.5}° map squares inside the study box are averaged; squares nearer the equator count more because they cover more ground.` },
    { icon: "seasons" as const, title: "Look beyond the seasons", text: "Each January is compared only with other Januaries, each July with other Julys, so the yearly cycle is not mistaken for a trend." },
    { icon: "test" as const, title: "Check whether the pattern is convincing", text: "The Seasonal Mann-Kendall test asks how unusual this pattern would be with no trend. A p-value below 0.05 means significant." },
  ];
};

function ExplorerClosing({ p }: { p: EditionProps }) {
  const { m } = p;
  const concepts = explorerConcepts(m);
  return (
    <section className="rpage xbehind">
      <Head m={m} title="Behind the discovery" />
      <span className="rkicker">Behind the discovery</span>
      <h2>How did NASA Earth data become this finding?</h2>
      <ol className="xsteps">
        {WORKFLOW(m).map((s, i) => (
          <li key={s.title}>
            <div className="xstep-top"><span className="xnum">{i + 1}</span><XIcon name={s.icon} size={26} /></div>
            <b>{s.title}</b>
            <p>{s.text}</p>
            <MiniVisual step={(i + 1) as 1 | 2 | 3 | 4} />
          </li>
        ))}
      </ol>
      <h3>Science made simple</h3>
      <div className="xconcepts">{concepts.map((k) => <div key={k}><b>{CONCEPTS[k].title}</b><p>{CONCEPTS[k].text}</p></div>)}</div>
      <h3>What this finding cannot tell us</h3>
      <div className="xcannot">
        <div><XIcon name="past" size={24} /><p><b>Past, not future.</b> It describes change that already happened; it is not a forecast.</p></div>
        <div><XIcon name="why" size={24} /><p><b>What, not why.</b> It cannot establish what caused the change.</p></div>
        <div><XIcon name="limits" size={24} /><p><b>Data and methods have limits.</b> The area is a box on a map grid, and different NASA products can give different answers.</p></div>
      </div>
      <ul className="xkeep">
        {m.datasets.map((d) => <li key={d.product}><b>{d.product}</b> is {productKind(d.product).plain}.</li>)}
        <li>Results are preliminary and have not been peer reviewed.</li>
      </ul>
      <div className="xsources">
        <h3>Sources</h3>
        <p><b>Data.</b> {m.datasets.map((d, i) => <span key={d.product}>{i > 0 && "; "}{d.product} v{d.version}, {d.provider}, <Link href={d.url}>{d.url.replace(/^https?:\/\//, "")}</Link></span>)}.</p>
        <p><b>Methods.</b> {SHORT_REFS.map((r, i) => <span key={r.label}>{i > 0 && "; "}{r.doi ? <Link href={`https://doi.org/${r.doi}`}>{r.label}</Link> : r.label} ({r.what})</span>)}.
          {p.appendix ? " Full references are in the technical appendix." : " Full references are listed in the Scientist edition."}</p>
        <p><b>Explore this analysis in Terra-scope AI.</b> Reopen the saved case file on the app's Report page to recompute these results from the same NASA data.</p>
        <p className="xdisc-note">Small drawings on this page are schematic and contain no data. Terra-scope AI is a student project for the NASA Space Apps Challenge 2026. It is not an official NASA product, and NASA does not endorse it.</p>
      </div>
      
    </section>
  );
}

function ExplorerAppendix({ m }: { m: ReportModel }) {
  return (
    <section className="rpage">
      <Head m={m} title="Technical appendix" />
      <h2>Technical appendix</h2>
      <p className="rcap">Table A1. Full statistics. The verdict uses the raw Seasonal Mann-Kendall p-value; the adjusted p-value is a diagnostic only; the interval is the
        95% CI for the OLS anomaly slope, a different estimator from the Sen slope.</p>
      <table className="rtable">
        <thead><tr><th scope="col" style={{ width: "30%" }}>Finding</th><th scope="col">Sen slope per decade</th><th scope="col">Raw p (verdict)</th><th scope="col">Adjusted p (diagnostic)</th><th scope="col">95% CI for the OLS anomaly slope</th><th scope="col">Months</th></tr></thead>
        <tbody>{m.analyses.map((a) => (
          <tr key={a.key}><td>{a.parameter}, {a.place} ({a.dataset}, {a.start} to {a.end})</td><td>{signedNum(a.slope)} {a.units}</td><td>{pText(a.pRaw)}</td>
            <td>{pText(a.pAdjusted)}</td><td>{a.olsInterval ? `${num(a.olsInterval[0])} to ${num(a.olsInterval[1])}` : "n/a"}</td><td>{a.nMonths}</td></tr>
        ))}</tbody>
      </table>
      <h3>Glossary</h3>
      <dl className="rgloss">{GLOSSARY.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h3>References</h3>
      <Refs m={m} />
    </section>
  );
}

/* ---------------------------------------------------------------- Scientist edition */
function researchQuestion(m: ReportModel): string {
  if (m.analyses.length === 1) {
    const a = m.analyses[0];
    return `Did ${a.parameter.toLowerCase()} in ${a.place} change monotonically between ${a.start} and ${a.end} (${a.product} v${a.version})?`;
  }
  return `Did the selected variables change monotonically over the study periods in the selected regions, and do trends differ between the compared regions or products?`;
}

function ScientistCover({ p }: { p: EditionProps }) {
  const { m } = p;
  return (
    <section className="rpage rcover">
      <Head m={m} title="Scientist report" />
      <div className="rtitle"><Terra size={58} />
        <div><h1 className={titleCls(titleOf(p))}>{titleOf(p)}</h1>
          <p>{p.author.trim() && <span className="ruser">{p.author.trim()} · </span>}Preliminary, not peer reviewed</p></div>
      </div>
      <KV rows={[
        ["Research question", researchQuestion(m)],
        ["Report ID", m.id],
        ["Generated", `${m.generatedAt.slice(0, 19).replace("T", " ")} UTC`],
        ["Datasets", m.datasets.map((d) => `${d.product} v${d.version} (${d.provider})`).join("; ") || "n/a"],
        ["Regions", [...new Set(m.analyses.map((a) => a.place))].join("; ") || "see comparisons"],
        ["Study periods", [...new Set(m.analyses.map((a) => `${a.start} to ${a.end}`))].join("; ") || "see comparisons"],
      ]} />
      <h2>Abstract</h2>
      <p className="rabstract">{abstractText(m)}</p>
      <h2>Table 1. Summary of findings</h2>
      <table className="rtable">
        <thead><tr><th scope="col" style={{ width: "40%" }}>Finding</th><th scope="col">Sen slope per decade</th><th scope="col">Raw p</th><th scope="col">n (months)</th><th scope="col" style={{ width: "19%" }}>Verdict</th></tr></thead>
        <tbody>
          {m.analyses.map((a) => (
            <tr key={a.key}><td>{a.parameter}, {a.place} ({a.dataset}, {a.start} to {a.end})</td><td>{signedNum(a.slope)} {a.units}</td><td>{pText(a.pRaw)}</td><td>{a.nMonths}</td><td><StampTag s={trendStamp(a)} /></td></tr>
          ))}
          {m.comparisons.map((c) => (
            <tr key={c.key}><td>{c.title}</td><td>{c.test ? `${signedNum(c.test.difference.slope_diff_per_decade)} ${c.units} (A minus B)` : "n/a"}</td><td>{c.test ? pText(c.test.difference.p_value) : "n/a"}</td><td>n/a</td><td><StampTag s={compareStamp(c)} /></td></tr>
          ))}
        </tbody>
      </table>
      <div className="rnote"><b>Decision rule.</b> A trend is reported as statistically significant when the raw Seasonal Mann-Kendall p-value is below α = 0.05 and the
        record covers at least 10 years and 70% of months. A non-significant result does not demonstrate the absence of change. Results describe past change; they are
        neither forecasts nor causal attributions. Statistical significance is not practical importance.</div>
    </section>
  );
}

function ScientistFinding({ p, a, i }: { p: EditionProps; a: AnalysisEntry; i: number }) {
  return (
    <section className="rpage" id={`rp-${a.key}`}>
      <Head m={p.m} title={`Result ${i + 1}`} />
      <div className="rrow" style={{ justifyContent: "space-between" }}><span className="rkicker">Result {i + 1}</span><StampTag s={trendStamp(a)} /></div>
      <h2 className="ruser">{headOf(p, a)}</h2>
      <div className="rhero"><div className="rbig">{signedNum(a.slope)} <small>{a.units} per decade (seasonal Sen slope)</small></div>
        <span className="rbig" style={{ fontSize: "15pt" }}>p {pText(a.pRaw)} <small>raw Seasonal MK</small></span></div>
      <p>{resultStatement(a)}</p>
      <figure className="rfig">
        <ReportChart units={a.units} height={160} yLabel={`Monthly anomaly (${a.units})`} lines={[{ series: a.series, trend: a.trend, color: "#3d3850" }]} />
        <figcaption className="rcap">Figure {i + 1}. Monthly anomalies (deviation from the {a.start.slice(0, 4)} to {a.end.slice(0, 4)} mean of each calendar month) for {a.place},
          {" "}{a.product} v{a.version}. The straight line has the reported seasonal Sen slope and is drawn through the mean anomaly for display ({a.significant ? "solid: significant" : "dashed: not significant"}).
          Estimated past trend, not a forecast.</figcaption>
      </figure>
      <div className="rcols rdense">
        <div>
          <h3>Used for the verdict</h3>
          <KV rows={[
            ["Seasonal Sen slope", `${signedNum(a.slope)} ${a.units} per decade`],
            ["Raw Seasonal MK p", `${pText(a.pRaw)}; decision: p < α = ${a.alpha}`],
            ["Sufficiency", a.sufficient ? `met: n = ${a.nMonths} months, ${a.missingMonths} missing (needs 10 years and 70% of months)` : `not met (n = ${a.nMonths})`],
          ]} />
          <h3>Diagnostic or context only</h3>
          <KV rows={[
            ["Adjusted p (Hamed-Rao, anomalies)", `${pText(a.pAdjusted)}; does not change the verdict`],
            ["95% CI for the OLS anomaly slope", a.olsInterval ? `${num(a.olsInterval[0])} to ${num(a.olsInterval[1])} ${a.units} per decade; targets the OLS slope, not the Sen slope` : "n/a"],
          ]} />
        </div>
        <figure className="rfig">
          <LocatorMap boxes={[{ bbox: a.bbox, label: a.place, color: "#c4462f" }]} height={150} />
          <figcaption className="rcap">Study region: {a.regionKind === "preset" ? `catalog preset "${a.regionId}"` : "bounding-box approximation"}, W {a.bbox[0]}°, S {a.bbox[1]}°,
            E {a.bbox[2]}°, N {a.bbox[3]}°; {a.gridDeg}° processed grid (native {a.nativeDeg}°); {a.coveragePct}% of the area with data. {a.product} v{a.version}, {a.provider}.</figcaption>
        </figure>
      </div>
      {a.warnings.length > 0 && <ul className="rwarn">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <AuthorNote text={p.notes[a.key]} />
    </section>
  );
}

function ScientistComparison({ p, c, i }: { p: EditionProps; c: ComparisonEntry; i: number }) {
  const d = c.test?.difference;
  const pOk = d?.p_value != null && d.p_value < 0.05;
  const ivOk = !!d?.ci && (d.ci[0] > 0 || d.ci[1] < 0);
  return (
    <section className="rpage" id={`rp-${c.key}`}>
      <Head m={p.m} title={`Comparison ${i + 1}`} />
      <div className="rrow" style={{ justifyContent: "space-between" }}><span className="rkicker">Comparison {i + 1}</span><StampTag s={compareStamp(c)} /></div>
      <h2>{compareHeadline(c)}</h2>
      {c.kind === "regions" && d ? (
        <div className="rnote"><b>Criteria for a significant difference (both required)</b>
          <ul>
            <li>{pOk ? "Met" : "Not met"}: Hamed-Rao Mann-Kendall p on the anomaly difference = {pText(d.p_value)} (required below 0.05).</li>
            <li>{ivOk ? "Met" : "Not met"}: the 95% interval of the difference{d.ci ? ` (${num(d.ci[0])} to ${num(d.ci[1])} ${c.units} per decade)` : ""} {ivOk ? "excludes" : "includes"} zero.</li>
          </ul></div>
      ) : <div className="rnote"><b>Descriptive comparison.</b> No statistical test of a difference between two datasets is implemented; neither product is treated as ground truth.</div>}
      <p>{compareStatement(c)}</p>
      <figure className="rfig">
        <ReportChart units={c.units} height={150} yLabel={`Monthly anomaly (${c.units})`} lines={[
          { series: c.a.series, trend: c.a.trend, color: "#2b2540", label: "A" }, { series: c.b.series, trend: c.b.trend, color: "#8d86a0", dash: true, label: "B" }]} />
        <figcaption className="rcap">Figure C{i + 1}. Monthly anomalies, A ({c.a.label}) solid and B ({c.b.label}) dashed, each with its seasonal Sen slope.</figcaption>
      </figure>
      <table className="rtable">
        <thead><tr><th scope="col">Statistic</th><th scope="col">A: {c.a.label}</th><th scope="col">B: {c.b.label}</th></tr></thead>
        <tbody>
          <tr><th scope="row">Sen slope per decade</th><td>{signedNum(c.a.trend.slope_per_decade)} {c.units}</td><td>{signedNum(c.b.trend.slope_per_decade)} {c.units}</td></tr>
          <tr><th scope="row">Raw Seasonal MK p</th><td>{pText(c.a.trend.p_value)}</td><td>{pText(c.b.trend.p_value)}</td></tr>
          <tr><th scope="row">Period</th><td>{c.a.trend.start} to {c.a.trend.end}</td><td>{c.b.trend.start} to {c.b.trend.end}</td></tr>
          <tr><th scope="row">n (months)</th><td>{c.a.trend.quality.n_months}</td><td>{c.b.trend.quality.n_months}</td></tr>
        </tbody>
      </table>
      <div className="rcols">
        <div><h3>Points of agreement</h3><ul>{(c.agrees.length ? c.agrees : ["None in the compared statistics."]).map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h3>Limits of inference</h3><ul>{c.cannotConclude.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
    </section>
  );
}

function ScientistMethods({ m }: { m: ReportModel }) {
  return (
    <section className="rpage">
      <Head m={m} title="Methods, provenance and reproducibility" />
      <h2>Methods</h2>
      <KV rows={[
        ["Temporal aggregation", "Monthly values (one per calendar month)."],
        ["Spatial aggregation", "Area average of all processed grid cells whose centres fall inside the study box."],
        ["Seasonal treatment", "Seasonal Mann-Kendall compares each calendar month only with itself; anomalies subtract the long-term mean of each calendar month (figures, OLS interval, adjusted test)."],
        ["Trend estimator", "Seasonal Sen slope (Hirsch et al., 1982; Sen, 1968), reported per decade."],
        ["Significance test", "Raw Seasonal Mann-Kendall p-value (Mann, 1945; Kendall, 1975), α = 0.05. Applied."],
        ["Autocorrelation", "Hamed-Rao modified Mann-Kendall on anomalies (Hamed & Rao, 1998). Applied as a diagnostic only; the verdict does not use it."],
        ["Confidence interval", "95% CI for the OLS slope of the anomalies. Applied; it targets the OLS slope, not the Sen slope, and has no HAC adjustment."],
        ["Multiple comparisons", "Benjamini-Hochberg FDR (Benjamini & Hochberg, 1995) on raw cell p-values for grid maps only. Not applied to the regional results in this report."],
        ["Completeness", "At least 10 years and 70% of months with data; otherwise no test is run."],
        ["Comparisons", "Two regions: the difference series of monthly anomalies (A minus B) is tested with the Hamed-Rao Mann-Kendall test (p-value), its trend is the Sen slope, and a moving-block bootstrap (12-month blocks) gives the 95% interval (significant only when p < 0.05 and the 95% interval excludes zero). Two datasets: descriptive only."],
      ]} />
      <h2>Provenance</h2>
      <table className="rtable">
        <thead><tr><th scope="col" style={{ width: "44%" }}>Product</th><th scope="col">Provider</th><th scope="col">Native grid</th><th scope="col">Processed grid</th></tr></thead>
        <tbody>{m.datasets.map((d) => (
          <tr key={d.product}><td>{d.product} v{d.version}<br /><Link href={d.url}>{d.url.replace(/^https?:\/\//, "")}</Link></td><td>{d.provider}</td>
            <td>{Number.isFinite(d.nativeDeg) ? `${d.nativeDeg}°` : "see product page"}</td><td>{Number.isFinite(d.gridDeg) ? `${d.gridDeg}°` : "see product page"}</td></tr>
        ))}</tbody>
      </table>
      <h2>Reproducibility</h2>
      <table className="rtable">
        <thead><tr><th scope="col" style={{ width: "26%" }}>Evidence ID</th><th scope="col">Request</th></tr></thead>
        <tbody>{m.analyses.map((a) => (
          <tr key={a.key}><td>{a.trendId}</td><td>POST /api/v1/trends · variable {a.variableId} · region {a.regionKind === "preset" ? `preset ${a.regionId}` : `bbox ${a.bbox.join(", ")}`} · {a.start} to {a.end} · method {a.method} + {a.slopeMethod} · α {a.alpha}</td></tr>
        ))}{m.comparisons.map((c) => (
          <tr key={c.key}><td>{c.test?.compare_id ?? c.key}</td><td>{c.kind === "regions" ? "POST /api/v1/compare" : "two POST /api/v1/trends"} · {c.title} · {c.a.trend.start} to {c.a.trend.end}</td></tr>
        ))}</tbody>
      </table>
      <p className="small">Software: Terra-scope backend {m.backendVersion}, code revision {GIT_REV}. The reproducibility JSON export lists every request and the result it returned.</p>
      <h3>Limitations</h3>
      <ul>{m.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
    </section>
  );
}

function ScientistReferences({ m }: { m: ReportModel }) {
  return (
    <section className="rpage">
      <Head m={m} title="References" />
      <h2>References</h2>
      <Refs m={m} />
      <p className="rdisc">Terra-scope AI is a student project for the NASA Space Apps Challenge 2026. It uses publicly available NASA data. It is not an official NASA
        product, and NASA does not endorse it.</p>
    </section>
  );
}

/** Approximate page count for the wizard (actual pagination depends on content length). */
export function pageCount(m: ReportModel, edition: Edition, appendix = false): number {
  return 1 + m.analyses.length + m.comparisons.length + (edition === "scientist" ? 2 : 1 + (appendix ? 1 : 0));
}

export function EditionDoc(p: EditionProps) {
  const sci = p.edition === "scientist";
  return (
    <article className="report-doc" aria-label={sci ? "Scientist edition report" : "Explorer edition report"} data-edition={sci ? "scientist" : "explorer"}>
      {sci ? <ScientistCover p={p} /> : <ExplorerCover p={p} />}
      {p.m.analyses.map((a, i) => sci ? <ScientistFinding key={a.key} p={p} a={a} i={i} /> : <ExplorerFinding key={a.key} p={p} a={a} i={i} />)}
      {p.m.comparisons.map((c, i) => sci ? <ScientistComparison key={c.key} p={p} c={c} i={i} /> : <ExplorerComparison key={c.key} p={p} c={c} i={i} />)}
      {sci ? <><ScientistMethods m={p.m} /><ScientistReferences m={p.m} /></> : <><ExplorerClosing p={p} />{p.appendix && <ExplorerAppendix m={p.m} />}</>}
    </article>
  );
}
