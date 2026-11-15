// "See the pattern" views inside Explore further: stripes (after Ed Hawkins' warming stripes, showyourstripes.info),
// a month-by-year grid (after NOAA Climate at a Glance), one line per year (after Climate Reanalyzer) and a
// sonification of the stripes (after NASA data sonification). Pictures of backend values and anomalies only:
// yearly means and ranks are descriptive counts, and the significance test stays in the result above.
// "Usual" = backend climatology: the mean of the same calendar month over the requested period
// (pipeline/trends.py anomaly(), service.series()).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store";
import { DOWN, NEUTRAL, NODATA, UP, divergingColor, pitchOf, rankOf, rankPhrase, yearMeans } from "./explore";
import { signed } from "./ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PICTURE_ONLY = "Picture only: no significance test here. The test is in the result above.";
const USUAL = "“Usual” is the average for each calendar month over the years shown.";
const SCI_ANOM = "anomaly = value minus the same-calendar-month mean over the requested period (backend /series)";

/** Arrow keys over n items in rows of `cols` (Up/Down only when there are several rows); null for other keys. */
function move(key: string, i: number | null, n: number, cols = n): number | null {
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  const d = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : cols < n && key === "ArrowUp" ? -cols : cols < n && key === "ArrowDown" ? cols : 0;
  if (!d) return null;
  return i === null ? (d > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, i + d));
}

function Legend({ noData }: { noData?: boolean }) {
  const ramp = [...DOWN].reverse().concat(NEUTRAL, UP).join(", ");
  return (
    <div className="row small" style={{ gap: 8 }}>
      <span>below usual ←</span>
      <span aria-hidden="true" style={{ width: 120, height: 12, borderRadius: 6, background: `linear-gradient(90deg, ${ramp})` }} />
      <span>→ above usual</span>
      {noData && <><span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: NODATA, marginLeft: 8 }} /><span>no data</span></>}
    </div>
  );
}

export function Stripes() {
  const { run, audience } = useStore();
  const rows = useMemo(() => (run ? yearMeans(run.series.points, "anomaly") : []), [run]);
  const [sel, setSel] = useState<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const audio = useRef<{ ctx: AudioContext; timers: number[] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const stop = useCallback(() => {
    const a = audio.current;
    audio.current = null;
    a?.timers.forEach((t) => window.clearTimeout(t));
    void a?.ctx.close();
    setPlaying(null);
  }, []);
  useEffect(() => stop, [rows, stop]);   // new data, tab change or unmount: stop the sound

  if (!run) return null;
  const allYears = new Set(run.series.points.map((p) => p.t.slice(0, 4))).size, skipped = allYears - rows.length;
  if (rows.length < 2) return <p className="warn">Stripes need at least two years with all 12 months of data.</p>;
  const n = rows.length, max = Math.max(...rows.map((r) => Math.abs(r.value)));
  const first = rows[0].year, last = rows[n - 1].year, u = run.variable.display_units, name = run.variable.parameter_name;
  const W = 720, H = 150, bw = W / n, shown = playing ?? sel;

  const listen = () => {
    if (audio.current) return stop();
    const ctx = new AudioContext(), D = 0.3, t0 = ctx.currentTime + 0.05;
    rows.forEach((r, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * D;
      o.frequency.value = pitchOf(r.value, max);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.02);   // short fades: no clicks between notes
      g.gain.linearRampToValueAtTime(0, t + D - 0.04);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + D);
    });
    const timers = rows.map((_, i) => window.setTimeout(() => setPlaying(i), 50 + i * D * 1000));
    timers.push(window.setTimeout(stop, 150 + n * D * 1000));
    audio.current = { ctx, timers };
    setPlaying(0);
  };

  const save = () => {
    const svg = svgRef.current?.cloneNode(true) as SVGSVGElement | undefined;
    if (!svg) return;
    svg.querySelectorAll(".hl").forEach((e) => e.remove());
    svg.removeAttribute("style"); svg.removeAttribute("class");
    const img = new Image();
    img.onload = () => {
      const CW = 1200, top = 100, sh = 320, CH = top + sh + 70, s = 2, font = "Nunito, system-ui, sans-serif";
      const c = document.createElement("canvas");
      c.width = CW * s; c.height = CH * s;
      const g = c.getContext("2d");
      if (!g) return;
      g.scale(s, s);
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, CW, CH);
      g.fillStyle = "#2b2540";
      g.font = `800 28px ${font}`; g.fillText(run.place.label, 32, 48);
      g.font = `600 19px ${font}`; g.fillText(`${name} · ${run.variable.dataset_name} · ${first} to ${last}`, 32, 80);
      g.drawImage(img, 32, top, CW - 64, sh);
      g.font = `700 16px ${font}`; g.fillText(String(first), 32, top + sh + 24);
      g.textAlign = "right"; g.fillText(String(last), CW - 32, top + sh + 24); g.textAlign = "left";
      g.fillStyle = "#4e4860"; g.font = `600 15px ${font}`;
      g.fillText("below usual ← → above usual. One stripe per full year, compared with the average of this record. Picture only, no test.", 32, CH - 16);
      c.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `stripes-${run.place.label}-${run.variable.id}-${first}-${last}.png`.replace(/[^\w.-]+/g, "_");
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, "image/png");
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <div>
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          className="rchart pat-stripes" role="img" tabIndex={0} onPointerLeave={() => setSel(null)}
          onKeyDown={(e) => { const j = move(e.key, sel, n); if (j !== null) { e.preventDefault(); setSel(j); } }}
          aria-label={`${name} stripes for ${run.place.label}, ${first} to ${last}: one stripe per full year, orange above usual, blue below usual. Use the left and right arrow keys to read each year.`}>
          {rows.map((r, i) => <rect key={r.year} x={i * bw} y={0} width={bw + 0.5} height={H} fill={divergingColor(r.value, max)} onPointerEnter={() => setSel(i)} />)}
          {shown !== null && <rect className="hl" x={shown * bw + 1} y={1} width={Math.max(1, bw - 2)} height={H - 2} fill="none" stroke="var(--ink)"
            strokeWidth={2.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        </svg>
        <div className="row small muted" style={{ justifyContent: "space-between", marginTop: 2 }}><span>{first}</span><span>{last}</span></div>
      </div>
      <p className="xc-readout" role="status" aria-live={playing !== null ? "off" : "polite"}>
        {shown !== null ? <><b>{rows[shown].year}</b>: {signed(rows[shown].value)} {u} vs usual (yearly mean)</>
          : <span className="muted">Point at a stripe, or focus the stripes and use the arrow keys, to read each year.</span>}
      </p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Legend />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn soft" onClick={listen}>{playing !== null ? "Stop" : "Listen"}</button>
          <button type="button" className="btn soft" onClick={save}>Save image</button>
        </div>
      </div>
      <p className="small" style={{ margin: 0 }}>Each stripe is one full year, coloured by how far its months were above or below usual. {USUAL}
        {skipped > 0 && ` ${skipped} ${skipped === 1 ? "year with missing months is" : "years with missing months are"} left out.`}
        {" "}Higher notes: above usual. Lower notes: below usual.</p>
      {audience === "scientist" && <p className="small muted" style={{ margin: 0 }}>Yearly mean of the 12 monthly anomalies, years with all 12 months only; {SCI_ANOM}.
        Colour saturates at {signed(-max)} and {signed(max)} {u}; pitch runs from 220 Hz to 880 Hz over the same range.</p>}
      <p className="small muted" style={{ margin: 0 }}>{PICTURE_ONLY}</p>
    </div>
  );
}

