// Two presentations of the SAME backend trend result. Nothing here computes a statistic: every number and the
// verdict come from the TrendResponse; Explorer and Scientist only differ in order, wording and depth.
import type { ReactNode } from "react";
import type { TrendResponse } from "./api";
import { plainFinding, strengthOf } from "./audience";
import type { Run } from "./store";
import { Term } from "./Term";
import { InfoButton } from "./InfoButton";
import { ci, pval, signed, Stat, VerdictBadge } from "./ui";
import { periodText } from "./period";

const METHOD: Record<string, string> = {
  seasonal_mk: "Seasonal Mann-Kendall", sen_seasonal: "seasonal Sen slope", ols_anomaly: "OLS slope of monthly anomalies",
};
const nice = (x: unknown, fallback: string) => (typeof x === "string" ? METHOD[x] ?? x.replace(/_/g, " ") : fallback);
const extra = (t: TrendResponse) => t as TrendResponse & { method?: string; slope_method?: string; alpha?: number };

/** Position on the "How strong is the evidence?" meter, 0 to 100 from weak (left) to strong (right).
 * Smaller p sits further right; p below alpha lands in the right 30% (the clear-evidence zone). A drawing aid only, not a statistic. */
export function meterPos(p: number, alpha = 0.05): number {
  const x = p <= alpha ? 70 + (1 - p / alpha) * 30 : (1 - (Math.min(p, 1) - alpha) / (1 - alpha)) * 70;
  return Math.max(2, Math.min(98, x));
}

export function EvidenceMeter({ t }: { t: TrendResponse }) {
  const s = strengthOf(t);
  const alpha = extra(t).alpha ?? 0.05;
  if (s === "untested" || t.p_value === null) return <p className="warn" style={{ margin: 0 }}>Not tested: at least 10 years and 70% of months are needed.</p>;
  const up = (t.slope_per_decade ?? 0) >= 0;
  const pos = meterPos(t.p_value, alpha);
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="meter-wrap">
        <span className="meter-pin num" style={{ left: `${pos}%`, transform: pos < 20 ? "translateX(-12px)" : pos > 80 ? "translateX(calc(-100% + 12px))" : "translateX(-50%)" }}>This result: p {pval(t.p_value)}</span>
        <div className="meter" role="img" aria-label={`p-value ${pval(t.p_value)}; clear evidence needs p below ${alpha}`}>
          <span className="zone" />
          <span className="fill" style={{ width: `${pos}%` }} />
          <span className="tick" />
          <span className="dot" style={{ left: `${pos}%`, background: up ? "var(--up-2)" : "var(--down-2)" }} />
        </div>
      </div>
      <div className="meter-labels"><span>Weaker evidence</span><span className="meter-clear">Clear evidence (p below {alpha})</span></div>
      <span className="small">{s === "clear"
        ? "The trend passed the test: it is unlikely to be chance alone. That still does not tell us why it happens."
        : "Not strong enough yet to confirm a clear change. That is not the same as \"no change\"; a longer record may help."}{" "}
        <Term id="p_value">What is a p-value</Term> <InfoButton id="p-value" /></span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="col" style={{ gap: 6 }}><h3 style={{ fontSize: 16 }}>{title}</h3>{children}</div>;
}

