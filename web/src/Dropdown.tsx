// A dropdown drawn in the app's own style (the native <select> popup is drawn by the OS and cannot be themed).
// Accessible listbox pattern: the trigger is a button with aria-haspopup="listbox"; the list is role="listbox" with
// role="option" items. Keyboard: Enter/Space/ArrowDown open, ArrowUp/ArrowDown move, Home/End, Enter selects,
// Escape or Tab closes, typing a letter jumps to the next option that starts with it.
import { useEffect, useId, useRef, useState } from "react";

export type DropdownOption = { value: string; label: string; disabled?: boolean; hint?: string };

export function Dropdown({ value, options, onChange, ariaLabel, className = "" }: {
  value: string; options: DropdownOption[]; onChange: (v: string) => void; ariaLabel: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (from: number, step: number) => {
    for (let k = 1; k <= options.length; k++) {
      const i = (from + step * k + options.length * k) % options.length;
      if (!options[i].disabled) return i;
    }
    return from;
  };
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value); setOpen(false); btn.current?.focus();
  };
  const openList = () => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => move(a, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => move(a, -1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(move(-1, 1)); }
    else if (e.key === "End") { e.preventDefault(); setActive(move(options.length, -1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      for (let s = 1; s <= options.length; s++) {
        const i = (active + s) % options.length;
        if (!options[i].disabled && options[i].label.toLowerCase().startsWith(k)) { setActive(i); break; }
      }
    }
  };

  return (
    <div ref={root} className={`dd ${open ? "open" : ""} ${className}`}>
      <button ref={btn} type="button" className="dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${ariaLabel}: ${current?.label ?? ""}`}
        aria-controls={`${id}-list`} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}
        aria-activedescendant={open ? `${id}-${active}` : undefined}>
        <span className="dd-value">{current?.label ?? "Choose"}</span>
        <svg className="dd-chev" width="14" height="9" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <ul ref={list} id={`${id}-list`} className="dd-list" role="listbox" aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li key={o.value} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
              className={`dd-opt ${i === active ? "active" : ""} ${o.value === value ? "sel" : ""} ${o.disabled ? "disabled" : ""}`}
              onPointerEnter={() => !o.disabled && setActive(i)} onClick={() => choose(i)}>
              <span className="dd-check" aria-hidden="true">{o.value === value ? "✓" : ""}</span>
              <span className="dd-label">{o.label}{o.hint && <small>{o.hint}</small>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
