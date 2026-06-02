import { TrendingUp, TrendingDown, Minus, CalendarHeart, Sparkles } from "lucide-react";
import { getStore } from "@/lib/data/store";
import { upcomingFestivals, festivalBoost } from "@/lib/data/festivals";
import { t, type Locale } from "@/lib/i18n/messages";
import type { ProductCategory } from "@/lib/types";

/**
 * "Market pulse" panel for Overview.
 *
 * Combines two locally-computed signals so the shopkeeper sees what's
 * happening to demand without having to leave the dashboard:
 *
 *   1. Next 2-3 upcoming Bangladesh festivals (with peak-boost multiplier).
 *   2. Per-category demand pulse: last-30d revenue vs. prior-30d revenue,
 *      bucketed by product category.
 *
 * Why no external API: keeps the panel deterministic, fast, free, and
 * available offline. (The MCP-driven product-research tools are wired
 * into the Pilot agent — that's the place for live market data; this
 * panel is the at-a-glance view.)
 */

const CATEGORY_LABEL: Record<ProductCategory, { en: string; bn: string }> = {
  clothing: { en: "Clothing", bn: "পোশাক" },
  electronics: { en: "Electronics", bn: "ইলেকট্রনিক্স" },
  beauty: { en: "Beauty", bn: "বিউটি" },
  food: { en: "Food & Grocery", bn: "খাবার ও মুদি" },
  home: { en: "Home", bn: "হোম" },
};

function daysUntil(date: string): number {
  const d = new Date(date);
  const now = new Date();
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
}

interface CategoryPulse {
  category: ProductCategory;
  revenue30: number;
  revenuePrev30: number;
  changePct: number;
  expectedFestivalBoost: number;
}

function categoryPulse(): CategoryPulse[] {
  const store = getStore();
  const today = new Date();
  const ms = 86_400_000;
  const window30Start = new Date(today.getTime() - 30 * ms).toISOString().slice(0, 10);
  const window60Start = new Date(today.getTime() - 60 * ms).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const byCat: Map<ProductCategory, { r30: number; rPrev: number }> = new Map();
  for (const o of store.orders) {
    if (o.status === "rto" || o.status === "cancelled") continue;
    for (const it of o.items) {
      const p = store.productById(it.productId);
      if (!p) continue;
      const cur = byCat.get(p.category) ?? { r30: 0, rPrev: 0 };
      const rev = it.qty * it.unitPrice;
      if (o.date >= window30Start && o.date <= todayStr) cur.r30 += rev;
      else if (o.date >= window60Start && o.date < window30Start) cur.rPrev += rev;
      byCat.set(p.category, cur);
    }
  }

  // Expected festival boost over the next 14 days per category.
  const out: CategoryPulse[] = [];
  for (const [cat, v] of byCat.entries()) {
    let boostSum = 0;
    let n = 0;
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() + i * ms);
      boostSum += festivalBoost(d, cat).boost;
      n += 1;
    }
    const expectedBoost = n > 0 ? boostSum / n : 1;
    const changePct = v.rPrev > 0 ? ((v.r30 - v.rPrev) / v.rPrev) * 100 : v.r30 > 0 ? 100 : 0;
    out.push({
      category: cat,
      revenue30: v.r30,
      revenuePrev30: v.rPrev,
      changePct,
      expectedFestivalBoost: expectedBoost,
    });
  }

  // Sort by absolute change so the most-moving categories surface first.
  return out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 5);
}

export function MarketTrendsPanel({ locale }: { locale: Locale }) {
  const festivals = upcomingFestivals(new Date(), 60).slice(0, 3);
  const pulse = categoryPulse();

  if (festivals.length === 0 && pulse.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-medium">
        <Sparkles className="w-4 h-4 text-brand-600" />
        {t("overview.trends.title", locale)}
      </div>
      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        {/* Festivals column */}
        <div className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-slate-500 mb-3">
            <CalendarHeart className="w-3.5 h-3.5" />
            {t("overview.trends.upcomingFestivals", locale)}
          </div>
          <ul className="space-y-2">
            {festivals.map((f) => (
              <li key={f.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {locale === "bn" ? f.nameBn : f.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {f.date} · {daysUntil(f.date)} {t("overview.trends.daysAway", locale)}
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-700 border border-amber-200">
                  ×{f.peakBoost.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Category pulse column */}
        <div className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-slate-500 mb-3">
            <TrendingUp className="w-3.5 h-3.5" />
            {t("overview.trends.categoryHeat", locale)}
          </div>
          {pulse.length === 0 ? (
            <div className="text-xs text-slate-500">{t("overview.trends.notrend", locale)}</div>
          ) : (
            <ul className="space-y-2">
              {pulse.map((p) => {
                const dir =
                  p.changePct >= 5 ? "up" : p.changePct <= -5 ? "down" : "flat";
                const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
                const tone =
                  dir === "up"
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : dir === "down"
                    ? "text-rose-700 bg-rose-50 border-rose-200"
                    : "text-slate-600 bg-slate-50 border-slate-200";
                return (
                  <li key={p.category} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {locale === "bn" ? CATEGORY_LABEL[p.category].bn : CATEGORY_LABEL[p.category].en}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {t("overview.trends.vsLast", locale)}
                        {p.expectedFestivalBoost > 1.1
                          ? ` · ×${p.expectedFestivalBoost.toFixed(2)} ${t("overview.trends.boost", locale)}`
                          : ""}
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${tone}`}>
                      <Icon className="w-3 h-3" />
                      {p.changePct >= 0 ? "+" : ""}
                      {p.changePct.toFixed(0)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
