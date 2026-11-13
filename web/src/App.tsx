import { StoreProvider, useStore, type Page } from "./store";
import { Icon, Terra } from "./ui";
import { Home } from "./pages/Home";
import { Explore } from "./pages/Explore";
import { Hunt } from "./pages/Hunt";
import { Detective } from "./pages/Detective";
import { Report } from "./pages/Report";

import type { JSX } from "react";

const NAV: { id: Page; label: string; icon: () => JSX.Element }[] = [
  { id: "home", label: "Home", icon: Icon.home },
  { id: "explore", label: "Explore", icon: Icon.globe },
  { id: "hunt", label: "Hunt", icon: Icon.hunt },
  { id: "detective", label: "Detective", icon: Icon.detective },
  { id: "report", label: "Report", icon: Icon.report },
];

function Shell() {
  const { page, go, toast, clearToast, ready } = useStore();
  return (
    <div className="shell">
      <nav className="sidebar card" aria-label="Main">
        <span className="brand"><Terra size={34} /> Terra-scope</span>
        {NAV.map((n) => (
          <button key={n.id} type="button" className={`nav ${page === n.id ? "on" : ""}`} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
            <n.icon />{n.label}
          </button>
        ))}
        <span className="prelim" style={{ marginTop: 14 }}>Preliminary · not yet validated</span>
      </nav>
      <main className="main">
        {!ready && !toast && <div className="card pad">Connecting to the Terra-scope server…</div>}
        {page === "home" && <Home />}
        {page === "explore" && <Explore />}
        {page === "hunt" && <Hunt />}
        {page === "detective" && <Detective />}
        {page === "report" && <Report />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <button key={n.id} type="button" className={page === n.id ? "on" : ""} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
            <n.icon />{n.label}
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="alert"><span style={{ flex: 1 }}>{toast}</span>
          <button type="button" aria-label="Dismiss" onClick={clearToast}>×</button></div>
      )}
    </div>
  );
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}
