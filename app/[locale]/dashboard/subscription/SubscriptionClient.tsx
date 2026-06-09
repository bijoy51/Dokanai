"use client";

import { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, Star, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

type PlanKey = "free" | "growth" | "pro";

interface Tier {
  key: PlanKey;
  price: string;
  featureKeys: string[];
  highlighted?: boolean;
  payable: boolean; // free is not payable
}

const TIERS: Tier[] = [
  {
    key: "free",
    price: "৳0",
    featureKeys: ["plans.tier.free.feat1", "plans.tier.free.feat2", "plans.tier.free.feat3"],
    payable: false,
  },
  {
    key: "growth",
    price: "৳499",
    featureKeys: [
      "plans.tier.growth.feat1",
      "plans.tier.growth.feat2",
      "plans.tier.growth.feat3",
      "plans.tier.growth.feat4",
    ],
    highlighted: true,
    payable: true,
  },
  {
    key: "pro",
    price: "৳1,499",
    featureKeys: [
      "plans.tier.pro.feat1",
      "plans.tier.pro.feat2",
      "plans.tier.pro.feat3",
      "plans.tier.pro.feat4",
    ],
    payable: true,
  },
];

export function SubscriptionClient({
  locale,
  status,
  sessionId,
}: {
  locale: Locale;
  status: "success" | "cancel" | null;
  sessionId: string | null;
}) {
  const [loading, setLoading] = useState<PlanKey | null>(null);
  const [error, setError] = useState("");
  const [currentTier, setCurrentTier] = useState<PlanKey>("free");

  // On load, confirm a just-completed checkout (verifies payment + sets tier)
  // and/or fetch the current tier so the active plan is shown.
  useEffect(() => {
    const url = sessionId ? `/api/subscription?session_id=${encodeURIComponent(sessionId)}` : "/api/subscription";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d?.tier === "growth" || d?.tier === "pro" || d?.tier === "free") setCurrentTier(d.tier);
      })
      .catch(() => {});
  }, [sessionId]);

  const startCheckout = async (plan: PlanKey) => {
    setError("");
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, locale }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start checkout.");
        setLoading(null);
        return;
      }
      // Hand off to Stripe's hosted checkout page.
      window.location.href = data.url as string;
    } catch {
      setError("Network error. Please try again.");
      setLoading(null);
    }
  };

  return (
    <div>
      {/* Stripe redirect result banners */}
      {status === "success" && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{t("sub.success", locale)}</span>
        </div>
      )}
      {status === "cancel" && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{t("sub.cancel", locale)}</span>
        </div>
      )}
      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {TIERS.map((tier) => (
          <div
            key={tier.key}
            className={
              "relative rounded-2xl p-6 flex flex-col " +
              (tier.highlighted
                ? "border-2 border-brand-600 bg-white shadow-md lg:scale-[1.03]"
                : "border border-slate-200 bg-white")
            }
          >
            {tier.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full bg-brand-600 text-white shadow">
                  <Star className="w-3 h-3" />
                  {t("plans.mostPopular", locale)}
                </span>
              </div>
            )}

            <div className="text-sm font-medium text-slate-500">{t(`plans.tier.${tier.key}.name`, locale)}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-slate-900">{tier.price}</span>
              <span className="text-sm text-slate-500">/ {t("plans.perMonth", locale)}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600 min-h-[2.5rem]">{t(`plans.tier.${tier.key}.summary`, locale)}</p>

            <ul className="mt-4 space-y-2 flex-1">
              {tier.featureKeys.map((fk) => (
                <li key={fk} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className={"w-4 h-4 mt-0.5 shrink-0 " + (tier.highlighted ? "text-brand-600" : "text-emerald-500")} />
                  <span>{t(fk, locale)}</span>
                </li>
              ))}
            </ul>

            {currentTier === tier.key ? (
              <div className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check className="w-4 h-4" /> {t("sub.current", locale)}
              </div>
            ) : tier.payable ? (
              <button
                onClick={() => startCheckout(tier.key)}
                disabled={loading !== null}
                className={
                  "mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed " +
                  (tier.highlighted
                    ? "bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
                    : "bg-white border border-slate-300 text-slate-800 hover:bg-slate-50")
                }
              >
                {loading === tier.key ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> {t("sub.processing", locale)}
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" /> {t("sub.upgrade", locale)}
                  </>
                )}
              </button>
            ) : (
              <div className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium bg-slate-100 text-slate-500">
                {t("plans.tier.free.cta", locale)}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-500 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{t("sub.testNote", locale)}</span>
      </p>
    </div>
  );
}
