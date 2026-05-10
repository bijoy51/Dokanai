import { bundleRecommendations, priceRecommendations } from "@/lib/ai/pricing";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT, formatPercent } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Package } from "lucide-react";

export default function PricingPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const prices = priceRecommendations().slice(0, 12);
  const bundles = bundleRecommendations(6);

  const actionStyles: Record<string, string> = {
    raise: "bg-emerald-50 text-emerald-700 border-emerald-200",
    lower: "bg-amber-50 text-amber-700 border-amber-200",
    hold: "bg-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pricing.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("pricing.subtitle", locale)}</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
          {t("pricing.priceTable", locale)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">{t("pricing.col.product", locale)}</th>
                <th className="text-right px-4 py-2">{t("pricing.col.current", locale)}</th>
                <th className="text-right px-4 py-2">{t("pricing.col.suggested", locale)}</th>
                <th className="text-left px-4 py-2">{t("pricing.col.action", locale)}</th>
                <th className="text-right px-4 py-2">{t("pricing.col.lift", locale)}</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Why</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((r) => {
                const Icon = r.action === "raise" ? TrendingUp : r.action === "lower" ? TrendingDown : Minus;
                return (
                  <tr key={r.productId} className="border-t border-slate-100">
                    <td className="px-4 py-2">{locale === "bn" ? r.nameBn : r.name}</td>
                    <td className="px-4 py-2 text-right">{formatBDT(r.current)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatBDT(r.suggested)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${actionStyles[r.action]}`}>
                        <Icon className="w-3 h-3" />
                        {t(`pricing.action.${r.action}`, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.expectedLiftPct > 0 ? (
                        <span className="text-brand-600">+{formatPercent(r.expectedLiftPct)}</span>
                      ) : (
                        <span className="text-slate-400">·</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500 text-xs hidden md:table-cell">
                      {locale === "bn" ? r.reasonBn : r.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-brand-600" />
          <h2 className="text-sm font-medium">{t("pricing.bundles", locale)}</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {bundles.length === 0 && (
            <div className="text-sm text-slate-500 col-span-full">
              Need more co-purchase data to suggest bundles.
            </div>
          )}
          {bundles.map((b, idx) => (
            <div key={idx} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-[11px] uppercase text-slate-500">{t("pricing.bundle.combo", locale)}</div>
              <div className="font-medium mt-1">
                {(locale === "bn" ? b.namesBn : b.names).join(" + ")}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-[11px] text-slate-500">{t("pricing.bundle.savings", locale)}</div>
                  <div className="text-lg font-semibold">{formatBDT(b.bundlePrice)}</div>
                  <div className="text-xs text-slate-400 line-through">{formatBDT(b.totalIfSeparate)}</div>
                </div>
                <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                  −{b.savingsPct}%
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">Bought together {b.count} times</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
