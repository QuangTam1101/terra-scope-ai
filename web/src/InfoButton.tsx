import { useEffect, useId, useRef, useState } from "react";
import { definition } from "./definitions";
import { useStore } from "./store";

/** Round "i" button that opens a short definition (definitions.ts) for a variable, dataset or term.
 * Same behaviour as Term: click, tap, Enter or Space opens it; Escape (focus returns to the button) or a click elsewhere
 * closes it. Explorer sees the simple text, Scientist the method. An unknown id renders nothing. */
export function InfoButton({ id }: { id: string }) {
  const { audience } = useStore();
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
  const d = definition(id);
  if (!d) return null;
  const sci = audience === "scientist";
  const link = { target: "_blank", rel: "noopener noreferrer" };
  return (
    <span className="term-wrap" ref={wrap}>
      <button ref={btn} type="button" className="term-btn" style={{ width: 24, height: 24 }}
        aria-expanded={open} aria-controls={popId} aria-label={`About ${d.title}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>i</button>
      {open && (
        <span className="term-pop" id={popId} role="note" aria-label={d.title}>
          <b>{d.title}</b>
          <span>{sci ? d.science : d.simple}</span>
          <span><strong>Why it matters for a detective:</strong> {d.why}</span>
          {d.units && <span className="small muted">Units: {d.units}</span>}
          {d.source && (
            <span className="small muted">Source: <a href={d.source.url} {...link}>{d.source.product}</a>, {d.source.provider}
              {d.source.license && `. Licence: ${d.source.license}`}</span>
          )}
          {d.more && <a className="small" href={d.more} {...link}>Learn more about {d.title}</a>}
        </span>
      )}
    </span>
  );
}
