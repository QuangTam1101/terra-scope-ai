import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { clampStep, TOUR_STEPS, type TourPage } from "./onboarding";
import { Terra } from "./ui";

interface Props {
  open: boolean;
  page: string;
  go: (p: TourPage) => void;
  onClose: (completed: boolean) => void;
  onReplay: () => void;
}

const PAD = 8;            // space around the highlighted element
const WAIT_MS = 4000;     // how long to wait for a target after navigating

/**
 * Spotlight guided tour. It only navigates between pages and highlights existing controls: it never runs an
 * analysis, never calls Gemini and never changes the user's selection. Escape or "Skip tutorial" closes it.
 */
export function Tour({ open, page, go, onClose, onReplay }: Props) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const step = TOUR_STEPS[clampStep(index)];
  const last = index === TOUR_STEPS.length - 1;

  // Remember where focus was; give it back when the tour closes.
  useEffect(() => {
    if (open) { restoreFocus.current = document.activeElement as HTMLElement | null; setIndex(0); }
    else restoreFocus.current?.focus?.();
  }, [open]);

  // Move to the page of the step, then wait for its target element to exist.
  useEffect(() => {
    if (!open) return;
    if (step.page !== page) { setRect(null); go(step.page); return; }
    setMissing(false);
    if (!step.target) { setRect(null); return; }
    let cancelled = false;
    const t0 = performance.now();
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target!) as HTMLElement | null;
      if (el && el.getBoundingClientRect().width > 0) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        window.setTimeout(() => !cancelled && setRect(el.getBoundingClientRect()), reduce ? 0 : 350);
        return;
      }
      if (performance.now() - t0 > WAIT_MS) { setRect(null); setMissing(true); return; }
      window.setTimeout(find, 120);
    };
    find();
    return () => { cancelled = true; };
  }, [open, index, page, step, go]);

  // Keep the highlight on the element while the page scrolls or resizes.
  useEffect(() => {
    if (!open || !step.target) return;
    const update = () => {
      const el = document.querySelector(step.target!) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, step]);

  const close = useCallback((completed: boolean) => onClose(completed), [onClose]);
  const next = () => (last ? close(true) : setIndex((i) => clampStep(i + 1)));
  const back = () => setIndex((i) => clampStep(i - 1));

  // Keyboard: Escape closes, arrows move, Tab stays inside the tour card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft" && index > 0) back();
      else if (e.key === "Tab" && cardRef.current) {
        const f = [...cardRef.current.querySelectorAll<HTMLElement>("button")].filter((b) => !b.hasAttribute("disabled"));
        if (!f.length) return;
        const first = f[0], end = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
        else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Focus the primary button whenever a step appears.
  useLayoutEffect(() => {
    if (open) cardRef.current?.querySelector<HTMLElement>("[data-primary]")?.focus();
  }, [open, index, rect]);

  if (!open) return null;

  // Place the card below the target, else above, else centred; always inside the viewport.
  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(380, vw - 24);
  let style: CSSProperties = { width: cardW, left: (vw - cardW) / 2, top: Math.max(24, vh / 2 - 150) };
  if (rect) {
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - cardW / 2, vw - cardW - 12));
    if (rect.bottom + PAD + 230 < vh) style = { width: cardW, left, top: rect.bottom + PAD + 12 };
    else if (rect.top - PAD - 230 > 0) style = { width: cardW, left, top: rect.top - PAD - 12, transform: "translateY(-100%)" };
    else style = { width: cardW, left: Math.max(12, vw - cardW - 16), top: 16 };
  }

  return (
    <div className="tour" aria-live="polite">
      {/* Click shield: the app is not usable while a step is shown, so nothing is changed by accident. */}
      <div className="tour-shield" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div className="tour-spot" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      ) : <div className="tour-dim" />}
      <div ref={cardRef} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" style={style}>
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "nowrap" }}>
          {(step.id === "welcome" || step.id === "finish") && <Terra size={52} />}
          <h2 id="tour-title" style={{ fontSize: 19 }}>{step.title}</h2>
        </div>
        <p id="tour-body">{step.body}</p>
        {missing && <p className="small muted" role="status">This part of the screen is not available right now, so it is not highlighted.</p>}
        <div className="tour-progress" role="progressbar" aria-label="Tutorial progress" aria-valuemin={1} aria-valuemax={TOUR_STEPS.length} aria-valuenow={index + 1}
          aria-valuetext={`Step ${index + 1} of ${TOUR_STEPS.length}`}>
          <span style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }} />
        </div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="small muted num">Step {index + 1} of {TOUR_STEPS.length}</span>
          {last ? (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn soft" onClick={() => { setIndex(0); onReplay(); }}>Replay Tutorial</button>
              <button type="button" className="btn" data-primary onClick={() => close(true)}>Start Exploring</button>
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn ghost" onClick={() => close(false)}>Skip tutorial</button>
              <button type="button" className="btn soft" onClick={back} disabled={index === 0}>Back</button>
              <button type="button" className="btn" data-primary onClick={next}>Next</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
