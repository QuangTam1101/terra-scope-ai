import { useStore } from "../store";
import { ci, pval, signed, VERDICT_TEXT, verdictOf } from "../ui";

const LIMITS = [
  "A trend shows what changed, not why it changed.",
  "Trend lines are estimated past trends, not forecasts.",
  "Data are averaged on a 0.5° grid (about 55 km); small areas mix land and sea.",
  "GLDAS is a land model: land only, with no irrigation or flooding of rice fields.",
  "There is no salinity variable, so salt intrusion cannot be tested.",
  "All results are preliminary and not yet validated against independent sources.",
];

export function Report() {
  const { history, variables } = useStore();
  const used = variables.filter((v) => history.some((h) => h.variable.id === v.id));

  const markdown = () => {
    const rows = history.map((h) => `| ${h.place.label} | ${h.variable.parameter_name} · ${h.variable.dataset_name} | ${h.trend.start} to ${h.trend.end} | ${signed(h.trend.slope_per_decade)} ${h.variable.display_units} | ${ci(h.trend.slope_ci)} | ${pval(h.trend.p_value)} | ${VERDICT_TEXT[verdictOf(h.trend)]} |`);
    const md = [
      "# Terra-scope AI evidence report", "", "Preliminary · not yet validated", "",
      "| Place | Variable · dataset | Period | Sen's slope per decade | 95% CI | Mann–Kendall p | Verdict |",
      "|---|---|---|---|---|---|---|", ...rows, "",
      "## Method", "Monthly area averages on a 0.5° grid; Seasonal Mann–Kendall test with Sen's slope; Hamed–Rao autocorrelation-adjusted p; 95% CI from a linear fit on anomalies; maps use Benjamini–Hochberg FDR.", "",
      "## NASA datasets", ...used.map((v) => `- ${v.source.product} v${v.source.version}, ${v.source.provider}: ${v.source.url}`), "",
      "## Limitations", ...LIMITS.map((l) => `- ${l}`), "",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = "terra-scope-report.md";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <section className="card pad col">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 30 }}>Evidence report</h1>
          <span className="prelim">Preliminary · not yet validated</span>
        </div>
        {history.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No results yet. Run an analysis on Explore and it will appear here.</p>
        ) : (
          <div className="table-box">
            <table>
              <thead><tr><th>Place</th><th>Variable · dataset</th><th>Sen's slope per decade</th><th>95% CI</th><th>Mann–Kendall p</th><th>Autocorr.-adjusted p</th><th>Verdict</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.key}>
                  <td style={{ minWidth: 160 }}>{h.place.label}</td>
                  <td style={{ minWidth: 180 }}>{h.variable.parameter_name} · {h.variable.dataset_name}</td>
                  <td className="n">{signed(h.trend.slope_per_decade)} {h.variable.display_units}</td>
                  <td className="n">{ci(h.trend.slope_ci)}</td>
                  <td className="n">{pval(h.trend.p_value)}</td>
                  <td className="n">{pval(h.trend.p_value_autocorr_adjusted)}</td>
                  <td>{VERDICT_TEXT[verdictOf(h.trend)]}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="row noprint">
          <button type="button" className="btn" disabled={!history.length} onClick={markdown}>Export Markdown</button>
          <button type="button" className="btn soft" disabled={!history.length} onClick={() => window.print()}>Print or save as PDF</button>
        </div>
      </section>
      <section className="card pad col">
        <h2 style={{ fontSize: 22 }}>How the evidence was tested</h2>
        <p style={{ margin: 0, lineHeight: 1.55 }}>Monthly values are averaged over the chosen area on a 0.5° grid. Seasons are removed, then the Seasonal Mann–Kendall test checks whether the change is steady enough to be unlikely by chance, and Sen's slope gives the rate per decade. A second test (Hamed–Rao) adjusts for months that depend on each other. Maps correct for testing thousands of cells at once (Benjamini–Hochberg FDR).</p>
      </section>
      <section className="card pad col">
        <h2 style={{ fontSize: 22 }}>NASA datasets</h2>
        {(used.length ? used : variables.filter((v) => v.available)).map((v) => (
          <span key={v.id}>{v.source.product} v{v.source.version} · {v.source.provider} · <a href={v.source.url} target="_blank" rel="noreferrer">dataset page</a></span>
        ))}
      </section>
      <section className="card pad col">
        <h2 style={{ fontSize: 22 }}>Limitations</h2>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
    </div>
  );
}
