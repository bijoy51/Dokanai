import Link from "next/link";
import { MapPin, Sparkles, ArrowRight } from "lucide-react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getShopProfile } from "@/lib/data/shop-profile";
import {
  SHOP_TYPE_LABELS,
  VENUE_TYPE_LABELS,
  locationHints,
} from "@/lib/ai/location-demand";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Server component. Reads the persisted shop profile and renders a
 * location-aware product-demand panel on the Overview page. When no
 * profile has been saved yet, prompts the shopkeeper to set one.
 *
 * Shop profile lookup is synchronous (reads the in-memory store hydrated
 * by the dashboard layout), so this stays cheap to render on every page
 * load and never blocks behind a network call.
 */
export function LocationRecommendationsPanel({ locale }: { locale: Locale }) {
  const session = verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const profile = getShopProfile(session.email);

  if (!profile) {
    return (
      <section className="mt-6 rounded-lg border border-brand-200 bg-brand-50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-brand-600 grid place-items-center text-white shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-brand-900">
              {t("locDemand.promptTitle", locale)}
            </div>
            <p className="text-xs text-brand-900/80 mt-1">
              {t("locDemand.promptBody", locale)}
            </p>
            <Link
              href={`/${locale}/dashboard/onboarding`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white font-medium"
            >
              {t("locDemand.promptCta", locale)} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const hint = locationHints(profile);
  const reason = locale === "bn" ? hint.reasonBn : hint.reasonEn;

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-600" />
        <div className="text-sm font-medium">{t("locDemand.title", locale)}</div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
            {SHOP_TYPE_LABELS[profile.shopType][locale]}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
            <MapPin className="w-3 h-3" />
            {VENUE_TYPE_LABELS[profile.venueType][locale]}
          </span>
          {(profile.area || profile.city) && (
            <span className="text-[11px] text-slate-500">
              {[profile.area, profile.city].filter(Boolean).join(", ")}
            </span>
          )}
        </div>

        <p className="text-sm text-slate-600">{reason}</p>

        {hint.items.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {hint.items.map((it, i) => (
              <li
                key={i}
                className="text-sm rounded-md border border-slate-200 px-3 py-2 bg-slate-50 flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-brand-600 shrink-0" />
                <span className="truncate">{locale === "bn" ? it.bn : it.en}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-500">{t("locDemand.empty", locale)}</div>
        )}

        <div className="pt-1 text-[11px] text-slate-400">
          {t("locDemand.editHint", locale)}{" "}
          <Link
            href={`/${locale}/dashboard/onboarding`}
            className="text-brand-700 underline"
          >
            {t("locDemand.editLink", locale)}
          </Link>
        </div>
      </div>
    </section>
  );
}
