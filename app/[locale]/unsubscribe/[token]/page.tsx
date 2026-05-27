import { t, type Locale } from "@/lib/i18n/messages";
import { UnsubClient } from "./UnsubClient";

/**
 * Public unsubscribe page. Lives outside the dashboard layout (no auth) so
 * a recipient can click the link in their inbox without needing to log in.
 * The page auto-confirms the unsubscribe on mount (one-click semantics) and
 * shows a clear success / failure state.
 */
export default function UnsubscribePage({ params }: { params: { locale: string; token: string } }) {
  const locale = (params.locale === "bn" ? "bn" : "en") as Locale;
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
        <h1 className="text-xl font-semibold mb-1">{t("unsub.title", locale)}</h1>
        <p className="text-sm text-slate-500 mb-4">{t("unsub.subtitle", locale)}</p>
        <UnsubClient locale={locale} token={params.token} />
      </div>
    </div>
  );
}
