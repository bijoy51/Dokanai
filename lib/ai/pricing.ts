import { getStore } from "@/lib/data/store";
import { forecastProduct } from "./forecast";
import { elasticityFor, type Elasticity } from "./elasticity";
import type { Product } from "@/lib/types";

export type PricingAction = "raise" | "lower" | "hold";

export interface PriceRec {
  productId: string;
  name: string;
  nameBn: string;
  current: number;
  suggested: number;
  action: PricingAction;
  expectedLiftPct: number;
  reason: string;
  reasonBn: string;
  /** Elasticity slice for the row — surfaces the demand curve in the UI. */
  elasticity: Elasticity;
}

/** Suggest price changes from demand signals + stock health. */
export function priceRecommendations(): PriceRec[] {
  const store = getStore();
  const recs: PriceRec[] = [];
  for (const p of store.products) {
    const f = forecastProduct(p);
    const e = elasticityFor(p);
    let action: PricingAction = "hold";
    let multiplier = 1;
    let reason = "Demand is stable; no change recommended.";
    let reasonBn = "চাহিদা স্থিতিশীল; পরিবর্তনের প্রয়োজন নেই।";
    let lift = 0;

    // Stock + festival signals dominate when they're loud. Elasticity then
    // refines the magnitude of the move (a more-elastic SKU gets a softer
    // raise; an inelastic SKU gets a deeper one).
    if (f.festivalBoost > 1.3 && f.daysOfStock < 14) {
      action = "raise";
      // Inelastic festival items can absorb more, elastic ones less.
      const festBump = e.classification === "inelastic" ? 1.08 : e.classification === "elastic" ? 1.03 : 1.05;
      multiplier = festBump;
      lift = 8 + (f.festivalBoost - 1) * 6;
      reason = `Festival demand × elasticity ${e.elasticity.toFixed(2)} → raise ${Math.round((multiplier - 1) * 100)}%. Stock runs out in ${f.daysOfStock.toFixed(0)} days.`;
      reasonBn = `উৎসব চাহিদা × ইলাস্টিসিটি ${e.elasticity.toFixed(2)} → ${Math.round((multiplier - 1) * 100)}% বাড়ান। ${f.daysOfStock.toFixed(0)} দিনে স্টক শেষ।`;
    } else if (f.daysOfStock > 60 && p.stock > 10) {
      action = "lower";
      // Elastic SKUs respond strongly to discount; inelastic ones don't —
      // so we discount elastic items more aggressively for clearance.
      const cutDepth = e.classification === "elastic" ? 0.85 : e.classification === "inelastic" ? 0.95 : 0.9;
      multiplier = cutDepth;
      lift = 6 + Math.min(10, f.daysOfStock / 20);
      reason = `Slow mover, ${f.daysOfStock.toFixed(0)} days of stock; ${e.classification} demand (b=${e.elasticity.toFixed(2)}) → ${Math.round((1 - multiplier) * 100)}% cut.`;
      reasonBn = `ধীর গতির পণ্য, ${f.daysOfStock.toFixed(0)} দিনের স্টক; ${Math.round((1 - multiplier) * 100)}% ছাড়।`;
    } else if (f.festivalBoost > 1.1) {
      action = "raise";
      multiplier = e.classification === "inelastic" ? 1.05 : 1.03;
      lift = 4;
      reason = "Mild festival lift; elasticity supports a small price test.";
      reasonBn = "সামান্য উৎসব প্রভাব; দাম একটু বাড়ানোর সুযোগ।";
    } else if (!e.fromDefault && e.classification === "inelastic" && e.expectedRevenuePct >= 3) {
      // No festival/stock pressure — but the demand curve itself says
      // there's revenue on the table. Take it.
      action = "raise";
      multiplier = e.optimalPrice / p.price;
      lift = e.expectedRevenuePct;
      reason = `Inelastic demand (b=${e.elasticity.toFixed(2)}, R²=${e.rSquared}). Optimal price ≈ ${e.optimalPrice} → +${lift}% revenue.`;
      reasonBn = `কম-সংবেদনশীল চাহিদা (b=${e.elasticity.toFixed(2)})। আদর্শ দাম ≈ ${e.optimalPrice}।`;
    } else if (!e.fromDefault && e.classification === "elastic" && e.expectedRevenuePct >= 3) {
      action = "lower";
      multiplier = e.optimalPrice / p.price;
      lift = e.expectedRevenuePct;
      reason = `Elastic demand (b=${e.elasticity.toFixed(2)}, R²=${e.rSquared}). Cut to ${e.optimalPrice} → +${lift}% revenue.`;
      reasonBn = `সংবেদনশীল চাহিদা (b=${e.elasticity.toFixed(2)})। দাম কমিয়ে ${e.optimalPrice}।`;
    }

    const suggested = Math.round(p.price * multiplier);
    recs.push({
      productId: p.id,
      name: p.name,
      nameBn: p.nameBn,
      current: p.price,
      suggested,
      action,
      expectedLiftPct: Number(lift.toFixed(1)),
      reason,
      reasonBn,
      elasticity: e,
    });
  }
  // Sort: raise+festival first, then lower/discount, then hold
  recs.sort((a, b) => {
    const score = (r: PriceRec) =>
      (r.action === "raise" ? 2 : r.action === "lower" ? 1 : 0) * 100 + r.expectedLiftPct;
    return score(b) - score(a);
  });
  return recs;
}

// === Bundles via co-purchase frequency ===

export interface BundleRec {
  productIds: string[];
  names: string[];
  namesBn: string[];
  count: number;
  totalIfSeparate: number;
  bundlePrice: number;
  savingsPct: number;
}

export function bundleRecommendations(limit = 8): BundleRec[] {
  const store = getStore();
  // co-occurrence map
  const pairs = new Map<string, number>();
  for (const o of store.orders) {
    if (o.items.length < 2) continue;
    const ids = o.items.map((i) => i.productId).sort();
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const k = `${ids[a]}|${ids[b]}`;
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
      }
    }
  }

  const ranked = [...pairs.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  const out: BundleRec[] = [];
  for (const r of ranked) {
    const [a, b] = r.key.split("|");
    const pa = store.productById(a);
    const pb = store.productById(b);
    if (!pa || !pb) continue;
    const total = pa.price + pb.price;
    const bundlePrice = Math.round(total * 0.92); // 8% bundle discount
    out.push({
      productIds: [pa.id, pb.id],
      names: [pa.name, pb.name],
      namesBn: [pa.nameBn, pb.nameBn],
      count: r.count,
      totalIfSeparate: total,
      bundlePrice,
      savingsPct: Number((((total - bundlePrice) / total) * 100).toFixed(1)),
    });
  }
  return out;
}
