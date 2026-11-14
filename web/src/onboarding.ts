/** Guided tour definitions (one per audience) and persisted completion state. Pure module: no React, safe to unit test. */
export const ONBOARDING_KEY = "terra-scope:onboarding:v1";

export type TourPage = "explore" | "hunt" | "detective" | "report";
export interface TourStep {
  id: string;
  page: TourPage;
  /** CSS selector of a REAL element; null = centred card with no highlight. */
  target: string | null;
  title: string;
  body: string;
  /** Shown instead of a highlight when the target does not exist yet (for example results before a run). */
  fallback?: string;
  /** Asks the page to show a view (no computation), e.g. "hunt:regions". Sent as a "terra-tour-prepare" event. */
  prepare?: string;
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
    body: "Start exploring on your own. Want every statistic? Switch the Mode to Scientist at the top of the page. You can replay this tour any time from the menu." },
];

/** Scientist tour: shorter and technical. Same rule: it only navigates and highlights, never runs anything. */
export const SCIENTIST_STEPS: TourStep[] = [
  { id: "welcome", page: "explore", target: null, title: "Scientist Mode",
    body: "A short technical tour: dataset provenance, grid and period, the trend test and its decision rule, region comparisons and reproducible reports. Nothing is run during the tour." },
  { id: "dataset", page: "explore", target: '[data-tour="dataset"]', title: "1. Product and version",
    body: "Each variable maps to a NASA product (GPM IMERG, GLDAS Noah, MERRA-2) processed to a common 0.5 degree grid. Products are satellite estimates, land models or reanalyses, and they can disagree." },
  { id: "years", page: "explore", target: '[data-tour="years"]', title: "2. Period and sufficiency",
    body: "Monthly series. A trend is tested only with at least 10 years and 70% of months present; otherwise the verdict is Insufficient evidence." },
  { id: "map", page: "explore", target: '[data-tour="map"]', title: "3. Cell-wise trend map",
    body: "Every cell is tested separately with Seasonal Mann-Kendall; hatching marks cells not significant after Benjamini-Hochberg FDR on raw cell p-values (no serial-dependence correction)." },
  { id: "run", page: "explore", target: '[data-tour="run"]', title: "4. Regional analysis",
    body: "The region is a latitude-longitude box averaged on the processed grid. The backend returns the seasonal Sen slope per decade, raw and autocorrelation-adjusted p-values and an OLS anomaly interval." },
  { id: "result", page: "explore", target: '[data-tour="result"]', title: "5. Decision basis",
    body: "The verdict uses the raw Seasonal Mann-Kendall p-value at alpha 0.05. The Hamed-Rao adjusted p is a diagnostic only, and the OLS interval is not a confidence interval for Sen's slope." },
  { id: "hunt", page: "hunt", target: '[data-tour="hunt"]', title: "6. Contradiction Hunter",
    body: "Two regions: the difference series of monthly anomalies (A minus B) is tested with the Hamed-Rao Mann-Kendall test (p-value), its trend is the Sen slope, and a moving-block bootstrap (12-month blocks) gives the 95% interval. A difference counts only when p is below 0.05 and the interval excludes zero. Dataset pairs are descriptive only." },
  { id: "detective", page: "detective", target: '[data-tour="detective-input"]', title: "7. Method Advisor",
    body: "Ask method questions (serial dependence, FDR scope, interval estimator). Answers are grounded in backend tool results; the language model never computes numbers." },
  { id: "report", page: "report", target: '[data-tour="report"]', title: "8. Reproducible report",
    body: "The Scientific report lists product, version, region box, period, grid, method and trend IDs; the JSON export holds every request and result for re-running." },
  { id: "finish", page: "explore", target: null, title: "Ready",
    body: "Switch to Explorer at any time for plain-language explanations of the same results; numbers and verdicts never change between modes." },
];

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
export type TourAudience = "explorer" | "scientist";

