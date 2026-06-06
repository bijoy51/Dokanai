"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on first mount, idempotent across navigations.
 *
 * Why a client component vs an inline <Script src="…"> tag in the layout:
 * we want the registration to skip in dev mode, in non-browser contexts,
 * and in browsers that lack `navigator.serviceWorker` (Firefox in private,
 * older Safari). A short useEffect is the cleanest gate for all three.
 *
 * Registration failures are NEVER fatal — without a SW, DokanAI degrades
 * to a regular website and the InstallPanel UI shows the "not installable"
 * state. We deliberately swallow errors here.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Avoid registering in dev mode — the SW would cache the dev bundle
    // and produce confusing stale-asset behaviour during hot reloads.
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* SW registration failed — non-fatal; site continues without PWA features */
      });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
