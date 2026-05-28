import { audienceCount } from "@/lib/ai/marketing";
import { t, type Locale } from "@/lib/i18n/messages";
import { MarketingComposer } from "./MarketingComposer";
import { EmailComposer } from "./EmailComposer";
import { isShopEmpty } from "@/lib/data/store";
import { NoDataState } from "@/components/NoDataState";

export default function MarketingPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  if (isShopEmpty()) return <NoDataState locale={locale} />;
  const counts = {
    all: audienceCount("all"),
    dormant: audienceCount("dormant"),
    vip: audienceCount("vip"),
    atrisk: audienceCount("atrisk"),
  };
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("mkt.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("mkt.subtitle", locale)}</p>
      </header>
      <EmailComposer locale={locale} />
      <MarketingComposer locale={locale} counts={counts} />
    </div>
  );
}