/** Explorer keeps the original key, so people who finished the first tour are not asked again. */
export const SCIENTIST_ONBOARDING_KEY = "terra-scope:onboarding:scientist:v1";
const keyOf = (a: TourAudience) => (a === "scientist" ? SCIENTIST_ONBOARDING_KEY : ONBOARDING_KEY);

export function tourSteps(a: TourAudience = "explorer"): TourStep[] { return a === "scientist" ? SCIENTIST_STEPS : TOUR_STEPS; }

function store(s?: StorageLike | null): StorageLike | null {
  if (s !== undefined) return s;
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

/** True when this browser already finished or skipped this audience's tour. Unavailable storage counts as "not completed". */
export function isOnboardingDone(s?: StorageLike | null, a: TourAudience = "explorer"): boolean {
  try { return store(s)?.getItem(keyOf(a)) === "done"; } catch { return false; }
}

/** Remember completion; returns false when storage is unavailable (private mode), never throws. */
export function markOnboardingDone(s?: StorageLike | null, a: TourAudience = "explorer"): boolean {
  try { const st = store(s); if (!st) return false; st.setItem(keyOf(a), "done"); return true; } catch { return false; }
}

/** Auto-start only for first-time users entering from the experience choice, and only once per session. */
export function shouldAutoStart(fromLanding: boolean, startedThisSession: boolean, s?: StorageLike | null, a: TourAudience = "explorer"): boolean {
  return fromLanding && !startedThisSession && !isOnboardingDone(s, a);
}

export function clampStep(i: number, count: number = TOUR_STEPS.length): number {
  return Math.max(0, Math.min(count - 1, Math.trunc(i)));
}

/* ---------------------------------------------------------------- Contradiction Hunter tour (scoped to the Hunt page) */
// Separate, versioned completion per audience. It only highlights real Hunt controls and may switch the Hunt view to
// "Compare regions" so the selectors exist; it never runs a comparison, never calls Gemini, never changes data.
export const HUNT_TOUR_KEYS: Record<TourAudience, string> = {
  explorer: "terra-scope:hunt-tour:explorer:v1",
  scientist: "terra-scope:hunt-tour:scientist:v1",
};
const RESULT_FALLBACK = "This part appears after you run a comparison, so it is not highlighted yet.";

export const HUNT_STEPS_EXPLORER: TourStep[] = [
  { id: "welcome", page: "hunt", target: null, title: "Contradiction Hunter",
    body: "Different places and datasets can tell different stories. Let's investigate why. Nothing is run during this tour." },
  { id: "modes", page: "hunt", target: '[data-tour="hunt-modes"]', title: "1. Choose an investigation",
    body: "Compare two places, two NASA datasets for the same place, or two periods for the same place. Each card says what it can and cannot show." },
  { id: "config", page: "hunt", target: '[data-tour="hunt-config"]', prepare: "hunt:regions", title: "2. Pick A and B",
    body: "Choose what goes on each side. Both sides use the same variable, units and years, so the comparison is fair." },
  { id: "run", page: "hunt", target: '[data-tour="hunt-run"]', prepare: "hunt:regions", title: "3. Run the comparison",
    body: "When you press this, the server builds both monthly series from NASA data and tests each trend. Nothing is guessed in your browser." },
  { id: "visual", page: "hunt", target: '[data-tour="hunt-visual"]', fallback: RESULT_FALLBACK, title: "4. Read the maps and charts",
    body: "A and B sit side by side with the same units. Orange lines rise, blue lines fall; a dashed line means the test did not confirm the trend." },
  { id: "evidence", page: "hunt", target: '[data-tour="hunt-evidence"]', fallback: RESULT_FALLBACK, title: "5. Understand the evidence",
    body: "Two arrows pointing opposite ways is a description. Only a test of the gap itself can confirm that two places really change differently." },
  { id: "detective", page: "hunt", target: '[data-tour="hunt-detective"]', fallback: RESULT_FALLBACK, title: "6. Ask the Detective",
    body: "Send this comparison to the Detective. It recalculates the evidence itself and explains it; it never invents numbers." },
  { id: "save", page: "hunt", target: '[data-tour="hunt-save"]', fallback: RESULT_FALLBACK, title: "7. Save and report",
    body: "Save the investigation in this browser with your own notes, or add it to your report." },
  { id: "finish", page: "hunt", target: null, title: "Happy hunting!",
    body: "Start with a card above. You can replay this Hunt tutorial any time from the help button on this page." },
];

export const HUNT_STEPS_SCIENTIST: TourStep[] = [
  { id: "welcome", page: "hunt", target: null, title: "Contradiction Hunter",
    body: "Explore cross-region, cross-product and temporal trend disagreements with traceable evidence. Nothing is computed during the tour." },
  { id: "modes", page: "hunt", target: '[data-tour="hunt-modes"]', title: "1. Comparison type",
    body: "Regions: formal difference test on the anomaly difference series. Datasets and periods: descriptive only, because no approved two-sample test exists for them." },
  { id: "config", page: "hunt", target: '[data-tour="hunt-config"]', prepare: "hunt:regions", title: "2. Configure A and B",
    body: "Comparability is checked deterministically: physical quantity, units, period overlap, spatial coverage, product kind and native resolution." },
  { id: "run", page: "hunt", target: '[data-tour="hunt-run"]', prepare: "hunt:regions", title: "3. Execute",
    body: "Runs /compare (regions) or two /trends requests (datasets, periods). Each side: raw Seasonal Mann-Kendall at α = 0.05 and seasonal Sen slope." },
  { id: "visual", page: "hunt", target: '[data-tour="hunt-visual"]', fallback: RESULT_FALLBACK, title: "4. Maps and series",
    body: "Shared time axis, single y-axis in common units, monthly anomalies; trend lines carry the reported Sen slopes. Missing months are gaps, never interpolated." },
  { id: "evidence", page: "hunt", target: '[data-tour="hunt-evidence"]', fallback: RESULT_FALLBACK, title: "5. Evidence status",
    body: "Statistically tested difference requires Hamed-Rao p < 0.05 on the A minus B anomaly series and a 95% moving-block bootstrap interval excluding zero. Significant versus non-significant alone is never treated as a difference." },
  { id: "detective", page: "hunt", target: '[data-tour="hunt-detective"]', fallback: RESULT_FALLBACK, title: "6. Detective handoff",
    body: "Only identifiers are sent (variable, regions, periods); the backend re-resolves and recomputes the evidence before the model writes anything." },
  { id: "save", page: "hunt", target: '[data-tour="hunt-save"]', fallback: RESULT_FALLBACK, title: "7. Reproducible record",
    body: "Saved investigations keep configuration, evidence IDs, statistics, method and limitations (local browser only); Add to Report places it in both report editions." },
  { id: "finish", page: "hunt", target: null, title: "Ready",
    body: "Pick a comparison type to begin. Replay this tutorial from the help button on the Hunt page." },
];

export const huntSteps = (a: TourAudience = "explorer") => (a === "scientist" ? HUNT_STEPS_SCIENTIST : HUNT_STEPS_EXPLORER);
export function isHuntTourDone(s?: StorageLike | null, a: TourAudience = "explorer"): boolean {
  try { return store(s)?.getItem(HUNT_TOUR_KEYS[a]) === "done"; } catch { return false; }
}
export function markHuntTourDone(s?: StorageLike | null, a: TourAudience = "explorer"): boolean {
  try { const st = store(s); if (!st) return false; st.setItem(HUNT_TOUR_KEYS[a], "done"); return true; } catch { return false; }
}
/** First Hunt visit: start only when the main tour is closed, nothing is running and it was not shown this session. */
export function shouldAutoStartHunt(onHunt: boolean, mainTourOpen: boolean, busy: boolean, shownThisSession: boolean, s?: StorageLike | null, a: TourAudience = "explorer"): boolean {
  return onHunt && !mainTourOpen && !busy && !shownThisSession && !isHuntTourDone(s, a);
}
