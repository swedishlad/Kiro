// The first-visit note: a small card in the corner of Bill check saying where to start and where the rest of the
// site is. It doesn't block the page or take focus; "Got it" (or Escape inside it) closes it for good. App.tsx
// decides when it shows; dropping or pasting a bill closes it too, since the visitor has already started.

import { useEffect } from "react";

export function Intro({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    window.addEventListener("drop", onClose);
    window.addEventListener("paste", onClose);
    return () => {
      window.removeEventListener("drop", onClose);
      window.removeEventListener("paste", onClose);
    };
  }, [onClose]);

  return (
    <aside className="intro" aria-labelledby="intro-title" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div>
        <p className="intro-title" id="intro-title">
          First time here?
        </p>
        <p className="intro-text">
          Start with your bill on this page. For the bigger picture, Energy data, Regime and Map up top cover prices, usage and every town in
          the state.
        </p>
      </div>
      <button type="button" className="btn btn-primary intro-ok" onClick={onClose}>
        Got it
      </button>
    </aside>
  );
}
