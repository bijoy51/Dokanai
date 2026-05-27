"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * One-click unsubscribe. Fires on mount, shows the resulting state. Idempotent
 * on the server — re-fetches are safe.
 */
export function UnsubClient({ locale, token }: { locale: Locale; token: string }) {
  const [state, setState] = useState<"pending" | "ok" | "fail">("pending");
  const [reason, setReason] = useState<string>("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const res = await fetch("/api/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) setState("ok");
        else {
          setState("fail");
          setReason(typeof data?.reason === "string" ? data.reason : `http-${res.status}`);
        }
      } catch (e) {
        setState("fail");
        setReason(e instanceof Error ? e.message : "network");
      }
    })();
  }, [token]);

  if (state === "pending") {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("unsub.processing", locale)}
      </div>
    );
  }
  if (state === "ok") {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        <p className="text-sm text-slate-700">{t("unsub.done", locale)}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <AlertTriangle className="w-7 h-7 text-rose-600" />
      <p className="text-sm text-slate-700">{t("unsub.failed", locale)}</p>
      <p className="text-xs text-slate-400">({reason})</p>
    </div>
  );
}
