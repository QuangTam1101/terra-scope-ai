// "What's changing here?": the same place and years, one row per available variable (F2).
// Every number and verdict comes from POST /trends and POST /series; this file only clamps periods and formats.
import { useEffect, useReducer } from "react";
import { api, ApiError, errorText, type SeriesResponse, type TrendResponse, type Variable } from "./api";
import { InfoButton } from "./InfoButton";
import { useStore, type Place } from "./store";
import { pval, signed, verdictOf } from "./ui";
import { convFor, convSeries, convTrend } from "./units";

/** Clamp the chosen period to a variable's coverage. null: no overlap. short: under 10 calendar years (the backend's test needs 10 years with data). */
export function clampPeriod(start: string, end: string, coverage: Variable["coverage"]) {
  if (!coverage) return null;
  const s = start > coverage.start ? start : coverage.start, e = end < coverage.end ? end : coverage.end;
  if (s > e) return null;
  return { start: s, end: e, clamped: s !== start || e !== end, short: Number(e.slice(0, 4)) - Number(s.slice(0, 4)) + 1 < 10 };
}

export type Tone = "up" | "down" | "flat" | "none";
/** Chip for one API result. Direction from the Sen slope sign; "could be chance" whenever the backend says not significant. */
export function rowVerdict(t: Pick<TrendResponse, "quality" | "significant" | "slope_per_decade">): { label: string; chance: boolean; tone: Tone } {
  if (verdictOf(t) === "ne" || t.significant === null) return { label: "Not enough data", chance: false, tone: "none" };
  const s = t.slope_per_decade ?? 0;
  const tone: Tone = s > 0 ? "up" : s < 0 ? "down" : "flat";
  return { label: tone === "up" ? "Rising" : tone === "down" ? "Falling" : "No clear change", chance: !t.significant, tone };
}

/** 404 NO_DATA (ocean box for a land product, land box for an ocean product…) or an empty result: a muted row, not an error. */
export const isNoData = (e: unknown) => e instanceof ApiError && (e.code === "NO_DATA" || e.status === 404);

type Row = { kind: "data"; trend: TrendResponse; series: SeriesResponse } | { kind: "nodata" } | { kind: "error"; text: string };
const cache = new Map<string, Row>();                    // per variable|place|period, kept while the page is open
const errors = new Map<string, Row>();                   // failed loads: shown, retried on the next mount or change
const keyOf = (id: string, place: Place, s: string, e: string) => `${id}|${JSON.stringify(place.ref)}|${s}|${e}`;

async function load(v: Variable, place: Place, s: string, e: string, signal: AbortSignal): Promise<Row> {
  try {
    const trend = await api.trends(v.id, place.ref, s, e, signal);
    if (!trend.quality.n_months) return { kind: "nodata" };
    return { kind: "data", trend, series: await api.series(v.id, place.ref, s, e, signal) };
  } catch (err) {
    if (isNoData(err)) return { kind: "nodata" };
    return { kind: "error", text: errorText(err) };
  }
}

const STRIPES = "repeating-linear-gradient(135deg, rgba(255,255,255,.95) 0 2px, transparent 2px 7px)";   // same as the trend map legend
const CHIP: Record<Tone, [string, string]> = { up: ["var(--up-2)", "var(--up-1)"], down: ["var(--down-2)", "var(--down-1)"], flat: ["#ece7f3", "#ece7f3"], none: ["var(--ne-bg)", "var(--ne-bg)"] };
const LINE: Record<Tone, string> = { up: "var(--up-3)", down: "var(--down-3)", flat: "var(--muted)", none: "var(--muted)" };
const years = (s: string, e: string) => s.slice(0, 4) === e.slice(0, 4) ? s.slice(0, 4) : `${s.slice(0, 4)}–${e.slice(0, 4)}`;

function Chip({ v }: { v: ReturnType<typeof rowVerdict> }) {
  const [solid, pale] = CHIP[v.tone];
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, font: "800 12.5px var(--body)", whiteSpace: "nowrap",
      color: v.tone === "none" ? "var(--ink)" : "#2b2540",   // pale and mid-tone fills keep dark ink in dark mode too
      background: v.chance ? `${STRIPES}, ${pale}` : solid, boxShadow: "inset 0 0 0 1px rgba(43,37,64,.12)" }}>
      {v.label}{v.chance && <span style={{ fontWeight: 700 }}> · could be chance</span>}
    </span>
  );
}

