import { t, type Locale } from "@/lib/i18n/messages";
import { VoiceMic } from "./VoiceMic";

export default function VoicePage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("voice.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("voice.subtitle", locale)}</p>
      </header>
      <VoiceMic locale={locale} />
    </div>
  );
}
