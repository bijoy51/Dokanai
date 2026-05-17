import { customerSummaries } from "@/lib/ai/recommend";
import { t, type Locale } from "@/lib/i18n/messages";
import { RecommendationView } from "./RecommendationView";
import { isShopEmpty } from "@/lib/data/store";
import { NoDataState } from "@/components/NoDataState";

export default function RecommendationsPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  if (isShopEmpty()) return <NoDataState locale={locale} />;
  const customers = customerSummaries(80);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("rec.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("rec.subtitle", locale)}</p>
      </header>
      <RecommendationView locale={locale} customers={customers} />
    </div>
  );
}
