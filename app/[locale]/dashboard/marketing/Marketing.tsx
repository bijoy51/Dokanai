import { audienceCount } from "@/lib/ai/marketing";
import { getSession } from "@/lib/auth";
import { campaignLiftRollup } from "@/lib/ai/campaignLift";
import { t, type Locale } from "@/lib/i18n/messages";
import { MarketingComposer } from "./MarketingComposer";
import { MarketingEmailSection } from "./MarketingEmailSection";
import { CampaignLiftCard } from "@/components/CampaignLiftCard";
import { isShopEmpty } from "@/lib/data/store";
import { NoDataState } from "@/components/NoDataState";

export default async function MarketingPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  if (isShopEmpty()) return <NoDataState locale={locale} />;
  const counts = {
    all: audienceCount("all"),
    dormant: audienceCount("dormant"),
    vip: audienceCount("vip"),
    atrisk: audienceCount("atrisk"),
  };

  // Resolve the lift rollup at the page level so the JSX stays plain.
  // Falls back to null if KV is not configured (local dev) — the card
  // renders nothing in that case.
  const session = getSession();
  const lift = session
    ? await campaignLiftRollup(session.email).catch(() => null)
    : null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("mkt.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("mkt.subtitle", locale)}</p>
      </header>
      <CampaignLiftCard locale={locale} rollup={lift} />
      <MarketingEmailSection locale={locale} />
      <MarketingComposer locale={locale} counts={counts} />
    </div>
  );
}
