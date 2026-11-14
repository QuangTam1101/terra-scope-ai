/** Guided tour definition and persisted completion state. Pure module: no React, safe to unit test. */
export const ONBOARDING_KEY = "terra-scope:onboarding:v1";

export type TourPage = "explore" | "hunt" | "detective" | "report";
export interface TourStep {
  id: string;
  page: TourPage;
  /** CSS selector of a REAL element; null = centred card with no highlight. */
  target: string | null;
  title: string;
  body: string;
}

// Each target is a data-tour attribute placed on an existing control. If a target is missing at run time the
// step is shown as a centred card instead of pointing at nothing.
export const TOUR_STEPS: TourStep[] = [
  { id: "welcome", page: "explore", target: null, title: "Welcome to Terra-scope",
    body: "I'm Terra, your Earth detective. In two minutes I'll show you how to check whether something on Earth is really changing, using NASA data. Nothing will be run or changed during this tour." },
  { id: "variable", page: "explore", target: '[data-tour="variable"]', title: "1. Pick what to check",
    body: "Choose an environmental variable: precipitation, soil moisture, air temperature or evapotranspiration. Greyed-out options have no data yet." },
  { id: "dataset", page: "explore", target: '[data-tour="dataset"]', title: "2. Choose a NASA dataset",
    body: "Some variables come from more than one NASA product (a satellite estimate, a land model or a reanalysis). They can disagree and cover different areas, so compare them." },
  { id: "map", page: "explore", target: '[data-tour="map"]', title: "3. Explore the map",
    body: "Colours show the trend per decade in each grid cell: orange rising, blue falling, pale stripes could be chance, grey no data. Scroll or use + and − to zoom, right-drag to move." },
  { id: "place", page: "explore", target: '[data-tour="place"]', title: "4. Select a place",
    body: "Type a country or city, enter coordinates, or click a cell (or drag a box) on the map." },
  { id: "years", page: "explore", target: '[data-tour="years"]', title: "5. Set the time range",
    body: "Pick the first and last year. A trend test needs at least 10 years of data." },
  { id: "run", page: "explore", target: '[data-tour="run"]', title: "6. Run the analysis",
    body: "Press Run analysis when you are ready. The backend computes the trend and its p-value from the NASA data; nothing is guessed in the browser." },
  { id: "hunt", page: "hunt", target: '[data-tour="hunt"]', title: "7. Compare two regions",
    body: "Hunt tests whether two places change differently. Opposite arrows are not enough: a contradiction is confirmed only when the difference itself is statistically significant." },
  { id: "detective", page: "detective", target: '[data-tour="detective-input"]', title: "8. Ask the Detective",
    body: "Ask a question in plain language. With Gemini connected, Terra chooses safe backend tools; otherwise Template Mode answers. Either way, the numbers come from the statistics engine." },
  { id: "evidence", page: "detective", target: '[data-tour="detective-evidence"]', title: "9. Check the evidence",
    body: "Each answer carries its evidence: rate, p-value, interval, data quality and source. p below 0.05 means the trend is unlikely to be chance; it never proves a cause." },
  { id: "report", page: "report", target: '[data-tour="report"]', title: "10. Create a report",
    body: "Analyses you run are collected here with their method and NASA source. Export them as Markdown or print to PDF." },
  { id: "finish", page: "explore", target: null, title: "You're ready, detective!",
    body: "Start exploring on your own. You can replay this tour any time from the menu." },
];

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

function store(s?: StorageLike | null): StorageLike | null {
  if (s !== undefined) return s;
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

/** True when this browser already finished or skipped the tour. Unavailable storage counts as "not completed". */
export function isOnboardingDone(s?: StorageLike | null): boolean {
  try { return store(s)?.getItem(ONBOARDING_KEY) === "done"; } catch { return false; }
}

/** Remember completion; returns false when storage is unavailable (private mode), never throws. */
export function markOnboardingDone(s?: StorageLike | null): boolean {
  try { const st = store(s); if (!st) return false; st.setItem(ONBOARDING_KEY, "done"); return true; } catch { return false; }
}

/** Auto-start only for first-time users entering from the landing page, and only once per session. */
export function shouldAutoStart(fromLanding: boolean, startedThisSession: boolean, s?: StorageLike | null): boolean {
  return fromLanding && !startedThisSession && !isOnboardingDone(s);
}

export function clampStep(i: number): number {
  return Math.max(0, Math.min(TOUR_STEPS.length - 1, Math.trunc(i)));
}
