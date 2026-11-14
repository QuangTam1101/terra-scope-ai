import { useMemo, useState } from "react";
import { api, type CompareResponse, type SeriesResponse } from "../api";
import { useStore } from "../store";
import { TrendChart } from "../TrendChart";
import { ci, pval, signed, Stat, VerdictBadge } from "../ui";
import { compareF, seriesF } from "../units";

const VERDICT: Record<CompareResponse["verdict"], { text: string; cls: string }> = {
  opposite_significant: { text: "Contradiction confirmed", cls: "sig" },
  opposite_not_significant: { text: "Opposite directions, difference not proven yet", cls: "np" },
  same_direction: { text: "Same direction", cls: "np" },
  insufficient_data: { text: "Not enough data", cls: "ne" },
};

export function Hunt() {
  const { regions, variable, sel, run, showError, tempUnit, huntSelection } = useStore();
  const [a, setA] = useState<string>(huntSelection?.a ?? (run?.place.ref.type === "preset" ? run.place.ref.id : "sahel_hint"));
  const [b, setB] = useState<string>(huntSelection?.b ?? "mekong_delta");
  const [busy, setBusy] = useState(false);
  const [raw, setRes] = useState<{ cmp: CompareResponse; sa: SeriesResponse; sb: SeriesResponse } | null>(null);
  // the API answers in °C; convert for display when °F is chosen
  const res = useMemo(() => (raw && tempUnit === "F" && raw.sa.units === "°C"
    ? { cmp: compareF(raw.cmp), sa: seriesF(raw.sa), sb: seriesF(raw.sb) } : raw), [raw, tempUnit]);

  // Presets from /regions plus two example boxes used in the challenge story.
  const options = [
    ...regions.map((r) => ({ id: r.id, name: r.name, ref: { type: "preset" as const, id: r.id } })),
    { id: "sahel_hint", name: "Sahel (box 17°W to 30°E, 10°N to 18°N)", ref: { type: "bbox" as const, bbox: [-17, 10, 30, 18] as [number, number, number, number] } },
    { id: "wisconsin", name: "Wisconsin, USA (box)", ref: { type: "bbox" as const, bbox: [-92.9, 42.5, -86.8, 47.1] as [number, number, number, number] } },
  ];
  const ref = (id: string) => options.find((o) => o.id === id)!;
  const name = (id: string) => ref(id).name;

  const check = async () => {
    if (!variable) return;
    const start = `${sel.startYear}-01`, end = `${sel.endYear}-12`;
    setBusy(true);
    try {
      const [cmp, sa, sb] = await Promise.all([
        api.compare(variable.id, ref(a).ref, ref(b).ref, start, end),
        api.series(variable.id, ref(a).ref, start, end),
        api.series(variable.id, ref(b).ref, start, end),
      ]);
      setRes({ cmp, sa, sb });
    } catch (e) { showError(e); } finally { setBusy(false); }
  };

  const u = variable?.display_units ?? "";
  return (
    <div className="page">
      <section className="card pad col">
        <h1 style={{ fontSize: 30 }}>Contradiction hunt</h1>
        <p className="muted" style={{ margin: 0, font: "600 15px/1.5 var(--body)" }}>
          Can the same variable rise in one place and fall in another? Pick two places. A contradiction is confirmed only when the trends point in
          opposite directions <b>and</b> the difference between them is statistically significant.
        </p>
        <div className="row">
          <label className="col small muted" style={{ gap: 4, flex: 1, minWidth: 220 }}>Place A
            <select className="select" value={a} onChange={(e) => setA(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
          <label className="col small muted" style={{ gap: 4, flex: 1, minWidth: 220 }}>Place B
            <select className="select" value={b} onChange={(e) => setB(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
          <button type="button" className="btn" style={{ alignSelf: "flex-end" }} disabled={busy || a === b || !variable?.available} onClick={check}>
            {busy ? "Testing…" : a === b ? "Choose two different places" : "Run the check"}
          </button>
        </div>
        <span className="small muted">Using {variable?.parameter_name} · {variable?.dataset_name} · {sel.startYear} to {sel.endYear} (change these on Explore).</span>
        <span className="small muted">Automatic search for contradicting areas is coming soon.</span>
      </section>

      {busy && <div className="skel" style={{ height: 260 }} />}
      {res && !busy && (
        <>
          <section className="row" style={{ alignItems: "stretch", gap: 18 }}>
            {[["A", a, res.cmp.a, "#2b2540"], ["B", b, res.cmp.b, "#5e5872"]].map(([k, id, t, col]) => {
              const tr = t as CompareResponse["a"];
              return (
                <div key={k as string} className="card pad col" style={{ flex: 1, minWidth: 280 }}>
                  <span className="label" style={{ color: col as string }}>Place {k as string} · {k === "A" ? "solid line" : "dashed line"}</span>
                  <h2 style={{ fontSize: 20 }}>{name(id as string)}</h2>
                  <VerdictBadge t={tr} />
                  <span className="num" style={{ font: "600 34px var(--display)" }}>{signed(tr.slope_per_decade)} {u} <span style={{ font: "800 14px var(--body)" }}>per decade</span></span>
                  <div className="grid2"><Stat value={ci(tr.slope_ci)} label="95% CI" /><Stat value={pval(tr.p_value)} label="Mann–Kendall p" /></div>
                </div>
              );
            })}
            <div className="card pad col" style={{ flex: 1, minWidth: 280 }}>
              <span className="label">Difference A minus B</span>
              <span className={`badge ${VERDICT[res.cmp.verdict].cls}`}>{VERDICT[res.cmp.verdict].text}</span>
              <span className="num" style={{ font: "600 34px var(--display)" }}>{signed(res.cmp.difference.slope_diff_per_decade)} {u} <span style={{ font: "800 14px var(--body)" }}>per decade</span></span>
              <div className="grid2"><Stat value={ci(res.cmp.difference.ci)} label="95% CI (bootstrap)" /><Stat value={pval(res.cmp.difference.p_value)} label="p of the difference" /></div>
              <p style={{ margin: 0, font: "600 14.5px/1.5 var(--body)" }}>{res.cmp.plain_summary}</p>
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
          </section>
        </>
      )}
    </div>
  );
}
