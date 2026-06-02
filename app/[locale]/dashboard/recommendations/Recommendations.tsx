import { customerSummaries } from "@/lib/ai/recommend";
import { t, type Locale } from "@/lib/i18n/messages";
import { RecommendationView } from "./RecommendationView";
import { isShopEmpty, getStore } from "@/lib/data/store";
import { NoDataState } from "@/components/NoDataState";
import { Network } from "lucide-react";

export default function RecommendationsPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  if (isShopEmpty()) return <NoDataState locale={locale} />;
  const customers = customerSummaries(80);

  // Surface the size of the affinity graph so the user understands what's
  // powering the suggestions. Counts customers and products that have at
  // least one purchase edge in the (delivered + pending) order graph.
  const store = getStore();
  let edges = 0;
  const customerNodes = new Set<string>();
  const productNodes = new Set<string>();
  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    for (const it of o.items) {
      customerNodes.add(o.customerId);
      productNodes.add(it.productId);
      edges += 1;
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("rec.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("rec.subtitle", locale)}</p>

        <div className="mt-3 inline-flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
          <Network className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">{t("rec.graphLabel", locale)}</span>{" "}
            <span className="text-violet-700">
              {customerNodes.size} {t("rec.graph.customers", locale)} · {productNodes.size}{" "}
              {t("rec.graph.products", locale)} · {edges} {t("rec.graph.edges", locale)}
            </span>
            <div className="text-violet-600 mt-0.5">{t("rec.graphHint", locale)}</div>
          </div>
        </div>
      </header>
      <RecommendationView locale={locale} customers={customers} />
    </div>
  );
}
