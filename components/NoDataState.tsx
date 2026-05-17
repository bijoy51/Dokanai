"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UploadCloud, ArrowRight, Loader2 } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Shown on data-driven dashboard pages when the server has no shop data
 * for the signed-in account.
 *
 * The imported dataset lives in per-instance server memory on Vercel, so
 * a request can land on an instance that does not have it. The browser
 * keeps a localStorage mirror; this component detects that case, re-POSTs
 * the dataset to rehydrate the server, and refreshes. Only when there is
 * genuinely no data anywhere does it show the import prompt.
 */
const DATASET_KEY = "dokanai:dataset:v1";
const ATTEMPT_KEY = "dokanai:rehydrate-attempts";
const MAX_ATTEMPTS = 3;

type Phase = "checking" | "rehydrating" | "empty";

export function NoDataState({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;

    (async () => {
      let mirror: { email?: string; products?: unknown[]; sales?: unknown[] } | null = null;
      try {
        const raw = localStorage.getItem(DATASET_KEY);
        if (raw) mirror = JSON.parse(raw);
      } catch {
        /* ignore */
      }

      const hasMirror = !!mirror && (!!mirror.products?.length || !!mirror.sales?.length);
      if (!hasMirror) {
        setPhase("empty");
        return;
      }

      const attempts = Number(sessionStorage.getItem(ATTEMPT_KEY) || "0");
      if (attempts >= MAX_ATTEMPTS) {
        setPhase("empty");
        return;
      }

      setPhase("rehydrating");
      try {
        const statusRes = await fetch("/api/import");
        const status = statusRes.ok ? await statusRes.json() : null;
        // Mirror belongs to a different account on this browser -> drop it.
        if (status && mirror!.email && mirror!.email !== status.email) {
          localStorage.removeItem(DATASET_KEY);
          setPhase("empty");
          return;
        }
        await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: mirror!.products ?? [], sales: mirror!.sales ?? [] }),
        });
        sessionStorage.setItem(ATTEMPT_KEY, String(attempts + 1));
        if (!cancelled) router.refresh();
      } catch {
        setPhase("empty");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (phase === "checking" || phase === "rehydrating") {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-center">
          <Loader2 className="w-7 h-7 text-brand-600 animate-spin mx-auto" />
          <p className="mt-3 text-sm text-slate-500">{t("nodata.loading", locale)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-xl bg-brand-50 border border-brand-200 grid place-items-center mx-auto">
          <UploadCloud className="w-7 h-7 text-brand-600" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">{t("nodata.title", locale)}</h2>
        <p className="mt-2 text-sm text-slate-500">{t("nodata.body", locale)}</p>
        <Link
          href={`/${locale}/dashboard/onboarding`}
          className="mt-5 inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-md text-sm font-medium"
        >
          {t("nodata.cta", locale)}
          <ArrowRight className="w-4 h-4" />
        </Link>
        <p className="mt-4 text-xs text-slate-400">{t("nodata.hint", locale)}</p>
      </div>
    </div>
  );
}