export function ExplorerResult({ run, actions }: { run: Run; actions: ReactNode }) {
  const { trend: t, variable: v, place } = run;
  const u = v.display_units, q = t.quality;
  const what = v.parameter_name.toLowerCase();
  return (
    <div className="col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <VerdictBadge t={t} />
        <span className="small muted" style={{ fontWeight: 700 }}>{place.label} · {v.dataset_name}</span>
      </div>
      <Section title="What did we find?">
        <p className="plain-lead">{plainFinding(t, what)}</p>
      </Section>
      <Section title="What does the data show?">
        {q.sufficient && t.slope_per_decade !== null ? (
          <div><span className="num" style={{ font: "600 42px/1 var(--display)" }}>{signed(t.slope_per_decade)} {u}</span>{" "}
            <span style={{ font: "800 15px var(--body)" }}>per decade, {periodText(t.start, t.end)}</span> <InfoButton id="rate-per-decade" /></div>
        ) : <p className="warn" style={{ margin: 0 }}>Not enough data to test this place and period. Try a longer period.</p>}
        <span className="small muted">This is the typical change per decade (<Term id="sen_slope">Sen slope</Term>). The monthly chart below shows every month.</span>
      </Section>
      <Section title="How strong is the evidence?">
        <EvidenceMeter t={t} />
        <div className="col" style={{ gap: 4, marginTop: 6 }}>
          <span className="small" style={{ fontWeight: 800 }}>Data coverage</span>
          <div style={{ height: 10, borderRadius: 6, background: "var(--track)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((q.n_months / (q.n_months + q.missing_months || 1)) * 100)}%`, background: "var(--quality)" }} />
          </div>
          <span className="small muted num">{q.n_months} of {q.n_months + q.missing_months} months have data · {Math.round(q.coverage_fraction * 100)}% of the area</span>
        </div>
      </Section>
      {t.warnings.length > 0 && (
        <details className="disclose notes">
          <summary>Good to know about this data{t.warnings.length > 1 ? ` (${t.warnings.length} notes)` : ""}</summary>
          {t.warnings.map((w) => <div key={w} className="warn">{w}</div>)}
        </details>
      )}
      <details className="disclose">
        <summary>Why might this matter?</summary>
        <p style={{ margin: 0, font: "600 14px/1.5 var(--body)" }}>A trend shows what changed in the past, not why, and it is not a forecast (<Term id="forecast_vs_trend">trend vs forecast</Term>).
          Changes in {what} can matter for water, farming and health, but possible causes are only ideas to investigate. Ask the Detective,
          or compare with another place or another NASA dataset.</p>
      </details>
      <details className="disclose">
        <summary>How was this calculated?</summary>
        <div className="col" style={{ gap: 8 }}>
          <span className="small">Monthly NASA values are averaged over the area, normal seasons are set aside (<Term id="anomaly">anomaly</Term>), and the{" "}
            <Term id="seasonal_mk">Seasonal Mann-Kendall</Term> test decides whether the trend is clear.</span>
          <div className="grid2">
            <Stat value={signed(t.slope_per_decade)} label={<>Sen's slope per decade ({u}) <InfoButton id="sens-slope" /></>} />
            <Stat value={pval(t.p_value)} label={<>p-value used for the verdict <InfoButton id="p-value" /></>} />
            <Stat value={ci(t.slope_ci)} label={<>95% range (OLS on anomalies, not for Sen) <InfoButton id="confidence-interval" /></>} />
            <Stat value={pval(t.p_value_autocorr_adjusted)} label={<>Adjusted p (extra check only) <InfoButton id="autocorrelation" /></>} />
          </div>
        </div>
      </details>
      {actions}
    </div>
  );
}

export function ScientistResult({ run, actions }: { run: Run; actions: ReactNode }) {
  const { trend: t, variable: v, place } = run;
  const u = v.display_units, q = t.quality, x = extra(t);
  const alpha = x.alpha ?? 0.05;
  const decided = t.significant === null || !q.sufficient ? "was not applied (insufficient data)." : t.significant ? "criterion is met (significant)." : "criterion is not met (not significant).";
  const dir = t.slope_per_decade === null ? "" : t.slope_per_decade > 0 ? "Positive" : t.slope_per_decade < 0 ? "Negative" : "Zero";
  const b = t.region.bbox;
  return (
    <div className="col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <VerdictBadge t={t} />
        <span className="small muted num" style={{ fontWeight: 700 }}>Trend ID {t.trend_id}</span>
      </div>
      <Section title="Analysis metadata">
        <table className="metatable"><tbody>
          <tr><th>Variable</th><td>{v.parameter_name} ({u})</td></tr>
          <tr><th>Product</th><td>{t.source.product} v{t.source.version} · {t.source.provider}</td></tr>
          <tr><th>Region</th><td>{place.label} · {t.region.type === "preset" ? `catalog preset "${t.region.id}"` : t.region.type === "country"
            ? "country border (Natural Earth 1:110m): grid cells whose centre is inside it" : "bounding-box approximation"}</td></tr>
          <tr><th>Box (W, S, E, N)</th><td>{b[0]}°, {b[1]}°, {b[2]}°, {b[3]}°</td></tr>
          <tr><th>Period</th><td>{t.start} to {t.end}, monthly</td></tr>
          <tr><th>Grid</th><td>{v.spatial_resolution_deg}° processed (native {v.native_resolution_deg}°), area mean of cells in the box</td></tr>
          <tr><th>Sample</th><td>{q.n_months} months with data, {q.missing_months} missing; {Math.round(q.coverage_fraction * 100)}% of the area covered</td></tr>
        </tbody></table>
      </Section>
      <Section title="Statistical estimates">
        <div className="grid2">
          <Stat value={`${signed(t.slope_per_decade)} ${u}`} label={<>Seasonal Sen slope per decade <InfoButton id="sens-slope" /></>} />
          <Stat value={pval(t.p_value)} label={<>Raw Seasonal MK p (decision, α = {alpha}) <InfoButton id="mann-kendall" /></>} />
          <Stat value={pval(t.p_value_autocorr_adjusted)} label={<>Hamed-Rao adjusted p (diagnostic) <InfoButton id="autocorrelation" /></>} />
          <Stat value={ci(t.slope_ci)} label={<>95% OLS anomaly interval (not a Sen CI) <InfoButton id="confidence-interval" /></>} />
        </div>
      </Section>
      <Section title="Significance and uncertainty">
        <p style={{ margin: 0, font: "600 14.5px/1.5 var(--body)" }}>{dir} seasonal Sen slope; raw Seasonal MK p {pval(t.p_value).startsWith("<") ? "" : "= "}{pval(t.p_value)}, α = {alpha}; the reported significance {decided}</p>
        <span className="small muted">The adjusted p does not change the verdict. The interval targets the OLS slope of anomalies with no HAC adjustment, a different estimator from Sen.{" "}
          <Term id="autocorrelation">Autocorrelation</Term> can make raw p-values optimistic.</span>
      </Section>
      <Section title="Methodology">
        <span className="small">Test: {nice(x.method, "Seasonal Mann-Kendall")} · rate: {nice(x.slope_method, "seasonal Sen slope")} · interval: {nice(t.ci_method, "OLS slope of monthly anomalies")}.
          Sufficiency: at least 10 years and 70% of months. Map cells use BH-FDR across cells (<Term id="fdr">FDR</Term>); this regional result is a single test.</span>
      </Section>
      {t.warnings.length > 0 && <Section title="Warnings">{t.warnings.map((w) => <div key={w} className="warn">{w}</div>)}</Section>}
      <details className="disclose">
        <summary>Assumptions, limitations and provenance</summary>
        <ul style={{ margin: 0, paddingLeft: 18, font: "600 13.5px/1.5 var(--body)" }}>
          <li>Seasonal MK assumes independence between years; serial dependence can inflate significance.</li>
          <li>Regions are latitude-longitude boxes on the processed grid; countries and drawn areas are box approximations.</li>
          <li>GLDAS is a land-surface model and MERRA-2 a reanalysis; neither is a direct local measurement.</li>
          <li>Estimated past trend only: no forecast and no causal attribution.</li>
          <li>Source: <a href={t.source.url} target="_blank" rel="noreferrer">{t.source.product} v{t.source.version}</a>, {t.source.provider}.</li>
        </ul>
      </details>
      {actions}
    </div>
  );
}