export function MonthGrid() {
  const { run, audience } = useStore();
  const [sel, setSel] = useState<number | null>(null);
  if (!run || !run.series.points.length) return null;
  const pts = run.series.points, byT = new Map(pts.map((p) => [p.t, p]));
  const y0 = Number(pts[0].t.slice(0, 4)), y1 = Number(pts[pts.length - 1].t.slice(0, 4));
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i), n = years.length * 12;
  const max = Math.max(0, ...pts.map((p) => Math.abs(p.anomaly ?? 0))), u = run.variable.display_units;
  const at = (i: number) => byT.get(`${years[Math.floor(i / 12)]}-${String((i % 12) + 1).padStart(2, "0")}`);
  const text = (i: number) => {
    const p = at(i), when = `${MONTHS[i % 12]} ${years[Math.floor(i / 12)]}`;
    return !p ? `${when}: outside the chosen period` : p.anomaly === null ? `${when}: no data` : `${when}: ${signed(p.anomaly)} ${u} vs usual`;
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="pat-grid" role="img" tabIndex={0} onPointerLeave={() => setSel(null)}
        onKeyDown={(e) => { const j = move(e.key, sel, n, 12); if (j !== null) { e.preventDefault(); setSel(j); } }}
        aria-label={`${run.variable.parameter_name} for ${run.place.label}, each month from ${y0} to ${y1} compared with usual: one row per year, orange above usual, blue below, grey no data. Use the arrow keys to read each month.`}>
        <span />
        {MONTHS.map((m) => <span key={m} className="pat-mh">{m}</span>)}
        {years.map((y, r) => (
          <Fragment key={y}>
            <span>{y}</span>
            {MONTHS.map((m, c) => {
              const i = r * 12 + c, p = at(i);
              return <span key={m} className={`pat-cell${sel === i ? " on" : ""}`} onPointerEnter={() => setSel(i)}
                style={{ background: !p ? "transparent" : p.anomaly === null ? NODATA : divergingColor(p.anomaly, max) }} />;
            })}
          </Fragment>
        ))}
      </div>
      <p className="xc-readout" role="status" aria-live="polite">
        {sel !== null ? text(sel) : <span className="muted">Point at a square, or focus the grid and use the arrow keys, to read each month.</span>}
      </p>
      <Legend noData />
      <p className="small" style={{ margin: 0 }}>Each row is a year and each square is a month, coloured by how far it was from usual. {USUAL}</p>
      {audience === "scientist" && <p className="small muted" style={{ margin: 0 }}>Monthly {SCI_ANOM}; colour saturates at {signed(-max)} and {signed(max)} {u}.</p>}
      <p className="small muted" style={{ margin: 0 }}>{PICTURE_ONLY}</p>
    </div>
  );
}

