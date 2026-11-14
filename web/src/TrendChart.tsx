import { useEffect, useRef, useState } from "react";
import type { SeriesResponse, TrendResponse } from "./api";
import { plain } from "./ui";

// Monthly series + seasonal Sen line. OLS slope intervals are separate numeric evidence,
// not a confidence band around the Sen line (no Sen-targeted interval is supplied).
// The SVG is drawn at the container's real pixel width so text stays readable at any size.
interface Line { series: SeriesResponse; trend?: TrendResponse | null; color?: string; dash?: boolean; label?: string }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const niceStep = (span: number) => {
  const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
};

export function TrendChart({ lines, anomaly, height = 340, units = "" }: { lines: Line[]; anomaly: boolean; height?: number; units?: string }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, PL = 58, PR = 18, PT = 16, PB = 34;
  const n = Math.max(...lines.map((l) => l.series.points.length), 2);
  const get = (p: SeriesResponse["points"][number]) => (anomaly ? p.anomaly : p.value);
  const all = lines.flatMap((l) => l.series.points.map(get)).filter((v): v is number => v !== null);
  if (!all.length) return <div className="warn">No values to plot for this selection.</div>;

  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = (i: number) => PL + (i / (n - 1)) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const step = niceStep(hi - lo);
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(+v.toFixed(10));
  const dec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));

  const pts = lines[0].series.points;
  const firstYear = Number(pts[0].t.slice(0, 4)), lastYear = Number(pts[pts.length - 1].t.slice(0, 4));
  const yearStep = lastYear - firstYear > 16 ? 4 : lastYear - firstYear > 8 ? 2 : 1;
  const xTicks: { i: number; label: string }[] = [];
  pts.forEach((p, i) => { const yr = Number(p.t.slice(0, 4)); if (p.t.endsWith("-01") && (yr - firstYear) % yearStep === 0) xTicks.push({ i, label: String(yr) }); });

  const pathOf = (l: Line) => {
    let d = "", pen = false;
    l.series.points.forEach((p, i) => {
      const v = get(p);
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // Trend line: Values mode uses trend_line from /trends; Anomaly mode draws the same slope through the anomaly mean.
  const trendGeom = (l: Line) => {
    const t = l.trend;
    if (!t || t.slope_per_decade === null || !t.trend_line.length) return null;
    const vals = l.series.points.map(get).filter((v): v is number => v !== null);
    const mid = (n - 1) / 2;
    const centre = anomaly ? vals.reduce((a, b) => a + b, 0) / vals.length
      : (t.trend_line[0].value + t.trend_line[t.trend_line.length - 1].value) / 2;
    const at = (slope: number, i: number) => centre + (slope / 120) * (i - mid);
    const line = `M${X(0)} ${Y(at(t.slope_per_decade, 0))} L${X(n - 1)} ${Y(at(t.slope_per_decade, n - 1))}`;
    const up = t.slope_per_decade >= 0;
    // Colour always encodes direction (orange = increasing, blue = decreasing), never the series identity.
    return { line, color: up ? "#c4621a" : "#2f6fb3", dashed: !t.significant };
  };

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const i = Math.round(((ev.clientX - r.left - PL) / (W - PL - PR)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const fmt = (v: number | null) => (v === null ? "no data" : `${anomaly && v > 0 ? "+" : ""}${plain(v, Math.abs(v) < 1 ? 3 : 2)} ${units}`);

  return (
    <div ref={box} style={{ position: "relative", width: "100%" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        style={{ display: "block", maxWidth: "100%", height: "auto", background: "var(--bg)", borderRadius: 18, touchAction: "pan-y" }}
        aria-label={`Monthly ${anomaly ? "anomalies" : "values"} from ${firstYear} to ${lastYear}${lines.some((l) => l.trend) ? ' with seasonal Sen trend line; no Sen confidence band is available' : ''}`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke={anomaly && v === 0 ? "rgba(43,37,64,.35)" : "rgba(43,37,64,.08)"} strokeWidth={anomaly && v === 0 ? 1.4 : 1} />
            <text x={PL - 8} y={Y(v) + 4} textAnchor="end" fontSize="12.5" fontWeight="700" fill="#4e4860" fontFamily="Nunito">{plain(v, dec)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t.i}>
            <line x1={X(t.i)} x2={X(t.i)} y1={PT} y2={H - PB} stroke="rgba(43,37,64,.06)" />
            <text x={X(t.i)} y={H - 12} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#4e4860" fontFamily="Nunito">{t.label}</text>
          </g>
        ))}
        <text x={12} y={PT + 2} fontSize="11.5" fontWeight="800" fill="#4e4860" fontFamily="Nunito" transform={`rotate(-90 12 ${PT + 2})`} textAnchor="end">{units}</text>
        {lines.map((l, k) => (
          <path key={`p${k}`} d={pathOf(l)} fill="none" stroke={l.color ?? "#5e5872"} strokeOpacity={0.75} strokeWidth={1.5}
            strokeLinejoin="round" strokeDasharray={l.dash ? "5 4" : undefined} />
        ))}
        {lines.map((l, k) => { const g = trendGeom(l); return g ? <path key={`t${k}`} d={g.line} fill="none" stroke={g.color} strokeWidth={4.5} strokeLinecap="round" strokeDasharray={g.dashed ? "12 8" : undefined} /> : null; })}
        {hover !== null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={PT} y2={H - PB} stroke="#2b2540" strokeOpacity={0.35} />
            {lines.map((l, k) => { const v = get(l.series.points[hover]); return v === null ? null : <circle key={k} cx={X(hover)} cy={Y(v)} r={4.5} fill="#2b2540" />; })}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="num" style={{ position: "absolute", top: 8, left: Math.min(Math.max(X(hover) + 12, 0), W - 230), background: "#fff", borderRadius: 14,
          boxShadow: "var(--shadow)", padding: "6px 12px", font: "700 13px var(--body)", pointerEvents: "none", whiteSpace: "nowrap" }}>
          <div style={{ fontWeight: 800 }}>{lines[0].series.points[hover].t}</div>
          {lines.map((l, k) => <div key={k}>{l.label ? `${l.label}: ` : ""}{fmt(get(l.series.points[hover]))}</div>)}
        </div>
      )}
    </div>
  );
}
