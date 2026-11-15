// Light / dark theme. The choice lives on <html data-theme="light|dark">; index.html applies the saved choice (or the
// system preference) before the first paint, so there is no flash. Report pages and printing always stay light (styles.css).
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "terra-scope:theme";

function systemTheme(): Theme {
  try { return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "light"; }
}

export function savedTheme(): Theme | null {
  try { const v = localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; } catch { return null; }
}

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";            // server-side rendering in tests
  const t = document.documentElement.dataset.theme;
  return t === "dark" || t === "light" ? t : savedTheme() ?? systemTheme();
}

export function applyTheme(t: Theme, remember = true) {
  document.documentElement.dataset.theme = t;
  if (remember) try { localStorage.setItem(KEY, t); } catch { /* private mode: the choice lasts for this page only */ }
  window.dispatchEvent(new CustomEvent("terra-theme", { detail: t }));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [t, setT] = useState<Theme>(() => currentTheme());
  useEffect(() => {
    const on = (e: Event) => setT((e as CustomEvent<Theme>).detail);
    window.addEventListener("terra-theme", on);
    // follow the system while the user has not chosen
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const sys = () => { if (!savedTheme()) applyTheme(systemTheme(), false); };
    mq?.addEventListener?.("change", sys);
    return () => { window.removeEventListener("terra-theme", on); mq?.removeEventListener?.("change", sys); };
  }, []);
  return [t, (n: Theme) => applyTheme(n)];
}

const Sun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
  </svg>
);
const Moon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);

/** Switch between light and dark. `className` lets each place style it like its neighbours. */
export function ThemeToggle({ className = "", label = true }: { className?: string; label?: boolean }) {
  const [t, set] = useTheme();
  const next: Theme = t === "dark" ? "light" : "dark";
  return (
    <button type="button" className={`theme-toggle ${className}`} onClick={() => set(next)}
      aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {t === "dark" ? <Sun /> : <Moon />}{label && (t === "dark" ? "Light mode" : "Dark mode")}
    </button>
  );
}
