import { t, type Locale } from "@/lib/i18n/messages";
import { PilotClient } from "./PilotClient";

export default function PilotPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pilot.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("pilot.subtitle", locale)}</p>
      </header>
      <PilotClient locale={locale} />
    </div>
  );
}
