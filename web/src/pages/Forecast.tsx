import { useEffect, useMemo, useRef, useState } from "react";
import { forecastApi, type Confidence, type DataStatus, type ForecastPoint, type ForecastResponse, type Mode, type RealityCheck, type RealityRegion } from "../api";
import { cellPlace, useStore } from "../store";
import { OutlookMap } from "../OutlookMap";
import { PlacePicker } from "../PlacePicker";
import { plain, signed, Stat } from "../ui";

// Drawing and wording only: every number (forecast, 80% range, probabilities, skill, explanations) comes from the backend.
type Audience = "simple" | "scientist";
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : `${Math.round(x * 100)}%`);
const addMonths = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const nowMonth = () => new Date().toISOString().slice(0, 7);
const CONF: Record<Confidence, { label: string; hint: string }> = {
  high: { label: "High confidence", hint: "The backtest shows clear skill for this kind of place and lead time." },
  moderate: { label: "Moderate confidence", hint: "Some skill: treat the tilt as a hint, not a promise." },
  low: { label: "Low confidence", hint: "Small skill: only slightly better than a coin toss." },
  none: { label: "No skill", hint: "The backtest shows no skill here, so the forecast is just the seasonal norm." },
};
const ConfBadge = ({ c }: { c: Confidence }) => <span className={`cf ${c}`} title={CONF[c].hint}>{CONF[c].label}</span>;
const Tip = ({ text }: { text: string }) => <span className="tip" title={text} aria-label={text} role="img">?</span>;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

