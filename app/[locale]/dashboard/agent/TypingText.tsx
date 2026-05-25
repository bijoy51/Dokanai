"use client";

import { useEffect, useState } from "react";

/**
 * Reveal `text` one character at a time. ~25ms/char by default — matches the
 * "Pilot is typing" feel without dragging multi-paragraph replies forever.
 * Reduces to instant render if the user prefers reduced motion.
 */
export function TypingText({
  text,
  speedMs = 25,
  onDone,
  className,
}: {
  text: string;
  speedMs?: number;
  onDone?: () => void;
  className?: string;
}) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(text);
      onDone?.();
      return;
    }
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        onDone?.();
      }
    }, speedMs);
    return () => clearInterval(id);
    // We intentionally restart on text change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speedMs]);
  return <span className={className}>{shown}</span>;
}
