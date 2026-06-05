import Link from "next/link";
import { MapPin, Sparkles, ArrowRight, Lightbulb, CheckCircle2 } from "lucide-react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getShopProfile } from "@/lib/data/shop-profile";
import {
  SHOP_TYPE_LABELS,
  VENUE_TYPE_LABELS,
  detectShopType,
  matchedProductsForHint,
  locationHints,
  type ProductHint,
} from "@/lib/ai/location-demand";
import { getStore } from "@/lib/data/store";
import { t, type Locale } from "@/lib/i18n/messages";
import type { Product } from "@/lib/types";

/**
 * Server component. Reads the persisted location profile, auto-detects the
 * shop type from the imported catalog, and renders a location-aware product
 * panel split into two groups:
 *
 *   1. "Essentials to consider stocking" — items the (shop type × venue)
 *      basket suggests that the shopkeeper has NOT already added. Each item
 *      shows the category label plus 2-3 concrete example product names so
 *      the suggestion is actionable, not just a bucket.
 *   2. "Already in your catalog" — items they already stock. Each item shows
 *      the category label plus up to three REAL product names from their
 *      data, with a "+N more" pill if the catalog has more matches.
 *
 * Both reads (profile + store) are synchronous because the dashboard layout
 * hydrates the per-instance caches before any page renders, so this panel
 * adds no extra network latency to Overview.
 */
const MAX_PRODUCT_NAMES_PER_HINT = 3;

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

  const products = getStore().products;
  const detectedType = detectShopType(products);
  const hint = locationHints(detectedType, profile.venueType);
  const reason = locale === "bn" ? hint.reasonBn : hint.reasonEn;

  // Annotate each hint with the matching products from the user's catalog so
  // the panel can render real product names on the stocked side and example
  // names on the missing side, in a single pass.
  const annotated = hint.items.map((it) => ({
    hint: it,
    matched: matchedProductsForHint(it, products),
  }));
  const missing = annotated.filter((a) => a.matched.length === 0);
  const stocked = annotated.filter((a) => a.matched.length > 0);

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-600" />
        <div className="text-sm font-medium">{t("locDemand.title", locale)}</div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
            {t("locDemand.detected", locale)}: {SHOP_TYPE_LABELS[detectedType][locale]}
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

        {hint.items.length === 0 ? (
          <div className="text-sm text-slate-500">{t("locDemand.empty", locale)}</div>
        ) : (
          <>
            {/* Missing essentials — actionable group, shown first */}
            {missing.length > 0 ? (
              <div>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-700 mb-2">
                  <Lightbulb className="w-3.5 h-3.5" /> {t("locDemand.missingTitle", locale)}
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {missing.map((a, i) => (
                    <MissingTile key={`m-${i}`} hint={a.hint} locale={locale} />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {t("locDemand.allStocked", locale)}
              </div>
            )}

            {/* Already-stocked — confirmation group with REAL product names */}
            {stocked.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-emerald-700 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t("locDemand.stockedTitle", locale)}
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stocked.map((a, i) => (
                    <StockedTile
                      key={`s-${i}`}
                      hint={a.hint}
                      products={a.matched}
                      locale={locale}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
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

function MissingTile({ hint, locale }: { hint: ProductHint; locale: Locale }) {
  const examples = hint.examples ?? [];
  return (
    <li className="rounded-md border border-amber-200 px-3 py-2.5 bg-amber-50">
      <div className="flex items-start gap-2 text-sm text-amber-900">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
        <span className="font-medium">{locale === "bn" ? hint.bn : hint.en}</span>
      </div>
      {examples.length > 0 && (
        <div className="mt-1.5 ml-3.5 text-[11px] text-amber-800/90">
          <span className="text-amber-700/70">{t("locDemand.exampleLabel", locale)}</span>{" "}
          {examples
            .slice(0, MAX_PRODUCT_NAMES_PER_HINT)
            .map((e) => (locale === "bn" ? e.bn : e.en))
            .join(" · ")}
        </div>
      )}
    </li>
  );
}

function StockedTile({
  hint,
  products,
  locale,
}: {
  hint: ProductHint;
  products: Product[];
  locale: Locale;
}) {
  const shown = products.slice(0, MAX_PRODUCT_NAMES_PER_HINT);
  const overflow = products.length - shown.length;
  return (
    <li className="rounded-md border border-slate-200 px-3 py-2.5 bg-slate-50">
      <div className="flex items-start gap-2 text-sm text-slate-800">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
        <span className="font-medium">{locale === "bn" ? hint.bn : hint.en}</span>
      </div>
      <div className="mt-1.5 ml-5 text-[11px] text-slate-600">
        <span className="text-slate-500">{t("locDemand.youStockLabel", locale)}</span>{" "}
        {shown.map((p) => (locale === "bn" ? p.nameBn || p.name : p.name)).join(" · ")}
        {overflow > 0 && (
          <span className="ml-1 inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
            +{overflow} {t("locDemand.moreSuffix", locale)}
          </span>
        )}
      </div>
    </li>
  );
}
