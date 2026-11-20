"use client";

import { useEffect } from "react";

const VISIBLE_MS = 5000;

/** A short confirmation at the bottom of the screen, announced politely and gone after five seconds. */
export default function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDone, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  // The live region stays mounted so screen readers announce each new message.
  return <div className="team-toast-region" role="status" aria-live="polite">
    {message && <div className="team-toast"><span>{message}</span><button type="button" className="icon-button" aria-label="Dismiss" onClick={onDone}><span aria-hidden="true">×</span></button></div>}
  </div>;
}
