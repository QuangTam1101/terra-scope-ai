import { StoreProvider, useStore, type Page } from "./store";
import { Icon, Terra } from "./ui";
import { Home } from "./pages/Home";
import { Landing } from "./pages/Landing";
import { Tour } from "./Tour";
import { AppChrome } from "./chrome";
import { markOnboardingDone, shouldAutoStart } from "./onboarding";
import { Component, lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

// Home does not need the map atlas or analysis/chat pages at first load.
const Explore = lazy(() => import('./pages/Explore').then((m) => ({ default: m.Explore })));
const Forecast = lazy(() => import('./pages/Forecast').then((m) => ({ default: m.Forecast })));
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
  { id: "forecast", label: "Forecast", icon: Icon.forecast },
  { id: "hunt", label: "Hunt", icon: Icon.hunt },
  { id: "detective", label: "Detective", icon: Icon.detective },
  { id: "report", label: "Report", icon: Icon.report },
];

const HelpIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6V14M12 17.2v.3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
const BackIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function Shell() {
  const { page, go, toast, clearToast, ready } = useStore();
  const [tourOpen, setTourOpen] = useState(false);
  const startedThisSession = useRef(false);

  // Get Started: enter the app; first-time users get the guided tour once (completion is remembered locally).
  const start = useCallback(() => {
    go("explore");
    if (shouldAutoStart(true, startedThisSession.current)) { startedThisSession.current = true; setTourOpen(true); }
  }, [go]);
  const replayTutorial = useCallback(() => { startedThisSession.current = true; setTourOpen(false); setTimeout(() => setTourOpen(true), 0); }, []);
  const toLanding = useCallback(() => { setTourOpen(false); go("landing"); }, [go]);
  const closeTour = useCallback(() => { markOnboardingDone(); setTourOpen(false); }, []);
  const chrome = useMemo(() => ({ replayTutorial, toLanding }), [replayTutorial, toLanding]);

  if (page === "landing") return <Landing onStart={start} />;

  return (
    <AppChrome.Provider value={chrome}>
    <div className="shell">
      <nav className="sidebar card" aria-label="Main">
        <span className="brand"><Terra size={34} /> Terra-scope</span>
        {NAV.map((n) => (
          <button key={n.id} type="button" className={`nav ${page === n.id ? "on" : ""}`} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
            <n.icon />{n.label}
          </button>
        ))}
        <div className="nav-extra">
          <button type="button" className="nav" onClick={replayTutorial}><HelpIcon />Replay Tutorial</button>
          <button type="button" className="nav" onClick={toLanding}><BackIcon />About Terra-scope</button>
        </div>
        <span className="prelim" style={{ marginTop: 6 }}>Preliminary · not yet validated</span>
      </nav>
      <main className="main">
        {!ready && !toast && <div className="card pad">Connecting to the Terra-scope server…</div>}
        <PageBoundary key={page}><Suspense fallback={<div className="card pad" role="status" aria-live="polite">Loading page…</div>}>
        {page === "home" && <Home />}
        {page === "explore" && <Explore />}
        {page === "forecast" && <Forecast />}
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
      <Tour open={tourOpen} page={page} go={go} onClose={closeTour} onReplay={replayTutorial} />
    </div>
    </AppChrome.Provider>
  );
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}
