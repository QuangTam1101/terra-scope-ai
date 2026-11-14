import type { ReactNode } from "react";
import type { TrendResponse } from "./api";

// ---------- formatting (presentation only; every number comes from the API) ----------
const MINUS = "−";
export function signed(x: number | null | undefined, digits?: number): string {
  if (x === null || x === undefined || !isFinite(x)) return "n/a";
  const d = digits ?? (Math.abs(x) >= 10 ? 1 : Math.abs(x) >= 0.1 ? 2 : Math.abs(x) >= 0.001 ? 4 : 5);
  const s = Math.abs(x).toFixed(d);
  return (x > 0 ? "+" : x < 0 ? MINUS : "") + s;
}
export function plain(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !isFinite(x)) return "n/a";
  return (x < 0 ? MINUS : "") + Math.abs(x).toFixed(digits);
}
export function pval(p: number | null | undefined): string {
  if (p === null || p === undefined || !isFinite(p)) return "n/a";
  return p < 0.001 ? "<0.001" : p.toFixed(3);
}
export function ci(c: [number, number] | null | undefined, digits?: number): string {
  if (!c) return "n/a";
  return `[${signed(c[0], digits)}, ${signed(c[1], digits)}]`;
}

// ---------- verdict ----------
export type Verdict = "sig" | "np" | "ne";
export function verdictOf(t: Pick<TrendResponse, "quality" | "significant">): Verdict {
  if (!t.quality.sufficient) return "ne";
  return t.significant ? "sig" : "np";
}
export const VERDICT_TEXT: Record<Verdict, string> = {
  sig: "Clear trend (significant)",
  np: "Not proven yet",
  ne: "Not enough data",
};
export function VerdictBadge({ t }: { t: Pick<TrendResponse, "quality" | "significant"> }) {
  const v = verdictOf(t);
  return <span className={`badge ${v}`}>{v === "sig" ? "✓ " : ""}{VERDICT_TEXT[v]}</span>;
}

export function Stat({ value, label, title }: { value: ReactNode; label: string; title?: string }) {
  return <div className="stat" title={title}><b>{value}</b><small>{label}</small></div>;
}

// ---------- Terra mascot (original vector, from the v4 Cute design) ----------
export function Terra({ size = 96, label }: { size?: number; label?: string }) {
  return (
    <svg viewBox="0 0 110 100" width={size} height={size * 0.9} role={label ? "img" : undefined}
      aria-label={label} aria-hidden={label ? undefined : true} style={{ flex: "none" }}>
      <circle cx="50" cy="58" r="34" fill="#8cc4ee" />
      <path d="M26 50c5-9 17-8 19 0s-5 13-11 13-12-5-8-13z" fill="#9edbb5" />
      <path d="M58 74c4-6 14-6 16 0s-4 9-9 9-9-4-7-9z" fill="#9edbb5" />
      <path d="M60 40c6-3 13 1 11 7s-9 5-12 1-2-7 1-8z" fill="#9edbb5" />
      <circle cx="40" cy="60" r="4" fill="#2b2540" /><circle cx="58" cy="60" r="4" fill="#2b2540" />
      <circle cx="41.3" cy="58.6" r="1.3" fill="#fff" /><circle cx="59.3" cy="58.6" r="1.3" fill="#fff" />
      <circle cx="33" cy="68" r="4.5" fill="#f6a7a0" opacity=".75" /><circle cx="65" cy="68" r="4.5" fill="#f6a7a0" opacity=".75" />
      <path d="M43 69q6 5 12 0" fill="none" stroke="#2b2540" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="50" cy="31" rx="33" ry="6" fill="#7a4a2e" />
      <path d="M29 31q1-19 21-19t21 19z" fill="#9b6440" />
      <rect x="30" y="24" width="40" height="5" rx="2.5" fill="#f6c94c" />
      <circle cx="92" cy="70" r="11" fill="#eaf7ff" stroke="#2b2540" strokeWidth="4" />
      <path d="M84 78l-10 10" stroke="#2b2540" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------- line icons ----------
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Icon = {
  home: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M4 11l8-7 8 7v9H4z" /><path {...P} d="M10 20v-6h4v6" /></svg>,
  globe: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle {...P} cx="12" cy="12" r="9" /><path {...P} d="M3 12h18M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18" /></svg>,
  forecast: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M3 17l5-6 4 3 6-8" /><path {...P} d="M15 6h4v4" /><path {...P} d="M3 21h18" /></svg>,
  hunt: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M7 4v16M17 4v16M4 8l3-4 3 4M14 16l3 4 3-4" /></svg>,
  detective: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle {...P} cx="11" cy="11" r="6" /><path {...P} d="M16 16l5 5" /></svg>,
  report: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path {...P} d="M6 3h9l4 4v14H6z" /><path {...P} d="M9 12h7M9 16h7" /></svg>,
};
