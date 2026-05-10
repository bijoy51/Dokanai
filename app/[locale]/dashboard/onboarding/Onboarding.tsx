import { t, type Locale } from "@/lib/i18n/messages";
import { KhataUploader } from "./KhataUploader";

export default function OnboardingPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("ob.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("ob.subtitle", locale)}</p>
      </header>
      <KhataUploader locale={locale} />
    </div>
  );
}