interface Series { label: string; values: (number | null)[]; color: string; dash?: boolean; width?: number }
function LineChart({ months, series, band, units, height = 280 }: { months: string[]; series: Series[]; band?: { lo: number[]; hi: number[] }; units: string; height?: number }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const H = height, PL = 56, PR = 14, PT = 12, PB = 32;
  const all = [...series.flatMap((s) => s.values), ...(band ? [...band.lo, ...band.hi] : [])].filter((v): v is number => v !== null && Number.isFinite(v));
  if (!all.length) return <div className="warn">No values to plot.</div>;
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const n = months.length;
  const X = (i: number) => PL + (n === 1 ? 0.5 : i / (n - 1)) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const path = (v: (number | null)[]) => v.map((y, i) => (y === null ? "" : `${i && v[i - 1] !== null ? "L" : "M"}${X(i).toFixed(1)},${Y(y).toFixed(1)}`)).join("");
  const bandPath = band ? band.hi.map((y, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join("") + [...band.lo].reverse().map((y, i) => `L${X(n - 1 - i).toFixed(1)},${Y(y).toFixed(1)}`).join("") + "Z" : "";
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  const dec = hi - lo < 5 ? 2 : hi - lo < 50 ? 1 : 0;
  return (
    <div ref={box} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label={`Line chart, ${units}`}>
        {ticks.map((v) => (
          <g key={v}><line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
            <text x={PL - 8} y={Y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{plain(v, dec)}</text></g>
        ))}
        {band && <path d={bandPath} fill="#5aa9e6" opacity=".22" />}
        {series.map((s) => <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 3} strokeDasharray={s.dash ? "5 5" : undefined} strokeLinecap="round" />)}
        {months.map((m, i) => (i % Math.ceil(n / 6) === 0 || i === n - 1) && (
          <text key={m} x={X(i)} y={H - 9} textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize="12" fill="var(--muted)">{m}</text>
        ))}
      </svg>
      <div className="row small muted" style={{ gap: 16 }}>
        {series.map((s) => <span key={s.label}><b style={{ color: s.color }}>{s.dash ? "┅" : "━"}</b> {s.label}</span>)}
        {band && <span><b style={{ color: "#5aa9e6" }}>▇</b> 80% range</span>}<span>{units}</span>
      </div>
    </div>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card pad col" aria-labelledby={id}>
      <h3 id={id} style={{ fontSize: 18, margin: 0 }}>{title}</h3>
      {sub && <span className="small muted">{sub}</span>}
      {children}
    </section>
  );
}

const GLOSSARY: [string, string][] = [
  ["Normal", "The middle third of what happened in this place in that calendar month, 2001 to 2016. 'Above normal' means it ends in the top third, 'below normal' in the bottom third."],
  ["Chance / probability", "How often a month like this would end above, near or below normal. With no information it would be 33% each, so 55% above normal is a real tilt."],
  ["80% range", "The band in which the real value should land 8 times out of 10. A wide band means the model is not sure."],
  ["Confidence", "How well the model did in a backtest for this kind of place and lead time, on places and years it had never seen."],
  ["No skill", "The model was no better than guessing the seasonal norm. We then show the norm instead of pretending to know."],
  ["El Niño / La Niña", "Warm or cool phases of the tropical Pacific that shift rain and heat patterns around the world months in advance."],
  ["IOD, PDO, SOI", "Other ocean and air-pressure patterns (Indian Ocean, North Pacific, tropical Pacific pressure) that the model reads as early signals."],
  ["Seasonal outlook", "A statement about the odds for a whole month, not a weather forecast for a specific day."],
];

const FORECASTABLE = new Set(["imerg_precip", "gldas_soil_moisture_0_10cm", "gldas_air_temperature", "gldas_evapotranspiration", "merra2_air_temperature_2m"]);

export function Forecast() {
  const { variables, sel, setSel, variable, showError, ready, audience: appAudience, setAudience: setAppAudience } = useStore();
  // Uses the app-wide Experience (Explorer = Simple view, Scientist = Scientist view).
  const audience: Audience = appAudience === "scientist" ? "scientist" : "simple";
  const [mode, setMode] = useState<Mode>("outlook");
  const [months, setMonths] = useState(13);
  const [res, setRes] = useState<ForecastResponse | null>(null);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [reality, setReality] = useState<RealityCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const sci = audience === "scientist";
  // Only variables with trained forecast models (data-pipeline/train_forecast.py); newer variables are trend-only.
  const avail = variables.filter((v) => v.available && FORECASTABLE.has(v.id));
  const canForecast = !!variable?.available && FORECASTABLE.has(variable.id);
  const today = nowMonth();

  const chooseAudience = (a: Audience) => setAppAudience(a === "scientist" ? "scientist" : "explorer");
  useEffect(() => { if (!sci) setMode("outlook"); }, [sci]);
  useEffect(() => { setRes(null); }, [sel.variableId, sel.place, mode]);
  useEffect(() => { forecastApi.reality().then(setReality).catch(() => setReality(null)); }, []);
  useEffect(() => {
    if (!canForecast || !variable) return;
    let live = true;
    forecastApi.status(variable.id, mode).then((s) => live && setStatus(s)).catch(() => live && setStatus(null));
    return () => { live = false; };
  }, [variable, mode]);

  const run = async () => {
    if (!variable) return;
    setLoading(true);
    try { setRes(await forecastApi.forecast(variable.id, sel.place.ref, mode, months)); }
    catch (e) { showError(e); }
    finally { setLoading(false); }
  };

  const mapMonths = useMemo(() => {
    if (mode === "satellite" && status) return Array.from({ length: 12 }, (_, i) => addMonths(status.origin, i + 1));
    return Array.from({ length: 13 }, (_, i) => addMonths(today, i));
  }, [mode, status, today]);

  const download = () => {
    if (!res) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(res, null, 2)], { type: "application/json" }));
    a.download = `terra-scope-forecast-${res.variable_id}-${res.points[0]?.t}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pts: ForecastPoint[] = res?.points ?? [];
  const ex = res?.explanation;
  const netMax = Math.max(0.02, ...(ex?.contributions ?? []).map((c) => Math.abs(c.effect_p_above - c.effect_p_below)));
  const sc = ex?.scientific;
  const bandSkill = sc?.skill_by_latitude_band as Record<string, Record<string, { model_skill: number; rpss: number }>> | undefined;

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* ---------- set-up ---------- */}
      <section className="card pad col" aria-labelledby="fc-setup">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="fc-setup" style={{ fontSize: 22, margin: 0 }}>Climate outlook</h2>
          <div className="seg" role="group" aria-label="Level of detail">
            <button type="button" className={!sci ? "on" : ""} aria-pressed={!sci} onClick={() => chooseAudience("simple")}>Explorer</button>
            <button type="button" className={sci ? "on" : ""} aria-pressed={sci} onClick={() => chooseAudience("scientist")}>Scientist</button>
          </div>
        </div>
        <span className="small muted">
          How likely is a wetter, drier, warmer or cooler month than normal? An AI model reads NASA satellite data and NOAA ocean-climate signals
          (El Niño and others), and also tells you how much to trust the answer.
        </span>
        <span className="label">1 · What do you want to know?</span>
        <div className="row" style={{ gap: 6 }}>
          {avail.map((v) => (
            <button key={v.id} type="button" className={`chip ${sel.variableId === v.id ? "on" : ""}`} aria-pressed={sel.variableId === v.id}
              onClick={() => setSel({ parameter: v.parameter, variableId: v.id })}>{v.parameter_name} · {v.dataset_name}</button>
          ))}
        </div>
        {variable && !FORECASTABLE.has(variable.id) && <p className="warn" style={{ margin: 0 }}>{variable.parameter_name} ({variable.dataset_name}) has trends in Explore but no forecast model yet. Pick one of the variables above.</p>}
        <span className="label">2 · Where?</span>
        <PlacePicker />
        <span className="label">3 · How far ahead?</span>
        <div className="row">
          <select className="select" aria-label="Forecast length" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={6}>Next 6 months</option>
            <option value={13}>{mode === "outlook" ? `Next year (${today} to ${addMonths(today, 12)})` : "Next 12 months"}</option>
            {mode === "outlook" && <option value={18}>Up to 18 months (lowest confidence)</option>}
          </select>
          {sci && (
            <div className="seg" role="group" aria-label="Forecast mode">
              <button type="button" className={mode === "outlook" ? "on" : ""} aria-pressed={mode === "outlook"} onClick={() => setMode("outlook")} title="Starts today, driven by climate indices">Outlook (from today)</button>
              <button type="button" className={mode === "satellite" ? "on" : ""} aria-pressed={mode === "satellite"} onClick={() => setMode("satellite")} title="Uses the newest satellite data on the server">Satellite hindcast</button>
            </div>
          )}
          <button type="button" className="btn" disabled={!ready || loading || !canForecast} onClick={run}>{loading ? "Forecasting…" : "Run forecast"}</button>
        </div>
        {status && (
          <div className="banner" role="note">
            <b>Data status.</b> Today is {status.today}. Satellite data on this server ends in {status.satellite_data_end}; climate indices run to {status.origin}.
            <span className="muted"> {status.note}</span>
          </div>
        )}
      </section>

      {res && (
        <>
          {/* ---------- answer ---------- */}
          <section className="card pad col" aria-label="Forecast summary">
            <p style={{ font: "800 18px/1.4 var(--body)", margin: 0 }}>{res.plain_summary}</p>
            <div className="row">
              <Stat value={`${res.points[0]?.t} → ${res.points[res.points.length - 1]?.t}`} label="Months covered" />
              <Stat value={`${res.points[0]?.lead_months}–${res.points[res.points.length - 1]?.lead_months} mo`} label="Lead time after last data" />
              <Stat value={res.origin} label="Last data used" />
              {sci && <Stat value={pct(res.interval)} label="Range shown" />}
            </div>
            <LineChart months={pts.map((p) => p.t)} units={res.units}
              series={[{ label: "Forecast", values: pts.map((p) => p.forecast), color: "var(--ink)" }, { label: "Seasonal norm", values: pts.map((p) => p.climatology), color: "var(--muted)", dash: true, width: 2 }]}
              band={{ lo: pts.map((p) => p.lower ?? 0), hi: pts.map((p) => p.upper ?? 0) }} />
            {sci && <div className="row"><button type="button" className="btn soft" onClick={download}>Download results (JSON)</button></div>}
          </section>

          {/* ---------- explainable AI ---------- */}
          {ex && (
            <Section id="fc-why" title={`Why does the model say this? (${ex.month})`}
              sub="The model's reasoning, translated: what the climate is doing now, and how much each kind of information moved the odds.">
              <div className="row" style={{ gap: 8 }}>
                {ex.conditions.map((c) => (
                  <span key={c.key} className="cond" title={c.description}><b>{c.phase}</b><small>{c.label.split(" (")[0]}: {signed(c.value, 1)} {c.unit} · {c.as_of}</small></span>
                ))}
              </div>
              <ul className="why">{ex.simple.map((l, i) => <li key={i}>{l}</li>)}</ul>
              <span className="label">How much each kind of information moved the odds <Tip text="We switch one kind of information to 'normal' and see how the probability changes. Right = toward above normal, left = toward below normal." /></span>
              {ex.contributions.length === 0 && <span className="small muted">No information group moved the odds noticeably.</span>}
              {ex.contributions.map((c) => {
                const net = c.effect_p_above - c.effect_p_below;
                return (
                  <div key={c.group} className="fc-contrib" title={c.description}>
                    <span>{c.group}</span>
                    <span className="axis"><i style={{ width: `${(Math.abs(net) / netMax) * 50}%`, [net >= 0 ? "left" : "right"]: "50%", background: net >= 0 ? "#f08c3c" : "#3c78c8" }} /></span>
                    <b>{Math.abs(net) < 0.005 ? "≈ 0" : `${net > 0 ? "+" : "−"}${Math.abs(net * 100).toFixed(0)} pts`}</b>
                    {sci && <small className="muted">above {signed(c.effect_p_above * 100, 1)} · below {signed(c.effect_p_below * 100, 1)} pts · z {signed(c.effect_z, 2)}</small>}
                  </div>
                );
              })}
            </Section>
          )}

          {/* ---------- month by month ---------- */}
          <Section id="fc-months" title="Month by month: chance of a below-, near- or above-normal month"
            sub="Each bar is the model's odds. Without any skill it would be one third each.">
            <div style={{ overflowX: "auto" }}>
              <table className="fc-table">
                <thead><tr><th>Month</th><th>Best guess ({res.units})</th><th>Below · near · above</th>{sci && <th>Normal range</th>}<th>Tilt</th><th>Confidence</th></tr></thead>
                <tbody>
                  {pts.map((p) => (
                    <tr key={p.t}>
                      <td><b>{p.t}</b></td>
                      <td>{plain(p.forecast, 2)} <span className="muted">({plain(p.lower, 2)}–{plain(p.upper, 2)})</span></td>
                      <td>
                        <div className="fc-bars" title={`below ${pct(p.p_below)}, near ${pct(p.p_near)}, above ${pct(p.p_above)}`}>
                          <i className="lo" style={{ width: `${p.p_below * 100}%` }} /><i className="mid" style={{ width: `${p.p_near * 100}%` }} /><i className="hi" style={{ width: `${p.p_above * 100}%` }} />
                        </div>
                        <small className="muted">{pct(p.p_below)} · {pct(p.p_near)} · {pct(p.p_above)}</small>
                      </td>
                      {sci && <td>{plain(p.normal_range[0], 2)} to {plain(p.normal_range[1], 2)}</td>}
                      <td>{p.signal === "above" ? <span className="fc-pos">above normal</span> : p.signal === "below" ? <span className="fc-neg">below normal</span> : <span className="muted">no clear tilt</span>}</td>
                      <td><ConfBadge c={p.confidence} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ---------- trust ---------- */}
          <Section id="fc-trust" title="How much can you trust it?"
            sub="Every number below comes from a backtest on places and years the model never saw. It averages the whole Earth: tropical temperatures do better, polar regions and rainfall do worse.">
            <div className="grid2">
              {res.backtest.map((b) => {
                const r = b.rpss ?? 0;
                const c: Confidence = r >= 0.15 ? "high" : r >= 0.07 ? "moderate" : r >= 0.02 ? "low" : "none";
                return (
                  <div key={b.lead_months} className="trust">
                    <div className="row" style={{ justifyContent: "space-between" }}><b>{b.lead_months} month{b.lead_months > 1 ? "s" : ""} ahead</b><ConfBadge c={c} /></div>
                    <small className="muted">Picks the right third (below / near / above) {pct(b.tercile_accuracy)} of the time; 33% would be pure luck.</small>
                  </div>
                );
              })}
            </div>
            {sci && (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table className="fc-table">
                    <thead><tr><th>Lead (months)</th><th>Skill vs norm <Tip text="1 − MSE/MSE(climatology). 0 = no better than the seasonal norm." /></th><th>Skill vs persistence</th><th>RPSS <Tip text="Ranked probability skill score of the tercile probabilities against 1/3-1/3-1/3." /></th><th>Tercile accuracy</th><th>80% range coverage</th></tr></thead>
                    <tbody>
                      {res.backtest.map((b) => (
                        <tr key={b.lead_months}><td><b>{b.lead_months}</b></td>
                          <td className={(b.skill_vs_climatology ?? 0) > 0.02 ? "fc-pos" : "muted"}>{signed(b.skill_vs_climatology, 3)}</td>
                          <td>{b.skill_vs_persistence === null ? "n/a" : signed(b.skill_vs_persistence, 3)}</td>
                          <td className={(b.rpss ?? 0) > 0.02 ? "fc-pos" : "muted"}>{signed(b.rpss, 3)}</td>
                          <td>{pct(b.tercile_accuracy)}</td><td>{pct(b.coverage_80)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sc?.backtest_at_lead?.baselines && (
                  <>
                    <span className="label">Against simpler methods at {sc.backtest_at_lead.lead_months} months (skill vs norm)</span>
                    <table className="fc-table"><tbody>
                      <tr><td><b>This model</b></td><td>{signed(sc.backtest_at_lead.model?.skill_vs_clim, 3)}</td></tr>
                      {Object.entries(sc.backtest_at_lead.baselines as Record<string, { skill_vs_clim: number }>).map(([k, v]) => (
                        <tr key={k}><td>{k.replace(/_/g, " ")}</td><td>{signed(v.skill_vs_clim, 3)}</td></tr>
                      ))}
                    </tbody></table>
                  </>
                )}
                {bandSkill && (
                  <>
                    <span className="label">Probability skill (RPSS) by latitude band</span>
                    <table className="fc-table">
                      <thead><tr><th>Band</th>{Object.keys(Object.values(bandSkill)[0] ?? {}).map((h) => <th key={h}>{h} mo</th>)}</tr></thead>
                      <tbody>{Object.entries(bandSkill).map(([b, v]) => <tr key={b}><td>{b}</td>{Object.values(v).map((x, i) => <td key={i}>{signed(x.rpss, 3)}</td>)}</tr>)}</tbody>
                    </table>
                  </>
                )}
                {sc?.calibration && <span className="small muted">Calibration at {sc.calibration.lead_months} months: probability temperature τ = {sc.calibration.probability_temperature_tau ?? "n/a"}, conformal half-width = {sc.calibration.conformal_half_width_z ?? "n/a"} σ, shrinkage λ by band = {JSON.stringify(sc.calibration.shrinkage_lambda_by_band)}.</span>}
                {sc?.training && <span className="small muted">Trained to {String(sc.training.train_until).slice(0, 7)}, calibrated to {String(sc.training.calibration_until).slice(0, 7)}, tested {sc.training.backtest_period?.[0]?.slice(0, 7)} to {sc.training.backtest_period?.[1]?.slice(0, 7)} on {sc.training.backtest_squares} unseen squares. Split: {sc.training.split}.</span>}
                <span className="label">What the model relies on globally (% error increase when scrambled)</span>
                {Object.entries(res.drivers).filter(([k]) => k !== "Lead time").sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} className="fc-drv"><span>{k}</span><span className="bar" style={{ width: `${Math.max(2, (Math.max(v, 0) / Math.max(1, ...Object.values(res.drivers))) * 100)}%` }} /><b>{signed(v, 1)}%</b></div>
                ))}
              </>
            )}
          </Section>

          {/* ---------- reality check ---------- */}
          <RealityCard reality={reality} sci={sci} mode={mode} />

          {/* ---------- similar years ---------- */}
          <Section id="fc-analogs" title={`Similar past years (${res.analog_horizon} months later)`}
            sub="Years when El Niño, SOI, PDO and IOD looked most like today, and what really happened here. Context only, not a promise.">
            <table className="fc-table">
              <thead><tr><th>Year</th><th>What happened here</th><th>El Niño index</th></tr></thead>
              <tbody>
                {res.analogs.map((a) => (
                  <tr key={a.origin}><td>{a.origin} → {a.target}</td>
                    <td className={a.z_outcome > 0.43 ? "fc-pos" : a.z_outcome < -0.43 ? "fc-neg" : "muted"}>{a.z_outcome > 0.43 ? "above normal" : a.z_outcome < -0.43 ? "below normal" : "near normal"}{sci ? ` (${signed(a.z_outcome, 2)} σ)` : ""}</td>
                    <td>{signed(a.state.nino34, 1)} °C</td></tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}

      {/* ---------- map ---------- */}
      {canForecast && (
        <OutlookMap variableId={variable.id} mode={mode} months={mapMonths} unitsLabel={variable.parameter_name.toLowerCase()}
          onPick={(lat, lon) => { setSel({ place: cellPlace(lon, lat) }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}

      {/* ---------- glossary / method ---------- */}
      {!sci ? (
        <Section id="fc-gloss" title="What do these words mean?">
          <dl className="gloss">{GLOSSARY.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
        </Section>
      ) : res && (
        <Section id="fc-method" title="Data and method">
          <span className="small"><b>Inputs:</b> {res.data_inputs.join(" · ")}</span>
          <span className="small muted">{res.method}</span>
          {sc?.model && <span className="small muted"><b>Algorithm:</b> {sc.model.algorithm}. <b>Target:</b> {sc.model.target}. <b>Inputs:</b> {sc.model.inputs}.</span>}
          {res.warnings.map((w) => <span key={w} className="warn small">{w}</span>)}
        </Section>
      )}
      {!sci && res && res.warnings.length > 0 && (
        <section className="card pad col" aria-label="Limits"><b style={{ fontSize: 15 }}>Good to know</b>{res.warnings.map((w) => <span key={w} className="small muted">• {w}</span>)}</section>
      )}
    </div>
  );
}

function RealityCard({ reality, sci, mode }: { reality: RealityCheck | null; sci: boolean; mode: Mode }) {
  const [region, setRegion] = useState("global");
  if (!reality) return null;
  const variant = mode === "outlook" ? "outlook" : "full";
  const r: RealityRegion | undefined = reality.regions[region]?.[variant];
  if (!r) return null;
  const better = r.mae_model < r.mae_climatology;
  const beatsPersist = r.mae_model < r.mae_persistence;
  const names: Record<string, string> = { global: "Whole world", northern_hemisphere: "Northern Hemisphere", southern_hemisphere: "Southern Hemisphere" };
  return (
    <Section id="fc-reality" title="Did it get the real world right? (air temperature vs NASA measurements)"
      sub={`Forecasts made from ${reality.origin} are compared with what NASA GISTEMP later measured, ${r.months[0]} to ${r.months[r.months.length - 1]}. The model never saw these months.`}>
      {sci && (
        <div className="seg" role="group" aria-label="Region">
          {Object.keys(reality.regions).map((k) => <button key={k} type="button" className={region === k ? "on" : ""} aria-pressed={region === k} onClick={() => setRegion(k)}>{names[k] ?? k}</button>)}
        </div>
      )}
      <LineChart months={r.months} units={`°C above/below the ${r.baseline_period} average`}
        series={[{ label: "Measured by NASA", values: r.actual, color: "#1b7f5a" }, { label: "AI forecast", values: r.forecast, color: "var(--ink)" }, { label: "Normal (0)", values: r.months.map(() => 0), color: "var(--muted)", dash: true, width: 1.5 }]}
        band={{ lo: r.lower, hi: r.upper }} height={240} />
      <p className="small" style={{ margin: 0 }}>
        Average error: <b>{r.mae_model.toFixed(2)} °C</b> for the AI, against <b>{r.mae_climatology.toFixed(2)} °C</b> if we had just assumed a normal month
        {better ? ", so the AI beat the seasonal norm" : ", so the AI did not beat the seasonal norm"}.
        {!beatsPersist && <> Simply repeating the last measured anomaly would have been even closer ({r.mae_persistence.toFixed(2)} °C): for the world-average temperature, which changes slowly, that is a tough baseline.</>}
        {" "}The AI's real strength is the pattern across places and the probabilities, which a single world average cannot show.
      </p>
      {sci && <span className="small muted">n = {r.n_months} months · 80% range contained the measurement {pct(r.coverage_80)} of the time (region averages make the range conservative) · baseline {r.baseline_period} · source: {reality.source}.</span>}
    </Section>
  );
}
