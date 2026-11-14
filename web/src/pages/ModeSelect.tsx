import { useEffect, useRef, type JSX } from "react";
import type { Audience } from "../audience";
import { Terra } from "../ui";

const Compass = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z" fill="currentColor" opacity=".85" /></svg>
);
const Flask = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M7.4 15h9.2" stroke="currentColor" strokeWidth="1.6" /></svg>
);

const CARDS: { id: Audience; title: string; sub: string; text: string; points: string[]; cta: string; icon: () => JSX.Element }[] = [
  { id: "explorer", title: "Explore Earth", sub: "For curious minds and everyday explorers.",
    text: "Discover how our planet is changing through interactive maps, simple explanations, and guided investigations.",
    points: ["Understand trends without statistical training.", "Explore NASA data step by step.", "Learn scientific terms as you go.", "Get clear, evidence-based explanations."],
    cta: "Continue as Explorer", icon: Compass },
  { id: "scientist", title: "Scientific Analysis", sub: "For researchers and data-focused explorers.",
    text: "Investigate Earth observation trends using detailed statistics, methodological evidence, dataset metadata, and reproducible analyses.",
    points: ["Inspect complete statistical evidence.", "Explore methods and limitations.", "Compare NASA datasets.", "Access technical reports and provenance."],
    cta: "Continue as Scientist", icon: Flask },
];


/** Experience choice shown after Get Started. Neither card is preselected; the last choice is only marked. */
export function ModeSelect({ last, onChoose, onBack }: { last: Audience | null; onChoose: (a: Audience) => void; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div className="modeselect">
      <div className="ms-head">
        <button type="button" className="btn ghost" onClick={onBack}>Back to the start page</button>
        <span className="brand"><Terra size={34} /> Terra-scope</span>
      </div>
      <div className="ms-title">
        <h1 ref={heading} tabIndex={-1}>How would you like to explore Earth?</h1>
        <p>Choose the experience that works best for you. You can switch at any time.</p>
      </div>
      <div className="ms-cards">
        {CARDS.map((c) => (
          <section key={c.id} className={`ms-card ms-${c.id}`} aria-labelledby={`ms-${c.id}-t`}>
            <div className="ms-top">
              <span className="ms-icon"><c.icon /></span>
              {last === c.id && <span className="ms-last">Last used</span>}
            </div>
            <h2 id={`ms-${c.id}-t`}>{c.title}</h2>
            <p className="ms-sub">{c.sub}</p>
            <p>{c.text}</p>
            <ul>{c.points.map((p) => <li key={p}>{p}</li>)}</ul>
            <button type="button" className="btn ms-cta" onClick={() => onChoose(c.id)}>{c.cta}</button>
          </section>
        ))}
      </div>
      <p className="ms-foot">Both experiences use the same NASA data, the same statistics and the same verdicts. Only the explanations change.</p>
    </div>
  );
}
