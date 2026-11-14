import type { ChatToolResult, CompareResponse, SeriesResponse, Variable, RegionsResponse } from "./api";
import { TrendChart } from "./TrendChart";
import { seriesF } from "./units";

export function ToolDetails({ result, fahrenheit }: { result: ChatToolResult; fahrenheit: boolean }) {
  if (!result.ok) return <div className="warn" role="alert"><b>{result.error?.category}</b>: {result.error?.message}</div>;
  if (result.tool === "get_time_series") {
    const raw = result.data as SeriesResponse;
    const temperature = raw.units === "degC" || raw.units === "°C";
    const series = temperature && fahrenheit ? seriesF(raw) : raw;
    return <section className="ev-compare" aria-label="Monthly observations" style={{ width: "100%", minWidth: 0 }}>
      <b className="ev-title">Monthly observations · {raw.region.name ?? "Selected area"}</b>
      <span className="small muted">{raw.points[0]?.t} to {raw.points.at(-1)?.t} · {raw.quality.n_months} valid months · {raw.quality.missing_months} missing</span>
      <TrendChart lines={[{ series, label: raw.region.name ?? "Selected area" }]} anomaly={false} height={240} units={temperature ? (fahrenheit ? "°F" : "°C") : raw.units} />
    </section>;
  }
  if (result.tool === "compare_regions") {
    const c = result.data as CompareResponse;
    return <section className="col" aria-label="Between-region comparison">
      <b>Between-region statistical test</b><span>{c.plain_summary}</span>
      <span className="small">Test: {c.difference.test}</span>
      <span>Difference p-value: {c.difference.p_value === null ? "unavailable" : c.difference.p_value.toPrecision(4)} · significant: {String(c.difference.significant)}</span>
      <span className="small muted">This tests the difference between trends. Opposite descriptive slopes alone are not proof of a significant difference.</span>
    </section>;
  }
  if (result.tool === "get_dataset_provenance") {
    const p = result.data as { variable: Variable; processing_notes: string[] };
    return <section className="ev-compare" aria-label="Dataset provenance">
      <b className="ev-title">{p.variable.name} · {p.variable.source.product} v{p.variable.source.version}</b>
      <span>{p.variable.source.provider} · {p.variable.units} · {p.variable.spatial_resolution_deg}° processed grid</span>
      <span>{p.variable.coverage ? `${p.variable.coverage.start} to ${p.variable.coverage.end}` : "Cube unavailable"}</span>
      {p.processing_notes.map((note) => <span className="small muted" key={note}>{note}</span>)}
      <a href={p.variable.source.url} target="_blank" rel="noreferrer">NASA source and citation</a>
    </section>;
  }
  if (result.tool === "list_available_variables") {
    const catalog = result.data as { variables: Variable[] };
    return <section className="ev-compare" aria-label="Variable catalog"><b className="ev-title">Available NASA data</b>
      <ul className="ev-list">{catalog.variables.map((v) => <li key={v.id}><b>{v.parameter_name}</b> · {v.dataset_name} · {v.display_units} · {v.available ? `${v.coverage?.start.slice(0, 4)} to ${v.coverage?.end.slice(0, 4)}` : "not available yet"}</li>)}</ul>
    </section>;
  }
  if (result.tool === "list_available_regions") {
    const catalog = result.data as { catalog: RegionsResponse; supported_selection_types: string[] };
    return <section className="ev-compare" aria-label="Region catalog"><b className="ev-title">Ready-made places</b>
      <ul className="ev-list">{catalog.catalog.regions.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
      <span className="small muted">You can also pick any country, city, coordinates or a box on the Explore map.</span>
    </section>;
  }
  return null; // Trend cards already show the authoritative TrendResponse.
}
