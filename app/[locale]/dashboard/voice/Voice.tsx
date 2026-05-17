import { t, type Locale } from "@/lib/i18n/messages";
import { VoiceMic } from "./VoiceMic";
import { isShopEmpty } from "@/lib/data/store";
import { NoDataState } from "@/components/NoDataState";

export default function VoicePage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  if (isShopEmpty()) return <NoDataState locale={locale} />;
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