export function EachYear() {
  const { run, audience } = useStore();
  const [pick, setPick] = useState<number | null>(null);
  if (!run) return null;
  const pts = run.series.points, clim = run.series.climatology;
  const lines = new Map<number, (number | null)[]>();
  for (const p of pts) {
    const y = Number(p.t.slice(0, 4));
    if (!lines.has(y)) lines.set(y, Array(12).fill(null));
    lines.get(y)![Number(p.t.slice(5, 7)) - 1] = p.value;
  }
  const years = [...lines.keys()].filter((y) => lines.get(y)!.some((v) => v !== null)).sort((a, b) => a - b);
  const full = yearMeans(pts, "value");
  if (!years.length) return <p className="warn">No values to draw for this selection.</p>;
  const year = pick !== null && years.includes(pick) ? pick : full.length ? full[full.length - 1].year : years[years.length - 1];
  const all = [...years.flatMap((y) => lines.get(y)!), ...clim].filter((v): v is number => v !== null);
  const W = 720, H = 230, PL = 50, PR = 24, PT = 10, PB = 26;
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.06 || 1;
  const X = (m: number) => PL + (m / 11) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - PT - PB);
  const path = (vs: (number | null)[]) => {
    let d = "", pen = false;
    vs.forEach((v, m) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(m).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const r = rankOf(full, year), mine = lines.get(year)!;
  const HL = "var(--coral)", OTHER = "var(--muted-2)", USUAL_C = "var(--ink)";   // theme tokens: readable in light and dark
  const swatch = (c: string, w: number, o = 1) => <span aria-hidden="true" style={{ display: "inline-block", width: 22, height: w, background: c, opacity: o, borderRadius: 2, verticalAlign: "middle", marginRight: 6 }} />;
  return (
    <div className="col" style={{ gap: 10 }}>
      <label className="small muted">Highlight year{" "}
        <select className="select" value={year} onChange={(e) => setPick(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <svg viewBox={`0 0 ${W} ${H}`} className="rchart" role="img"
        aria-label={`Monthly ${run.variable.parameter_name} for ${run.place.label}, one line per year from ${years[0]} to ${years[years.length - 1]}, with ${year} highlighted and the usual pattern as a bold line.`}>
        {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x={PL - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v.toPrecision(3)}</text></g>)}
        {MONTHS.map((m, i) => <text key={m} x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{m}</text>)}
        {years.filter((y) => y !== year).map((y) => <path key={y} d={path(lines.get(y)!)} fill="none" stroke={OTHER} strokeOpacity={0.35} strokeWidth={1.2} />)}
        <path d={path(clim)} fill="none" stroke={USUAL_C} strokeWidth={3.5} strokeLinejoin="round" />
        <path d={path(mine)} fill="none" stroke={HL} strokeWidth={2.6} strokeLinejoin="round" />
        {mine.map((v, m) => v !== null && <circle key={m} cx={X(m)} cy={Y(v)} r={3} fill={HL} />)}
      </svg>
      <div className="row small" style={{ gap: 14 }}>
        <span>{swatch(HL, 3)}{year}</span>
        <span>{swatch(USUAL_C, 4)}usual (average of this record)</span>
        <span>{swatch(OTHER, 2, 0.35)}other years</span>
        <span className="muted">{run.variable.display_units}</span>
      </div>
      <p className="small" style={{ margin: 0 }}>
        <b>{full.length < 2 ? "A rank needs at least two years with all 12 months."
          : r ? `${year}: ${rankPhrase(r)} of ${r.of} complete years in this record.`
          : `${year} is missing some months, so it has no rank. A rank needs all 12 months.`}</b>{" "}
        Each grey line is one year from January to December. The bold line is the usual pattern for this place.
      </p>
      {audience === "scientist" && <p className="small muted" style={{ margin: 0 }}>Rank by calendar-year mean of monthly values among years with all 12 months
        (ties share the better rank); bold line is the backend climatology, the same-calendar-month mean over the requested period.</p>}
      <p className="small muted" style={{ margin: 0 }}>{PICTURE_ONLY} The rank is a simple count.</p>
    </div>
  );
}
