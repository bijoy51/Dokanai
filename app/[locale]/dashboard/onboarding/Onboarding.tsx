import { t, type Locale } from "@/lib/i18n/messages";
import { OnboardingTabs } from "./OnboardingTabs";
import { ShopProfileCard } from "@/components/ShopProfileCard";

export default function OnboardingPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("ob.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("ob.subtitle", locale)}</p>
      </header>
      <div className="mb-6">
        <ShopProfileCard locale={locale} />
      </div>
      <OnboardingTabs locale={locale} />
    </div>
  );
}
