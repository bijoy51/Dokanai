import Link from "next/link";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { forecastAll } from "@/lib/ai/forecast";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * "Imminent stockouts" card for the Overview page.
 *
 * Uses the existing forecastAll() output — no new ML model needed; we just
 * filter to products that are actually selling AND have <= 14 days of cover
 * left. Sorts the worst offenders first.
 *
 * Empty path: when nothing is at risk we render a small positive nudge
 * instead of a banner, so the page never feels cluttered for healthy shops.
 */
export function StockoutAlert({ locale }: { locale: Locale }) {
  const all = forecastAll();
  const atRisk = all
    .filter((f) => f.avgDaily > 0 && f.stock > 0 && f.daysOfStock <= 14)
    .sort((a, b) => a.daysOfStock - b.daysOfStock)
    .slice(0, 6);

  if (atRisk.length === 0) {
    return (
      <section className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2 text-sm text-emerald-800">
          <PackageCheck className="w-4 h-4" />
          <span className="font-medium">{t("overview.stockout.allHealthy", locale)}</span>
        </div>
        <p className="text-xs text-emerald-700 mt-1">
          {t("overview.stockout.allHealthyHint", locale)}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-lg border border-rose-200 bg-rose-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-rose-200 flex items-center justify-between bg-rose-100/50">
        <div className="flex items-center gap-2 text-sm font-medium text-rose-900">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          {t("overview.stockout.title", locale)}
          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-rose-200 text-rose-900">
            {atRisk.length}
          </span>
        </div>
        <Link
          href={`/${locale}/dashboard/forecast`}
          className="text-xs text-rose-700 hover:text-rose-900 underline decoration-rose-300 hover:decoration-rose-700"
        >
          {t("overview.stockout.viewAll", locale)}
        </Link>
      </div>
      <ul className="divide-y divide-rose-100">
        {atRisk.map((f) => {
          const urgent = f.daysOfStock <= 5;
          return (
            <li key={f.productId} className="px-4 py-2 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">
                  {locale === "bn" ? f.nameBn : f.name}
                </div>
                <div className="text-xs text-slate-600">
                  {t("overview.stockout.stockLabel", locale)}: {f.stock} ·{" "}
                  {t("overview.stockout.dailyLabel", locale)}: {f.avgDaily.toFixed(1)}
                </div>
              </div>
              <div
                className={
                  "shrink-0 text-right font-medium text-sm " +
                  (urgent ? "text-rose-700" : "text-amber-700")
                }
              >
                {f.daysOfStock.toFixed(0)} {t("overview.stockout.daysLeft", locale)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