/** 120 × 28 line of the monthly anomaly (seasons removed); gaps stay gaps. Decoration only: the row carries the numbers. */
function Spark({ series, tone }: { series: SeriesResponse; tone: Tone }) {
  const a = series.points.map((p) => p.anomaly);
  const vals = a.filter((x): x is number => x !== null);
  if (vals.length < 2) return null;
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
  const x = (i: number) => (i / (a.length - 1)) * 118 + 1, y = (v: number) => 27 - ((v - lo) / span) * 26;
  const d = a.map((v, i) => (v === null ? "" : `${i && a[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join("");
  return (
    <svg width={120} height={28} viewBox="0 0 120 28" aria-hidden="true" style={{ display: "block" }}>
      <line x1={1} x2={119} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth={1} />
      <path d={d} fill="none" stroke={LINE[tone]} strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

export function PlaceCompare({ place, start, end, variables, onOpen }: {
  place: Place; start: string; end: string; variables: Variable[]; onOpen: (variableId: string) => void;
}) {
  const { audience, tempUnit } = useStore();
  const sci = audience === "scientist";
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const rows = variables.filter((v) => v.available).map((v) => {
    const p = clampPeriod(start, end, v.coverage);
    return { v, p, key: p ? keyOf(v.id, place, p.start, p.end) : "" };
  });
  const todo = rows.filter((r) => r.p && !r.p.short && !cache.has(r.key));
  const todoKey = todo.map((r) => r.key).join(";");

  useEffect(() => {
    if (!todo.length) return;
    const ctrl = new AbortController();
    let next = 0;
    const worker = async () => {                          // two workers, one request each at a time: at most 2 in flight
      while (next < todo.length && !ctrl.signal.aborted) {
        const r = todo[next++];
        errors.delete(r.key);
        const row = await load(r.v, place, r.p!.start, r.p!.end, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (row.kind !== "error") cache.set(r.key, row);
        else errors.set(r.key, row);
        rerender();
      }
    };
    void worker(); void worker();
    return () => ctrl.abort();
  }, [todoKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const view = rows.map((r) => ({ ...r, row: r.p ? cache.get(r.key) ?? errors.get(r.key) : ({ kind: "nodata" } as Row) }));
  const groups = [...new Set(view.map((r) => r.v.parameter_name))];
  const noData = view.filter((r) => r.row?.kind === "nodata");
  const cols = sci ? 8 : 4;

  const line = (r: (typeof view)[number]) => {
    const { v, p, row } = r;
    const c = convFor(v.display_units, tempUnit, audience);   // raw API numbers → shown units (°F, % water…)
    const units = c ? c.to : v.display_units;
    const t = row?.kind === "data" ? (c ? convTrend(row.trend, c) : row.trend) : null;
    const s = row?.kind === "data" ? (c ? convSeries(row.series, c) : row.series) : null;
    const verdict = t && rowVerdict(t);
    const status = !p ? "No data for these years" : row?.kind === "nodata" ? "No data for this place" : p?.short ? "Too short to test (needs 10 years)"
      : row?.kind === "error" ? `Could not load: ${row.text}` : !t ? "Loading…" : null;
    const open = row?.kind !== "nodata" && !p?.short;   // a run under 10 years cannot be tested
    return (
      <tr key={v.id} onClick={open ? () => onOpen(v.id) : undefined} style={{ cursor: open ? "pointer" : undefined, color: open ? undefined : "var(--muted)" }}>
        <td>
          <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            {open ? <button type="button" className="linkbtn" style={{ textAlign: "left", flex: "0 1 auto" }} title="Open this variable">{v.name}</button> : <span style={{ fontWeight: 800, fontSize: 13 }}>{v.name}</span>}
            <span onClick={(e) => e.stopPropagation()}><InfoButton id={v.id} /></span>
          </span>
          <span className="small muted">{v.dataset_name}{p?.clamped ? ` · ${years(p.start, p.end)} only` : ""}</span>
        </td>
        {status ? <td colSpan={cols - 1}><span className="small muted">{status}</span></td> : t && s && verdict && <>
          <td><Chip v={verdict} /></td>
          <td className="num" style={{ whiteSpace: "nowrap" }}>{signed(t.slope_per_decade)} {units}</td>
          <td><Spark series={s} tone={verdict.tone} /></td>
          {sci && <>
            <td className="num">{pval(t.p_value)}</td>
            <td className="num">{pval(t.p_value_autocorr_adjusted)}</td>
            <td className="num">{years(t.start, t.end)}</td>
            <td className="num">{Math.round(t.quality.coverage_fraction * 100)} %</td>
          </>}
        </>}
      </tr>
    );
  };

  return (
    <div className="col" style={{ gap: 8 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>{sci ? "Same place, same years, every variable: which ones are changing?" : "Same place, same years: which measurements are changing?"}</p>
      <div style={{ overflowX: "auto" }}>
        <table className="fc-table">
          <thead>
            <tr>
              <th>{sci ? "Variable" : "Measurement"}</th><th>{sci ? "Verdict" : "What we found"}</th><th>{sci ? "Sen's slope per decade" : "Change every 10 years"}</th><th>{sci ? "Anomaly (seasons removed)" : "Year to year"}</th>
              {sci && <><th>Mann-Kendall p (raw)</th><th>p adjusted (Hamed-Rao)</th><th>Years</th><th title="Mean share of the area with data each month">Area with data</th></>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const inGroup = view.filter((r) => r.v.parameter_name === g && r.row?.kind !== "nodata");
              return inGroup.length ? [
                <tr key={`g-${g}`}><th colSpan={cols} style={{ color: "var(--ink)", paddingTop: 12 }}>{g}</th></tr>,
                ...inGroup.map(line),
              ] : null;
            })}
            {noData.length > 0 && <tr><th colSpan={cols} style={{ paddingTop: 12 }}>Not available here</th></tr>}
            {noData.map(line)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
