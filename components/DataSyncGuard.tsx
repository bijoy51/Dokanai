"use client";

import { useEffect, useRef } from "react";

/**
 * Proactive self-healing rehydration.
 *
 * Mounted in the dashboard layout, this component runs on every dashboard
 * page load (not just NoDataState). It:
 *
 *   1. Asks the server whether it has shop data for the signed-in account.
 *   2. If not, but the browser has a localStorage mirror of the user's
 *      most-recent import, POSTs that mirror back to /api/import with
 *      `silent: true` so the data is restored without a noisy event
 *      appearing in the Uploads history.
 *   3. Soft-refreshes the page so server components re-render against
 *      the now-rehydrated store.
 *
 * Why this exists: the ML-backend KV is in-memory on its host (HF Spaces /
 * Railway). When that host sleeps or restarts — even though Vercel itself
 * didn't redeploy — the server's view of the dataset goes empty. The
 * browser mirror is the durable source of truth in that scenario; this
 * component glues the two together without the user having to re-upload
 * their files. NoDataState does the same thing but only when a data page
 * renders empty. DataSyncGuard does it earlier — before any data-driven
 * page has a chance to render empty.
 *
 * Throttling: at most one attempt per 30s per browser session, capped at
 * three attempts total per session. Anything beyond that is a backend
 * problem we shouldn't keep papering over.
 */

const DATASET_KEY = "dokanai:dataset:v1";
const LAST_ATTEMPT_KEY = "dokanai:datasync:last";
const ATTEMPT_COUNT_KEY = "dokanai:datasync:count";
const MIN_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 3;

export function DataSyncGuard({ userEmail }: { userEmail: string }) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        // 1. Server status check.
        const statusRes = await fetch("/api/import", { cache: "no-store" });
        if (!statusRes.ok) return;
        const status: { hasData?: boolean; email?: string } = await statusRes
          .json()
          .catch(() => ({}));

        if (status.hasData) return;

        // 2. Inspect local mirror.
        let mirror: { email?: string; products?: unknown[]; sales?: unknown[] } | null = null;
        try {
          const raw = localStorage.getItem(DATASET_KEY);
          if (raw) mirror = JSON.parse(raw);
        } catch {
          /* private mode / storage unavailable */
        }
        if (!mirror) return;
        if (mirror.email && mirror.email !== userEmail) return; // belongs to a different account
        const hasRows = !!mirror.products?.length || !!mirror.sales?.length;
        if (!hasRows) return;

        // 3. Throttle so a flapping backend doesn't have us re-posting on
        // every render.
        const now = Date.now();
        const lastAttempt = Number(sessionStorage.getItem(LAST_ATTEMPT_KEY) ?? "0");
        if (now - lastAttempt < MIN_INTERVAL_MS) return;
        const count = Number(sessionStorage.getItem(ATTEMPT_COUNT_KEY) ?? "0");
        if (count >= MAX_ATTEMPTS) return;
        sessionStorage.setItem(LAST_ATTEMPT_KEY, String(now));
        sessionStorage.setItem(ATTEMPT_COUNT_KEY, String(count + 1));

        // 4. Re-POST mirror, silently.
        const postRes = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            products: mirror.products ?? [],
            sales: mirror.sales ?? [],
            silent: true,
          }),
        });
        if (!postRes.ok) return;

        // 5. Soft refresh so server components re-render with data.
        // Full reload to remount the dashboard layout cleanly.
        window.location.reload();
      } catch {
        /* non-fatal — NoDataState will catch it on the next render if needed */
      }
    })();
  }, [userEmail]);

  return null;
}
