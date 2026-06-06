"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-reveal wrapper for the marketing homepage. Renders a div with the
 * `.reveal` class (defined in globals.css) and flips `data-shown` to true the
 * first time the element scrolls into view, which triggers the CSS fade-up.
 *
 * Kept deliberately tiny and dependency-free: it's the only client JS the
 * landing page needs, so Home.tsx can stay a server component (it owns the
 * session lookup). Users with prefers-reduced-motion never see motion — the
 * media query in globals.css forces the revealed state regardless of state.
 *
 * `delay` (ms) staggers siblings.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    // Fallback for very old browsers: just show it.
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      data-shown={shown ? "true" : "false"}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  );
}
