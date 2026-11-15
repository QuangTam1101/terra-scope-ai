import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type GlossaryId } from "./glossary";
import { useStore } from "./store";

/** A scientific word with an accessible "What does this mean?" button. Click, tap, Enter or Space opens it;
 * Escape or a click elsewhere closes it. Never hover-only. Explorer sees the plain text first, Scientist the technical one. */
export function Term({ id, children }: { id: GlossaryId; children?: ReactNode }) {
  const { audience } = useStore();
  const g = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const popId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); } };   // handled: the map keeps its selection
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey, true);   // capture: runs before the map's Escape (clear selection)
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("pointerdown", onDown); };
  }, [open]);
  if (!g) return <>{children}</>;
  const sci = audience === "scientist";
  return (
    <span className="term-wrap" ref={wrap}>
      <span className="term">{children ?? g.term}
        <button ref={btn} type="button" className="term-btn" aria-expanded={open} aria-controls={popId}
          aria-label={`What does ${g.term} mean?`} onClick={() => setOpen((v) => !v)}>?</button>
      </span>
      {open && (
        <span className="term-pop" id={popId} role="note">
          <b>{g.term}</b>
          <span>{sci ? g.technical : g.plain}</span>
          <span className="small muted">{sci ? `In plain words: ${g.plain}` : `Example: ${g.example}`}</span>
        </span>
      )}
    </span>
  );
}
