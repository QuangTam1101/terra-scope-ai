// Selected analysis period: years plus optional start and end months (default January to December).
export interface PeriodSel { startYear: number; endYear: number; startMonth?: number; endMonth?: number }
const mm = (m: number | undefined, d: number) => String(m ?? d).padStart(2, "0");
/** First month of the selected period, "YYYY-MM" (January when no month was picked). */
export const periodStart = (s: PeriodSel) => `${s.startYear}-${mm(s.startMonth, 1)}`;
/** Last month of the selected period, "YYYY-MM" (December when no month was picked). */
export const periodEnd = (s: PeriodSel) => `${s.endYear}-${mm(s.endMonth, 12)}`;
/** Number of months in the selected period. */
export const periodMonths = (s: PeriodSel) => (s.endYear - s.startYear) * 12 + (s.endMonth ?? 12) - (s.startMonth ?? 1) + 1;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2001-06","2025-05" → "Jun 2001 to May 2025"; whole calendar years stay "2001 to 2025". */
export function periodText(start: string, end: string): string {
  if (start.slice(5, 7) === "01" && end.slice(5, 7) === "12") return `${start.slice(0, 4)} to ${end.slice(0, 4)}`;
  const f = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1] ?? ""} ${ym.slice(0, 4)}`.trim();
  return `${f(start)} to ${f(end)}`;
}

/** Clamp the chosen period to a variable's coverage. null: no overlap. short: under 10 calendar years (the backend's test needs 10 years with data). */
export function clampPeriod(start: string, end: string, coverage: { start: string; end: string } | null) {
  if (!coverage) return null;
  const s = start > coverage.start ? start : coverage.start, e = end < coverage.end ? end : coverage.end;
  if (s > e) return null;
  return { start: s, end: e, clamped: s !== start || e !== end, short: Number(e.slice(0, 4)) - Number(s.slice(0, 4)) + 1 < 10 };
}
