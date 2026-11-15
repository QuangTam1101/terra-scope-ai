// "How Terra-scope meets the challenge" on #guide: each official objective and main consideration of NASA's
// "Be an Earth System Trend Detective", mapped to the screen that delivers it. Every row was checked against the code
// it names (Explore.tsx, CaseStarter.tsx, ResultViews.tsx, Hunt.tsx, OppositeTrends.tsx, chat/sources.ts, backend chat FAQ);
// keep it so when features change.
import type { MouseEvent, ReactNode } from "react";
import { InfoButton } from "./InfoButton";
import { useStore, type Page } from "./store";

type Row = { tag: string; need: string; where: string; page: Page | "demos"; how: ReactNode; info?: string[]; partly?: boolean };

export const CHALLENGE_ROWS: Row[] = [
  { tag: "Objective 1", need: "Find variables that could show a trend", where: "Explore, question 1", page: "explore",
    how: "Choose rain, soil water, air temperature, evaporation, vegetation, ocean chlorophyll and more, each with a plain definition." },
  { tag: "Objective 2", need: "Get the data for a region", where: "Explore, question 4", page: "explore",
    how: "Search a place, click one map square or drag a box; download the monthly numbers (CSV) or open the same request in NASA Giovanni.",
    info: ["grid-cell"] },
  { tag: "Objective 3", need: "Plot a time series long enough to test", where: "Explore, monthly chart", page: "explore",
    how: "A monthly chart of your place and period. Terra tests only records with at least 10 years and 70\u00a0% of months present.",
    info: ["time-series"] },
  { tag: "Objective 4", need: "Rate of change and significance", where: "Explore, result", page: "explore",
    how: <>Rate: seasonal Sen slope per decade <InfoButton id="sens-slope" />. Significance: Seasonal Mann-Kendall p against
      0.05 <InfoButton id="mann-kendall" />, plus a 95&nbsp;% interval (OLS on anomalies) <InfoButton id="confidence-interval" />.</> },
  { tag: "Consideration", need: "Simple definitions", where: "Explore, beside each choice", page: "explore",
    how: "Variables, datasets and tests have an \"i\" button like this one. Scientist mode shows the method behind each.", info: ["p-value"] },
  { tag: "Consideration", need: "A short series of questions", where: "Home, Start investigating", page: "home",
    how: "Three questions (what you are curious about, what kind of place, which period) give a ranked list of variables, each with a reason; one click opens Explore with them filled in." },
  { tag: "Consideration", need: "Demo examples to watch", where: "Watch a case, above", page: "demos",
    how: "Three step-by-step demos run the real test on live data, including one where the change could be chance, plus ready-made opposite-trend pairs." },
  { tag: "Consideration", need: "Remove the seasonal cycle", where: "Explore, Anomaly chart", page: "explore",
    how: "The chart opens on anomalies (each month minus its usual value), and the test compares only the same months.",
    info: ["anomaly"] },
  { tag: "Consideration", need: "Some trends need a longer record", where: "Explore, Would more years help?", page: "explore",
    how: "After a test, Terra repeats it for every start year and estimates how many years a clear answer may need.",
    info: ["not-significant"] },
  { tag: "Consideration", need: "Opposite trends in different places", where: "Hunt, Same cause, opposite trends", page: "hunt",
    how: "Pick a measurement: Terra finds a place where it rises and one where it falls, tests the gap between them, and gives a sourced explanation of how one process can do both. Explore's \"Where does it go the other way?\" opens it." },
  { tag: "Consideration", need: "AI to suggest variables", where: "Start investigating and Detective chat", page: "detective", partly: true,
    how: "The Start investigating questions suggest variables from a reviewed table, and Terra's chat explains results with team-checked background reading for some places. An AI model does not pick variables yet." },
];

export function ChallengeMap() {
  const { go } = useStore();
  const open = (p: Row["page"]) => (e: MouseEvent) => {
    e.preventDefault();
    if (p === "demos") document.getElementById("guide-cases")?.scrollIntoView({ behavior: "smooth" });
    else go(p);
  };
  return (
    <section className="card pad col" aria-labelledby="guide-challenge">
      <h2 id="guide-challenge" style={{ fontSize: 22 }}>How Terra-scope meets the challenge</h2>
      <p className="small muted" style={{ margin: 0 }}>NASA's four objectives and main considerations, with the screen that does each.</p>
      <ul className="challenge-map">
        {CHALLENGE_ROWS.map((r) => (
          <li key={r.need}>
            <span className="cm-need"><span className="cm-tag">{r.tag}</span>{r.need}
              {r.partly && <span className="cm-partly">Partly</span>}</span>
            <span className="cm-how">{r.how}{r.info?.map((id) => <span key={id}> <InfoButton id={id} /></span>)}</span>
            <a className="cm-go" href={`#${r.page === "demos" ? "guide" : r.page}`} onClick={open(r.page)}>{r.where} →</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
