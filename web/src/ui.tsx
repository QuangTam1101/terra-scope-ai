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

export function Stat({ value, label, title }: { value: ReactNode; label: ReactNode; title?: string }) {
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

// ---------- parameter icons (Explore "What would you like to investigate?" tiles) ----------
// Key = catalog.PARAMETERS id. Fixed pastel badge + dark ink (#2b2540) so the icon reads in light and dark mode.
// Third item: short tile label (the full catalog name is the tile's accessible name and leads the line under the tiles).
const PARAM_ICON: Record<string, [string, ReactNode, string]> = {
  precipitation: ["#dcecff", <><path {...P} d="M7 14a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.6 7.5 3.3 3.3 0 0 1 17 14z" /><path {...P} d="M8 17.5l-1 2.5M12 17.5l-1 2.5M16 17.5l-1 2.5" /></>, "Rainfall"],
  soil_moisture: ["#f3e3cf", <><path {...P} d="M12 3c-2.5 3.2-4 5.4-4 7.3a4 4 0 0 0 8 0C16 8.4 14.5 6.2 12 3z" /><path {...P} d="M4 17.5h16M7 21h10" /></>, "Soil moisture"],
  air_temperature: ["#ffe1d6", <><path {...P} d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z" /><path {...P} d="M12 9v7" /></>, "Air temperature"],
  evapotranspiration: ["#dff3e6", <><path {...P} d="M12 21v-6M12 15c-3.5 0-5.5-2-5.5-5.5 3.5 0 5.5 2 5.5 5.5zM12 15c0-3.5 2-5.5 5.5-5.5 0 3.5-2 5.5-5.5 5.5z" /><path {...P} d="M9 2.5c1 1 1 2 0 3M15 2.5c1 1 1 2 0 3" /></>, "Evaporation"],
  potential_evapotranspiration: ["#fff1c9", <><circle {...P} cx="12" cy="15" r="3.5" /><path {...P} d="M4 21h16M8 3c1 1 1 2 0 3M12 2c1 1 1 2 0 3M16 3c1 1 1 2 0 3" /></>, "Water demand"],
  vegetation: ["#dcf3dc", <><path {...P} d="M12 21v-9M12 12C12 8 9 5 4 5c0 5 3 7 8 7zM12 12c0-3.5 3-6 8-6 0 4-3 6-8 6z" /></>, "Greenness"],
  land_surface_temperature: ["#ffe8c7", <><circle {...P} cx="12" cy="10" r="3.5" /><path {...P} d="M12 3v1.5M5 10h1.5M17.5 10H19M7 5l1 1M17 5l-1 1M3 19h18M7 16h10" /></>, "Ground temperature"],
  root_zone_water: ["#eadfce", <><path {...P} d="M12 11V4M12 7c-2 0-4-1.5-4-4 2 0 4 1.5 4 4zM4 11h16M12 11v9M12 14.5l-3.5 3.5M12 14.5l3.5 3.5" /></>, "Root-zone water"],
  ocean_chlorophyll: ["#d8f0f3", <><path {...P} d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M7 19h.01M12 19.5h.01M17 19h.01" /></>, "Ocean algae"],
  water_storage: ["#dfe6ff", <><path {...P} d="M12 7c-2 2.6-3.5 4.4-3.5 6a3.5 3.5 0 0 0 7 0c0-1.6-1.5-3.4-3.5-6z" /><path {...P} d="M3.5 15.5c2 4 15 4 17 0M17 3h3v3h-3zM15.5 6.5l1.5-1.5" /></>, "Land water"],
  snow: ["#e8f1ff", <><path {...P} d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M10 4.5l2 1.5 2-1.5M10 19.5l2-1.5 2 1.5" /></>, "Snow"],
  air_haze: ["#ece9e4", <><path {...P} d="M4 7h10M7 11h13M4 15h11M8 19h9M18 7h.01M18 15h.01" /></>, "Air haze"],
  fire: ["#ffd9cc", <><path {...P} d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1.5 1 2 2 2 3 1-2 1-4 1-7z" /></>, "Fire"],
  extreme_days: ["#ede6fb", <><path {...P} d="M13 2L5 13h6l-1 9 8-11h-6l1-9z" /></>, "Extreme days"],
};
export const paramShort = (id: string, name: string) => PARAM_ICON[id]?.[2] ?? name;

// Tiles in three themes, so 14 choices read as 3 small groups. A parameter missing here joins the last theme.
const THEMES: [string, string[]][] = [
  ["Water", ["precipitation", "soil_moisture", "root_zone_water", "water_storage", "snow", "evapotranspiration", "potential_evapotranspiration"]],
  ["Heat and extremes", ["air_temperature", "land_surface_temperature", "extreme_days"]],
  ["Life, fire and air", ["vegetation", "ocean_chlorophyll", "fire", "air_haze"]],
];
export function byTheme<T>(items: [string, T][]): [string, [string, T][]][] {
  const listed = new Set(THEMES.flatMap(([, ids]) => ids));
  return THEMES.map(([name, ids], i): [string, [string, T][]] => [name, [
    ...ids.flatMap((id) => items.filter(([k]) => k === id)),
    ...(i === THEMES.length - 1 ? items.filter(([k]) => !listed.has(k)) : []),
  ]]).filter(([, xs]) => xs.length > 0);
}
export function ParamIcon({ id }: { id: string }) {
  const [tint, glyph] = PARAM_ICON[id] ?? ["#ece9e4", <circle {...P} cx="12" cy="12" r="7" />];
  return <span className="param-icon" style={{ background: tint }}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{glyph}</svg></span>;
}
