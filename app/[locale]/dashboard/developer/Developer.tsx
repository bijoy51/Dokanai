import { t, type Locale } from "@/lib/i18n/messages";
import { DeveloperClient } from "./DeveloperClient";

export default function DeveloperPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("dev.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("dev.subtitle", locale)}</p>
      </header>
      <DeveloperClient locale={locale} />
    </div>
  );
}
