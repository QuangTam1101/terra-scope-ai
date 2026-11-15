// "Copy link" for the current Explore view. Clipboard first; if the browser refuses, a selectable field to copy by hand.
import { useEffect, useState } from "react";
import { shareUrl, type ExploreState } from "./urlState";

export function ShareButton({ state }: { state: ExploreState }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const url = shareUrl(state);
  useEffect(() => { setStatus("idle"); }, [url]);
  useEffect(() => {
    if (status !== "copied") return;
    const t = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(t);
  }, [status]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setStatus("copied"); } catch { setStatus("manual"); }
  };

  return (
    <span className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn soft" onClick={copy}>Copy link</button>
      <span role="status" className="small muted">{status === "copied" ? "Link copied" : ""}</span>
      {status === "manual" && (
        <input readOnly value={url} aria-label="Link to this view" autoFocus onFocus={(e) => e.currentTarget.select()}
          style={{ minWidth: 0, flex: "1 1 260px", font: "inherit", padding: "6px 10px", borderRadius: 10, border: "2px solid var(--line)" }} />
      )}
    </span>
  );
}
