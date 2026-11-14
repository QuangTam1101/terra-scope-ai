import { StoreProvider, useStore, type Page } from "./store";
import { Icon, Terra } from "./ui";
import { Home } from "./pages/Home";
import { Component, lazy, Suspense, type ReactNode } from 'react';

// Home does not need the map atlas or analysis/chat pages at first load.
const Explore = lazy(() => import('./pages/Explore').then((m) => ({ default: m.Explore })));
const Hunt = lazy(() => import('./pages/Hunt').then((m) => ({ default: m.Hunt })));
const Detective = lazy(() => import('./pages/Detective').then((m) => ({ default: m.Detective })));
const Report = lazy(() => import('./pages/Report').then((m) => ({ default: m.Report })));

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <section className="card pad col" role="alert">
      <b>The page could not load.</b><span>Check the local server connection, then reload. Reloading clears session chat and results.</span>
      <button className="btn" type="button" onClick={() => location.reload()}>Reload application</button>
    </section> : this.props.children;
  }
}

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
        <PageBoundary key={page}><Suspense fallback={<div className="card pad" role="status" aria-live="polite">Loading page…</div>}>
        {page === "home" && <Home />}
        {page === "explore" && <Explore />}
        {page === "hunt" && <Hunt />}
        {page === "detective" && <Detective />}
        {page === "report" && <Report />}
        </Suspense></PageBoundary>
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
