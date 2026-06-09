import { t, type Locale } from "@/lib/i18n/messages";
import { SubscriptionClient } from "./SubscriptionClient";

/**
 * /[locale]/dashboard/subscription — pick a plan and pay via Stripe Checkout
 * (sandbox / test mode). Server component renders the header + passes the
 * locale and the ?status= flag (set by Stripe's success/cancel redirect) to
 * the client, which owns the upgrade buttons and the checkout redirect.
 */
export default function SubscriptionPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { status?: string; session_id?: string };
}) {
  const locale = params.locale as Locale;
  const status = searchParams?.status === "success" ? "success" : searchParams?.status === "cancel" ? "cancel" : null;
  const sessionId = searchParams?.session_id ?? null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("sub.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("sub.subtitle", locale)}</p>
      </header>
      <SubscriptionClient locale={locale} status={status} sessionId={sessionId} />
    </div>
  );
}
