import { t, type Locale } from "@/lib/i18n/messages";
import { TrustClient } from "./TrustClient";

/**
 * /[locale]/dashboard/trust — Responsible AI & Model Quality.
 * Surfaces measurable model metrics (trained holdout + live) and a fairness
 * audit of the shop's AI outputs. Read-only; safe on any dataset.
 */
export default function TrustPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("trust.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("trust.subtitle", locale)}</p>
      </header>
      <TrustClient locale={locale} />
    </div>
  );
}
