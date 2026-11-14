/** Audience mode (Explorer / Scientist): presentation preference only. Pure module, safe to unit test.
 * The mode never changes data, statistics or verdicts; it only decides how the same evidence is presented. */
export type Audience = "explorer" | "scientist";
export const AUDIENCE_KEY = "terra-scope:audience-mode:v1";
/** Deep links that open the app without a stored preference use this documented default. */
export const DEFAULT_AUDIENCE: Audience = "explorer";

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

function store(s?: StorageLike | null): StorageLike | null {
  if (s !== undefined) return s;
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function isAudience(v: unknown): v is Audience { return v === "explorer" || v === "scientist"; }

/** The last explicitly chosen audience, or null when none was ever stored (or storage is unavailable). */
export function lastAudience(s?: StorageLike | null): Audience | null {
  try { const v = store(s)?.getItem(AUDIENCE_KEY); return isAudience(v) ? v : null; } catch { return null; }
}

export function initialAudience(s?: StorageLike | null): Audience { return lastAudience(s) ?? DEFAULT_AUDIENCE; }

/** Remember the choice; returns false when storage is unavailable (private mode). Never throws. */
export function saveAudience(a: Audience, s?: StorageLike | null): boolean {
  try { const st = store(s); if (!st) return false; st.setItem(AUDIENCE_KEY, a); return true; } catch { return false; }
}

export const AUDIENCE_LABEL: Record<Audience, string> = { explorer: "Explorer", scientist: "Scientist" };

/** Evidence strength shown to Explorer users, derived only from the backend verdict fields (never recomputed). */
export type Strength = "clear" | "not_yet" | "untested";
export function strengthOf(t: { significant: boolean | null; quality: { sufficient: boolean } }): Strength {
  if (!t.quality.sufficient || t.significant === null) return "untested";
  return t.significant ? "clear" : "not_yet";
}

/** Plain-language one-liner for Explorer mode. Uses only the sign of the backend slope and the backend verdict. */
export function plainFinding(t: { slope_per_decade: number | null; significant: boolean | null; quality: { sufficient: boolean } }, what: string): string {
  const s = strengthOf(t);
  if (s === "untested" || t.slope_per_decade === null) return `There is not enough data here to test whether ${what} is changing. A longer period may help.`;
  const dir = t.slope_per_decade > 0 ? "upward" : t.slope_per_decade < 0 ? "downward" : "flat";
  if (s === "clear") return `The data show a clear ${dir} trend in ${what}: the test says it is unlikely to be chance alone.`;
  return `The estimated trend in ${what} is ${dir}, but the evidence is not strong enough to confirm a clear change under the test used. That does not mean nothing is changing; a longer record may help.`;
}
