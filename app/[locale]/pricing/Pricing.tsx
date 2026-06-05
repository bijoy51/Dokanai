import Link from "next/link";
import { ArrowRight, Check, Sparkles, Star } from "lucide-react";
import { LangSwitcher } from "@/components/LangSwitcher";
import { t, type Locale } from "@/lib/i18n/messages";
import { getSession } from "@/lib/auth";

/**
 * /[locale]/pricing — public, presentational pricing page.
 *
 * BD-priced freemium tiers (Free ৳0 / Growth ৳499 / Pro ৳1,499). Growth is
 * highlighted. No checkout, no gating — clicking any tier's CTA routes to
 * signup (or back to the dashboard if already signed in). The signup flow
 * itself doesn't read or care which tier was clicked; this page exists for
 * judges + future shopkeepers to see the documented business model.
 *
 * Patterns mirrored from app/[locale]/login/ (page.tsx re-export + named
 * component file) and app/[locale]/Home.tsx (header + feature-card grid).
 */
export default function Pricing({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const session = getSession();
  const ctaHref = session ? `/${locale}/dashboard` : `/${locale}/signup`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white">
      {/* Header — same shape as Home.tsx for visual continuity */}
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3 max-w-6xl mx-auto">
        <Link href={`/${locale}`} className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-md bg-brand-600 grid place-items-center text-white font-bold shrink-0">D</div>
          <span className="font-semibold truncate">{t("brand.name", locale)}</span>
          <span className="text-xs text-slate-500 hidden sm:inline">· {t("brand.tagline", locale)}</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href={`/${locale}`}
            className="text-sm text-slate-600 hover:text-slate-900 hidden sm:inline"
          >
            {t("plans.backHome", locale)}
          </Link>
          <LangSwitcher locale={locale} />
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-8 sm:pb-12 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
          {t("plans.title", locale)}
        </h1>
        <p className="mt-4 sm:mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
          {t("plans.subtitle", locale)}
        </p>
      </section>

      {/* Pricing tiers — 1 col mobile, 3 col lg. Growth (middle) is elevated. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 pb-8 sm:pb-12">
        <TierCard
          name={t("plans.tier.free.name", locale)}
          price="৳0"
          period={t("plans.perMonth", locale)}
          summary={t("plans.tier.free.summary", locale)}
          features={[
            t("plans.tier.free.feat1", locale),
            t("plans.tier.free.feat2", locale),
            t("plans.tier.free.feat3", locale),
            t("plans.tier.free.feat4", locale),
            t("plans.tier.free.feat5", locale),
          ]}
          cta={t("plans.tier.free.cta", locale)}
          ctaHref={ctaHref}
          highlighted={false}
          locale={locale}
        />
        <TierCard
          name={t("plans.tier.growth.name", locale)}
          price="৳499"
          period={t("plans.perMonth", locale)}
          summary={t("plans.tier.growth.summary", locale)}
          features={[
            t("plans.tier.growth.feat1", locale),
            t("plans.tier.growth.feat2", locale),
            t("plans.tier.growth.feat3", locale),
            t("plans.tier.growth.feat4", locale),
            t("plans.tier.growth.feat5", locale),
            t("plans.tier.growth.feat6", locale),
          ]}
          cta={t("plans.tier.growth.cta", locale)}
          ctaHref={ctaHref}
          highlighted={true}
          badgeLabel={t("plans.mostPopular", locale)}
          locale={locale}
        />
        <TierCard
          name={t("plans.tier.pro.name", locale)}
          price="৳1,499"
          period={t("plans.perMonth", locale)}
          summary={t("plans.tier.pro.summary", locale)}
          features={[
            t("plans.tier.pro.feat1", locale),
            t("plans.tier.pro.feat2", locale),
            t("plans.tier.pro.feat3", locale),
            t("plans.tier.pro.feat4", locale),
            t("plans.tier.pro.feat5", locale),
            t("plans.tier.pro.feat6", locale),
          ]}
          cta={t("plans.tier.pro.cta", locale)}
          ctaHref={ctaHref}
          highlighted={false}
          locale={locale}
        />
      </section>

      {/* Unit economics — single honest line */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
        <div className="rounded-xl border border-slate-200 bg-white p-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-brand-50 border border-brand-200 grid place-items-center shrink-0">
            <Sparkles className="w-4 h-4 text-brand-700" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {t("plans.unitEconTitle", locale)}
            </div>
            <p className="mt-1 text-sm text-slate-600">{t("plans.unitEconBody", locale)}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500 text-center">{t("plans.demoNote", locale)}</p>
      </section>

      <footer className="px-4 sm:px-6 py-8 text-center text-xs text-slate-500">
        DokanAI · The Infinity AI BuildFest 2026 · Track 4 · E-commerce
      </footer>
    </main>
  );
}

function TierCard({
  name,
  price,
  period,
  summary,
  features,
  cta,
  ctaHref,
  highlighted,
  badgeLabel,
  locale,
}: {
  name: string;
  price: string;
  period: string;
  summary: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted: boolean;
  badgeLabel?: string;
  locale: Locale;
}) {
  return (
    <div
      className={
        "relative rounded-2xl p-6 flex flex-col " +
        (highlighted
          ? "border-2 border-brand-600 bg-white shadow-md lg:scale-[1.03] lg:-my-2"
          : "border border-slate-200 bg-white")
      }
    >
      {highlighted && badgeLabel && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full bg-brand-600 text-white shadow">
            <Star className="w-3 h-3" />
            {badgeLabel}
          </span>
        </div>
      )}

      <div className="text-sm font-medium text-slate-500">{name}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight text-slate-900">{price}</span>
        <span className="text-sm text-slate-500">/ {period}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600 min-h-[2.5rem]">{summary}</p>

      <ul className="mt-4 space-y-2 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <Check
              className={
                "w-4 h-4 mt-0.5 shrink-0 " + (highlighted ? "text-brand-600" : "text-emerald-500")
              }
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={
          "mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors " +
          (highlighted
            ? "bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
            : "bg-white border border-slate-300 text-slate-800 hover:bg-slate-50")
        }
      >
        {cta}
        <ArrowRight className="w-4 h-4" />
      </Link>
      <div className="mt-2 text-[11px] text-slate-400 text-center">
        {t("plans.noCheckout", locale)}
      </div>
    </div>
  );
}
