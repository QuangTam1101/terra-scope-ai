// Phase 8.5A: loading messages that describe the operation that is really running, not the page it runs on.
// No percentages: the backend reports no progress, so none is invented here.

export type GridOp = "grid-compute" | "grid-cache" | "grid-network" | "values-load";
export type StepState = "pending" | "done" | "failed";
export interface RegionalProgress {
  place: string; parameter: string; dataset: string; start: string; end: string;
  series: StepState; trend: StepState;
}

const span = (start: string, end: string) => `${start} to ${end}`;

/** Message for the map card while a grid layer is fetched. `cells` is the number of grid cells when known. */
export function gridMessage(op: GridOp, ctx: { dataset: string; start: string; end: string; cells?: number | null; month?: string }): { title: string; detail: string } {
  const period = span(ctx.start, ctx.end);
  switch (op) {
    case "grid-compute":
      return {
        title: "Computing trend statistics across the global grid…",
        detail: `${ctx.dataset}, ${period}${ctx.cells ? `, ${ctx.cells.toLocaleString("en-US")} grid cells` : ""}. This period has not been computed before, so the first time can take about a minute. Later visits load instantly.`,
      };
    case "grid-cache":
      return { title: "Loading previously computed analysis…", detail: `Global trend map for ${ctx.dataset}, ${period}.` };
    case "values-load":
      return { title: "Loading the values map…", detail: `${ctx.dataset}, ${period}${ctx.month ? `, ${ctx.month} only` : ""}.` };
    default:
      return { title: "Loading the map…", detail: `${ctx.dataset}, ${period}.` };
  }
}

/** Steps of a regional analysis (two real API calls run side by side). */
export function regionalSteps(p: RegionalProgress): { title: string; steps: { label: string; state: StepState }[] } {
  return {
    title: `Analyzing ${p.parameter.toLowerCase()} in ${p.place}…`,
    steps: [
      { label: `Building the monthly time series (${p.dataset}, ${span(p.start, p.end)})`, state: p.series },
      { label: "Testing the trend for statistical significance", state: p.trend },
    ],
  };
}

/** Grid cells for a global map at the given cell size (used only to describe the work, never as progress). */
export const globalCells = (cellDeg: number | null | undefined) =>
  cellDeg && cellDeg > 0 ? Math.round(360 / cellDeg) * Math.round(180 / cellDeg) : null;
